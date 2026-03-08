/**
 * Game Bridge
 * 
 * Communication layer between the vanilla Three.js game
 * and the React UI layer.
 * 
 * Uses an event emitter pattern to maintain strict separation.
 */

import type {
    EntityId,
    PlayerId,
    TeamId,
    GameEvent as SharedGameEvent,
    Vector3,
    Quaternion,
    LobbyState,
    Tick,
} from '@snapshot/shared';
import type { InputAck } from '@snapshot/shared/simulation';
import { TICK_MS } from '@snapshot/shared/simulation';
import type { GameEvent as SignalProtocolGameEvent } from '../types/SignalProtocol';

// =============================================================================
// TYPES
// =============================================================================

/** State exposed to React UI */
export interface UIGameState {
    /** Is the game currently running */
    isRunning: boolean;

    /** Is connected to server */
    isConnected: boolean;

    /** Local player entity ID */
    localPlayerEntityId: EntityId | null;

    /** Local player's team */
    localTeamId: TeamId;

    /** Current health (0-max) */
    health: number;

    /** Maximum health */
    maxHealth: number;

    /** Current shield (0-max) */
    shield: number;

    /** Maximum shield */
    maxShield: number;

    /** Current weapon ammo */
    ammo: number;

    /** Maximum weapon ammo */
    maxAmmo: number;

    /** Is currently reloading */
    isReloading: boolean;

    /** Reload progress (0-1) */
    reloadProgress: number;

    /** Active weapon slot */
    activeWeaponSlot: number;

    /** Tactical ability cooldown remaining (0 = ready) */
    tacticalCooldown: number;

    /** Ultimate charge (0-100) */
    ultimateCharge: number;

    /** Is ultimate ready */
    ultimateReady: boolean;

    /** Current kills */
    kills: number;

    /** Current deaths */
    deaths: number;

    /** Current assists */
    assists: number;

    /** Team scores */
    teamScores: Record<number, number>;

    /** Match timer remaining (seconds) */
    matchTimeRemaining: number;

    /** Kill feed entries */
    killFeed: KillFeedEntry[];

    /** Current FPS */
    fps: number;

    /** Average frame time (ms) over the last FPS sample window */
    frameTimeMs: number;

    /** Current ping (ms) */
    ping: number;

    /** Is aiming (controls crosshair visibility) */
    isAiming: boolean;

    /** Is the player dead */
    isDead: boolean;

    /** Respawn timer remaining (seconds) */
    respawnTimeRemaining: number;

    /** Is match over */
    isGameOver: boolean;

    /** Winner name/id */
    winnerName: string | null;

    /** Pre-round lock state */
    preRoundActive: boolean;
    preRoundRemainingSec: number;
    preRoundDurationSec: number;
    availableCharacterModelIds: string[];
    selectedCharacterModelId: string;
    selectedWeaponModelId: string;

    /** Signal Protocol HUD hooks */
    signalNextDropSec: number;
    signalExtractionPct: number;
    signalExtractionStalled: boolean;
    signalActiveBuffs: string[];
    signalActiveDropBuffName: string | null;
    signalActiveDropBuffRemainingSec: number;
    signalSuddenDeathStatus: 'idle' | 'warning' | 'active';
    signalZoneNumber: number;
    signalZoneState: 'PREMATCH_LOADOUT' | 'COUNTDOWN' | 'ACTIVE' | 'POSTMATCH';
    signalZoneTimerSec: number;
    signalZoneOwnerLabel: string;
    signalSnapBackend: string;
    signalSnapSeq: number;
    signalSnapStateHash: string;
    signalSnapSignalBlue: number;
    signalSnapSignalRed: number;
    signalSnapActiveZone: number;
    signalSnapZonePhase: 'COUNTDOWN' | 'ACTIVE';
    signalSnapZoneRemainingSec: number;
    signalSnapActiveDropModifierId: string | null;
    signalAuthoritySource: string;
    signalAuthorityLatestCommitSeq: number;
    signalAuthorityLastCommitSignature: string | null;
    signalAuthorityMatchId: string | null;
    signalAuthorityDelegated: boolean;

    /** Lightweight net debug for PeerJS TDM */
    netRole: 'offline' | 'socket' | 'p2p_host' | 'p2p_client';
    netSnapshotRate: number;
    netDroppedSnapshots: number;
    netEventBacklog: number;
    netBytesInPerSec: number;
    netBytesOutPerSec: number;
    netSendBacklogBytes: number;
    netInterpolationDelayTicks: number;
}

export interface KillFeedEntry {
    id: string;
    killerId?: PlayerId;
    killerName: string;
    killerTeam: TeamId;
    victimId?: PlayerId;
    victimName: string;
    victimTeam: TeamId;
    weapon: string;
    timestamp: number;
}

/** Events from game to UI */
type BridgeGameEvent = SharedGameEvent | SignalProtocolGameEvent;

export type GameToUIEvent =
    | { type: 'state_update'; state: Partial<UIGameState> }
    | { type: 'game_event'; event: BridgeGameEvent }
    | { type: 'connected' }
    | { type: 'disconnected' }
    | { type: 'match_start' }
    | { type: 'wager_lock'; matchId: string; wagerAmountSol: number; opponentWallet?: string; lockRole?: 'init' | 'join' }
    | { type: 'match_end'; winningTeam: TeamId }
    | { type: 'kill_feed'; entry: KillFeedEntry }
    | { type: 'damage_indicator'; direction: Vector3; amount: number }
    | { type: 'hit_marker'; critical: boolean }
    | { type: 'lobby_update'; state: import('@snapshot/shared').LobbyState }
    | { type: 'social_update'; state: any }
    | { type: 'game_message'; message: string; severity?: 'info' | 'error' | 'success' | 'warning' };

/** Events from UI to game */
export type UIToGameEvent =
    | { type: 'request_respawn' }
    | { type: 'set_sensitivity'; value: number }
    | { type: 'set_fov'; value: number }
    | { type: 'pause_game' }
    | { type: 'resume_game' }
    | { type: 'quit_match' }
    | { type: 'join_queue'; mode: string; ruleset: string; transport?: 'socket' | 'p2p'; wagerAmountSol?: number }
    | { type: 'select_character'; characterModelId: string }
    | { type: 'wager_locked'; matchId: string }
    | { type: 'leave_queue' }
    | {
        type: 'entity_move';
        entityId: EntityId;
        position: Vector3;
        rotation: { x: number; y: number; z: number; w: number };
        velocity?: Vector3;
        isGrounded?: boolean;
        lastProcessedInputTick?: Tick;
    };

type GameEventListener = (event: GameToUIEvent) => void;
type UIEventListener = (event: UIToGameEvent) => void;

// =============================================================================
// GAME BRIDGE CLASS
// =============================================================================

