/**
 * Networking Protocol Definitions
 * 
 * Message types for client-server communication.
 * Used by Socket.io (gameplay) and Colyseus (meta).
 */

import type {
    EntityId,
    PlayerId,
    TeamId,
    Tick,
    Vector3,
    InputFrame,
    GameEvent,
} from '../types/index.js';
import type { Loadout } from '../types/characters.js';
import type { WorldSnapshot } from '../ecs/World.js';

// =============================================================================
// SOCKET.IO PROTOCOL - Real-time gameplay
// =============================================================================

/**
 * Messages sent from client to server via Socket.io
 */
export type ClientMessage =
    | ClientInputMessage
    | ClientShootMessage
    | ClientMapLoadedMessage
    | ClientSelectCharacterMessage
    | ClientAbilityMessage
    | ClientWeaponSwitchMessage
    | ClientInteractMessage
    | ClientPingMessage;

export interface ClientInputMessage {
    type: 'input';
    /** Client's local tick when input was generated */
    tick: Tick;
    /** The input state */
    input: InputFrame;
    /** Sequence number for ordering */
    seq: number;
}

export interface ClientShootMessage {
    type: 'shoot';
    shotId: string;
    origin: Vector3;
    dir: Vector3;
    time: number;
    weaponId?: string;
}

export interface ClientMapLoadedMessage {
    type: 'map_loaded';
}

export interface ClientSelectCharacterMessage {
    type: 'select_character';
    characterModelId: string;
}

export interface ClientAbilityMessage {
    type: 'ability';
    /** Ability slot (0 = tactical, 1 = ultimate) */
    slot: 0 | 1;
    /** Target position (for ground-targeted abilities) */
    target?: Vector3;
    /** Target direction (for directional abilities) */
    direction?: Vector3;
    /** Target entity (for single-target abilities) */
    targetEntity?: EntityId;
}

export interface ClientWeaponSwitchMessage {
    type: 'weapon_switch';
    /** Weapon slot to switch to (0-2) */
    slot: number;
}

export interface ClientInteractMessage {
    type: 'interact';
    /** Entity to interact with */
    targetEntity?: EntityId;
}

export interface ClientPingMessage {
    type: 'ping';
    /** Client timestamp */
    clientTime: number;
}

/**
 * Messages sent from server to client via Socket.io
 */
export type ServerMessage =
    | ServerSnapshotMessage
    | ServerDeltaMessage
    | ServerEventMessage
    | ServerDamageAppliedMessage
    | ServerPlayerDiedMessage
    | ServerScoreUpdateMessage
    | ServerSignalStateMessage
    | ServerMatchEndedMessage
    | ServerPongMessage
    | ServerAckMessage;

export interface ServerSnapshotMessage {
    type: 'snapshot';
    /** Full world state snapshot */
    snapshot: WorldSnapshot;
    /** Server tick when snapshot was sent */
    tick?: Tick;
}

export interface ServerDeltaMessage {
    type: 'delta';
    /** Tick of the base snapshot */
    baseTick: Tick;
    /** Current tick */
    tick?: Tick;
    /** Delta changes since base */
    delta: WorldDelta;
}

export interface ServerEventMessage {
    type: 'event';
    /** Game event that occurred */
    event: GameEvent;
    /** Tick when event occurred */
    tick: Tick;
}

export interface ServerDamageAppliedMessage {
    type: 'damage_applied';
    targetId: string;
    attackerId: string;
    amount: number;
    healthAfter: number;
    shotId?: string;
}

export interface ServerPlayerDiedMessage {
    type: 'player_died';
    victimId: string;
    killerId: string;
    killerScore: number;
}

export interface ServerScoreUpdateMessage {
    type: 'score_update';
    scores: Record<string, number>;
    targetScore: number;
}

export interface ServerSignalStateMessage {
    type: 'signal_state';
    activeHardpointId: string;
    activeHardpointIndex: number;
    hardpointPosition: Vector3;
    hardpointRadius: number;
    controllingTeam: 1 | 2 | null;
    contested: boolean;
    teamSignal: [number, number];
    targetSignal: number;
    tick: Tick;
}

export interface ServerMatchEndedMessage {
    type: 'match_ended';
    winnerId: string;
    scores: Record<string, number>;
    targetScore: number;
}

export interface ServerPongMessage {
    type: 'pong';
    /** Echoed client timestamp */
    clientTime: number;
    /** Server timestamp */
    serverTime: number;
    /** Current server tick */
    serverTick: Tick;
}

export interface ServerAckMessage {
    type: 'ack';
    /** Last processed input sequence number */
    lastProcessedSeq: number;
    /** Server tick when input was processed */
    tick: Tick;
}

// =============================================================================
// WORLD DELTA - Compressed state changes
// =============================================================================

export interface WorldDelta {
    /** Entities that were added */
    addedEntities: EntityId[];

    /** Entities that were removed */
    removedEntities: EntityId[];

    /** Transform component changes */
    transforms: Array<{
        entityId: EntityId;
        position?: Vector3;
        rotation?: { x: number; y: number; z: number; w: number };
    }>;

