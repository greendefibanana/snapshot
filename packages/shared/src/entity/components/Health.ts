/**
 * Health - Health and shield component
 * 
 * Tracks current and maximum health/shield values.
 * Used by all damageable entities.
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Health component.
 * 16 bytes when serialized.
 */
export interface Health {
    /** Current health */
    health: number;

    /** Maximum health */
    maxHealth: number;

    /** Current shield */
    shield: number;

    /** Maximum shield */
    maxShield: number;
}

/**
 * Create default health.
 */
export function createHealth(maxHealth: number, maxShield: number = 0): Health {
    return {
        health: maxHealth,
        maxHealth,
        shield: maxShield,
        maxShield,
    };
}

/**
 * Clone health.
 */
export function cloneHealth(h: Health): Health {
    return { ...h };
}

// =============================================================================
// HEALTH POOL (SOA)
// =============================================================================

/**
 * SOA pool for health components.
 */
export class HealthPool {
    readonly health: Float32Array;
    readonly maxHealth: Float32Array;
    readonly shield: Float32Array;
    readonly maxShield: Float32Array;

    readonly capacity: number;

    constructor(capacity: number) {
        this.capacity = capacity;
        this.health = new Float32Array(capacity);
        this.maxHealth = new Float32Array(capacity);
        this.shield = new Float32Array(capacity);
        this.maxShield = new Float32Array(capacity);
    }

    /**
     * Get health at slot.
     */
    get(slot: number): Health {
        return {
            health: this.health[slot]!,
            maxHealth: this.maxHealth[slot]!,
            shield: this.shield[slot]!,
            maxShield: this.maxShield[slot]!,
        };
    }

    /**
     * Set health at slot.
     */
    set(slot: number, h: Health): void {
        this.health[slot] = h.health;
        this.maxHealth[slot] = h.maxHealth;
        this.shield[slot] = h.shield;
        this.maxShield[slot] = h.maxShield;
    }

    /**
     * Initialize slot with max values.
     */
    init(slot: number, maxHealth: number, maxShield: number = 0): void {
        this.health[slot] = maxHealth;
        this.maxHealth[slot] = maxHealth;
        this.shield[slot] = maxShield;
        this.maxShield[slot] = maxShield;
    }

    /**
     * Apply damage to an entity.
     * Damage hits shield first, then health.
     * Returns actual damage dealt.
     */
    applyDamage(slot: number, damage: number): number {
        let remaining = damage;
        let dealt = 0;

        // Damage shield first
        if (this.shield[slot]! > 0) {
            const shieldDamage = Math.min(this.shield[slot]!, remaining);
            this.shield[slot] -= shieldDamage;
            remaining -= shieldDamage;
            dealt += shieldDamage;
        }

        // Then damage health
        if (remaining > 0) {
            const healthDamage = Math.min(this.health[slot]!, remaining);
            this.health[slot] -= healthDamage;
            dealt += healthDamage;
        }

        return dealt;
    }

    /**
     * Heal an entity.
     * Returns actual healing done.
     */
    heal(slot: number, amount: number): number {
        const current = this.health[slot]!;
        const max = this.maxHealth[slot]!;
        const healed = Math.min(amount, max - current);
        this.health[slot] = current + healed;
        return healed;
    }

    /**
     * Add shield to an entity.
     * Returns actual shield added.
     */
    addShield(slot: number, amount: number): number {
        const current = this.shield[slot]!;
        const max = this.maxShield[slot]!;
        const added = Math.min(amount, max - current);
        this.shield[slot] = current + added;
        return added;
    }

    /**
     * Set shield directly (for abilities that grant temporary shield).
     */
    setShield(slot: number, amount: number): void {
        this.shield[slot] = Math.min(amount, this.maxShield[slot]!);
    }

    /**
     * Check if entity is dead.
     */
    isDead(slot: number): boolean {
        return this.health[slot]! <= 0;
    }

    /**
     * Check if entity has full health.
     */
    isFullHealth(slot: number): boolean {
        return this.health[slot]! >= this.maxHealth[slot]!;
    }

    /**
     * Get health percentage (0-1).
     */
    getHealthPercent(slot: number): number {
        const max = this.maxHealth[slot]!;
        if (max <= 0) return 0;
        return this.health[slot]! / max;
    }

    /**
     * Get shield percentage (0-1).
     */
    getShieldPercent(slot: number): number {
        const max = this.maxShield[slot]!;
        if (max <= 0) return 0;
        return this.shield[slot]! / max;
    }

    /**
     * Get total effective health (health + shield).
     */
    getEffectiveHealth(slot: number): number {
        return this.health[slot]! + this.shield[slot]!;
    }

    /**
     * Reset slot to full health.
     */
    reset(slot: number): void {
        this.health[slot] = this.maxHealth[slot]!;
        this.shield[slot] = this.maxShield[slot]!;
    }

    /**
     * Copy health from one slot to another.
     */
    copy(destSlot: number, srcSlot: number): void {
        this.health[destSlot] = this.health[srcSlot]!;
        this.maxHealth[destSlot] = this.maxHealth[srcSlot]!;
        this.shield[destSlot] = this.shield[srcSlot]!;
        this.maxShield[destSlot] = this.maxShield[srcSlot]!;
    }
}

// =============================================================================
// SERIALIZATION
// =============================================================================

/**
 * Byte size of serialized health.
 */
export const HEALTH_SIZE = 16;

/**
 * Serialize health to a DataView.
 */
export function writeHealth(view: DataView, offset: number, h: Health): number {
    view.setFloat32(offset, h.health, true);
    view.setFloat32(offset + 4, h.maxHealth, true);
    view.setFloat32(offset + 8, h.shield, true);
    view.setFloat32(offset + 12, h.maxShield, true);
    return HEALTH_SIZE;
}

/**
 * Deserialize health from a DataView.
 */
export function readHealth(view: DataView, offset: number): Health {
    return {
        health: view.getFloat32(offset, true),
        maxHealth: view.getFloat32(offset + 4, true),
        shield: view.getFloat32(offset + 8, true),
        maxShield: view.getFloat32(offset + 12, true),
    };
}

/**
 * Serialize health directly from pool.
 */
export function writeHealthFromPool(
    view: DataView,
    offset: number,
    pool: HealthPool,
    slot: number
): number {
    view.setFloat32(offset, pool.health[slot]!, true);
    view.setFloat32(offset + 4, pool.maxHealth[slot]!, true);
    view.setFloat32(offset + 8, pool.shield[slot]!, true);
    view.setFloat32(offset + 12, pool.maxShield[slot]!, true);
    return HEALTH_SIZE;
}

/**
 * Deserialize health directly to pool.
 */
export function readHealthToPool(
    view: DataView,
    offset: number,
    pool: HealthPool,
    slot: number
): number {
    pool.health[slot] = view.getFloat32(offset, true);
    pool.maxHealth[slot] = view.getFloat32(offset + 4, true);
    pool.shield[slot] = view.getFloat32(offset + 8, true);
    pool.maxShield[slot] = view.getFloat32(offset + 12, true);
    return HEALTH_SIZE;
}
