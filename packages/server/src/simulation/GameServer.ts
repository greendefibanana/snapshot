/**
 * GameServer - Complete authoritative game server
 * 
 * Combines tick scheduler, simulation loop, and state broadcasting
 * into a complete game server with Socket.io networking.
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { Server as SocketIOServer } from 'socket.io';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
    type Tick,
    tick,
    ServerInputQueue,
    deserializeInput,
    deserializeInputBatch,
    deserializeInputAck,
} from '@snapshot/shared/simulation';
import {
    BinaryMessageType,
    deserializeClientMessage,
    normalizeBinaryData,
    serializeServerMessage,
    type ClientMessage,
    type GameMode,
    type ServerMessage,
    unwrapBinaryMessage,
    wrapBinaryMessage,
} from '@snapshot/shared';

import { TickScheduler, createTickScheduler } from './TickScheduler.js';
import { SimulationLoop, createSimulationLoop } from './SimulationLoop.js';
import {
    StateBroadcaster,
    createStateBroadcaster,
    type ConnectedClient,
} from './StateBroadcaster.js';
import { SimpleMatchmaker } from '../services/SimpleMatchmaker.js';
import { MatchTokenService } from '../services/MatchTokenService.js';
import { PlayerNameStore } from '../services/PlayerNameStore.js';
import { PublicMatchmakingService, type PublicMatchmakingMode } from '../services/PublicMatchmakingService.js';
import { buildSettleWagerIx } from '../services/wagerProgram.js';
import { ServerBVH, mapPathFromCwd } from '../physics/ServerBVH.js';
import { createSocketIoServerTransportChannel, type ServerTransportChannel } from '../networking/ServerTransport.js';

// =============================================================================
// TYPES
// =============================================================================

export interface GameServerConfig {
    /** Socket.io port */
    port: number;

    /** Host interface to bind */
    host?: string;

    /** Maximum players per room */
    maxPlayers?: number;

    /** Enable physics (requires Rapier) */
    enablePhysics?: boolean;
}

export interface GameServerStats {
    tick: Tick;
    playerCount: number;
    avgTickTime: number;
    maxTickTime: number;
    snapshotBufferSize: number;
}

interface P2PRoomRecord {
    code: string;
    hostPlayerId: string;
    hostPeerId: string;
    mode: GameMode;
    maxPeers: number;
    createdAtMs: number;
    lastHeartbeatAtMs: number;
    connectedPlayerIds: string[];
    reservedJoinerIds: string[];
    reservationByPlayerId: Record<string, number>;
}

type IceServerConfig = {
    urls: string | string[];
    username?: string;
    credential?: string;
    credentialType?: string;
};

const CLIENT_POSE_AUTHORITY = true;
const FULL_SNAPSHOT_INTERVAL_TICKS = Math.max(30, Number.parseInt(process.env.FULL_SNAPSHOT_INTERVAL_TICKS ?? '90', 10) || 90);
const DELTA_INTERVAL_TICKS = Math.max(1, Number.parseInt(process.env.DELTA_INTERVAL_TICKS ?? '2', 10) || 2);
const INPUT_ACK_INTERVAL_TICKS = Math.max(1, Number.parseInt(process.env.INPUT_ACK_INTERVAL_TICKS ?? '2', 10) || 2);
const PRE_ROUND_COUNTDOWN_SEC = 10;
const CHARACTER_MODELS = ['assasin', 'grizzly', 'kodiak', 'panda'] as const;
const P2P_ROOM_HEARTBEAT_TTL_MS = 60_000;
const P2P_RESERVATION_TTL_MS = 15_000;
const P2P_ROOM_CLEANUP_INTERVAL_MS = 2_000;
const MATCHMAKING_API_PREFIX = '/api/matchmaking';

const VALIDATION = {
    maxSpeed: 25, // units/sec
    maxY: 100,
    minY: -10,
    boundsMin: { x: -500, y: -10, z: -500 },
    boundsMax: { x: 500, y: 100, z: 500 },
};

function sanitizeDisplayName(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().replace(/\s+/g, ' ');
    if (!trimmed) return null;
    return trimmed.slice(0, 20);
}

function parseKeypairFromEnv(raw?: string): Keypair | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as number[];
        if (!Array.isArray(parsed)) return null;
        const secret = Uint8Array.from(parsed);
        return Keypair.fromSecretKey(secret);
    } catch {
        return null;
    }
}

function wagerMatchSeedLocal(matchId: string): Uint8Array {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(matchId);
    if (bytes.length === 32) return bytes;
    if (bytes.length > 32) return bytes.slice(0, 32);
    const out = new Uint8Array(32);
    out.set(bytes, 0);
    return out;
}

