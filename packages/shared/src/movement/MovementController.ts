/**
 * Movement Controller
 * 
 * Splatoon 3-inspired momentum-based movement system.
 * Uses Quake-style acceleration with strong air control.
 * 
 * Deterministic: produces identical results given same inputs.
 */

import type { Vector3 } from '../types/index.js';
import type { MovementInput, AimInput } from '../simulation/InputBuffer.js';
import { TICK_DELTA } from '../simulation/Tick.js';
import {
    type MovementConfig,
    type TerrainType,
    DEFAULT_MOVEMENT_CONFIG,
    TERRAIN_DEFAULT,
} from './MovementConfig.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Mutable vector for internal calculations.
 */
interface MutableVec3 {
    x: number;
    y: number;
    z: number;
}

/**
 * Per-entity velocity state.
 */
export interface VelocityState {
    velocity: MutableVec3;
    externalImpulse: MutableVec3;
    groundNormal: MutableVec3;
    isGrounded: boolean;
    groundMaterial: TerrainType;
}

/**
 * Per-entity dodge state.
 */
export interface DodgeState {
    cooldownRemainingTicks: number;
    activeDurationTicks: number;
    direction: MutableVec3;
}

/**
 * Per-entity jump state (for coyote time and jump buffering).
 */
export interface JumpState {
    coyoteTicksRemaining: number;
    jumpBufferTicks: number;
    wasGroundedLastTick: boolean;
}

/**
 * Combined movement state for an entity.
 */
export interface MovementState {
    velocity: VelocityState;
    dodge: DodgeState;
    jump: JumpState;
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

export function createVelocityState(): VelocityState {
    return {
        velocity: { x: 0, y: 0, z: 0 },
        externalImpulse: { x: 0, y: 0, z: 0 },
        groundNormal: { x: 0, y: 1, z: 0 },
        isGrounded: true,
        groundMaterial: TERRAIN_DEFAULT,
    };
}

export function createDodgeState(): DodgeState {
    return {
        cooldownRemainingTicks: 0,
        activeDurationTicks: 0,
        direction: { x: 0, y: 0, z: 0 },
    };
}

export function createJumpState(): JumpState {
    return {
        coyoteTicksRemaining: 0,
        jumpBufferTicks: 0,
        wasGroundedLastTick: true,
    };
}

export function createMovementState(): MovementState {
    return {
        velocity: createVelocityState(),
        dodge: createDodgeState(),
        jump: createJumpState(),
    };
}

// =============================================================================
// VECTOR OPERATIONS (inline for performance)
// =============================================================================

function vec3Length(v: MutableVec3): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vec3HorizontalLength(v: MutableVec3): number {
    return Math.sqrt(v.x * v.x + v.z * v.z);
}

function vec3DotHorizontal(a: MutableVec3, b: MutableVec3): number {
    return a.x * b.x + a.z * b.z;
}

function vec3Zero(v: MutableVec3): void {
    v.x = 0;
    v.y = 0;
    v.z = 0;
}

// =============================================================================
// WISH DIRECTION
// =============================================================================

/**
 * Calculate the intended movement direction from input.
 * Returns a normalized horizontal direction vector.
 */
export function calculateWishDirection(input: MovementInput, yaw: number): MutableVec3 {
    // Forward in world space based on yaw
    const forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };

    let moveX = 0;
    let moveZ = 0;

    if (input.forward) {
        moveX += forward.x;
        moveZ += forward.z;
    }
    if (input.backward) {
        moveX -= forward.x;
        moveZ -= forward.z;
    }
    if (input.right) {
        moveX += right.x;
        moveZ += right.z;
    }
    if (input.left) {
        moveX -= right.x;
        moveZ -= right.z;
    }

    // Normalize to prevent faster diagonal movement
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0.001) {
        return { x: moveX / len, y: 0, z: moveZ / len };
    }

    return { x: 0, y: 0, z: 0 };
}

/**
 * Check if there is movement input.
 */
export function hasMovementInput(input: MovementInput): boolean {
    return input.forward || input.backward || input.left || input.right;
}

// =============================================================================
// GROUND MOVEMENT (Quake-style Acceleration)
// =============================================================================

/**
 * Apply ground movement with friction and acceleration.
 */
