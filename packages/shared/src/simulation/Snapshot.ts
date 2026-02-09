/**
 * Snapshot - State snapshot schema and serialization
 * 
 * Snapshots are point-in-time captures of the entire game world.
 * Used for:
 * - Client reconciliation (comparing prediction vs authority)
 * - Late-join state transfer
 * - Debug recording/replay
 */

import { type Tick, tick } from './Tick.js';

// =============================================================================
// NETWORKING MESSAGE TYPES
// =============================================================================

/**
 * Message type identifiers for binary protocol.
 */
export const MessageType = {
    Snapshot: 0x01,
    Delta: 0x02,
    InputAck: 0x03,
    Ping: 0x04,
    Pong: 0x05,
} as const;

// =============================================================================
// TYPES
// =============================================================================

/**
 * Entity ID type.
 * Using number for efficiency in serialization.
 */
export type EntityId = number & { readonly __brand: 'EntityId' };

/**
 * Create an entity ID.
 */
export function entityId(value: number): EntityId {
    return value as EntityId;
}

/**
 * Component type enumeration.
 * Used as bitfield for efficient component presence checking.
 */
export const ComponentType = {
    Transform: 1 << 0,
    Physics: 1 << 1,
    Player: 1 << 2,
    Health: 1 << 3,
    Weapon: 1 << 4,
    Ability: 1 << 5,
    Projectile: 1 << 6,
} as const;

export type ComponentTypeBitfield = number;

/**
 * Vector3 for positions and velocities.
 * Using object for clarity, but could switch to Float32Array for perf.
 */
export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

/**
 * Quaternion for rotations.
 */
export interface Quat {
    x: number;
    y: number;
    z: number;
    w: number;
}

/**
 * Transform component state.
 */
export interface TransformState {
    position: Vec3;
    rotation: Quat;
}

/**
 * Physics component state.
 * Only the fields needed for prediction/reconciliation.
 */
export interface PhysicsState {
    velocity: Vec3;
    isGrounded: boolean;
}

/**
 * Player component state.
 * Minimal state needed for reconciliation.
 */
export interface PlayerState {
    playerId: string;
    teamId: number;
    isAlive: boolean;
    /** Last input tick processed by server */
    lastProcessedInputTick: Tick;
}

/**
 * Health component state.
 */
export interface HealthState {
    health: number;
    maxHealth: number;
    shield: number;
    maxShield: number;
}

/**
 * Weapon component state.
 */
export interface WeaponState {
    activeSlot: number;
    ammo: number;
    isReloading: boolean;
    /** Tick when reload completes */
    reloadEndTick: Tick;
    /** Tick when weapon can fire again */
    nextFireTick: Tick;
}

/**
 * Ability component state.
 */
export interface AbilityState {
    /** Tick when tactical is ready */
    tacticalReadyTick: Tick;
    /** Ultimate charge (0-100) */
    ultimateCharge: number;
}

/**
 * Projectile component state.
 */
export interface ProjectileState {
    ownerId: EntityId;
    weaponId: string;
    spawnTick: Tick;
}

/**
 * Complete entity state for snapshots.
 */
export interface EntityState {
    id: EntityId;
    /** Bitfield of present components */
    components: ComponentTypeBitfield;

    // Components (only present if bit is set)
    transform?: TransformState;
    physics?: PhysicsState;
    player?: PlayerState;
    health?: HealthState;
    weapon?: WeaponState;
    ability?: AbilityState;
    projectile?: ProjectileState;
}

/**
 * Full world snapshot.
 */
export interface Snapshot {
    /** Tick this snapshot represents */
    tick: Tick;

    /** Server timestamp when snapshot was created */
    timestamp: number;

    /** All entities in the world */
    entities: EntityState[];

    /** Entity IDs that were deleted since last full snapshot */
    deletedEntityIds: EntityId[];
}

/**
 * Snapshot metadata (for buffering without full data).
 */
export interface SnapshotMeta {
    tick: Tick;
    timestamp: number;
    entityCount: number;
    sizeBytes: number;
}

