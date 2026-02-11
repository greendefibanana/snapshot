import {
    BinaryMessageType,
    serializeClientMessage,
    serializeServerMessage,
    wrapBinaryMessage,
    deserializeClientMessage,
    deserializeServerMessage,
    unwrapBinaryMessage,
} from '@snapshot/shared';
import { serializeInput, deserializeInput, serializeInputAck, deserializeInputAck, type InputFrame, type InputAck } from '@snapshot/shared/simulation';

export const P2P = {
    MAX_PACKET_SIZE_BYTES: 64 * 1024,
    CONNECT_TIMEOUT_MS: 10_000,
    PING_INTERVAL_MS: 1500,
    FULL_SYNC_INTERVAL_MS: 1000,
    TARGET_SCORE: 10,
    DAMAGE_PER_HIT: 20,
    PLAYER_MAX_HEALTH: 100,
    PLAYER_RADIUS: 0.9,
} as const;

export type P2PRole = 'host' | 'joiner';

export interface P2PPlayerState {
    id: string;
    displayName: string;
    health: number;
    kills: number;
    deaths: number;
    alive: boolean;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    lastInputSeq: number;
}

export interface P2PMatchState {
    hostId: string;
    joinerId: string;
    hostDisplayName: string;
    joinerDisplayName: string;
    host: P2PPlayerState;
    joiner: P2PPlayerState;
}

export function wrapP2PInput(input: InputFrame): ArrayBuffer {
    return wrapBinaryMessage(BinaryMessageType.Input, serializeInput(input));
}

export function wrapP2PAck(ack: InputAck): ArrayBuffer {
    return wrapBinaryMessage(BinaryMessageType.InputAck, serializeInputAck(ack));
}

export function wrapP2PClientEvent(payload: unknown): ArrayBuffer {
    return wrapBinaryMessage(BinaryMessageType.ClientEvent, serializeClientMessage(payload as any));
}

export function wrapP2PServerEvent(payload: unknown): ArrayBuffer {
    return wrapBinaryMessage(BinaryMessageType.ServerEvent, serializeServerMessage(payload as any));
}

export function readP2PPacket(buffer: ArrayBuffer):
    | { kind: 'input'; input: InputFrame }
    | { kind: 'ack'; ack: InputAck }
    | { kind: 'client_event'; event: any }
    | { kind: 'server_event'; event: any }
    | { kind: 'ping'; sentAt: number }
    | { kind: 'pong'; sentAt: number; recvAt: number }
    | { kind: 'unknown'; type: number } {
    const { type, payload } = unwrapBinaryMessage(buffer);
    switch (type) {
        case BinaryMessageType.Input:
            return { kind: 'input', input: deserializeInput(payload) };
        case BinaryMessageType.InputAck:
            return { kind: 'ack', ack: deserializeInputAck(payload) };
        case BinaryMessageType.ClientEvent:
            return { kind: 'client_event', event: deserializeClientMessage(payload) };
        case BinaryMessageType.ServerEvent:
            return { kind: 'server_event', event: deserializeServerMessage(payload) };
        case BinaryMessageType.Ping: {
            const view = new DataView(payload);
            return { kind: 'ping', sentAt: view.getFloat64(0, true) };
        }
        case BinaryMessageType.Pong: {
            const view = new DataView(payload);
            return {
                kind: 'pong',
                sentAt: view.getFloat64(0, true),
                recvAt: view.getFloat64(8, true),
            };
        }
        default:
            return { kind: 'unknown', type };
    }
}

export function createPingPayload(now: number): ArrayBuffer {
    const payload = new ArrayBuffer(8);
    new DataView(payload).setFloat64(0, now, true);
    return wrapBinaryMessage(BinaryMessageType.Ping, payload);
}

export function createPongPayload(sentAt: number, now: number): ArrayBuffer {
    const payload = new ArrayBuffer(16);
    const view = new DataView(payload);
    view.setFloat64(0, sentAt, true);
    view.setFloat64(8, now, true);
    return wrapBinaryMessage(BinaryMessageType.Pong, payload);
}