export function applyGroundMovement(
    state: VelocityState,
    wishDir: MutableVec3,
    wishSpeed: number,
    config: MovementConfig,
    dt: number
): void {
    // Get terrain friction multiplier
    const frictionMult = config.terrainFriction[state.groundMaterial] ?? 1.0;
    const friction = config.groundFriction * frictionMult;

    // Apply friction first (deceleration)
    const speed = vec3HorizontalLength(state.velocity);
    if (speed > 0.1) {
        const drop = speed * friction * dt;
        const newSpeed = Math.max(0, speed - drop);
        const scale = newSpeed / speed;
        state.velocity.x *= scale;
        state.velocity.z *= scale;
    }

    // Check if there's input
    const wishLen = Math.sqrt(wishDir.x * wishDir.x + wishDir.z * wishDir.z);
    if (wishLen < 0.001) {
        // No input - friction already applied
        return;
    }

    // Quake-style acceleration
    const currentSpeed = vec3DotHorizontal(state.velocity, wishDir);
    const addSpeed = Math.max(0, wishSpeed - currentSpeed);
    const accelSpeed = Math.min(config.groundAccel * dt, addSpeed);

    // Apply acceleration
    state.velocity.x += wishDir.x * accelSpeed;
    state.velocity.z += wishDir.z * accelSpeed;
}

// =============================================================================
// AIR MOVEMENT (Strong Air Control)
// =============================================================================

/**
 * Apply air movement with limited acceleration.
 */
export function applyAirMovement(
    state: VelocityState,
    wishDir: MutableVec3,
    config: MovementConfig,
    dt: number
): void {
    // Check if there's input
    const wishLen = Math.sqrt(wishDir.x * wishDir.x + wishDir.z * wishDir.z);
    if (wishLen > 0.001) {
        // Splatoon has strong air control
        const currentSpeed = vec3DotHorizontal(state.velocity, wishDir);
        const addSpeed = config.maxAirSpeed - currentSpeed;

        if (addSpeed > 0) {
            const accelSpeed = Math.min(config.airAccel * dt, addSpeed);
            state.velocity.x += wishDir.x * accelSpeed;
            state.velocity.z += wishDir.z * accelSpeed;
        }
    }

    // Minimal air friction
    const horizontalSpeed = vec3HorizontalLength(state.velocity);
    if (horizontalSpeed > 0.01) {
        const drop = horizontalSpeed * config.airFriction * dt;
        const newSpeed = Math.max(0, horizontalSpeed - drop);
        const scale = newSpeed / horizontalSpeed;
        state.velocity.x *= scale;
        state.velocity.z *= scale;
    }
}

// =============================================================================
// JUMP HANDLING
// =============================================================================

/**
 * Handle jump input with coyote time and jump buffering.
 */
export function handleJump(
    velocityState: VelocityState,
    jumpState: JumpState,
    jumpPressed: boolean,
    config: MovementConfig
): boolean {
    // Update coyote time
    if (velocityState.isGrounded) {
        jumpState.coyoteTicksRemaining = config.coyoteTimeTicks;
    } else if (jumpState.coyoteTicksRemaining > 0) {
        jumpState.coyoteTicksRemaining--;
    }

    // Update jump buffer
    if (jumpPressed) {
        jumpState.jumpBufferTicks = config.jumpBufferTicks;
    } else if (jumpState.jumpBufferTicks > 0) {
        jumpState.jumpBufferTicks--;
    }

    // Can jump if: grounded OR within coyote time
    const canJump = velocityState.isGrounded || jumpState.coyoteTicksRemaining > 0;

    // Should jump if: can jump AND (just pressed OR buffered)
    const shouldJump = canJump && jumpState.jumpBufferTicks > 0;

    if (shouldJump) {
        velocityState.velocity.y = config.jumpVelocity;
        velocityState.isGrounded = false;
        jumpState.coyoteTicksRemaining = 0;
        jumpState.jumpBufferTicks = 0;
        return true;
    }

    jumpState.wasGroundedLastTick = velocityState.isGrounded;
    return false;
}

// =============================================================================
// DODGE BURST
// =============================================================================

/**
 * Handle dodge burst activation.
 * Returns true if dodge was activated.
 */
