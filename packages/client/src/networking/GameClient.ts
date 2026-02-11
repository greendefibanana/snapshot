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
import { serializeInput, tick, type InputFrame } from '@snapshot/shared/simulation';
import { createSocketIoGameTransport, type GameTransport } from './transport/GameTransport';
import { PeerTransport } from './transport/PeerTransport';
import {
    P2P,
    createPingPayload,
    createPongPayload,
    readP2PPacket,
    wrapP2PAck,
    wrapP2PClientEvent,
    wrapP2PInput,
    wrapP2PServerEvent,
    type P2PMatchState,
    type P2PPlayerState,
} from './p2p/P2PProtocol';

type TransportMode = 'socket' | 'p2p_host' | 'p2p_joiner';
type P2PPhase = 'idle' | 'hosting' | 'connecting' | 'connected' | 'failed';

export interface P2PStatus {
    phase: P2PPhase;
    role?: 'host' | 'joiner';
    code?: string;
    error?: string;
}

type P2PStatusListener = (status: P2PStatus) => void;

interface P2PRuntime {
    role: 'host' | 'joiner';
    transport: PeerTransport;
    code: string;
    connected: boolean;
    localPlayerId: string;
    localDisplayName: string;
    remotePlayerId: string | null;
    remoteDisplayName: string;
    matchStarted: boolean;
    lastRemoteInputSeq: number;
    state: P2PMatchState;
    pingInterval: number | null;
    fullSyncInterval: number | null;
    preRoundTimeout: number | null;
    hostHeartbeatInterval: number | null;
}

