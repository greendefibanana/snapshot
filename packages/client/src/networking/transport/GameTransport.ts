import { io, type Socket } from 'socket.io-client';

export interface GameTransport {
    readonly id: string | undefined;
    readonly connected: boolean;
    connect(): void;
    disconnect(): void;
    on(event: string, handler: (...args: any[]) => void): void;
    emit(event: string, data: unknown): void;
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
