/**
 * Movement System
 * 
 * Handles player movement with species-specific traits.
 * Processes input and applies velocities.
 */

import {
    type World,
    type EntityId,
    type Tick,
    type Vector3,
    Vec3,
    Quat,
    SIMULATION,
    PHYSICS,
    getEntitiesWith,
    getComponent,
    hasComponent,
    getSpeciesTraits,
} from '@snapshot/shared';

// =============================================================================
// MOVEMENT CONSTANTS
// =============================================================================

const MOVEMENT = {
    /** Base acceleration */
    ACCELERATION: 50,
    /** Air control multiplier */
    AIR_CONTROL: 0.3,
    /** Jump buffer window (ticks) */
    JUMP_BUFFER: 6,
    /** Coyote time window (ticks) */
    COYOTE_TIME: 6,
    /** Wall jump impulse multiplier */
    WALL_JUMP_MULTIPLIER: 0.8,
    /** Climb speed (units/s) */
    CLIMB_SPEED: 5,
    /** Sprint transition time (ticks) */
    SPRINT_TRANSITION: 10,
} as const;

// =============================================================================
// MOVEMENT SYSTEM
// =============================================================================

/**
 * Process movement for all player entities.
 */
export function movementSystem(world: World): void {
    for (const [entityId, player] of getEntitiesWith(world, 'player')) {
        if (!player.isAlive) continue;

        const transform = getComponent(world, entityId, 'transform');
        const physics = getComponent(world, entityId, 'physics');

        if (!transform || !physics) continue;

        const input = player.currentInput;
        const traits = getSpeciesTraits(player.species);

        // Calculate base move speed with modifiers
        const character = getComponent(world, entityId, 'ability');
        const baseSpeed = player.loadout.characterId
            ? 7.0 // Default speed, would come from character definition
            : 7.0;

        let moveSpeed = baseSpeed * traits.speedMultiplier;

        // Apply sprint multiplier
        if (input.movement.sprint && !input.movement.crouch) {
            moveSpeed *= 1.4;
        }

        // Apply crouch slow
        if (input.movement.crouch) {
            moveSpeed *= 0.5;
        }

        // Calculate movement direction from input
        const moveDir = calculateMoveDirection(input.aim.yaw, input.movement);

        // Different handling for grounded vs airborne
        if (physics.isGrounded) {
            physics.ticksSinceGrounded = 0;

            // Ground movement
            const targetVelocity = Vec3.scale(moveDir, moveSpeed);

            // Smooth acceleration
            const currentHorizontal: Vector3 = {
                x: physics.velocity.x,
                y: 0,
                z: physics.velocity.z,
            };

            const acceleration = MOVEMENT.ACCELERATION * SIMULATION.TICK_DELTA;
            const newHorizontal = Vec3.lerp(currentHorizontal, targetVelocity, acceleration);

            physics.velocity = {
                x: newHorizontal.x,
                y: physics.velocity.y,
                z: newHorizontal.z,
            };

            // Apply ground friction
            physics.velocity = {
                x: physics.velocity.x * PHYSICS.GROUND_FRICTION,
                y: physics.velocity.y,
                z: physics.velocity.z * PHYSICS.GROUND_FRICTION,
            };

            // Handle jump
            if (input.movement.jump) {
                const jumpForce = 10 * (traits.extendedJump ? 1.3 : 1.0);
                physics.velocity = {
                    ...physics.velocity,
                    y: jumpForce,
                };
                physics.isGrounded = false;
            }
        } else {
            // Air movement
            physics.ticksSinceGrounded++;

            // Air control
            const airControl = MOVEMENT.AIR_CONTROL;
            const targetVelocity = Vec3.scale(moveDir, moveSpeed * airControl);

            const currentHorizontal: Vector3 = {
                x: physics.velocity.x,
                y: 0,
                z: physics.velocity.z,
            };

            const acceleration = MOVEMENT.ACCELERATION * SIMULATION.TICK_DELTA * airControl;
            const newHorizontal = Vec3.add(
                currentHorizontal,
                Vec3.scale(targetVelocity, acceleration)
            );

            // Cap horizontal air speed
            const maxAirSpeed = moveSpeed * 1.2;
            const airSpeed = Vec3.length(newHorizontal);
            const cappedHorizontal = airSpeed > maxAirSpeed
                ? Vec3.scale(Vec3.normalize(newHorizontal), maxAirSpeed)
                : newHorizontal;

            physics.velocity = {
                x: cappedHorizontal.x,
                y: physics.velocity.y,
                z: cappedHorizontal.z,
            };

            // Apply gravity
            physics.velocity = {
                ...physics.velocity,
                y: Math.max(
                    physics.velocity.y + PHYSICS.GRAVITY * SIMULATION.TICK_DELTA,
                    PHYSICS.TERMINAL_VELOCITY
                ),
            };

            // Extended jump (Aeonids) - hold jump for slower fall
            if (traits.extendedJump && input.movement.jump && physics.velocity.y < 0) {
                physics.velocity = {
                    ...physics.velocity,
                    y: physics.velocity.y * 0.9, // Slow falling
                };
            }

            // Coyote time jump
            if (input.movement.jump && physics.ticksSinceGrounded <= MOVEMENT.COYOTE_TIME) {
                const jumpForce = 10 * (traits.extendedJump ? 1.3 : 1.0);
                physics.velocity = {
                    ...physics.velocity,
                    y: jumpForce,
                };
            }

            // Wall climb (Vexis)
            if (traits.wallClimb && physics.isTouchingWall && input.movement.jump) {
                physics.isClimbing = true;
            }
        }

        // Wall climbing logic (Vexis)
        if (physics.isClimbing && traits.wallClimb) {
            if (!physics.isTouchingWall || input.movement.crouch) {
                physics.isClimbing = false;
            } else {
                // Climb up/down
                const climbDir = input.movement.forward ? 1 : input.movement.backward ? -1 : 0;
                physics.velocity = {
                    x: physics.velocity.x * 0.9,
                    y: MOVEMENT.CLIMB_SPEED * climbDir,
                    z: physics.velocity.z * 0.9,
                };

                // Wall jump
                if (input.movement.jump) {
                    const wallJumpDir = Vec3.scale(physics.wallNormal, 8);
                    physics.velocity = {
                        x: wallJumpDir.x,
                        y: 8,
                        z: wallJumpDir.z,
                    };
                    physics.isClimbing = false;
                }
            }
        }

        // Apply velocity to position
        const movement = Vec3.scale(physics.velocity, SIMULATION.TICK_DELTA);
        transform.position = Vec3.add(transform.position, movement);

        // Update rotation to face aim direction
        transform.rotation = Quat.fromEuler(0, input.aim.yaw, 0);
    }
}

/**
 * Calculate movement direction from input and aim.
 */
function calculateMoveDirection(
    yaw: number,
    movement: {
        forward: boolean;
        backward: boolean;
        left: boolean;
        right: boolean;
    }
): Vector3 {
    // Calculate forward and right vectors based on yaw
    const forward: Vector3 = {
        x: -Math.sin(yaw),
        y: 0,
        z: -Math.cos(yaw),
    };

    const right: Vector3 = {
        x: Math.cos(yaw),
        y: 0,
        z: -Math.sin(yaw),
    };

    // Accumulate direction from input
    let direction: Vector3 = Vec3.zero();

    if (movement.forward) {
        direction = Vec3.add(direction, forward);
    }
    if (movement.backward) {
        direction = Vec3.sub(direction, forward);
    }
    if (movement.right) {
        direction = Vec3.add(direction, right);
    }
    if (movement.left) {
        direction = Vec3.sub(direction, right);
    }

    // Normalize to prevent diagonal speed boost
    const length = Vec3.length(direction);
    if (length > 0.001) {
        return Vec3.normalize(direction);
    }

    return Vec3.zero();
}

// =============================================================================
// EXPORTS
// =============================================================================

export { calculateMoveDirection };
