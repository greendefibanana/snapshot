import Peer, { type DataConnection } from 'peerjs';
import { BinaryMessageType, normalizeBinaryData } from '@snapshot/shared';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_PACKET_SIZE_BYTES = 64 * 1024;
const ICE_SERVERS_ENDPOINT = '/api/ice-servers';
const ICE_SERVERS_FETCH_TIMEOUT_MS = 2500;
const ICE_SERVERS_CACHE_MS = 5 * 60_000;
const P2P_UNRELIABLE = String((import.meta as any).env?.VITE_P2P_UNRELIABLE ?? '').toLowerCase() === 'true';
const DEFAULT_MESH_CLIENT_MAX_RETRIES = 3;
const DEFAULT_MESH_CLIENT_RETRY_DELAY_MS = 2_000;

type MeshOpenListener = () => void;
type MeshCloseListener = (reason?: string) => void;
type MeshErrorListener = (error: unknown) => void;
type MeshPeerOpenListener = (peerId: string) => void;
type MeshPeerCloseListener = (peerId: string, reason?: string) => void;
type MeshMessageListener = (peerId: string, payload: ArrayBuffer) => void;

let cachedServerIceServers: RTCIceServer[] | null = null;
let cachedServerIceServersAtMs = 0;
let inFlightIceServersFetch: Promise<RTCIceServer[] | null> | null = null;

