/**
 * Shooter Third-Person Camera Controller
 *
 * Mouse controls yaw/pitch (pointer lock), camera follows player from behind.
 */

import * as THREE from 'three';
import type { Vector3 } from '@snapshot/shared';

export interface ShooterCameraConfig {
    distance?: number;
    verticalOffset?: number;
    shoulderOffset?: number;
    minPitchDeg?: number;
    maxPitchDeg?: number;
    positionSmooth?: number;
}

const DEFAULT_CONFIG: Required<ShooterCameraConfig> = {
    distance: 8,
    verticalOffset: 2.2,
    shoulderOffset: 0.6,
    minPitchDeg: -35,
    maxPitchDeg: 55,
    positionSmooth: 0.15,
};

export class ShooterCameraController {
    private config: Required<ShooterCameraConfig>;
    private camera: THREE.PerspectiveCamera;
    private position = new THREE.Vector3();
    private target = new THREE.Vector3();

    constructor(camera: THREE.PerspectiveCamera, config: ShooterCameraConfig = {}) {
        this.camera = camera;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.position.copy(camera.position);
    }

    update(yaw: number, pitch: number, targetPosition: Vector3, dt: number): void {
        const minPitch = THREE.MathUtils.degToRad(this.config.minPitchDeg);
        const maxPitch = THREE.MathUtils.degToRad(this.config.maxPitchDeg);
        const clampedPitch = Math.max(minPitch, Math.min(maxPitch, pitch));

        const cosPitch = Math.cos(clampedPitch);
        const dir = new THREE.Vector3(
            Math.sin(yaw) * cosPitch,
            Math.sin(clampedPitch),
            Math.cos(yaw) * cosPitch
        );

        const shoulderX = Math.cos(yaw) * this.config.shoulderOffset;
        const shoulderZ = -Math.sin(yaw) * this.config.shoulderOffset;

        // Place camera behind the aim direction.
        const desired = new THREE.Vector3(
            targetPosition.x - dir.x * this.config.distance + shoulderX,
            targetPosition.y - dir.y * this.config.distance + this.config.verticalOffset,
            targetPosition.z - dir.z * this.config.distance + shoulderZ
        );

        // Smooth follow
        const lerpFactor = 1 - Math.exp(-dt / Math.max(0.001, this.config.positionSmooth));
        this.position.lerp(desired, lerpFactor);
        this.camera.position.copy(this.position);

        this.target.set(
            targetPosition.x,
            targetPosition.y + this.config.verticalOffset,
            targetPosition.z
        );
        this.camera.lookAt(this.target);
    }
}

export function createShooterCameraController(
    camera: THREE.PerspectiveCamera,
    config?: ShooterCameraConfig
): ShooterCameraController {
    return new ShooterCameraController(camera, config);
}