export class GameBridge {
    private gameListeners: Set<GameEventListener> = new Set();
    private uiListeners: Set<UIEventListener> = new Set();
    private entityTransforms: Map<EntityId, { position: Vector3; rotation: Quaternion; velocity?: Vector3; isGrounded?: boolean }> = new Map();
    private localPlayerId: PlayerId | null = null;
    private warnedLocalIdChange = false;
    private playerIdToEntityId: Map<PlayerId, EntityId> = new Map();
    private remotePoses: Map<PlayerId, { position: Vector3; rotation?: Quaternion; tick: Tick }> = new Map();
    private localRenderPos: Vector3 | null = null;
    private serverSelfPos: Vector3 | null = null;
    private serverSelfRot: Quaternion | null = null;
    private serverRemotePos: Map<PlayerId, Vector3> = new Map();
    private remoteRenderPos: Map<PlayerId, Vector3> = new Map();
    private lastServerPosByPlayerId: Map<string, { x: number; y: number; z: number; t: number }> = new Map();
    private remotePlayerRootsByPlayerId: Map<string, { position: Vector3; lastSeen: number }> = new Map();
    private remotePoseBuffers: Map<PlayerId, PoseSample[]> = new Map();
    private remoteGroundedByPlayerId: Map<PlayerId, boolean> = new Map();
    private lastRemoteExtrapolationMs = 0;
    private interpolatedEntitiesOut: Map<EntityId, { position: Vector3; rotation: Quaternion; isGrounded?: boolean }> = new Map();
    private interpolatedEntitiesSeen: Set<EntityId> = new Set();
    private serverCorrectionTarget: Vector3 | null = null;
    private pendingPlayerDeaths: Map<PlayerId, PlayerId | null> = new Map();
    private lastKillFeedKey: string | null = null;
    private lastKillFeedAt = 0;
    private preRoundEndTick: Tick | null = null;
    private preRoundEndTimeMs: number | null = null;
    private entityTeamIds: Map<EntityId, TeamId> = new Map();
    private entityCharacterModelIds: Map<EntityId, string> = new Map();
    private selectedCharacterByPlayerId: Map<PlayerId, string> = new Map();
    private entityWeaponModelIds: Map<EntityId, string> = new Map();
    private selectedWeaponByPlayerId: Map<PlayerId, string> = new Map();

    private static readonly REMOTE_POSE_BUFFER_MAX = 10;

    // Match data received from server (spawn positions, opponents)
    private matchData: {
        spawnPosition?: { x: number; y: number; z: number };
        teamId?: TeamId;
        mode?: string;
        opponent?: string;
        opponentSpawnPosition?: { x: number; y: number; z: number } | null;
        allPlayers?: { playerId: string; teamId?: TeamId; spawnPosition: { x: number; y: number; z: number } }[];
    } | null = null;
    private lastSnapshotTick: import('@snapshot/shared/simulation').Tick | null = null;
    private lastSnapshotTimeMs: number | null = null;
    private lastInputAck: { seq: number; tick: Tick; timeMs: number } | null = null;

    private currentState: UIGameState = {
        isRunning: false,
        isConnected: false,
        localPlayerEntityId: null,
        localTeamId: 1 as TeamId,
        health: 0,
        maxHealth: 100,
        shield: 0,
        maxShield: 0,
        ammo: 30,
        maxAmmo: 30,
        isReloading: false,
        reloadProgress: 0,
        activeWeaponSlot: 0,
        tacticalCooldown: 0,
        ultimateCharge: 0,
        ultimateReady: false,
        kills: 0,
        deaths: 0,
        assists: 0,
        teamScores: { 1: 0, 2: 0 },
        matchTimeRemaining: 0,
        killFeed: [],
        fps: 0,
        frameTimeMs: 0,
        ping: 0,
        isAiming: false,
        isDead: false,
        respawnTimeRemaining: 0,
        isGameOver: false,
        winnerName: null,
        preRoundActive: false,
        preRoundRemainingSec: 0,
        preRoundDurationSec: 10,
        availableCharacterModelIds: ['assasin', 'grizzly', 'kodiak', 'panda'],
        selectedCharacterModelId: 'assasin',
        selectedWeaponModelId: 'smg1',
        signalNextDropSec: 0,
        signalExtractionPct: 0,
        signalExtractionStalled: false,
        signalActiveBuffs: [],
        signalActiveDropBuffName: null,
        signalActiveDropBuffRemainingSec: 0,
        signalSuddenDeathStatus: 'idle',
        signalZoneNumber: 1,
        signalZoneState: 'COUNTDOWN',
        signalZoneTimerSec: 0,
        signalZoneOwnerLabel: 'NEUTRAL',
        signalSnapBackend: 'local',
        signalSnapSeq: 0,
        signalSnapStateHash: '',
        signalSnapSignalBlue: 0,
        signalSnapSignalRed: 0,
        signalSnapActiveZone: 1,
        signalSnapZonePhase: 'COUNTDOWN',
        signalSnapZoneRemainingSec: 0,
        signalSnapActiveDropModifierId: null,
        signalAuthoritySource: 'local',
        signalAuthorityLatestCommitSeq: 0,
        signalAuthorityLastCommitSignature: null,
        signalAuthorityMatchId: null,
        signalAuthorityDelegated: false,
        netRole: 'offline',
        netSnapshotRate: 0,
        netDroppedSnapshots: 0,
        netEventBacklog: 0,
        netBytesInPerSec: 0,
        netBytesOutPerSec: 0,
        netSendBacklogBytes: 0,
        netInterpolationDelayTicks: 7,
    };
    private lobbyState: LobbyState | null = null;
    private socialState: any | null = null;

    /**
     * Get current game state (for React).
     */
    getState(): UIGameState {
        return { ...this.currentState };
    }

    /**
     * Get match data (spawn positions, opponents).
     */
    getMatchData() {
        return this.matchData;
    }

    /**
     * Resolve an entity ID for a given player ID (if known from snapshots).
     */
    getEntityIdForPlayerId(playerId: PlayerId): EntityId | null {
        return this.playerIdToEntityId.get(playerId) ?? null;
    }

    registerPlayerEntity(
        playerId: PlayerId,
        entityId: EntityId,
        characterModelId: string = 'assasin',
        weaponModelId: string = 'smg1',
        teamId?: TeamId,
    ): void {
        this.playerIdToEntityId.set(playerId, entityId);
        this.entityCharacterModelIds.set(entityId, characterModelId);
        this.entityWeaponModelIds.set(entityId, weaponModelId);
        if (typeof teamId === 'number') {
            this.entityTeamIds.set(entityId, teamId);
        }
    }

