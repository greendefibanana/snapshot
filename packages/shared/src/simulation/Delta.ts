/**
 * Delta - Delta compression between snapshots
 * 
 * Deltas encode only the changes between two snapshots,
 * significantly reducing bandwidth for state updates.
 */

import {
    type Tick,
    tick,
} from './Tick.js';
import {
    type EntityId,
    type EntityState,
    type Snapshot,
    type Vec3,
    type Quat,
    type TransformState,
    type PhysicsState,
    type HealthState,
    type WeaponState,
    type AbilityState,
    ComponentType,
    entityId,
    cloneEntityState,
} from './Snapshot.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Delta encoding for a single entity.
 * Only includes changed fields.
 */
export interface EntityDelta {
    id: EntityId;

    /** Changed component flags */
    changedComponents: number;

    // Partial updates (only present if changed)
    position?: Vec3;
    rotation?: Quat;
    velocity?: Vec3;
    isGrounded?: boolean;
    health?: number;
    shield?: number;
    ammo?: number;
    isReloading?: boolean;
    ultimateCharge?: number;
    isAlive?: boolean;
}

/**
 * Delta between two snapshots.
 */
export interface SnapshotDelta {
    /** Base tick this delta is relative to */
    baseTick: Tick;

    /** Target tick this delta produces */
    targetTick: Tick;

    /** Timestamp when delta was created */
    timestamp: number;

    /** New entities added since base */
    addedEntities: EntityState[];

    /** Entities removed since base */
    removedEntityIds: EntityId[];

    /** Changed entities (deltas only) */
    changedEntities: EntityDelta[];
}

/** Change flags for delta encoding */
export const DeltaFlags = {
    Position: 1 << 0,
    Rotation: 1 << 1,
    Velocity: 1 << 2,
    IsGrounded: 1 << 3,
    Health: 1 << 4,
    Shield: 1 << 5,
    Ammo: 1 << 6,
    IsReloading: 1 << 7,
    UltimateCharge: 1 << 8,
    IsAlive: 1 << 9,
} as const;

// =============================================================================
// DELTA GENERATION
// =============================================================================

/**
 * Threshold for position changes (units).
 * Below this, position is considered unchanged.
 */
const POSITION_THRESHOLD = 0.001;

/**
 * Threshold for rotation changes (per component).
 */
const ROTATION_THRESHOLD = 0.0001;

/**
 * Threshold for velocity changes (units/s).
 */
const VELOCITY_THRESHOLD = 0.01;

/**
 * Generate a delta between two snapshots.
 */
export function generateDelta(base: Snapshot, target: Snapshot): SnapshotDelta {
    const baseEntityMap = new Map<EntityId, EntityState>();
    for (const entity of base.entities) {
        baseEntityMap.set(entity.id, entity);
    }

    const addedEntities: EntityState[] = [];
    const changedEntities: EntityDelta[] = [];
    const targetEntityIds = new Set<EntityId>();

    // Find added and changed entities
    for (const entity of target.entities) {
        targetEntityIds.add(entity.id);

        const baseEntity = baseEntityMap.get(entity.id);
        if (!baseEntity) {
            // New entity
            addedEntities.push(cloneEntityState(entity));
        } else {
            // Check for changes
            const delta = generateEntityDelta(baseEntity, entity);
            if (delta) {
                changedEntities.push(delta);
            }
        }
    }

    // Find removed entities
    const removedEntityIds: EntityId[] = [];
    for (const [id] of baseEntityMap) {
        if (!targetEntityIds.has(id)) {
            removedEntityIds.push(id);
        }
    }

    return {
        baseTick: base.tick,
        targetTick: target.tick,
        timestamp: target.timestamp,
        addedEntities,
        removedEntityIds,
        changedEntities,
    };
}

/**
 * Generate a delta for a single entity.
 * Returns null if no significant changes.
 */
