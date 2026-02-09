/**
 * InputBuffer - Shared input buffering structure
 * 
 * Used by both client (for prediction replay) and server (for input queuing).
 * Inputs are timestamped with ticks for deterministic processing.
 */

import { type Tick, tick, tickBefore, tickAfter, tickDiff } from './Tick.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Movement input state.
 */
export interface MovementInput {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    jump: boolean;
    crouch: boolean;
    sprint: boolean;
    dodge: boolean;
}

/**
 * Aim input state (radians).
 */
export interface AimInput {
    yaw: number;
    pitch: number;
}

/**
 * Complete input frame for a single tick.
 */
export interface InputFrame {
    /** The tick this input is for */
    tick: Tick;

    /** Sequence number for ordering (monotonically increasing) */
    sequence: number;

    /** Movement inputs */
    movement: MovementInput;

    /** Aim direction */
    aim: AimInput;

    /** Primary fire pressed */
    primaryFire: boolean;

    /** Secondary fire / ADS pressed */
    secondaryFire: boolean;

    /** Reload requested */
    reload: boolean;

    /** Tactical ability pressed */
    tactical: boolean;

    /** Ultimate ability pressed */
    ultimate: boolean;

    /** Interact pressed */
    interact: boolean;

    /** Weapon slot switch request (-1 = no switch) */
    weaponSlot: number;

    /** Client timestamp when input was sampled */
    clientTime: number;
}

/**
 * Create an empty input frame.
 */
export function createEmptyInput(t: Tick, seq: number = 0): InputFrame {
    return {
        tick: t,
        sequence: seq,
        movement: {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            crouch: false,
            sprint: false,
            dodge: false,
        },
        aim: { yaw: 0, pitch: 0 },
        primaryFire: false,
        secondaryFire: false,
        reload: false,
        tactical: false,
        ultimate: false,
        interact: false,
        weaponSlot: -1,
        clientTime: 0,
    };
}

/**
 * Clone an input frame.
 */
export function cloneInput(input: InputFrame): InputFrame {
    return {
        tick: input.tick,
        sequence: input.sequence,
        movement: { ...input.movement },
        aim: { ...input.aim },
        primaryFire: input.primaryFire,
        secondaryFire: input.secondaryFire,
        reload: input.reload,
        tactical: input.tactical,
        ultimate: input.ultimate,
        interact: input.interact,
        weaponSlot: input.weaponSlot,
        clientTime: input.clientTime,
    };
}

// =============================================================================
// SERIALIZATION
// =============================================================================

const INPUT_FORMAT_VERSION = 1;

/**
 * Serialize an input frame to binary.
 * Optimized for network transmission.
 */
export function serializeInput(input: InputFrame): ArrayBuffer {
    // Fixed size: 4+4+1+8+1+4+8 = 30 bytes
    const buffer = new ArrayBuffer(32);
    const view = new DataView(buffer);
    let offset = 0;

    // Header
    view.setUint8(offset, INPUT_FORMAT_VERSION); offset += 1;
    view.setUint32(offset, input.tick, true); offset += 4;
    view.setUint32(offset, input.sequence, true); offset += 4;

    // Movement as bitfield (8 bits)
    let movementBits = 0;
    if (input.movement.forward) movementBits |= 1 << 0;
    if (input.movement.backward) movementBits |= 1 << 1;
    if (input.movement.left) movementBits |= 1 << 2;
    if (input.movement.right) movementBits |= 1 << 3;
    if (input.movement.jump) movementBits |= 1 << 4;
    if (input.movement.crouch) movementBits |= 1 << 5;
    if (input.movement.sprint) movementBits |= 1 << 6;
    if (input.movement.dodge) movementBits |= 1 << 7;
    view.setUint8(offset, movementBits); offset += 1;

    // Aim using 16-bit compressed angles
    // Yaw: [-PI, PI] -> [0, 65535]
    // Pitch: [-PI/2, PI/2] -> [0, 65535]
    const yawU16 = Math.round((input.aim.yaw + Math.PI) / (Math.PI * 2) * 65535);
    const pitchU16 = Math.round((input.aim.pitch + Math.PI / 2) / Math.PI * 65535);
    view.setUint16(offset, yawU16, true); offset += 2;
    view.setUint16(offset, pitchU16, true); offset += 2;

    // Action bits (7 bits)
    let actionBits = 0;
    if (input.primaryFire) actionBits |= 1 << 0;
    if (input.secondaryFire) actionBits |= 1 << 1;
    if (input.reload) actionBits |= 1 << 2;
    if (input.tactical) actionBits |= 1 << 3;
    if (input.ultimate) actionBits |= 1 << 4;
    if (input.interact) actionBits |= 1 << 5;
    view.setUint8(offset, actionBits); offset += 1;

    // Weapon slot (signed byte, -1 = no switch)
    view.setInt8(offset, input.weaponSlot); offset += 1;

    // Client timestamp
    view.setFloat64(offset, input.clientTime, true); offset += 8;

    return buffer;
}

