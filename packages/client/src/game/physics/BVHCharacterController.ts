/**
 * BVH Character Controller
 * 
 * Position-based character controller using three-mesh-bvh for collision detection.
 * Based on: https://github.com/gkjohnson/three-mesh-bvh/blob/master/example/characterMovement.js
 */

import * as THREE from 'three';
import { MeshBVH, ExtendedTriangle } from 'three-mesh-bvh';

// =============================================================================
// TYPES
// =============================================================================

export interface BVHControllerConfig {
    // Capsule dimensions
    capsuleRadius: number;
    capsuleHeight: number; // Total height including caps

    // Movement
    walkSpeed: number;
    sprintSpeed: number;
    slideSpeed: number;

    // Jump & Gravity
    jumpVelocity: number;
    gravity: number;

    // Physics
    physicsSteps: number; // Sub-steps per frame for stability

    // Slide
    slideDuration: number; // How long slide lasts
    slideCooldown: number; // Time before can slide again
    slideHeightReduction: number; // How much to shrink capsule during slide

    // Aiming
    aimSpeed: number;
}

export const DEFAULT_BVH_CONFIG: BVHControllerConfig = {
    capsuleRadius: 0.35,
    capsuleHeight: 1.8,
    walkSpeed: 3.0, // Reduced from 6.0
    sprintSpeed: 6.0, // Reduced from 12.0
    slideSpeed: 6.0, // Reduced from 12.0
    aimSpeed: 1.5, // Slow movement while aiming
    jumpVelocity: 15.0, // Increased for snappier jump
    gravity: -30.0, // Increased gravity for less floaty jump
    physicsSteps: 5,
    slideDuration: 0.5,
    slideCooldown: 1.0,
    slideHeightReduction: 0.6, // Capsule shrinks to 60% height during slide
};

export interface BVHControllerInput {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    jump: boolean;
    sprint: boolean;
    slide: boolean;
    aim: boolean;
}

// =============================================================================
// BVH CHARACTER CONTROLLER
// =============================================================================

export class BVHCharacterController {
    private config: BVHControllerConfig;
    private speedMultiplier = 1;

    // Collider mesh (environment with BVH)
    private collider: THREE.Mesh | null = null;

    // Player state
    private position = new THREE.Vector3();
    private velocity = new THREE.Vector3();
    isOnGround = false;

    // Capsule info (mutable for slide)
    private capsuleInfo: {
        radius: number;
        segment: THREE.Line3;
    };

    // Slide state
    private isSliding = false;
    private slideTimer = 0;
    private slideCooldownTimer = 0;

    // Visual rotation (model facing direction)
    modelEulerY = 0;

    // Temp vectors (reused to avoid GC)
    private tempVector = new THREE.Vector3();
    private tempVector2 = new THREE.Vector3();
    private tempVector3 = new THREE.Vector3();
    private tempVector4 = new THREE.Vector3();
    private tempBox = new THREE.Box3();
    private tempMat = new THREE.Matrix4();
    private tempSegment = new THREE.Line3();

    constructor(startPosition: THREE.Vector3, config: Partial<BVHControllerConfig> = {}) {
        this.config = { ...DEFAULT_BVH_CONFIG, ...config };
        this.position.copy(startPosition);

        // Initialize capsule segment
        // Segment goes from feet to head (capsule axis)
        this.capsuleInfo = {
            radius: this.config.capsuleRadius,
            segment: new THREE.Line3(
                new THREE.Vector3(0, this.config.capsuleRadius, 0), // Bottom sphere center
                new THREE.Vector3(0, this.config.capsuleHeight - this.config.capsuleRadius, 0) // Top sphere center
            )
        };
    }

    /**
     * Set the collider mesh (must have boundsTree attached).
     */
    setCollider(mesh: THREE.Mesh): void {
        if (!mesh.geometry.boundsTree) {
            console.warn('BVHCharacterController: Collider mesh does not have boundsTree. Generating...');
            mesh.geometry.boundsTree = new MeshBVH(mesh.geometry);
        }
        this.collider = mesh;
    }

