/**
 * Reconciler - State reconciliation engine
 * 
 * Compares predicted state against authoritative server state
 * and handles corrections when mismatches exceed thresholds.
 */

import {
    type EntityState,
    type Vec3,
    type Quat,
} from '@snapshot/shared/simulation';

import type { PredictedEntity } from './PredictionLoop.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ReconciliationConfig {
    /** Position mismatch threshold before correction (units) */
    positionThreshold: number;

    /** Velocity mismatch threshold (units/s) */
    velocityThreshold: number;

    /** Rotation mismatch threshold (radians) */
    rotationThreshold: number;

    /** Enable smooth correction instead of snap */
    smoothCorrection: boolean;

    /** Correction blend factor per tick (0-1) */
    correctionBlendRate: number;

    /** Maximum correction distance for smooth blend */
    maxSmoothDistance: number;
}

export const DEFAULT_RECONCILIATION_CONFIG: ReconciliationConfig = {
    positionThreshold: 0.1, // 10cm
    velocityThreshold: 1.0, // 1 unit/s
    rotationThreshold: 0.1, // ~6 degrees
    smoothCorrection: true,
    correctionBlendRate: 0.3,
    maxSmoothDistance: 2.0, // 2 meters - beyond this, snap
};

export interface ReconciliationResult {
    /** Was a correction needed? */
    correctionNeeded: boolean;

    /** Position error magnitude */
    positionError: number;

    /** Velocity error magnitude */
    velocityError: number;

    /** Rotation error magnitude */
    rotationError: number;

    /** Was this a hard snap or smooth correction? */
    wasHardSnap: boolean;
}

export interface CorrectionState {
    /** Is a correction in progress? */
    active: boolean;

    /** Target position to blend towards */
    targetPosition: Vec3;

    /** Target rotation to blend towards */
    targetRotation: Quat;

    /** Remaining blend time (ticks) */
    remainingBlendTicks: number;

    /** Original position when correction started */
    startPosition: Vec3;

    /** Original rotation when correction started */
    startRotation: Quat;

    /** Total blend duration (ticks) */
    totalBlendTicks: number;
}

// =============================================================================
// RECONCILER
// =============================================================================

export class Reconciler {
    private config: ReconciliationConfig;
    private correction: CorrectionState;

    constructor(config: Partial<ReconciliationConfig> = {}) {
        this.config = { ...DEFAULT_RECONCILIATION_CONFIG, ...config };

        this.correction = {
            active: false,
            targetPosition: { x: 0, y: 0, z: 0 },
            targetRotation: { x: 0, y: 0, z: 0, w: 1 },
            remainingBlendTicks: 0,
            startPosition: { x: 0, y: 0, z: 0 },
            startRotation: { x: 0, y: 0, z: 0, w: 1 },
            totalBlendTicks: 0,
        };
    }

    /**
     * Compare predicted state against server state and return result.
     */
    compare(
        predicted: PredictedEntity,
        serverState: EntityState
    ): ReconciliationResult {
        const serverPos = serverState.transform?.position ?? { x: 0, y: 0, z: 0 };
        const serverVel = serverState.physics?.velocity ?? { x: 0, y: 0, z: 0 };
        const serverRot = serverState.transform?.rotation ?? { x: 0, y: 0, z: 0, w: 1 };

        const positionError = vec3Distance(predicted.position, serverPos);
        const velocityError = vec3Distance(predicted.velocity, serverVel);
        const rotationError = quatAngleDiff(predicted.rotation, serverRot);

        const correctionNeeded =
            positionError > this.config.positionThreshold ||
            velocityError > this.config.velocityThreshold ||
            rotationError > this.config.rotationThreshold;

        const wasHardSnap = positionError > this.config.maxSmoothDistance;

        return {
            correctionNeeded,
            positionError,
            velocityError,
            rotationError,
            wasHardSnap,
        };
    }

    /**
     * Apply correction to predicted state.
     * Returns the corrected position/rotation for rendering.
     */
    applyCorrection(
        predicted: PredictedEntity,
        serverState: EntityState,
        result: ReconciliationResult
    ): { position: Vec3; rotation: Quat } {
        if (!result.correctionNeeded) {
            return {
                position: predicted.position,
                rotation: predicted.rotation,
            };
        }

        const serverPos = serverState.transform?.position ?? predicted.position;
        const serverRot = serverState.transform?.rotation ?? predicted.rotation;

        if (result.wasHardSnap || !this.config.smoothCorrection) {
            // Hard snap - immediately use server position
            predicted.position = { ...serverPos };
            predicted.velocity = { ...serverState.physics?.velocity ?? predicted.velocity };
            predicted.rotation = { ...serverRot };

            this.correction.active = false;

            return {
                position: serverPos,
                rotation: serverRot,
            };
        }

        // Smooth correction - start blending
        this.startSmoothCorrection(predicted.position, predicted.rotation, serverPos, serverRot);

        // Update physics state immediately (for future prediction)
        predicted.velocity = { ...serverState.physics?.velocity ?? predicted.velocity };

        return this.getSmoothCorrectedState(predicted.position, predicted.rotation);
    }

