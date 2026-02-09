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
    TeamId,
    GameEvent,
    Vector3,
    Quaternion,
    LobbyState,
} from '@snapshot/shared';
import type { InputAck, Tick } from '@snapshot/shared/simulation';
import { TICK_MS } from '@snapshot/shared/simulation';

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
export type GameToUIEvent =
    | { type: 'state_update'; state: Partial<UIGameState> }
    | { type: 'game_event'; event: GameEvent }
    | { type: 'connected' }
    | { type: 'disconnected' }
    | { type: 'match_start' }
    | { type: 'wager_lock'; matchId: string; wagerAmountSol: number; opponentWallet?: string; lockRole?: 'init' | 'join' }
    | { type: 'match_end'; winningTeam: TeamId }
    | { type: 'kill_feed'; entry: KillFeedEntry }
    | { type: 'damage_indicator'; direction: Vector3; amount: number }
    | { type: 'hit_marker'; critical: boolean }
    | { type: 'lobby_update'; state: import('@snapshot/shared').LobbyState }
    | { type: 'game_message'; message: string; severity?: 'info' | 'error' | 'success' | 'warning' };

/** Events from UI to game */
export type UIToGameEvent =
    | { type: 'request_respawn' }
    | { type: 'set_sensitivity'; value: number }
    | { type: 'set_fov'; value: number }
    | { type: 'pause_game' }
    | { type: 'resume_game' }
    | { type: 'quit_match' }
    | { type: 'join_queue'; mode: string; ruleset: string; wagerAmountSol?: number }
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
    private interpolatedEntitiesOut: Map<EntityId, { position: Vector3; rotation: Quaternion; isGrounded?: boolean }> = new Map();
    private serverCorrectionTarget: Vector3 | null = null;
    private pendingPlayerDeaths: Map<PlayerId, PlayerId | null> = new Map();
    private lastKillFeedKey: string | null = null;
    private lastKillFeedAt = 0;

    private static readonly REMOTE_POSE_BUFFER_MAX = 10;

    // Match data received from server (spawn positions, opponents)
    private matchData: {
        spawnPosition?: { x: number; y: number; z: number };
        opponent?: string;
        opponentSpawnPosition?: { x: number; y: number; z: number } | null;
        allPlayers?: { playerId: string; spawnPosition: { x: number; y: number; z: number } }[];
    } | null = null;
    private lastSnapshotTick: import('@snapshot/shared/simulation').Tick | null = null;
    private lastSnapshotTimeMs: number | null = null;
    private lastInputAck: { seq: number; tick: Tick; timeMs: number } | null = null;

    private currentState: UIGameState = {
        isRunning: false,
        isConnected: false,
        localPlayerEntityId: null,
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
        ping: 0,
        isAiming: false,
        isDead: false,
        respawnTimeRemaining: 0,
        isGameOver: false,
        winnerName: null,
    };
    private lobbyState: LobbyState | null = null;

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

    processNetPose(event: { type: 'net_pose'; playerId: PlayerId; position: Vector3; rotation?: Quaternion; tick: Tick }): void {
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
        this.remotePoses.set(event.playerId, {
            position: event.position,
            rotation: event.rotation,
            tick: event.tick,
        });
        this.serverRemotePos.set(event.playerId, { x: event.position.x, y: event.position.y, z: event.position.z });
        this.lastServerPosByPlayerId.set(event.playerId, {
            x: event.position.x,
            y: event.position.y,
            z: event.position.z,
            t: performance.now(),
        });
        this.ensureRemoteRoot(event.playerId, event.position);
        this.pushRemotePose(event.playerId, event.position, event.rotation ?? { x: 0, y: 0, z: 0, w: 1 }, event.tick);
        this.cleanupRemoteRoots();
    }

    private worldToRenderPos(position?: Vector3, isLocal: boolean = false): Vector3 | undefined {
        if (!position) return undefined;
        return { x: position.x, y: position.y, z: position.z };
    }

    worldToRenderPosPublic(position?: Vector3, isLocal: boolean = false): Vector3 | undefined {
        return this.worldToRenderPos(position, isLocal);
    }


    // =========================================================================
    // GAME -> UI (Game calls these)
    // =========================================================================

    /**
     * Update game state and notify UI.
     */
    updateState(partial: Partial<UIGameState>): void {
        this.currentState = {
            ...this.currentState,
            ...partial,
        };

        this.emitToUI({ type: 'state_update', state: partial });
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
    emitGameEvent(event: GameEvent): void {
        this.emitToUI({ type: 'game_event', event });

        // Handle specific events (non-killfeed logic only)
    }

    /**
     * Notify UI of connection.
     */
    notifyConnected(): void {
        this.updateState({ isConnected: true });
        this.emitToUI({ type: 'connected' });
    }

    /**
     * Notify UI of disconnection.
     */
    notifyDisconnected(): void {
        this.updateState({ isConnected: false, isRunning: false });
        this.entityTransforms.clear();
        this.remotePoseBuffers.clear();
        this.remoteGroundedByPlayerId.clear();
        this.playerIdToEntityId.clear();
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
        opponent?: string;
        opponentSpawnPosition?: { x: number; y: number; z: number } | null;
        allPlayers?: { playerId: string; spawnPosition: { x: number; y: number; z: number } }[];
    }): void {
        // Store match data for use by initializeGame
        if (data) {
            this.matchData = data;
        }
        this.entityTransforms.clear();
        this.remotePoseBuffers.clear();
        this.remoteGroundedByPlayerId.clear();
        this.playerIdToEntityId.clear();
        this.lastSnapshotTick = null;
        this.lastSnapshotTimeMs = null;
        this.lastInputAck = null;
        this.updateState({ isRunning: true });
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
        this.serverCorrectionTarget = null;
        this.serverSelfPos = null;
        this.serverSelfRot = null;
        this.lastSnapshotTick = null;
        this.lastSnapshotTimeMs = null;
        this.lastInputAck = null;
        this.localPlayerId = null;
    }

    notifyWagerLock(matchId: string, wagerAmountSol: number, opponentWallet?: string, lockRole?: 'init' | 'join'): void {
        this.emitToUI({ type: 'wager_lock', matchId, wagerAmountSol, opponentWallet, lockRole });
    }

    /**
     * Process a full world snapshot from server.
     */
    processSnapshot(snapshot: import('@snapshot/shared/simulation').Snapshot): void {
        this.lastSnapshotTick = snapshot.tick;
        this.lastSnapshotTimeMs = performance.now();
        this.resolveLocalEntityId(snapshot);

        // Here we could perform reconciliation if we had a local simulation.
        // For now, we update the UI/Renderer with entity positions.
        for (const entity of snapshot.entities) {
            const entityId = Number(entity.id);
            const playerId = entity.player?.playerId;
            if (playerId) {
                this.playerIdToEntityId.set(playerId, entityId as any);
            }
            if (this.localPlayerId && playerId === this.localPlayerId) {
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
                    this.lastServerPosByPlayerId.set(playerId, {
                        x: entity.transform.position.x,
                        y: entity.transform.position.y,
                        z: entity.transform.position.z,
                        t: performance.now(),
                    });
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
                this.remotePoses.set(playerId, {
                    position: entity.transform.position,
                    rotation: entity.transform.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
                    tick: snapshot.tick,
                });
                if (entity.physics?.isGrounded !== undefined) {
                    this.remoteGroundedByPlayerId.set(playerId, entity.physics.isGrounded);
                }
                this.lastServerPosByPlayerId.set(playerId, {
                    x: entity.transform.position.x,
                    y: entity.transform.position.y,
                    z: entity.transform.position.z,
                    t: performance.now(),
                });
                this.ensureRemoteRoot(playerId, entity.transform.position);
                this.pushRemotePose(
                    playerId,
                    entity.transform.position,
                    entity.transform.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
                    snapshot.tick
                );
                if (this.pendingPlayerDeaths.has(playerId)) {
                    const killerId = this.pendingPlayerDeaths.get(playerId) ?? null;
                    const killerEntityId = killerId ? this.getEntityIdForPlayerId(killerId) : null;
                    this.emitGameEvent({
                        type: 'player_died',
                        entityId: entityId as any,
                        killerId: killerEntityId ?? null,
                        weapon: 'smg',
                    });
                    this.pendingPlayerDeaths.delete(playerId);
                }
                continue;
            }
            const position = this.worldToRenderPos(entity.transform?.position ?? { x: 0, y: 0, z: 0 }, false);
            const rotation = entity.transform?.rotation ?? { x: 0, y: 0, z: 0, w: 1 };
            const velocity = entity.physics?.velocity;
            const isGrounded = entity.physics?.isGrounded;
            this.entityTransforms.set(entityId as any, { position, rotation, velocity, isGrounded });
            this.emitToGame({
                type: 'entity_move',
                entityId: entityId as any,
                position,
                rotation,
                velocity,
                isGrounded,
                lastProcessedInputTick: entity.player?.lastProcessedInputTick
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
            let best = snapshot.entities[0];
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
            resolvedEntityId = Number(best.id) as any;
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
        for (const removedId of delta.removedEntityIds) {
            this.entityTransforms.delete(removedId as any);
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
            if (this.currentState.localPlayerEntityId !== null && entityDelta.id === this.currentState.localPlayerEntityId) {
                if (entityDelta.health) {
                    this.updateState({
                        health: entityDelta.health.health ?? this.currentState.health,
                        shield: entityDelta.health.shield ?? this.currentState.shield,
                    });
                }
                if (entityDelta.weapon) {
                    this.updateState({
                        ammo: entityDelta.weapon.ammo ?? this.currentState.ammo,
                        isReloading: entityDelta.weapon.isReloading ?? this.currentState.isReloading,
                    });
                }
                if (entityDelta.player?.isAlive !== undefined) {
                    this.updateState({ isDead: !entityDelta.player.isAlive });
                }
                continue;
            }
            const cached = this.entityTransforms.get(entityDelta.id as any);
            const position = entityDelta.position ?? cached?.position;
            const playerId = this.getPlayerIdForEntity(entityDelta.id as any);
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
                    tick: delta.targetTick,
                });
                if (this.pendingPlayerDeaths.has(playerId)) {
                    const killerId = this.pendingPlayerDeaths.get(playerId) ?? null;
                    const killerEntityId = killerId ? this.getEntityIdForPlayerId(killerId) : null;
                    this.emitGameEvent({
                        type: 'player_died',
                        entityId: entityDelta.id as any,
                        killerId: killerEntityId ?? null,
                        weapon: 'smg',
                    });
                    this.pendingPlayerDeaths.delete(playerId);
                }
                this.pushRemotePose(playerId, position, rotation, delta.targetTick);
                continue;
            }
            if (position && rotation) {
                this.entityTransforms.set(entityDelta.id as any, { position, rotation, velocity, isGrounded });
                this.emitToGame({
                    type: 'entity_move',
                    entityId: entityDelta.id as any,
                    position,
                    rotation,
                    velocity,
                    isGrounded
                });
            }
        }
    }

    /**
     * Process input ack from server.
     */
    processInputAck(ack: InputAck): void {
        this.lastInputAck = {
            seq: ack.lastProcessedSequence,
            tick: ack.processedAtTick,
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
        out.clear();
        const hasServerTiming = this.lastSnapshotTick !== null && this.lastSnapshotTimeMs !== null;
        const estimatedServerTick = hasServerTiming
            ? (this.lastSnapshotTick as number) + (nowMs - (this.lastSnapshotTimeMs as number)) / TICK_MS
            : null;
        const renderTick = estimatedServerTick !== null ? estimatedServerTick - delayTicks : null;
        const renderTime = nowMs - delayTicks * TICK_MS;

        for (const [playerId, buffer] of this.remotePoseBuffers) {
            const entityId = this.playerIdToEntityId.get(playerId);
            if (!entityId || buffer.length === 0) continue;

            const pose = interpolatePoseSamples(buffer, renderTime, renderTick ?? undefined);
            if (!pose) continue;

            const position = { x: pose.x, y: pose.y, z: pose.z };
            const rotation = { x: pose.qx, y: pose.qy, z: pose.qz, w: pose.qw };
            const isGrounded = this.remoteGroundedByPlayerId.get(playerId);

            this.remoteRenderPos.set(playerId, position);
            out.set(entityId as any, { position, rotation, isGrounded });
        }

        return out;
    }

    private pushRemotePose(playerId: PlayerId, position: Vector3, rotation: Quaternion, serverTick?: Tick): void {
        if (this.localPlayerId && playerId === this.localPlayerId) return;
        const now = performance.now();
        const buffer = this.remotePoseBuffers.get(playerId) ?? [];
        buffer.push({
            t: now,
            x: position.x,
            y: position.y,
            z: position.z,
            qx: rotation.x,
            qy: rotation.y,
            qz: rotation.z,
            qw: rotation.w,
            serverTick,
        });
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
    serverTick?: number;
    serverT?: number;
};

function interpolatePoseSamples(samples: PoseSample[], renderTime: number, renderTick?: number): PoseSample | null {
    if (samples.length === 0) return null;

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

    if (renderTime <= samples[0].t) {
        return samples[0];
    }
    const last = samples[samples.length - 1];
    if (renderTime >= last.t) {
        return last;
    }

    for (let i = 0; i < samples.length - 1; i++) {
        const a = samples[i];
        const b = samples[i + 1];
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