function summarizeDisconnectDetails(details: any): Record<string, unknown> | undefined {
    if (!details || typeof details !== 'object') return undefined;
    const out: Record<string, unknown> = {};
    if ('description' in details) out.description = details.description;
    if ('message' in details) out.message = details.message;
    if ('name' in details) out.name = details.name;
    if ('type' in details) out.type = details.type;
    if ('context' in details && details.context && typeof details.context === 'object') {
        const context = details.context as any;
        out.context = {
            transport: context.transport?.name ?? context.transport,
            status: context.status,
            code: context.code,
        };
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizePublicMatchmakingMode(value: unknown): PublicMatchmakingMode | null {
    if (value === '1v1') return value;
    return null;
}

function sanitizeP2PCode(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

// =============================================================================
// GAME SERVER
// =============================================================================

export class GameServer {
    private config: Required<GameServerConfig>;
    private io: SocketIOServer | null = null;
    private httpServer: http.Server | null = null;
    private clientDistDir: string | null = null;

    private tickScheduler: TickScheduler;
    private simulationLoop: SimulationLoop;
    private stateBroadcaster: StateBroadcaster;
    private inputQueue: ServerInputQueue;
    private matchmaker: SimpleMatchmaker;
    private publicMatchmaking: PublicMatchmakingService;
    private playerNameStore: PlayerNameStore;
    private wagerAuthorityKeypair: Keypair | null = null;
    private wagerProgramId: PublicKey | null = null;
    private wagerFeeWallet: PublicKey | null = null;
    private solanaConnection: Connection | null = null;
    private wagerPayouts: Set<string> = new Set();
    private wagerLocks: Map<string, Set<string>> = new Map();

    private playerChannels: Map<string, ServerTransportChannel> = new Map();
    private latestClientPoses: Map<string, { position: { x: number; y: number; z: number }; velocity?: { x: number; y: number; z: number }; rotation?: { x: number; y: number; z: number; w: number }; isGrounded?: boolean; timeMs: number }> = new Map();
    private lastAcceptedPoses: Map<string, { position: { x: number; y: number; z: number }; timeMs: number }> = new Map();
    private lastLagWarningAtMs = 0;
    private bvh: ServerBVH | null = null;
    private started = false;
    private startupComplete = false;
    private startedMatches: Set<string> = new Set();
    private matchByPlayerId: Map<string, string> = new Map();
    private preRoundByMatchId: Map<string, {
        players: string[];
        loadedPlayers: Set<string>;
        started: boolean;
        durationSec: number;
        endTick: Tick | null;
        endedBroadcast: boolean;
    }> = new Map();
    private p2pRoomsByCode: Map<string, P2PRoomRecord> = new Map();
    private p2pCodeByHostPlayer: Map<string, string> = new Map();
    private lastP2PRoomCleanupAtMs = 0;
    private cachedIceServers: IceServerConfig[] | null = null;
    private cachedIceServersExpiresAtMs = 0;
    private iceServerFetchPromise: Promise<IceServerConfig[]> | null = null;

    constructor(config: GameServerConfig) {
        this.config = {
            port: config.port,
            host: config.host ?? '0.0.0.0',
            maxPlayers: config.maxPlayers ?? 8,
            enablePhysics: config.enablePhysics ?? false,
        };
        this.clientDistDir = this.resolveClientDistDir();

        // Create subsystems
        this.inputQueue = new ServerInputQueue();
        this.simulationLoop = createSimulationLoop(this.inputQueue);
        this.stateBroadcaster = createStateBroadcaster({
            fullSnapshotInterval: FULL_SNAPSHOT_INTERVAL_TICKS,
            deltaInterval: DELTA_INTERVAL_TICKS,
        });

        this.tickScheduler = createTickScheduler({
            onTick: (tick, deltaMs) => this.onTick(tick, deltaMs),
            onTicksSkipped: (count) => {
                const now = Date.now();
                if (now - this.lastLagWarningAtMs >= 5000) {
                    console.warn(`GameServer: Skipped ${count} ticks due to lag`);
                    this.lastLagWarningAtMs = now;
                }
            },
            onStats: (stats) => {
                // Could log or expose via API
            },
        });

        this.matchmaker = new SimpleMatchmaker();
        this.publicMatchmaking = new PublicMatchmakingService(
            new MatchTokenService(process.env.MATCHMAKING_TOKEN_SECRET ?? ''),
        );
        this.playerNameStore = new PlayerNameStore(path.resolve(process.cwd(), 'data', 'player-names.json'));
        this.wagerAuthorityKeypair = parseKeypairFromEnv(process.env.WAGER_AUTHORITY_SECRET_KEY);
        this.wagerProgramId = process.env.WAGER_PROGRAM_ID ? new PublicKey(process.env.WAGER_PROGRAM_ID) : null;
        this.wagerFeeWallet = process.env.WAGER_FEE_WALLET ? new PublicKey(process.env.WAGER_FEE_WALLET) : null;
        const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
        this.solanaConnection = new Connection(rpcUrl, 'confirmed');
    }

    /**
     * Start the game server.
     */
    async start(): Promise<void> {
        if (this.started) {
            throw new Error('GameServer already started');
        }

        console.log('GameServer: Starting...');

        // Initialize Socket.io (WebSocket/TCP)
        this.httpServer = http.createServer((req, res) => {
            void this.handleHttpRequest(req, res);
        });
        this.io = new SocketIOServer(this.httpServer, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST'],
            },
            transports: ['websocket', 'polling'],
            pingInterval: 25000,
            pingTimeout: 60000,
            connectionStateRecovery: {
                maxDisconnectionDuration: 120000,
                skipMiddlewares: true,
            },
            perMessageDeflate: false,
        });
        this.io.engine.on('connection_error', (error: any) => {
            console.warn('GameServer: Engine connection error', {
                code: error?.code,
                message: error?.message,
                context: summarizeDisconnectDetails(error?.context),
            });
        });

        // Setup connection handler
        this.io.on('connection', (socket) => {
            if (!this.startupComplete) {
                socket.emit('game_message', { severity: 'info', message: 'Server is starting up. Please reconnect in a moment.' });
                socket.disconnect(true);
                return;
            }
            this.onPlayerConnect(createSocketIoServerTransportChannel(socket));
        });

        // Start listening early so hosting providers can detect the open port.
        await new Promise<void>((resolve) => {
            this.httpServer!.listen(this.config.port, this.config.host, () => resolve());
        });

        console.log(`GameServer: Socket.io listening on ${this.config.host}:${this.config.port}`);

        await this.playerNameStore.load();
        await this.matchmaker.loadPersistentState();

        if (CLIENT_POSE_AUTHORITY) {
            this.bvh = new ServerBVH();
            const mapPath = mapPathFromCwd();
            console.log(`GameServer: Loading map for BVH at ${mapPath}`);
            await this.bvh.loadMap(mapPath, 3, 0.1);
            const bounds = this.bvh.getBounds();
            if (bounds) {
                console.log(`GameServer: BVH bounds min=(${bounds.min.x.toFixed(2)},${bounds.min.y.toFixed(2)},${bounds.min.z.toFixed(2)}) max=(${bounds.max.x.toFixed(2)},${bounds.max.y.toFixed(2)},${bounds.max.z.toFixed(2)})`);
            }
        }

        // Initialize physics if enabled
        if (this.config.enablePhysics) {
            await this.simulationLoop.initPhysics();
        }

        // Start tick scheduler
        this.tickScheduler.start();

        this.startupComplete = true;
        this.started = true;
        console.log('GameServer: Started successfully');
    }

    /**
     * Stop the game server.
     */
    stop(): void {
        console.log('GameServer: Stopping...');
        void this.playerNameStore.flush();
        void this.matchmaker.flushPersistentState();

        // Stop tick scheduler
        this.tickScheduler.stop();

        // Disconnect all players
        for (const channel of this.playerChannels.values()) {
            channel.disconnect(true);
        }
        this.playerChannels.clear();
        this.p2pRoomsByCode.clear();
        this.p2pCodeByHostPlayer.clear();

        if (this.io) {
            this.io.close();
        }
        if (this.httpServer) {
            this.httpServer.close();
        }

        // Cleanup simulation
        this.simulationLoop.destroy();

        this.started = false;
        this.startupComplete = false;
        console.log('GameServer: Stopped');
    }

    /**
     * Handle player connection.
     */
    private onPlayerConnect(channel: ServerTransportChannel): void {
        const playerId = channel.id;

        if (this.playerChannels.size >= this.config.maxPlayers) {
            console.log(`GameServer: Rejecting player ${playerId} - server full`);
            channel.disconnect(true);
            return;
        }

        console.log(`GameServer: Player connected: ${playerId}`);
        const connectionMeta = channel.connectionMeta();
        console.log('GameServer: Transport/session', {
            playerId,
            transport: connectionMeta.transport,
            recovered: connectionMeta.recovered,
            address: connectionMeta.address,
            forwardedFor: connectionMeta.forwardedFor,
            userAgent: connectionMeta.userAgent,
        });

        // Store channel
        this.playerChannels.set(playerId, channel);

        // Add to broadcaster
        const client: ConnectedClient = {
            id: playerId,
            playerId,
            channel,
            lastAckedTick: tick(0),
            lastSentSnapshotTick: tick(0),
            lastSentFullSnapshotTick: tick(0),
            lastProcessedInputSeq: -1,
        };
        this.stateBroadcaster.addClient(client);


        // Setup message handlers
        // Raw for high-frequency game inputs
        channel.on('bin', (data: unknown) => {
            const buffer = normalizeBinaryData(data);
            if (buffer) {
                this.onMessage(playerId, buffer);
            }
        });

        // Named events for lobby/auth
        channel.on('auth', (data: any) => {
            console.log(`GameServer: Auth request from ${playerId}`, data);
            // TODO: Verify signature
            const walletKey = data.publicKey;
            const displayName =
                sanitizeDisplayName(data.displayName) ??
                (walletKey ? this.playerNameStore.get(walletKey) : null);
            if (displayName) {
                this.matchmaker.setPlayerName(playerId as any, displayName);
                if (walletKey) {
                    this.playerNameStore.set(walletKey, displayName);
                }
            }
            this.matchmaker.setPlayerWallet(playerId as any, walletKey);

            // Store wallet key
            // this.players.get(playerId).walletKey = walletKey; 

            // Send initial lobby state
            this.emitLobbyAndSocialState(playerId);
        });

        channel.on('join_queue', (data: any) => {
            console.log(`GameServer: Join queue request from ${playerId}`, data);
            const walletKey = data.walletKey;
            const requestedMode = typeof data.mode === 'string' ? data.mode : '1v1';
            const normalizedMode = (requestedMode === '1v1' ? '1v1' : '1v1') as GameMode;
            const transport = normalizedMode === '1v1' && data.transport === 'p2p' ? 'p2p' : 'socket';
            const displayName =
                sanitizeDisplayName(data.displayName) ??
                (walletKey ? this.playerNameStore.get(walletKey) : null);
            if (displayName) {
                this.matchmaker.setPlayerName(playerId as any, displayName);
                if (walletKey) {
                    this.playerNameStore.set(walletKey, displayName);
                }
            }
            this.matchmaker.enqueue({
                playerId: playerId as any,
                mode: normalizedMode,
                ruleset: data.ruleset ?? 'casual',
                transport,
                wagerAmountSol: typeof data.wagerAmountSol === 'number' ? data.wagerAmountSol : undefined,
                walletKey: data.walletKey,
                selectedLoadoutSlot: typeof data.selectedLoadoutSlot === 'number' ? data.selectedLoadoutSlot : undefined,
            });
            const partyMembers = this.matchmaker.getSocialState(playerId as any).party?.members.map((m) => m.playerId) ?? [playerId];
            for (const memberId of partyMembers) {
                this.emitLobbyAndSocialState(memberId);
            }

            // Check for matches
            const match = this.matchmaker.getMatchForPlayer(playerId as any);
            if (match) {
                this.startMatch(match);
            }
        });

        channel.on('leave_queue', () => {
            this.matchmaker.removeFromQueue(playerId as any);
            const partyMembers = this.matchmaker.getSocialState(playerId as any).party?.members.map((m) => m.playerId) ?? [playerId];
            for (const memberId of partyMembers) {
                this.emitLobbyAndSocialState(memberId);
            }
        });

        channel.on('get_lobby_state', () => {
            this.emitLobbyAndSocialState(playerId);
        });

        channel.on('get_social_state', () => {
            channel.emit('social_state', this.matchmaker.getSocialState(playerId as any));
        });

        channel.on('loadouts_get', (_data: any, ack?: (response: any) => void) => {
            const loadouts = this.matchmaker.getPersistedLoadoutsForPlayer(playerId as any);
            ack?.({ ok: true, loadouts });
        });

        channel.on('loadouts_save', (data: any, ack?: (response: any) => void) => {
            const result = this.matchmaker.savePersistedLoadoutsForPlayer(playerId as any, data?.loadouts);
            ack?.(result);
        });

        channel.on('select_match_loadout', (data: any) => {
            const selection = this.matchmaker.updateMatchLoadoutSelection(playerId as any, {
                slotIndex: typeof data?.slotIndex === 'number' ? data.slotIndex : undefined,
                characterModelId: typeof data?.characterModelId === 'string' ? data.characterModelId : undefined,
                weaponModelId: typeof data?.weaponModelId === 'string' ? data.weaponModelId : undefined,
            });
            if (!selection) return;

            if (typeof selection.characterModelId === 'string') {
                this.simulationLoop.setCharacterModelForPlayer(playerId, selection.characterModelId);
            }
            if (typeof selection.weaponModelId === 'string') {
                this.simulationLoop.setWeaponModelForPlayer(playerId, selection.weaponModelId);
            }

            const matchId = this.matchByPlayerId.get(playerId);
            if (!matchId) return;
            const state = this.preRoundByMatchId.get(matchId);
            if (!state) return;
            for (const id of state.players) {
                const out = this.playerChannels.get(id);
                out?.emit('character_selected', { playerId, characterModelId: selection.characterModelId });
            }
        });

        channel.on('friend_request_send', (data: any, ack?: (response: any) => void) => {
            const toPlayerId = String(data?.toPlayerId ?? '').trim();
            if (!toPlayerId) {
                ack?.({ ok: false, error: 'Missing target player.' });
                return;
            }
            const result = this.matchmaker.sendFriendRequest(playerId as any, toPlayerId as any);
            ack?.(result);
            this.emitLobbyAndSocialState(playerId);
            this.emitLobbyAndSocialState(toPlayerId);
        });

        channel.on('friend_request_accept', (data: any, ack?: (response: any) => void) => {
            const fromPlayerId = String(data?.fromPlayerId ?? '').trim();
            if (!fromPlayerId) {
                ack?.({ ok: false, error: 'Missing requester.' });
                return;
            }
            const result = this.matchmaker.acceptFriendRequest(playerId as any, fromPlayerId as any);
            ack?.(result);
            this.emitLobbyAndSocialState(playerId);
            this.emitLobbyAndSocialState(fromPlayerId);
        });

        channel.on('friend_request_decline', (data: any, ack?: (response: any) => void) => {
            const fromPlayerId = String(data?.fromPlayerId ?? '').trim();
            if (!fromPlayerId) {
                ack?.({ ok: false, error: 'Missing requester.' });
                return;
            }
            const result = this.matchmaker.declineFriendRequest(playerId as any, fromPlayerId as any);
            ack?.(result);
            this.emitLobbyAndSocialState(playerId);
            this.emitLobbyAndSocialState(fromPlayerId);
        });

        channel.on('friend_remove', (data: any, ack?: (response: any) => void) => {
            const friendId = String(data?.friendId ?? '').trim();
            if (!friendId) {
                ack?.({ ok: false, error: 'Missing friend id.' });
                return;
            }
            const result = this.matchmaker.removeFriend(playerId as any, friendId as any);
            ack?.(result);
            this.emitLobbyAndSocialState(playerId);
            this.emitLobbyAndSocialState(friendId);
        });

        channel.on('party_create', (_data: any, ack?: (response: any) => void) => {
            const party = this.matchmaker.createParty(playerId as any);
            ack?.({ ok: true, party });
            for (const member of party.members) {
                this.emitLobbyAndSocialState(member.playerId);
            }
        });

        channel.on('party_leave', (_data: any, ack?: (response: any) => void) => {
            const before = this.matchmaker.getSocialState(playerId as any).party;
            const memberIds = new Set<string>(before?.members.map((member) => member.playerId) ?? []);
            memberIds.add(playerId);
            this.matchmaker.leaveParty(playerId as any);
            ack?.({ ok: true });
            for (const memberId of memberIds) {
                this.emitLobbyAndSocialState(memberId);
            }
        });

        channel.on('party_invite_send', (data: any, ack?: (response: any) => void) => {
            const toPlayerId = String(data?.toPlayerId ?? '').trim();
            if (!toPlayerId) {
                ack?.({ ok: false, error: 'Missing target player.' });
                return;
            }
            const result = this.matchmaker.inviteToParty(playerId as any, toPlayerId as any);
            ack?.(result);
            this.emitLobbyAndSocialState(playerId);
            this.emitLobbyAndSocialState(toPlayerId);
        });

        channel.on('party_invite_respond', (data: any, ack?: (response: any) => void) => {
            const inviteId = String(data?.inviteId ?? '').trim();
            const accept = Boolean(data?.accept);
            if (!inviteId) {
                ack?.({ ok: false, error: 'Missing invite id.' });
                return;
            }

            const existingParty = this.matchmaker.getSocialState(playerId as any).party;
            const priorMembers = new Set<string>(existingParty?.members.map((member) => member.playerId) ?? []);
            priorMembers.add(playerId);

            const result = this.matchmaker.respondToPartyInvite(playerId as any, inviteId, accept);
            ack?.(result);

            const nextParty = this.matchmaker.getSocialState(playerId as any).party;
            const nextMembers = new Set<string>(nextParty?.members.map((member) => member.playerId) ?? []);

            for (const memberId of priorMembers) this.emitLobbyAndSocialState(memberId);
            for (const memberId of nextMembers) this.emitLobbyAndSocialState(memberId);
            this.emitLobbyAndSocialState(playerId);
        });

        channel.on('wager_locked', (data: any) => {
            const matchId = data?.matchId as string | undefined;
            if (!matchId) return;
            const match = this.matchmaker.getMatchById(matchId);
            if (!match || match.ruleset !== 'wager') return;
            const locked = this.wagerLocks.get(matchId) ?? new Set();
            locked.add(playerId);
            this.wagerLocks.set(matchId, locked);
            if (locked.size >= match.players.length) {
                this.wagerLocks.delete(matchId);
                this.beginMatchCountdown(match);
            }
        });

        channel.on('p2p_register_host', (data: any, ack?: (response: any) => void) => {
            const code = sanitizeP2PCode(data?.code);
            const peerId = typeof data?.peerId === 'string' ? data.peerId.trim() : '';
            if (!code || !peerId) {
                ack?.({ ok: false, error: 'invalid_request' });
                return;
            }

            const now = Date.now();
            this.cleanupStaleP2PRooms(now);
            const previousCode = this.p2pCodeByHostPlayer.get(playerId);
            if (previousCode && previousCode !== code) {
                this.p2pRoomsByCode.delete(previousCode);
            }

            const existing = this.p2pRoomsByCode.get(code);
            if (existing && existing.hostPlayerId !== playerId) {
                ack?.({ ok: false, error: 'code_in_use' });
                return;
            }

            this.p2pRoomsByCode.set(code, {
                code,
                hostPlayerId: playerId,
                hostPeerId: peerId,
                mode: '1v1' as GameMode,
                maxPeers: 2,
                createdAtMs: existing?.createdAtMs ?? now,
                lastHeartbeatAtMs: now,
                connectedPlayerIds: existing?.connectedPlayerIds ?? [playerId],
                reservedJoinerIds: existing?.reservedJoinerIds ?? [],
                reservationByPlayerId: existing?.reservationByPlayerId ?? {},
            });
            this.p2pCodeByHostPlayer.set(playerId, code);
            ack?.({ ok: true, code, peerId });
        });

        channel.on('p2p_host_heartbeat', (data: any, ack?: (response: any) => void) => {
            const code = sanitizeP2PCode(data?.code);
            const room = code ? this.p2pRoomsByCode.get(code) : undefined;
            if (!room || room.hostPlayerId !== playerId) {
                ack?.({ ok: false, error: 'room_not_found' });
                return;
            }
            room.lastHeartbeatAtMs = Date.now();
            ack?.({ ok: true });
        });

        channel.on('p2p_request_join', (data: any, ack?: (response: any) => void) => {
            const code = sanitizeP2PCode(data?.code);
            if (!code) {
                ack?.({ ok: false, error: 'invalid_code' });
                return;
            }
            const now = Date.now();
            this.cleanupStaleP2PRooms(now);
            const room = this.p2pRoomsByCode.get(code);
            if (!room) {
                ack?.({ ok: false, error: 'room_not_found' });
                return;
            }
            if (room.hostPlayerId === playerId) {
                ack?.({ ok: false, error: 'cannot_join_own_room' });
                return;
            }
            const hostChannel = this.playerChannels.get(room.hostPlayerId);
            if (!hostChannel || !hostChannel.connected) {
                this.p2pRoomsByCode.delete(code);
                this.p2pCodeByHostPlayer.delete(room.hostPlayerId);
                ack?.({ ok: false, error: 'host_offline' });
                return;
            }

            const reservedActiveCount = room.reservedJoinerIds.filter((id) => {
                const reservedAt = room.reservationByPlayerId[id];
                return Number.isFinite(reservedAt) && (now - reservedAt) < P2P_RESERVATION_TTL_MS;
            }).length;
            const joinedCount = room.connectedPlayerIds.length;
            const alreadyReserved = room.reservedJoinerIds.includes(playerId);
            const alreadyJoined = room.connectedPlayerIds.includes(playerId);
            if (!alreadyReserved && !alreadyJoined && (joinedCount + reservedActiveCount) >= room.maxPeers) {
                ack?.({ ok: false, error: 'room_full' });
                return;
            }

            if (!alreadyReserved && !alreadyJoined) {
                room.reservedJoinerIds.push(playerId);
            }
            room.reservationByPlayerId[playerId] = now;
            room.lastHeartbeatAtMs = now;
            ack?.({
                ok: true,
                code: room.code,
                peerId: room.hostPeerId,
                mode: room.mode,
                maxPeers: room.maxPeers,
            });
        });

        channel.on('p2p_mark_connected', (data: any, ack?: (response: any) => void) => {
            const code = sanitizeP2PCode(data?.code);
            const room = code ? this.p2pRoomsByCode.get(code) : undefined;
            if (!room) {
                ack?.({ ok: false, error: 'room_not_found' });
                return;
            }
            const isHost = room.hostPlayerId === playerId;
            const isReservedJoiner = room.reservedJoinerIds.includes(playerId);
            if (!isHost && !isReservedJoiner) {
                ack?.({ ok: false, error: 'forbidden' });
                return;
            }
            if (!room.connectedPlayerIds.includes(playerId)) {
                room.connectedPlayerIds.push(playerId);
            }
            room.reservedJoinerIds = room.reservedJoinerIds.filter((id) => id !== playerId);
            delete room.reservationByPlayerId[playerId];
            if (room.maxPeers <= 2 && room.connectedPlayerIds.length >= room.maxPeers) {
                this.p2pRoomsByCode.delete(code);
                this.p2pCodeByHostPlayer.delete(room.hostPlayerId);
            }
            ack?.({
                ok: true,
                mode: room.mode,
                connectedPeers: room.connectedPlayerIds.length,
                maxPeers: room.maxPeers,
            });
        });

        channel.on('p2p_release_room', (data: any, ack?: (response: any) => void) => {
            const requestedCode = sanitizeP2PCode(data?.code);
            const hostCode = this.p2pCodeByHostPlayer.get(playerId);
            const code = requestedCode || hostCode || '';
            const room = code ? this.p2pRoomsByCode.get(code) : undefined;
            if (room && room.hostPlayerId === playerId) {
                this.p2pRoomsByCode.delete(code);
                this.p2pCodeByHostPlayer.delete(playerId);
            }
            ack?.({ ok: true });
        });

        channel.on('disconnect', (reason: string, details?: any) => {
            const match = this.matchmaker.getMatchForPlayer(playerId as any);
            const lobbyState = this.matchmaker.getLobbyState(playerId as any);
            console.warn('GameServer: Player socket disconnect', {
                playerId,
                reason,
                transport: connectionMeta.transport,
                connected: channel.connected,
                recovered: connectionMeta.recovered,
                matchId: match?.id,
                lobbyStatus: (lobbyState as any)?.status,
                details: summarizeDisconnectDetails(details),
            });
            this.onPlayerDisconnect(playerId);
        });

        channel.on('pose', (data: any) => {
            if (!CLIENT_POSE_AUTHORITY) return;
            if (!data || !data.position) return;
            const pos = data.position;
            if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return;
            const now = Date.now();
            const last = this.lastAcceptedPoses.get(playerId);
            const dt = Math.max(0.016, last ? (now - last.timeMs) / 1000 : 0.05);
            const dx = pos.x - (last?.position.x ?? pos.x);
            const dy = pos.y - (last?.position.y ?? pos.y);
            const dz = pos.z - (last?.position.z ?? pos.z);
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const maxDist = VALIDATION.maxSpeed * dt * 3.0;

            const inBounds =
                pos.x >= VALIDATION.boundsMin.x && pos.x <= VALIDATION.boundsMax.x &&
                pos.z >= VALIDATION.boundsMin.z && pos.z <= VALIDATION.boundsMax.z &&
                pos.y >= VALIDATION.minY && pos.y <= VALIDATION.maxY;

            if (dist > maxDist || !inBounds) {
                const correction = last?.position;
                if (correction) {
                    channel.emit('server_correction', { position: correction });
                }
                return;
            }

            this.lastAcceptedPoses.set(playerId, { position: { x: pos.x, y: pos.y, z: pos.z }, timeMs: now });
            this.latestClientPoses.set(playerId, {
                position: { x: pos.x, y: pos.y, z: pos.z },
                velocity: data.velocity,
                rotation: data.rotation,
                isGrounded: typeof data.isGrounded === 'boolean' ? data.isGrounded : undefined,
                timeMs: now
            });
        });

        // DO NOT SPAWN PLAYER YET
        // The player is in "Lobby" state.
        // Entity will be created when match starts.

    }

    /**
     * Handle player disconnect.
     */
    private onPlayerDisconnect(playerId: string): void {
        console.log(`GameServer: Player disconnected: ${playerId}`);
        this.publicMatchmaking.handleDisconnect(playerId);

        // Handle matchmaking disconnect
        const disbandedMatch = this.matchmaker.handlePlayerDisconnect(playerId as any);
        if (disbandedMatch) {
            this.preRoundByMatchId.delete(disbandedMatch.id);
            for (const id of disbandedMatch.players) {
                this.matchByPlayerId.delete(id);
            }
            for (const remainingPlayerId of disbandedMatch.players) {
                if (remainingPlayerId === playerId) continue;
                const remainingChannel = this.playerChannels.get(remainingPlayerId);
                if (remainingChannel) {
                    remainingChannel.emit('game_message', { type: 'opponent_left', message: 'A teammate/opponent disconnected. Match canceled.' });
                }
                this.emitLobbyAndSocialState(remainingPlayerId);
            }
        }

        // Remove from channels
        this.playerChannels.delete(playerId);
        this.releaseP2PRoomForPlayer(playerId);
        this.latestClientPoses.delete(playerId);
        this.matchByPlayerId.delete(playerId);
        for (const [matchId, state] of this.preRoundByMatchId.entries()) {
            state.loadedPlayers.delete(playerId);
            state.players = state.players.filter((id) => id !== playerId);
            if (state.players.length === 0) {
                this.preRoundByMatchId.delete(matchId);
            }
        }

        // Remove from broadcaster
        this.stateBroadcaster.removeClient(playerId);

        // Remove from input queue
        this.inputQueue.removePlayer(playerId);

        // Remove entity
        const entity = this.simulationLoop.getEntityByPlayerId(playerId);
        if (entity) {
            this.simulationLoop.removeEntity(entity.id);
        }
        this.emitLobbyAndSocialState(playerId);
    }

    private emitLobbyAndSocialState(playerId: string): void {
        const channel = this.playerChannels.get(playerId);
        if (!channel) return;
        channel.emit('lobby_state', this.matchmaker.getLobbyState(playerId as any));
        channel.emit('social_state', this.matchmaker.getSocialState(playerId as any));
    }

    /**
     * Start a match with countdown timer.
     */
    private startMatch(match: any): void {
        console.log(`GameServer: Starting match ${match.id} for players ${match.players.join(', ')}`);
        if (this.startedMatches.has(match.id)) {
            console.warn(`GameServer: Match ${match.id} already started, skipping duplicate start`);
            return;
        }
        this.startedMatches.add(match.id);

        // Send initial "starting" lobby state to all players
        match.players.forEach((playerId: string) => {
            const channel = this.playerChannels.get(playerId);
            if (channel) {
                const opponentId = match.mode === '1v1'
                    ? match.players.find((p: string) => p !== playerId)
                    : undefined;
                const opponentWallet = opponentId ? match.walletKeys[opponentId] : undefined;
                const keyA = match.walletKeys[match.players[0]] ?? match.players[0];
                const keyB = match.walletKeys[match.players[1]] ?? match.players[1];
                const initiatorId = keyA <= keyB ? match.players[0] : match.players[1];
                channel.emit('match_found', {
                    matchId: match.id,
                    mode: match.mode,
                    transport: match.transport,
                    ...(match.transport === 'p2p' ? {
                        p2pCode: match.p2pRoomCode,
                        hostPlayerId: match.hostPlayerId ?? match.players[0],
                        maxPlayers: match.players.length,
                        players: match.players.map((id: string) => ({
                            playerId: id,
                            teamId: match.teamByPlayer?.[id] ?? 1,
                        })),
                    } : {}),
                    ruleset: match.ruleset,
                    wagerAmountSol: match.wagerAmountSol,
                    opponentWallet,
                    lockRole: playerId === initiatorId ? 'init' : 'join',
                });
            }
        });

        if (match.transport === 'p2p') {
            return;
        }

        if (match.ruleset === 'wager') {
            this.wagerLocks.set(match.id, new Set());
            return;
        }

        this.beginMatchCountdown(match);
    }

    private resolveClientDistDir(): string | null {
        const candidates = [
            path.resolve(process.cwd(), 'packages', 'client', 'dist'),
            path.resolve(process.cwd(), '..', 'client', 'dist'),
            path.resolve(process.cwd(), '..', '..', 'client', 'dist'),
        ];
        for (const candidate of candidates) {
            if (fs.existsSync(path.join(candidate, 'index.html'))) {
                return candidate;
            }
        }
        return null;
    }

    private getContentType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        switch (ext) {
            case '.html': return 'text/html; charset=utf-8';
            case '.js': return 'text/javascript; charset=utf-8';
            case '.css': return 'text/css; charset=utf-8';
            case '.json': return 'application/json; charset=utf-8';
            case '.svg': return 'image/svg+xml';
            case '.png': return 'image/png';
            case '.jpg':
            case '.jpeg': return 'image/jpeg';
            case '.webp': return 'image/webp';
            case '.ico': return 'image/x-icon';
            case '.map': return 'application/json; charset=utf-8';
            default: return 'application/octet-stream';
        }
    }

    private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const method = req.method ?? 'GET';
        const rawUrl = req.url ?? '/';
        const url = new URL(rawUrl, 'http://localhost');
        const pathname = decodeURIComponent(url.pathname);

        if (pathname.startsWith(MATCHMAKING_API_PREFIX) && method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Cache-Control': 'no-store',
            });
            res.end();
            return;
        }

        if (pathname.startsWith('/socket.io')) {
            return;
        }

        if (pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ status: 'ok' }));
            return;
        }

        if (pathname === '/api/ice-servers' && method === 'GET') {
            try {
                const iceServers = await this.getIceServersForClient();
                res.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store',
                });
                res.end(JSON.stringify({ iceServers }));
            } catch (error) {
                console.warn('GameServer: Failed to serve ICE servers', error);
                res.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store',
                });
                res.end(JSON.stringify({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }));
            }
            return;
        }

        if (pathname === `${MATCHMAKING_API_PREFIX}/enqueue` && method === 'POST') {
            const body = await this.readJsonBody(req, res);
            if (body === null) return;
            const mode = sanitizePublicMatchmakingMode(body.mode);
            const playerId = String(body.playerId ?? '').trim();
            const buildVersion = String(body.buildVersion ?? '').trim();
            if (!mode || !playerId || !buildVersion || !this.playerChannels.has(playerId)) {
                this.writeJson(res, 400, { error: 'invalid_request' });
                return;
            }
            const response = this.publicMatchmaking.enqueue({
                playerId,
                peerId: typeof body.peerId === 'string' ? body.peerId : '',
                displayName: sanitizeDisplayName(body.displayName) ?? playerId,
                mode,
                region: typeof body.region === 'string' ? body.region : 'global',
                buildVersion,
            });
            this.writeJson(res, 200, response);
            return;
        }

        if (pathname === `${MATCHMAKING_API_PREFIX}/status` && method === 'GET') {
            const ticketId = String(url.searchParams.get('ticketId') ?? '').trim();
            if (!ticketId) {
                this.writeJson(res, 400, { error: 'missing_ticket' });
                return;
            }
            this.writeJson(res, 200, this.publicMatchmaking.getStatus(ticketId));
            return;
        }

        if (pathname === `${MATCHMAKING_API_PREFIX}/heartbeat` && method === 'POST') {
            const body = await this.readJsonBody(req, res);
            if (body === null) return;
            const ticketId = String(body.ticketId ?? '').trim();
            if (!ticketId) {
                this.writeJson(res, 400, { error: 'missing_ticket' });
                return;
            }
            this.writeJson(res, 200, this.publicMatchmaking.heartbeat(ticketId));
            return;
        }

        if (pathname === `${MATCHMAKING_API_PREFIX}/cancel` && method === 'POST') {
            const body = await this.readJsonBody(req, res);
            if (body === null) return;
            const ticketId = String(body.ticketId ?? '').trim();
            if (!ticketId) {
                this.writeJson(res, 400, { error: 'missing_ticket' });
                return;
            }
            this.writeJson(res, 200, this.publicMatchmaking.cancel(ticketId));
            return;
        }

        if (pathname === `${MATCHMAKING_API_PREFIX}/report-connected` && method === 'POST') {
            const body = await this.readJsonBody(req, res);
            if (body === null) return;
            const ticketId = String(body.ticketId ?? '').trim();
            if (!ticketId) {
                this.writeJson(res, 400, { error: 'missing_ticket' });
                return;
            }
            this.writeJson(res, 200, this.publicMatchmaking.reportConnected(ticketId));
            return;
        }

        if (pathname === `${MATCHMAKING_API_PREFIX}/report-failed` && method === 'POST') {
            const body = await this.readJsonBody(req, res);
            if (body === null) return;
            const ticketId = String(body.ticketId ?? '').trim();
            if (!ticketId) {
                this.writeJson(res, 400, { error: 'missing_ticket' });
                return;
            }
            this.writeJson(res, 200, this.publicMatchmaking.reportFailed(ticketId));
            return;
        }

        if (pathname === `${MATCHMAKING_API_PREFIX}/report-live` && method === 'POST') {
            const body = await this.readJsonBody(req, res);
            if (body === null) return;
            const roomId = String(body.roomId ?? '').trim();
            if (!roomId) {
                this.writeJson(res, 400, { error: 'missing_room' });
                return;
            }
            this.writeJson(res, 200, this.publicMatchmaking.reportLive(roomId));
            return;
        }

        if (pathname === `${MATCHMAKING_API_PREFIX}/verify-join` && method === 'POST') {
            const body = await this.readJsonBody(req, res);
            if (body === null) return;
            const roomId = String(body.roomId ?? '').trim();
            const matchId = String(body.matchId ?? '').trim();
            const playerId = String(body.playerId ?? '').trim();
            const matchToken = String(body.matchToken ?? '').trim();
            if (!roomId || !matchId || !playerId || !matchToken) {
                this.writeJson(res, 400, { ok: false, error: 'invalid_request' });
                return;
            }
            this.writeJson(res, 200, this.publicMatchmaking.verifyJoin(roomId, matchId, playerId, matchToken));
            return;
        }

        if (pathname.startsWith(`${MATCHMAKING_API_PREFIX}/room/`) && method === 'GET') {
            const roomId = pathname.slice(`${MATCHMAKING_API_PREFIX}/room/`.length).trim();
            if (!roomId) {
                this.writeJson(res, 400, { error: 'missing_room' });
                return;
            }
            const room = this.publicMatchmaking.getRoom(roomId);
            this.writeJson(res, room ? 200 : 404, room ?? { error: 'room_not_found' });
            return;
        }

        if (!this.clientDistDir || (method !== 'GET' && method !== 'HEAD')) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
            return;
        }

        const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const candidatePath = path.resolve(this.clientDistDir, relativePath);
        const normalizedRoot = path.resolve(this.clientDistDir);
        if (!candidatePath.startsWith(normalizedRoot)) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Forbidden');
            return;
        }

        let filePath = candidatePath;
        let stat: fs.Stats | null = null;
        try {
            stat = await fsp.stat(filePath);
        } catch {
            stat = null;
        }

        if (!stat || !stat.isFile()) {
            filePath = path.join(this.clientDistDir, 'index.html');
            try {
                stat = await fsp.stat(filePath);
            } catch {
                stat = null;
            }
        }

        if (!stat || !stat.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
            return;
        }

        const contentType = this.getContentType(filePath);
        if (method === 'HEAD') {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
            });
            res.end();
            return;
        }

        const body = await fsp.readFile(filePath);
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': filePath.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
        });
        res.end(body);
    }

    private async readJsonBody(req: http.IncomingMessage, res: http.ServerResponse): Promise<any | null> {
        const chunks: Buffer[] = [];
        try {
            for await (const chunk of req) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            const raw = Buffer.concat(chunks).toString('utf8').trim();
            if (!raw) return {};
            return JSON.parse(raw);
        } catch {
            this.writeJson(res, 400, { error: 'invalid_json' });
            return null;
        }
    }

    private writeJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
        res.writeHead(statusCode, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify(payload));
    }

    private normalizeIceServers(raw: unknown): IceServerConfig[] {
        if (!Array.isArray(raw)) return [];
        const out: IceServerConfig[] = [];
        for (const entry of raw) {
            if (!entry || typeof entry !== 'object') continue;
            const urls = (entry as any).urls;
            const hasStringUrls = typeof urls === 'string' && urls.trim().length > 0;
            const hasArrayUrls = Array.isArray(urls) && urls.some((u) => typeof u === 'string' && u.trim().length > 0);
            if (!hasStringUrls && !hasArrayUrls) continue;
            const normalized: IceServerConfig = { urls };
            if (typeof (entry as any).username === 'string') normalized.username = (entry as any).username;
            if (typeof (entry as any).credential === 'string') normalized.credential = (entry as any).credential;
            if (typeof (entry as any).credentialType === 'string') normalized.credentialType = (entry as any).credentialType;
            out.push(normalized);
        }
        return out;
    }

    private async getIceServersForClient(): Promise<IceServerConfig[]> {
        const now = Date.now();
        if (this.cachedIceServers && now < this.cachedIceServersExpiresAtMs) {
            return this.cachedIceServers;
        }
        if (this.iceServerFetchPromise) return this.iceServerFetchPromise;
        this.iceServerFetchPromise = this.fetchIceServersFromTwilio()
            .catch((error) => {
                console.warn('GameServer: ICE server fetch failed, falling back to STUN', error);
                return [{ urls: 'stun:stun.l.google.com:19302' }];
            })
            .finally(() => {
                this.iceServerFetchPromise = null;
            });
        return this.iceServerFetchPromise;
    }

    private async fetchIceServersFromTwilio(): Promise<IceServerConfig[]> {
        const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
        const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
        const ttlRaw = Number.parseInt(process.env.TWILIO_TURN_TTL ?? '3600', 10);
        const ttlSec = Number.isFinite(ttlRaw) ? Math.max(300, Math.min(ttlRaw, 86400)) : 3600;

        if (!sid || !authToken) {
            const fallback = [{ urls: 'stun:stun.l.google.com:19302' }];
            this.cachedIceServers = fallback;
            this.cachedIceServersExpiresAtMs = Date.now() + 5 * 60_000;
            return fallback;
        }

        const authHeader = Buffer.from(`${sid}:${authToken}`).toString('base64');
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Tokens.json`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ Ttl: String(ttlSec) }),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Twilio token request failed (${response.status}): ${text.slice(0, 300)}`);
        }

        const payload = await response.json() as { ice_servers?: unknown };
        const iceServers = this.normalizeIceServers(payload.ice_servers);
        if (iceServers.length === 0) {
            throw new Error('Twilio token response had no usable ice_servers');
        }

        this.cachedIceServers = iceServers;
        this.cachedIceServersExpiresAtMs = Date.now() + Math.max(60, ttlSec - 30) * 1000;
        return iceServers;
    }

    private beginMatchCountdown(match: any): void {
        // Countdown from 3 to 0
        let countdown = 3;
        const countdownInterval = setInterval(() => {
            // Send countdown update to all players
            match.players.forEach((playerId: string) => {
                const channel = this.playerChannels.get(playerId);
                if (channel) {
                    const lobbyState = this.matchmaker.getLobbyState(playerId as any);
                    // Create new state with updated countdown
                    const updatedState = { ...lobbyState, countdownSec: countdown };
                    channel.emit('lobby_state', updatedState);
                }
            });

            countdown--;

            // When countdown reaches 0, spawn players and start game
            if (countdown < 0) {
                clearInterval(countdownInterval);

                this.simulationLoop.configureMatch({
                    mode: match.mode,
                    targetScore: typeof match.targetScore === 'number' ? match.targetScore : undefined,
                    teamByPlayer: match.teamByPlayer,
                });

                const teamSpawnAnchors = {
                    1: this.simulationLoop.getTeamSpawn(1),
                    2: this.simulationLoop.getTeamSpawn(2),
                } as const;
                const formationOffsets = [
                    { x: -2.5, z: -2.5 },
                    { x: 2.5, z: -2.5 },
                    { x: -2.5, z: 2.5 },
                    { x: 2.5, z: 2.5 },
                ] as const;
                const spawnIndices = { 1: 0, 2: 0 };

                // Spawn players at designated positions
                const spawnPositions: { [key: string]: { x: number, y: number, z: number } } = {};
                match.players.forEach((playerId: string, index: number) => {
                    const teamId = Number(match.teamByPlayer?.[playerId] ?? 1) === 2 ? 2 : 1;
                    const anchor = teamSpawnAnchors[teamId];
                    const slotIndex = spawnIndices[teamId] % formationOffsets.length;
                    spawnIndices[teamId] += 1;
                    const offset = formationOffsets[slotIndex] ?? { x: 0, z: 0 };
                    const spawn = {
                        x: anchor.x + offset.x,
                        y: anchor.y,
                        z: anchor.z + offset.z,
                    };
                    spawnPositions[playerId] = spawn;
                    const existing = this.simulationLoop.getEntityByPlayerId(playerId);
                    if (!existing) {
                        this.simulationLoop.createPlayerEntity(playerId, spawnPositions[playerId], teamId);
                        const selectedLoadout = match.playerLoadouts?.[playerId];
                        if (selectedLoadout?.characterModelId) {
                            this.simulationLoop.setCharacterModelForPlayer(playerId, selectedLoadout.characterModelId);
                        }
                        if (selectedLoadout?.weaponModelId) {
                            this.simulationLoop.setWeaponModelForPlayer(playerId, selectedLoadout.weaponModelId);
                        }
                        console.log(`GameServer: Spawning player ${playerId} team=${teamId} at (${JSON.stringify(spawnPositions[playerId])})`);
                    } else {
                        console.warn(`GameServer: Player ${playerId} already has entity ${existing.id}, skipping spawn`);
                    }
                });

                this.preRoundByMatchId.set(match.id, {
                    players: [...match.players],
                    loadedPlayers: new Set(),
                    started: false,
                    durationSec: PRE_ROUND_COUNTDOWN_SEC,
                    endTick: null,
                    endedBroadcast: false,
                });
                for (const playerId of match.players as string[]) {
                    this.matchByPlayerId.set(playerId, match.id);
                }

                // Notify each player with their spawn position and opponent info
                match.players.forEach((playerId: string) => {
                    const channel = this.playerChannels.get(playerId);
                    if (channel) {
                        const opponent = match.mode === '1v1'
                            ? match.players.find((p: string) => p !== playerId)
                            : undefined;
                        channel.emit('match_start', {
                            spawnPosition: spawnPositions[playerId],
                            teamId: match.teamByPlayer?.[playerId] ?? 1,
                            mode: match.mode,
                            targetScore: match.targetScore,
                            opponent: opponent,
                            opponentSpawnPosition: opponent ? spawnPositions[opponent] : null,
                            allPlayers: match.players.map((pid: string) => ({
                                playerId: pid,
                                teamId: match.teamByPlayer?.[pid] ?? 1,
                                spawnPosition: spawnPositions[pid],
                            })),
                        });
                    }
                });

                console.log(`GameServer: Match ${match.id} started, players spawned`);
            }
        }, 1000); // Update every second
    }

    /**
     * Handle incoming message from client.
     */
    private onMessage(playerId: string, data: ArrayBuffer): void {
        try {
            const view = new Uint8Array(data);
            if (view[0] === 123) {
                const msg = deserializeClientMessage(data);
                this.handleClientMessage(playerId, msg);
                return;
            }
            const { type, payload } = unwrapBinaryMessage(data);

            switch (type) {
                case BinaryMessageType.Input:
                    this.handleInput(playerId, payload);
                    break;

                case BinaryMessageType.InputBatch:
                    this.handleInputBatch(playerId, payload);
                    break;

                case BinaryMessageType.InputAck:
                    this.handleAck(playerId, payload);
                    break;

                case BinaryMessageType.Ping:
                    this.handlePing(playerId, payload);
                    break;

                case BinaryMessageType.ClientEvent:
                    this.handleClientMessage(playerId, deserializeClientMessage(payload));
                    break;

                default:
                    console.warn(`GameServer: Unknown message type: ${type}`);
            }
        } catch (e) {
            console.error(`GameServer: Error processing message from ${playerId}:`, e);
        }
    }

    private handleClientMessage(playerId: string, message: ClientMessage): void {
        switch (message.type) {
            case 'shoot': {
                this.simulationLoop.queueShot(playerId, {
                    playerId,
                    shotId: message.shotId,
                    origin: message.origin,
                    dir: message.dir,
                    time: message.time,
                    ...(message.weaponId ? { weaponId: message.weaponId } : {}),
                });
                break;
            }
            case 'map_loaded': {
                this.handleMapLoaded(playerId);
                break;
            }
            case 'select_character': {
                const characterModelId = String(message.characterModelId ?? '').toLowerCase();
                if (!CHARACTER_MODELS.includes(characterModelId as (typeof CHARACTER_MODELS)[number])) {
                    break;
                }
                this.simulationLoop.setCharacterModelForPlayer(playerId, characterModelId);
                const matchId = this.matchByPlayerId.get(playerId);
                if (!matchId) break;
                const state = this.preRoundByMatchId.get(matchId);
                if (!state) break;
                for (const id of state.players) {
                    const channel = this.playerChannels.get(id);
                    channel?.emit('character_selected', { playerId, characterModelId });
                }
                break;
            }
            default:
                break;
        }
    }

    private handleMapLoaded(playerId: string): void {
        const matchId = this.matchByPlayerId.get(playerId);
        if (!matchId) return;
        const state = this.preRoundByMatchId.get(matchId);
        if (!state || state.started) return;
        state.loadedPlayers.add(playerId);
        if (state.loadedPlayers.size < state.players.length) {
            return;
        }

        const endTick = this.simulationLoop.setInputLockForPlayers(state.players, state.durationSec);
        state.started = true;
        state.endTick = endTick;
        state.endedBroadcast = false;

        for (const id of state.players) {
            const channel = this.playerChannels.get(id);
            if (!channel) continue;
            channel.emit('preround_start', {
                durationSec: state.durationSec,
                endTick,
                availableCharacterModelIds: [...CHARACTER_MODELS],
            });
        }
    }

    /**
     * Handle single input message.
     */
    private handleInput(playerId: string, data: ArrayBuffer): void {
        const input = deserializeInput(data);
        this.inputQueue.addInput(playerId, input);
    }

    /**
     * Handle batched inputs.
     */
    private handleInputBatch(playerId: string, data: ArrayBuffer): void {
        const inputs = deserializeInputBatch(data);
        for (const input of inputs) {
            this.inputQueue.addInput(playerId, input);
        }
    }

    /**
     * Handle client ack.
     */
    private handleAck(playerId: string, data: ArrayBuffer): void {
        const ack = deserializeInputAck(data);
        this.stateBroadcaster.handleClientAck(playerId, ack.processedAtTick);
    }

    /**
     * Handle ping request.
     */
    private handlePing(playerId: string, data: ArrayBuffer): void {
        const channel = this.playerChannels.get(playerId);
        if (!channel) return;

        // Echo back with server time
        const view = new DataView(data);
        const clientTime = view.getFloat64(0, true);

        const pong = new ArrayBuffer(16);
        const pongView = new DataView(pong);
        pongView.setFloat64(0, clientTime, true);
        pongView.setFloat64(8, Date.now(), true);

        channel.emit('bin', wrapBinaryMessage(BinaryMessageType.Pong, pong));
    }

    /**
     * Execute a simulation tick.
     */
    private onTick(currentTick: Tick, deltaMs: number): void {
        // Run simulation
        this.simulationLoop.tick(currentTick);

        // Apply client-authoritative poses (demo mode)
        if (CLIENT_POSE_AUTHORITY) {
            for (const [playerId, pose] of this.latestClientPoses.entries()) {
                if (this.simulationLoop.isInputLockedForPlayer(playerId)) {
                    continue;
                }
                const entity = this.simulationLoop.getEntityByPlayerId(playerId);
                if (!entity) continue;
                entity.position = { x: pose.position.x, y: pose.position.y, z: pose.position.z };
                if (pose.rotation) {
                    entity.rotation = { x: pose.rotation.x, y: pose.rotation.y, z: pose.rotation.z, w: pose.rotation.w };
                }
                if (pose.velocity) {
                    entity.velocity = { x: pose.velocity.x, y: pose.velocity.y, z: pose.velocity.z };
                } else {
                    entity.velocity = { x: 0, y: 0, z: 0 };
                }
                if (pose.isGrounded !== undefined) {
                    entity.isGrounded = pose.isGrounded;
                }
            }
        }

        const nowMs = Date.now();
        if (nowMs - this.lastP2PRoomCleanupAtMs >= P2P_ROOM_CLEANUP_INTERVAL_MS) {
            this.cleanupStaleP2PRooms(nowMs);
            this.lastP2PRoomCleanupAtMs = nowMs;
        }

        for (const state of this.preRoundByMatchId.values()) {
            if (!state.started || state.endedBroadcast || state.endTick === null) continue;
            if (currentTick < state.endTick) continue;
            state.endedBroadcast = true;
            for (const playerId of state.players) {
                const channel = this.playerChannels.get(playerId);
                channel?.emit('preround_end', {});
            }
        }

        // Create and broadcast snapshot
        const snapshot = this.simulationLoop.createSnapshot();
        this.stateBroadcaster.processSnapshot(snapshot);

        // Send input acks
        for (const playerId of this.inputQueue.getPlayerIds()) {
            const lastSeq = this.simulationLoop.getLastProcessedInputSeq(playerId);
            const client = this.stateBroadcaster.getClientByPlayerId(playerId);
            if (
                client &&
                lastSeq > client.lastProcessedInputSeq &&
                currentTick - (client.lastInputAckSentTick ?? tick(0)) >= INPUT_ACK_INTERVAL_TICKS
            ) {
                this.stateBroadcaster.sendInputAck(client.id, lastSeq, currentTick);
            }
        }

        // Broadcast combat/server events
        const messages = this.simulationLoop.drainServerMessages();
        for (const msg of messages) {
            this.broadcastServerMessage(msg);
        }
    }

    private broadcastServerMessage(message: ServerMessage): void {
        if (!this.io) return;

        if (message.type === 'event' && message.event?.type === 'player_spawned') {
            const entity = this.simulationLoop.getEntity(message.event.entityId as any);
            const playerId = entity?.playerId;
            if (playerId) {
                this.latestClientPoses.delete(playerId);
                this.lastAcceptedPoses.delete(playerId);
                const channel = this.playerChannels.get(playerId);
                if (channel) {
                    channel.emit('server_correction', { position: message.event.position });
                }
            }
        }

        if (message.type === 'match_ended') {
            this.latestClientPoses.clear();
            this.lastAcceptedPoses.clear();
            const winnerId = message.winnerId;
            let match = this.matchmaker.getMatchForPlayer(winnerId as any);
            if (!match) {
                const scoreKeys = Object.keys(message.scores ?? {});
                for (const key of scoreKeys) {
                    if (key.startsWith('team_')) continue;
                    match = this.matchmaker.getMatchForPlayer(key as any);
                    if (match) break;
                }
            }
            if (match) {
                this.preRoundByMatchId.delete(match.id);
                for (const playerId of match.players) {
                    this.matchByPlayerId.delete(playerId);
                }
            }
            if (match && match.ruleset === 'wager' && match.wagerAmountSol && !this.wagerPayouts.has(match.id)) {
                this.wagerPayouts.add(match.id);
                const winnerWallet = match.walletKeys[winnerId];
                if (!this.wagerAuthorityKeypair || !this.solanaConnection || !this.wagerProgramId || !this.wagerFeeWallet) {
                    console.error('GameServer: Wager program not configured; payout skipped.');
                    const channel = this.playerChannels.get(winnerId);
                    channel?.emit('game_message', { severity: 'error', message: 'Payout failed: wager program not configured.' });
                    this.matchmaker.removeMatch(match.id);
                } else if (!winnerWallet) {
                    console.error('GameServer: Winner wallet missing; payout skipped.');
                    const channel = this.playerChannels.get(winnerId);
                    channel?.emit('game_message', { severity: 'error', message: 'Payout failed: winner wallet missing.' });
                    this.matchmaker.removeMatch(match.id);
                } else {
                    const potSol = match.wagerAmountSol * 2;
                    const matchSeed = wagerMatchSeedLocal(match.id);
                    const tx = new Transaction().add(
                        buildSettleWagerIx({
                            programId: this.wagerProgramId,
                            authority: this.wagerAuthorityKeypair.publicKey,
                            matchSeed,
                            winner: new PublicKey(winnerWallet),
                            feeWallet: this.wagerFeeWallet,
                        })
                    );
                    sendAndConfirmTransaction(this.solanaConnection, tx, [this.wagerAuthorityKeypair])
                        .then((sig) => {
                            console.log(`GameServer: Wager payout confirmed ${sig}`);
                            const channel = this.playerChannels.get(winnerId);
                            channel?.emit('game_message', { severity: 'success', message: `You won ${potSol} SOL!` });
                        })
                        .catch((error) => {
                            console.error('GameServer: Wager payout failed', error);
                            const channel = this.playerChannels.get(winnerId);
                            channel?.emit('game_message', { severity: 'error', message: 'Payout failed. Please contact support.' });
                        })
                        .finally(() => {
                            this.matchmaker.removeMatch(match.id);
                        });
                }
            } else if (match) {
                this.matchmaker.removeMatch(match.id);
            }
        }

        const data = wrapBinaryMessage(BinaryMessageType.ServerEvent, serializeServerMessage(message));
        for (const channel of this.playerChannels.values()) {
            channel.emit('bin', data);
        }
    }

    /**
     * Get server stats.
     */
    getStats(): GameServerStats {
        const tickStats = this.tickScheduler.stats;
        const broadcastStats = this.stateBroadcaster.getStats();

        return {
            tick: this.tickScheduler.currentTick,
            playerCount: this.playerChannels.size,
            avgTickTime: tickStats.avgTickTime,
            maxTickTime: tickStats.maxTickTime,
            snapshotBufferSize: broadcastStats.snapshotBufferSize,
        };
    }

    /**
     * Check if server is running.
     */
    get isRunning(): boolean {
        return this.started;
    }

    /**
     * Get current tick.
     */
    get currentTick(): Tick {
        return this.tickScheduler.currentTick;
    }

    /**
     * Get player count.
     */
    get playerCount(): number {
        return this.playerChannels.size;
    }

    private releaseP2PRoomForPlayer(playerId: string): void {
        const hostCode = this.p2pCodeByHostPlayer.get(playerId);
        if (hostCode) {
            this.p2pCodeByHostPlayer.delete(playerId);
            this.p2pRoomsByCode.delete(hostCode);
        }
        for (const room of this.p2pRoomsByCode.values()) {
            room.connectedPlayerIds = room.connectedPlayerIds.filter((id) => id !== playerId);
            room.reservedJoinerIds = room.reservedJoinerIds.filter((id) => id !== playerId);
            delete room.reservationByPlayerId[playerId];
        }
    }

    private cleanupStaleP2PRooms(nowMs: number): void {
        for (const [code, room] of this.p2pRoomsByCode.entries()) {
            const hostChannel = this.playerChannels.get(room.hostPlayerId);
            const hostDisconnected = !hostChannel || !hostChannel.connected;
            const heartbeatExpired = nowMs - room.lastHeartbeatAtMs > P2P_ROOM_HEARTBEAT_TTL_MS;
            if (hostDisconnected || heartbeatExpired) {
                this.p2pRoomsByCode.delete(code);
                this.p2pCodeByHostPlayer.delete(room.hostPlayerId);
                continue;
            }
            for (const reservedId of [...room.reservedJoinerIds]) {
                const reservedAt = room.reservationByPlayerId[reservedId];
                if (!Number.isFinite(reservedAt) || (nowMs - reservedAt) > P2P_RESERVATION_TTL_MS) {
                    room.reservedJoinerIds = room.reservedJoinerIds.filter((id) => id !== reservedId);
                    delete room.reservationByPlayerId[reservedId];
                }
            }
        }
    }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new game server.
 */
export function createGameServer(config: GameServerConfig): GameServer {
    return new GameServer(config);
}
