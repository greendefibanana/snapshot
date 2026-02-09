/**
 * Transform - Position and rotation component
 * 
 * Stored in SOA (Struct-of-Arrays) format for cache efficiency.
 * All entities with physics presence have a transform.
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Transform component data.
 * 28 bytes when serialized.
 */
export interface Transform {
    /** Position X */
    x: number;
    /** Position Y */
    y: number;
    /** Position Z */
    z: number;
    /** Rotation quaternion X */
    qx: number;
    /** Rotation quaternion Y */
    qy: number;
    /** Rotation quaternion Z */
    qz: number;
    /** Rotation quaternion W */
    qw: number;
}

/**
 * Create a default transform at origin.
 */
export function createTransform(): Transform {
    return {
        x: 0,
        y: 0,
        z: 0,
        qx: 0,
        qy: 0,
        qz: 0,
        qw: 1,
    };
}

/**
 * Create a transform at a position with identity rotation.
 */
export function transformAt(x: number, y: number, z: number): Transform {
    return {
        x, y, z,
        qx: 0, qy: 0, qz: 0, qw: 1,
    };
}

/**
 * Clone a transform.
 */
export function cloneTransform(t: Transform): Transform {
    return { ...t };
}

/**
 * Copy transform data.
 */
export function copyTransform(dest: Transform, src: Transform): void {
    dest.x = src.x;
    dest.y = src.y;
    dest.z = src.z;
    dest.qx = src.qx;
    dest.qy = src.qy;
    dest.qz = src.qz;
    dest.qw = src.qw;
}

// =============================================================================
// TRANSFORM POOL (SOA)
// =============================================================================

/**
 * SOA pool for transform components.
 * Positions and rotations stored in contiguous typed arrays.
 */
export class TransformPool {
    /** X positions */
    readonly x: Float32Array;
    /** Y positions */
    readonly y: Float32Array;
    /** Z positions */
    readonly z: Float32Array;
    /** Rotation quaternion X */
    readonly qx: Float32Array;
    /** Rotation quaternion Y */
    readonly qy: Float32Array;
    /** Rotation quaternion Z */
    readonly qz: Float32Array;
    /** Rotation quaternion W */
    readonly qw: Float32Array;

    /** Pool capacity */
    readonly capacity: number;

    constructor(capacity: number) {
        this.capacity = capacity;
        this.x = new Float32Array(capacity);
        this.y = new Float32Array(capacity);
        this.z = new Float32Array(capacity);
        this.qx = new Float32Array(capacity);
        this.qy = new Float32Array(capacity);
        this.qz = new Float32Array(capacity);
        this.qw = new Float32Array(capacity);

        // Initialize quaternions to identity
        this.qw.fill(1);
    }

    /**
     * Get transform at slot.
     */
    get(slot: number): Transform {
        return {
            x: this.x[slot]!,
            y: this.y[slot]!,
            z: this.z[slot]!,
            qx: this.qx[slot]!,
            qy: this.qy[slot]!,
            qz: this.qz[slot]!,
            qw: this.qw[slot]!,
        };
    }

    /**
     * Set transform at slot.
     */
    set(slot: number, t: Transform): void {
        this.x[slot] = t.x;
        this.y[slot] = t.y;
        this.z[slot] = t.z;
        this.qx[slot] = t.qx;
        this.qy[slot] = t.qy;
        this.qz[slot] = t.qz;
        this.qw[slot] = t.qw;
    }

    /**
     * Set position only.
     */
    setPosition(slot: number, x: number, y: number, z: number): void {
        this.x[slot] = x;
        this.y[slot] = y;
        this.z[slot] = z;
    }

    /**
     * Set rotation only.
     */
    setRotation(slot: number, qx: number, qy: number, qz: number, qw: number): void {
        this.qx[slot] = qx;
        this.qy[slot] = qy;
        this.qz[slot] = qz;
        this.qw[slot] = qw;
    }

    /**
     * Get position as array [x, y, z].
     */
    getPosition(slot: number): [number, number, number] {
        return [this.x[slot]!, this.y[slot]!, this.z[slot]!];
    }

    /**
     * Get rotation as array [qx, qy, qz, qw].
     */
    getRotation(slot: number): [number, number, number, number] {
        return [this.qx[slot]!, this.qy[slot]!, this.qz[slot]!, this.qw[slot]!];
    }

    /**
     * Copy transform from one slot to another.
     */
    copy(destSlot: number, srcSlot: number): void {
        this.x[destSlot] = this.x[srcSlot]!;
        this.y[destSlot] = this.y[srcSlot]!;
        this.z[destSlot] = this.z[srcSlot]!;
        this.qx[destSlot] = this.qx[srcSlot]!;
        this.qy[destSlot] = this.qy[srcSlot]!;
        this.qz[destSlot] = this.qz[srcSlot]!;
        this.qw[destSlot] = this.qw[srcSlot]!;
    }

    /**
     * Reset slot to default (origin, identity rotation).
     */
    reset(slot: number): void {
        this.x[slot] = 0;
        this.y[slot] = 0;
        this.z[slot] = 0;
        this.qx[slot] = 0;
        this.qy[slot] = 0;
        this.qz[slot] = 0;
        this.qw[slot] = 1;
    }