    setEntityTeamId(entityId: EntityId, teamId: TeamId): void {
        this.entityTeamIds.set(entityId, teamId);
    }

    getEntityCharacterModelId(entityId: EntityId): string | null {
        return this.entityCharacterModelIds.get(entityId) ?? null;
    }

    getEntityTeamId(entityId: EntityId): TeamId | null {
        return this.entityTeamIds.get(entityId) ?? null;
    }

    getEntityWeaponModelId(entityId: EntityId): string | null {
        return this.entityWeaponModelIds.get(entityId) ?? null;
    }

    getLocalPlayerId(): PlayerId | null {
        return this.localPlayerId;
    }

    emitPlayerDeathByPlayerId(victimId: PlayerId, killerId: PlayerId | null): void {
        const entityId = this.getEntityIdForPlayerId(victimId);
        const killerEntityId = killerId ? this.getEntityIdForPlayerId(killerId) : null;
        if (entityId) {
            this.emitGameEvent({
                type: 'player_died',
                entityId: entityId as any,
                killerId: killerEntityId ?? null,
                weapon: 'smg',
            });
            return;
        }
        this.pendingPlayerDeaths.set(victimId, killerId);
    }

    /**
     * Get last received snapshot timing info.
     */
    getLastSnapshotInfo(): { tick: import('@snapshot/shared/simulation').Tick; timeMs: number } | null {
        if (this.lastSnapshotTick === null || this.lastSnapshotTimeMs === null) return null;
        return { tick: this.lastSnapshotTick, timeMs: this.lastSnapshotTimeMs };
    }

    /**
     * Get last processed input ack from server.
     */
    getLastInputAck(): { seq: number; tick: Tick; timeMs: number } | null {
        return this.lastInputAck;
    }

    /**
     * Get last known authoritative position for the local player (server-side).
     */
    getServerSelfPos(): Vector3 | null {
        return this.serverSelfPos
            ? { x: this.serverSelfPos.x, y: this.serverSelfPos.y, z: this.serverSelfPos.z }
            : null;
    }

    getServerSelfRot(): Quaternion | null {
        return this.serverSelfRot
            ? { x: this.serverSelfRot.x, y: this.serverSelfRot.y, z: this.serverSelfRot.z, w: this.serverSelfRot.w }
            : null;
    }

    /**
     * Set the local player ID for this connection (per-tab).
     */
    setLocalPlayerId(playerId: PlayerId): void {
        if (this.localPlayerId && this.localPlayerId !== playerId && !this.warnedLocalIdChange) {
            console.warn('GameBridge: localPlayerId changed after connect; check for shared id leakage between tabs.');
            this.warnedLocalIdChange = true;
        }
        this.localPlayerId = playerId;
    }

    setLocalRenderPos(position: Vector3): void {
        this.localRenderPos = { x: position.x, y: position.y, z: position.z };
    }

    updateLocalRenderPos(position: Vector3): void {
        this.setLocalRenderPos(position);
    }

    getLocalRenderPos(): Vector3 | null {
        if (!this.localRenderPos) return null;
        return { x: this.localRenderPos.x, y: this.localRenderPos.y, z: this.localRenderPos.z };
    }

    processNetPose(event: { type: 'net_pose'; playerId: PlayerId; position: Vector3; rotation?: Quaternion; velocity?: Vector3; tick: Tick }): void {
        if (this.localPlayerId && event.playerId === this.localPlayerId) {
            this.serverSelfPos = { x: event.position.x, y: event.position.y, z: event.position.z };
            if (event.rotation) {
                this.serverSelfRot = { x: event.rotation.x, y: event.rotation.y, z: event.rotation.z, w: event.rotation.w };
            }
            this.lastServerPosByPlayerId.set(event.playerId, {
                x: event.position.x,
                y: event.position.y,
                z: event.position.z,
                t: performance.now(),
            });
            return;
        }
        const remotePose: { position: Vector3; rotation?: Quaternion; tick: Tick } = {
            position: event.position,
            tick: event.tick,
        };
        if (event.rotation) {
            remotePose.rotation = event.rotation;
        }
        this.remotePoses.set(event.playerId, remotePose);
        this.serverRemotePos.set(event.playerId, { x: event.position.x, y: event.position.y, z: event.position.z });
        this.lastServerPosByPlayerId.set(event.playerId, {
            x: event.position.x,
            y: event.position.y,
            z: event.position.z,
            t: performance.now(),
        });
        this.ensureRemoteRoot(event.playerId, event.position);
        this.pushRemotePose(event.playerId, event.position, event.rotation ?? { x: 0, y: 0, z: 0, w: 1 }, event.tick, event.velocity);
        this.cleanupRemoteRoots();
    }

    private worldToRenderPos(position?: Vector3): Vector3 | undefined {
        if (!position) return undefined;
        return { x: position.x, y: position.y, z: position.z };
    }

    worldToRenderPosPublic(position?: Vector3): Vector3 | undefined {
        return this.worldToRenderPos(position);
    }


    // =========================================================================
    // GAME -> UI (Game calls these)
    // =========================================================================

    /**
     * Update game state and notify UI.
     */
    updateState(partial: Partial<UIGameState>): void {
        const changed: Partial<UIGameState> = {};
        let changedCount = 0;
        for (const key of Object.keys(partial) as (keyof UIGameState)[]) {
            const nextValue = partial[key];
            if (nextValue !== this.currentState[key]) {
                changed[key] = nextValue as never;
                changedCount++;
            }
        }
        if (changedCount === 0) {
            return;
        }
        this.currentState = {
            ...this.currentState,
            ...changed,
        };

        this.emitToUI({ type: 'state_update', state: changed });
    }

    /**
     * Set full game state.
     */
    setState(state: UIGameState): void {
        this.currentState = state;
        this.emitToUI({ type: 'state_update', state });
    }

    /**
     * Emit a game event to UI.
     */
    emitGameEvent(event: BridgeGameEvent): void {
        this.emitToUI({ type: 'game_event', event });

        // Handle specific events (non-killfeed logic only)
    }

    /**
     * Notify UI of connection.
     */
    notifyConnected(): void {
        this.updateState({ isConnected: true, netRole: 'socket' });
        this.emitToUI({ type: 'connected' });
    }

    /**
     * Notify UI of disconnection.
     */
    notifyDisconnected(): void {
        this.updateState({
            isConnected: false,
            isRunning: false,
            netRole: 'offline',
            netSnapshotRate: 0,
            netDroppedSnapshots: 0,
            netEventBacklog: 0,
            netBytesInPerSec: 0,
            netBytesOutPerSec: 0,
            netSendBacklogBytes: 0,
        });
        this.entityTransforms.clear();
        this.remotePoseBuffers.clear();
        this.remoteGroundedByPlayerId.clear();
        this.playerIdToEntityId.clear();
        this.entityCharacterModelIds.clear();
        this.selectedCharacterByPlayerId.clear();
        this.entityWeaponModelIds.clear();
        this.selectedWeaponByPlayerId.clear();
        this.preRoundEndTick = null;
        this.preRoundEndTimeMs = null;
        this.lastSnapshotTick = null;
        this.lastSnapshotTimeMs = null;
        this.lastInputAck = null;
        this.emitToUI({ type: 'disconnected' });
    }