    /**
     * Main update function. Call each frame.
     */
    update(dt: number, input: BVHControllerInput, cameraYaw: number): void {
        // Clamp delta to prevent physics explosions
        const delta = Math.min(dt, 0.1);

        // If collider isn't ready yet, fall back to simple kinematic movement.
        if (!this.collider) {
            this.simpleMove(delta, input, cameraYaw);
            return;
        }

        // Update slide cooldown
        if (this.slideCooldownTimer > 0) {
            this.slideCooldownTimer -= delta;
        }

        // Handle slide state
        this.updateSlide(delta, input);

        // Run physics in sub-steps for stability
        const subDelta = delta / this.config.physicsSteps;
        for (let i = 0; i < this.config.physicsSteps; i++) {
            this.physicsStep(subDelta, input, cameraYaw);
        }
    }

    setExternalSpeedMultiplier(multiplier: number): void {
        this.speedMultiplier = Math.max(0.1, Math.min(multiplier, 3));
    }

    /**
     * Simple movement fallback when collider isn't ready.
     */
    private simpleMove(delta: number, input: BVHControllerInput, cameraYaw: number): void {
        const speed = input.sprint ? this.config.sprintSpeed : this.config.walkSpeed;
        const aimSpeed = input.aim ? this.config.aimSpeed : 1;
        const moveSpeed = speed * aimSpeed * this.speedMultiplier;

        const forward = this.tempVector3.set(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
        const right = this.tempVector4.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));

        const move = this.tempVector;
        move.set(0, 0, 0);
        if (input.forward) move.add(forward);
        if (input.backward) move.sub(forward);
        if (input.right) move.add(right);
        if (input.left) move.sub(right);

        if (move.lengthSq() > 0) {
            move.normalize().multiplyScalar(moveSpeed * delta);
        }

        // Basic gravity/jump
        if (input.jump && this.isOnGround) {
            this.velocity.y = this.config.jumpVelocity;
            this.isOnGround = false;
        }
        this.velocity.y += this.config.gravity * delta;

        this.position.add(move);
        this.position.y += this.velocity.y * delta;

