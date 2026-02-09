/**
 * Physics - Velocity and physics state component
 * 
 * Stored in SOA format for efficient simulation updates.
 * Contains velocity and grounded state for movement physics.
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Physics component data.
 * 16 bytes when serialized.
 */
export interface Physics {
    /** Velocity X (units/second) */
    vx: number;
    /** Velocity Y (units/second) */
    vy: number;
    /** Velocity Z (units/second) */
    vz: number;
    /** Is entity on ground */
    grounded: boolean;
}

/**
 * Create default physics (stationary).
 */
export function createPhysics(): Physics {
    return {
        vx: 0,
        vy: 0,
        vz: 0,
        grounded: true,
    };
}

/**
 * Clone physics.
 */
export function clonePhysics(p: Physics): Physics {
    return { ...p };
}

/**
 * Copy physics data.
 */
export function copyPhysics(dest: Physics, src: Physics): void {
    dest.vx = src.vx;
    dest.vy = src.vy;
    dest.vz = src.vz;
    dest.grounded = src.grounded;
}

// =============================================================================
// PHYSICS POOL (SOA)
// =============================================================================

/**
 * SOA pool for physics components.
 */
export class PhysicsPool {
    /** X velocities */
    readonly vx: Float32Array;
    /** Y velocities */
    readonly vy: Float32Array;
    /** Z velocities */
    readonly vz: Float32Array;
    /** Grounded flags (as Uint8 for memory efficiency) */
    readonly grounded: Uint8Array;

    /** Pool capacity */
    readonly capacity: number;

    constructor(capacity: number) {
        this.capacity = capacity;
        this.vx = new Float32Array(capacity);
        this.vy = new Float32Array(capacity);
        this.vz = new Float32Array(capacity);
        this.grounded = new Uint8Array(capacity);

        // Initialize as grounded
        this.grounded.fill(1);
    }

    /**
     * Get physics at slot.
     */
    get(slot: number): Physics {
        return {
            vx: this.vx[slot]!,
            vy: this.vy[slot]!,
            vz: this.vz[slot]!,
            grounded: this.grounded[slot] === 1,
        };
    }

    /**
     * Set physics at slot.
     */
    set(slot: number, p: Physics): void {
        this.vx[slot] = p.vx;
        this.vy[slot] = p.vy;
        this.vz[slot] = p.vz;
        this.grounded[slot] = p.grounded ? 1 : 0;
    }

    /**
     * Set velocity only.
     */
    setVelocity(slot: number, vx: number, vy: number, vz: number): void {
        this.vx[slot] = vx;
        this.vy[slot] = vy;
        this.vz[slot] = vz;
    }

    /**
     * Add to velocity.
     */
    addVelocity(slot: number, dvx: number, dvy: number, dvz: number): void {
        this.vx[slot] += dvx;
        this.vy[slot] += dvy;
        this.vz[slot] += dvz;
    }

    /**
     * Get velocity as array [vx, vy, vz].
     */
    getVelocity(slot: number): [number, number, number] {
        return [this.vx[slot]!, this.vy[slot]!, this.vz[slot]!];
    }

    /**
     * Check if grounded.
     */
    isGrounded(slot: number): boolean {
        return this.grounded[slot] === 1;
    }

    /**
     * Set grounded state.
     */
    setGrounded(slot: number, value: boolean): void {
        this.grounded[slot] = value ? 1 : 0;
    }

    /**
     * Get speed (magnitude of velocity).
     */
    getSpeed(slot: number): number {
        const vx = this.vx[slot]!;
        const vy = this.vy[slot]!;
        const vz = this.vz[slot]!;
        return Math.sqrt(vx * vx + vy * vy + vz * vz);
    }

    /**
     * Get horizontal speed (XZ plane).
     */
    getHorizontalSpeed(slot: number): number {
        const vx = this.vx[slot]!;
        const vz = this.vz[slot]!;
        return Math.sqrt(vx * vx + vz * vz);
    }