function generateEntityDelta(base: EntityState, target: EntityState): EntityDelta | null {
    let changedComponents = 0;
    const delta: EntityDelta = { id: target.id, changedComponents: 0 };

    // Transform changes
    if (base.transform && target.transform) {
        if (!vec3Equal(base.transform.position, target.transform.position, POSITION_THRESHOLD)) {
            changedComponents |= DeltaFlags.Position;
            delta.position = target.transform.position;
        }
        if (!quatEqual(base.transform.rotation, target.transform.rotation, ROTATION_THRESHOLD)) {
            changedComponents |= DeltaFlags.Rotation;
            delta.rotation = target.transform.rotation;
        }
    }

    // Physics changes
    if (base.physics && target.physics) {
        if (!vec3Equal(base.physics.velocity, target.physics.velocity, VELOCITY_THRESHOLD)) {
            changedComponents |= DeltaFlags.Velocity;
            delta.velocity = target.physics.velocity;
        }
        if (base.physics.isGrounded !== target.physics.isGrounded) {
            changedComponents |= DeltaFlags.IsGrounded;
            delta.isGrounded = target.physics.isGrounded;
        }
    }

    // Health changes
    if (base.health && target.health) {
        if (base.health.health !== target.health.health) {
            changedComponents |= DeltaFlags.Health;
            delta.health = target.health.health;
        }
        if (base.health.shield !== target.health.shield) {
            changedComponents |= DeltaFlags.Shield;
            delta.shield = target.health.shield;
        }
    }

    // Weapon changes
    if (base.weapon && target.weapon) {
        if (base.weapon.ammo !== target.weapon.ammo) {
            changedComponents |= DeltaFlags.Ammo;
            delta.ammo = target.weapon.ammo;
        }
        if (base.weapon.isReloading !== target.weapon.isReloading) {
            changedComponents |= DeltaFlags.IsReloading;
            delta.isReloading = target.weapon.isReloading;
        }
    }

    // Ability changes
    if (base.ability && target.ability) {
        if (base.ability.ultimateCharge !== target.ability.ultimateCharge) {
            changedComponents |= DeltaFlags.UltimateCharge;
            delta.ultimateCharge = target.ability.ultimateCharge;
        }
    }

    // Player state changes
    if (base.player && target.player) {
        if (base.player.isAlive !== target.player.isAlive) {
            changedComponents |= DeltaFlags.IsAlive;
            delta.isAlive = target.player.isAlive;
        }
    }

    if (changedComponents === 0) {
        return null;
    }

    delta.changedComponents = changedComponents;
    return delta;
}

// =============================================================================
// DELTA APPLICATION
// =============================================================================

/**
 * Apply a delta to a base snapshot to produce the target snapshot.
 */
export function applyDelta(base: Snapshot, delta: SnapshotDelta): Snapshot {
    if (base.tick !== delta.baseTick) {
        throw new Error(`Delta base tick mismatch: expected ${base.tick}, got ${delta.baseTick}`);
    }

    // Start with cloned base entities
    const entityMap = new Map<EntityId, EntityState>();
    for (const entity of base.entities) {
        entityMap.set(entity.id, cloneEntityState(entity));
    }

    // Remove deleted entities
    for (const id of delta.removedEntityIds) {
        entityMap.delete(id);
    }

    // Add new entities
    for (const entity of delta.addedEntities) {
        entityMap.set(entity.id, cloneEntityState(entity));
    }

    // Apply changes
    for (const entityDelta of delta.changedEntities) {
        const entity = entityMap.get(entityDelta.id);
        if (!entity) continue;

        applyEntityDelta(entity, entityDelta);
    }

    return {
        tick: delta.targetTick,
        timestamp: delta.timestamp,
        entities: Array.from(entityMap.values()),
        deletedEntityIds: [], // Deltas don't carry forward deleted IDs
    };
}

/**
 * Apply a delta to a single entity.
 */
