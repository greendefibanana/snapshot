/**
 * Projectile - Projectile entity component
 * 
 * Contains all state for projectile entities:
 * - Identity (owner, weapon type)
 * - Lifetime
 * - Damage properties
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Projectile type enumeration.
 */
export const ProjectileType = {
    Bullet: 0,
    Rocket: 1,
    Grenade: 2,
    Beam: 3,
    Splash: 4,
    Arc: 5,
} as const;

export type ProjectileType = typeof ProjectileType[keyof typeof ProjectileType];

/**
 * Projectile state component.
 * 32 bytes when serialized.
 */
export interface Projectile {
    /** Owner entity ID */
    ownerId: number;

    /** Owner's team ID (for friendly fire checks) */
    ownerTeamId: number;

    /** Weapon ID that spawned this projectile */
    weaponId: number;

    /** Projectile type */
    projectileType: ProjectileType;

    /** Base damage */
    damage: number;

    /** Damage falloff start distance */
    falloffStart: number;

    /** Damage falloff end distance */
    falloffEnd: number;

    /** Splash radius (0 = no splash) */
    splashRadius: number;

    /** Spawn tick */
    spawnTick: number;

    /** Lifetime in ticks (0 = infinite) */
    lifetime: number;

    /** Distance traveled (for falloff calculation) */
    distanceTraveled: number;

    /** Has this projectile already hit something */
    hasHit: boolean;
}

/**
 * Create default projectile.
 */
export function createProjectile(
    ownerId: number,
    ownerTeamId: number,
    weaponId: number
): Projectile {
    return {
        ownerId,
        ownerTeamId,
        weaponId,
        projectileType: ProjectileType.Bullet,
        damage: 20,
        falloffStart: 10,
        falloffEnd: 30,
        splashRadius: 0,
        spawnTick: 0,
        lifetime: 60, // 1 second at 60 tick
        distanceTraveled: 0,
        hasHit: false,
    };
}

/**
 * Clone projectile.
 */
export function cloneProjectile(p: Projectile): Projectile {
    return { ...p };
}

// =============================================================================
// PROJECTILE POOL
// =============================================================================

/**
 * Maximum projectiles per match.
 */
export const MAX_PROJECTILES = 256;

/**
 * Projectile pool - array-of-structs for projectiles.
 */
export class ProjectilePool {
    private projectiles: (Projectile | null)[];
    private activeCount: number = 0;
    private freeSlots: number[] = [];

    readonly capacity: number;

    constructor(capacity: number = MAX_PROJECTILES) {
        this.capacity = capacity;
        this.projectiles = new Array(capacity).fill(null);

        // Initialize free list
        for (let i = capacity - 1; i >= 0; i--) {
            this.freeSlots.push(i);
        }
    }

    /**
     * Get projectile at slot.
     */
    get(slot: number): Projectile | null {
        return this.projectiles[slot] ?? null;
    }

    /**
     * Allocate a projectile.
     */
    allocate(projectile: Projectile): number {
        if (this.freeSlots.length === 0) {
            return -1;
        }

        const slot = this.freeSlots.pop()!;
        this.projectiles[slot] = projectile;
        this.activeCount++;
        return slot;
    }

    /**
     * Free a projectile slot.
     */
    free(slot: number): void {
        if (this.projectiles[slot] !== null) {
            this.projectiles[slot] = null;
            this.freeSlots.push(slot);
            this.activeCount--;
        }
    }

    /**
     * Get all active projectiles.
     */
    getActive(): Projectile[] {
        return this.projectiles.filter((p): p is Projectile => p !== null);
    }

    /**
     * Get projectiles by owner.
     */
    getByOwner(ownerId: number): Projectile[] {
        return this.projectiles.filter(
            (p): p is Projectile => p !== null && p.ownerId === ownerId
        );
    }

    /**
     * Update distance traveled for a projectile.
     */
    addDistance(slot: number, distance: number): void {
        const p = this.projectiles[slot];
        if (p) {
            p.distanceTraveled += distance;
        }
    }

    /**
     * Check if projectile has expired.
     */
    isExpired(slot: number, currentTick: number): boolean {
        const p = this.projectiles[slot];
        if (!p) return true;
        if (p.lifetime === 0) return false; // Infinite lifetime
        return (currentTick - p.spawnTick) >= p.lifetime;
    }

    /**
     * Reset all projectiles.
     */
    reset(): void {
        this.projectiles.fill(null);
        this.activeCount = 0;
        this.freeSlots = [];
        for (let i = this.capacity - 1; i >= 0; i--) {
            this.freeSlots.push(i);
        }
    }

    /**
     * Get active projectile count.
     */
    get count(): number {
        return this.activeCount;
    }

    /**
     * Iterate over all active projectiles with their slot index.
     */
    *entries(): Generator<[number, Projectile]> {
        for (let i = 0; i < this.capacity; i++) {
            const p = this.projectiles[i];
            if (p !== null) {
                yield [i, p];
            }
        }
    }
}

// =============================================================================
// SERIALIZATION
// =============================================================================

/**
 * Byte size of serialized projectile.
 */
export const PROJECTILE_SIZE = 32;

/**
 * Serialize projectile to a DataView.
 */
export function writeProjectile(view: DataView, offset: number, p: Projectile): number {
    view.setUint32(offset, p.ownerId, true);
    view.setUint8(offset + 4, p.ownerTeamId);
    view.setUint8(offset + 5, p.weaponId);
    view.setUint8(offset + 6, p.projectileType);
    view.setUint8(offset + 7, p.hasHit ? 1 : 0);
    view.setFloat32(offset + 8, p.damage, true);
    view.setFloat32(offset + 12, p.falloffStart, true);
    view.setFloat32(offset + 16, p.falloffEnd, true);
    view.setFloat32(offset + 20, p.splashRadius, true);
    view.setUint16(offset + 24, p.spawnTick, true);
    view.setUint16(offset + 26, p.lifetime, true);
    view.setFloat32(offset + 28, p.distanceTraveled, true);
    return PROJECTILE_SIZE;
}

/**
 * Deserialize projectile from a DataView.
 */
export function readProjectile(view: DataView, offset: number): Projectile {
    return {
        ownerId: view.getUint32(offset, true),
        ownerTeamId: view.getUint8(offset + 4),
        weaponId: view.getUint8(offset + 5),
        projectileType: view.getUint8(offset + 6) as ProjectileType,
        hasHit: view.getUint8(offset + 7) === 1,
        damage: view.getFloat32(offset + 8, true),
        falloffStart: view.getFloat32(offset + 12, true),
        falloffEnd: view.getFloat32(offset + 16, true),
        splashRadius: view.getFloat32(offset + 20, true),
        spawnTick: view.getUint16(offset + 24, true),
        lifetime: view.getUint16(offset + 26, true),
        distanceTraveled: view.getFloat32(offset + 28, true),
    };
}

// =============================================================================
// DAMAGE CALCULATION
// =============================================================================

/**
 * Calculate damage with falloff.
 */
export function calculateDamage(projectile: Projectile): number {
    const dist = projectile.distanceTraveled;

    // No falloff yet
    if (dist <= projectile.falloffStart) {
        return projectile.damage;
    }

    // Full falloff
    if (dist >= projectile.falloffEnd) {
        return projectile.damage * 0.5; // Minimum 50% damage
    }

    // Linear falloff
    const falloffRange = projectile.falloffEnd - projectile.falloffStart;
    const falloffProgress = (dist - projectile.falloffStart) / falloffRange;
    const falloffMultiplier = 1 - (falloffProgress * 0.5);

    return projectile.damage * falloffMultiplier;
}
