import { getGameBridge, type GameBridge } from '../bridge/GameBridge';
import {
    BinaryMessageType,
    deserializeServerMessage,
    normalizeBinaryData,
    serializeClientMessage,
    type ClientMessage,
    type ServerMessage,
    unwrapBinaryMessage,
    wrapBinaryMessage,
} from '@snapshot/shared';
import type { LobbyState } from '@snapshot/shared';
import { serializeInput, type InputFrame } from '@snapshot/shared/simulation';
import { createSocketIoGameTransport, type GameTransport } from './transport/GameTransport';

export class GameClient {
    private channel: GameTransport;
    private bridge: GameBridge;
    private walletPublicKey: string | null = null;
    private walletDisplayName: string | null = null;
    private lastAppliedServerTick: number | null = null;
    private warnedStorageCollision = false;
    private matchEndTimeout: number | null = null;

    constructor() {
        this.bridge = getGameBridge();

        // Use same-origin in production. Override with VITE_SERVER_URL when needed.
        const configuredServerUrl = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
        const devServerPort = (import.meta.env.VITE_SERVER_PORT as string | undefined)?.trim() || '10000';
        const devFallbackUrl =
            import.meta.env.DEV && !configuredServerUrl
                ? `${window.location.protocol}//${window.location.hostname}:${devServerPort}`
                : undefined;
        const socketUrl = configuredServerUrl || devFallbackUrl;
        const socketOptions = {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 500,
            reconnectionDelayMax: 5000,
            timeout: 20000,
        };

        this.channel = createSocketIoGameTransport(socketUrl, socketOptions);

        // Setup bridge listeners (UI -> Game)
        this.setupBridgeListeners();

        // Setup network handlers immediately so we never miss connect events
        this.setupNetworkHandlers();
        // Binary handlers use dynamic import; fire and forget
        void this.setupBinaryHandlers();

        window.addEventListener('storage', (event) => {
            if (this.warnedStorageCollision) return;
            if (event.key === 'localPlayerId' && event.newValue && event.newValue === this.channel.id) {
                console.warn('GameClient: localPlayerId seen in localStorage; use per-tab identity to avoid visibility issues.');
                this.warnedStorageCollision = true;
            }
        });
    }

    private setupBridgeListeners(): void {
        this.bridge.subscribeToUI((event) => {
            switch (event.type) {
                case 'join_queue':
                    this.channel.emit('join_queue', {
                        mode: event.mode,
                        walletKey: this.walletPublicKey,
                        displayName: this.walletDisplayName,
                        ruleset: event.ruleset,
                        wagerAmountSol: event.wagerAmountSol
                    });
                    break;
                case 'wager_locked':
                    this.channel.emit('wager_locked', { matchId: event.matchId });
                    break;
                case 'leave_queue':
                    this.channel.emit('leave_queue', {});
                    break;
                case 'quit_match':
                    // Verify if we need to send this or if server handles disconnect
                    this.channel.emit('leave_match', {});
                    // Force disconnect/reconnect for clean state?
                    break;
            }
        });
    }

    /**
     * Connect to the game server.
     */
    async connect(walletPublicKey: string, displayName: string): Promise<void> {
        this.walletPublicKey = walletPublicKey;
        this.walletDisplayName = displayName;

        if (!this.channel.connected) {
            this.channel.connect();
        }

        // If we are already connected, send auth + lobby request immediately.
        const isConnected = this.channel.connected;
        if (isConnected) {
            this.emitAuthAndLobbyRequest();
        }
    }

    /**
     * Disconnect from server.
     */
    disconnect(): void {
        this.channel.disconnect();
    }

    private setupNetworkHandlers(): void {
        this.channel.on('connect', () => {
            console.log('GameClient: Connected to server');
            this.bridge.notifyConnected();
            this.lastAppliedServerTick = null;
            if (this.channel.id) {
                this.bridge.setLocalPlayerId(this.channel.id);
            }

            this.emitAuthAndLobbyRequest();
        });

        this.channel.on('connect_error', (error) => {
            console.error('GameClient: Connection error', error);
            console.warn('GameClient: Check VITE_SERVER_URL or ensure backend is reachable.');
            this.bridge.notifyDisconnected();
        });

        this.channel.on('disconnect', (reason) => {
            console.log('GameClient: Disconnected');
            if (reason) {
                console.warn('GameClient: Disconnect reason:', reason);
            }
            this.bridge.notifyDisconnected();
            this.lastAppliedServerTick = null;
        });

        // --- MESSAGE HANDLERS ---
        this.channel.on('lobby_state', (data: any) => {
            console.log('GameClient: Received lobby state', data);
            this.bridge.updateLobbyState(data as LobbyState);
        });

        this.channel.on('game_message', (data: any) => {
            // data matches format sent by server: { type: 'opponent_left', message: '...' }
            // or generic message object
            if (data.type === 'opponent_left') {
                this.bridge.notifyGameMessage(data.message || 'Opponent disconnected', 'warning');
            } else {
                const severity = data.severity ?? (data.type === 'error' || data.type === 'success' || data.type === 'warning' ? data.type : 'info');
                this.bridge.notifyGameMessage(data.message, severity);
            }
        });

        this.channel.on('match_found', (data: any) => {
            console.log('GameClient: Match found', data);
            if (data?.ruleset === 'wager' && typeof data?.wagerAmountSol === 'number') {
                this.bridge.notifyWagerLock(data.matchId, data.wagerAmountSol, data.opponentWallet, data.lockRole);
            }
            // Trigger game start logic if needed, or rely on lobby state change
        });

        this.channel.on('match_start', (data: any) => {
            console.log('GameClient: Match starting!', data);
            // Notify bridge that game should start with spawn positions
            this.bridge.notifyMatchStart(data);
        });

        this.channel.on('server_correction', (data: any) => {
            if (!data || !data.position) return;
            this.bridge.applyServerCorrection(data.position);
        });
    }

