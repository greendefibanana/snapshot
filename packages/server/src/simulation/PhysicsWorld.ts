/**
 * Physics World - Rapier.js Integration
 * 
 * Wrapper around Rapier physics for the game simulation.
 * Handles character controllers, collisions, and raycasts.
 */

import type RAPIER from '@dimforge/rapier3d-compat';
import type {
    World,
    EntityId,
    Vector3,
    Tick,
} from '@snapshot/shared';
import {
    getComponent,
    getEntitiesWith,
    hasComponent,
} from '@snapshot/shared';

// =============================================================================
// TYPES
// =============================================================================

export interface PhysicsWorldConfig {
    /** Gravity vector */
    gravity: Vector3;
}

export interface RaycastResult {
    /** Did the ray hit something */
    hit: boolean;
    /** Hit position in world space */
    position?: Vector3;
    /** Hit normal */
    normal?: Vector3;
    /** Distance to hit */
    distance?: number;
    /** Entity that was hit (if any) */
    entityId?: EntityId;
    /** Collider handle that was hit */
    colliderHandle?: number;
}

export interface CollisionGroups {
    /** Static environment */
    STATIC: number;
    /** Player characters */
    PLAYER: number;
    /** Enemy projectiles */
    ENEMY_PROJECTILE: number;
    /** Ally projectiles */
    ALLY_PROJECTILE: number;
    /** Triggers (non-solid) */
    TRIGGER: number;
}

// =============================================================================
// COLLISION GROUPS
// =============================================================================

export const COLLISION_GROUPS: CollisionGroups = {
    STATIC: 0x0001,
    PLAYER: 0x0002,
    ENEMY_PROJECTILE: 0x0004,
    ALLY_PROJECTILE: 0x0008,
    TRIGGER: 0x0010,
};

// =============================================================================
// PHYSICS WORLD CLASS
// =============================================================================

export class PhysicsWorld {
    private rapier: typeof RAPIER | null = null;
    private physicsWorld: RAPIER.World | null = null;
    private eventQueue: RAPIER.EventQueue | null = null;

    /** Map from collider handle to entity ID */
    private colliderToEntity: Map<number, EntityId> = new Map();

    /** Map from entity ID to rigid body handle */
    private entityToBody: Map<EntityId, number> = new Map();

    /** Map from entity ID to collider handle */
    private entityToCollider: Map<EntityId, number> = new Map();

    private config: PhysicsWorldConfig;
    private initialized = false;

    constructor(config: Partial<PhysicsWorldConfig> = {}) {
        this.config = {
            gravity: config.gravity ?? { x: 0, y: -20, z: 0 },
        };
    }

    /**
     * Initialize the physics world.
     * Must be called before any physics operations.
     */
    async init(): Promise<void> {
        if (this.initialized) {
            return;
        }

        // Dynamic import to handle WASM loading
        this.rapier = await import('@dimforge/rapier3d-compat');
        await this.rapier.init();

        this.physicsWorld = new this.rapier.World({
            x: this.config.gravity.x,
            y: this.config.gravity.y,
            z: this.config.gravity.z,
        });

        this.eventQueue = new this.rapier.EventQueue(true);
        this.initialized = true;

        console.log('PhysicsWorld: Initialized with Rapier', this.rapier.version());
    }

