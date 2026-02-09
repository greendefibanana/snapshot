/**
 * EntityType - Entity type enumeration and flags
 * 
 * Defines the exhaustive set of entity types in the game.
 * Each entity has exactly one type, determining its component composition.
 */

// =============================================================================
// ENTITY TYPES
// =============================================================================

/**
 * Entity type enumeration.
 * Stored as u8 in serialization.
 */
export const EntityType = {
    /** Invalid/uninitialized entity */
    None: 0,

    /** Player-controlled character */
    Player: 1,

    /** Fired projectile (bullet, rocket, etc.) */
    Projectile: 2,

    /** Active ability effect (healing zone, damage field, etc.) */
    AbilityEffect: 3,

    /** Collectible pickup (health, ammo, etc.) */
    Pickup: 4,

    /** Trigger zone (objective area, spawn point, etc.) */
    Trigger: 5,

    /** Visual-only effect (explosion, particle, etc.) */
    VFX: 6,

    /** Static world prop (not networked) */
    Prop: 7,
} as const;

export type EntityType = typeof EntityType[keyof typeof EntityType];

/**
 * Get entity type name for debugging.
 */
export function entityTypeName(type: EntityType): string {
    switch (type) {
        case EntityType.None: return 'None';
        case EntityType.Player: return 'Player';
        case EntityType.Projectile: return 'Projectile';
        case EntityType.AbilityEffect: return 'AbilityEffect';
        case EntityType.Pickup: return 'Pickup';
        case EntityType.Trigger: return 'Trigger';
        case EntityType.VFX: return 'VFX';
        case EntityType.Prop: return 'Prop';
        default: return `Unknown(${type})`;
    }
}

// =============================================================================
// ENTITY FLAGS
// =============================================================================

/**
 * Entity flags bitfield.
 * Stored as u8 in serialization.
 */
export const EntityFlags = {
    /** Entity is active and should be updated */
    Active: 1 << 0,

    /** Entity state is replicated to clients */
    Replicated: 1 << 1,

    /** Client predicts this entity (local player) */
    Predicted: 1 << 2,

    /** Client interpolates this entity (remote players) */
    Interpolated: 1 << 3,

    /** Entity exists only on local client (VFX, etc.) */
    LocalOnly: 1 << 4,

    /** Entity is pending destruction */
    PendingDestroy: 1 << 5,

    /** Entity was just spawned this tick */
    JustSpawned: 1 << 6,

    /** Entity state changed this tick (for delta) */
    Dirty: 1 << 7,
} as const;

export type EntityFlags = number;

/**
 * Default flags for each entity type.
 */
export function defaultFlagsForType(type: EntityType): EntityFlags {
    switch (type) {
        case EntityType.Player:
            return EntityFlags.Active | EntityFlags.Replicated | EntityFlags.Interpolated;

        case EntityType.Projectile:
            return EntityFlags.Active | EntityFlags.Replicated;

        case EntityType.AbilityEffect:
            return EntityFlags.Active | EntityFlags.Replicated;

        case EntityType.Pickup:
            return EntityFlags.Active | EntityFlags.Replicated;

        case EntityType.Trigger:
            return EntityFlags.Active; // Not replicated, server-only

        case EntityType.VFX:
            return EntityFlags.Active | EntityFlags.LocalOnly;

        case EntityType.Prop:
            return 0; // Static, not updated

        default:
            return 0;
    }
}

// =============================================================================
// FLAG OPERATIONS
// =============================================================================

export function hasFlag(flags: EntityFlags, flag: number): boolean {
    return (flags & flag) !== 0;
}

export function setFlag(flags: EntityFlags, flag: number): EntityFlags {
    return flags | flag;
}

export function clearFlag(flags: EntityFlags, flag: number): EntityFlags {
    return flags & ~flag;
}

export function toggleFlag(flags: EntityFlags, flag: number): EntityFlags {
    return flags ^ flag;
}

// =============================================================================
// ENTITY HEADER
// =============================================================================

/**
 * Entity header - minimal metadata for every entity.
 * 16 bytes total, densely packed.
 */
export interface EntityHeader {
    /** Entity ID (4 bytes) */
    id: number; // EntityId

    /** Entity type (1 byte) */
    type: EntityType;

    /** Entity flags (1 byte) */
    flags: EntityFlags;

    /** Generation counter (2 bytes) */
    generation: number;

    /** Pool slot index (4 bytes) */
    poolSlot: number;

    /** Owner player ID, 0 = no owner (4 bytes) */
    ownerPlayerId: number;
}

/**
 * Create an empty entity header.
 */
export function createEntityHeader(): EntityHeader {
    return {
        id: 0,
        type: EntityType.None,
        flags: 0,
        generation: 0,
        poolSlot: -1,
        ownerPlayerId: 0,
    };
}

/**
 * Clone an entity header.
 */
export function cloneEntityHeader(header: EntityHeader): EntityHeader {
    return { ...header };
}

// =============================================================================
// SERIALIZATION
// =============================================================================

/**
 * Byte size of serialized entity header.
 */
export const ENTITY_HEADER_SIZE = 16;

/**
 * Serialize an entity header to a DataView.
 */
export function writeEntityHeader(
    view: DataView,
    offset: number,
    header: EntityHeader
): number {
    view.setUint32(offset, header.id, true);
    view.setUint8(offset + 4, header.type);
    view.setUint8(offset + 5, header.flags);
    view.setUint16(offset + 6, header.generation, true);
    view.setUint32(offset + 8, header.poolSlot, true);
    view.setUint32(offset + 12, header.ownerPlayerId, true);
    return ENTITY_HEADER_SIZE;
}

/**
 * Deserialize an entity header from a DataView.
 */
export function readEntityHeader(view: DataView, offset: number): EntityHeader {
    return {
        id: view.getUint32(offset, true),
        type: view.getUint8(offset + 4) as EntityType,
        flags: view.getUint8(offset + 5),
        generation: view.getUint16(offset + 6, true),
        poolSlot: view.getUint32(offset + 8, true),
        ownerPlayerId: view.getUint32(offset + 12, true),
    };
}