    /**
     * Update lobby state.
     */
    updateLobbyState(state: import('@snapshot/shared').LobbyState): void {
        this.lobbyState = state;
        this.emitToUI({ type: 'lobby_update', state });
    }

    getLobbyState(): LobbyState | null {
        return this.lobbyState;
    }

    updateSocialState(state: any): void {
        this.socialState = state;
        this.emitToUI({ type: 'social_update', state });
    }

    getSocialState(): any | null {
        return this.socialState;
    }

    addKillFeedByPlayerIds(killerId: PlayerId | null, victimId: PlayerId | null, weapon: string): void {
        const key = `${killerId ?? 'none'}:${victimId ?? 'none'}:${weapon}`;
        const now = Date.now();
        if (this.lastKillFeedKey === key && now - this.lastKillFeedAt < 250) {
            return;
        }
        this.lastKillFeedKey = key;
        this.lastKillFeedAt = now;

        const killerSlot = this.lobbyState?.players.find(p => p.playerId === killerId);
        const victimSlot = this.lobbyState?.players.find(p => p.playerId === victimId);

        const entry: KillFeedEntry = {
            id: `${now}-${Math.random()}`,
            killerId: killerId ?? undefined,
            killerName: killerSlot?.displayName ?? (killerId ? String(killerId) : 'Unknown'),
            killerTeam: (killerSlot?.team ?? 1) as TeamId,
            victimId: victimId ?? undefined,
            victimName: victimSlot?.displayName ?? (victimId ? String(victimId) : 'Unknown'),
            victimTeam: (victimSlot?.team ?? 2) as TeamId,
            weapon,
            timestamp: now,
        };

        this.currentState.killFeed = [
            entry,
            ...this.currentState.killFeed.slice(0, 4),
        ];

        this.emitToUI({ type: 'kill_feed', entry });
    }

    /**
     * Show a game message (toast/notification).
     */
    notifyGameMessage(message: string, severity: 'info' | 'error' | 'success' | 'warning' = 'info'): void {
        this.emitToUI({ type: 'game_message', message, severity });
    }

    /**
     * Notify UI that match is starting (game should initialize).
     */
    notifyMatchStart(data?: {
        spawnPosition?: { x: number; y: number; z: number };
        teamId?: TeamId;
        mode?: string;
        opponent?: string;
        opponentSpawnPosition?: { x: number; y: number; z: number } | null;
        allPlayers?: { playerId: string; teamId?: TeamId; spawnPosition: { x: number; y: number; z: number } }[];
    }): void {
        // Store match data for use by initializeGame
        if (data) {
            this.matchData = data;
        }
        this.entityTransforms.clear();
        this.remotePoseBuffers.clear();
        this.remoteGroundedByPlayerId.clear();
        this.playerIdToEntityId.clear();
        this.entityTeamIds.clear();
        this.entityCharacterModelIds.clear();
        this.selectedCharacterByPlayerId.clear();
        this.lastSnapshotTick = null;
        this.lastSnapshotTimeMs = null;
        this.lastInputAck = null;
        this.preRoundEndTick = null;
        this.preRoundEndTimeMs = null;
        this.updateState({
            isRunning: true,
            preRoundActive: false,
            preRoundRemainingSec: 0,
            preRoundDurationSec: 10,
            localTeamId: data?.teamId ?? this.currentState.localTeamId,
            availableCharacterModelIds: ['assasin', 'grizzly', 'kodiak', 'panda'],
            netDroppedSnapshots: 0,
            netEventBacklog: 0,
        });
        this.emitToUI({ type: 'match_start', ...data });
    }

    /**
     * Reset network-derived state for local-only modes (training).
     */
    resetForLocalMode(): void {
        this.entityTransforms.clear();
        this.remotePoseBuffers.clear();
        this.remoteGroundedByPlayerId.clear();
        this.playerIdToEntityId.clear();
        this.remoteRenderPos.clear();
        this.remotePlayerRootsByPlayerId.clear();
        this.remotePoses.clear();
        this.lastServerPosByPlayerId.clear();
        this.entityTeamIds.clear();
        this.entityCharacterModelIds.clear();
        this.selectedCharacterByPlayerId.clear();
        this.preRoundEndTick = null;
        this.preRoundEndTimeMs = null;
        this.serverCorrectionTarget = null;
        this.serverSelfPos = null;
        this.serverSelfRot = null;
        this.lastSnapshotTick = null;
        this.lastSnapshotTimeMs = null;
        this.lastInputAck = null;
        this.localPlayerId = null;
        this.updateState({ localTeamId: 1 as TeamId });
    }

    notifyWagerLock(matchId: string, wagerAmountSol: number, opponentWallet?: string, lockRole?: 'init' | 'join'): void {
        const event: GameToUIEvent = { type: 'wager_lock', matchId, wagerAmountSol };
        if (opponentWallet) {
            event.opponentWallet = opponentWallet;
        }
        if (lockRole) {
            event.lockRole = lockRole;
        }
        this.emitToUI(event);
    }

    notifyPreRoundStart(data: {
        durationSec: number;
        endTick?: number;
        availableCharacterModelIds?: string[];
    }): void {
        this.preRoundEndTick = typeof data.endTick === 'number' ? (data.endTick as Tick) : null;
        this.preRoundEndTimeMs = performance.now() + (data.durationSec * 1000);
        this.updateState({
            preRoundActive: true,
            preRoundDurationSec: data.durationSec,
            preRoundRemainingSec: data.durationSec,
            availableCharacterModelIds: data.availableCharacterModelIds?.length
                ? data.availableCharacterModelIds
                : this.currentState.availableCharacterModelIds,
        });
    }

    notifyPreRoundEnd(): void {
        this.preRoundEndTick = null;
        this.preRoundEndTimeMs = null;
        this.updateState({
            preRoundActive: false,
            preRoundRemainingSec: 0,
        });
    }

    notifyCharacterSelected(playerId: PlayerId, characterModelId: string): void {
        this.selectedCharacterByPlayerId.set(playerId, characterModelId);
        const entityId = this.playerIdToEntityId.get(playerId);
        if (entityId !== undefined) {
            this.entityCharacterModelIds.set(entityId as any, characterModelId);
        }
        if (this.localPlayerId && playerId === this.localPlayerId) {
            this.updateState({ selectedCharacterModelId: characterModelId });
        }
    }

