/**
 * Camera Configuration
 * 
 * All tunable parameters for the third-person camera system.
 * Centralized for easy balancing and preset switching.
 */

// =============================================================================
// TYPES
// =============================================================================

export type Handedness = 'left' | 'right';

export interface CameraConfig {
    // === DISTANCE ===
    readonly baseDistance: number;
    readonly minDistance: number;
    readonly maxDistance: number;

    // === VERTICAL ===
    readonly verticalOffset: number;
    readonly shoulderHeight: number;

    // === SHOULDER OFFSET ===
    readonly horizontalOffset: number;
    readonly handedness: Handedness;

    // === PITCH LIMITS (degrees) ===
    readonly minPitch: number;
    readonly maxPitch: number;

    // === SMOOTHING ===
    readonly positionSmoothTime: number;
    readonly rotationSmoothFactor: number;
    readonly zoomInSpeed: number;
    readonly zoomOutSpeed: number;

    // === FOV (degrees) ===
    readonly baseFov: number;
    readonly sprintFovBoost: number;
    readonly dodgeFovPeak: number;
    readonly aimFovReduction: number;
    readonly fovSmoothSpeed: number;

    // === COLLISION ===
    readonly collisionMargin: number;
    readonly collisionEnabled: boolean;

    // === LOOKAHEAD ===
    readonly lookaheadDistance: number;
    readonly lookaheadSmoothTime: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
    // Distance
    baseDistance: 4.5, // Splatoon-style close range
    minDistance: 2.0,
    maxDistance: 9.0,

    // Vertical
    verticalOffset: 1.5,
    shoulderHeight: 1.6,

    // Shoulder offset
    horizontalOffset: 0.5,
    handedness: 'right',

    // Pitch limits
    minPitch: -85,
    maxPitch: 75,

    // Smoothing
    positionSmoothTime: 0.05,
    rotationSmoothFactor: 0.15,
    zoomInSpeed: 10.0,
    zoomOutSpeed: 3.0,

    // FOV
    baseFov: 75,
    sprintFovBoost: 8,
    dodgeFovPeak: 15,
    aimFovReduction: 10,
    fovSmoothSpeed: 8.0,

    // Collision
    collisionMargin: 0.3,
    collisionEnabled: true,

    // Lookahead
    lookaheadDistance: 2.0,
    lookaheadSmoothTime: 0.1,
};

// =============================================================================
// SPECTATOR PRESET
// =============================================================================

export const SPECTATOR_CAMERA_CONFIG: CameraConfig = {
    ...DEFAULT_CAMERA_CONFIG,
    baseDistance: 10.0,
    horizontalOffset: 0,       // Centered for spectators
    baseFov: 70,
    sprintFovBoost: 0,         // No FOV effects for spectators
    dodgeFovPeak: 0,
};

// =============================================================================
// FACTORY
// =============================================================================

export function createCameraConfig(overrides?: Partial<CameraConfig>): CameraConfig {
    if (!overrides) return DEFAULT_CAMERA_CONFIG;
    return { ...DEFAULT_CAMERA_CONFIG, ...overrides };
}

// =============================================================================
// UTILITIES
// =============================================================================

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export function degreesToRadians(degrees: number): number {
    return degrees * DEG_TO_RAD;
}

export function radiansToDegrees(radians: number): number {
    return radians * RAD_TO_DEG;
}