function applyEntityDelta(entity: EntityState, delta: EntityDelta): void {
    const flags = delta.changedComponents;

    if ((flags & DeltaFlags.Position) && entity.transform && delta.position) {
        entity.transform.position = { ...delta.position };
    }
    if ((flags & DeltaFlags.Rotation) && entity.transform && delta.rotation) {
        entity.transform.rotation = { ...delta.rotation };
    }
    if ((flags & DeltaFlags.Velocity) && entity.physics && delta.velocity) {
        entity.physics.velocity = { ...delta.velocity };
    }
    if ((flags & DeltaFlags.IsGrounded) && entity.physics && delta.isGrounded !== undefined) {
        entity.physics.isGrounded = delta.isGrounded;
    }
    if ((flags & DeltaFlags.Health) && entity.health && delta.health !== undefined) {
        entity.health.health = delta.health;
    }
    if ((flags & DeltaFlags.Shield) && entity.health && delta.shield !== undefined) {
        entity.health.shield = delta.shield;
    }
    if ((flags & DeltaFlags.Ammo) && entity.weapon && delta.ammo !== undefined) {
        entity.weapon.ammo = delta.ammo;
    }
    if ((flags & DeltaFlags.IsReloading) && entity.weapon && delta.isReloading !== undefined) {
        entity.weapon.isReloading = delta.isReloading;
    }
    if ((flags & DeltaFlags.UltimateCharge) && entity.ability && delta.ultimateCharge !== undefined) {
        entity.ability.ultimateCharge = delta.ultimateCharge;
    }
    if ((flags & DeltaFlags.IsAlive) && entity.player && delta.isAlive !== undefined) {
        entity.player.isAlive = delta.isAlive;
    }
}

// =============================================================================
// SERIALIZATION
// =============================================================================

const DELTA_FORMAT_VERSION = 1;

/**
 * Serialize a delta to binary.
 */
export function serializeDelta(delta: SnapshotDelta): ArrayBuffer {
    // Calculate size
    let size = 4 + 4 + 4 + 8; // version + baseTick + targetTick + timestamp
    size += 4 + 4 + 4; // counts for added, removed, changed

    // Added entities (simplified - just count IDs for now)
    for (const entity of delta.addedEntities) {
        size += estimateEntityStateSize(entity);
    }

    // Removed entities (4 bytes each)
    size += delta.removedEntityIds.length * 4;

    // Changed entities
    for (const entityDelta of delta.changedEntities) {
        size += estimateEntityDeltaSize(entityDelta);
    }

    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    let offset = 0;

    // Header
    view.setUint32(offset, DELTA_FORMAT_VERSION, true); offset += 4;
    view.setUint32(offset, delta.baseTick, true); offset += 4;
    view.setUint32(offset, delta.targetTick, true); offset += 4;
    view.setFloat64(offset, delta.timestamp, true); offset += 8;

    // Counts
    view.setUint32(offset, delta.addedEntities.length, true); offset += 4;
    view.setUint32(offset, delta.removedEntityIds.length, true); offset += 4;
    view.setUint32(offset, delta.changedEntities.length, true); offset += 4;

    // Added entities (simplified - just IDs and component bitfields for now)
    for (const entity of delta.addedEntities) {
        view.setUint32(offset, entity.id, true); offset += 4;
        view.setUint32(offset, entity.components, true); offset += 4;
        // Full entity serialization would go here
    }

    // Removed entities
    for (const id of delta.removedEntityIds) {
        view.setUint32(offset, id, true); offset += 4;
    }

    // Changed entities
    for (const entityDelta of delta.changedEntities) {
        offset += serializeEntityDelta(view, offset, entityDelta);
    }

    return buffer;
}

/**
 * Serialize a single entity delta.
 */