        // Ground plane at y=0 as fallback
        if (this.position.y <= 0) {
            this.position.y = 0;
            this.velocity.y = 0;
            this.isOnGround = true;
        }

    }

    private updateSlide(delta: number, input: BVHControllerInput): void {
        // Start slide
        if (input.slide && this.isOnGround && !this.isSliding && this.slideCooldownTimer <= 0) {
            this.isSliding = true;
            this.slideTimer = this.config.slideDuration;

            // Shrink capsule
            const newHeight = this.config.capsuleHeight * this.config.slideHeightReduction;
            this.capsuleInfo.segment.start.y = this.config.capsuleRadius;
            this.capsuleInfo.segment.end.y = newHeight - this.config.capsuleRadius;
        }

        // Update slide timer
        if (this.isSliding) {
            this.slideTimer -= delta;
            if (this.slideTimer <= 0) {
                this.endSlide();
            }
        }
    }

    private endSlide(): void {
        this.isSliding = false;
        this.slideCooldownTimer = this.config.slideCooldown;

        // Restore capsule height
        this.capsuleInfo.segment.start.y = this.config.capsuleRadius;
        this.capsuleInfo.segment.end.y = this.config.capsuleHeight - this.config.capsuleRadius;
    }

    private updateGroundedState(): void {
        if (!this.collider) return;

        // Reset temp objects
        this.tempBox.makeEmpty();
        this.tempMat.copy(this.collider.matrixWorld).invert();

        // Sphere cast downwards to detect ground
        // We use a slightly smaller radius for ground check to avoid catching walls
        const checkRadius = this.config.capsuleRadius * 0.9;
        const sphereCenter = this.tempVector.copy(this.position);
        sphereCenter.y += this.config.capsuleRadius; // Center of bottom sphere

        // Transform to local space
        sphereCenter.applyMatrix4(this.tempMat);

        // Create checking box
        this.tempBox.min.copy(sphereCenter).subScalar(checkRadius);
        this.tempBox.max.copy(sphereCenter).addScalar(checkRadius);
        // Extend box downwards for the check distance (small epsilon)
        const groundCheckDist = 0.05;
        this.tempBox.min.y -= groundCheckDist;

        let foundGround = false;

        this.collider.geometry.boundsTree!.shapecast({
            intersectsBounds: (box: THREE.Box3) => box.intersectsBox(this.tempBox),
            intersectsTriangle: (tri: ExtendedTriangle) => {
                // Check if triangle is below us
                // Simple verify: check if any vertex is within check distance
                // More complex: closest point

                // For ground check we really want to know if we are "standing" on something
                // So reliable closest point check is good

                // Create a temporary sphere for intersection test
                const triPoint = this.tempVector2;
                const center = sphereCenter;

                // Get closest point on triangle to our bottom sphere center
                tri.closestPointToPoint(center, triPoint);

                const distSq = center.distanceToSquared(triPoint);
                const checkDist = checkRadius + groundCheckDist;

                if (distSq < checkDist * checkDist) {
                    // Check normal to ensure it's "ground" (slope limit)
                    // Triangle normal is computed in shapecast usually but let's compute it
                    // tri.getNormal(this.tempVector3); 
                    // To be simple, we just assume if it's close enough below, it's ground

                    // Actually, let's just use the vertical separation
                    if (triPoint.y < center.y && center.y - triPoint.y <= checkDist) {
                        foundGround = true;
                        return true; // Stop
                    }
                }

                return false;
            }
        });

        this.isOnGround = foundGround;

        // If grounded, dont let velocity build up downwards
        if (this.isOnGround && this.velocity.y < 0) {
            this.velocity.y = 0;
        }
    }

    private physicsStep(delta: number, input: BVHControllerInput, cameraYaw: number): void {

        // 1. Apply Movement (Velocity X/Z)
        this.applyMovement(delta, input, cameraYaw);

        // 2. Apply Gravity (Velocity Y)
        this.velocity.y += this.config.gravity * delta;

        // 3. Apply Jump (Velocity Y)
        // Check for jump input before moving
        if (input.jump && this.isOnGround && !this.isSliding) {
            this.velocity.y = this.config.jumpVelocity;
            this.isOnGround = false; // Immediately unground
        }

        // 4. Integrate Position
        this.position.x += this.velocity.x * delta;
        this.position.y += this.velocity.y * delta;
        this.position.z += this.velocity.z * delta;

        // 5. Resolve Collisions (Updates Position & Velocity)
        this.resolveCollisions();

        // 6. Update Grounded State post-collision
        this.updateGroundedState();
    }

    private applyMovement(delta: number, input: BVHControllerInput, cameraYaw: number): void {
        // Calculate movement direction
        let inputX = 0;
        let inputZ = 0;

        if (input.forward) inputZ += 1;
        if (input.backward) inputZ -= 1;
        if (input.left) inputX -= 1;
        if (input.right) inputX += 1;

        // Determine speed
        let speed: number;
        if (this.isSliding) {
            speed = this.config.slideSpeed;
            // During slide, continue in model direction
        } else if (input.aim) {
            speed = this.config.aimSpeed;
        } else if (input.sprint) {
            speed = this.config.sprintSpeed;
        } else {
            speed = this.config.walkSpeed;
        }
        speed *= this.speedMultiplier;

        // Friction / Damping for horizontal velocity
        const damping = Math.exp(-10 * delta) - 1;
        this.velocity.x += this.velocity.x * damping;
        this.velocity.z += this.velocity.z * damping;

        // Apply input acceleration
        if (inputX !== 0 || inputZ !== 0) {
            const forward = this.tempVector3.set(Math.sin(cameraYaw), 0, Math.cos(cameraYaw));
            const right = this.tempVector4.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));

            const move = this.tempVector;
            move.set(0, 0, 0);
            move.addScaledVector(forward, inputZ);
            move.addScaledVector(right, inputX);
            move.normalize().multiplyScalar(speed);

            // Immediate velocity change for snappy movement (like Splatoon)
            this.velocity.x = move.x;
            this.velocity.z = move.z;
        } else if (!this.isSliding) {
            // Stop quickly if no input
            this.velocity.x = 0;
            this.velocity.z = 0;
        }
    }

    private resolveCollisions(): void {
        if (!this.collider) return;

        const capsuleInfo = this.capsuleInfo;

        // Reset temp objects
        this.tempBox.makeEmpty();
        this.tempMat.copy(this.collider.matrixWorld).invert();
        this.tempSegment.copy(capsuleInfo.segment);

        // Transform capsule segment to world space, then to collider local space
        // Start with player's world position
        this.tempSegment.start.add(this.position);
        this.tempSegment.end.add(this.position);

        // Transform to collider local space
        this.tempSegment.start.applyMatrix4(this.tempMat);
        this.tempSegment.end.applyMatrix4(this.tempMat);

        // Build AABB of capsule
        this.tempBox.expandByPoint(this.tempSegment.start);
        this.tempBox.expandByPoint(this.tempSegment.end);
        this.tempBox.min.addScalar(-capsuleInfo.radius);
        this.tempBox.max.addScalar(capsuleInfo.radius);

        // Shapecast against BVH
        this.collider.geometry.boundsTree!.shapecast({
            intersectsBounds: (box: THREE.Box3) => box.intersectsBox(this.tempBox),
            intersectsTriangle: (tri: ExtendedTriangle) => {
                // Check capsule-triangle intersection
                const triPoint = this.tempVector;
                const capsulePoint = this.tempVector2;

                const distance = tri.closestPointToSegment(this.tempSegment, triPoint, capsulePoint);
                if (distance < capsuleInfo.radius) {
                    // Push out of collision
                    const depth = capsuleInfo.radius - distance;
                    const direction = capsulePoint.sub(triPoint).normalize();

                    this.tempSegment.start.addScaledVector(direction, depth);
                    this.tempSegment.end.addScaledVector(direction, depth);
                }

                return false; // Continue checking other triangles
            }
        });

        // Transform capsule back to world space
        const newPosition = this.tempVector;
        newPosition.copy(this.tempSegment.start).applyMatrix4(this.collider.matrixWorld);

        // Calculate how much we moved
        const deltaVector = this.tempVector2;
        const playerCapsuleBase = this.tempVector3.copy(this.position).add(capsuleInfo.segment.start);
        deltaVector.subVectors(newPosition, playerCapsuleBase);

        // OLD ground detection was here - removed

        // Apply position correction
        const offset = Math.max(0.0, deltaVector.length() - 1e-5);
        deltaVector.normalize().multiplyScalar(offset);
        this.position.add(deltaVector);

        // Adjust velocity based on collision normal
        // If we hit a wall, kill velocity into it
        if (offset > 0.0001) {
            // deltaVector is roughly the normal * penetration
            const normal = this.tempVector4.copy(deltaVector).normalize();
            const dot = this.velocity.dot(normal);
            if (dot < 0) {
                this.velocity.sub(normal.multiplyScalar(dot));
            }
        }
    }

    // =============================================================================
    // PUBLIC GETTERS
    // =============================================================================

    getPosition(): THREE.Vector3 {
        return this.position.clone();
    }

    copyPosition(out: THREE.Vector3): THREE.Vector3 {
        return out.copy(this.position);
    }

    getVisualPosition(): THREE.Vector3 {
        return this.position.clone();
    }

    copyVisualPosition(out: THREE.Vector3): THREE.Vector3 {
        return out.copy(this.position);
    }

    getVelocity(): THREE.Vector3 {
        return this.velocity.clone();
    }

    copyVelocity(out: THREE.Vector3): THREE.Vector3 {
        return out.copy(this.velocity);
    }

    get isGrounded(): boolean {
        return this.isOnGround;
    }

    setVelocity(velocity: THREE.Vector3): void {
        this.velocity.copy(velocity);
    }

    get sliding(): boolean {
        return this.isSliding;
    }

    /**
     * Reset player to a position.
     */
    reset(position: THREE.Vector3): void {
        this.position.copy(position);
        this.velocity.set(0, 0, 0);
        this.isOnGround = false;
        this.isSliding = false;
        this.slideTimer = 0;
        this.slideCooldownTimer = 0;
    }

    /**
     * Apply a small positional correction (e.g., server reconciliation).
     * This does not modify velocity, keeping movement feel stable.
     */
    applyPositionOffset(offset: THREE.Vector3): void {
        this.position.add(offset);
    }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createBVHCharacterController(
    startPosition: THREE.Vector3,
    config?: Partial<BVHControllerConfig>
): BVHCharacterController {
    return new BVHCharacterController(startPosition, config);
}

