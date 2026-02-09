/**
 * Matchmaking Service
 * 
 * Skill-based matchmaking with party support,
 * region awareness, and expanding skill windows.
 */

import type { PlayerId, TeamId, GameEvent } from '@snapshot/shared';

// =============================================================================
// TYPES
// =============================================================================

export type GameMode = 'regular' | 'ranked' | 'private';
export type Region = 'na-west' | 'na-east' | 'eu-west' | 'asia';

export interface MatchmakingTicket {
    id: string;
    playerId: PlayerId;
    partyId?: string;
    partyMembers?: PlayerId[];
    mode: GameMode;
    region: Region;
    skill: number;
    queueTime: number;
    createdAt: number;
}

export interface MatchResult {
    matchId: string;
    mode: GameMode;
    region: Region;
    teams: {
        teamA: PlayerId[];
        teamB: PlayerId[];
    };
    averageSkill: number;
}

export interface QueueStats {
    totalInQueue: number;
    byMode: Record<GameMode, number>;
    byRegion: Record<Region, number>;
    averageWaitTime: number;
}

type MatchFoundCallback = (match: MatchResult, tickets: MatchmakingTicket[]) => void;

// =============================================================================
// CONSTANTS
// =============================================================================

const MATCHMAKING = {
    TEAM_SIZE: 4,
    BASE_SKILL_RANGE: 100,
    SKILL_EXPANSION_PER_10S: 50,
    MAX_SKILL_RANGE: 500,
    CROSS_REGION_WAIT: 30000, // 30 seconds
    TICK_INTERVAL: 1000, // Check every second
} as const;

// =============================================================================
// MATCHMAKING SERVICE
// =============================================================================

export class MatchmakingService {
    private tickets: Map<string, MatchmakingTicket> = new Map();
    private playerTickets: Map<PlayerId, string> = new Map();
    private onMatchFound: MatchFoundCallback | null = null;
    private tickInterval: NodeJS.Timeout | null = null;
    private nextMatchId = 1;
    private matchHistory: MatchResult[] = [];

    /**
     * Start the matchmaking service.
     */
    start(): void {
        if (this.tickInterval) return;

        this.tickInterval = setInterval(() => {
            this.tick();
        }, MATCHMAKING.TICK_INTERVAL);

        console.log('[Matchmaking] Service started');
    }

    /**
     * Stop the matchmaking service.
     */
    stop(): void {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
        console.log('[Matchmaking] Service stopped');
    }

    /**
     * Set callback for when match is found.
     */
    setMatchFoundCallback(callback: MatchFoundCallback): void {
        this.onMatchFound = callback;
    }

    /**
     * Add player to matchmaking queue.
     */
    joinQueue(
        playerId: PlayerId,
        mode: GameMode,
        region: Region,
        skill: number,
        partyId?: string,
        partyMembers?: PlayerId[]
    ): MatchmakingTicket {
        // Remove existing ticket if any
        this.leaveQueue(playerId);

        const ticket: MatchmakingTicket = {
            id: `ticket_${Date.now()}_${playerId}`,
            playerId,
            partyId,
            partyMembers,
            mode,
            region,
            skill,
            queueTime: 0,
            createdAt: Date.now(),
        };

        this.tickets.set(ticket.id, ticket);
        this.playerTickets.set(playerId, ticket.id);

        // Also track party members
        if (partyMembers) {
            for (const memberId of partyMembers) {
                this.playerTickets.set(memberId, ticket.id);
            }
        }

        console.log(`[Matchmaking] ${playerId} joined queue: ${mode} / ${region}`);
        return ticket;
    }

    /**
     * Remove player from matchmaking queue.
     */
    leaveQueue(playerId: PlayerId): void {
        const ticketId = this.playerTickets.get(playerId);
        if (!ticketId) return;

        const ticket = this.tickets.get(ticketId);
        if (ticket) {
            this.tickets.delete(ticketId);
            this.playerTickets.delete(playerId);

            // Remove party members
            if (ticket.partyMembers) {
                for (const memberId of ticket.partyMembers) {
                    this.playerTickets.delete(memberId);
                }
            }
        }

        console.log(`[Matchmaking] ${playerId} left queue`);
    }

    /**
     * Check if player is in queue.
     */
    isInQueue(playerId: PlayerId): boolean {
        return this.playerTickets.has(playerId);
    }

    /**
     * Get player's ticket.
     */
    getTicket(playerId: PlayerId): MatchmakingTicket | undefined {
        const ticketId = this.playerTickets.get(playerId);
        return ticketId ? this.tickets.get(ticketId) : undefined;
    }

