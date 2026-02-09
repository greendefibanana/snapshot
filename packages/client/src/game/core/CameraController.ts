/**
 * Camera Controller
 * 
 * Third-person camera with orbit control, soft collision,
 * dynamic FOV, and motion sickness prevention.
 */

import * as THREE from 'three';
import type { Vector3 } from '@snapshot/shared';
import {
    type CameraConfig,
    DEFAULT_CAMERA_CONFIG,
    DEG_TO_RAD,
} from './CameraConfig.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CameraState {
    // Current rotation (radians)
    yaw: number;
    pitch: number;

    // Current position (after smoothing)
    position: THREE.Vector3;

    // Velocity for smooth damp
    positionVelocity: THREE.Vector3;

    // Current distance (after collision)
    currentDistance: number;
    distanceVelocity: number;

    // FOV state
    currentFov: number;
    dodgeFovBoost: number;

    // Lookahead
    lookahead: THREE.Vector3;
    lookaheadVelocity: THREE.Vector3;
}

export interface CameraControllerConfig {
    config?: Partial<CameraConfig>;
    threeCamera?: THREE.PerspectiveCamera;
    collisionWorld?: CameraCollisionWorld;
}

/**
 * Interface for collision world (abstracted for Rapier/custom)
 */
export interface CameraCollisionWorld {
    castRay(
        origin: Vector3,
        direction: Vector3,
        maxDistance: number
    ): { distance: number; point: Vector3 } | null;
}

// =============================================================================
// CAMERA CONTROLLER CLASS
// =============================================================================

export class CameraController {
    private config: CameraConfig;
    private state: CameraState;
    private threeCamera: THREE.PerspectiveCamera | null;
    private collisionWorld: CameraCollisionWorld | null;

    // Reusable vectors to avoid allocation
    private tempTarget = new THREE.Vector3();

    constructor(options: CameraControllerConfig = {}) {
        this.config = { ...DEFAULT_CAMERA_CONFIG, ...options.config };
        this.threeCamera = options.threeCamera ?? null;
        this.collisionWorld = options.collisionWorld ?? null;

        this.state = {
            yaw: 0,
            pitch: 0,
            position: new THREE.Vector3(0, 5, 10),
            positionVelocity: new THREE.Vector3(),
            currentDistance: this.config.baseDistance,
            distanceVelocity: 0,
            currentFov: this.config.baseFov,
            dodgeFovBoost: 0,
            lookahead: new THREE.Vector3(),
            lookaheadVelocity: new THREE.Vector3(),
        };
    }

    // =========================================================================
    // GETTERS
    // =========================================================================

    get yaw(): number {
        return this.state.yaw;
    }

    get pitch(): number {
        return this.state.pitch;
    }

    get fov(): number {
        return this.state.currentFov + this.state.dodgeFovBoost;
    }

    get position(): THREE.Vector3 {
        return this.state.position;
    }

    // =========================================================================
    // ROTATION UPDATE
    // =========================================================================

    /**
     * Update camera rotation from input.
     * Called immediately after input sampling.
     */
    updateRotation(yaw: number, pitch: number): void {
        this.state.yaw = yaw;

        // Clamp pitch to prevent flipping
        const minPitch = this.config.minPitch * DEG_TO_RAD;
        const maxPitch = this.config.maxPitch * DEG_TO_RAD;
        this.state.pitch = Math.max(minPitch, Math.min(maxPitch, pitch));
    }

    // =========================================================================
    // POSITION UPDATE
    // =========================================================================

