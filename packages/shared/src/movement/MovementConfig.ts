/**
 * Movement Configuration
 * 
 * All tunable parameters for the Splatoon 3-inspired movement system.
 * Centralized for easy balancing.
 */

// =============================================================================
// TERRAIN TYPES
// =============================================================================

export const TERRAIN_DEFAULT = 0;
export const TERRAIN_SLIPPERY = 1;
export const TERRAIN_STICKY = 2;
export const TERRAIN_BOUNCY = 3;

export type TerrainType = typeof TERRAIN_DEFAULT | typeof TERRAIN_SLIPPERY | typeof TERRAIN_STICKY | typeof TERRAIN_BOUNCY;

// =============================================================================
// MOVEMENT CONFIGURATION
// =============================================================================

export interface MovementConfig {
    // Speed (m/s)
    readonly maxGroundSpeed: number;
    readonly maxSprintSpeed: number;
    readonly maxAirSpeed: number;

    // Acceleration (m/s²)
    readonly groundAccel: number;
    readonly airAccel: number;
    readonly stopAccel: number;

    // Friction (coefficient)
    readonly groundFriction: number;
    readonly airFriction: number;

    // Jumping
    readonly jumpVelocity: number;
    readonly gravity: number;
    readonly terminalVelocity: number;
    readonly coyoteTimeTicks: number;
    readonly jumpBufferTicks: number;

    // Dodge Burst
    readonly dodgeImpulse: number;
    readonly dodgeCooldownTicks: number;
    readonly dodgeDurationTicks: number;
    readonly dodgeAirAllowed: boolean;

    // Terrain Friction Multipliers
    readonly terrainFriction: Readonly<Record<number, number>>;

    // Character Collider
    readonly characterHeight: number;
    readonly characterRadius: number;
    readonly stepHeight: number;
    readonly maxSlopeAngle: number;
    readonly groundSnapDistance: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

export const DEFAULT_MOVEMENT_CONFIG: MovementConfig = {
    // ═══════════════════════════════════════════════════════════
    // SPEED (m/s)
    // ═══════════════════════════════════════════════════════════
    maxGroundSpeed: 8.5,      // Base run speed
    maxSprintSpeed: 12.0,     // Sprint speed (hold shift)
    maxAirSpeed: 8.5,         // Max horizontal air speed

    // ═══════════════════════════════════════════════════════════
    // ACCELERATION (m/s²)
    // ═══════════════════════════════════════════════════════════
    groundAccel: 85.0,        // Ground acceleration (~10 ticks to max)
    airAccel: 25.0,           // Air acceleration (strong air control)
    stopAccel: 100.0,         // Deceleration when no input

    // ═══════════════════════════════════════════════════════════
    // FRICTION (coefficient)
    // ═══════════════════════════════════════════════════════════
    groundFriction: 12.0,     // Ground friction
    airFriction: 0.5,         // Air drag (minimal)

    // ═══════════════════════════════════════════════════════════
    // JUMPING
    // ═══════════════════════════════════════════════════════════
    jumpVelocity: 10.0,       // Initial jump velocity
    gravity: -28.0,           // Downward acceleration
    terminalVelocity: -40.0,  // Max fall speed
    coyoteTimeTicks: 6,       // 100ms coyote time
    jumpBufferTicks: 6,       // 100ms jump buffer

    // ═══════════════════════════════════════════════════════════
    // DODGE BURST
    // ═══════════════════════════════════════════════════════════
    dodgeImpulse: 18.0,       // Dodge velocity
    dodgeCooldownTicks: 36,   // 600ms cooldown
    dodgeDurationTicks: 8,    // 133ms active duration
    dodgeAirAllowed: false,   // Can dodge in air?

    // ═══════════════════════════════════════════════════════════
    // TERRAIN FRICTION MULTIPLIERS
    // ═══════════════════════════════════════════════════════════
    terrainFriction: {
        [TERRAIN_DEFAULT]: 1.0,
        [TERRAIN_SLIPPERY]: 0.3,
        [TERRAIN_STICKY]: 2.0,
        [TERRAIN_BOUNCY]: 0.8,
    },

    // ═══════════════════════════════════════════════════════════
    // CHARACTER COLLIDER
    // ═══════════════════════════════════════════════════════════
    characterHeight: 1.8,
    characterRadius: 0.35,
    stepHeight: 0.35,
    maxSlopeAngle: 50,
    groundSnapDistance: 0.3,
};

// =============================================================================
// CONFIG MERGING
// =============================================================================

/**
 * Create a movement config by merging partial overrides with defaults.
 */
export function createMovementConfig(overrides?: Partial<MovementConfig>): MovementConfig {
    if (!overrides) return DEFAULT_MOVEMENT_CONFIG;

    return {
        ...DEFAULT_MOVEMENT_CONFIG,
        ...overrides,
        terrainFriction: {
            ...DEFAULT_MOVEMENT_CONFIG.terrainFriction,
            ...overrides.terrainFriction,
        },
    };
}
