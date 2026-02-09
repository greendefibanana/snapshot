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
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
    type Tick,
    tick,
    type InputFrame,
    ServerInputQueue,
    deserializeInput,
    deserializeInputBatch,
    deserializeInputAck,
} from '@snapshot/shared/simulation';
import { deserializeClientMessage, serializeServerMessage, type ClientMessage, type ServerMessage } from '@snapshot/shared';

import { TickScheduler, createTickScheduler } from './TickScheduler.js';
import { SimulationLoop, createSimulationLoop } from './SimulationLoop.js';
import {
    StateBroadcaster,
    createStateBroadcaster,
    type ConnectedClient,
    MessageType,
} from './StateBroadcaster.js';
import { SimpleMatchmaker, type Match } from '../services/SimpleMatchmaker.js';
import { PlayerNameStore } from '../services/PlayerNameStore.js';
import { buildSettleWagerIx } from '../services/wagerProgram.js';
import { ServerBVH, mapPathFromCwd } from '../physics/ServerBVH.js';
import { Vector3 } from 'three';

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

// =============================================================================
// MESSAGE PARSING
// =============================================================================

/**
 * Client message types.
 */
const ClientMessageType = {
    Input: 0x01,
    InputBatch: 0x02,
    Ack: 0x03,
    Ping: 0x04,
} as const;

const CLIENT_POSE_AUTHORITY = true;

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

/**
 * Parse client message type.
 */
function parseClientMessage(data: ArrayBuffer): { type: number; payload: ArrayBuffer } {
    const view = new Uint8Array(data);
    const type = view[0]!;
    const payload = data.slice(1);
    return { type, payload };
}