// =============================================================================
// HELPER: Generate BVH for a mesh
// =============================================================================

export function generateBVHForMesh(mesh: THREE.Mesh): void {
    if (mesh.geometry) {
        mesh.geometry.boundsTree = new MeshBVH(mesh.geometry);
    }
}

/**
 * Generate a merged BVH collider from a scene/group.
 * This creates a single optimized mesh for collision detection.
 */
export function generateBVHColliderFromGroup(group: THREE.Object3D): THREE.Mesh | null {
    const geometries: THREE.BufferGeometry[] = [];

    group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (mesh.geometry) {
                const clonedGeom = mesh.geometry.clone();
                clonedGeom.applyMatrix4(mesh.matrixWorld);
                geometries.push(clonedGeom);
            }
        }
    });

    if (geometries.length === 0) return null;

    // Merge all geometries
    const mergedGeometry = geometries.length === 1
        ? geometries[0]
        : mergeBufferGeometries(geometries);

    if (!mergedGeometry) return null;

    // Generate BVH
    mergedGeometry.boundsTree = new MeshBVH(mergedGeometry);

    // Create invisible collider mesh
    const colliderMesh = new THREE.Mesh(
        mergedGeometry,
        new THREE.MeshBasicMaterial({ visible: false })
    );

    return colliderMesh;
}