    notifyWeaponSelected(playerId: PlayerId, weaponModelId: string): void {
        this.selectedWeaponByPlayerId.set(playerId, weaponModelId);
        const entityId = this.playerIdToEntityId.get(playerId);
        if (entityId !== undefined) {
            this.entityWeaponModelIds.set(entityId as any, weaponModelId);
        }
        if (this.localPlayerId === playerId) {
            this.updateState({ selectedWeaponModelId: weaponModelId });
        }
    }

    /**
     * Process a full world snapshot from server.
     */
    processSnapshot(snapshot: import('@snapshot/shared/simulation').Snapshot): void {
        this.lastSnapshotTick = snapshot.tick;
        this.lastSnapshotTimeMs = performance.now();
        this.updatePreRoundFromTick(snapshot.tick as unknown as Tick);
        this.resolveLocalEntityId(snapshot);

        // Here we could perform reconciliation if we had a local simulation.
        // For now, we update the UI/Renderer with entity positions.
        for (const entity of snapshot.entities) {
            const entityId = Number(entity.id) as EntityId;
            const playerId = entity.player?.playerId;
            if (playerId) {
                this.playerIdToEntityId.set(playerId as PlayerId, entityId);
                if (entity.player?.teamId === 1 || entity.player?.teamId === 2) {
                    const teamId = entity.player.teamId as TeamId;
                    this.entityTeamIds.set(entityId, teamId);
                    if (this.localPlayerId && (playerId as PlayerId) === this.localPlayerId) {
                        this.updateState({ localTeamId: teamId });
                    }
                }
                if (entity.player?.characterModelId) {
                    this.selectedCharacterByPlayerId.set(playerId as PlayerId, entity.player.characterModelId);
                    this.entityCharacterModelIds.set(entityId, entity.player.characterModelId);
                    if (this.localPlayerId && (playerId as PlayerId) === this.localPlayerId) {
                        this.updateState({ selectedCharacterModelId: entity.player.characterModelId });
                    }
                }
            }
            if (this.localPlayerId && (playerId as PlayerId | undefined) === this.localPlayerId) {
                if (entity.transform?.position) {
                    this.serverSelfPos = {
                        x: entity.transform.position.x,
                        y: entity.transform.position.y,
                        z: entity.transform.position.z,
                    };
                    if (entity.transform?.rotation) {
                        this.serverSelfRot = {
                            x: entity.transform.rotation.x,
                            y: entity.transform.rotation.y,
                            z: entity.transform.rotation.z,
                            w: entity.transform.rotation.w,
                        };
                    }
                    if (playerId) {
                        this.lastServerPosByPlayerId.set(playerId, {
                            x: entity.transform.position.x,
                            y: entity.transform.position.y,
                            z: entity.transform.position.z,
                            t: performance.now(),
                        });
                    }
                }
                if (entity.health) {
                    this.updateState({
                        health: entity.health.health,
                        maxHealth: entity.health.maxHealth,
                        shield: entity.health.shield,
                        maxShield: entity.health.maxShield,
                    });
                }
                if (entity.weapon) {
                    this.updateState({
                        ammo: entity.weapon.ammo,
                        isReloading: entity.weapon.isReloading,
                    });
                }
                if (entity.player) {
                    this.updateState({ isDead: !entity.player.isAlive });
                }
                continue;
            }
            if (playerId && entity.transform?.position) {
                this.remotePoses.set(playerId as PlayerId, {
                    position: entity.transform.position,
                    rotation: entity.transform.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
                    tick: snapshot.tick as unknown as Tick,
                });
                if (entity.physics?.isGrounded !== undefined) {
                    this.remoteGroundedByPlayerId.set(playerId as PlayerId, entity.physics.isGrounded);
                }
                this.lastServerPosByPlayerId.set(playerId, {
                    x: entity.transform.position.x,
                    y: entity.transform.position.y,
                    z: entity.transform.position.z,
                    t: performance.now(),
                });
                this.ensureRemoteRoot(playerId as PlayerId, entity.transform.position);
                this.pushRemotePose(
                    playerId as PlayerId,
                    entity.transform.position,
                    entity.transform.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
                    snapshot.tick as unknown as Tick,
                );
                if (this.pendingPlayerDeaths.has(playerId as PlayerId)) {
                    const killerId = this.pendingPlayerDeaths.get(playerId as PlayerId) ?? null;
                    const killerEntityId = killerId ? this.getEntityIdForPlayerId(killerId) : null;
                    this.emitGameEvent({
                        type: 'player_died',
                        entityId,
                        killerId: killerEntityId ?? null,
                        weapon: 'smg',
                    });
                    this.pendingPlayerDeaths.delete(playerId as PlayerId);
                }
                continue;
            }
            const position = this.worldToRenderPos(entity.transform?.position ?? { x: 0, y: 0, z: 0 })!;
            const rotation = entity.transform?.rotation ?? { x: 0, y: 0, z: 0, w: 1 };
            const velocity = entity.physics?.velocity;
            const isGrounded = entity.physics?.isGrounded;
            this.entityTransforms.set(entityId, { position, rotation, velocity, isGrounded });
            this.emitToGame({
                type: 'entity_move',
                entityId,
                position,
                rotation,
                velocity,
                isGrounded,
                lastProcessedInputTick: entity.player?.lastProcessedInputTick as unknown as Tick | undefined,
            });
        }
    }

    private ensureRemoteRoot(playerId: PlayerId, position: Vector3): void {
        if (this.localPlayerId && playerId === this.localPlayerId) return;
        const now = performance.now();
        const existing = this.remotePlayerRootsByPlayerId.get(playerId);
        if (!existing) {
            this.remotePlayerRootsByPlayerId.set(playerId, {
                position: { x: position.x, y: position.y, z: position.z },
                lastSeen: now,
            });
        } else {
            existing.position = { x: position.x, y: position.y, z: position.z };
            existing.lastSeen = now;
        }
    }