export function handleDodgeBurst(
    velocityState: VelocityState,
    dodgeState: DodgeState,
    dodgePressed: boolean,
    input: MovementInput,
    yaw: number,
    config: MovementConfig
): boolean {
    // Decrement timers
    if (dodgeState.cooldownRemainingTicks > 0) {
        dodgeState.cooldownRemainingTicks--;
    }
    if (dodgeState.activeDurationTicks > 0) {
        dodgeState.activeDurationTicks--;
    }

    // Check if dodge can be activated
    const canDodge = dodgeState.cooldownRemainingTicks <= 0 &&
        (config.dodgeAirAllowed || velocityState.isGrounded);

    if (dodgePressed && canDodge) {
        // Calculate dodge direction
        const wishDir = calculateWishDirection(input, yaw);
        const wishLen = Math.sqrt(wishDir.x * wishDir.x + wishDir.z * wishDir.z);

        if (wishLen > 0.1) {
            // Dodge in movement direction
            dodgeState.direction = wishDir;
        } else {
            // No input = dodge backward
            dodgeState.direction = {
                x: Math.sin(yaw),
                y: 0,
                z: Math.cos(yaw),
            };
        }

        // Apply dodge impulse
        velocityState.velocity.x = dodgeState.direction.x * config.dodgeImpulse;
        velocityState.velocity.z = dodgeState.direction.z * config.dodgeImpulse;

        // Start cooldown and active duration
        dodgeState.cooldownRemainingTicks = config.dodgeCooldownTicks;
        dodgeState.activeDurationTicks = config.dodgeDurationTicks;

        return true;
    }

    return false;
}

/**
 * Check if dodge is currently active (for invincibility, etc.)
 */
export function isDodgeActive(dodgeState: DodgeState): boolean {
    return dodgeState.activeDurationTicks > 0;
}

// =============================================================================
// EXTERNAL IMPULSE (Knockback)
// =============================================================================

/**
 * Apply knockback/impulse from external sources.
 * The impulse is accumulated and applied on the next movement update.
 */
export function applyKnockback(
    state: VelocityState,
    impulse: Vector3,
    knockbackResistance: number = 0
): void {
    const resistance = 1 - Math.min(1, Math.max(0, knockbackResistance));
    state.externalImpulse.x += impulse.x * resistance;
    state.externalImpulse.y += impulse.y * resistance;
    state.externalImpulse.z += impulse.z * resistance;
}

// =============================================================================
// MAIN UPDATE FUNCTION
// =============================================================================

/**
 * Update movement state for a single tick.
 * This is the main entry point, called once per tick.
 */
export function updateMovement(
    state: MovementState,
    input: MovementInput,
    aim: AimInput,
    dodgePressed: boolean,
    config: MovementConfig = DEFAULT_MOVEMENT_CONFIG,
    dt: number = TICK_DELTA
): void {
    const { velocity: velState, dodge: dodgeState, jump: jumpState } = state;

    // 1. Handle dodge burst (overrides normal movement if activated)
    const dodged = handleDodgeBurst(velState, dodgeState, dodgePressed, input, aim.yaw, config);

    if (!dodged) {
        // 2. Calculate wish direction and speed
        const wishDir = calculateWishDirection(input, aim.yaw);
        const wishSpeed = input.sprint ? config.maxSprintSpeed : config.maxGroundSpeed;

        // 3. Apply movement based on ground/air state
        if (velState.isGrounded) {
            applyGroundMovement(velState, wishDir, wishSpeed, config, dt);
        } else {
            applyAirMovement(velState, wishDir, config, dt);
        }
    }

    // 4. Handle jump
    handleJump(velState, jumpState, input.jump, config);

    // 5. Apply gravity
    if (!velState.isGrounded) {
        velState.velocity.y += config.gravity * dt;

        // Cap terminal velocity
        if (velState.velocity.y < config.terminalVelocity) {
            velState.velocity.y = config.terminalVelocity;
        }
    }

    // 6. Apply external impulses (knockback)
    velState.velocity.x += velState.externalImpulse.x;
    velState.velocity.y += velState.externalImpulse.y;
    velState.velocity.z += velState.externalImpulse.z;
    vec3Zero(velState.externalImpulse);

    // 7. Cap maximum horizontal velocity (prevents exploits)
    const maxHorizontal = Math.max(config.maxSprintSpeed, config.dodgeImpulse) * 1.5;
    const horizontalSpeed = vec3HorizontalLength(velState.velocity);
    if (horizontalSpeed > maxHorizontal) {
        const scale = maxHorizontal / horizontalSpeed;
        velState.velocity.x *= scale;
        velState.velocity.z *= scale;
    }
}

/**
 * Integrate velocity to get position delta.
 * Call this after physics/collision to get final position change.
 */
export function getPositionDelta(velocity: Vector3, dt: number = TICK_DELTA): Vector3 {
    return {
        x: velocity.x * dt,
        y: velocity.y * dt,
        z: velocity.z * dt,
    };
}