    /**
     * Get queue statistics.
     */
    getStats(): QueueStats {
        const stats: QueueStats = {
            totalInQueue: 0,
            byMode: { regular: 0, ranked: 0, private: 0 },
            byRegion: { 'na-west': 0, 'na-east': 0, 'eu-west': 0, 'asia': 0 },
            averageWaitTime: 0,
        };

        let totalWait = 0;
        for (const ticket of this.tickets.values()) {
            const playerCount = ticket.partyMembers?.length ?? 1;
            stats.totalInQueue += playerCount;
            stats.byMode[ticket.mode] += playerCount;
            stats.byRegion[ticket.region] += playerCount;
            totalWait += ticket.queueTime;
        }

        stats.averageWaitTime = this.tickets.size > 0 ? totalWait / this.tickets.size : 0;
        return stats;
    }

    /**
     * Matchmaking tick - try to form matches.
     */
    private tick(): void {
        const now = Date.now();

        // Update queue times
        for (const ticket of this.tickets.values()) {
            ticket.queueTime = now - ticket.createdAt;
        }

        // Try to form matches for each mode
        for (const mode of ['regular', 'ranked'] as GameMode[]) {
            this.tryFormMatch(mode);
        }
    }

    /**
     * Try to form a match for a game mode.
     */
    private tryFormMatch(mode: GameMode): void {
        // Get tickets for this mode
        const modeTickets = Array.from(this.tickets.values())
            .filter(t => t.mode === mode)
            .sort((a, b) => a.createdAt - b.createdAt); // Oldest first

        if (modeTickets.length === 0) return;

        // Try to match from oldest ticket
        for (const anchor of modeTickets) {
            const match = this.findMatch(anchor, modeTickets);
            if (match) {
                this.createMatch(match);
                return; // One match per tick
            }
        }
    }

    /**
     * Find compatible tickets for a match.
     */
    private findMatch(
        anchor: MatchmakingTicket,
        pool: MatchmakingTicket[]
    ): MatchmakingTicket[] | null {
        const skillRange = this.getSkillRange(anchor);
        const playersNeeded = MATCHMAKING.TEAM_SIZE * 2;

        const compatible: MatchmakingTicket[] = [];
        let playerCount = 0;

        for (const ticket of pool) {
            // Skip self
            if (ticket.id === anchor.id) {
                compatible.push(ticket);
                playerCount += ticket.partyMembers?.length ?? 1;
                continue;
            }

            // Check skill range
            if (ticket.skill < skillRange[0] || ticket.skill > skillRange[1]) {
                continue;
            }

            // Check region (allow cross-region after wait)
            if (!this.regionMatch(anchor.region, ticket.region, anchor.queueTime)) {
                continue;
            }

            compatible.push(ticket);
            playerCount += ticket.partyMembers?.length ?? 1;

            if (playerCount >= playersNeeded) {
                return compatible;
            }
        }

        return null; // Not enough players
    }

    /**
     * Get skill range that expands over time.
     */
    private getSkillRange(ticket: MatchmakingTicket): [number, number] {
        const expansion = Math.floor(ticket.queueTime / 10000) * MATCHMAKING.SKILL_EXPANSION_PER_10S;
        const range = Math.min(MATCHMAKING.BASE_SKILL_RANGE + expansion, MATCHMAKING.MAX_SKILL_RANGE);
        return [ticket.skill - range, ticket.skill + range];
    }

    /**
     * Check if regions are compatible.
     */
    private regionMatch(a: Region, b: Region, waitTime: number): boolean {
        if (a === b) return true;
        return waitTime > MATCHMAKING.CROSS_REGION_WAIT;
    }

    /**
     * Create a match from tickets.
     */
    private createMatch(tickets: MatchmakingTicket[]): void {
        // Collect all players
        const players: PlayerId[] = [];
        for (const ticket of tickets) {
            if (ticket.partyMembers) {
                players.push(...ticket.partyMembers);
            } else {
                players.push(ticket.playerId);
            }
        }

        // Balance teams by skill
        const sorted = [...players];
        const teamA: PlayerId[] = [];
        const teamB: PlayerId[] = [];

        for (let i = 0; i < Math.min(sorted.length, MATCHMAKING.TEAM_SIZE * 2); i++) {
            if (i % 2 === 0) {
                teamA.push(sorted[i]!);
            } else {
                teamB.push(sorted[i]!);
            }
        }

        const match: MatchResult = {
            matchId: `match_${this.nextMatchId++}`,
            mode: tickets[0]!.mode,
            region: tickets[0]!.region,
            teams: { teamA, teamB },
            averageSkill: tickets.reduce((sum, t) => sum + t.skill, 0) / tickets.length,
        };

        // Remove matched tickets
        for (const ticket of tickets) {
            this.tickets.delete(ticket.id);
            this.playerTickets.delete(ticket.playerId);
            if (ticket.partyMembers) {
                for (const memberId of ticket.partyMembers) {
                    this.playerTickets.delete(memberId);
                }
            }
        }

        // Store history
        this.matchHistory.push(match);
        if (this.matchHistory.length > 100) {
            this.matchHistory.shift();
        }

        console.log(`[Matchmaking] Match created: ${match.matchId}`);

        // Notify callback
        if (this.onMatchFound) {
            this.onMatchFound(match, tickets);
        }
    }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createMatchmakingService(): MatchmakingService {
    return new MatchmakingService();
}