function serializeEntityDelta(view: DataView, offset: number, delta: EntityDelta): number {
    const start = offset;

    view.setUint32(offset, delta.id, true); offset += 4;
    view.setUint16(offset, delta.changedComponents, true); offset += 2;

    const flags = delta.changedComponents;

    if ((flags & DeltaFlags.Position) && delta.position) {
        view.setFloat32(offset, delta.position.x, true); offset += 4;
        view.setFloat32(offset, delta.position.y, true); offset += 4;
        view.setFloat32(offset, delta.position.z, true); offset += 4;
    }
    if ((flags & DeltaFlags.Rotation) && delta.rotation) {
        view.setFloat32(offset, delta.rotation.x, true); offset += 4;
        view.setFloat32(offset, delta.rotation.y, true); offset += 4;
        view.setFloat32(offset, delta.rotation.z, true); offset += 4;
        view.setFloat32(offset, delta.rotation.w, true); offset += 4;
    }
    if ((flags & DeltaFlags.Velocity) && delta.velocity) {
        view.setFloat32(offset, delta.velocity.x, true); offset += 4;
        view.setFloat32(offset, delta.velocity.y, true); offset += 4;
        view.setFloat32(offset, delta.velocity.z, true); offset += 4;
    }
    if (flags & DeltaFlags.IsGrounded) {
        view.setUint8(offset, delta.isGrounded ? 1 : 0); offset += 1;
    }
    if (flags & DeltaFlags.Health) {
        view.setFloat32(offset, delta.health ?? 0, true); offset += 4;
    }
    if (flags & DeltaFlags.Shield) {
        view.setFloat32(offset, delta.shield ?? 0, true); offset += 4;
    }
    if (flags & DeltaFlags.Ammo) {
        view.setUint16(offset, delta.ammo ?? 0, true); offset += 2;
    }
    if (flags & DeltaFlags.IsReloading) {
        view.setUint8(offset, delta.isReloading ? 1 : 0); offset += 1;
    }
    if (flags & DeltaFlags.UltimateCharge) {
        view.setFloat32(offset, delta.ultimateCharge ?? 0, true); offset += 4;
    }
    if (flags & DeltaFlags.IsAlive) {
        view.setUint8(offset, delta.isAlive ? 1 : 0); offset += 1;
    }

    return offset - start;
}

/**
 * Estimate serialized size of an entity delta.
 */
function estimateEntityDeltaSize(delta: EntityDelta): number {
    let size = 4 + 2; // id + flags
    const flags = delta.changedComponents;

    if (flags & DeltaFlags.Position) size += 12;
    if (flags & DeltaFlags.Rotation) size += 16;
    if (flags & DeltaFlags.Velocity) size += 12;
    if (flags & DeltaFlags.IsGrounded) size += 1;
    if (flags & DeltaFlags.Health) size += 4;
    if (flags & DeltaFlags.Shield) size += 4;
    if (flags & DeltaFlags.Ammo) size += 2;
    if (flags & DeltaFlags.IsReloading) size += 1;
    if (flags & DeltaFlags.UltimateCharge) size += 4;
    if (flags & DeltaFlags.IsAlive) size += 1;

    return size;
}

/**
 * Estimate serialized size of an entity state (simplified).
 */
function estimateEntityStateSize(entity: EntityState): number {
    return 8; // Just id + components for now
}

/**
 * Deserialize a delta from binary.
 */
export function deserializeDelta(buffer: ArrayBuffer): SnapshotDelta {
    const view = new DataView(buffer);
    let offset = 0;

    // Header
    const version = view.getUint32(offset, true); offset += 4;
    if (version !== DELTA_FORMAT_VERSION) {
        throw new Error(`Unsupported delta version: ${version}`);
    }

    const baseTick = tick(view.getUint32(offset, true)); offset += 4;
    const targetTick = tick(view.getUint32(offset, true)); offset += 4;
    const timestamp = view.getFloat64(offset, true); offset += 8;

    // Counts
    const addedCount = view.getUint32(offset, true); offset += 4;
    const removedCount = view.getUint32(offset, true); offset += 4;
    const changedCount = view.getUint32(offset, true); offset += 4;

    // Added entities (simplified)
    const addedEntities: EntityState[] = [];
    for (let i = 0; i < addedCount; i++) {
        const id = entityId(view.getUint32(offset, true)); offset += 4;
        const components = view.getUint32(offset, true); offset += 4;
        addedEntities.push({ id, components });
    }

    // Removed entities
    const removedEntityIds: EntityId[] = [];
    for (let i = 0; i < removedCount; i++) {
        removedEntityIds.push(entityId(view.getUint32(offset, true)));
        offset += 4;
    }

    // Changed entities
    const changedEntities: EntityDelta[] = [];
    for (let i = 0; i < changedCount; i++) {
        const { delta, bytesRead } = deserializeEntityDelta(view, offset);
        changedEntities.push(delta);
        offset += bytesRead;
    }

    return {
        baseTick,
        targetTick,
        timestamp,
        addedEntities,
        removedEntityIds,
        changedEntities,
    };
}