    private async setupBinaryHandlers(): Promise<void> {
        // --- BINARY MESSAGE HANDLERS ---
        const { deserializeSnapshot, deserializeDelta, serializeInputAck, deserializeInputAck } = await import('@snapshot/shared/simulation');

        this.channel.on('bin', (data: any) => {
            const buffer = normalizeBinaryData(data);
            if (!buffer) return;

            const legacyJsonMessage = new Uint8Array(buffer)[0] === 123;
            if (legacyJsonMessage) {
                try {
                    this.handleServerMessage(deserializeServerMessage(buffer) as ServerMessage);
                } catch (e) {
                    console.error('GameClient: Failed to handle legacy server message', e);
                }
                return;
            }

            let type = 0;
            let payload: ArrayBuffer = buffer;
            try {
                const decoded = unwrapBinaryMessage(buffer);
                type = decoded.type;
                payload = decoded.payload;
            } catch (e) {
                console.error('GameClient: Failed to decode binary message envelope', e);
                return;
            }

            switch (type) {
                case BinaryMessageType.Snapshot: {
                    try {
                        const snapshot = deserializeSnapshot(payload);
                        const serverTick = (snapshot as any).tick as number | undefined;
                        if (serverTick !== undefined && this.lastAppliedServerTick !== null && serverTick <= this.lastAppliedServerTick) {
                            break;
                        }
                        if (serverTick !== undefined) {
                            this.lastAppliedServerTick = serverTick;
                        }
                        this.bridge.processSnapshot(snapshot as any);

                        // Ack the snapshot
                        const ackData = serializeInputAck({
                            lastProcessedSequence: 0,
                            processedAtTick: snapshot.tick,
                            serverTime: Date.now()
                        });
                        this.channel.emit('bin', wrapBinaryMessage(BinaryMessageType.InputAck, ackData));
                    } catch (e) {
                        console.error('GameClient: Failed to handle snapshot', e);
                    }
                    break;
                }
                case BinaryMessageType.Delta: {
                    try {
                        const delta = deserializeDelta(payload);
                        const serverTick = (delta as any).targetTick as number | undefined;
                        if (serverTick !== undefined && this.lastAppliedServerTick !== null && serverTick <= this.lastAppliedServerTick) {
                            break;
                        }
                        if (serverTick !== undefined) {
                            this.lastAppliedServerTick = serverTick;
                        }
                        this.bridge.processDelta(delta as any);
                    } catch (e) {
                        console.error('GameClient: Failed to handle delta', e);
                    }
                    break;
                }
                case BinaryMessageType.InputAck: {
                    try {
                        const ack = deserializeInputAck(payload);
                        this.bridge.processInputAck(ack as any);
                    } catch (e) {
                        console.error('GameClient: Failed to handle input ack', e);
                    }
                    break;
                }
                case BinaryMessageType.ServerEvent: {
                    try {
                        const message = deserializeServerMessage(payload) as ServerMessage;
                        this.handleServerMessage(message);
                    } catch (e) {
                        console.error('GameClient: Failed to handle server event', e);
                    }
                    break;
                }
            }
        });
    }

