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
    /** Longer timeout for mesh (4v4/8-player) — more ICE negotiations happen simultaneously */
    MESH_CONNECT_TIMEOUT_MS: 20_000,
    /** Delay before non-host clients connect, giving host time to register with PeerJS signaling */
    CLIENT_CONNECT_DELAY_MS: 2_000,
    /** Max retry attempts for mesh client connections */
    MESH_CLIENT_MAX_RETRIES: 3,
    /** Delay between mesh client retry attempts */
    MESH_CLIENT_RETRY_DELAY_MS: 2_000,
    PING_INTERVAL_MS: 1500,
    FULL_SYNC_INTERVAL_MS: 1000,
    MOVE_TICK_MS: 33,
    TARGET_SCORE: 10,
    DAMAGE_PER_HIT: 20,
    PLAYER_MAX_HEALTH: 100,
    PLAYER_RADIUS: 0.9,
} as const;

export const P2PMoveFlags = {
    Aiming: 1 << 0,
    Grounded: 1 << 1,
    Sliding: 1 << 2,
} as const;

export const P2PVfxType = {
    Muzzle: 0,
    Hit: 1,
} as const;

export type P2PMovePayload = {
    sequence: number;
    sentAt: number;
    dx: number;
    dy: number;
    dz: number;
    vx: number;
    vy: number;
    vz: number;
    qx: number;
    qy: number;
    qz: number;
    qw: number;
    flags: number;
    locomotion: number;
};

export type P2PShootPayload = {
    sentAt: number;
    shotSequence: number;
    origin: { x: number; y: number; z: number };
    direction: { x: number; y: number; z: number };
    weaponKind: number;
};

export type P2PHitPayload = {
    sentAt: number;
    attackerRole: number;
    victimRole: number;
    damage: number;
    healthAfter: number;
    killed: boolean;
    hitPosition: { x: number; y: number; z: number };
};

export type P2PVfxPayload = {
    sentAt: number;
    vfxType: number;
    position: { x: number; y: number; z: number };
    direction: { x: number; y: number; z: number };
};

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
    weaponModelId?: string;
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
    | { kind: 'move'; move: P2PMovePayload }
    | { kind: 'shoot'; shoot: P2PShootPayload }
    | { kind: 'hit'; hit: P2PHitPayload }
    | { kind: 'vfx'; vfx: P2PVfxPayload }
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
        case BinaryMessageType.P2PMove:
            return { kind: 'move', move: decodeMovePayload(payload) };
        case BinaryMessageType.P2PShoot:
            return { kind: 'shoot', shoot: decodeShootPayload(payload) };
        case BinaryMessageType.P2PHit:
            return { kind: 'hit', hit: decodeHitPayload(payload) };
        case BinaryMessageType.P2PVfx:
            return { kind: 'vfx', vfx: decodeVfxPayload(payload) };
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

export function createMovePayload(move: P2PMovePayload): ArrayBuffer {
    const payload = new ArrayBuffer(52);
    const view = new DataView(payload);
    let offset = 0;
    view.setUint16(offset, move.sequence & 0xffff, true); offset += 2;
    view.setFloat64(offset, move.sentAt, true); offset += 8;
    view.setFloat32(offset, move.dx, true); offset += 4;
    view.setFloat32(offset, move.dy, true); offset += 4;
    view.setFloat32(offset, move.dz, true); offset += 4;
    view.setFloat32(offset, move.vx, true); offset += 4;
    view.setFloat32(offset, move.vy, true); offset += 4;
    view.setFloat32(offset, move.vz, true); offset += 4;
    view.setFloat32(offset, move.qx, true); offset += 4;
    view.setFloat32(offset, move.qy, true); offset += 4;
    view.setFloat32(offset, move.qz, true); offset += 4;
    view.setFloat32(offset, move.qw, true); offset += 4;
    view.setUint8(offset, move.flags & 0xff); offset += 1;
    view.setUint8(offset, move.locomotion & 0xff);
    return wrapBinaryMessage(BinaryMessageType.P2PMove, payload);
}

export function createShootPayload(shot: P2PShootPayload): ArrayBuffer {
    const payload = new ArrayBuffer(35);
    const view = new DataView(payload);
    let offset = 0;
    view.setFloat64(offset, shot.sentAt, true); offset += 8;
    view.setUint16(offset, shot.shotSequence & 0xffff, true); offset += 2;
    view.setFloat32(offset, shot.origin.x, true); offset += 4;
    view.setFloat32(offset, shot.origin.y, true); offset += 4;
    view.setFloat32(offset, shot.origin.z, true); offset += 4;
    view.setFloat32(offset, shot.direction.x, true); offset += 4;
    view.setFloat32(offset, shot.direction.y, true); offset += 4;
    view.setFloat32(offset, shot.direction.z, true); offset += 4;
    view.setUint8(offset, shot.weaponKind & 0xff);
    return wrapBinaryMessage(BinaryMessageType.P2PShoot, payload);
}

