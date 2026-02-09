/**
 * SNAPSHOT Core Type Definitions
 * 
 * These types form the foundation of the entire game simulation.
 * All types are designed to be serializable for networking.
 */

// =============================================================================
// BRANDED TYPES - Type-safe IDs to prevent mixing different ID types
// =============================================================================

declare const __brand: unique symbol;
type Brand<T, B> = T & { [__brand]: B };

/** Unique identifier for any entity in the game world */
export type EntityId = Brand<number, 'EntityId'>;

/** Unique identifier for a connected player */
export type PlayerId = Brand<string, 'PlayerId'>;

/** Team identifier (0 = unassigned, 1 = team A, 2 = team B) */
export type TeamId = Brand<number, 'TeamId'>;

/** Simulation tick number */
export type Tick = Brand<number, 'Tick'>;

// =============================================================================
// MATH PRIMITIVES - Used throughout the simulation
// =============================================================================

/** 3D vector for positions, velocities, directions */
export interface Vector3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** Quaternion for rotations */
export interface Quaternion {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
}

/** Transform combining position and rotation */
export interface Transform {
    readonly position: Vector3;
    readonly rotation: Quaternion;
}

// =============================================================================
// UTILITY FUNCTIONS - Vector/Quaternion operations
// =============================================================================

export const Vec3 = {
    zero: (): Vector3 => ({ x: 0, y: 0, z: 0 }),
    one: (): Vector3 => ({ x: 1, y: 1, z: 1 }),
    up: (): Vector3 => ({ x: 0, y: 1, z: 0 }),
    forward: (): Vector3 => ({ x: 0, y: 0, z: -1 }),
    right: (): Vector3 => ({ x: 1, y: 0, z: 0 }),

    create: (x: number, y: number, z: number): Vector3 => ({ x, y, z }),

    add: (a: Vector3, b: Vector3): Vector3 => ({
        x: a.x + b.x,
        y: a.y + b.y,
        z: a.z + b.z,
    }),

    sub: (a: Vector3, b: Vector3): Vector3 => ({
        x: a.x - b.x,
        y: a.y - b.y,
        z: a.z - b.z,
    }),

    scale: (v: Vector3, s: number): Vector3 => ({
        x: v.x * s,
        y: v.y * s,
        z: v.z * s,
    }),

    dot: (a: Vector3, b: Vector3): number =>
        a.x * b.x + a.y * b.y + a.z * b.z,

    cross: (a: Vector3, b: Vector3): Vector3 => ({
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    }),

    lengthSq: (v: Vector3): number =>
        v.x * v.x + v.y * v.y + v.z * v.z,

    length: (v: Vector3): number =>
        Math.sqrt(Vec3.lengthSq(v)),

    normalize: (v: Vector3): Vector3 => {
        const len = Vec3.length(v);
        if (len === 0) return Vec3.zero();
        return Vec3.scale(v, 1 / len);
    },

    lerp: (a: Vector3, b: Vector3, t: number): Vector3 => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
    }),

    distance: (a: Vector3, b: Vector3): number =>
        Vec3.length(Vec3.sub(b, a)),

    distanceSq: (a: Vector3, b: Vector3): number =>
        Vec3.lengthSq(Vec3.sub(b, a)),

    equals: (a: Vector3, b: Vector3, epsilon = 0.0001): boolean =>
        Math.abs(a.x - b.x) < epsilon &&
        Math.abs(a.y - b.y) < epsilon &&
        Math.abs(a.z - b.z) < epsilon,

    clone: (v: Vector3): Vector3 => ({ x: v.x, y: v.y, z: v.z }),
} as const;

export const Quat = {
    identity: (): Quaternion => ({ x: 0, y: 0, z: 0, w: 1 }),

    fromEuler: (x: number, y: number, z: number): Quaternion => {
        const c1 = Math.cos(x / 2);
        const c2 = Math.cos(y / 2);
        const c3 = Math.cos(z / 2);
        const s1 = Math.sin(x / 2);
        const s2 = Math.sin(y / 2);
        const s3 = Math.sin(z / 2);

        return {
            x: s1 * c2 * c3 + c1 * s2 * s3,
            y: c1 * s2 * c3 - s1 * c2 * s3,
            z: c1 * c2 * s3 + s1 * s2 * c3,
            w: c1 * c2 * c3 - s1 * s2 * s3,
        };
    },

    fromAxisAngle: (axis: Vector3, angle: number): Quaternion => {
        const halfAngle = angle / 2;
        const s = Math.sin(halfAngle);
        return {
            x: axis.x * s,
            y: axis.y * s,
            z: axis.z * s,
            w: Math.cos(halfAngle),
        };
    },

    multiply: (a: Quaternion, b: Quaternion): Quaternion => ({
        x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
        w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    }),

    rotateVector: (q: Quaternion, v: Vector3): Vector3 => {
        const qv: Vector3 = { x: q.x, y: q.y, z: q.z };
        const uv = Vec3.cross(qv, v);
        const uuv = Vec3.cross(qv, uv);
        return Vec3.add(v, Vec3.add(Vec3.scale(uv, 2 * q.w), Vec3.scale(uuv, 2)));
    },

    slerp: (a: Quaternion, b: Quaternion, t: number): Quaternion => {
        let cosHalfTheta = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

        if (cosHalfTheta < 0) {
            b = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
            cosHalfTheta = -cosHalfTheta;
        }

        if (cosHalfTheta >= 1) {
            return { ...a };
        }

        const halfTheta = Math.acos(cosHalfTheta);
        const sinHalfTheta = Math.sqrt(1 - cosHalfTheta * cosHalfTheta);

        if (Math.abs(sinHalfTheta) < 0.001) {
            return {
                x: a.x * 0.5 + b.x * 0.5,
                y: a.y * 0.5 + b.y * 0.5,
                z: a.z * 0.5 + b.z * 0.5,
                w: a.w * 0.5 + b.w * 0.5,
            };
        }

        const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
        const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

        return {
            x: a.x * ratioA + b.x * ratioB,
            y: a.y * ratioA + b.y * ratioB,
            z: a.z * ratioA + b.z * ratioB,
            w: a.w * ratioA + b.w * ratioB,
        };
    },

    clone: (q: Quaternion): Quaternion => ({ x: q.x, y: q.y, z: q.z, w: q.w }),
} as const;

