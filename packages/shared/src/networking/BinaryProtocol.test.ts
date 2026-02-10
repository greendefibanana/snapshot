import { describe, expect, it } from 'vitest';
import {
    BinaryMessageType,
    normalizeBinaryData,
    unwrapBinaryMessage,
    wrapBinaryMessage,
} from './BinaryProtocol.js';

describe('BinaryProtocol', () => {
    it('wraps and unwraps payload bytes without mutation', () => {
        const payload = new Uint8Array([10, 20, 30, 40]).buffer;
        const wrapped = wrapBinaryMessage(BinaryMessageType.ServerEvent, payload);
        const decoded = unwrapBinaryMessage(wrapped);

        expect(decoded.type).toBe(BinaryMessageType.ServerEvent);
        expect(Array.from(new Uint8Array(decoded.payload))).toEqual([10, 20, 30, 40]);
    });

    it('normalizes typed arrays and buffers into ArrayBuffer', () => {
        const source = Uint8Array.from([1, 2, 3, 4]);
        const fromTypedArray = normalizeBinaryData(source);
        const fromBuffer = normalizeBinaryData(Buffer.from(source));

        expect(fromTypedArray).not.toBeNull();
        expect(fromBuffer).not.toBeNull();
        expect(Array.from(new Uint8Array(fromTypedArray!))).toEqual([1, 2, 3, 4]);
        expect(Array.from(new Uint8Array(fromBuffer!))).toEqual([1, 2, 3, 4]);
    });
});
