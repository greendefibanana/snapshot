/**
 * StateBroadcaster - Snapshot and delta broadcasting
 * 
 * Manages sending world state to connected clients.
 * Sends full snapshots periodically and deltas between.
 */

import type { Socket } from 'socket.io';
import {
    type Tick,
    type Snapshot,
    type SnapshotDelta,
    type InputAck,
    TICK_RATE,
    FULL_SNAPSHOT_INTERVAL,
    DELTA_INTERVAL,
    tick,
    SnapshotBuffer,
    serializeSnapshot,
    generateDelta,
    serializeDelta,
    serializeInputAck,
} from '@snapshot/shared/simulation';

// =============================================================================
// TYPES
// =============================================================================

export interface ConnectedClient {
    /** Unique client ID */
    id: string;

    /** Player ID in game */
    playerId: string;

    /** Socket.io channel */
    channel: Socket;

    /** Last tick client acknowledged receiving */
    lastAckedTick: Tick;

    /** Last snapshot tick we sent to this client */
    lastSentSnapshotTick: Tick;

    /** Last full snapshot base tick sent while waiting for ack */
    lastSentFullSnapshotTick: Tick;

    /** Last input sequence we processed */
    lastProcessedInputSeq: number;

    /** Last tick we sent an input ack to this client */
    lastInputAckSentTick?: Tick;
}

export interface StateBroadcasterConfig {
    /** Full snapshot interval in ticks */
    fullSnapshotInterval?: number;

    /** Delta interval in ticks */
    deltaInterval?: number;

    /** Custom serialization (for testing) */
    serializeSnapshot?: (snapshot: Snapshot) => ArrayBuffer;
    serializeDelta?: (delta: SnapshotDelta) => ArrayBuffer;
}

// =============================================================================
// MESSAGE TYPES
// =============================================================================

/**
 * Message type identifiers.
 */
export const MessageType = {
    Snapshot: 0x01,
    Delta: 0x02,
    InputAck: 0x03,
    Ping: 0x04,
    Pong: 0x05,
} as const;

/**
 * Wrap data with message type header.
 */
function wrapMessage(type: number, data: ArrayBuffer): ArrayBuffer {
    const wrapped = new ArrayBuffer(1 + data.byteLength);
    const view = new Uint8Array(wrapped);
    view[0] = type;
    view.set(new Uint8Array(data), 1);
    return wrapped;
}

// =============================================================================
// STATE BROADCASTER
// =============================================================================

export class StateBroadcaster {
    private clients: Map<string, ConnectedClient> = new Map();
    private snapshotBuffer: SnapshotBuffer;
    private config: Required<StateBroadcasterConfig>;

    private lastFullSnapshotTick: Tick = tick(0);
    private lastDeltaTick: Tick = tick(0);

    constructor(config: StateBroadcasterConfig = {}) {
        this.config = {
            fullSnapshotInterval: config.fullSnapshotInterval ?? FULL_SNAPSHOT_INTERVAL,
            deltaInterval: config.deltaInterval ?? DELTA_INTERVAL,
            serializeSnapshot: config.serializeSnapshot ?? serializeSnapshot,
            serializeDelta: config.serializeDelta ?? serializeDelta,
        };

        this.snapshotBuffer = new SnapshotBuffer(128);
    }

    /**
     * Add a connected client.
     */
    addClient(client: ConnectedClient): void {
        this.clients.set(client.id, client);
        console.log(`StateBroadcaster: Added client ${client.id}`);
    }

    /**
     * Remove a connected client.
     */
    removeClient(clientId: string): void {
        this.clients.delete(clientId);
        console.log(`StateBroadcaster: Removed client ${clientId}`);
    }

    /**
     * Get a client by ID.
     */
    getClient(clientId: string): ConnectedClient | undefined {
        return this.clients.get(clientId);
    }

    /**
     * Get client by player ID.
     */
    getClientByPlayerId(playerId: string): ConnectedClient | undefined {
        for (const client of this.clients.values()) {
            if (client.playerId === playerId) {
                return client;
            }
        }
        return undefined;
    }

    /**
     * Get all connected client IDs.
     */
    getClientIds(): string[] {
        return Array.from(this.clients.keys());
    }

    /**
     * Get client count.
     */
    get clientCount(): number {
        return this.clients.size;
    }

    /**
     * Process a new snapshot and broadcast as needed.
     */
    processSnapshot(snapshot: Snapshot): void {
        // Store snapshot
        this.snapshotBuffer.push(snapshot);

        const currentTick = snapshot.tick;

        // Determine what to send
        const shouldSendFullSnapshot =
            currentTick - this.lastFullSnapshotTick >= this.config.fullSnapshotInterval;

        const shouldSendDelta =
            !shouldSendFullSnapshot &&
            currentTick - this.lastDeltaTick >= this.config.deltaInterval;

        if (shouldSendFullSnapshot) {
            this.broadcastSnapshot(snapshot);
            this.lastFullSnapshotTick = currentTick;
            this.lastDeltaTick = currentTick;
        } else if (shouldSendDelta) {
            this.broadcastDelta(snapshot);
            this.lastDeltaTick = currentTick;
        }
    }