/**
 * Deserialize an input frame from binary.
 */
export function deserializeInput(buffer: ArrayBuffer): InputFrame {
    const view = new DataView(buffer);
    let offset = 0;

    const version = view.getUint8(offset); offset += 1;
    if (version !== INPUT_FORMAT_VERSION) {
        throw new Error(`Unsupported input version: ${version}`);
    }

    const inputTick = tick(view.getUint32(offset, true)); offset += 4;
    const sequence = view.getUint32(offset, true); offset += 4;

    // Movement
    const movementBits = view.getUint8(offset); offset += 1;
    const movement: MovementInput = {
        forward: (movementBits & (1 << 0)) !== 0,
        backward: (movementBits & (1 << 1)) !== 0,
        left: (movementBits & (1 << 2)) !== 0,
        right: (movementBits & (1 << 3)) !== 0,
        jump: (movementBits & (1 << 4)) !== 0,
        crouch: (movementBits & (1 << 5)) !== 0,
        sprint: (movementBits & (1 << 6)) !== 0,
        dodge: (movementBits & (1 << 7)) !== 0,
    };

    // Aim (decompress)
    const yawU16 = view.getUint16(offset, true); offset += 2;
    const pitchU16 = view.getUint16(offset, true); offset += 2;
    const yaw = (yawU16 / 65535) * (Math.PI * 2) - Math.PI;
    const pitch = (pitchU16 / 65535) * Math.PI - Math.PI / 2;

    // Actions
    const actionBits = view.getUint8(offset); offset += 1;

    // Weapon slot
    const weaponSlot = view.getInt8(offset); offset += 1;

    // Client timestamp
    const clientTime = view.getFloat64(offset, true); offset += 8;

    return {
        tick: inputTick,
        sequence,
        movement,
        aim: { yaw, pitch },
        primaryFire: (actionBits & (1 << 0)) !== 0,
        secondaryFire: (actionBits & (1 << 1)) !== 0,
        reload: (actionBits & (1 << 2)) !== 0,
        tactical: (actionBits & (1 << 3)) !== 0,
        ultimate: (actionBits & (1 << 4)) !== 0,
        interact: (actionBits & (1 << 5)) !== 0,
        weaponSlot,
        clientTime,
    };
}

/**
 * Serialize multiple inputs as a batch.
 */
export function serializeInputBatch(inputs: InputFrame[]): ArrayBuffer {
    const inputSize = 32;
    const buffer = new ArrayBuffer(4 + inputs.length * inputSize);
    const view = new DataView(buffer);

    view.setUint32(0, inputs.length, true);

    for (let i = 0; i < inputs.length; i++) {
        const inputBuffer = serializeInput(inputs[i]!);
        const inputView = new Uint8Array(inputBuffer);
        const offset = 4 + i * inputSize;

        for (let j = 0; j < inputSize; j++) {
            view.setUint8(offset + j, inputView[j]!);
        }
    }

    return buffer;
}

/**
 * Deserialize a batch of inputs.
 */
export function deserializeInputBatch(buffer: ArrayBuffer): InputFrame[] {
    const view = new DataView(buffer);
    const count = view.getUint32(0, true);
    const inputSize = 32;
    const inputs: InputFrame[] = [];

    for (let i = 0; i < count; i++) {
        const offset = 4 + i * inputSize;
        const inputBuffer = buffer.slice(offset, offset + inputSize);
        inputs.push(deserializeInput(inputBuffer));
    }

    return inputs;
}

// =============================================================================
// INPUT BUFFER
// =============================================================================

/**
 * Circular buffer for storing input frames.
 * Thread-safe for single-producer single-consumer usage.
 */
export class InputBuffer {
    private inputs: Map<Tick, InputFrame> = new Map();
    private capacity: number;
    private nextSequence: number = 0;

    constructor(capacity: number = 128) {
        this.capacity = capacity;
    }

    /**
     * Add an input to the buffer.
     */
    push(input: InputFrame): void {
        this.inputs.set(input.tick, input);

        // Evict old inputs if over capacity
        if (this.inputs.size > this.capacity) {
            const oldestTick = Math.min(...Array.from(this.inputs.keys()));
            this.inputs.delete(tick(oldestTick));
        }
    }

    /**
     * Get an input by tick.
     */
    get(t: Tick): InputFrame | undefined {
        return this.inputs.get(t);
    }

    /**
     * Get the most recent input.
     */
    getLatest(): InputFrame | undefined {
        if (this.inputs.size === 0) return undefined;
        const latestTick = Math.max(...Array.from(this.inputs.keys()));
        return this.inputs.get(tick(latestTick));
    }

    /**
     * Get inputs in a tick range (inclusive).
     */
    getRange(fromTick: Tick, toTick: Tick): InputFrame[] {
        const result: InputFrame[] = [];
        for (let t = fromTick as number; t <= toTick; t++) {
            const input = this.inputs.get(tick(t));
            if (input) result.push(input);
        }
        return result;
    }