    /**
     * Update camera position based on target.
     * Called after physics simulation.
     */
    updatePosition(
        targetPosition: Vector3,
        velocity: Vector3 | null,
        dt: number
    ): void {
        const { yaw, pitch } = this.state;
        const config = this.config;

        // Calculate desired camera position (orbit around target)
        const desiredDistance = config.baseDistance;

        // Spherical to Cartesian direction (from target to camera)
        const cosPitch = Math.cos(pitch);
        const direction = {
            x: Math.sin(yaw) * cosPitch,
            y: Math.sin(pitch),
            z: Math.cos(yaw) * cosPitch,
        };

        // Shoulder offset (perpendicular to view direction)
        const handSign = config.handedness === 'right' ? 1 : -1;
        const shoulderX = Math.cos(yaw) * config.horizontalOffset * handSign;
        const shoulderZ = -Math.sin(yaw) * config.horizontalOffset * handSign;

        // Collision check and distance smoothing (handled in resolveCollision)
        // Pass max distance if no collision, or let resolveCollision handle it.
        // We pass desiredDistance as the max distance to check.
        this.state.currentDistance = this.resolveCollision(
            targetPosition,
            direction,
            desiredDistance
        );

        // Recalculate position with smoothed distance
        const smoothDist = this.state.currentDistance;
        const smoothOffsetX = Math.sin(yaw) * cosPitch * smoothDist;
        const smoothOffsetY = Math.sin(pitch) * smoothDist + config.verticalOffset;
        const smoothOffsetZ = Math.cos(yaw) * cosPitch * smoothDist;

        const smoothTarget = new THREE.Vector3(
            targetPosition.x + smoothOffsetX + shoulderX,
            targetPosition.y + smoothOffsetY,
            targetPosition.z + smoothOffsetZ + shoulderZ
        );

        // Position smoothing
        this.state.position.x = this.smoothDamp(
            this.state.position.x,
            smoothTarget.x,
            { value: this.state.positionVelocity.x },
            config.positionSmoothTime,
            dt
        );
        this.state.position.y = this.smoothDamp(
            this.state.position.y,
            smoothTarget.y,
            { value: this.state.positionVelocity.y },
            config.positionSmoothTime,
            dt
        );
        this.state.position.z = this.smoothDamp(
            this.state.position.z,
            smoothTarget.z,
            { value: this.state.positionVelocity.z },
            config.positionSmoothTime,
            dt
        );

        // Update lookahead based on velocity
        if (velocity) {
            const speed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2);
            const maxSpeed = 12; // Assume max sprint speed
            const lookaheadAmount = Math.min(speed / maxSpeed, 1) * config.lookaheadDistance;

            if (speed > 0.1) {
                const dirX = velocity.x / speed;
                const dirZ = velocity.z / speed;

                this.state.lookahead.x = this.smoothDamp(
                    this.state.lookahead.x,
                    dirX * lookaheadAmount,
                    { value: this.state.lookaheadVelocity.x },
                    config.lookaheadSmoothTime,
                    dt
                );
                this.state.lookahead.z = this.smoothDamp(
                    this.state.lookahead.z,
                    dirZ * lookaheadAmount,
                    { value: this.state.lookaheadVelocity.z },
                    config.lookaheadSmoothTime,
                    dt
                );
            }
        }
    }

    // =========================================================================
    // COLLISION
    // =========================================================================

    // =========================================================================
    // COLLISION
    // =========================================================================

    /**
     * Resolve collision using hh-hang/three-player-controller logic:
     * Raycast from target TO camera, and lerp current distance to the safe distance.
     */
    private resolveCollision(
        target: Vector3,
        direction: Vector3, // Normalized direction from target to camera
        maxDist: number
    ): number {
        const config = this.config;

        // Target distance defaults to max/base distance
        let targetDistance = maxDist;

        if (this.collisionWorld) {
            // Origin at target (plus height offset)
            // Note: The origin should be consistent with where the camera looks at
            const origin: Vector3 = {
                x: target.x,
                y: target.y + config.shoulderHeight,
                z: target.z,
            };

            // Cast ray from player towards camera
            const hit = this.collisionWorld.castRay(origin, direction, maxDist);

            if (hit) {
                // If hit, constrain distance
                // _camEpsilon = 0.35 in reference, we use collisionMargin
                targetDistance = Math.max(config.minDistance, hit.distance - config.collisionMargin);
            }
            // Else keep targetDistance as maxDist
        }

        // Lerp current distance towards target distance (hh-hang style)
        // _camCollisionLerp = 0.18
        // We use a framed-independent lerp approximation or fixed factor if dt is small
        const lerpFactor = 0.18; // From reference

        // Use standard lerp for distance
        const newDistance = this.state.currentDistance + (targetDistance - this.state.currentDistance) * lerpFactor;

        return newDistance;
    }

    // =========================================================================
    // FOV UPDATE
    // =========================================================================

    /**
     * Update FOV based on movement state.
     */
    updateFov(
        isSprinting: boolean,
        isDodging: boolean,
        isAiming: boolean,
        dt: number
    ): void {
        const config = this.config;

        // Calculate target FOV
        let targetFov = config.baseFov;

        if (isAiming) {
            targetFov -= config.aimFovReduction;
        } else if (isSprinting) {
            targetFov += config.sprintFovBoost;
        }

        // Smooth FOV transitions
        this.state.currentFov = this.lerp(
            this.state.currentFov,
            targetFov,
            config.fovSmoothSpeed * dt
        );

        // Dodge FOV spike
        if (isDodging && this.state.dodgeFovBoost < config.dodgeFovPeak) {
            // Instant spike
            this.state.dodgeFovBoost = config.dodgeFovPeak;
        } else {
            // Decay
            this.state.dodgeFovBoost = this.lerp(
                this.state.dodgeFovBoost,
                0,
                config.fovSmoothSpeed * 2 * dt
            );
        }
    }

    // =========================================================================
    // CAMERA-RELATIVE MOVEMENT
    // =========================================================================

    /**
     * Get movement direction relative to camera yaw.
     * Used by movement system for camera-relative controls.
     */
    getCameraRelativeDirection(
        forward: boolean,
        backward: boolean,
        left: boolean,
        right: boolean
    ): { x: number; z: number } {
        const yaw = this.state.yaw;

        // Camera's forward direction (horizontal only)
        const camForward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
        const camRight = { x: Math.cos(yaw), z: -Math.sin(yaw) };

        let moveX = 0;
        let moveZ = 0;

        if (forward) {
            moveX += camForward.x;
            moveZ += camForward.z;
        }
        if (backward) {
            moveX -= camForward.x;
            moveZ -= camForward.z;
        }
        if (right) {
            moveX += camRight.x;
            moveZ += camRight.z;
        }
        if (left) {
            moveX -= camRight.x;
            moveZ -= camRight.z;
        }

        // Normalize
        const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (len > 0.001) {
            return { x: moveX / len, z: moveZ / len };
        }

        return { x: 0, z: 0 };
    }

    // =========================================================================
    // APPLY TO THREE.JS
    // =========================================================================

    /**
     * Apply camera state to Three.js camera.
     * Call this after all updates, before rendering.
     */
    applyToCamera(target?: Vector3): void {
        if (!this.threeCamera) return;

        const config = this.config;

        // Set position
        this.threeCamera.position.copy(this.state.position);

        // Calculate look-at target
        const lookY = (target?.y ?? 0) + config.shoulderHeight;
        this.tempTarget.set(
            (target?.x ?? 0) + this.state.lookahead.x,
            lookY,
            (target?.z ?? 0) + this.state.lookahead.z
        );

        this.threeCamera.lookAt(this.tempTarget);

        // Update FOV
        const finalFov = this.state.currentFov + this.state.dodgeFovBoost;
        if (Math.abs(this.threeCamera.fov - finalFov) > 0.01) {
            this.threeCamera.fov = finalFov;
            this.threeCamera.updateProjectionMatrix();
        }
    }

    /**
     * Set the Three.js camera reference.
     */
    setCamera(camera: THREE.PerspectiveCamera): void {
        this.threeCamera = camera;
    }

    /**
     * Set the collision world reference.
     */
    setCollisionWorld(world: CameraCollisionWorld): void {
        this.collisionWorld = world;
    }

    // =========================================================================
    // UTILITIES
    // =========================================================================

    private lerp(a: number, b: number, t: number): number {
        return a + (b - a) * Math.min(1, t);
    }

    /**
     * SmoothDamp - critically damped spring for smooth motion.
     */
    private smoothDamp(
        current: number,
        target: number,
        velocity: { value: number },
        smoothTime: number,
        dt: number
    ): number {
        // Prevent division by zero
        const safeSmooth = Math.max(0.0001, smoothTime);
        const omega = 2 / safeSmooth;
        const x = omega * dt;
        const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);

        const delta = current - target;
        const temp = (velocity.value + omega * delta) * dt;

        velocity.value = (velocity.value - omega * temp) * exp;

        const result = target + (delta + temp) * exp;

        // Prevent overshoot
        if ((target - current > 0) === (result > target)) {
            velocity.value = 0;
            return target;
        }

        return result;
    }

    /**
     * Reset camera to default state.
     */
    reset(targetPosition?: Vector3): void {
        this.state.yaw = 0;
        this.state.pitch = 0;
        this.state.currentDistance = this.config.baseDistance;
        this.state.distanceVelocity = 0;
        this.state.currentFov = this.config.baseFov;
        this.state.dodgeFovBoost = 0;
        this.state.positionVelocity.set(0, 0, 0);
        this.state.lookahead.set(0, 0, 0);
        this.state.lookaheadVelocity.set(0, 0, 0);

        if (targetPosition) {
            this.state.position.set(
                targetPosition.x,
                targetPosition.y + this.config.verticalOffset + this.config.baseDistance,
                targetPosition.z + this.config.baseDistance
            );
        }
    }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createCameraController(
    options?: CameraControllerConfig
): CameraController {
    return new CameraController(options);
}