    /**
     * Check if physics is initialized.
     */
    get isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Step the physics simulation.
     */
    step(): void {
        if (!this.physicsWorld || !this.eventQueue) {
            return;
        }

        this.physicsWorld.step(this.eventQueue);

        // Process collision events
        this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
            const entity1 = this.colliderToEntity.get(handle1);
            const entity2 = this.colliderToEntity.get(handle2);

            // Extension point: emit collision events
            // this.onCollision?.(entity1, entity2, started);
        });

        this.eventQueue.drainContactForceEvents((event) => {
            // Extension point: handle contact forces
        });
    }

    /**
     * Create a character body (kinematic with collider).
     */
    createCharacterBody(
        entityId: EntityId,
        position: Vector3,
        radius: number,
        height: number,
        team: number
    ): { bodyHandle: number; colliderHandle: number } {
        if (!this.rapier || !this.physicsWorld) {
            throw new Error('Physics not initialized');
        }

        // Create kinematic rigid body
        const bodyDesc = this.rapier.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(position.x, position.y, position.z);

        const body = this.physicsWorld.createRigidBody(bodyDesc);

        // Create capsule collider
        const halfHeight = (height - radius * 2) / 2;
        const colliderDesc = this.rapier.ColliderDesc.capsule(halfHeight, radius)
            .setCollisionGroups(this.makeCollisionGroups(COLLISION_GROUPS.PLAYER))
            .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS);

        const collider = this.physicsWorld.createCollider(colliderDesc, body);

        // Store mappings
        const bodyHandle = body.handle;
        const colliderHandle = collider.handle;

        this.colliderToEntity.set(colliderHandle, entityId);
        this.entityToBody.set(entityId, bodyHandle);
        this.entityToCollider.set(entityId, colliderHandle);

        return { bodyHandle, colliderHandle };
    }

    /**
     * Create a projectile body (dynamic).
     */
    createProjectileBody(
        entityId: EntityId,
        position: Vector3,
        velocity: Vector3,
        radius: number,
        isAllyProjectile: boolean
    ): { bodyHandle: number; colliderHandle: number } {
        if (!this.rapier || !this.physicsWorld) {
            throw new Error('Physics not initialized');
        }

        // Create dynamic rigid body
        const bodyDesc = this.rapier.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y, position.z)
            .setLinvel(velocity.x, velocity.y, velocity.z)
            .setCcdEnabled(true); // Continuous collision detection for fast projectiles

        const body = this.physicsWorld.createRigidBody(bodyDesc);

        // Create sphere collider
        const group = isAllyProjectile
            ? COLLISION_GROUPS.ALLY_PROJECTILE
            : COLLISION_GROUPS.ENEMY_PROJECTILE;

        const colliderDesc = this.rapier.ColliderDesc.ball(radius)
            .setCollisionGroups(this.makeCollisionGroups(group))
            .setActiveEvents(this.rapier.ActiveEvents.COLLISION_EVENTS)
            .setDensity(0.1);

        const collider = this.physicsWorld.createCollider(colliderDesc, body);

        const bodyHandle = body.handle;
        const colliderHandle = collider.handle;

        this.colliderToEntity.set(colliderHandle, entityId);
        this.entityToBody.set(entityId, bodyHandle);
        this.entityToCollider.set(entityId, colliderHandle);

        return { bodyHandle, colliderHandle };
    }

    /**
     * Create a static collider (for environment).
     */
    createStaticCollider(
        entityId: EntityId,
        position: Vector3,
        halfExtents: Vector3
    ): number {
        if (!this.rapier || !this.physicsWorld) {
            throw new Error('Physics not initialized');
        }

        const colliderDesc = this.rapier.ColliderDesc.cuboid(
            halfExtents.x,
            halfExtents.y,
            halfExtents.z
        )
            .setTranslation(position.x, position.y, position.z)
            .setCollisionGroups(this.makeCollisionGroups(COLLISION_GROUPS.STATIC));

        const collider = this.physicsWorld.createCollider(colliderDesc);

        this.colliderToEntity.set(collider.handle, entityId);
        this.entityToCollider.set(entityId, collider.handle);

        return collider.handle;
    }

    /**
     * Remove a body/collider.
     */
    removeBody(entityId: EntityId): void {
        if (!this.physicsWorld) {
            return;
        }

        const bodyHandle = this.entityToBody.get(entityId);
        if (bodyHandle !== undefined) {
            const body = this.physicsWorld.getRigidBody(bodyHandle);
            if (body) {
                this.physicsWorld.removeRigidBody(body);
            }
            this.entityToBody.delete(entityId);
        }

        const colliderHandle = this.entityToCollider.get(entityId);
        if (colliderHandle !== undefined) {
            this.colliderToEntity.delete(colliderHandle);
            this.entityToCollider.delete(entityId);
        }
    }

    /**
     * Set the position of a kinematic body.
     */
    setKinematicPosition(entityId: EntityId, position: Vector3): void {
        if (!this.rapier || !this.physicsWorld) {
            return;
        }

        const bodyHandle = this.entityToBody.get(entityId);
        if (bodyHandle === undefined) {
            return;
        }

        const body = this.physicsWorld.getRigidBody(bodyHandle);
        if (body) {
            body.setNextKinematicTranslation({
                x: position.x,
                y: position.y,
                z: position.z,
            });
        }
    }

    /**
     * Get the position of a body.
     */
    getBodyPosition(entityId: EntityId): Vector3 | null {
        if (!this.physicsWorld) {
            return null;
        }

        const bodyHandle = this.entityToBody.get(entityId);
        if (bodyHandle === undefined) {
            return null;
        }

        const body = this.physicsWorld.getRigidBody(bodyHandle);
        if (!body) {
            return null;
        }

        const pos = body.translation();
        return { x: pos.x, y: pos.y, z: pos.z };
    }

    /**
     * Get the velocity of a dynamic body.
     */
    getBodyVelocity(entityId: EntityId): Vector3 | null {
        if (!this.physicsWorld) {
            return null;
        }

        const bodyHandle = this.entityToBody.get(entityId);
        if (bodyHandle === undefined) {
            return null;
        }

        const body = this.physicsWorld.getRigidBody(bodyHandle);
        if (!body) {
            return null;
        }

        const vel = body.linvel();
        return { x: vel.x, y: vel.y, z: vel.z };
    }

    /**
     * Cast a ray and return the first hit.
     */
    raycast(
        origin: Vector3,
        direction: Vector3,
        maxDistance: number,
        excludeEntity?: EntityId
    ): RaycastResult {
        if (!this.rapier || !this.physicsWorld) {
            return { hit: false };
        }

        const ray = new this.rapier.Ray(
            { x: origin.x, y: origin.y, z: origin.z },
            { x: direction.x, y: direction.y, z: direction.z }
        );

        const excludeCollider = excludeEntity !== undefined
            ? this.entityToCollider.get(excludeEntity)
            : undefined;

        const hit = this.physicsWorld.castRayAndGetNormal(
            ray,
            maxDistance,
            true,
            undefined,
            undefined,
            excludeCollider !== undefined
                ? this.physicsWorld.getCollider(excludeCollider) ?? undefined
                : undefined
        );

        if (!hit) {
            return { hit: false };
        }

        const hitPoint = ray.pointAt(hit.toi);
        const normal = hit.normal;
        const entityId = this.colliderToEntity.get(hit.collider.handle) as EntityId | undefined;

        const result: RaycastResult = {
            hit: true,
            position: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
            normal: { x: normal.x, y: normal.y, z: normal.z },
            distance: hit.toi,
            colliderHandle: hit.collider.handle,
        };

        if (entityId !== undefined) {
            result.entityId = entityId;
        }

        return result;
    }

    /**
     * Check if a point is grounded (raycast down).
     */
    checkGrounded(
        position: Vector3,
        characterHeight: number,
        entityId: EntityId
    ): { grounded: boolean; normal: Vector3; position?: Vector3; distance?: number } {
        const origin = {
            x: position.x,
            y: position.y + 0.1, // Slight offset up
            z: position.z,
        };

        const result = this.raycast(
            origin,
            { x: 0, y: -1, z: 0 },
            characterHeight * 0.6 + 0.2, // Check slightly further down
            entityId
        );

        if (result.hit && result.normal) {
            const ret: { grounded: boolean; normal: Vector3; position?: Vector3; distance?: number } = {
                grounded: true,
                normal: result.normal,
            };
            if (result.position) ret.position = result.position;
            if (result.distance !== undefined) ret.distance = result.distance;
            return ret;
        }

        return {
            grounded: false,
            normal: { x: 0, y: 1, z: 0 },
        };
    }

    /**
     * Sync positions from physics to game world.
     */
    syncToWorld(gameWorld: World): void {
        if (!this.physicsWorld) {
            return;
        }

        for (const [entityId, physics] of getEntitiesWith(gameWorld, 'physics')) {
            const body = this.physicsWorld.getRigidBody(physics.bodyHandle);
            if (!body) continue;

            // Update velocity from physics
            const vel = body.linvel();
            physics.velocity = { x: vel.x, y: vel.y, z: vel.z };

            // Update transform from physics
            const transform = getComponent(gameWorld, entityId, 'transform');
            if (transform) {
                const pos = body.translation();
                const rot = body.rotation();

                transform.position = { x: pos.x, y: pos.y, z: pos.z };
                transform.rotation = { x: rot.x, y: rot.y, z: rot.z, w: rot.w };
            }
        }
    }

    /**
     * Sync positions from physics to game world (alias for clarity at callsites).
     */
    syncTransforms(gameWorld: World): void {
        this.syncToWorld(gameWorld);
    }

    /**
     * Create collision group/mask from a single group.
     */
    private makeCollisionGroups(group: number): number {
        // Format: upper 16 bits = membership, lower 16 bits = filter
        // This entity is in 'group', and collides with everything except its own group
        const membership = group;
        const filter = ~group & 0xFFFF; // Collide with everything except own group
        return (membership << 16) | filter;
    }

    /**
     * Cleanup and destroy the physics world.
     */
    destroy(): void {
        if (this.eventQueue) {
            this.eventQueue.free();
            this.eventQueue = null;
        }

        if (this.physicsWorld) {
            this.physicsWorld.free();
            this.physicsWorld = null;
        }

        this.colliderToEntity.clear();
        this.entityToBody.clear();
        this.entityToCollider.clear();
        this.initialized = false;
    }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new physics world instance.
 */
export function createPhysicsWorld(config?: Partial<PhysicsWorldConfig>): PhysicsWorld {
    return new PhysicsWorld(config);
}