    private resolveLocalEntityId(snapshot: import('@snapshot/shared/simulation').Snapshot): void {
        const currentLocalEntityId = this.currentState.localPlayerEntityId;
        let resolvedEntityId: EntityId | null = null;

        if (this.localPlayerId) {
            const localEntity = snapshot.entities.find(
                (entity) => entity.player?.playerId === this.localPlayerId
            );
            if (localEntity) {
                resolvedEntityId = Number(localEntity.id) as any;
            }
        }

        if (resolvedEntityId === null && this.lobbyState?.localPlayerId) {
            const localEntity = snapshot.entities.find(
                (entity) => entity.player?.playerId === this.lobbyState!.localPlayerId
            );
            if (localEntity) {
                resolvedEntityId = Number(localEntity.id) as any;
            }
        }

        if (resolvedEntityId === null && this.matchData?.spawnPosition && snapshot.entities.length > 0) {
            // Fallback: pick entity closest to our spawn position.
            const spawn = this.matchData.spawnPosition;
            let best = snapshot.entities[0] ?? null;
            let bestDist = Infinity;
            for (const entity of snapshot.entities) {
                const pos = entity.transform?.position;
                if (!pos) continue;
                const dx = pos.x - spawn.x;
                const dy = pos.y - spawn.y;
                const dz = pos.z - spawn.z;
                const dist = dx * dx + dy * dy + dz * dz;
                if (dist < bestDist) {
                    bestDist = dist;
                    best = entity;
                }
            }
            if (best) {
                resolvedEntityId = Number(best.id) as EntityId;
            }
        }

        if (resolvedEntityId === null && snapshot.entities.length === 1) {
            resolvedEntityId = Number(snapshot.entities[0]!.id) as any;
        }

        if (resolvedEntityId !== null && resolvedEntityId !== currentLocalEntityId) {
            this.updateState({ localPlayerEntityId: resolvedEntityId as any });
            console.log('GameBridge: Resolved localPlayerEntityId', {
                previous: currentLocalEntityId,
                resolved: resolvedEntityId,
            });
            if (this.localPlayerId) {
                this.remotePoseBuffers.delete(this.localPlayerId);
                this.remoteGroundedByPlayerId.delete(this.localPlayerId);
                this.remoteRenderPos.delete(this.localPlayerId);
                this.remotePlayerRootsByPlayerId.delete(this.localPlayerId);
            }
        }
    }

    private cleanupRemoteRoots(): void {
        const now = performance.now();
        for (const [id, root] of this.remotePlayerRootsByPlayerId) {
            if (now - root.lastSeen > 5000) {
                this.remotePlayerRootsByPlayerId.delete(id);
            }
        }
    }

    /**
     * Process a delta snapshot from server.
     */
    processDelta(delta: import('@snapshot/shared/simulation').SnapshotDelta): void {
        this.lastSnapshotTick = delta.targetTick;
        this.lastSnapshotTimeMs = performance.now();
        this.updatePreRoundFromTick(delta.targetTick as unknown as Tick);
        for (const removedId of delta.removedEntityIds) {
            this.entityTransforms.delete(removedId as any);
            this.entityTeamIds.delete(removedId as any);
            const playerId = this.getPlayerIdForEntity(removedId as any);
            if (playerId) {
                this.remotePoseBuffers.delete(playerId);
                this.remoteGroundedByPlayerId.delete(playerId);
                this.playerIdToEntityId.delete(playerId);
                this.remoteRenderPos.delete(playerId);
                this.remotePlayerRootsByPlayerId.delete(playerId);
            }
        }
        // Apply changes from delta
        for (const entityDelta of delta.changedEntities) {
            const entityId = Number(entityDelta.id) as EntityId;
            if (this.currentState.localPlayerEntityId !== null && entityId === this.currentState.localPlayerEntityId) {
                if (entityDelta.health !== undefined || entityDelta.shield !== undefined) {
                    this.updateState({
                        health: entityDelta.health ?? this.currentState.health,
                        shield: entityDelta.shield ?? this.currentState.shield,
                    });
                }
                if (entityDelta.ammo !== undefined || entityDelta.isReloading !== undefined) {
                    this.updateState({
                        ammo: entityDelta.ammo ?? this.currentState.ammo,
                        isReloading: entityDelta.isReloading ?? this.currentState.isReloading,
                    });
                }
                if (entityDelta.isAlive !== undefined) {
                    this.updateState({ isDead: !entityDelta.isAlive });
                }
                continue;
            }
            const cached = this.entityTransforms.get(entityId);
            const position = entityDelta.position ?? cached?.position;
            const playerId = this.getPlayerIdForEntity(entityId);
            const lastRemote = playerId ? this.remotePoses.get(playerId) : undefined;
            const rotation = entityDelta.rotation ?? lastRemote?.rotation ?? cached?.rotation;
            const velocity = entityDelta.velocity ?? cached?.velocity;
            const isGrounded = entityDelta.isGrounded ?? cached?.isGrounded;
            if (playerId && position && rotation) {
                if (isGrounded !== undefined) {
                    this.remoteGroundedByPlayerId.set(playerId, isGrounded);
                }
                this.remotePoses.set(playerId, {
                    position,
                    rotation,
                    tick: delta.targetTick as unknown as Tick,
                });
                if (this.pendingPlayerDeaths.has(playerId)) {
                    const killerId = this.pendingPlayerDeaths.get(playerId) ?? null;
                    const killerEntityId = killerId ? this.getEntityIdForPlayerId(killerId) : null;
                    this.emitGameEvent({
                        type: 'player_died',
                        entityId,
                        killerId: killerEntityId ?? null,
                        weapon: 'smg',
                    });
                    this.pendingPlayerDeaths.delete(playerId);
                }
                this.pushRemotePose(playerId, position, rotation, delta.targetTick as unknown as Tick);
                continue;
            }
            if (position && rotation) {
                this.entityTransforms.set(entityId, { position, rotation, velocity, isGrounded });
                this.emitToGame({
                    type: 'entity_move',
                    entityId,
                    position,
                    rotation,
                    velocity,
                    isGrounded
                });
            }
        }
    }

    private updatePreRoundFromTick(serverTick: Tick): void {
        if (this.preRoundEndTick === null) return;
        const ticksLeft = Math.max(0, (this.preRoundEndTick as number) - (serverTick as number));
        const remainingSec = Math.ceil((ticksLeft * TICK_MS) / 1000);
        const wasActive = this.currentState.preRoundActive;
        this.updateState({
            preRoundActive: ticksLeft > 0,
            preRoundRemainingSec: remainingSec,
        });
        if (wasActive && ticksLeft <= 0) {
            this.preRoundEndTick = null;
        }
    }

    tickLocalPreRound(nowMs: number = performance.now()): void {
        if (!this.currentState.preRoundActive) return;
        if (this.preRoundEndTimeMs === null) return;
        const msLeft = Math.max(0, this.preRoundEndTimeMs - nowMs);
        const remainingSec = Math.ceil(msLeft / 1000);
        this.updateState({
            preRoundRemainingSec: remainingSec,
            preRoundActive: msLeft > 0,
        });
        if (msLeft <= 0) {
            this.preRoundEndTick = null;
            this.preRoundEndTimeMs = null;
        }
    }

    /**
     * Process input ack from server.
     */
    processInputAck(ack: InputAck): void {
        this.lastInputAck = {
            seq: ack.lastProcessedSequence,
            tick: ack.processedAtTick as unknown as Tick,
            timeMs: performance.now(),
        };
    }