    /**
     * Calculate distance squared between two slots.
     */
    distanceSquared(slotA: number, slotB: number): number {
        const dx = this.x[slotA]! - this.x[slotB]!;
        const dy = this.y[slotA]! - this.y[slotB]!;
        const dz = this.z[slotA]! - this.z[slotB]!;
        return dx * dx + dy * dy + dz * dz;
    }

    /**
     * Calculate distance between two slots.
     */
    distance(slotA: number, slotB: number): number {
        return Math.sqrt(this.distanceSquared(slotA, slotB));
    }
}

// =============================================================================
// SERIALIZATION
// =============================================================================

/**
 * Byte size of serialized transform.
 */
export const TRANSFORM_SIZE = 28;

/**
 * Serialize a transform to a DataView.
 */
export function writeTransform(view: DataView, offset: number, t: Transform): number {
    view.setFloat32(offset, t.x, true);
    view.setFloat32(offset + 4, t.y, true);
    view.setFloat32(offset + 8, t.z, true);
    view.setFloat32(offset + 12, t.qx, true);
    view.setFloat32(offset + 16, t.qy, true);
    view.setFloat32(offset + 20, t.qz, true);
    view.setFloat32(offset + 24, t.qw, true);
    return TRANSFORM_SIZE;
}

/**
 * Deserialize a transform from a DataView.
 */
export function readTransform(view: DataView, offset: number): Transform {
    return {
        x: view.getFloat32(offset, true),
        y: view.getFloat32(offset + 4, true),
        z: view.getFloat32(offset + 8, true),
        qx: view.getFloat32(offset + 12, true),
        qy: view.getFloat32(offset + 16, true),
        qz: view.getFloat32(offset + 20, true),
        qw: view.getFloat32(offset + 24, true),
    };
}

/**
 * Serialize transform directly from pool.
 */
export function writeTransformFromPool(
    view: DataView,
    offset: number,
    pool: TransformPool,
    slot: number
): number {
    view.setFloat32(offset, pool.x[slot]!, true);
    view.setFloat32(offset + 4, pool.y[slot]!, true);
    view.setFloat32(offset + 8, pool.z[slot]!, true);
    view.setFloat32(offset + 12, pool.qx[slot]!, true);
    view.setFloat32(offset + 16, pool.qy[slot]!, true);
    view.setFloat32(offset + 20, pool.qz[slot]!, true);
    view.setFloat32(offset + 24, pool.qw[slot]!, true);
    return TRANSFORM_SIZE;
}

/**
 * Deserialize transform directly to pool.
 */
export function readTransformToPool(
    view: DataView,
    offset: number,
    pool: TransformPool,
    slot: number
): number {
    pool.x[slot] = view.getFloat32(offset, true);
    pool.y[slot] = view.getFloat32(offset + 4, true);
    pool.z[slot] = view.getFloat32(offset + 8, true);
    pool.qx[slot] = view.getFloat32(offset + 12, true);
    pool.qy[slot] = view.getFloat32(offset + 16, true);
    pool.qz[slot] = view.getFloat32(offset + 20, true);
    pool.qw[slot] = view.getFloat32(offset + 24, true);
    return TRANSFORM_SIZE;
}

// =============================================================================
// INTERPOLATION
// =============================================================================

/**
 * Linearly interpolate between two transforms.
 */
export function lerpTransform(a: Transform, b: Transform, t: number): Transform {
    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        qx: a.qx + (b.qx - a.qx) * t,
        qy: a.qy + (b.qy - a.qy) * t,
        qz: a.qz + (b.qz - a.qz) * t,
        qw: a.qw + (b.qw - a.qw) * t,
    };
}

/**
 * Spherical linear interpolation for rotation.
 */
export function slerpRotation(
    a: Transform,
    b: Transform,
    t: number
): { qx: number; qy: number; qz: number; qw: number } {
    let dot = a.qx * b.qx + a.qy * b.qy + a.qz * b.qz + a.qw * b.qw;

    let bx = b.qx, by = b.qy, bz = b.qz, bw = b.qw;
    if (dot < 0) {
        dot = -dot;
        bx = -bx;
        by = -by;
        bz = -bz;
        bw = -bw;
    }

    if (dot > 0.9995) {
        // Linear interpolation for close quaternions
        const len = Math.sqrt(
            (a.qx + (bx - a.qx) * t) ** 2 +
            (a.qy + (by - a.qy) * t) ** 2 +
            (a.qz + (bz - a.qz) * t) ** 2 +
            (a.qw + (bw - a.qw) * t) ** 2
        );
        return {
            qx: (a.qx + (bx - a.qx) * t) / len,
            qy: (a.qy + (by - a.qy) * t) / len,
            qz: (a.qz + (bz - a.qz) * t) / len,
            qw: (a.qw + (bw - a.qw) * t) / len,
        };
    }

    const theta = Math.acos(dot);
    const sinTheta = Math.sin(theta);
    const wa = Math.sin((1 - t) * theta) / sinTheta;
    const wb = Math.sin(t * theta) / sinTheta;

    return {
        qx: a.qx * wa + bx * wb,
        qy: a.qy * wa + by * wb,
        qz: a.qz * wa + bz * wb,
        qw: a.qw * wa + bw * wb,
    };
}