// =============================================================================
// SERIALIZATION
// =============================================================================

/**
 * Binary encoding format version.
 * Increment when format changes.
 */
export const SNAPSHOT_FORMAT_VERSION = 1;

/**
 * Serialize a Vec3 to a DataView.
 */
function writeVec3(view: DataView, offset: number, v: Vec3): number {
    view.setFloat32(offset, v.x, true);
    view.setFloat32(offset + 4, v.y, true);
    view.setFloat32(offset + 8, v.z, true);
    return 12;
}

/**
 * Read a Vec3 from a DataView.
 */
function readVec3(view: DataView, offset: number): { value: Vec3; bytesRead: number } {
    return {
        value: {
            x: view.getFloat32(offset, true),
            y: view.getFloat32(offset + 4, true),
            z: view.getFloat32(offset + 8, true),
        },
        bytesRead: 12,
    };
}

/**
 * Serialize a Quat to a DataView.
 */
function writeQuat(view: DataView, offset: number, q: Quat): number {
    view.setFloat32(offset, q.x, true);
    view.setFloat32(offset + 4, q.y, true);
    view.setFloat32(offset + 8, q.z, true);
    view.setFloat32(offset + 12, q.w, true);
    return 16;
}

/**
 * Read a Quat from a DataView.
 */
function readQuat(view: DataView, offset: number): { value: Quat; bytesRead: number } {
    return {
        value: {
            x: view.getFloat32(offset, true),
            y: view.getFloat32(offset + 4, true),
            z: view.getFloat32(offset + 8, true),
            w: view.getFloat32(offset + 12, true),
        },
        bytesRead: 16,
    };
}

/**
 * Calculate the byte size of an entity state.
 */
export function calcEntityStateSize(entity: EntityState): number {
    let size = 4 + 4; // id (4) + components bitfield (4)

    if (entity.components & ComponentType.Transform) {
        size += 12 + 16; // position + rotation
    }
    if (entity.components & ComponentType.Physics) {
        size += 12 + 1; // velocity + isGrounded
    }
    if (entity.components & ComponentType.Player) {
        size += 36 + 4 + 1 + 4; // playerId (36) + teamId + isAlive + lastProcessedInputTick
    }
    if (entity.components & ComponentType.Health) {
        size += 4 * 4; // health, maxHealth, shield, maxShield
    }
    if (entity.components & ComponentType.Weapon) {
        size += 4 + 4 + 1 + 4 + 4; // activeSlot + ammo + isReloading + reloadEndTick + nextFireTick
    }
    if (entity.components & ComponentType.Ability) {
        size += 4 + 4; // tacticalReadyTick + ultimateCharge
    }
    if (entity.components & ComponentType.Projectile) {
        size += 4 + 32 + 4; // ownerId + weaponId + spawnTick
    }

    return size;
}

/**
 * Calculate the byte size of a full snapshot.
 */
export function calcSnapshotSize(snapshot: Snapshot): number {
    // version(4) + tick(4) + timestamp(8) + entityCount(4) + deletedCount(4) = 24 bytes
    let size = 4 + 4 + 8 + 4 + 4;

    for (const entity of snapshot.entities) {
        size += calcEntityStateSize(entity);
    }

    size += snapshot.deletedEntityIds.length * 4;

    return size;
}

/**
 * Serialize a snapshot to binary.
 */