    applyServerCorrection(position: Vector3): void {
        this.serverSelfPos = { x: position.x, y: position.y, z: position.z };
        this.serverCorrectionTarget = { x: position.x, y: position.y, z: position.z };
        if (this.localPlayerId) {
            this.lastServerPosByPlayerId.set(this.localPlayerId, {
                x: position.x,
                y: position.y,
                z: position.z,
                t: performance.now(),
            });
        }
        this.lastSnapshotTick = this.lastSnapshotTick ?? (0 as any);
        this.lastSnapshotTimeMs = performance.now();
    }

    getServerCorrectionTarget(): Vector3 | null {
        return this.serverCorrectionTarget
            ? { x: this.serverCorrectionTarget.x, y: this.serverCorrectionTarget.y, z: this.serverCorrectionTarget.z }
            : null;
    }

    clearServerCorrectionTarget(): void {
        this.serverCorrectionTarget = null;
    }

    /**
     * Show damage indicator.
     */
    showDamageIndicator(direction: Vector3, amount: number): void {
        this.emitToUI({ type: 'damage_indicator', direction, amount });
    }

    /**
     * Show hit marker.
     */
    showHitMarker(critical: boolean = false): void {
        this.emitToUI({ type: 'hit_marker', critical });
    }

    // =========================================================================
    // UI -> GAME (React calls these)
    // =========================================================================

    /**
     * Send event from UI to game.
     */
    sendToGame(event: UIToGameEvent): void {
        if (event.type === 'select_character') {
            this.updateState({ selectedCharacterModelId: event.characterModelId });
            if (this.localPlayerId) {
                this.selectedCharacterByPlayerId.set(this.localPlayerId, event.characterModelId);
                const localEntityId = this.playerIdToEntityId.get(this.localPlayerId);
                if (localEntityId !== undefined) {
                    this.entityCharacterModelIds.set(localEntityId as any, event.characterModelId);
                }
            }
        }
        this.emitToGame(event);
    }

    /**
     * Request respawn.
     */
    requestRespawn(): void {
        this.sendToGame({ type: 'request_respawn' });
    }

    /**
     * Set mouse sensitivity.
     */
    setSensitivity(value: number): void {
        this.sendToGame({ type: 'set_sensitivity', value });
    }

    /**
     * Set field of view.
     */
    setFOV(value: number): void {
        this.sendToGame({ type: 'set_fov', value });
    }

    // =========================================================================
    // EVENT SUBSCRIPTION
    // =========================================================================

    /**
     * Subscribe to game events (for React).
     */
    subscribeToGame(listener: GameEventListener): () => void {
        this.gameListeners.add(listener);
        return () => this.gameListeners.delete(listener);
    }

    /**
     * Subscribe to UI events (for game).
     */
    subscribeToUI(listener: UIEventListener): () => void {
        this.uiListeners.add(listener);
        return () => this.uiListeners.delete(listener);
    }

    /**
     * Emit event to UI listeners.
     */
    private emitToUI(event: GameToUIEvent): void {
        for (const listener of this.gameListeners) {
            try {
                listener(event);
            } catch (e) {
                console.error('GameBridge: Error in UI listener', e);
            }
        }
    }

    /**
     * Emit event to game listeners.
     */
    private emitToGame(event: UIToGameEvent): void {
        for (const listener of this.uiListeners) {
            try {
                listener(event);
            } catch (e) {
                console.error('GameBridge: Error in game listener', e);
            }
        }
    }

    getRemoteInterpolatedEntities(
        nowMs: number,
        delayTicks: number = 4
    ): Map<EntityId, { position: Vector3; rotation: Quaternion; isGrounded?: boolean }> {
        const out = this.interpolatedEntitiesOut;
        const seen = this.interpolatedEntitiesSeen;
        seen.clear();
        const hasServerTiming = this.lastSnapshotTick !== null && this.lastSnapshotTimeMs !== null;
        const estimatedServerTick = hasServerTiming
            ? (this.lastSnapshotTick as number) + (nowMs - (this.lastSnapshotTimeMs as number)) / TICK_MS
            : null;
        const renderTick = estimatedServerTick !== null ? estimatedServerTick - delayTicks : null;
        const renderTime = nowMs - delayTicks * TICK_MS;
        let maxExtrapolationMs = 0;

        for (const [playerId, buffer] of this.remotePoseBuffers) {
            const entityId = this.playerIdToEntityId.get(playerId);
            if (!entityId || buffer.length === 0) continue;

            const pose = interpolatePoseSamples(buffer, renderTime, renderTick ?? undefined);
            if (!pose) continue;
            const latest = buffer[buffer.length - 1];
            if (latest) {
                const extrapMs = Math.max(0, renderTime - latest.t);
                if (extrapMs > maxExtrapolationMs) maxExtrapolationMs = extrapMs;
            }

            const position = { x: pose.x, y: pose.y, z: pose.z };
            const rotation = { x: pose.qx, y: pose.qy, z: pose.qz, w: pose.qw };
            const isGrounded = this.remoteGroundedByPlayerId.get(playerId);

            this.remoteRenderPos.set(playerId, position);

            const nextOut: { position: Vector3; rotation: Quaternion; isGrounded?: boolean } = {
                position,
                rotation,
            };
            if (isGrounded !== undefined) {
                nextOut.isGrounded = isGrounded;
            }
            out.set(entityId, nextOut);
            seen.add(entityId);
        }

        for (const entityId of out.keys()) {
            if (!seen.has(entityId)) {
                out.delete(entityId);
            }
        }

        this.lastRemoteExtrapolationMs = maxExtrapolationMs;
        return out;
    }

    getNetInterpolationStats(): { extrapolationMs: number } {
        return {
            extrapolationMs: this.lastRemoteExtrapolationMs,
        };
    }

    private pushRemotePose(playerId: PlayerId, position: Vector3, rotation: Quaternion, serverTick?: Tick, velocity?: Vector3): void {
        if (this.localPlayerId && playerId === this.localPlayerId) return;
        const now = performance.now();
        const buffer = this.remotePoseBuffers.get(playerId) ?? [];
        const prev = buffer.length > 0 ? buffer[buffer.length - 1] : null;
        const derivedVx = prev ? (position.x - prev.x) / Math.max(1e-3, (now - prev.t) / 1000) : 0;
        const derivedVy = prev ? (position.y - prev.y) / Math.max(1e-3, (now - prev.t) / 1000) : 0;
        const derivedVz = prev ? (position.z - prev.z) / Math.max(1e-3, (now - prev.t) / 1000) : 0;
        const sample: PoseSample = {
            t: now,
            x: position.x,
            y: position.y,
            z: position.z,
            qx: rotation.x,
            qy: rotation.y,
            qz: rotation.z,
            qw: rotation.w,
            vx: velocity?.x ?? derivedVx,
            vy: velocity?.y ?? derivedVy,
            vz: velocity?.z ?? derivedVz,
        };
        if (serverTick !== undefined) {
            sample.serverTick = serverTick as unknown as number;
        }
        buffer.push(sample);
        if (buffer.length > GameBridge.REMOTE_POSE_BUFFER_MAX) {
            buffer.splice(0, buffer.length - GameBridge.REMOTE_POSE_BUFFER_MAX);
        }
        this.remotePoseBuffers.set(playerId, buffer);
    }

