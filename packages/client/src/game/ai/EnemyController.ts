import * as YUKA from 'yuka';
import * as THREE from 'three';
import { BVHCharacterController, createBVHCharacterController, type BVHControllerConfig } from '../physics/BVHCharacterController';

/**
 * EnemyController
 * 
 * Bridges YUKA steering behaviors with the physics-based BVHCharacterController.
 * The physics controller is the source of truth for position.
 * YUKA calculates the desired velocity (steering).
 */
export class EnemyController extends YUKA.Vehicle {
    public physicsController: BVHCharacterController;
    private visualMesh: THREE.Object3D;

    constructor(
        startPosition: THREE.Vector3,
        visualMesh: THREE.Object3D,
        physicsConfig?: Partial<BVHControllerConfig>
    ) {
        super();

        this.visualMesh = visualMesh;

        // Create physics controller
        this.physicsController = createBVHCharacterController(startPosition, {
            walkSpeed: 4.0,
            sprintSpeed: 8.0,
            ...physicsConfig
        });

        // Sync initial position
        this.position.set(startPosition.x, startPosition.y, startPosition.z);

        // Setup YUKA vehicle properties
        this.maxSpeed = 6.0; // Should match physics max speed rougly
        this.mass = 1;

        // Initial visual sync
        this.syncVisuals();
    }

    setCollider(collider: THREE.Mesh) {
        this.physicsController.setCollider(collider);
    }

    /**
     * Update loop:
     * 1. YUKA updates internal velocity based on behaviors (called by EntityManager).
     * 2. We override this update to apply that velocity to physics.
     * 3. We sync back the real position from physics to YUKA.
     */
    update(delta: number): this {
        // Yuka's update() calls this.computeBehaviors() then updates position.
        // We want computeBehaviors() to run, but we want to control the integration.
        // So we call super.update(delta) to let behaviors run, 
        // BUT Yuka will modify this.position directly. 
        // We will overwrite this.position with the physics position afterwards.

        // 1. Calculate steering force & velocity using YUKA
        // slightly hacky: we let YUKA do its thing, but we care mostly about the velocity it produces
        super.update(delta);

        // 2. Apply YUKA's desired velocity to Physics Controller
        const desiredVelocity = this.velocity;

        // We use the new public setter
        // We want to preserve Vertical velocity (Gravity) from physics controller
        // but override horizontal velocity from AI
        const currentPhysicsVel = this.physicsController.getVelocity();
        this.physicsController.setVelocity(
            new THREE.Vector3(desiredVelocity.x, currentPhysicsVel.y, desiredVelocity.z)
        );

        // 3. Update Physics (Collision resolution, Gravity)
        // We pass empty input because we drove velocity manually
        this.physicsController.update(delta, {
            forward: false, backward: false, left: false, right: false,
            jump: false, sprint: false, slide: false, aim: false
        }, 0);

        // 4. Sync YUKA state with Physics state (Source of Truth)
        const newPos = this.physicsController.getPosition();
        this.position.set(newPos.x, newPos.y, newPos.z);

        // Sync visual mesh
        this.syncVisuals();

        return this;
    }

    private syncVisuals() {
        if (this.visualMesh) {
            // Convert YUKA Vector3 to THREE.Vector3
            this.visualMesh.position.set(this.position.x, this.position.y, this.position.z);

            // Rotation: Look at velocity direction if moving
            const velocity = this.velocity;
            if (velocity.squaredLength() > 0.1) {
                const targetRotation = Math.atan2(velocity.x, velocity.z);
                // Smooth rotation
                // Simple lerp for now, delta is passed in update but not here effortlessly
                // assuming 60fps roughly for visual smoothing factor
                const rot = this.visualMesh.rotation;

                // Shortest angle interpolation
                let diff = targetRotation - rot.y;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;

                rot.y += diff * 0.1;
            }
        }
    }
}
