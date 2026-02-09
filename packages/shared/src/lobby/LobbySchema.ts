/**
 * Pre-Match Room Schema - Colyseus state definitions
 * 
 * Synced state for pre-match room: players, teams, ready states.
 * 
 * SCOPE: State only. No game logic.
 * NOTE: Named "PreMatchRoom" to avoid conflict with Protocol.ts LobbyState.
 */

import { Schema, MapSchema, type } from '@colyseus/schema';

// =============================================================================
// TYPES
// =============================================================================

/** Room phase states */
export type PreMatchPhase = 'waiting' | 'countdown' | 'starting';

/** Team assignment (0 = unassigned, 1 = team1, 2 = team2) */
export type PreMatchTeam = 0 | 1 | 2;

/** Pre-match room configuration */
export interface PreMatchConfig {
    readonly maxPlayers: number;
    readonly minPlayers: number;
    readonly countdownDuration: number;
}

/** Default config */
export const DEFAULT_PREMATCH_CONFIG: PreMatchConfig = {
    maxPlayers: 8,        // 4v4
    minPlayers: 2,        // For testing (TODO: set to 8 for production)
    countdownDuration: 3, // seconds
};

// =============================================================================
// SCHEMAS
// =============================================================================

/**
 * Player state within pre-match room.
 * Synced to all clients.
 */
export class PreMatchPlayer extends Schema {
    @type('string')
    sessionId: string = '';

    @type('string')
    displayName: string = '';

    @type('uint8')
    team: PreMatchTeam = 0;

    @type('boolean')
    isReady: boolean = false;

    @type('uint8')
    slot: number = 0; // 0-7 for 4v4
}

/**
 * Pre-match room state.
 * Synced to all clients.
 */
export class PreMatchRoomState extends Schema {
    @type('string')
    phase: PreMatchPhase = 'waiting';

    @type({ map: PreMatchPlayer })
    players = new MapSchema<PreMatchPlayer>();

    @type('uint8')
    countdownSeconds: number = 0;

    @type('uint8')
    maxPlayers: number = DEFAULT_PREMATCH_CONFIG.maxPlayers;

    @type('uint8')
    minPlayers: number = DEFAULT_PREMATCH_CONFIG.minPlayers;
}

// =============================================================================
// MESSAGE TYPES (for type-safe messaging)
// =============================================================================

/** Messages FROM client TO server */
export type PreMatchClientMessage =
    | { type: 'toggleReady' }
    | { type: 'selectTeam'; team: 1 | 2 };

/** Messages FROM server TO client */
export type PreMatchServerMessage =
    | { type: 'matchStart'; gameRoomId: string }
    | { type: 'error'; message: string };