function normalizeRawData(data: unknown): ArrayBuffer | null {
    if (data instanceof ArrayBuffer) {
        return data;
    }
    if (ArrayBuffer.isView(data)) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
    return null;
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
    private playerNameStore: PlayerNameStore;
    private wagerAuthorityKeypair: Keypair | null = null;
    private wagerProgramId: PublicKey | null = null;
    private wagerFeeWallet: PublicKey | null = null;
    private solanaConnection: Connection | null = null;
    private wagerPayouts: Set<string> = new Set();
    private wagerLocks: Map<string, Set<string>> = new Map();

    private playerChannels: Map<string, Socket> = new Map();
    private latestClientPoses: Map<string, { position: { x: number; y: number; z: number }; velocity?: { x: number; y: number; z: number }; rotation?: { x: number; y: number; z: number; w: number }; isGrounded?: boolean; timeMs: number }> = new Map();
    private lastAcceptedPoses: Map<string, { position: { x: number; y: number; z: number }; timeMs: number }> = new Map();
    private lastLagWarningAtMs = 0;
    private bvh: ServerBVH | null = null;
    private started = false;
    private startedMatches: Set<string> = new Set();

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
        this.stateBroadcaster = createStateBroadcaster();

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
        await this.playerNameStore.load();

        if (CLIENT_POSE_AUTHORITY) {
            this.bvh = new ServerBVH();
            const mapPath = mapPathFromCwd();
            console.log(`GameServer: Loading Map2.glb for BVH at ${mapPath}`);
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
            this.onPlayerConnect(socket);
        });

        // Start listening
        await new Promise<void>((resolve) => {
            this.httpServer!.listen(this.config.port, this.config.host, () => resolve());
        });

        console.log(`GameServer: Socket.io listening on ${this.config.host}:${this.config.port}`);

        // Start tick scheduler
        this.tickScheduler.start();

        this.started = true;
        console.log('GameServer: Started successfully');
    }

    /**
     * Stop the game server.
     */
    stop(): void {
        console.log('GameServer: Stopping...');
        void this.playerNameStore.flush();

        // Stop tick scheduler
        this.tickScheduler.stop();

        // Disconnect all players
        for (const channel of this.playerChannels.values()) {
            channel.disconnect(true);
        }
        this.playerChannels.clear();

        if (this.io) {
            this.io.close();
        }
        if (this.httpServer) {
            this.httpServer.close();
        }

        // Cleanup simulation
        this.simulationLoop.destroy();

        this.started = false;
        console.log('GameServer: Stopped');
    }

    /**
     * Handle player connection.
     */
    private onPlayerConnect(channel: Socket): void {
        const playerId = channel.id;

        if (this.playerChannels.size >= this.config.maxPlayers) {
            console.log(`GameServer: Rejecting player ${playerId} - server full`);
            channel.disconnect(true);
            return;
        }

        console.log(`GameServer: Player connected: ${playerId}`);
        console.log('GameServer: Transport/session', {
            playerId,
            transport: (channel as any).conn?.transport?.name,
            recovered: (channel as any).recovered === true,
            address: channel.handshake.address,
            forwardedFor: channel.handshake.headers['x-forwarded-for'],
            userAgent: channel.handshake.headers['user-agent'],
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
            lastProcessedInputSeq: -1,
        };
        this.stateBroadcaster.addClient(client);


        // Setup message handlers
        // Raw for high-frequency game inputs
        channel.on('bin', (data: unknown) => {
            const buffer = normalizeRawData(data);
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

            // Store wallet key
            // this.players.get(playerId).walletKey = walletKey; 

            // Send initial lobby state
            const state = this.matchmaker.getLobbyState(playerId as any);
            channel.emit('lobby_state', state);
        });

        channel.on('join_queue', (data: any) => {
            console.log(`GameServer: Join queue request from ${playerId}`, data);
            const walletKey = data.walletKey;
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
                mode: data.mode,
                ruleset: data.ruleset ?? 'casual',
                wagerAmountSol: typeof data.wagerAmountSol === 'number' ? data.wagerAmountSol : undefined,
                walletKey: data.walletKey
            });

            // Send updated state
            const state = this.matchmaker.getLobbyState(playerId as any);
            channel.emit('lobby_state', state);

            // Check for matches
            const match = this.matchmaker.getMatchForPlayer(playerId as any);
            if (match) {
                this.startMatch(match);
            }
        });

        channel.on('leave_queue', () => {
            this.matchmaker.removeFromQueue(playerId as any);
            const state = this.matchmaker.getLobbyState(playerId as any);
            channel.emit('lobby_state', state);
        });

        channel.on('get_lobby_state', () => {
            const state = this.matchmaker.getLobbyState(playerId as any);
            channel.emit('lobby_state', state);
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

        channel.on('disconnect', (reason: string, details?: any) => {
            const match = this.matchmaker.getMatchForPlayer(playerId as any);
            const lobbyState = this.matchmaker.getLobbyState(playerId as any);
            console.warn('GameServer: Player socket disconnect', {
                playerId,
                reason,
                transport: (channel as any).conn?.transport?.name,
                connected: channel.connected,
                recovered: (channel as any).recovered === true,
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

        // Handle matchmaking disconnect
        const disbandedMatch = this.matchmaker.handlePlayerDisconnect(playerId as any);
        if (disbandedMatch) {
            // Notify opponent
            const opponentId = disbandedMatch.players.find(p => p !== playerId);
            if (opponentId) {
                const opponentChannel = this.playerChannels.get(opponentId);
                if (opponentChannel) {
                    console.log(`GameServer: Notifying opponent ${opponentId} of disconnect`);
                    // Send lobby update to reset state
                    const state = this.matchmaker.getLobbyState(opponentId as any);
                    // Force state to idle/disconnected message
                    // We could also send a specific 'opponent_disconnected' event
                    opponentChannel.emit('lobby_state', state);
                    opponentChannel.emit('game_message', { type: 'opponent_left', message: 'Opponent disconnected' });
                }
            }
        }

        // Remove from channels
        this.playerChannels.delete(playerId);
        this.latestClientPoses.delete(playerId);

        // Remove from broadcaster
        this.stateBroadcaster.removeClient(playerId);

        // Remove from input queue
        this.inputQueue.removePlayer(playerId);

        // Remove entity
        const entity = this.simulationLoop.getEntityByPlayerId(playerId);
        if (entity) {
            this.simulationLoop.removeEntity(entity.id);
        }
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
                const opponentId = match.players.find((p: string) => p !== playerId);
                const opponentWallet = opponentId ? match.walletKeys[opponentId] : undefined;
                const keyA = match.walletKeys[match.players[0]] ?? match.players[0];
                const keyB = match.walletKeys[match.players[1]] ?? match.players[1];
                const initiatorId = keyA <= keyB ? match.players[0] : match.players[1];
                channel.emit('match_found', {
                    matchId: match.id,
                    ruleset: match.ruleset,
                    wagerAmountSol: match.wagerAmountSol,
                    opponentWallet,
                    lockRole: playerId === initiatorId ? 'init' : 'join',
                });
            }
        });

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

        if (pathname.startsWith('/socket.io')) {
            return;
        }

        if (pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ status: 'ok' }));
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

                // Define spawn points on different parts of map_Floor
                // Using positions closer to origin (0,0) to ensure they're on the floor
                // Spread across 4 quadrants to avoid spawning into each other
                const availableSpawnPoints = [
                    { id: 'SpawnPoint1', position: { x: -8, y: 3, z: -8 } },
                    { id: 'SpawnPoint2', position: { x: 8, y: 3, z: -8 } },
                    { id: 'SpawnPoint3', position: { x: -8, y: 3, z: 8 } },
                    { id: 'SpawnPoint4', position: { x: 8, y: 3, z: 8 } },
                ];

                // Randomly assign different spawn points to each player
                const shuffled = [...availableSpawnPoints].sort(() => Math.random() - 0.5);
                const assignedSpawnPoints = shuffled.slice(0, match.players.length);

                // Spawn players at designated positions
                const spawnPositions: { [key: string]: { x: number, y: number, z: number } } = {};
                match.players.forEach((playerId: string, index: number) => {
                    const spawnPoint = assignedSpawnPoints[index];
                    if (!spawnPoint) {
                        console.error(`GameServer: No spawn point available for player ${index}, using fallback`);
                        spawnPositions[playerId] = { x: index * 10, y: 2, z: 0 };
                    } else {
                        spawnPositions[playerId] = spawnPoint.position;
                    }
                    const existing = this.simulationLoop.getEntityByPlayerId(playerId);
                    if (!existing) {
                        this.simulationLoop.createPlayerEntity(playerId, spawnPositions[playerId]);
                        console.log(`GameServer: Spawning player ${playerId} at ${spawnPoint?.id || 'fallback'} (${JSON.stringify(spawnPositions[playerId])})`);
                    } else {
                        console.warn(`GameServer: Player ${playerId} already has entity ${existing.id}, skipping spawn`);
                    }
                });

                // Notify each player with their spawn position and opponent info
                match.players.forEach((playerId: string) => {
                    const channel = this.playerChannels.get(playerId);
                    if (channel) {
                        const opponent = match.players.find((p: string) => p !== playerId);
                        channel.emit('match_start', {
                            spawnPosition: spawnPositions[playerId],
                            opponent: opponent,
                            opponentSpawnPosition: opponent ? spawnPositions[opponent] : null,
                            allPlayers: match.players.map((pid: string) => ({
                                playerId: pid,
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
            const { type, payload } = parseClientMessage(data);

            switch (type) {
                case ClientMessageType.Input:
                    this.handleInput(playerId, payload);
                    break;

                case ClientMessageType.InputBatch:
                    this.handleInputBatch(playerId, payload);
                    break;

                case ClientMessageType.Ack:
                    this.handleAck(playerId, payload);
                    break;

                case ClientMessageType.Ping:
                    this.handlePing(playerId, payload);
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
                    weaponId: message.weaponId,
                });
                break;
            }
            default:
                break;
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

        const pong = new ArrayBuffer(17);
        const pongView = new DataView(pong);
        pongView.setUint8(0, MessageType.Pong);
        pongView.setFloat64(1, clientTime, true);
        pongView.setFloat64(9, Date.now(), true);

        channel.emit('bin', pong);
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

        // Create and broadcast snapshot
        const snapshot = this.simulationLoop.createSnapshot();
        this.stateBroadcaster.processSnapshot(snapshot);

        // Send input acks
        for (const playerId of this.inputQueue.getPlayerIds()) {
            const lastSeq = this.simulationLoop.getLastProcessedInputSeq(playerId);
            const client = this.stateBroadcaster.getClientByPlayerId(playerId);
            if (client && lastSeq > client.lastProcessedInputSeq) {
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
            const match = this.matchmaker.getMatchForPlayer(winnerId as any);
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

        if (message.type === 'score_update' && !this.simulationLoop.isMatchEnded()) {
            const scores = message.scores;
            for (const playerId of Object.keys(scores)) {
                if ((scores[playerId] ?? 0) >= 10) {
                    this.simulationLoop.forceMatchEnded();
                    const endMsg: ServerMessage = {
                        type: 'match_ended',
                        winnerId: playerId,
                        scores,
                        targetScore: 10,
                    };
                    const endData = serializeServerMessage(endMsg);
                    for (const channel of this.playerChannels.values()) {
                        channel.emit('bin', endData);
                    }
                    break;
                }
            }
        }

        const data = serializeServerMessage(message);
        for (const channel of this.playerChannels.values()) {
            channel.emit('bin', data);
        }
    }

    /**
     * Serialize data with message type header.
     */
    private serializeWithType(type: number, snapshot: any): ArrayBuffer {
        const { serializeSnapshot } = require('@snapshot/shared/simulation');
        const data = serializeSnapshot(snapshot);
        const wrapped = new ArrayBuffer(1 + data.byteLength);
        const view = new Uint8Array(wrapped);
        view[0] = type;
        view.set(new Uint8Array(data), 1);
        return wrapped;
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
