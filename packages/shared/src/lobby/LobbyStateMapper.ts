/**
 * Room State to Lobby State Mapper
 * 
 * Pure function mapping Colyseus room state to UI LobbyState.
 * No side effects, no networking, no UI.
 */

import type {
    LobbyState,
    LobbyPhase,
    PlayerSlot,
    TeamId,
    GameMode,
    Ruleset,
    AccessType,
    QueueState,
    LobbyError,
    PlayerId,
} from '../types/lobby.js';

// =============================================================================
// COLYSEUS ROOM STATE (Input shape)
// =============================================================================

export interface RoomPlayer {
    readonly sessionId: string;
    readonly displayName?: string;
    readonly team?: number;
    readonly slot?: number;
    readonly isReady?: boolean;
    readonly isHost?: boolean;
}

export interface RoomState {
    readonly roomId?: string;
    readonly phase?: string;
    readonly players?: Map<string, RoomPlayer> | Record<string, RoomPlayer>;
    readonly mode?: string;
    readonly ruleset?: string;
    readonly access?: string;
    readonly maxPlayers?: number;
    readonly minPlayers?: number;
    readonly countdownSeconds?: number;
    readonly waitTimeSec?: number;
    readonly playersInQueue?: number;
    readonly errorCode?: string;
    readonly errorMessage?: string;
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_LOBBY_STATE: LobbyState = {
    lobbyId: '',
    phase: 'idle',
    players: [],
    localPlayerId: '',
    mode: '1v1',
    ruleset: 'casual',
    access: 'public',
    maxPlayers: 2,
    minPlayers: 2,
    countdownSec: 0,
};

// =============================================================================
// PHASE MAPPING
// =============================================================================

function mapPhase(phase?: string): LobbyPhase {
    switch (phase) {
        case 'idle':
        case 'waiting':
            return 'idle';
        case 'queueing':
        case 'searching':
            return 'queueing';
        case 'assembling':
        case 'filling':
            return 'assembling';
        case 'ready_check':
        case 'readyCheck':
            return 'ready_check';
        case 'countdown':
        case 'starting':
            return 'countdown';
        case 'error':
            return 'error';
        default:
            return 'idle';
    }
}

// =============================================================================
// PLAYER MAPPING
// =============================================================================

function mapPlayers(
    players: Map<string, RoomPlayer> | Record<string, RoomPlayer> | undefined
): PlayerSlot[] {
    if (!players) return [];

    const entries = players instanceof Map
        ? Array.from(players.entries())
        : Object.entries(players);

    return entries.map(([sessionId, player]) => ({
        playerId: sessionId,
        displayName: player.displayName ?? `Player_${sessionId.slice(0, 4)}`,
        team: (player.team ?? 0) as TeamId,
        slot: player.slot ?? 0,
        isReady: player.isReady ?? false,
        isHost: player.isHost ?? false,
    }));
}

// =============================================================================
// MODE / RULESET / ACCESS MAPPING
// =============================================================================

function mapMode(mode?: string): GameMode {
    switch (mode) {
        case '1v1':
        case 'duel':
            return '1v1';
        default:
            return '1v1';
    }
}

function mapRuleset(ruleset?: string): Ruleset {
    switch (ruleset) {
        case 'wager':
        case 'ranked':
            return 'wager';
        case 'casual':
        default:
            return 'casual';
    }
}

function mapAccess(access?: string): AccessType {
    switch (access) {
        case 'token':
            return 'token';
        case 'nft':
            return 'nft';
        case 'friends':
            return 'friends';
        case 'public':
        default:
            return 'public';
    }
}

// =============================================================================
// QUEUE STATE MAPPING
// =============================================================================

function mapQueueState(roomState: RoomState, mode: GameMode, ruleset: Ruleset): QueueState | undefined {
    if (mapPhase(roomState.phase) !== 'queueing') {
        return undefined;
    }

    return {
        waitTimeSec: roomState.waitTimeSec ?? 0,
        mode,
        ruleset,
        playersInQueue: roomState.playersInQueue ?? 0,
    };
}

// =============================================================================
// ERROR MAPPING
// =============================================================================

function mapError(roomState: RoomState): LobbyError | undefined {
    if (!roomState.errorCode && !roomState.errorMessage) {
        return undefined;
    }

    return {
        code: roomState.errorCode ?? 'UNKNOWN',
        message: roomState.errorMessage ?? 'An error occurred',
    };
}

// =============================================================================
// MAIN MAPPER
// =============================================================================

export function mapRoomStateToLobbyState(
    roomState: RoomState | undefined | null,
    localPlayerId: PlayerId
): LobbyState {
    if (!roomState) {
        return { ...DEFAULT_LOBBY_STATE, localPlayerId };
    }

    const mode = mapMode(roomState.mode);
    const ruleset = mapRuleset(roomState.ruleset);

    return {
        lobbyId: roomState.roomId ?? '',
        phase: mapPhase(roomState.phase),
        players: mapPlayers(roomState.players),
        localPlayerId,
        mode,
        ruleset,
        access: mapAccess(roomState.access),
        maxPlayers: roomState.maxPlayers ?? 2,
        minPlayers: roomState.minPlayers ?? 2,
        countdownSec: roomState.countdownSeconds ?? 0,
        queue: mapQueueState(roomState, mode, ruleset),
        error: mapError(roomState),
    };
}