function sanitizeCode(code: string): string {
    return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function normalizeIceServers(raw: unknown): RTCIceServer[] {
    if (!Array.isArray(raw)) return [];
    const out: RTCIceServer[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        if (!('urls' in (entry as any))) continue;
        out.push(entry as RTCIceServer);
    }
    return out;
}

function readEnvIceServers(): RTCIceServer[] {
    const rawIceJson = (import.meta.env.VITE_ICE_SERVERS_JSON as string | undefined)?.trim();
    const turnUrl = (import.meta.env.VITE_TURN_URL as string | undefined)?.trim();
    const turnUsername = (import.meta.env.VITE_TURN_USERNAME as string | undefined)?.trim();
    const turnCredential = (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined)?.trim();
    const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
    if (rawIceJson) {
        try {
            const parsed = JSON.parse(rawIceJson);
            if (Array.isArray(parsed)) {
                for (const entry of parsed) {
                    if (entry && typeof entry === 'object' && 'urls' in (entry as any)) {
                        iceServers.push(entry as RTCIceServer);
                    }
                }
            }
        } catch {
            console.warn('[P2P-MESH] ignoring invalid VITE_ICE_SERVERS_JSON');
        }
    }
    if (turnUrl && turnUsername && turnCredential) {
        iceServers.push({ urls: turnUrl, username: turnUsername, credential: turnCredential });
    }
    return iceServers;
}

async function fetchServerIceServers(): Promise<RTCIceServer[] | null> {
    const now = Date.now();
    if (cachedServerIceServers && now - cachedServerIceServersAtMs < ICE_SERVERS_CACHE_MS) {
        return cachedServerIceServers;
    }
    if (inFlightIceServersFetch) return inFlightIceServersFetch;
    inFlightIceServersFetch = (async () => {
        const abortController = new AbortController();
        const timeout = window.setTimeout(() => abortController.abort(), ICE_SERVERS_FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(ICE_SERVERS_ENDPOINT, {
                method: 'GET',
                cache: 'no-store',
                credentials: 'same-origin',
                signal: abortController.signal,
            });
            if (!response.ok) return null;
            const body = await response.json() as { iceServers?: unknown };
            const normalized = normalizeIceServers(body?.iceServers);
            if (normalized.length === 0) return null;
            cachedServerIceServers = normalized;
            cachedServerIceServersAtMs = Date.now();
            return normalized;
        } catch {
            return null;
        } finally {
            window.clearTimeout(timeout);
        }
    })().finally(() => {
        inFlightIceServersFetch = null;
    });
    return inFlightIceServersFetch;
}

async function getPeerConfig(): Promise<ConstructorParameters<typeof Peer>[1] | undefined> {
    const envIceServers = readEnvIceServers();
    const serverIceServers = await fetchServerIceServers();
    const iceServers = [...envIceServers];
    if (serverIceServers?.length) iceServers.push(...serverIceServers);
    return { config: { iceServers } };
}

/**
 * Pre-warm ICE server cache so the fetch doesn't block transport.connect().
 * Call this early (e.g. at matchmaking enqueue) so servers are cached.
 */
export function prewarmIceServers(): void {
    void fetchServerIceServers().catch(() => undefined);
}

function validatePayload(data: unknown): ArrayBuffer | null {
    const payload = normalizeBinaryData(data);
    if (!payload) return null;
    if (payload.byteLength <= 0 || payload.byteLength > MAX_PACKET_SIZE_BYTES) return null;
    const type = new Uint8Array(payload)[0];
    if (!Object.values(BinaryMessageType).includes(type as any)) return null;
    return payload;
}

function createConnectionOptions(): any {
    const baseOptions: any = {
        reliable: !P2P_UNRELIABLE,
        serialization: 'binary',
    };
    if (P2P_UNRELIABLE) {
        baseOptions.ordered = false;
        baseOptions.maxRetransmits = 0;
    }
    return baseOptions;
}

abstract class BasePeerMeshTransport {
    protected readonly timeoutMs: number;
    protected peer: Peer | null = null;
    protected peerId: string | null = null;
    protected connectedOnce = false;
    protected timeoutHandle: number | null = null;
    protected readonly openListeners = new Set<MeshOpenListener>();
    protected readonly closeListeners = new Set<MeshCloseListener>();
    protected readonly errorListeners = new Set<MeshErrorListener>();
    protected readonly peerOpenListeners = new Set<MeshPeerOpenListener>();
    protected readonly peerCloseListeners = new Set<MeshPeerCloseListener>();
    protected readonly messageListeners = new Set<MeshMessageListener>();

    constructor(timeoutMs: number) {
        this.timeoutMs = timeoutMs;
    }

    onOpen(handler: MeshOpenListener): () => void {
        this.openListeners.add(handler);
        return () => this.openListeners.delete(handler);
    }

    onClose(handler: MeshCloseListener): () => void {
        this.closeListeners.add(handler);
        return () => this.closeListeners.delete(handler);
    }

    onError(handler: MeshErrorListener): () => void {
        this.errorListeners.add(handler);
        return () => this.errorListeners.delete(handler);
    }

    onPeerOpen(handler: MeshPeerOpenListener): () => void {
        this.peerOpenListeners.add(handler);
        return () => this.peerOpenListeners.delete(handler);
    }

    onPeerClose(handler: MeshPeerCloseListener): () => void {
        this.peerCloseListeners.add(handler);
        return () => this.peerCloseListeners.delete(handler);
    }

    onMessage(handler: MeshMessageListener): () => void {
        this.messageListeners.add(handler);
        return () => this.messageListeners.delete(handler);
    }

    get localPeerId(): string | null {
        return this.peerId;
    }

    protected emitOpen(): void {
        for (const listener of this.openListeners) listener();
    }

    protected emitClose(reason?: string): void {
        for (const listener of this.closeListeners) listener(reason);
    }

    protected emitError(error: unknown): void {
        for (const listener of this.errorListeners) listener(error);
    }

    protected emitPeerOpen(peerId: string): void {
        for (const listener of this.peerOpenListeners) listener(peerId);
    }

    protected emitPeerClose(peerId: string, reason?: string): void {
        for (const listener of this.peerCloseListeners) listener(peerId, reason);
    }

    protected emitMessage(peerId: string, payload: ArrayBuffer): void {
        for (const listener of this.messageListeners) listener(peerId, payload);
    }

    protected clearTimeout(): void {
        if (this.timeoutHandle !== null) {
            window.clearTimeout(this.timeoutHandle);
            this.timeoutHandle = null;
        }
    }

    protected startTimeout(onTimeout: () => void): void {
        this.clearTimeout();
        this.timeoutHandle = window.setTimeout(() => {
            if (this.connectedOnce) return;
            const error = new Error('P2P mesh connection timeout after 10 seconds');
            this.emitError(error);
            this.emitClose('timeout');
            onTimeout();
        }, this.timeoutMs);
    }

    protected attachPeerDiagnostics(peer: Peer): void {
        peer.on('disconnected', () => console.warn('[P2P-MESH] peer disconnected'));
        peer.on('close', () => console.warn('[P2P-MESH] peer closed'));
        peer.on('error', (error) => {
            console.error('[P2P-MESH] peer error', error);
            this.emitError(error);
        });
    }

    protected attachIceDiagnostics(conn: DataConnection): void {
        const pc = (conn as any)?.peerConnection as RTCPeerConnection | undefined;
        if (!pc) return;
        const logState = () => {
            console.info('[P2P-MESH] ICE state', {
                peer: conn.peer,
                iceConnectionState: pc.iceConnectionState,
                connectionState: pc.connectionState,
                signalingState: pc.signalingState,
            });
        };
        pc.addEventListener('iceconnectionstatechange', logState);
        pc.addEventListener('connectionstatechange', logState);
        logState();
    }
}

export class PeerMeshHostTransport extends BasePeerMeshTransport {
    private readonly code: string;
    private readonly connections = new Map<string, DataConnection>();

    constructor(code: string, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
        super(timeoutMs);
        this.code = sanitizeCode(code);
    }

    get joinCode(): string {
        return this.code;
    }

    get connectedPeerIds(): string[] {
        return Array.from(this.connections.keys());
    }

    connect(): void {
        if (this.peer) return;
        void this.openPeer();
    }

    private async openPeer(): Promise<void> {
        const config = await getPeerConfig();
        if (this.peer) return;
        this.peer = new Peer(this.code, config);
        this.attachPeerDiagnostics(this.peer);
        this.peer.on('open', (peerId) => {
            this.peerId = peerId;
            this.connectedOnce = true;
            this.emitOpen();
        });
        this.peer.on('connection', (conn) => {
            this.bindConnection(conn);
        });
    }

    private bindConnection(conn: DataConnection): void {
        const peerId = conn.peer;
        this.connections.set(peerId, conn);
        conn.on('open', () => {
            this.attachIceDiagnostics(conn);
            this.emitPeerOpen(peerId);
        });
        conn.on('close', () => {
            this.connections.delete(peerId);
            this.emitPeerClose(peerId, 'peer_closed');
        });
        conn.on('error', (error) => {
            console.error('[P2P-MESH] host datachannel error', { peer: peerId, error });
            this.emitError(error);
        });
        conn.on('data', (data) => {
            const payload = validatePayload(data);
            if (!payload) return;
            this.emitMessage(peerId, payload);
        });
    }

    sendTo(peerId: string, payload: ArrayBuffer): void {
        const conn = this.connections.get(peerId);
        if (!conn?.open) return;
        conn.send(payload);
    }

    broadcast(payload: ArrayBuffer, exceptPeerId?: string): void {
        for (const [peerId, conn] of this.connections) {
            if (exceptPeerId && peerId === exceptPeerId) continue;
            if (!conn.open) continue;
            conn.send(payload);
        }
    }

    getPeerBufferedAmount(peerId: string): number {
        const conn = this.connections.get(peerId);
        const dataChannel = (conn as any)?.dataChannel as RTCDataChannel | undefined;
        return Number(dataChannel?.bufferedAmount ?? 0);
    }

    getMaxBufferedAmount(): number {
        let max = 0;
        for (const peerId of this.connections.keys()) {
            const bufferedAmount = this.getPeerBufferedAmount(peerId);
            if (bufferedAmount > max) max = bufferedAmount;
        }
        return max;
    }

    disconnect(): void {
        this.clearTimeout();
        for (const conn of this.connections.values()) {
            try {
                conn.close();
            } catch {
                // noop
            }
        }
        this.connections.clear();
        if (this.peer) {
            try {
                this.peer.destroy();
            } catch {
                // noop
            }
            this.peer = null;
        }
        this.peerId = null;
    }
}

export class PeerMeshClientTransport extends BasePeerMeshTransport {
    private readonly code: string;
    private readonly targetPeerId: string;
    private readonly maxRetries: number;
    private readonly retryDelayMs: number;
    private conn: DataConnection | null = null;
    private retryCount = 0;
    private disposed = false;

    constructor(
        code: string,
        targetPeerId: string,
        timeoutMs: number = DEFAULT_TIMEOUT_MS,
        maxRetries: number = DEFAULT_MESH_CLIENT_MAX_RETRIES,
        retryDelayMs: number = DEFAULT_MESH_CLIENT_RETRY_DELAY_MS,
    ) {
        super(timeoutMs);
        this.code = sanitizeCode(code);
        this.targetPeerId = targetPeerId.trim();
        this.maxRetries = maxRetries;
        this.retryDelayMs = retryDelayMs;
    }

    connect(): void {
        if (this.peer) return;
        this.disposed = false;
        this.retryCount = 0;
        void this.openPeer();
    }

    private async openPeer(): Promise<void> {
        if (this.disposed) return;
        const config = await getPeerConfig();
        if (this.peer || this.disposed) return;
        this.peer = new Peer(undefined as any, config);
        this.attachPeerDiagnostics(this.peer);
        this.peer.on('open', (peerId) => {
            this.peerId = peerId;
            const conn = this.peer!.connect(this.targetPeerId || this.code, createConnectionOptions());
            this.bindConnection(conn);
            this.startTimeout(() => this.handleTimeout());
        });
        this.peer.on('error', (error) => {
            // If we haven't connected yet, this might be a signaling error — try retry
            if (!this.connectedOnce) {
                console.warn('[P2P-MESH] client peer error before connect', { attempt: this.retryCount, error });
                this.handleTimeout();
            }
        });
    }

    private handleTimeout(): void {
        if (this.disposed) return;
        if (this.connectedOnce) return; // already connected, ignore stale timeout
        if (this.retryCount < this.maxRetries - 1) {
            this.retryCount++;
            console.info(`[P2P-MESH] client retry ${this.retryCount}/${this.maxRetries - 1}, waiting ${this.retryDelayMs}ms...`);
            // Destroy current peer and try again
            this.cleanupCurrentPeer();
            window.setTimeout(() => {
                if (this.disposed || this.connectedOnce) return;
                void this.openPeer();
            }, this.retryDelayMs);
        } else {
            // All retries exhausted
            const error = new Error(`P2P mesh connection failed after ${this.maxRetries} attempts`);
            console.error('[P2P-MESH] client all retries exhausted', error);
            this.emitError(error);
            this.emitClose('timeout');
            this.disconnect();
        }
    }

    private cleanupCurrentPeer(): void {
        this.clearTimeout();
        if (this.conn) {
            try { this.conn.close(); } catch { /* noop */ }
            this.conn = null;
        }
        if (this.peer) {
            try { this.peer.destroy(); } catch { /* noop */ }
            this.peer = null;
        }
        this.peerId = null;
    }

    private bindConnection(conn: DataConnection): void {
        this.conn = conn;
        const peerId = conn.peer;
        conn.on('open', () => {
            this.connectedOnce = true;
            this.clearTimeout();
            this.retryCount = 0;
            this.attachIceDiagnostics(conn);
            this.emitOpen();
            this.emitPeerOpen(peerId);
        });
        conn.on('close', () => {
            this.emitPeerClose(peerId, 'peer_closed');
            this.emitClose('peer_closed');
        });
        conn.on('error', (error) => {
            console.error('[P2P-MESH] client datachannel error', error);
            this.emitError(error);
        });
        conn.on('data', (data) => {
            const payload = validatePayload(data);
            if (!payload) return;
            this.emitMessage(peerId, payload);
        });
    }

    send(payload: ArrayBuffer): void {
        if (!this.conn?.open) return;
        this.conn.send(payload);
    }

    getBufferedAmount(): number {
        const dataChannel = (this.conn as any)?.dataChannel as RTCDataChannel | undefined;
        return Number(dataChannel?.bufferedAmount ?? 0);
    }

    disconnect(): void {
        this.disposed = true;
        this.cleanupCurrentPeer();
    }
}
