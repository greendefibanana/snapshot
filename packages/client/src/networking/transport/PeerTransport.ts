import Peer, { type DataConnection } from 'peerjs';
import { BinaryMessageType, normalizeBinaryData } from '@snapshot/shared';
import type { ITransport } from './GameTransport';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_PACKET_SIZE_BYTES = 64 * 1024;

type Role = 'host' | 'joiner';
type OpenListener = () => void;
type CloseListener = (reason?: string) => void;
type ErrorListener = (error: unknown) => void;
type MessageListener = (payload: ArrayBuffer) => void;

function sanitizeCode(code: string): string {
    const cleaned = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return cleaned.slice(0, 8);
}

function randomCode(length: number = 6): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < length; i++) {
        out += chars[Math.floor(Math.random() * chars.length)]!;
    }
    return out;
}

function getPeerConfig(): ConstructorParameters<typeof Peer>[1] | undefined {
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
            console.warn('[P2P] Ignoring invalid VITE_ICE_SERVERS_JSON');
        }
    }
    if (turnUrl && turnUsername && turnCredential) {
        iceServers.push({
            urls: turnUrl,
            username: turnUsername,
            credential: turnCredential,
        });
    }
    return { config: { iceServers } };
}

export class PeerTransport implements ITransport {
    private readonly role: Role;
    private readonly timeoutMs: number;
    private readonly openListeners = new Set<OpenListener>();
    private readonly closeListeners = new Set<CloseListener>();
    private readonly errorListeners = new Set<ErrorListener>();
    private readonly messageListeners = new Set<MessageListener>();
    private readonly code: string;
    private readonly targetPeerId: string | null;
    private peer: Peer | null = null;
    private conn: DataConnection | null = null;
    private connectedOnce = false;
    private timeoutHandle: number | null = null;

    private constructor(role: Role, code: string, targetPeerId: string | null, timeoutMs: number) {
        this.role = role;
        this.code = code;
        this.targetPeerId = targetPeerId;
        this.timeoutMs = timeoutMs;
    }

    static createHost(code?: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): PeerTransport {
        return new PeerTransport('host', sanitizeCode(code ?? randomCode()), null, timeoutMs);
    }

    static createJoiner(code: string, targetPeerId: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): PeerTransport {
        return new PeerTransport('joiner', sanitizeCode(code), targetPeerId.trim(), timeoutMs);
    }

    get joinCode(): string {
        return this.code;
    }

    get connected(): boolean {
        return !!this.conn?.open;
    }

    connect(): void {
        if (this.peer) return;

        const config = getPeerConfig();
        this.peer = this.role === 'host'
            ? new Peer(this.code, config)
            : new Peer(undefined as any, config);

        this.attachPeerDiagnostics(this.peer);

        this.peer.on('error', (error) => {
            console.error('[P2P] peer error', error);
            this.emitError(error);
        });

        if (this.role === 'host') {
            this.peer.on('open', (id) => {
                console.info('[P2P] host open', { id });
            });
            this.peer.on('connection', (conn) => {
                if (this.conn) {
                    conn.close();
                    return;
                }
                console.info('[P2P] incoming connection', { peer: conn.peer });
                this.bindConnection(conn);
            });
            return;
        }

        this.peer.on('open', (id) => {
            const target = this.targetPeerId || this.code;
            console.info('[P2P] joiner open', { id, code: this.code, target });
            const conn = this.peer!.connect(target, {
                reliable: true,
                serialization: 'binary',
            });
            this.bindConnection(conn);
            this.startTimeout();
        });
    }

    disconnect(): void {
        this.clearTimeout();
        if (this.conn) {
            try {
                this.conn.close();
            } catch {
                // noop
            }
            this.conn = null;
        }
        if (this.peer) {
            try {
                this.peer.destroy();
            } catch {
                // noop
            }
            this.peer = null;
        }
    }

