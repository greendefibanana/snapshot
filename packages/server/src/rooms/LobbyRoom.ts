/**
 * Pre-Match Room - Colyseus room for pre-match lobby
 * 
 * Handles: player join/leave, ready states, team selection, match start.
 * 
 * SCOPE: State machine only. No matchmaking, no tokens, no UI.
 */

import { Room, Client } from 'colyseus';
import {
    PreMatchRoomState,
    PreMatchPlayer,
    DEFAULT_PREMATCH_CONFIG,
    type PreMatchPhase,
    type PreMatchTeam,
} from '@snapshot/shared/lobby/LobbySchema.js';

// =============================================================================
// PRE-MATCH ROOM
// =============================================================================

export class PreMatchRoom extends Room<PreMatchRoomState> {
    private countdownInterval: NodeJS.Timeout | null = null;

    // =========================================================================
    // LIFECYCLE
    // =========================================================================

    onCreate(options: { maxPlayers?: number; minPlayers?: number }): void {
        this.setState(new PreMatchRoomState());

        // Apply config
        this.state.maxPlayers = options.maxPlayers ?? DEFAULT_PREMATCH_CONFIG.maxPlayers;
        this.state.minPlayers = options.minPlayers ?? DEFAULT_PREMATCH_CONFIG.minPlayers;
        this.maxClients = this.state.maxPlayers;

        // Register message handlers
        this.onMessage('toggleReady', (client) => this.handleToggleReady(client));
        this.onMessage('selectTeam', (client, data: { team: 1 | 2 }) => {
            this.handleSelectTeam(client, data.team);
        });

        console.log(`[PreMatchRoom] Created with max=${this.state.maxPlayers}, min=${this.state.minPlayers}`);
    }

    onJoin(client: Client, options: { displayName?: string }): void {
        const player = new PreMatchPlayer();
        player.sessionId = client.sessionId;
        player.displayName = options.displayName ?? `Player${this.state.players.size + 1}`;
        player.slot = this.findNextSlot();
        player.team = this.autoAssignTeam();
        player.isReady = false;

        this.state.players.set(client.sessionId, player);

        console.log(`[PreMatchRoom] Player joined: ${player.displayName} (slot=${player.slot}, team=${player.team})`);
    }

    onLeave(client: Client, _consented: boolean): void {
        const player = this.state.players.get(client.sessionId);
        if (player) {
            console.log(`[PreMatchRoom] Player left: ${player.displayName}`);
            this.state.players.delete(client.sessionId);
        }

        // Cancel countdown if in progress
        if (this.state.phase === 'countdown') {
            this.cancelCountdown();
        }

        // Re-check ready state
        this.checkReadyState();
    }

    onDispose(): void {
        this.cancelCountdown();
        console.log('[PreMatchRoom] Disposed');
    }

    // =========================================================================
    // MESSAGE HANDLERS
    // =========================================================================

    private handleToggleReady(client: Client): void {
        if (this.state.phase !== 'waiting') return;

        const player = this.state.players.get(client.sessionId);
        if (!player) return;

        player.isReady = !player.isReady;
        console.log(`[PreMatchRoom] ${player.displayName} ready=${player.isReady}`);

        this.checkReadyState();
    }

    private handleSelectTeam(client: Client, team: 1 | 2): void {
        if (this.state.phase !== 'waiting') return;

        const player = this.state.players.get(client.sessionId);
        if (!player) return;

        // Check team capacity (4 per team max)
        const teamCount = this.countPlayersOnTeam(team);
        if (teamCount >= this.state.maxPlayers / 2) {
            client.send('error', { message: 'Team is full' });
            return;
        }

        player.team = team;
        player.isReady = false; // Unready when changing team
        console.log(`[PreMatchRoom] ${player.displayName} -> team ${team}`);

        this.checkReadyState();
    }

    // =========================================================================
    // STATE MACHINE
    // =========================================================================

    private setPhase(phase: PreMatchPhase): void {
        this.state.phase = phase;
        console.log(`[PreMatchRoom] Phase -> ${phase}`);
    }

    private checkReadyState(): void {
        if (this.state.phase !== 'waiting') return;

        const playerCount = this.state.players.size;
        const allReady = this.areAllPlayersReady();
        const hasMinPlayers = playerCount >= this.state.minPlayers;
        const teamsBalanced = this.areTeamsBalanced();

        if (allReady && hasMinPlayers && teamsBalanced) {
            this.startCountdown();
        }
    }

    private startCountdown(): void {
        this.setPhase('countdown');
        this.state.countdownSeconds = DEFAULT_PREMATCH_CONFIG.countdownDuration;

        this.countdownInterval = setInterval(() => {
            this.state.countdownSeconds--;

            if (this.state.countdownSeconds <= 0) {
                this.cancelCountdown();
                this.startMatch();
            }
        }, 1000);
    }

    private cancelCountdown(): void {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }

        if (this.state.phase === 'countdown') {
            this.setPhase('waiting');
            this.state.countdownSeconds = 0;
        }
    }

    private startMatch(): void {
        this.setPhase('starting');

        // TODO: Create game room and transfer players
        // TODO: Broadcast gameRoomId to clients
        const gameRoomId = 'TODO_GAME_ROOM_ID';

        this.broadcast('matchStart', { gameRoomId });

        console.log('[PreMatchRoom] Match starting! Handoff to game room.');

        // TODO: Lock room, transfer players, then dispose
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    private areAllPlayersReady(): boolean {
        for (const player of this.state.players.values()) {
            if (!player.isReady) return false;
        }
        return this.state.players.size > 0;
    }

    private areTeamsBalanced(): boolean {
        const team1 = this.countPlayersOnTeam(1);
        const team2 = this.countPlayersOnTeam(2);
        // Allow 1 player difference
        return Math.abs(team1 - team2) <= 1 && team1 > 0 && team2 > 0;
    }

    private countPlayersOnTeam(team: PreMatchTeam): number {
        let count = 0;
        for (const player of this.state.players.values()) {
            if (player.team === team) count++;
        }
        return count;
    }

    private findNextSlot(): number {
        const usedSlots = new Set<number>();
        for (const player of this.state.players.values()) {
            usedSlots.add(player.slot);
        }
        for (let i = 0; i < this.state.maxPlayers; i++) {
            if (!usedSlots.has(i)) return i;
        }
        return 0;
    }

    private autoAssignTeam(): PreMatchTeam {
        const team1 = this.countPlayersOnTeam(1);
        const team2 = this.countPlayersOnTeam(2);
        return team1 <= team2 ? 1 : 2;
    }

    // =========================================================================
    // PUBLIC API (for other systems)
    // =========================================================================

    /** Get current phase */
    getPhase(): PreMatchPhase {
        return this.state.phase;
    }

    /** Get player count */
    getPlayerCount(): number {
        return this.state.players.size;
    }

    /** Check if room is full */
    isFull(): boolean {
        return this.state.players.size >= this.state.maxPlayers;
    }

    /** Force start match (admin/debug) */
    forceStart(): void {
        if (this.state.phase === 'waiting' && this.state.players.size > 0) {
            this.startMatch();
        }
    }
}