    /**
     * Start a smooth correction.
     */
    private startSmoothCorrection(
        currentPos: Vec3,
        currentRot: Quat,
        targetPos: Vec3,
        targetRot: Quat
    ): void {
        // Calculate blend duration based on error
        const distance = vec3Distance(currentPos, targetPos);
        const blendTicks = Math.ceil(distance / 0.2); // ~200ms per meter

        this.correction = {
            active: true,
            targetPosition: { ...targetPos },
            targetRotation: { ...targetRot },
            remainingBlendTicks: blendTicks,
            startPosition: { ...currentPos },
            startRotation: { ...currentRot },
            totalBlendTicks: blendTicks,
        };
    }

    /**
     * Get smoothly corrected position/rotation for rendering.
     */
    private getSmoothCorrectedState(
        predictedPos: Vec3,
        predictedRot: Quat
    ): { position: Vec3; rotation: Quat } {
        if (!this.correction.active) {
            return { position: predictedPos, rotation: predictedRot };
        }

        // Calculate blend progress
        const t = 1 - (this.correction.remainingBlendTicks / this.correction.totalBlendTicks);
        const smoothT = smoothstep(t);

        // Blend position
        const position = vec3Lerp(
            this.correction.startPosition,
            this.correction.targetPosition,
            smoothT
        );

        // Blend rotation
        const rotation = quatSlerp(
            this.correction.startRotation,
            this.correction.targetRotation,
            smoothT
        );

        return { position, rotation };
    }

    /**
     * Update correction state each tick.
     * Call this every frame/tick to advance smooth correction.
     */
    tick(): void {
        if (!this.correction.active) return;

        this.correction.remainingBlendTicks--;

        if (this.correction.remainingBlendTicks <= 0) {
            this.correction.active = false;
        }
    }

    /**
     * Check if a correction is in progress.
     */
    get isCorrecting(): boolean {
        return this.correction.active;
    }

    /**
     * Get correction progress (0-1).
     */
    get correctionProgress(): number {
        if (!this.correction.active) return 1;
        return 1 - (this.correction.remainingBlendTicks / this.correction.totalBlendTicks);
    }

    /**
     * Cancel any ongoing correction.
     */
    cancelCorrection(): void {
        this.correction.active = false;
    }
}

// =============================================================================
// MATH HELPERS
// =============================================================================

function vec3Distance(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function vec3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
    };
}

function quatAngleDiff(a: Quat, b: Quat): number {
    // Compute dot product
    const dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    // Angle = 2 * acos(|dot|)
    return 2 * Math.acos(Math.min(1, Math.abs(dot)));
}

function quatSlerp(a: Quat, b: Quat, t: number): Quat {
    // Simple linear interpolation for small angles
    // For production, use proper slerp
    let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

    // If negative dot, negate one quaternion to take shorter path
    let bx = b.x, by = b.y, bz = b.z, bw = b.w;
    if (dot < 0) {
        dot = -dot;
        bx = -bx;
        by = -by;
        bz = -bz;
        bw = -bw;
    }

    // Linear interpolation for close quaternions
    if (dot > 0.9995) {
        return normalizeQuat({
            x: a.x + (bx - a.x) * t,
            y: a.y + (by - a.y) * t,
            z: a.z + (bz - a.z) * t,
            w: a.w + (bw - a.w) * t,
        });
    }

    // Actual slerp
    const theta = Math.acos(dot);
    const sinTheta = Math.sin(theta);
    const wa = Math.sin((1 - t) * theta) / sinTheta;
    const wb = Math.sin(t * theta) / sinTheta;

    return {
        x: a.x * wa + bx * wb,
        y: a.y * wa + by * wb,
        z: a.z * wa + bz * wb,
        w: a.w * wa + bw * wb,
    };
}

function normalizeQuat(q: Quat): Quat {
    const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    if (len < 0.0001) return { x: 0, y: 0, z: 0, w: 1 };
    return {
        x: q.x / len,
        y: q.y / len,
        z: q.z / len,
        w: q.w / len,
    };
}

function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
}

// =============================================================================
// FACTORY
// =============================================================================

export function createReconciler(config?: Partial<ReconciliationConfig>): Reconciler {
    return new Reconciler(config);
}