    send(payload: ArrayBuffer): void {
        if (!this.conn?.open) return;
        if (payload.byteLength <= 0 || payload.byteLength > MAX_PACKET_SIZE_BYTES) {
            console.warn('[P2P] Dropping outbound payload with invalid size', payload.byteLength);
            return;
        }
        this.conn.send(payload);
    }

    onMessage(handler: MessageListener): () => void {
        this.messageListeners.add(handler);
        return () => this.messageListeners.delete(handler);
    }

    onOpen(handler: OpenListener): () => void {
        this.openListeners.add(handler);
        return () => this.openListeners.delete(handler);
    }

    onClose(handler: CloseListener): () => void {
        this.closeListeners.add(handler);
        return () => this.closeListeners.delete(handler);
    }

    onError(handler: ErrorListener): () => void {
        this.errorListeners.add(handler);
        return () => this.errorListeners.delete(handler);
    }

    private bindConnection(conn: DataConnection): void {
        this.conn = conn;
        conn.on('open', () => {
            this.connectedOnce = true;
            this.clearTimeout();
            console.info('[P2P] datachannel open', { peer: conn.peer, reliable: conn.reliable });
            this.attachIceDiagnostics(conn);
            this.emitOpen();
        });
        conn.on('close', () => {
            console.warn('[P2P] datachannel closed', { peer: conn.peer });
            this.emitClose('peer_closed');
        });
        conn.on('error', (error) => {
            console.error('[P2P] datachannel error', error);
            this.emitError(error);
        });
        conn.on('data', (data) => {
            const payload = normalizeBinaryData(data);
            if (!payload) {
                console.warn('[P2P] Dropping malformed payload (not binary)');
                return;
            }
            if (payload.byteLength <= 0 || payload.byteLength > MAX_PACKET_SIZE_BYTES) {
                console.warn('[P2P] Dropping malformed payload size', payload.byteLength);
                return;
            }
            const type = new Uint8Array(payload)[0];
            const validType = Object.values(BinaryMessageType).includes(type as any);
            if (!validType) {
                console.warn('[P2P] Dropping malformed payload type', type);
                return;
            }
            for (const listener of this.messageListeners) {
                listener(payload);
            }
        });
    }

    private startTimeout(): void {
        this.clearTimeout();
        this.timeoutHandle = window.setTimeout(() => {
            if (this.connectedOnce) return;
            const error = new Error('P2P connection timeout after 10 seconds');
            this.emitError(error);
            this.emitClose('timeout');
            this.disconnect();
        }, this.timeoutMs);
    }

    private clearTimeout(): void {
        if (this.timeoutHandle !== null) {
            window.clearTimeout(this.timeoutHandle);
            this.timeoutHandle = null;
        }
    }

    private emitOpen(): void {
        for (const listener of this.openListeners) listener();
    }

    private emitClose(reason?: string): void {
        for (const listener of this.closeListeners) listener(reason);
    }

    private emitError(error: unknown): void {
        for (const listener of this.errorListeners) listener(error);
    }

    private attachPeerDiagnostics(peer: Peer): void {
        peer.on('disconnected', () => {
            console.warn('[P2P] peer disconnected');
        });
        peer.on('close', () => {
            console.warn('[P2P] peer closed');
        });
    }

    private attachIceDiagnostics(conn: DataConnection): void {
        const pc = (conn as any)?.peerConnection as RTCPeerConnection | undefined;
        if (!pc) return;
        const logState = () => {
            console.info('[P2P] ICE state', {
                iceConnectionState: pc.iceConnectionState,
                iceGatheringState: pc.iceGatheringState,
                connectionState: pc.connectionState,
                signalingState: pc.signalingState,
            });
        };
        pc.addEventListener('iceconnectionstatechange', logState);
        pc.addEventListener('icegatheringstatechange', logState);
        pc.addEventListener('connectionstatechange', logState);
        pc.addEventListener('signalingstatechange', logState);
        logState();
    }
}
