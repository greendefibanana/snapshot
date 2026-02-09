/**
 * Orbit Camera Controller (camera-controls based)
 *
 * Adapted from usethiscamera/NotBlox camera system.
 * Provides a smooth third-person orbit camera that follows a target.
 */

import * as THREE from 'three';
import CameraControls from 'camera-controls';
import type { Vector3 } from '@snapshot/shared';

export interface OrbitCameraConfig {
    minDistance?: number;
    maxDistance?: number;
    minPolarDeg?: number;
    maxPolarDeg?: number;
    azimuthRotateSpeed?: number;
    polarRotateSpeed?: number;
    followLerp?: number;
    followOffset?: Vector3;
}

const DEFAULT_CONFIG: Required<OrbitCameraConfig> = {
    minDistance: 4,
    maxDistance: 30,
    minPolarDeg: 30,
    maxPolarDeg: 85,
    azimuthRotateSpeed: 0.3,
    polarRotateSpeed: 0.2,
    followLerp: 0.05,
    followOffset: { x: 0, y: 1, z: 0 },
};

export class OrbitCameraController {
    private controls: CameraControls;
    private config: Required<OrbitCameraConfig>;
    private offset = new THREE.Vector3();
    private tempTarget = new THREE.Vector3();

    constructor(
        camera: THREE.PerspectiveCamera,
        domElement: HTMLElement,
        config: OrbitCameraConfig = {}
    ) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.offset.set(
            this.config.followOffset.x,
            this.config.followOffset.y,
            this.config.followOffset.z
        );

        CameraControls.install({ THREE });
        this.controls = new CameraControls(camera, domElement);
        this.initializeControls();
    }

    private initializeControls(): void {
        this.controls.minDistance = this.config.minDistance;
        this.controls.maxDistance = this.config.maxDistance;
        this.controls.azimuthRotateSpeed = this.config.azimuthRotateSpeed;
        this.controls.polarRotateSpeed = this.config.polarRotateSpeed;
        this.controls.minPolarAngle = this.config.minPolarDeg * THREE.MathUtils.DEG2RAD;
        this.controls.maxPolarAngle = this.config.maxPolarDeg * THREE.MathUtils.DEG2RAD;
        this.controls.draggingSmoothTime = 1e-10;
        this.controls.dollyDragInverted = true;

        this.controls.mouseButtons.middle = CameraControls.ACTION.ZOOM;
        this.controls.mouseButtons.right = CameraControls.ACTION.ROTATE;
        this.controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY;
        this.controls.touches.three = CameraControls.ACTION.TOUCH_DOLLY;
    }

    update(dt: number, targetPosition: Vector3): void {
        this.controls.update(dt);

        this.tempTarget.set(
            targetPosition.x + this.offset.x,
            targetPosition.y + this.offset.y,
            targetPosition.z + this.offset.z
        );

        const currentTarget = new THREE.Vector3();
        this.controls.getTarget(currentTarget);
        currentTarget.lerp(this.tempTarget, this.config.followLerp);

        this.controls.moveTo(
            currentTarget.x,
            currentTarget.y,
            currentTarget.z,
            true
        );
    }

    getAzimuthAngle(): number {
        return this.controls.azimuthAngle;
    }
}

export function createOrbitCameraController(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    config?: OrbitCameraConfig
): OrbitCameraController {
    return new OrbitCameraController(camera, domElement, config);
}