// =============================================================================
// INPUT TYPES - Player input captured each tick
// =============================================================================

/** Movement direction flags */
export interface MovementInput {
    readonly forward: boolean;
    readonly backward: boolean;
    readonly left: boolean;
    readonly right: boolean;
    readonly jump: boolean;
    readonly crouch: boolean;
    readonly sprint: boolean;
    readonly dodge: boolean;
}

/** Aim direction in world space */
export interface AimInput {
    readonly yaw: number;   // Horizontal angle in radians
    readonly pitch: number; // Vertical angle in radians (-PI/2 to PI/2)
}

/** Complete input state for a single tick */
export interface InputFrame {
    readonly tick: Tick;
    readonly movement: MovementInput;
    readonly aim: AimInput;
    readonly primaryFire: boolean;
    readonly secondaryFire: boolean;
    readonly reload: boolean;
    readonly tactical: boolean;
    readonly ultimate: boolean;
    readonly interact: boolean;
    readonly weaponSlot: number; // 0-2 for weapon switch
}

/** Factory for creating empty input frames */
export const InputFrame = {
    empty: (tick: Tick): InputFrame => ({
        tick,
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
    }),
} as const;

// =============================================================================
// GAME EVENTS - Events that occur during simulation
// =============================================================================

export type GameEvent =
    | { type: 'player_joined'; playerId: PlayerId; entityId: EntityId }
    | { type: 'player_left'; playerId: PlayerId }
    | { type: 'player_spawned'; entityId: EntityId; position: Vector3 }
    | { type: 'player_died'; entityId: EntityId; killerId: EntityId | null; weapon: string }
    | { type: 'aim_state'; sourceId: EntityId; isAiming: boolean }
    | { type: 'shot_fired'; sourceId: EntityId; origin: Vector3; direction: Vector3; weapon: string }
    | { type: 'damage_dealt'; targetId: EntityId; sourceId: EntityId; amount: number; weapon: string }
    | { type: 'hit_feedback'; sourceId: EntityId; targetId: EntityId; damage: number; isHeadshot: boolean; isKill: boolean; hitPosition: Vector3 }
    | { type: 'damage_taken'; targetId: EntityId; direction: Vector3; damage: number; remainingHealth: number; remainingShield: number }
    | { type: 'projectile_spawned'; entityId: EntityId; position: Vector3; velocity: Vector3 }
    | { type: 'projectile_hit'; projectileId: EntityId; targetId: EntityId | null; position: Vector3 }
    | { type: 'ability_activated'; entityId: EntityId; abilityId: string }
    | { type: 'ability_ended'; entityId: EntityId; abilityId: string }
    | { type: 'zone_captured'; zoneId: string; teamId: TeamId }
    | { type: 'match_started'; mode: string }
    | { type: 'match_ended'; winningTeam: TeamId; scores: Record<number, number> }
    | { type: 'round_started'; roundNumber: number }
    | { type: 'round_ended'; winningTeam: TeamId }
    | { type: 'net_pose'; playerId: PlayerId; position: Vector3; rotation?: Quaternion; tick: Tick };

// =============================================================================
// CONSTANTS
// =============================================================================

/** Simulation constants - these should never change at runtime */
export const SIMULATION = {
    /** Ticks per second */
    TICK_RATE: 60,
    /** Milliseconds per tick */
    TICK_MS: 1000 / 60,
    /** Seconds per tick */
    TICK_DELTA: 1 / 60,
    /** Maximum ticks to store for reconciliation */
    MAX_TICK_HISTORY: 120,
    /** Interpolation delay in milliseconds */
    INTERPOLATION_DELAY_MS: 100,
} as const;

export const PHYSICS = {
    /** Gravity in m/s² */
    GRAVITY: -20,
    /** Default ground friction */
    GROUND_FRICTION: 0.9,
    /** Air resistance */
    AIR_FRICTION: 0.98,
    /** Maximum fall speed */
    TERMINAL_VELOCITY: -50,
} as const;

export const COMBAT = {
    /** Time before respawn in ticks */
    RESPAWN_DELAY_TICKS: 180, // 3 seconds
    /** Spawn invulnerability in ticks */
    SPAWN_PROTECTION_TICKS: 180, // 3 seconds
    /** Assist timeout in ticks */
    ASSIST_TIMEOUT_TICKS: 300, // 5 seconds
    /** Enable friendly fire (damage to teammates) */
    FRIENDLY_FIRE_ENABLED: false,
} as const;