    /** Physics component changes (velocity) */
    physics: Array<{
        entityId: EntityId;
        velocity?: Vector3;
        isGrounded?: boolean;
    }>;

    /** Health component changes */
    health: Array<{
        entityId: EntityId;
        health?: number;
        shield?: number;
        overshield?: number;
    }>;

    /** Weapon component changes */
    weapons: Array<{
        entityId: EntityId;
        activeSlot?: number;
        ammo?: number;
        isReloading?: boolean;
        chargeLevel?: number;
    }>;

    /** Ability component changes */
    abilities: Array<{
        entityId: EntityId;
        tacticalReadyTick?: Tick;
        ultimateCharge?: number;
        isTacticalActive?: boolean;
        isUltimateActive?: boolean;
    }>;

    /** Player state changes */
    players: Array<{
        entityId: EntityId;
        isAlive?: boolean;
        stats?: Partial<{
            kills: number;
            deaths: number;
            assists: number;
        }>;
    }>;
}

// =============================================================================
// COLYSEUS PROTOCOL - Lobbies, matchmaking, meta
// =============================================================================

/**
 * Lobby state synchronized via Colyseus
 */
export interface LobbyState {
    /** Players in the lobby */
    players: Map<PlayerId, LobbyPlayer>;
    /** Current matchmaking queue */
    queue: MatchmakingQueue;
    /** Active matches */
    activeMatches: Map<string, MatchInfo>;
}

export interface LobbyPlayer {
    id: PlayerId;
    displayName: string;
    status: 'idle' | 'queuing' | 'in_match';
    partyId?: string;
    currentMatchId?: string;
}

export interface MatchmakingQueue {
    /** Players waiting for a match */
    players: PlayerId[];
    /** Average wait time in seconds */
    averageWaitTime: number;
    /** Queue size */
    size: number;
}

export interface MatchInfo {
    id: string;
    mode: string;
    map: string;
    teams: {
        teamA: PlayerId[];
        teamB: PlayerId[];
    };
    status: 'waiting' | 'character_select' | 'in_progress' | 'ended';
    startTime?: number;
    socketHost?: string;
    socketPort?: number;
}

/**
 * Match room state synchronized via Colyseus
 */
export interface MatchRoomState {
    matchId: string;
    mode: string;
    map: string;
    phase: 'waiting' | 'character_select' | 'countdown' | 'playing' | 'ended';
    teams: {
        [teamId: number]: TeamState;
    };
    players: Map<PlayerId, MatchPlayer>;
    countdown: number;
    socketHost?: string;
    socketPort?: number;
}

export interface TeamState {
    id: TeamId;
    name: string;
    score: number;
    players: PlayerId[];
}

export interface MatchPlayer {
    id: PlayerId;
    displayName: string;
    teamId: TeamId;
    entityId?: EntityId;
    loadout?: Loadout;
    isReady: boolean;
    isConnectedToGameServer: boolean;
}

// =============================================================================
// COLYSEUS MESSAGES
// =============================================================================

/**
 * Messages sent to Colyseus rooms
 */
export type LobbyMessage =
    | { type: 'join_queue'; mode: string }
    | { type: 'leave_queue' }
    | { type: 'create_party' }
    | { type: 'join_party'; partyId: string }
    | { type: 'leave_party' };

export type MatchMessage =
    | { type: 'select_loadout'; loadout: Loadout }
    | { type: 'ready' }
    | { type: 'unready' }
    | { type: 'switch_team' }
    | { type: 'chat'; message: string };

// =============================================================================
// MESSAGE SERIALIZATION HELPERS
// =============================================================================

/**
 * Serialize a client message to binary for efficient transmission
 */
export function serializeClientMessage(msg: ClientMessage): ArrayBuffer {
    // For now, use JSON. Replace with binary protocol (e.g., MessagePack) later.
    const json = JSON.stringify(msg);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(json);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Deserialize a client message from binary
 */
export function deserializeClientMessage(buffer: ArrayBuffer): ClientMessage {
    const decoder = new TextDecoder();
    const json = decoder.decode(buffer);
    return JSON.parse(json) as ClientMessage;
}

/**
 * Serialize a server message to binary for efficient transmission
 */
export function serializeServerMessage(msg: ServerMessage): ArrayBuffer {
    const json = JSON.stringify(msg);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(json);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Deserialize a server message from binary
 */
export function deserializeServerMessage(buffer: ArrayBuffer): ServerMessage {
    const decoder = new TextDecoder();
    const json = decoder.decode(buffer);
    return JSON.parse(json) as ServerMessage;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const NETWORK = {
    /** How often to send full snapshots (every N ticks) */
    SNAPSHOT_INTERVAL: 60, // Once per second

    /** How often to send deltas (every N ticks) */
    DELTA_INTERVAL: 2, // 30 times per second

    /** Maximum input buffer size */
    MAX_INPUT_BUFFER: 60,

    /** Interpolation delay in ticks */
    INTERPOLATION_DELAY: 6, // ~100ms at 60 tick

    /** Maximum acceptable client-server clock difference (ticks) */
    MAX_CLOCK_DRIFT: 30,

    /** Ping interval (ms) */
    PING_INTERVAL: 1000,
} as const;