    /**
     * Broadcast a full snapshot to all clients.
     */
    private broadcastSnapshot(snapshot: Snapshot): void {
        // Skip if no clients
        if (this.clients.size === 0) return;

        const data = this.config.serializeSnapshot(snapshot);
        const message = wrapMessage(MessageType.Snapshot, data);

        for (const client of this.clients.values()) {
            this.sendToClient(client, message);
            client.lastSentSnapshotTick = snapshot.tick;
            client.lastSentFullSnapshotTick = snapshot.tick;
        }
    }

    /**
     * Broadcast delta to all clients.
     */
    private broadcastDelta(snapshot: Snapshot): void {
        // Skip if no clients
        if (this.clients.size === 0) return;

        // Generate delta from last full snapshot
        const baseSnapshot = this.snapshotBuffer.get(this.lastFullSnapshotTick);
        if (!baseSnapshot) {
            // Fall back to full snapshot
            this.broadcastSnapshot(snapshot);
            return;
        }

        const delta = generateDelta(baseSnapshot, snapshot);
        if (!delta) {
            console.warn('StateBroadcaster: Failed to generate delta, falling back to full snapshot');
            this.broadcastSnapshot(snapshot);
            return;
        }

        const data = this.config.serializeDelta(delta);
        if (!data) {
            console.warn('StateBroadcaster: Failed to serialize delta, falling back to full snapshot');
            this.broadcastSnapshot(snapshot);
            return;
        }

        const message = wrapMessage(MessageType.Delta, data);

        for (const client of this.clients.values()) {
            // Check if client has the base snapshot
            if (client.lastAckedTick >= this.lastFullSnapshotTick) {
                this.sendToClient(client, message);
                client.lastSentSnapshotTick = snapshot.tick;
            } else {
                // Client is behind; send one full snapshot for this base tick
                // and wait for ack to avoid flooding snapshots every delta tick.
                if (client.lastSentFullSnapshotTick < this.lastFullSnapshotTick) {
                    const fullData = this.config.serializeSnapshot(snapshot);
                    const fullMessage = wrapMessage(MessageType.Snapshot, fullData);
                    this.sendToClient(client, fullMessage);
                    client.lastSentFullSnapshotTick = this.lastFullSnapshotTick;
                    client.lastSentSnapshotTick = snapshot.tick;
                }
            }
        }
    }

    /**
     * Send input acknowledgment to a client.
     */
    sendInputAck(clientId: string, lastSeq: number, processedAtTick: Tick): void {
        const client = this.clients.get(clientId);
        if (!client) return;

        const ack: InputAck = {
            lastProcessedSequence: lastSeq,
            processedAtTick,
            serverTime: Date.now(),
        };

        const data = serializeInputAck(ack);
        const message = wrapMessage(MessageType.InputAck, data);

        this.sendToClient(client, message);
        client.lastProcessedInputSeq = lastSeq;
        client.lastInputAckSentTick = processedAtTick;
    }

    /**
     * Send raw data to a client.
     */
    private sendToClient(client: ConnectedClient, data: ArrayBuffer): void {
        try {
            client.channel.emit('bin', data);
        } catch (e) {
            console.error(`StateBroadcaster: Failed to send to ${client.id}:`, e);
        }
    }

    /**
     * Handle client acknowledgment of received snapshot.
     */
    handleClientAck(clientId: string, ackedTick: Tick): void {
        const client = this.clients.get(clientId);
        if (!client) return;

        if (ackedTick > client.lastAckedTick) {
            client.lastAckedTick = ackedTick;
        }
    }

    /**
     * Get the latest snapshot.
     */
    getLatestSnapshot(): Snapshot | undefined {
        return this.snapshotBuffer.getLatest();
    }

    /**
     * Get a snapshot by tick.
     */
    getSnapshot(t: Tick): Snapshot | undefined {
        return this.snapshotBuffer.get(t);
    }

    /**
     * Prune old snapshots.
     */
    pruneOldSnapshots(olderThan: Tick): void {
        this.snapshotBuffer.pruneOlderThan(olderThan);
    }

    /**
     * Get broadcasting stats.
     */
    getStats(): {
        clientCount: number;
        snapshotBufferSize: number;
        lastFullSnapshotTick: Tick;
        lastDeltaTick: Tick;
    } {
        return {
            clientCount: this.clients.size,
            snapshotBufferSize: this.snapshotBuffer.size,
            lastFullSnapshotTick: this.lastFullSnapshotTick,
            lastDeltaTick: this.lastDeltaTick,
        };
    }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new state broadcaster.
 */
export function createStateBroadcaster(config?: StateBroadcasterConfig): StateBroadcaster {
    return new StateBroadcaster(config);
}