    /**
     * Get all inputs after a given sequence number.
     */
    getAfterSequence(seq: number): InputFrame[] {
        const result: InputFrame[] = [];
        for (const input of this.inputs.values()) {
            if (input.sequence > seq) {
                result.push(input);
            }
        }
        return result.sort((a, b) => a.sequence - b.sequence);
    }

    /**
     * Clear all inputs.
     */
    clear(): void {
        this.inputs.clear();
    }

    /**
     * Get current size.
     */
    get size(): number {
        return this.inputs.size;
    }

    /**
     * Prune inputs older than a given tick.
     */
    pruneOlderThan(t: Tick): number {
        let pruned = 0;
        for (const [inputTick] of this.inputs) {
            if (tickBefore(inputTick, t)) {
                this.inputs.delete(inputTick);
                pruned++;
            }
        }
        return pruned;
    }

    /**
     * Prune inputs with sequence <= given sequence.
     */
    pruneUpToSequence(seq: number): number {
        let pruned = 0;
        for (const [inputTick, input] of this.inputs) {
            if (input.sequence <= seq) {
                this.inputs.delete(inputTick);
                pruned++;
            }
        }
        return pruned;
    }

    /**
     * Get the next sequence number.
     */
    getNextSequence(): number {
        return this.nextSequence++;
    }

    /**
     * Check if buffer contains input for a tick.
     */
    has(t: Tick): boolean {
        return this.inputs.has(t);
    }

    /**
     * Get all inputs as an array (sorted by tick).
     */
    toArray(): InputFrame[] {
        return Array.from(this.inputs.values())
            .sort((a, b) => a.tick - b.tick);
    }
}

// =============================================================================
// SERVER INPUT QUEUE
// =============================================================================

/**
 * Per-player input queue on server.
 * Buffers inputs to handle jitter and out-of-order packets.
 */
export class ServerInputQueue {
    private queues: Map<string, InputBuffer> = new Map();
    private lastProcessedSequence: Map<string, number> = new Map();

    /**
     * Add an input for a player.
     */
    addInput(playerId: string, input: InputFrame): void {
        let queue = this.queues.get(playerId);
        if (!queue) {
            queue = new InputBuffer(64);
            this.queues.set(playerId, queue);
            this.lastProcessedSequence.set(playerId, -1);
        }
        queue.push(input);
    }

    /**
     * Get the next input to process for a player.
     * Returns undefined if no input is available for the current tick.
     */
    getInputForTick(playerId: string, t: Tick): InputFrame | undefined {
        const queue = this.queues.get(playerId);
        if (!queue) return undefined;
        return queue.get(t);
    }

    /**
     * Get the latest input for a player (for input prediction).
     */
    getLatestInput(playerId: string): InputFrame | undefined {
        const queue = this.queues.get(playerId);
        if (!queue) return undefined;
        return queue.getLatest();
    }

    /**
     * Mark inputs as processed up to a sequence.
     */
    markProcessed(playerId: string, sequence: number): void {
        this.lastProcessedSequence.set(playerId, sequence);
        const queue = this.queues.get(playerId);
        if (queue) {
            queue.pruneUpToSequence(sequence);
        }
    }

    /**
     * Get the last processed sequence for a player.
     */
    getLastProcessedSequence(playerId: string): number {
        return this.lastProcessedSequence.get(playerId) ?? -1;
    }

    /**
     * Remove a player's queue.
     */
    removePlayer(playerId: string): void {
        this.queues.delete(playerId);
        this.lastProcessedSequence.delete(playerId);
    }

    /**
     * Get all player IDs.
     */
    getPlayerIds(): string[] {
        return Array.from(this.queues.keys());
    }

    /**
     * Get buffer stats for a player.
     */
    getStats(playerId: string): { size: number; lastSequence: number } | undefined {
        const queue = this.queues.get(playerId);
        if (!queue) return undefined;
        return {
            size: queue.size,
            lastSequence: this.lastProcessedSequence.get(playerId) ?? -1,
        };
    }
}

// =============================================================================
// INPUT ACK
// =============================================================================

/**
 * Server acknowledgment of processed inputs.
 */
export interface InputAck {
    /** Last processed sequence number */
    lastProcessedSequence: number;

    /** Server tick when input was processed */
    processedAtTick: Tick;

    /** Server timestamp */
    serverTime: number;
}

/**
 * Serialize an input ack.
 */
export function serializeInputAck(ack: InputAck): ArrayBuffer {
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);

    view.setUint32(0, ack.lastProcessedSequence, true);
    view.setUint32(4, ack.processedAtTick, true);
    view.setFloat64(8, ack.serverTime, true);

    return buffer;
}

/**
 * Deserialize an input ack.
 */
export function deserializeInputAck(buffer: ArrayBuffer): InputAck {
    const view = new DataView(buffer);

    return {
        lastProcessedSequence: view.getUint32(0, true),
        processedAtTick: tick(view.getUint32(4, true)),
        serverTime: view.getFloat64(8, true),
    };
}
