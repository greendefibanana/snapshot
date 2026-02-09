/**
 * Queue-Based Matchmaking
 * 
 * Simple FIFO queue that fills teams in order.
 * 
 * SCOPE: Matching logic only. No networking.
 */

import type { TeamSize, MatchMode } from '../lobby/MatchRules.js';
import {
    type PlayerId,
    type MatchRequest,
    type MatchResult,
    type MatchmakingStats,
    type MatchmakingStrategy,
    createMatchResult,
    createFailedResult,
} from './MatchmakingStrategy.js';

// =============================================================================
// TYPES
// =============================================================================

/** Queue-specific match request */
export interface QueueMatchRequest extends MatchRequest {
    /** Timeout after which player is removed (ms) */
    readonly timeoutMs?: number;
}

/** Queue entry with internal tracking */
interface QueueEntry {
    request: QueueMatchRequest;
    addedAt: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default timeout (5 minutes) */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** Team size mapping */
const TEAM_SIZE_MAP: Record<TeamSize, number> = {
    '1v1': 1,
    '4v4': 4,
};

// =============================================================================
// QUEUE MATCHMAKER
// =============================================================================

/**
 * FIFO queue-based matchmaking.
 * Players are matched in order they joined.
 */
export class QueueMatchmaker implements MatchmakingStrategy {
    readonly name = 'queue';
    readonly teamSize: TeamSize;
    readonly mode: MatchMode;

    private queue: QueueEntry[] = [];
    private matchesFormed = 0;
    private failures = 0;
    private totalWaitMs = 0;
    private matchedCount = 0;

    constructor(teamSize: TeamSize, mode: MatchMode) {
        this.teamSize = teamSize;
        this.mode = mode;
    }

    // =========================================================================
    // STRATEGY INTERFACE
    // =========================================================================

    enqueue(request: MatchRequest): void {
        // Validate team size matches
        if (request.teamSize !== this.teamSize) {
            throw new Error(`Queue is for ${this.teamSize}, got ${request.teamSize}`);
        }

        // Check for party size
        const partySize = 1 + (request.partyMembers?.length ?? 0);
        const maxTeamSize = TEAM_SIZE_MAP[this.teamSize];
        if (partySize > maxTeamSize) {
            throw new Error(`Party size ${partySize} exceeds team size ${maxTeamSize}`);
        }

        // Check if already queued
        if (this.isQueued(request.playerId)) {
            return; // Already in queue
        }

        this.queue.push({
            request: request as QueueMatchRequest,
            addedAt: Date.now(),
        });
    }

    dequeue(playerId: PlayerId): boolean {
        const index = this.queue.findIndex(e =>
            e.request.playerId === playerId ||
            e.request.partyMembers?.includes(playerId)
        );

        if (index !== -1) {
            this.queue.splice(index, 1);
            return true;
        }
        return false;
    }

    isQueued(playerId: PlayerId): boolean {
        return this.queue.some(e =>
            e.request.playerId === playerId ||
            e.request.partyMembers?.includes(playerId)
        );
    }

    tryMatch(): MatchResult | null {
        // Remove expired entries first
        this.pruneExpired();

        const playersPerTeam = TEAM_SIZE_MAP[this.teamSize];
        const totalNeeded = playersPerTeam * 2;

        // Count available players (including party members)
        const availablePlayers = this.countAvailablePlayers();

        if (availablePlayers < totalNeeded) {
            return null; // Not enough players
        }

        // Try to form teams
        const team1: PlayerId[] = [];
        const team2: PlayerId[] = [];
        const usedEntries: QueueEntry[] = [];
        const now = Date.now();

        // Fill team 1
        for (const entry of this.queue) {
            if (team1.length >= playersPerTeam) break;

            const players = this.getPlayersFromEntry(entry);
            if (team1.length + players.length <= playersPerTeam) {
                team1.push(...players);
                usedEntries.push(entry);
            }
        }

        // Fill team 2 from remaining
        for (const entry of this.queue) {
            if (team2.length >= playersPerTeam) break;
            if (usedEntries.includes(entry)) continue;

            const players = this.getPlayersFromEntry(entry);
            if (team2.length + players.length <= playersPerTeam) {
                team2.push(...players);
                usedEntries.push(entry);
            }
        }

        // Check if we have full teams
        if (team1.length === playersPerTeam && team2.length === playersPerTeam) {
            // Remove used entries from queue
            for (const entry of usedEntries) {
                const idx = this.queue.indexOf(entry);
                if (idx !== -1) {
                    // Track wait time
                    this.totalWaitMs += now - entry.addedAt;
                    this.matchedCount++;
                    this.queue.splice(idx, 1);
                }
            }

            this.matchesFormed++;
            return createMatchResult(team1, team2, {
                strategy: this.name,
                teamSize: this.teamSize,
                mode: this.mode,
            });
        }

        // Could not form complete teams
        this.failures++;
        return createFailedResult('INSUFFICIENT_PLAYERS', team1, team2);
    }

    getStats(): MatchmakingStats {
        return {
            queueSize: this.queue.length,
            averageWaitMs: this.matchedCount > 0
                ? this.totalWaitMs / this.matchedCount
                : 0,
            matchesFormedTotal: this.matchesFormed,
            failuresTotal: this.failures,
        };
    }

    clear(): void {
        this.queue = [];
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    private pruneExpired(): void {
        const now = Date.now();
        this.queue = this.queue.filter(entry => {
            const timeout = entry.request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
            return now - entry.addedAt < timeout;
        });
    }

    private countAvailablePlayers(): number {
        let count = 0;
        for (const entry of this.queue) {
            count += 1 + (entry.request.partyMembers?.length ?? 0);
        }
        return count;
    }

    private getPlayersFromEntry(entry: QueueEntry): PlayerId[] {
        const players = [entry.request.playerId];
        if (entry.request.partyMembers) {
            players.push(...entry.request.partyMembers);
        }
        return players;
    }

    /** Get current queue size (entries, not players) */
    getQueueSize(): number {
        return this.queue.length;
    }

    /** Get player count in queue */
    getPlayerCount(): number {
        return this.countAvailablePlayers();
    }
}