/**
 * Deserialize a single entity delta.
 */
function deserializeEntityDelta(view: DataView, offset: number): { delta: EntityDelta; bytesRead: number } {
    const start = offset;

    const id = entityId(view.getUint32(offset, true)); offset += 4;
    const changedComponents = view.getUint16(offset, true); offset += 2;

    const delta: EntityDelta = { id, changedComponents };
    const flags = changedComponents;

    if (flags & DeltaFlags.Position) {
        delta.position = {
            x: view.getFloat32(offset, true),
            y: view.getFloat32(offset + 4, true),
            z: view.getFloat32(offset + 8, true),
        };
        offset += 12;
    }
    if (flags & DeltaFlags.Rotation) {
        delta.rotation = {
            x: view.getFloat32(offset, true),
            y: view.getFloat32(offset + 4, true),
            z: view.getFloat32(offset + 8, true),
            w: view.getFloat32(offset + 12, true),
        };
        offset += 16;
    }
    if (flags & DeltaFlags.Velocity) {
        delta.velocity = {
            x: view.getFloat32(offset, true),
            y: view.getFloat32(offset + 4, true),
            z: view.getFloat32(offset + 8, true),
        };
        offset += 12;
    }
    if (flags & DeltaFlags.IsGrounded) {
        delta.isGrounded = view.getUint8(offset) === 1;
        offset += 1;
    }
    if (flags & DeltaFlags.Health) {
        delta.health = view.getFloat32(offset, true);
        offset += 4;
    }
    if (flags & DeltaFlags.Shield) {
        delta.shield = view.getFloat32(offset, true);
        offset += 4;
    }
    if (flags & DeltaFlags.Ammo) {
        delta.ammo = view.getUint16(offset, true);
        offset += 2;
    }
    if (flags & DeltaFlags.IsReloading) {
        delta.isReloading = view.getUint8(offset) === 1;
        offset += 1;
    }
    if (flags & DeltaFlags.UltimateCharge) {
        delta.ultimateCharge = view.getFloat32(offset, true);
        offset += 4;
    }
    if (flags & DeltaFlags.IsAlive) {
        delta.isAlive = view.getUint8(offset) === 1;
        offset += 1;
    }

    return { delta, bytesRead: offset - start };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if two Vec3 are approximately equal.
 */
function vec3Equal(a: Vec3, b: Vec3, threshold: number): boolean {
    return (
        Math.abs(a.x - b.x) < threshold &&
        Math.abs(a.y - b.y) < threshold &&
        Math.abs(a.z - b.z) < threshold
    );
}

/**
 * Check if two Quat are approximately equal.
 */
function quatEqual(a: Quat, b: Quat, threshold: number): boolean {
    return (
        Math.abs(a.x - b.x) < threshold &&
        Math.abs(a.y - b.y) < threshold &&
        Math.abs(a.z - b.z) < threshold &&
        Math.abs(a.w - b.w) < threshold
    );
}

/**
 * Calculate bandwidth savings from using delta vs full snapshot.
 */
export function calcDeltaSavings(fullSize: number, deltaSize: number): {
    savedBytes: number;
    compressionRatio: number;
} {
    const savedBytes = fullSize - deltaSize;
    const compressionRatio = deltaSize / fullSize;
    return { savedBytes, compressionRatio };
}