export function createHitPayload(hit: P2PHitPayload): ArrayBuffer {
    const payload = new ArrayBuffer(27);
    const view = new DataView(payload);
    let offset = 0;
    view.setFloat64(offset, hit.sentAt, true); offset += 8;
    view.setUint8(offset, hit.attackerRole & 0xff); offset += 1;
    view.setUint8(offset, hit.victimRole & 0xff); offset += 1;
    view.setUint16(offset, hit.damage & 0xffff, true); offset += 2;
    view.setUint16(offset, hit.healthAfter & 0xffff, true); offset += 2;
    view.setUint8(offset, hit.killed ? 1 : 0); offset += 1;
    view.setFloat32(offset, hit.hitPosition.x, true); offset += 4;
    view.setFloat32(offset, hit.hitPosition.y, true); offset += 4;
    view.setFloat32(offset, hit.hitPosition.z, true);
    return wrapBinaryMessage(BinaryMessageType.P2PHit, payload);
}

export function createVfxPayload(vfx: P2PVfxPayload): ArrayBuffer {
    const payload = new ArrayBuffer(33);
    const view = new DataView(payload);
    let offset = 0;
    view.setFloat64(offset, vfx.sentAt, true); offset += 8;
    view.setUint8(offset, vfx.vfxType & 0xff); offset += 1;
    view.setFloat32(offset, vfx.position.x, true); offset += 4;
    view.setFloat32(offset, vfx.position.y, true); offset += 4;
    view.setFloat32(offset, vfx.position.z, true); offset += 4;
    view.setFloat32(offset, vfx.direction.x, true); offset += 4;
    view.setFloat32(offset, vfx.direction.y, true); offset += 4;
    view.setFloat32(offset, vfx.direction.z, true);
    return wrapBinaryMessage(BinaryMessageType.P2PVfx, payload);
}

function decodeMovePayload(payload: ArrayBuffer): P2PMovePayload {
    const view = new DataView(payload);
    let offset = 0;
    const sequence = view.getUint16(offset, true); offset += 2;
    const sentAt = view.getFloat64(offset, true); offset += 8;
    const dx = view.getFloat32(offset, true); offset += 4;
    const dy = view.getFloat32(offset, true); offset += 4;
    const dz = view.getFloat32(offset, true); offset += 4;
    const vx = view.getFloat32(offset, true); offset += 4;
    const vy = view.getFloat32(offset, true); offset += 4;
    const vz = view.getFloat32(offset, true); offset += 4;
    const qx = view.getFloat32(offset, true); offset += 4;
    const qy = view.getFloat32(offset, true); offset += 4;
    const qz = view.getFloat32(offset, true); offset += 4;
    const qw = view.getFloat32(offset, true); offset += 4;
    const flags = view.getUint8(offset); offset += 1;
    const locomotion = view.getUint8(offset);
    return { sequence, sentAt, dx, dy, dz, vx, vy, vz, qx, qy, qz, qw, flags, locomotion };
}

function decodeShootPayload(payload: ArrayBuffer): P2PShootPayload {
    const view = new DataView(payload);
    let offset = 0;
    const sentAt = view.getFloat64(offset, true); offset += 8;
    const shotSequence = view.getUint16(offset, true); offset += 2;
    const origin = {
        x: view.getFloat32(offset, true),
        y: view.getFloat32(offset + 4, true),
        z: view.getFloat32(offset + 8, true),
    };
    offset += 12;
    const direction = {
        x: view.getFloat32(offset, true),
        y: view.getFloat32(offset + 4, true),
        z: view.getFloat32(offset + 8, true),
    };
    offset += 12;
    const weaponKind = view.getUint8(offset);
    return { sentAt, shotSequence, origin, direction, weaponKind };
}

function decodeHitPayload(payload: ArrayBuffer): P2PHitPayload {
    const view = new DataView(payload);
    let offset = 0;
    const sentAt = view.getFloat64(offset, true); offset += 8;
    const attackerRole = view.getUint8(offset); offset += 1;
    const victimRole = view.getUint8(offset); offset += 1;
    const damage = view.getUint16(offset, true); offset += 2;
    const healthAfter = view.getUint16(offset, true); offset += 2;
    const killed = view.getUint8(offset) === 1; offset += 1;
    const hitPosition = {
        x: view.getFloat32(offset, true),
        y: view.getFloat32(offset + 4, true),
        z: view.getFloat32(offset + 8, true),
    };
    return { sentAt, attackerRole, victimRole, damage, healthAfter, killed, hitPosition };
}

function decodeVfxPayload(payload: ArrayBuffer): P2PVfxPayload {
    const view = new DataView(payload);
    let offset = 0;
    const sentAt = view.getFloat64(offset, true); offset += 8;
    const vfxType = view.getUint8(offset); offset += 1;
    const position = {
        x: view.getFloat32(offset, true),
        y: view.getFloat32(offset + 4, true),
        z: view.getFloat32(offset + 8, true),
    };
    offset += 12;
    const direction = {
        x: view.getFloat32(offset, true),
        y: view.getFloat32(offset + 4, true),
        z: view.getFloat32(offset + 8, true),
    };
    return { sentAt, vfxType, position, direction };
}