export function serializeSnapshot(snapshot: Snapshot): ArrayBuffer {
    const size = calcSnapshotSize(snapshot);
    // EMERGENCY: Use 10KB buffer to prevent any crash while debugging
    const buffer = new ArrayBuffer(Math.max(size + 10240, 10240));
    const view = new DataView(buffer);
    let offset = 0;

    // Debug logging
    console.log(`[Snapshot] Calculated size: ${size}, Buffer size: ${buffer.byteLength}, Entities: ${snapshot.entities.length}`);

    // Header
    view.setUint32(offset, SNAPSHOT_FORMAT_VERSION, true); offset += 4;
    view.setUint32(offset, snapshot.tick, true); offset += 4;
    view.setFloat64(offset, snapshot.timestamp, true); offset += 8;
    view.setUint32(offset, snapshot.entities.length, true); offset += 4;
    view.setUint32(offset, snapshot.deletedEntityIds.length, true); offset += 4;

    // Entities
    for (const entity of snapshot.entities) {
        const entityStartOffset = offset;
        offset += serializeEntityState(view, offset, entity);
        const entityBytesWritten = offset - entityStartOffset;
        const entityCalcSize = calcEntityStateSize(entity);
        if (entityBytesWritten !== entityCalcSize) {
            console.error(`[Snapshot] Size mismatch for entity ${entity.id}: calculated ${entityCalcSize}, wrote ${entityBytesWritten}, components: ${entity.components}`);
        }
    }

    // Deleted IDs
    for (const id of snapshot.deletedEntityIds) {
        view.setUint32(offset, id, true);
        offset += 4;
    }

    console.log(`[Snapshot] Final offset: ${offset}, Calculated size: ${size}, Actual used: ${offset}, Buffer size: ${buffer.byteLength}`);

    return buffer;
}

/**
 * Serialize a single entity state.
 */
function serializeEntityState(view: DataView, offset: number, entity: EntityState): number {
    const start = offset;

    view.setUint32(offset, entity.id, true); offset += 4;
    view.setUint32(offset, entity.components, true); offset += 4;

    if (entity.transform && (entity.components & ComponentType.Transform)) {
        offset += writeVec3(view, offset, entity.transform.position);
        offset += writeQuat(view, offset, entity.transform.rotation);
    }

    if (entity.physics && (entity.components & ComponentType.Physics)) {
        offset += writeVec3(view, offset, entity.physics.velocity);
        view.setUint8(offset, entity.physics.isGrounded ? 1 : 0); offset += 1;
    }

    if (entity.player && (entity.components & ComponentType.Player)) {
        // Write playerId as fixed 36-byte string (UUID format)
        const playerIdBytes = new TextEncoder().encode(entity.player.playerId.padEnd(36, '\0'));
        for (let i = 0; i < 36; i++) {
            view.setUint8(offset + i, playerIdBytes[i] ?? 0);
        }
        offset += 36;
        view.setUint32(offset, entity.player.teamId, true); offset += 4;
        view.setUint8(offset, entity.player.isAlive ? 1 : 0); offset += 1;
        view.setUint32(offset, entity.player.lastProcessedInputTick, true); offset += 4;
    }

    if (entity.health && (entity.components & ComponentType.Health)) {
        view.setFloat32(offset, entity.health.health, true); offset += 4;
        view.setFloat32(offset, entity.health.maxHealth, true); offset += 4;
        view.setFloat32(offset, entity.health.shield, true); offset += 4;
        view.setFloat32(offset, entity.health.maxShield, true); offset += 4;
    }

    if (entity.weapon && (entity.components & ComponentType.Weapon)) {
        view.setUint32(offset, entity.weapon.activeSlot, true); offset += 4;
        view.setUint32(offset, entity.weapon.ammo, true); offset += 4;
        view.setUint8(offset, entity.weapon.isReloading ? 1 : 0); offset += 1;
        view.setUint32(offset, entity.weapon.reloadEndTick, true); offset += 4;
        view.setUint32(offset, entity.weapon.nextFireTick, true); offset += 4;
    }

    if (entity.ability && (entity.components & ComponentType.Ability)) {
        view.setUint32(offset, entity.ability.tacticalReadyTick, true); offset += 4;
        view.setFloat32(offset, entity.ability.ultimateCharge, true); offset += 4;
    }

    if (entity.projectile && (entity.components & ComponentType.Projectile)) {
        view.setUint32(offset, entity.projectile.ownerId, true); offset += 4;
        // Write weaponId as fixed 32-byte string
        const weaponIdBytes = new TextEncoder().encode(entity.projectile.weaponId.padEnd(32, '\0'));
        for (let i = 0; i < 32; i++) {
            view.setUint8(offset + i, weaponIdBytes[i] ?? 0);
        }
        offset += 32;
        view.setUint32(offset, entity.projectile.spawnTick, true); offset += 4;
    }

    return offset - start;
}