    private handleServerMessage(message: ServerMessage): void {
        if (message.type === 'event') {
            if (message.event?.type === 'net_pose') {
                this.bridge.processNetPose(message.event as any);
                return;
            }

            if (message.event?.type === 'player_spawned') {
                const localEntityId = this.bridge.getState().localPlayerEntityId;
                if (localEntityId && message.event.entityId === localEntityId) {
                    this.bridge.updateState({ isDead: false, respawnTimeRemaining: 0 });
                }
            }

            this.bridge.emitGameEvent(message.event as any);
        } else if (message.type === 'damage_applied') {
            const localId = this.channel.id;
            if (message.attackerId === localId) {
                this.bridge.showHitMarker(false);
            }
            const isLocalTarget = message.targetId === localId;
            if (message.targetId === localId) {
                const isDead = message.healthAfter <= 0;
                this.bridge.updateState({
                    health: message.healthAfter,
                    isDead,
                    respawnTimeRemaining: isDead ? 3 : this.bridge.getState().respawnTimeRemaining,
                });
            }

            const targetEntityId = this.bridge.getEntityIdForPlayerId(message.targetId as any);
            const attackerEntityId = this.bridge.getEntityIdForPlayerId(message.attackerId as any);
            if (targetEntityId && !isLocalTarget) {
                this.bridge.emitGameEvent({
                    type: 'damage_taken',
                    targetId: targetEntityId as any,
                    direction: { x: 0, y: 0, z: 0 },
                    damage: message.amount,
                    remainingHealth: message.healthAfter,
                    remainingShield: 0,
                });
            }
            if (attackerEntityId && targetEntityId) {
                this.bridge.emitGameEvent({
                    type: 'damage_dealt',
                    targetId: targetEntityId as any,
                    sourceId: attackerEntityId as any,
                    amount: message.amount,
                    weapon: 'smg',
                });
            }
        } else if (message.type === 'player_died') {
            const localId = this.channel.id;
            if (message.killerId === localId) {
                this.bridge.updateState({ kills: this.bridge.getState().kills + 1 });
            }
            if (message.victimId === localId) {
                this.bridge.updateState({ deaths: this.bridge.getState().deaths + 1, isDead: true, respawnTimeRemaining: 3 });
            }
            this.bridge.addKillFeedByPlayerIds(message.killerId as any, message.victimId as any, 'smg');
            this.bridge.emitPlayerDeathByPlayerId(message.victimId as any, message.killerId as any);
        } else if (message.type === 'score_update') {
            const localId = this.channel.id;
            const localKills = localId ? (message.scores[localId] ?? this.bridge.getState().kills) : this.bridge.getState().kills;
            const opponentId = this.bridge.getMatchData()?.opponent;
            const opponentKills = opponentId ? (message.scores[opponentId] ?? 0) : 0;
            this.bridge.updateState({
                kills: localKills,
                teamScores: { 1: localKills, 2: opponentKills },
            });
        } else if (message.type === 'match_ended') {
            this.bridge.updateState({
                isGameOver: true,
                winnerName: message.winnerId,
            });
            if (this.matchEndTimeout) {
                window.clearTimeout(this.matchEndTimeout);
            }
            this.matchEndTimeout = window.setTimeout(() => {
                this.channel.emit('leave_match', {});
                this.bridge.updateState({ isRunning: false });
                this.matchEndTimeout = null;
            }, 5000);
        }
    }

    private emitAuthAndLobbyRequest(): void {
        if (!this.walletPublicKey) {
            console.warn('GameClient: Wallet public key not set yet; skipping auth.');
            return;
        }

        // Authenticate with wallet
        this.channel.emit('auth', { publicKey: this.walletPublicKey, displayName: this.walletDisplayName });

        // Request initial lobby state
        this.channel.emit('get_lobby_state', {});
    }

    sendInput(input: InputFrame): void {
        const isConnected = this.channel.connected;
        if (!this.channel || !isConnected) return;

        const inputData: ArrayBuffer = serializeInput(input);
        this.channel.emit('bin', wrapBinaryMessage(BinaryMessageType.Input, inputData));
    }

    sendPose(pose: { position: { x: number; y: number; z: number }; velocity?: { x: number; y: number; z: number }; rotation?: { x: number; y: number; z: number; w: number }; isGrounded?: boolean; timeMs?: number }): void {
        const isConnected = this.channel.connected;
        if (!this.channel || !isConnected) return;
        this.channel.emit('pose', pose);
    }

    sendShoot(shot: { shotId: string; origin: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number }; time: number; weaponId?: string }): void {
        const isConnected = this.channel.connected;
        if (!this.channel || !isConnected) return;
        const msg: ClientMessage = {
            type: 'shoot',
            shotId: shot.shotId,
            origin: shot.origin,
            dir: shot.dir,
            time: shot.time,
            ...(shot.weaponId ? { weaponId: shot.weaponId } : {}),
        };
        const payload = serializeClientMessage(msg);
        this.channel.emit('bin', wrapBinaryMessage(BinaryMessageType.ClientEvent, payload));
    }
}

/** Global game client instance */
let clientInstance: GameClient | null = null;

export function getGameClient(): GameClient {
    if (!clientInstance) {
        clientInstance = new GameClient();
    }
    return clientInstance;
}