    /**
     * Copy physics from one slot to another.
     */
    copy(destSlot: number, srcSlot: number): void {
        this.vx[destSlot] = this.vx[srcSlot]!;
        this.vy[destSlot] = this.vy[srcSlot]!;
        this.vz[destSlot] = this.vz[srcSlot]!;
        this.grounded[destSlot] = this.grounded[srcSlot]!;
    }

    /**
     * Reset slot to default (zero velocity, grounded).
     */
    reset(slot: number): void {
        this.vx[slot] = 0;
        this.vy[slot] = 0;
        this.vz[slot] = 0;
        this.grounded[slot] = 1;
    }

    /**
     * Apply friction (horizontal only).
     */
    applyFriction(slot: number, friction: number): void {
        this.vx[slot] *= friction;
        this.vz[slot] *= friction;
    }

    /**
     * Apply gravity.
     */
    applyGravity(slot: number, gravity: number, dt: number): void {
        this.vy[slot] += gravity * dt;
    }
}

// =============================================================================
// SERIALIZATION
// =============================================================================

/**
 * Byte size of serialized physics.
 */
export const PHYSICS_SIZE = 13; // 3 floats + 1 byte

/**
 * Serialize physics to a DataView.
 */
export function writePhysics(view: DataView, offset: number, p: Physics): number {
    view.setFloat32(offset, p.vx, true);
    view.setFloat32(offset + 4, p.vy, true);
    view.setFloat32(offset + 8, p.vz, true);
    view.setUint8(offset + 12, p.grounded ? 1 : 0);
    return PHYSICS_SIZE;
}

/**
 * Deserialize physics from a DataView.
 */
export function readPhysics(view: DataView, offset: number): Physics {
    return {
        vx: view.getFloat32(offset, true),
        vy: view.getFloat32(offset + 4, true),
        vz: view.getFloat32(offset + 8, true),
        grounded: view.getUint8(offset + 12) === 1,
    };
}

/**
 * Serialize physics directly from pool.
 */
export function writePhysicsFromPool(
    view: DataView,
    offset: number,
    pool: PhysicsPool,
    slot: number
): number {
    view.setFloat32(offset, pool.vx[slot]!, true);
    view.setFloat32(offset + 4, pool.vy[slot]!, true);
    view.setFloat32(offset + 8, pool.vz[slot]!, true);
    view.setUint8(offset + 12, pool.grounded[slot]!);
    return PHYSICS_SIZE;
}

/**
 * Deserialize physics directly to pool.
 */
export function readPhysicsToPool(
    view: DataView,
    offset: number,
    pool: PhysicsPool,
    slot: number
): number {
    pool.vx[slot] = view.getFloat32(offset, true);
    pool.vy[slot] = view.getFloat32(offset + 4, true);
    pool.vz[slot] = view.getFloat32(offset + 8, true);
    pool.grounded[slot] = view.getUint8(offset + 12);
    return PHYSICS_SIZE;
}

// =============================================================================
// PHYSICS UTILITIES
// =============================================================================

/**
 * Integrate velocity into position.
 */
export function integrateVelocity(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    dt: number
): [number, number, number] {
    return [
        x + vx * dt,
        y + vy * dt,
        z + vz * dt,
    ];
}

/**
 * Clamp velocity to maximum speed.
 */
export function clampVelocity(
    vx: number, vy: number, vz: number,
    maxSpeed: number
): [number, number, number] {
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (speed <= maxSpeed) {
        return [vx, vy, vz];
    }
    const scale = maxSpeed / speed;
    return [vx * scale, vy * scale, vz * scale];
}

/**
 * Clamp horizontal velocity (XZ plane).
 */
export function clampHorizontalVelocity(
    vx: number, vy: number, vz: number,
    maxSpeed: number
): [number, number, number] {
    const hSpeed = Math.sqrt(vx * vx + vz * vz);
    if (hSpeed <= maxSpeed) {
        return [vx, vy, vz];
    }
    const scale = maxSpeed / hSpeed;
    return [vx * scale, vy, vz * scale];
}
