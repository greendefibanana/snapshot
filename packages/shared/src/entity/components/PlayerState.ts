/**
 * PlayerState - Player-specific component data
 * 
 * Contains all state specific to player entities:
 * - Identity (player ID, team)
 * - Status (alive, spawn state)
 * - Input acknowledgment
 */

import type { Tick } from '../../simulation/Tick.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Player state component.
 * 64 bytes when serialized.
 */
export interface PlayerState {
    /** Unique player ID (matches connection ID) */
    playerId: number;

    /** Team ID (1 or 2 for 4v4) */
    teamId: number;

    /** Character/species ID */
    characterId: number;

    /** Is player alive */
    alive: boolean;

    /** Spawn protection remaining (ticks) */
    spawnProtection: number;

    /** Last input tick processed by server */
    lastInputTick: number; // Tick

    /** Last input sequence processed */
    lastInputSeq: number;

    /** Kill count this match */
    kills: number;

    /** Death count this match */
    deaths: number;

    /** Assist count this match */
    assists: number;

    /** Score contribution */
    score: number;

    /** Respawn tick (0 = not respawning) */
    respawnTick: number; // Tick

    /** Player name (for display) */
    playerName: string;
}

/**
 * Create default player state.
 */
export function createPlayerState(playerId: number): PlayerState {
    return {
        playerId,
        teamId: 0,
        characterId: 0,
        alive: true,
        spawnProtection: 0,
        lastInputTick: 0,
        lastInputSeq: -1,
        kills: 0,
        deaths: 0,
        assists: 0,
        score: 0,
        respawnTick: 0,
        playerName: '',
    };
}

/**
 * Clone player state.
 */
export function clonePlayerState(p: PlayerState): PlayerState {
    return { ...p };
}

// =============================================================================
// PLAYER POOL
// =============================================================================

/**
 * Maximum players per match.
 */
export const MAX_PLAYERS = 16;

/**
 * Fixed-size player name length.
 */
export const PLAYER_NAME_LENGTH = 32;

/**
 * Player pool - array-of-structs for players (small fixed count).
 * Using AoS instead of SOA since player count is small and access patterns vary.
 */
export class PlayerPool {
    private players: (PlayerState | null)[];
    private activeCount: number = 0;

    readonly capacity: number;

    constructor(capacity: number = MAX_PLAYERS) {
        this.capacity = capacity;
        this.players = new Array(capacity).fill(null);
    }

    /**
     * Get player at slot.
     */
    get(slot: number): PlayerState | null {
        return this.players[slot] ?? null;
    }

    /**
     * Set player at slot.
     */
    set(slot: number, player: PlayerState): void {
        if (this.players[slot] === null) {
            this.activeCount++;
        }
        this.players[slot] = player;
    }

    /**
     * Remove player at slot.
     */
    remove(slot: number): void {
        if (this.players[slot] !== null) {
            this.activeCount--;
        }
        this.players[slot] = null;
    }

    /**
     * Find slot by player ID.
     */
    findByPlayerId(playerId: number): number {
        for (let i = 0; i < this.capacity; i++) {
            if (this.players[i]?.playerId === playerId) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Allocate a free slot.
     */
    allocate(): number {
        for (let i = 0; i < this.capacity; i++) {
            if (this.players[i] === null) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Get all active players.
     */
    getActive(): PlayerState[] {
        return this.players.filter((p): p is PlayerState => p !== null);
    }

    /**
     * Get players by team.
     */
    getByTeam(teamId: number): PlayerState[] {
        return this.players.filter(
            (p): p is PlayerState => p !== null && p.teamId === teamId
        );
    }

    /**
     * Get alive players.
     */
    getAlive(): PlayerState[] {
        return this.players.filter(
            (p): p is PlayerState => p !== null && p.alive
        );
    }

    /**
     * Reset all players.
     */
    reset(): void {
        this.players.fill(null);
        this.activeCount = 0;
    }

    /**
     * Get active player count.
     */
    get count(): number {
        return this.activeCount;
    }

    /**
     * Iterate over all active players with their slot index.
     */
    *entries(): Generator<[number, PlayerState]> {
        for (let i = 0; i < this.capacity; i++) {
            const player = this.players[i];
            if (player !== null) {
                yield [i, player];
            }
        }
    }
}

// =============================================================================
// SERIALIZATION
// =============================================================================

/**
 * Byte size of serialized player state.
 */
export const PLAYER_STATE_SIZE = 64;

/**
 * Serialize player state to a DataView.
 */
export function writePlayerState(view: DataView, offset: number, p: PlayerState): number {
    view.setUint32(offset, p.playerId, true);
    view.setUint8(offset + 4, p.teamId);
    view.setUint8(offset + 5, p.characterId);
    view.setUint8(offset + 6, p.alive ? 1 : 0);
    view.setUint8(offset + 7, 0); // padding
    view.setUint16(offset + 8, p.spawnProtection, true);
    view.setUint16(offset + 10, 0, true); // padding
    view.setUint32(offset + 12, p.lastInputTick, true);
    view.setUint32(offset + 16, p.lastInputSeq, true);
    view.setUint16(offset + 20, p.kills, true);
    view.setUint16(offset + 22, p.deaths, true);
    view.setUint16(offset + 24, p.assists, true);
    view.setUint16(offset + 26, 0, true); // padding
    view.setUint32(offset + 28, p.score, true);
    view.setUint32(offset + 32, p.respawnTick, true);

    // Write player name (fixed 28 bytes, leaves 4 bytes padding)
    const nameBytes = new TextEncoder().encode(p.playerName.slice(0, 28));
    for (let i = 0; i < 28; i++) {
        view.setUint8(offset + 36 + i, nameBytes[i] ?? 0);
    }

    return PLAYER_STATE_SIZE;
}

/**
 * Deserialize player state from a DataView.
 */
export function readPlayerState(view: DataView, offset: number): PlayerState {
    const playerId = view.getUint32(offset, true);
    const teamId = view.getUint8(offset + 4);
    const characterId = view.getUint8(offset + 5);
    const alive = view.getUint8(offset + 6) === 1;
    const spawnProtection = view.getUint16(offset + 8, true);
    const lastInputTick = view.getUint32(offset + 12, true);
    const lastInputSeq = view.getUint32(offset + 16, true);
    const kills = view.getUint16(offset + 20, true);
    const deaths = view.getUint16(offset + 22, true);
    const assists = view.getUint16(offset + 24, true);
    const score = view.getUint32(offset + 28, true);
    const respawnTick = view.getUint32(offset + 32, true);

    // Read player name
    const nameBytes = new Uint8Array(view.buffer, view.byteOffset + offset + 36, 28);
    const playerName = new TextDecoder().decode(nameBytes).replace(/\0/g, '');

    return {
        playerId,
        teamId,
        characterId,
        alive,
        spawnProtection,
        lastInputTick,
        lastInputSeq,
        kills,
        deaths,
        assists,
        score,
        respawnTick,
        playerName,
    };
}
