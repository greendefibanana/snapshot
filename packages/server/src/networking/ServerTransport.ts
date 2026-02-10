import type { Socket } from 'socket.io';

export interface ServerTransportConnectionMeta {
    transport: string | undefined;
    recovered: boolean;
    address: string | undefined;
    forwardedFor: string | string[] | undefined;
    userAgent: string | undefined;
}

export interface ServerTransportChannel {
    readonly id: string;
    readonly connected: boolean;
    on(event: string, handler: (...args: any[]) => void): void;
    emit(event: string, data: unknown): void;
    disconnect(close?: boolean): void;
    connectionMeta(): ServerTransportConnectionMeta;
}

class SocketIoServerTransportChannel implements ServerTransportChannel {
    constructor(private readonly socket: Socket) {}

    get id(): string {
        return this.socket.id;
    }

    get connected(): boolean {
        return this.socket.connected;
    }

    on(event: string, handler: (...args: any[]) => void): void {
        this.socket.on(event, handler);
    }

    emit(event: string, data: unknown): void {
        this.socket.emit(event, data);
    }

    disconnect(close: boolean = true): void {
        this.socket.disconnect(close);
    }

    connectionMeta(): ServerTransportConnectionMeta {
        return {
            transport: this.socket.conn?.transport?.name,
            recovered: this.socket.recovered === true,
            address: this.socket.handshake.address,
            forwardedFor: this.socket.handshake.headers['x-forwarded-for'],
            userAgent: this.socket.handshake.headers['user-agent'],
        };
    }
}

export function createSocketIoServerTransportChannel(socket: Socket): ServerTransportChannel {
    return new SocketIoServerTransportChannel(socket);
}
