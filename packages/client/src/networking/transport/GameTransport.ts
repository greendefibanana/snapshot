import { io, type Socket } from 'socket.io-client';
import { normalizeBinaryData } from '@snapshot/shared';

export interface ITransport {
    readonly connected: boolean;
    connect(): void;
    disconnect(): void;
    send(payload: ArrayBuffer): void;
    onMessage(handler: (payload: ArrayBuffer) => void): () => void;
    onOpen(handler: () => void): () => void;
    onClose(handler: (reason?: string) => void): () => void;
    onError(handler: (error: unknown) => void): () => void;
}

export interface GameTransport {
    readonly id: string | undefined;
    readonly connected: boolean;
    connect(): void;
    disconnect(): void;
    on(event: string, handler: (...args: any[]) => void): void;
    emit(event: string, data: unknown): void;
    emitWithAck<TResponse = any>(event: string, data: unknown, timeoutMs?: number): Promise<TResponse>;
}

export class SocketTransport implements ITransport {
    constructor(private readonly channel: GameTransport) {}

    get connected(): boolean {
        return this.channel.connected;
    }

    connect(): void {
        this.channel.connect();
    }

    disconnect(): void {
        this.channel.disconnect();
    }

    send(payload: ArrayBuffer): void {
        this.channel.emit('bin', payload);
    }

    onMessage(handler: (payload: ArrayBuffer) => void): () => void {
        this.channel.on('bin', (data: unknown) => {
            const normalized = normalizeBinaryData(data);
            if (!normalized) return;
            handler(normalized);
        });
        return () => {
            // GameTransport currently has no off() API.
        };
    }

    onOpen(handler: () => void): () => void {
        this.channel.on('connect', handler);
        return () => {
            // GameTransport currently has no off() API.
        };
    }

    onClose(handler: (reason?: string) => void): () => void {
        this.channel.on('disconnect', (reason: string) => handler(reason));
        return () => {
            // GameTransport currently has no off() API.
        };
    }

    onError(handler: (error: unknown) => void): () => void {
        this.channel.on('connect_error', handler as (...args: any[]) => void);
        return () => {
            // GameTransport currently has no off() API.
        };
    }
}

export class SocketIoGameTransport implements GameTransport {
    constructor(private readonly socket: Socket) {}

    get id(): string | undefined {
        return this.socket.id;
    }

    get connected(): boolean {
        return this.socket.connected;
    }

    connect(): void {
        this.socket.connect();
    }

    disconnect(): void {
        this.socket.disconnect();
    }

    on(event: string, handler: (...args: any[]) => void): void {
        this.socket.on(event, handler);
    }

    emit(event: string, data: unknown): void {
        this.socket.emit(event, data);
    }

    emitWithAck<TResponse = any>(event: string, data: unknown, timeoutMs: number = 4000): Promise<TResponse> {
        return new Promise<TResponse>((resolve, reject) => {
            let settled = false;
            const timer = window.setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error(`Ack timeout for "${event}"`));
            }, timeoutMs);
            this.socket.emit(event, data, (response: TResponse) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timer);
                resolve(response);
            });
        });
    }
}

export function createSocketIoGameTransport(
    socketUrl: string | undefined,
    socketOptions: {
        transports: string[];
        reconnection: boolean;
        reconnectionAttempts: number;
        reconnectionDelay: number;
        reconnectionDelayMax: number;
        timeout: number;
    },
): GameTransport {
    const socket = socketUrl ? io(socketUrl, socketOptions) : io(socketOptions);
    return new SocketIoGameTransport(socket);
}