/**
 * Deserialize a snapshot from binary.
 */
export function deserializeSnapshot(buffer: ArrayBuffer): Snapshot {
    const view = new DataView(buffer);
    let offset = 0;

    // Header
    const version = view.getUint32(offset, true); offset += 4;
    if (version !== SNAPSHOT_FORMAT_VERSION) {
        throw new Error(`Unsupported snapshot version: ${version}`);
    }

    const snapshotTick = tick(view.getUint32(offset, true)); offset += 4;
    const timestamp = view.getFloat64(offset, true); offset += 8;
    const entityCount = view.getUint32(offset, true); offset += 4;
    const deletedCount = view.getUint32(offset, true); offset += 4;

    // Entities
    const entities: EntityState[] = [];
    for (let i = 0; i < entityCount; i++) {
        const { entity, bytesRead } = deserializeEntityState(view, offset);
        entities.push(entity);
        offset += bytesRead;
    }

    // Deleted IDs
    const deletedEntityIds: EntityId[] = [];
    for (let i = 0; i < deletedCount; i++) {
        deletedEntityIds.push(entityId(view.getUint32(offset, true)));
        offset += 4;
    }

    return {
        tick: snapshotTick,
        timestamp,
        entities,
        deletedEntityIds,
    };
}

/**
 * Deserialize a single entity state.
 */
function deserializeEntityState(view: DataView, offset: number): { entity: EntityState; bytesRead: number } {
    const start = offset;

    const id = entityId(view.getUint32(offset, true)); offset += 4;
    const components = view.getUint32(offset, true); offset += 4;

    const entity: EntityState = { id, components };

    if (components & ComponentType.Transform) {
        const pos = readVec3(view, offset); offset += pos.bytesRead;
        const rot = readQuat(view, offset); offset += rot.bytesRead;
        entity.transform = { position: pos.value, rotation: rot.value };
    }

    if (components & ComponentType.Physics) {
        const vel = readVec3(view, offset); offset += vel.bytesRead;
        const isGrounded = view.getUint8(offset) === 1; offset += 1;
        entity.physics = { velocity: vel.value, isGrounded };
    }

    if (components & ComponentType.Player) {
        const playerIdBytes = new Uint8Array(view.buffer, offset, 36);
        const playerId = new TextDecoder().decode(playerIdBytes).replace(/\0/g, '');
        offset += 36;
        const teamId = view.getUint32(offset, true); offset += 4;
        const isAlive = view.getUint8(offset) === 1; offset += 1;
        const lastProcessedInputTick = tick(view.getUint32(offset, true)); offset += 4;
        entity.player = { playerId, teamId, isAlive, lastProcessedInputTick };
    }

    if (components & ComponentType.Health) {
        entity.health = {
            health: view.getFloat32(offset, true),
            maxHealth: view.getFloat32(offset + 4, true),
            shield: view.getFloat32(offset + 8, true),
            maxShield: view.getFloat32(offset + 12, true),
        };
        offset += 16;
    }

    if (components & ComponentType.Weapon) {
        entity.weapon = {
            activeSlot: view.getUint32(offset, true),
            ammo: view.getUint32(offset + 4, true),
            isReloading: view.getUint8(offset + 8) === 1,
            reloadEndTick: tick(view.getUint32(offset + 9, true)),
            nextFireTick: tick(view.getUint32(offset + 13, true)),
        };
        offset += 17;
    }

    if (components & ComponentType.Ability) {
        entity.ability = {
            tacticalReadyTick: tick(view.getUint32(offset, true)),
            ultimateCharge: view.getFloat32(offset + 4, true),
        };
        offset += 8;
    }

    if (components & ComponentType.Projectile) {
        const ownerId = entityId(view.getUint32(offset, true)); offset += 4;
        const weaponIdBytes = new Uint8Array(view.buffer, offset, 32);
        const weaponId = new TextDecoder().decode(weaponIdBytes).replace(/\0/g, '');
        offset += 32;
        const spawnTick = tick(view.getUint32(offset, true)); offset += 4;
        entity.projectile = { ownerId, weaponId, spawnTick };
    }

    return { entity, bytesRead: offset - start };
}