    private getPlayerIdForEntity(entityId: EntityId): PlayerId | null {
        for (const [playerId, mappedEntityId] of this.playerIdToEntityId) {
            if (mappedEntityId === entityId) return playerId;
        }
        return null;
    }

    getDebugNetState(): any {
        const out: any = {};
        out.localPlayerId = this.localPlayerId;
        out.localRender = this.localRenderPos
            ? { x: this.localRenderPos.x, y: this.localRenderPos.y, z: this.localRenderPos.z }
            : null;
        out.localRenderPos = out.localRender;
        out.remotes = {};
        for (const [id, root] of this.remotePlayerRootsByPlayerId) {
            out.remotes[id] = { x: root.position.x, y: root.position.y, z: root.position.z };
        }
        out.remoteRenderPos = new Map(this.remoteRenderPos);
        out.lastServerPosByPlayerId = new Map(this.lastServerPosByPlayerId);
        return out;
    }

    /**
     * Cleanup.
     */
    dispose(): void {
        this.gameListeners.clear();
        this.uiListeners.clear();
    }
}

type PoseSample = {
    t: number;
    x: number;
    y: number;
    z: number;
    qx: number;
    qy: number;
    qz: number;
    qw: number;
    vx?: number;
    vy?: number;
    vz?: number;
    serverTick?: number;
    serverT?: number;
};

function interpolatePoseSamples(samples: PoseSample[], renderTime: number, renderTick?: number): PoseSample | null {
    if (samples.length === 0) return null;
    const first = samples[0];
    const last = samples[samples.length - 1];
    if (!first || !last) return null;

    if (renderTick !== undefined) {
        let firstTickSample: PoseSample | null = null;
        let lastTickSample: PoseSample | null = null;

        for (const sample of samples) {
            if (sample.serverTick === undefined) continue;
            if (!firstTickSample) firstTickSample = sample;
            lastTickSample = sample;
        }

        if (firstTickSample && lastTickSample) {
            if (renderTick <= (firstTickSample.serverTick as number)) {
                return firstTickSample;
            }
            if (renderTick >= (lastTickSample.serverTick as number)) {
                return lastTickSample;
            }

            let prev: PoseSample | null = null;
            for (const sample of samples) {
                if (sample.serverTick === undefined) continue;
                if (!prev) {
                    prev = sample;
                    continue;
                }
                const a = prev;
                const b = sample;
                const aTick = a.serverTick as number;
                const bTick = b.serverTick as number;
                if (renderTick >= aTick && renderTick <= bTick) {
                    const span = bTick - aTick;
                    const alpha = span > 0 ? (renderTick - aTick) / span : 0;
                    const slerped = quatSlerp(a, b, alpha);
                    return {
                        t: renderTime,
                        x: lerp(a.x, b.x, alpha),
                        y: lerp(a.y, b.y, alpha),
                        z: lerp(a.z, b.z, alpha),
                        qx: slerped.qx,
                        qy: slerped.qy,
                        qz: slerped.qz,
                        qw: slerped.qw,
                        serverTick: a.serverTick,
                    };
                }
                prev = sample;
            }
        }
    }

    if (renderTime <= first.t) {
        return first;
    }
    if (renderTime >= last.t) {
        const dtMs = renderTime - last.t;
        if (dtMs <= 120) {
            const dt = dtMs / 1000;
            return {
                ...last,
                t: renderTime,
                x: last.x + (last.vx ?? 0) * dt,
                y: last.y + (last.vy ?? 0) * dt,
                z: last.z + (last.vz ?? 0) * dt,
            };
        }
        return last;
    }

    for (let i = 0; i < samples.length - 1; i++) {
        const a = samples[i];
        const b = samples[i + 1];
        if (!a || !b) continue;
        if (renderTime >= a.t && renderTime <= b.t) {
            const span = b.t - a.t;
            const alpha = span > 0 ? (renderTime - a.t) / span : 0;
            const slerped = quatSlerp(a, b, alpha);
            return {
                t: renderTime,
                x: lerp(a.x, b.x, alpha),
                y: lerp(a.y, b.y, alpha),
                z: lerp(a.z, b.z, alpha),
                qx: slerped.qx,
                qy: slerped.qy,
                qz: slerped.qz,
                qw: slerped.qw,
            };
        }
    }

    return last;
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function quatSlerp(a: PoseSample, b: PoseSample, t: number): { qx: number; qy: number; qz: number; qw: number } {
    let dot = a.qx * b.qx + a.qy * b.qy + a.qz * b.qz + a.qw * b.qw;

    let bx = b.qx;
    let by = b.qy;
    let bz = b.qz;
    let bw = b.qw;
    if (dot < 0) {
        dot = -dot;
        bx = -bx;
        by = -by;
        bz = -bz;
        bw = -bw;
    }

    if (dot > 0.9995) {
        const qx = lerp(a.qx, bx, t);
        const qy = lerp(a.qy, by, t);
        const qz = lerp(a.qz, bz, t);
        const qw = lerp(a.qw, bw, t);
        const len = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw) || 1;
        return { qx: qx / len, qy: qy / len, qz: qz / len, qw: qw / len };
    }

    const theta = Math.acos(dot);
    const sinTheta = Math.sin(theta);
    const wa = Math.sin((1 - t) * theta) / sinTheta;
    const wb = Math.sin(t * theta) / sinTheta;

    return {
        qx: a.qx * wa + bx * wb,
        qy: a.qy * wa + by * wb,
        qz: a.qz * wa + bz * wb,
        qw: a.qw * wa + bw * wb,
    };
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/** Global game bridge instance */
let bridgeInstance: GameBridge | null = null;

/**
 * Get or create the game bridge instance.
 */
export function getGameBridge(): GameBridge {
    if (!bridgeInstance) {
        bridgeInstance = new GameBridge();
    }
    return bridgeInstance;
}

/**
 * Create a new game bridge (replaces existing).
 */
export function createGameBridge(): GameBridge {
    if (bridgeInstance) {
        bridgeInstance.dispose();
    }
    bridgeInstance = new GameBridge();
    return bridgeInstance;
}
