/**
 * Binary protocol helpers shared by client and server.
 *
 * Wire format:
 * byte 0: message type
 * bytes 1..N: payload
 */

export const BinaryMessageType = {
    Input: 0x01,
    InputBatch: 0x02,
    InputAck: 0x03,
    Ping: 0x04,
    Pong: 0x05,
    Snapshot: 0x06,
    Delta: 0x07,
    ClientEvent: 0x08,
    ServerEvent: 0x09,
} as const;

export type BinaryMessageTypeValue = (typeof BinaryMessageType)[keyof typeof BinaryMessageType];

export interface DecodedBinaryMessage {
    type: number;
    payload: ArrayBuffer;
}

export function wrapBinaryMessage(type: BinaryMessageTypeValue, payload: ArrayBuffer): ArrayBuffer {
    const out = new Uint8Array(1 + payload.byteLength);
    out[0] = type;
    out.set(new Uint8Array(payload), 1);
    return out.buffer;
}

export function unwrapBinaryMessage(message: ArrayBuffer): DecodedBinaryMessage {
    if (message.byteLength < 1) {
        throw new Error('Binary message is empty');
    }
    const view = new Uint8Array(message);
    return {
        type: view[0]!,
        payload: message.slice(1),
    };
}

export function normalizeBinaryData(data: unknown): ArrayBuffer | null {
    if (data instanceof ArrayBuffer) {
        return data;
    }
    if (ArrayBuffer.isView(data)) {
        const copy = new Uint8Array(data.byteLength);
        copy.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        return copy.buffer;
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
        const copy = new Uint8Array(data.byteLength);
        copy.set(data);
        return copy.buffer;
    }
    return null;
}
