
import { type PlayerId, type LobbyState, type GameMode, type Ruleset } from '@snapshot/shared';

export interface MatchmakingRequest {
    playerId: PlayerId;
    mode: GameMode;
    ruleset: Ruleset;
    walletKey?: string;
    wagerAmountSol?: number;
}

export interface Match {
    id: string;
    players: PlayerId[];
    mode: GameMode;
    ruleset: Ruleset;
    wagerAmountSol?: number;
    walletKeys: Record<PlayerId, string | undefined>;
    startTime: number;
}

export class SimpleMatchmaker {
    private queue: MatchmakingRequest[] = [];
    private matches: Map<string, Match> = new Map();
    private playerNames: Map<PlayerId, string> = new Map();

    constructor() { }

    /**
     * Add player to queue.
     */
    enqueue(request: MatchmakingRequest): void {
        // Remove if already in queue
        this.removeFromQueue(request.playerId);

        this.queue.push(request);
        console.log(`Matchmaker: Player ${request.playerId} joined queue. Queue size: ${this.queue.length}`);

        this.checkQueue();
    }

    /**
     * Remove player from queue.
     */
    removeFromQueue(playerId: PlayerId): void {
        this.queue = this.queue.filter(req => req.playerId !== playerId);
    }

    setPlayerName(playerId: PlayerId, displayName?: string | null): void {
        if (!displayName) return;
        this.playerNames.set(playerId, displayName);
    }

    /**
     * Handle player disconnect (remove from queue or match).
     * Returns the match if it was disbanded (so server can notify opponent).
     */
    handlePlayerDisconnect(playerId: PlayerId): Match | undefined {
        // Remove from queue
        this.removeFromQueue(playerId);

        // Check if in active match
        const match = this.getMatchForPlayer(playerId);
        if (match) {
            console.log(`Matchmaker: Player ${playerId} disconnected from match ${match.id}`);
            this.matches.delete(match.id);
            return match;
        }

        return undefined;
    }

    /**
     * Check if matches can be made.
     */
    private checkQueue(): void {
        if (this.queue.length < 2) return;

        // Group by mode + ruleset + wager amount
        const groups = new Map<string, MatchmakingRequest[]>();
        for (const req of this.queue) {
            const key = `${req.mode}:${req.ruleset}:${req.wagerAmountSol ?? 0}`;
            const group = groups.get(key);
            if (group) {
                group.push(req);
            } else {
                groups.set(key, [req]);
            }
        }

        for (const group of groups.values()) {
            if (group.length >= 2) {
                const p1 = group[0]!;
                const p2 = group[1]!;
                this.queue = this.queue.filter(req => req !== p1 && req !== p2);
                this.createMatch([p1, p2]);
                break;
            }
        }
    }

    /**
     * Create a match.
     */
    private createMatch(players: MatchmakingRequest[]): void {
        const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const match: Match = {
            id: matchId,
            players: players.map(p => p.playerId),
            mode: players[0].mode,
            ruleset: players[0].ruleset,
            wagerAmountSol: players[0].wagerAmountSol,
            walletKeys: Object.fromEntries(players.map(p => [p.playerId, p.walletKey])),
            startTime: Date.now(),
        };

        this.matches.set(matchId, match);
        console.log(`Matchmaker: Match created ${matchId} for players ${match.players.join(', ')}`);

        // Notify players (callback or event would be better, but for now returned/accessor)
        // In a real system, we'd emit an event here.
    }

    /**
     * Get match by player ID.
     */
    getMatchForPlayer(playerId: PlayerId): Match | undefined {
        for (const match of this.matches.values()) {
            if (match.players.includes(playerId)) {
                return match;
            }
        }
        return undefined;
    }

    getMatchById(matchId: string): Match | undefined {
        return this.matches.get(matchId);
    }

    removeMatch(matchId: string): void {
        this.matches.delete(matchId);
    }

    /**
     * Get lobby state for a player.
     */
    getLobbyState(playerId: PlayerId): LobbyState {
        const match = this.getMatchForPlayer(playerId);

        if (match) {
            return {
                lobbyId: match.id,
                phase: 'starting', // or 'countdown'
                mode: match.mode,
                players: match.players.map((p, i) => ({
                    playerId: p,
                    displayName: this.playerNames.get(p) ?? `Player ${p.slice(0, 4)}`, // Shorten for display
                    team: i === 0 ? 1 : 2, // Team 1 vs 2
                    slot: i,
                    isReady: true,
                    isHost: i === 0,
                })),
                maxPlayers: 2,
                minPlayers: 2,
                countdownSec: 3,
                ruleset: match.ruleset,
                access: 'public',
                localPlayerId: playerId,
                queue: undefined,
            } as any as LobbyState; // Use partial casting if needed but try to be accurate
        }

        const inQueue = this.queue.find(req => req.playerId === playerId);
        if (inQueue) {
            return {
                lobbyId: 'queue',
                phase: 'queueing',
                mode: inQueue.mode,
                players: [],
                localPlayerId: playerId,
                ruleset: inQueue.ruleset,
                access: 'public',
                maxPlayers: 2,
                minPlayers: 2,
                countdownSec: 0,
                queue: {
                    waitTimeSec: 0,
                    mode: inQueue.mode,
                    ruleset: inQueue.ruleset,
                    playersInQueue: this.queue.length,
                    wagerAmountSol: inQueue.wagerAmountSol,
                    totalPotSol: inQueue.wagerAmountSol ? inQueue.wagerAmountSol * 2 : undefined
                }
            } as any as LobbyState;
        }

        return {
            lobbyId: 'main_menu',
            phase: 'idle',
            mode: '1v1', // Default
            players: [],
            localPlayerId: playerId,
            ruleset: 'casual',
            access: 'public',
            maxPlayers: 2,
            minPlayers: 2,
            countdownSec: 0,
        } as LobbyState;
    }
}