// =============================================================================
// SNAPSHOT BUFFER
// =============================================================================

/**
 * Circular buffer for storing recent snapshots.
 * Used by both server (for delta generation) and client (for reconciliation).
 */
export class SnapshotBuffer {
    private snapshots: Map<Tick, Snapshot> = new Map();
    private capacity: number;

    constructor(capacity: number = 128) {
        this.capacity = capacity;
    }

    /**
     * Add a snapshot to the buffer.
     */
    push(snapshot: Snapshot): void {
        this.snapshots.set(snapshot.tick, snapshot);

        // Evict old snapshots if over capacity
        if (this.snapshots.size > this.capacity) {
            const oldestTick = Math.min(...Array.from(this.snapshots.keys()));
            this.snapshots.delete(tick(oldestTick));
        }
    }

    /**
     * Get a snapshot by tick.
     */
    get(t: Tick): Snapshot | undefined {
        return this.snapshots.get(t);
    }

    /**
     * Get the most recent snapshot.
     */
    getLatest(): Snapshot | undefined {
        if (this.snapshots.size === 0) return undefined;
        const latestTick = Math.max(...Array.from(this.snapshots.keys()));
        return this.snapshots.get(tick(latestTick));
    }

    /**
     * Get snapshots in a tick range (inclusive).
     */
    getRange(fromTick: Tick, toTick: Tick): Snapshot[] {
        const result: Snapshot[] = [];
        for (let t = fromTick; t <= toTick; t++) {
            const snapshot = this.snapshots.get(tick(t));
            if (snapshot) result.push(snapshot);
        }
        return result;
    }

    /**
     * Clear all snapshots.
     */
    clear(): void {
        this.snapshots.clear();
    }

    /**
     * Get current size.
     */
    get size(): number {
        return this.snapshots.size;
    }

    /**
     * Prune snapshots older than a given tick.
     */
    pruneOlderThan(t: Tick): number {
        let pruned = 0;
        for (const [snapTick] of this.snapshots) {
            if (snapTick < t) {
                this.snapshots.delete(snapTick);
                pruned++;
            }
        }
        return pruned;
    }
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Create an empty snapshot.
 */
export function createEmptySnapshot(t: Tick): Snapshot {
    return {
        tick: t,
        timestamp: Date.now(),
        entities: [],
        deletedEntityIds: [],
    };
}

/**
 * Clone a snapshot (deep copy).
 */
export function cloneSnapshot(snapshot: Snapshot): Snapshot {
    return {
        tick: snapshot.tick,
        timestamp: snapshot.timestamp,
        entities: snapshot.entities.map(e => cloneEntityState(e)),
        deletedEntityIds: [...snapshot.deletedEntityIds],
    };
}

/**
 * Clone an entity state (deep copy).
 */
export function cloneEntityState(entity: EntityState): EntityState {
    const clone: EntityState = {
        id: entity.id,
        components: entity.components,
    };

    if (entity.transform) {
        clone.transform = {
            position: { ...entity.transform.position },
            rotation: { ...entity.transform.rotation },
        };
    }
    if (entity.physics) {
        clone.physics = {
            velocity: { ...entity.physics.velocity },
            isGrounded: entity.physics.isGrounded,
        };
    }
    if (entity.player) {
        clone.player = { ...entity.player };
    }
    if (entity.health) {
        clone.health = { ...entity.health };
    }
    if (entity.weapon) {
        clone.weapon = { ...entity.weapon };
    }
    if (entity.ability) {
        clone.ability = { ...entity.ability };
    }
    if (entity.projectile) {
        clone.projectile = { ...entity.projectile };
    }

    return clone;
}

/**
 * @deprecated Use calcSnapshotSize instead.
 */
export const calculateSnapshotSize = calcSnapshotSize;
