/**
 * Character Collider Setup for Rapier.js
 * 
 * Creates and configures capsule colliders and character controllers
 * for the movement system.
 */

import type { Vector3 } from '../types/index.js';
import type { MovementConfig } from './MovementConfig.js';
import { DEFAULT_MOVEMENT_CONFIG } from './MovementConfig.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Character collider configuration.
 */
export interface CharacterColliderConfig {
    height: number;
    radius: number;
    stepHeight: number;
    maxSlopeAngle: number;
    groundSnapDistance: number;
    skinWidth: number;
}

/**
 * Result of a physics tick.
 */
export interface PhysicsTickResult {
    position: Vector3;
    isGrounded: boolean;
    groundNormal: Vector3;
    groundMaterial: number;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

export function createCharacterColliderConfig(
    movementConfig: MovementConfig = DEFAULT_MOVEMENT_CONFIG
): CharacterColliderConfig {
    return {
        height: movementConfig.characterHeight,
        radius: movementConfig.characterRadius,
        stepHeight: movementConfig.stepHeight,
        maxSlopeAngle: movementConfig.maxSlopeAngle,
        groundSnapDistance: movementConfig.groundSnapDistance,
        skinWidth: 0.02,
    };
}

// =============================================================================
// RAPIER.JS INTEGRATION
// =============================================================================

// NOTE: These functions require Rapier.js to be imported by the caller.
// We use type assertions to avoid making Rapier a hard dependency.

/**
 * Create a Rapier CharacterController with our settings.
 * 
 * Usage:
 * ```typescript
 * import RAPIER from '@dimforge/rapier3d-compat';
 * const controller = createRapierCharacterController(world, config);
 * ```
 */
export function createRapierCharacterController(
    world: unknown, // RAPIER.World
    config: CharacterColliderConfig
): unknown { // RAPIER.KinematicCharacterController
    const rapierWorld = world as {
        createCharacterController(offset: number): {
            enableSnapToGround(distance: number): void;
            enableAutostep(maxHeight: number, minWidth: number, includeDynamic: boolean): void;
            setMaxSlopeClimbAngle(angle: number): void;
            setMinSlopeSlideAngle(angle: number): void;
        };
    };

    const controller = rapierWorld.createCharacterController(config.skinWidth);

    // Enable snapping to ground when on slopes
    controller.enableSnapToGround(config.groundSnapDistance);

    // Auto-step over small obstacles
    controller.enableAutostep(
        config.stepHeight,
        config.stepHeight * 0.5,
        true // Include dynamic bodies
    );

    // Configure slope handling
    const slopeRadians = config.maxSlopeAngle * (Math.PI / 180);
    controller.setMaxSlopeClimbAngle(slopeRadians);
    controller.setMinSlopeSlideAngle(slopeRadians);

    return controller;
}

/**
 * Create a capsule collider for a character.
 * 
 * Usage:
 * ```typescript
 * import RAPIER from '@dimforge/rapier3d-compat';
 * const { rigidBody, collider } = createRapierCharacterCollider(world, position, config);
 * ```
 */
export function createRapierCharacterCollider(
    world: unknown, // RAPIER.World
    position: Vector3,
    config: CharacterColliderConfig,
    collisionGroups: number = 0x0001_0002
): { rigidBody: unknown; collider: unknown } {
    const RAPIER = (globalThis as { RAPIER?: unknown }).RAPIER as {
        RigidBodyDesc: {
            kinematicPositionBased(): {
                setTranslation(x: number, y: number, z: number): unknown;
            };
        };
        ColliderDesc: {
            capsule(halfHeight: number, radius: number): {
                setCollisionGroups(groups: number): unknown;
            };
        };
    };

    if (!RAPIER) {
        throw new Error('Rapier.js must be loaded before creating character colliders');
    }

    const rapierWorld = world as {
        createRigidBody(desc: unknown): unknown;
        createCollider(desc: unknown, parent: unknown): unknown;
    };

    // Capsule half-height (excluding spherical caps)
    const halfHeight = (config.height - 2 * config.radius) / 2;

    // Create kinematic rigid body
    const rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(position.x, position.y + config.height / 2, position.z);

    const rigidBody = rapierWorld.createRigidBody(rigidBodyDesc);

    // Create capsule collider
    const colliderDesc = RAPIER.ColliderDesc.capsule(halfHeight, config.radius)
        .setCollisionGroups(collisionGroups);

    const collider = rapierWorld.createCollider(colliderDesc, rigidBody);

    return { rigidBody, collider };
}

/**
 * Compute character movement for a single physics tick.
 * 
 * Usage:
 * ```typescript
 * const result = computeCharacterMovement(controller, collider, velocity, dt);
 * ```
 */
export function computeCharacterMovement(
    controller: unknown, // RAPIER.KinematicCharacterController
    collider: unknown,   // RAPIER.Collider
    velocity: Vector3,
    dt: number
): PhysicsTickResult {
    const rapierController = controller as {
        computeColliderMovement(
            collider: unknown,
            movement: { x: number; y: number; z: number },
            filterFlags?: number,
            filterGroups?: number | null
        ): void;
        computedMovement(): { x: number; y: number; z: number };
        computedGrounded(): boolean;
    };

    const rapierCollider = collider as {
        parent(): {
            translation(): { x: number; y: number; z: number };
            setNextKinematicTranslation(pos: { x: number; y: number; z: number }): void;
        } | null;
    };

    // Compute desired movement
    const movement = {
        x: velocity.x * dt,
        y: velocity.y * dt,
        z: velocity.z * dt,
    };

    // Let Rapier compute the actual movement after collision
    rapierController.computeColliderMovement(
        collider,
        movement,
        undefined, // Use default filter flags
        null       // No filter groups
    );

    // Get the corrected movement
    const corrected = rapierController.computedMovement();
    const rigidBody = rapierCollider.parent();

    if (!rigidBody) {
        throw new Error('Collider has no parent rigid body');
    }

    const currentPos = rigidBody.translation();
    const newPos = {
        x: currentPos.x + corrected.x,
        y: currentPos.y + corrected.y,
        z: currentPos.z + corrected.z,
    };

    // Apply the movement
    rigidBody.setNextKinematicTranslation(newPos);

    // Check if grounded
    const isGrounded = rapierController.computedGrounded();

    return {
        position: newPos,
        isGrounded,
        groundNormal: { x: 0, y: 1, z: 0 }, // TODO: Extract from collision contacts
        groundMaterial: 0, // TODO: Extract from collision userData
    };
}

// =============================================================================
// SIMPLE PHYSICS (No Rapier - for testing/prediction)
// =============================================================================

/**
 * Simple ground collision without Rapier.
 * Used for client-side prediction when Rapier isn't available.
 */
export function simpleGroundCollision(
    position: Vector3,
    velocity: Vector3,
    groundY: number = 0
): { isGrounded: boolean; correctedY: number } {
    if (position.y <= groundY && velocity.y <= 0) {
        return {
            isGrounded: true,
            correctedY: groundY,
        };
    }

    return {
        isGrounded: false,
        correctedY: position.y,
    };
}