function normalizeCode(value: string): string {
    return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function mkPlayerState(id: string, displayName: string, position: { x: number; y: number; z: number }): P2PPlayerState {
    return {
        id,
        displayName,
        health: P2P.PLAYER_MAX_HEALTH,
        kills: 0,
        deaths: 0,
        alive: true,
        position: { ...position },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        lastInputSeq: -1,
    };
}

export class GameClient {
    private channel: GameTransport;
    private bridge: GameBridge;
    private walletPublicKey: string | null = null;
    private walletDisplayName: string | null = null;
    private lastAppliedServerTick: number | null = null;
    private warnedStorageCollision = false;
    private matchEndTimeout: number | null = null;
    private mode: TransportMode = 'socket';
    private p2p: P2PRuntime | null = null;
    private p2pStatus: P2PStatus = { phase: 'idle' };
    private p2pStatusListeners: Set<P2PStatusListener> = new Set();

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

    subscribeToP2PStatus(listener: P2PStatusListener): () => void {
        this.p2pStatusListeners.add(listener);
        listener(this.p2pStatus);
        return () => this.p2pStatusListeners.delete(listener);
    }

    async createP2PRoom(): Promise<string> {
        this.teardownP2P(false);
        let transport: PeerTransport | null = null;
        let registeredCode = '';
        for (let attempt = 0; attempt < 6; attempt++) {
            const candidate = PeerTransport.createHost(undefined, P2P.CONNECT_TIMEOUT_MS);
            const code = candidate.joinCode;
            const response = await this.requestServerAck<any>('p2p_register_host', { code, peerId: code }, 5000);
            if (response?.ok) {
                transport = candidate;
                registeredCode = code;
                break;
            }
            if (response?.error === 'code_in_use') {
                continue;
            }
            throw new Error(response?.error ? `Failed to create room: ${response.error}` : 'Failed to create room.');
        }
        if (!transport || !registeredCode) {
            throw new Error('Unable to create a unique room code. Please retry.');
        }
        const localId = `p2p-host-${transport.joinCode.toLowerCase()}`;
        const localName = this.walletDisplayName ?? 'Host';
        const hostSpawn = { x: -8, y: 3, z: -8 };
        const joinSpawn = { x: 8, y: 3, z: 8 };

        this.p2p = {
            role: 'host',
            transport,
            code: transport.joinCode,
            connected: false,
            localPlayerId: localId,
            localDisplayName: localName,
            remotePlayerId: null,
            remoteDisplayName: 'Joiner',
            matchStarted: false,
            lastRemoteInputSeq: -1,
            state: {
                hostId: localId,
                joinerId: 'p2p-joiner-pending',
                hostDisplayName: localName,
                joinerDisplayName: 'Joiner',
                host: mkPlayerState(localId, localName, hostSpawn),
                joiner: mkPlayerState('p2p-joiner-pending', 'Joiner', joinSpawn),
            },
            pingInterval: null,
            fullSyncInterval: null,
            preRoundTimeout: null,
            hostHeartbeatInterval: null,
        };
        this.p2p.hostHeartbeatInterval = window.setInterval(() => {
            void this.requestServerAck<any>('p2p_host_heartbeat', { code: registeredCode }, 3000).catch(() => undefined);
        }, 10_000);
        this.bindP2PTransport(this.p2p);
        this.setP2PStatus({ phase: 'hosting', role: 'host', code: transport.joinCode });
        transport.connect();
        return transport.joinCode;
    }

    async joinP2PRoom(code: string): Promise<void> {
        this.teardownP2P(false);
        const normalized = normalizeCode(code);
        if (!normalized) throw new Error('Enter a valid join code.');
        const reservation = await this.requestServerAck<any>('p2p_request_join', { code: normalized }, 5000);
        if (!reservation?.ok) {
            if (reservation?.error === 'room_not_found') throw new Error('Room not found. Check the code.');
            if (reservation?.error === 'room_full') throw new Error('Room is already occupied.');
            if (reservation?.error === 'host_offline') throw new Error('Host is offline.');
            if (reservation?.error === 'cannot_join_own_room') throw new Error('You cannot join your own room.');
            throw new Error('Failed to join room.');
        }
        const targetPeerId = typeof reservation.peerId === 'string' ? reservation.peerId : '';
        if (!targetPeerId) throw new Error('Room host is unavailable.');
        const transport = PeerTransport.createJoiner(normalized, targetPeerId, P2P.CONNECT_TIMEOUT_MS);
        const localId = `p2p-join-${Math.random().toString(36).slice(2, 8)}`;
        const localName = this.walletDisplayName ?? 'Joiner';
        const hostSpawn = { x: -8, y: 3, z: -8 };
        const joinSpawn = { x: 8, y: 3, z: 8 };

        this.p2p = {
            role: 'joiner',
            transport,
            code: normalized,
            connected: false,
            localPlayerId: localId,
            localDisplayName: localName,
            remotePlayerId: null,
            remoteDisplayName: 'Host',
            matchStarted: false,
            lastRemoteInputSeq: -1,
            state: {
                hostId: `p2p-host-${normalized.toLowerCase()}`,
                joinerId: localId,
                hostDisplayName: 'Host',
                joinerDisplayName: localName,
                host: mkPlayerState(`p2p-host-${normalized.toLowerCase()}`, 'Host', hostSpawn),
                joiner: mkPlayerState(localId, localName, joinSpawn),
            },
            pingInterval: null,
            fullSyncInterval: null,
            preRoundTimeout: null,
            hostHeartbeatInterval: null,
        };
        this.bindP2PTransport(this.p2p);
        this.setP2PStatus({ phase: 'connecting', role: 'joiner', code: normalized });
        transport.connect();
    }

    cancelP2P(): void {
        this.teardownP2P(true);
    }

    private setP2PStatus(status: P2PStatus): void {
        this.p2pStatus = status;
        for (const listener of this.p2pStatusListeners) {
            listener(status);
        }
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
                    if (this.mode === 'socket') {
                        this.channel.emit('leave_match', {});
                    }
                    this.teardownP2P(true);
                    break;
                case 'select_character':
                    this.sendSelectCharacter(event.characterModelId);
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
        this.teardownP2P(false);
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
            if (this.mode === 'socket') {
                this.bridge.notifyDisconnected();
            }
        });

        this.channel.on('disconnect', (reason) => {
            console.log('GameClient: Disconnected');
            if (reason) {
                console.warn('GameClient: Disconnect reason:', reason);
            }
            if (this.mode === 'socket') {
                this.bridge.notifyDisconnected();
            }
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

        this.channel.on('preround_start', (data: any) => {
            this.bridge.notifyPreRoundStart({
                durationSec: Number(data?.durationSec ?? 10),
                endTick: Number(data?.endTick ?? 0),
                availableCharacterModelIds: Array.isArray(data?.availableCharacterModelIds) ? data.availableCharacterModelIds : undefined,
            });
        });

        this.channel.on('preround_end', () => {
            this.bridge.notifyPreRoundEnd();
        });

        this.channel.on('character_selected', (data: any) => {
            const playerId = data?.playerId;
            const characterModelId = typeof data?.characterModelId === 'string' ? data.characterModelId : null;
            if (!playerId || !characterModelId) return;
            this.bridge.notifyCharacterSelected(playerId, characterModelId);
        });
    }

    private async setupBinaryHandlers(): Promise<void> {
        // --- BINARY MESSAGE HANDLERS ---
        const { deserializeSnapshot, deserializeDelta, serializeInputAck, deserializeInputAck } = await import('@snapshot/shared/simulation');

        this.channel.on('bin', (data: any) => {
            if (this.mode !== 'socket') return;
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

    private bindP2PTransport(runtime: P2PRuntime): void {
        runtime.transport.onOpen(() => {
            runtime.connected = true;
            void this.requestServerAck<any>('p2p_mark_connected', { code: runtime.code }, 3000).catch(() => undefined);
            this.setP2PStatus({ phase: 'connected', role: runtime.role, code: runtime.code });
            if (runtime.role === 'joiner') {
                runtime.transport.send(wrapP2PClientEvent({
                    type: 'p2p_hello',
                    playerId: runtime.localPlayerId,
                    displayName: runtime.localDisplayName,
                }));
            }
            this.startP2PIntervals(runtime);
        });

        runtime.transport.onClose((reason) => {
            const active = this.p2p === runtime && this.mode !== 'socket';
            if (active) {
                this.bridge.notifyGameMessage(runtime.role === 'joiner' ? 'Host left' : 'Peer disconnected', 'warning');
                this.bridge.updateState({ isGameOver: true, isRunning: false });
            }
            if (reason === 'timeout') {
                if (this.p2p !== runtime) return;
                this.setP2PStatus({
                    phase: 'failed',
                    role: runtime.role,
                    code: runtime.code,
                    error: 'P2P connection failed (ICE/NAT timeout after 10s).',
                });
            }
        });

        runtime.transport.onError((error) => {
            this.setP2PStatus({
                phase: 'failed',
                role: runtime.role,
                code: runtime.code,
                error: error instanceof Error ? error.message : 'P2P connection error',
            });
        });

        runtime.transport.onMessage((buffer) => {
            if (this.p2p !== runtime) return;
            this.handleP2PMessage(runtime, buffer);
        });
    }

    private handleP2PMessage(runtime: P2PRuntime, buffer: ArrayBuffer): void {
        const packet = readP2PPacket(buffer);
        if (runtime.role === 'host') {
            switch (packet.kind) {
                case 'input': {
                    if (packet.input.sequence <= runtime.lastRemoteInputSeq) return;
                    runtime.lastRemoteInputSeq = packet.input.sequence;
                    runtime.state.joiner.lastInputSeq = packet.input.sequence;
                    runtime.transport.send(wrapP2PAck({
                        lastProcessedSequence: packet.input.sequence,
                        processedAtTick: packet.input.tick,
                        serverTime: Date.now(),
                    }));
                    return;
                }
                case 'client_event': {
                    const event = packet.event;
                    if (event?.type === 'p2p_hello') {
                        runtime.remotePlayerId = String(event.playerId ?? '').trim() || `p2p-join-${runtime.code.toLowerCase()}`;
                        runtime.remoteDisplayName = typeof event.displayName === 'string' ? event.displayName : 'Joiner';
                        runtime.state.joinerId = runtime.remotePlayerId;
                        runtime.state.joiner.id = runtime.remotePlayerId;
                        runtime.state.joiner.displayName = runtime.remoteDisplayName;
                        runtime.transport.send(wrapP2PServerEvent({
                            type: 'event',
                            event: {
                                type: 'p2p_welcome',
                                hostId: runtime.localPlayerId,
                                hostDisplayName: runtime.localDisplayName,
                                joinerId: runtime.remotePlayerId,
                                joinerDisplayName: runtime.remoteDisplayName,
                            },
                        }));
                        this.startP2PMatch(runtime);
                        return;
                    }
                    if (event?.type === 'p2p_pose') {
                        this.updateP2PRemotePose(runtime, event.pose);
                        return;
                    }
                    if (event?.type === 'shoot') {
                        this.processP2PShot(runtime, runtime.state.joiner.id, event);
                        return;
                    }
                    if (event?.type === 'select_character') {
                        const characterModelId = typeof event.characterModelId === 'string' ? event.characterModelId : '';
                        if (!characterModelId) return;
                        this.bridge.notifyCharacterSelected(runtime.state.joiner.id as any, characterModelId);
                        runtime.transport.send(wrapP2PServerEvent({
                            type: 'event',
                            event: {
                                type: 'p2p_character_selected',
                                playerId: runtime.state.joiner.id,
                                characterModelId,
                            },
                            tick: tick(0 as any),
                        } as any));
                    }
                    return;
                }
                case 'ping':
                    runtime.transport.send(createPongPayload(packet.sentAt, performance.now()));
                    return;
                case 'pong':
                    this.bridge.updateState({ ping: Math.max(0, Math.round(performance.now() - packet.sentAt)) });
                    return;
                default:
                    return;
            }
        }

        switch (packet.kind) {
            case 'server_event': {
                const message = packet.event as ServerMessage;
                const eventType = (message as any)?.event?.type;
                if (eventType === 'p2p_welcome') {
                    const ev = (message as any).event;
                    runtime.remotePlayerId = String(ev.hostId ?? runtime.remotePlayerId ?? '');
                    runtime.remoteDisplayName = String(ev.hostDisplayName ?? 'Host');
                    runtime.state.hostId = runtime.remotePlayerId || runtime.state.hostId;
                    runtime.state.host.id = runtime.state.hostId;
                    runtime.state.host.displayName = runtime.remoteDisplayName;
                    runtime.state.joinerId = runtime.localPlayerId;
                    runtime.state.joiner.id = runtime.localPlayerId;
                    runtime.state.joiner.displayName = runtime.localDisplayName;
                    this.startP2PMatch(runtime);
                    return;
                }
                if (eventType === 'p2p_full_sync') {
                    this.applyP2PFullSync(runtime, (message as any).event);
                    return;
                }
                if (eventType === 'p2p_preround_start') {
                    const ev = (message as any).event;
                    this.bridge.notifyPreRoundStart({
                        durationSec: Number(ev?.durationSec ?? 10),
                        availableCharacterModelIds: Array.isArray(ev?.availableCharacterModelIds) ? ev.availableCharacterModelIds : undefined,
                    });
                    return;
                }
                if (eventType === 'p2p_preround_end') {
                    this.bridge.notifyPreRoundEnd();
                    return;
                }
                if (eventType === 'p2p_character_selected') {
                    const ev = (message as any).event;
                    const playerId = typeof ev?.playerId === 'string' ? ev.playerId : '';
                    const characterModelId = typeof ev?.characterModelId === 'string' ? ev.characterModelId : '';
                    if (playerId && characterModelId) {
                        this.bridge.notifyCharacterSelected(playerId as any, characterModelId);
                    }
                    return;
                }
                this.handleServerMessage(message);
                return;
            }
            case 'ack':
                this.bridge.processInputAck(packet.ack);
                return;
            case 'ping':
                runtime.transport.send(createPongPayload(packet.sentAt, performance.now()));
                return;
            case 'pong':
                this.bridge.updateState({ ping: Math.max(0, Math.round(performance.now() - packet.sentAt)) });
                return;
            default:
                return;
        }
    }

    private startP2PIntervals(runtime: P2PRuntime): void {
        if (runtime.pingInterval === null) {
            runtime.pingInterval = window.setInterval(() => {
                runtime.transport.send(createPingPayload(performance.now()));
            }, P2P.PING_INTERVAL_MS);
        }
        if (runtime.role === 'host' && runtime.fullSyncInterval === null) {
            runtime.fullSyncInterval = window.setInterval(() => {
                if (!runtime.matchStarted) return;
                runtime.transport.send(wrapP2PServerEvent({
                    type: 'event',
                    event: {
                        type: 'p2p_full_sync',
                        state: runtime.state,
                        serverTime: Date.now(),
                    },
                }));
            }, P2P.FULL_SYNC_INTERVAL_MS);
        }
    }

    private startP2PMatch(runtime: P2PRuntime): void {
        if (runtime.matchStarted) return;
        if (runtime.role === 'host' && !runtime.remotePlayerId) return;

        runtime.matchStarted = true;
        this.mode = runtime.role === 'host' ? 'p2p_host' : 'p2p_joiner';
        const hostId = runtime.state.host.id;
        const joinerId = runtime.state.joiner.id;
        const hostSpawn = runtime.state.host.position;
        const joinSpawn = runtime.state.joiner.position;

        this.bridge.setLocalPlayerId(runtime.localPlayerId as any);
        this.bridge.updateState({
            localPlayerEntityId: (runtime.localPlayerId === hostId ? 1001 : 1002) as any,
            health: P2P.PLAYER_MAX_HEALTH,
            maxHealth: P2P.PLAYER_MAX_HEALTH,
            kills: 0,
            deaths: 0,
            assists: 0,
            teamScores: { 1: 0, 2: 0 },
            isDead: false,
            isGameOver: false,
            ping: 0,
        });
        this.bridge.notifyMatchStart({
            spawnPosition: runtime.localPlayerId === hostId ? hostSpawn : joinSpawn,
            opponent: runtime.localPlayerId === hostId ? joinerId : hostId,
            opponentSpawnPosition: runtime.localPlayerId === hostId ? joinSpawn : hostSpawn,
            allPlayers: [
                { playerId: hostId, spawnPosition: hostSpawn },
                { playerId: joinerId, spawnPosition: joinSpawn },
            ],
        });
        // notifyMatchStart resets bridge entity mappings; register P2P mappings after it.
        this.bridge.registerPlayerEntity(hostId as any, 1001 as any);
        this.bridge.registerPlayerEntity(joinerId as any, 1002 as any);
        this.startP2PPreRound(runtime);
        this.bridge.notifyConnected();
    }

    private startP2PPreRound(runtime: P2PRuntime): void {
        const durationSec = 10;
        const availableCharacterModelIds = ['assasin', 'grizzly', 'kodiak', 'panda'];
        this.bridge.notifyPreRoundStart({ durationSec, availableCharacterModelIds });
        if (runtime.role !== 'host') return;
        runtime.transport.send(wrapP2PServerEvent({
            type: 'event',
            event: {
                type: 'p2p_preround_start',
                durationSec,
                availableCharacterModelIds,
            },
            tick: tick(0 as any),
        } as any));
        if (runtime.preRoundTimeout !== null) window.clearTimeout(runtime.preRoundTimeout);
        runtime.preRoundTimeout = window.setTimeout(() => {
            if (this.p2p !== runtime) return;
            this.bridge.notifyPreRoundEnd();
            runtime.transport.send(wrapP2PServerEvent({
                type: 'event',
                event: { type: 'p2p_preround_end' },
                tick: tick(0 as any),
            } as any));
            runtime.preRoundTimeout = null;
        }, durationSec * 1000);
    }

    private updateP2PRemotePose(runtime: P2PRuntime, pose: any): void {
        if (!pose?.position) return;
        runtime.state.joiner.position = {
            x: Number(pose.position.x ?? 0),
            y: Number(pose.position.y ?? 0),
            z: Number(pose.position.z ?? 0),
        };
        runtime.state.joiner.rotation = {
            x: Number(pose.rotation?.x ?? 0),
            y: Number(pose.rotation?.y ?? 0),
            z: Number(pose.rotation?.z ?? 0),
            w: Number(pose.rotation?.w ?? 1),
        };
        const message: ServerMessage = {
            type: 'event',
            event: {
                type: 'net_pose',
                playerId: runtime.state.joiner.id as any,
                position: runtime.state.joiner.position as any,
                rotation: runtime.state.joiner.rotation as any,
                tick: tick(0 as any),
            } as any,
            tick: tick(0 as any),
        };
        this.handleServerMessage(message);
        runtime.transport.send(wrapP2PServerEvent(message));
        const joinerEntityId = this.getP2PEntityId(runtime, runtime.state.joiner.id);
        const joinerAiming = Boolean(pose?.isAiming);
        const aimMessage: ServerMessage = {
            type: 'event',
            event: {
                type: 'aim_state',
                sourceId: joinerEntityId as any,
                isAiming: joinerAiming,
            } as any,
            tick: tick(0 as any),
        };
        this.handleServerMessage(aimMessage);
        runtime.transport.send(wrapP2PServerEvent(aimMessage));
        const joinerAnim = pose?.animation;
        if (joinerAnim && typeof joinerAnim.locomotion === 'string') {
            const animMessage: ServerMessage = {
                type: 'event',
                event: {
                    type: 'p2p_anim_state',
                    sourceId: joinerEntityId as any,
                    locomotion: joinerAnim.locomotion,
                    isSliding: Boolean(joinerAnim.isSliding),
                } as any,
                tick: tick(0 as any),
            };
            this.handleServerMessage(animMessage);
            runtime.transport.send(wrapP2PServerEvent(animMessage));
        }
    }

    private applyP2PFullSync(runtime: P2PRuntime, event: any): void {
        const state = event?.state as P2PMatchState | undefined;
        if (!state) return;
        const previousLocal = runtime.state.host.id === runtime.localPlayerId ? runtime.state.host : runtime.state.joiner;
        runtime.state = state;
        const local = state.host.id === runtime.localPlayerId ? state.host : state.joiner;
        const remote = state.host.id === runtime.localPlayerId ? state.joiner : state.host;
        this.bridge.updateState({
            health: local.health,
            isDead: !local.alive,
            kills: local.kills,
            deaths: local.deaths,
            teamScores: { 1: state.host.kills, 2: state.joiner.kills },
        });
        const dx = local.position.x - previousLocal.position.x;
        const dy = local.position.y - previousLocal.position.y;
        const dz = local.position.z - previousLocal.position.z;
        const driftSq = dx * dx + dy * dy + dz * dz;
        // Avoid constant micro-corrections on joiner; only correct meaningful drift.
        if (driftSq > 1.0) {
            this.bridge.applyServerCorrection(local.position as any);
        }
        this.bridge.processNetPose({
            type: 'net_pose',
            playerId: remote.id as any,
            position: remote.position as any,
            rotation: remote.rotation as any,
            tick: tick(0 as any),
        } as any);
    }

    private processP2PShot(runtime: P2PRuntime, shooterId: string, shot: any): void {
        const host = runtime.state.host;
        const joiner = runtime.state.joiner;
        const shooter = shooterId === host.id ? host : joiner;
        const target = shooterId === host.id ? joiner : host;
        if (!shooter.alive || !target.alive || !shot?.origin || !shot?.dir) return;
        const normalizedDir = this.normalizeDir(shot.dir);
        if (!normalizedDir) return;
        const shotOrigin = this.resolveP2PShotOrigin(shooter.position, shot.origin, normalizedDir);

        const shooterEntityId = this.getP2PEntityId(runtime, shooter.id);
        const shotEvent: ServerMessage = {
            type: 'event',
            event: {
                type: 'shot_fired',
                sourceId: shooterEntityId as any,
                origin: shotOrigin as any,
                direction: normalizedDir as any,
                weapon: 'smg',
            } as any,
            tick: tick(0 as any),
        };
        this.handleServerMessage(shotEvent);
        runtime.transport.send(wrapP2PServerEvent(shotEvent));

        if (!this.rayHitsPlayer(shotOrigin, normalizedDir, target.position, P2P.PLAYER_RADIUS)) return;

        target.health = Math.max(0, target.health - P2P.DAMAGE_PER_HIT);
        const damageMessage: ServerMessage = {
            type: 'damage_applied',
            targetId: target.id,
            attackerId: shooter.id,
            amount: P2P.DAMAGE_PER_HIT,
            healthAfter: target.health,
        };
        this.handleServerMessage(damageMessage);
        runtime.transport.send(wrapP2PServerEvent(damageMessage));

        if (target.health > 0) return;
        target.alive = false;
        target.deaths += 1;
        shooter.kills += 1;

        const deathMessage: ServerMessage = {
            type: 'player_died',
            victimId: target.id,
            killerId: shooter.id,
            killerScore: shooter.kills,
        };
        const scoreMessage: ServerMessage = {
            type: 'score_update',
            scores: { [host.id]: host.kills, [joiner.id]: joiner.kills },
            targetScore: 10,
        };
        this.handleServerMessage(deathMessage);
        this.handleServerMessage(scoreMessage);
        runtime.transport.send(wrapP2PServerEvent(deathMessage));
        runtime.transport.send(wrapP2PServerEvent(scoreMessage));

        if (shooter.kills >= P2P.TARGET_SCORE) {
            const endMessage: ServerMessage = {
                type: 'match_ended',
                winnerId: shooter.id,
                scores: { [host.id]: host.kills, [joiner.id]: joiner.kills },
                targetScore: 10,
            };
            this.handleServerMessage(endMessage);
            runtime.transport.send(wrapP2PServerEvent(endMessage));
            return;
        }

        window.setTimeout(() => {
            target.alive = true;
            target.health = P2P.PLAYER_MAX_HEALTH;
            target.position = target.id === host.id ? { x: -8, y: 3, z: -8 } : { x: 8, y: 3, z: 8 };
            const spawnMessage: ServerMessage = {
                type: 'event',
                event: {
                    type: 'player_spawned',
                    entityId: target.id === host.id ? (1001 as any) : (1002 as any),
                    position: target.position as any,
                } as any,
                tick: tick(0 as any),
            };
            this.handleServerMessage(spawnMessage);
            runtime.transport.send(wrapP2PServerEvent(spawnMessage));
        }, 3000);
    }

    private rayHitsPlayer(
        origin: { x: number; y: number; z: number },
        dir: { x: number; y: number; z: number },
        target: { x: number; y: number; z: number },
        radius: number
    ): boolean {
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
        if (len < 1e-6) return false;
        const nx = dir.x / len;
        const ny = dir.y / len;
        const nz = dir.z / len;

        // Approximate player collision with body + head spheres (host authoritative).
        const n = { x: nx, y: ny, z: nz };
        const centers = [
            { x: target.x, y: target.y, z: target.z },
            { x: target.x, y: target.y + 0.9, z: target.z },
            { x: target.x, y: target.y + 1.6, z: target.z },
        ];
        const radii = [Math.max(0.9, radius), Math.max(0.75, radius), 0.3];
        for (let i = 0; i < centers.length; i++) {
            if (this.raySphereIntersection(origin, n, centers[i]!, radii[i]!) !== null) {
                return true;
            }
        }
        return false;
    }

    private raySphereIntersection(
        origin: { x: number; y: number; z: number },
        dir: { x: number; y: number; z: number },
        center: { x: number; y: number; z: number },
        radius: number
    ): number | null {
        const ox = origin.x - center.x;
        const oy = origin.y - center.y;
        const oz = origin.z - center.z;
        const b = ox * dir.x + oy * dir.y + oz * dir.z;
        const c = ox * ox + oy * oy + oz * oz - radius * radius;
        const disc = b * b - c;
        if (disc < 0) return null;
        const sqrtDisc = Math.sqrt(disc);
        const t1 = -b - sqrtDisc;
        const t2 = -b + sqrtDisc;
        if (t1 >= 0) return t1;
        if (t2 >= 0) return t2;
        return null;
    }

    private normalizeDir(dir: { x: number; y: number; z: number } | undefined): { x: number; y: number; z: number } | null {
        if (!dir) return null;
        const x = Number(dir.x ?? 0);
        const y = Number(dir.y ?? 0);
        const z = Number(dir.z ?? 0);
        const len = Math.sqrt(x * x + y * y + z * z);
        if (len < 1e-6) return null;
        return { x: x / len, y: y / len, z: z / len };
    }

    private resolveP2PShotOrigin(
        shooterPosition: { x: number; y: number; z: number },
        reportedOrigin: { x: number; y: number; z: number } | undefined,
        dir: { x: number; y: number; z: number }
    ): { x: number; y: number; z: number } {
        const anchor = {
            x: Number(shooterPosition.x ?? 0),
            y: Number(shooterPosition.y ?? 0) + 1.35,
            z: Number(shooterPosition.z ?? 0),
        };
        if (!reportedOrigin) return anchor;
        const ox = Number(reportedOrigin.x ?? anchor.x);
        const oy = Number(reportedOrigin.y ?? anchor.y);
        const oz = Number(reportedOrigin.z ?? anchor.z);
        const dx = ox - anchor.x;
        const dy = oy - anchor.y;
        const dz = oz - anchor.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        // Keep remote tracer origin close to replicated model to avoid obvious offsets.
        if (distSq > 4.0) {
            return {
                x: anchor.x + dir.x * 0.35,
                y: anchor.y + dir.y * 0.35,
                z: anchor.z + dir.z * 0.35,
            };
        }
        return { x: ox, y: oy, z: oz };
    }

    private getP2PEntityId(runtime: P2PRuntime, playerId: string): number {
        return playerId === runtime.state.host.id ? 1001 : 1002;
    }

    private teardownP2P(resetStatus: boolean): void {
        if (this.p2p) {
            if (this.p2p.pingInterval !== null) window.clearInterval(this.p2p.pingInterval);
            if (this.p2p.fullSyncInterval !== null) window.clearInterval(this.p2p.fullSyncInterval);
            if (this.p2p.preRoundTimeout !== null) window.clearTimeout(this.p2p.preRoundTimeout);
            if (this.p2p.hostHeartbeatInterval !== null) window.clearInterval(this.p2p.hostHeartbeatInterval);
            if (this.p2p.role === 'host') {
                this.channel.emit('p2p_release_room', { code: this.p2p.code });
            }
            this.p2p.transport.disconnect();
            this.p2p = null;
        }
        this.mode = 'socket';
        if (resetStatus) this.setP2PStatus({ phase: 'idle' });
    }

    private async requestServerAck<TResponse = any>(event: string, data: unknown, timeoutMs: number = 4000): Promise<TResponse> {
        if (!this.channel.connected) {
            throw new Error('Server connection required for P2P room operations.');
        }
        return this.channel.emitWithAck<TResponse>(event, data, timeoutMs);
    }

    private getLocalPlayerIdForMessages(): string | undefined {
        if (this.mode === 'socket') return this.channel.id;
        return this.p2p?.localPlayerId ?? undefined;
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
                    this.bridge.updateState({ isDead: false, respawnTimeRemaining: 0, health: P2P.PLAYER_MAX_HEALTH });
                }
            }
            this.bridge.emitGameEvent(message.event as any);
            return;
        }

        const localId = this.getLocalPlayerIdForMessages();

        if (message.type === 'damage_applied') {
            if (message.attackerId === localId) {
                this.bridge.showHitMarker(false);
            }
            const isLocalTarget = message.targetId === localId;
            if (isLocalTarget) {
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
            return;
        }

        if (message.type === 'player_died') {
            if (message.killerId === localId) {
                this.bridge.updateState({ kills: this.bridge.getState().kills + 1 });
            }
            if (message.victimId === localId) {
                this.bridge.updateState({ deaths: this.bridge.getState().deaths + 1, isDead: true, respawnTimeRemaining: 3 });
            }
            this.bridge.addKillFeedByPlayerIds(message.killerId as any, message.victimId as any, 'smg');
            this.bridge.emitPlayerDeathByPlayerId(message.victimId as any, message.killerId as any);
            return;
        }

        if (message.type === 'score_update') {
            const localKills = localId ? (message.scores[localId] ?? this.bridge.getState().kills) : this.bridge.getState().kills;
            const opponentId = this.bridge.getMatchData()?.opponent;
            const opponentKills = opponentId ? (message.scores[opponentId] ?? 0) : 0;
            this.bridge.updateState({
                kills: localKills,
                teamScores: { 1: localKills, 2: opponentKills },
            });
            return;
        }

        if (message.type === 'match_ended') {
            const youWon = !!localId && message.winnerId === localId;
            this.bridge.notifyGameMessage(youWon ? 'Victory! First to 10.' : 'Defeat. Opponent reached 10.', youWon ? 'success' : 'warning');
            this.bridge.updateState({
                isGameOver: true,
                winnerName: message.winnerId,
            });
            if (this.matchEndTimeout) {
                window.clearTimeout(this.matchEndTimeout);
            }
            this.matchEndTimeout = window.setTimeout(() => {
                if (this.mode === 'socket') {
                    this.channel.emit('leave_match', {});
                } else {
                    this.teardownP2P(true);
                }
                this.bridge.updateState({ isRunning: false });
                this.matchEndTimeout = null;
            }, 5000);
        }
    }

    private emitAuthAndLobbyRequest(): void {
        if (!this.walletPublicKey) return;
        this.channel.emit('auth', { publicKey: this.walletPublicKey, displayName: this.walletDisplayName });
        this.channel.emit('get_lobby_state', {});
    }

    sendInput(input: InputFrame): void {
        if (this.mode === 'socket') {
            if (!this.channel.connected) return;
            const inputData: ArrayBuffer = serializeInput(input);
            this.channel.emit('bin', wrapBinaryMessage(BinaryMessageType.Input, inputData));
            return;
        }
        if (this.mode === 'p2p_joiner' && this.p2p?.connected) {
            this.p2p.transport.send(wrapP2PInput(input));
        }
    }

    sendPose(pose: { position: { x: number; y: number; z: number }; velocity?: { x: number; y: number; z: number }; rotation?: { x: number; y: number; z: number; w: number }; isGrounded?: boolean; timeMs?: number; animation?: { locomotion: string; isSliding?: boolean } }): void {
        if (this.mode === 'socket') {
            if (!this.channel.connected) return;
            this.channel.emit('pose', pose);
            return;
        }

        const runtime = this.p2p;
        if (!runtime?.connected) return;
        const local = runtime.role === 'host' ? runtime.state.host : runtime.state.joiner;
        local.position = { ...pose.position };
        local.rotation = { ...(pose.rotation ?? { x: 0, y: 0, z: 0, w: 1 }) };

        if (runtime.role === 'joiner') {
            runtime.transport.send(wrapP2PClientEvent({
                type: 'p2p_pose',
                pose: {
                    ...pose,
                    isAiming: this.bridge.getState().isAiming,
                },
            }));
            return;
        }

        const hostEntityId = this.getP2PEntityId(runtime, runtime.state.host.id);
        runtime.transport.send(wrapP2PServerEvent({
            type: 'event',
            event: {
                type: 'net_pose',
                playerId: runtime.state.host.id,
                position: runtime.state.host.position,
                rotation: runtime.state.host.rotation,
                tick: 0,
            },
            tick: 0,
        } as any));
        runtime.transport.send(wrapP2PServerEvent({
            type: 'event',
            event: {
                type: 'aim_state',
                sourceId: hostEntityId,
                isAiming: this.bridge.getState().isAiming,
            },
            tick: 0,
        } as any));
        if (pose.animation?.locomotion) {
            runtime.transport.send(wrapP2PServerEvent({
                type: 'event',
                event: {
                    type: 'p2p_anim_state',
                    sourceId: hostEntityId,
                    locomotion: pose.animation.locomotion,
                    isSliding: Boolean(pose.animation.isSliding),
                },
                tick: 0,
            } as any));
        }
    }

    sendShoot(shot: { shotId: string; origin: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number }; time: number; weaponId?: string }): void {
        if (this.mode === 'socket') {
            if (!this.channel.connected) return;
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
            return;
        }

        const runtime = this.p2p;
        if (!runtime?.connected) return;
        if (runtime.role === 'joiner') {
            runtime.transport.send(wrapP2PClientEvent({
                type: 'shoot',
                shotId: shot.shotId,
                origin: shot.origin,
                dir: shot.dir,
                time: shot.time,
                weaponId: shot.weaponId,
            }));
            return;
        }
        this.processP2PShot(runtime, runtime.state.host.id, shot);
    }

    sendMapLoaded(): void {
        if (this.mode !== 'socket') return;
        if (!this.channel.connected) return;
        const msg: ClientMessage = { type: 'map_loaded' };
        const payload = serializeClientMessage(msg);
        this.channel.emit('bin', wrapBinaryMessage(BinaryMessageType.ClientEvent, payload));
    }

    sendSelectCharacter(characterModelId: string): void {
        if (this.mode === 'socket') {
            if (!this.channel.connected) return;
            const msg: ClientMessage = { type: 'select_character', characterModelId };
            const payload = serializeClientMessage(msg);
            this.channel.emit('bin', wrapBinaryMessage(BinaryMessageType.ClientEvent, payload));
            return;
        }
        const runtime = this.p2p;
        if (!runtime?.connected) return;
        this.bridge.notifyCharacterSelected(runtime.localPlayerId as any, characterModelId);
        if (this.mode === 'p2p_host') {
            runtime.transport.send(wrapP2PServerEvent({
                type: 'event',
                event: {
                    type: 'p2p_character_selected',
                    playerId: runtime.localPlayerId,
                    characterModelId,
                },
                tick: tick(0 as any),
            } as any));
            return;
        }
        if (this.mode === 'p2p_joiner' && this.p2p?.connected) {
            this.p2p.transport.send(wrapP2PClientEvent({ type: 'select_character', characterModelId }));
        }
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
