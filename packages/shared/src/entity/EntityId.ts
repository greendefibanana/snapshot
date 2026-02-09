/**
 * EntityId - Entity identifier with generation counter
 * 
 * Uses a compound ID format: lower 24 bits = index, upper 8 bits = generation.
 * Generation prevents stale references from accessing reallocated slots.
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Branded entity ID type.
 * Compound format: (generation << 24) | index
 */
export type EntityId = number & { readonly __brand: 'EntityId' };

/**
 * Invalid entity ID constant.
 */
export const INVALID_ENTITY_ID = 0 as EntityId;

/**
 * Maximum entity index (24 bits = 16M entities).
 */
export const MAX_ENTITY_INDEX = 0x00FFFFFF;

/**
 * Maximum generation (8 bits = 256 generations before wrap).
 */
export const MAX_GENERATION = 0xFF;

// =============================================================================
// ID OPERATIONS
// =============================================================================

/**
 * Create an entity ID from index and generation.
 */
export function createEntityId(index: number, generation: number): EntityId {
    if (index < 0 || index > MAX_ENTITY_INDEX) {
        throw new Error(`Entity index out of range: ${index}`);
    }
    const gen = generation & MAX_GENERATION;
    return ((gen << 24) | index) as EntityId;
}

/**
 * Extract the index from an entity ID.
 */
export function getEntityIndex(id: EntityId): number {
    return id & MAX_ENTITY_INDEX;
}

/**
 * Extract the generation from an entity ID.
 */
export function getEntityGeneration(id: EntityId): number {
    return (id >>> 24) & MAX_GENERATION;
}

/**
 * Check if an entity ID is valid (non-zero).
 */
export function isValidEntityId(id: EntityId): boolean {
    return id !== INVALID_ENTITY_ID;
}

/**
 * Increment generation for ID reuse.
 */
export function nextGeneration(generation: number): number {
    return (generation + 1) & MAX_GENERATION;
}

/**
 * Compare two entity IDs for equality.
 */
export function entityIdEquals(a: EntityId, b: EntityId): boolean {
    return a === b;
}

/**
 * Create a human-readable string from an entity ID.
 */
export function entityIdToString(id: EntityId): string {
    if (id === INVALID_ENTITY_ID) return 'Entity(INVALID)';
    const index = getEntityIndex(id);
    const gen = getEntityGeneration(id);
    return `Entity(${index}:${gen})`;
}

// =============================================================================
// ID ALLOCATOR
// =============================================================================

/**
 * Entity ID allocator with generation tracking.
 * Reuses freed indices with incremented generation.
 */
export class EntityIdAllocator {
    private generations: Uint8Array;
    private freeIndices: number[] = [];
    private nextIndex: number = 1; // 0 is reserved for INVALID
    private capacity: number;
    private count: number = 0;

    constructor(capacity: number = 4096) {
        this.capacity = capacity;
        this.generations = new Uint8Array(capacity);
    }

    /**
     * Allocate a new entity ID.
     */
    allocate(): EntityId {
        let index: number;

        if (this.freeIndices.length > 0) {
            // Reuse freed index
            index = this.freeIndices.pop()!;
        } else if (this.nextIndex < this.capacity) {
            // Allocate new index
            index = this.nextIndex++;
        } else {
            throw new Error('EntityIdAllocator: Capacity exceeded');
        }

        const generation = this.generations[index]!;
        this.count++;

        return createEntityId(index, generation);
    }

    /**
     * Free an entity ID for reuse.
     */
    free(id: EntityId): boolean {
        const index = getEntityIndex(id);
        const gen = getEntityGeneration(id);

        // Validate generation matches
        if (this.generations[index] !== gen) {
            return false; // Stale ID
        }

        // Increment generation to invalidate existing references
        this.generations[index] = nextGeneration(gen);
        this.freeIndices.push(index);
        this.count--;

        return true;
    }

    /**
     * Check if an entity ID is currently valid.
     */
    isValid(id: EntityId): boolean {
        if (id === INVALID_ENTITY_ID) return false;

        const index = getEntityIndex(id);
        const gen = getEntityGeneration(id);

        if (index >= this.nextIndex) return false;

        return this.generations[index] === gen;
    }

    /**
     * Get current entity count.
     */
    get activeCount(): number {
        return this.count;
    }

    /**
     * Get total capacity.
     */
    get totalCapacity(): number {
        return this.capacity;
    }

    /**
     * Reset allocator (for new match).
     */
    reset(): void {
        this.generations.fill(0);
        this.freeIndices = [];
        this.nextIndex = 1;
        this.count = 0;
    }
}

// =============================================================================
// SERIALIZATION
// =============================================================================

/**
 * Serialize an entity ID to a DataView.
 */
export function writeEntityId(view: DataView, offset: number, id: EntityId): number {
    view.setUint32(offset, id, true);
    return 4;
}

/**
 * Deserialize an entity ID from a DataView.
 */
export function readEntityId(view: DataView, offset: number): EntityId {
    return view.getUint32(offset, true) as EntityId;
}