// Simple geometry merge helper
function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
    if (geometries.length === 0) return null;
    if (geometries.length === 1) return geometries[0] || null;

    // Count total vertices
    let totalPositions = 0;

    for (const geom of geometries) {
        const pos = geom.getAttribute('position');
        if (pos) totalPositions += pos.count * 3;
    }

    const mergedPositions = new Float32Array(totalPositions);
    const mergedIndices: number[] = [];

    let positionOffset = 0;
    let vertexOffset = 0;

    for (const geom of geometries) {
        const pos = geom.getAttribute('position');
        if (!pos) continue;

        // Copy positions
        const posArray = pos.array as Float32Array;
        for (let i = 0; i < pos.count * 3; i++) {
            mergedPositions[positionOffset + i] = posArray[i] || 0;
        }

        // Copy indices (offset by vertex count)
        const idx = geom.getIndex();
        if (idx) {
            const idxArray = idx.array as Uint16Array | Uint32Array;
            for (let i = 0; i < idx.count; i++) {
                mergedIndices.push((idxArray[i] || 0) + vertexOffset);
            }
        } else {
            // Generate indices for non-indexed geometry
            for (let i = 0; i < pos.count; i++) {
                mergedIndices.push(i + vertexOffset);
            }
        }

        positionOffset += pos.count * 3;
        vertexOffset += pos.count;
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
    merged.setIndex(mergedIndices);

    return merged;
}

