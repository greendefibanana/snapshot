/**
 * Map Data Types
 * 
 * Type definitions for arena shooter map format.
 * Supports placeholder geometry, collision layers,
 * spawn zones, and art-swappable assets.
 */

import type { Vector3, Quaternion, TeamId } from './index.js';

// =============================================================================
// MAP DATA
// =============================================================================

export interface MapData {
    /** Unique map identifier */
    id: string;

    /** Display name */
    name: string;

    /** Format version for compatibility */
    version: number;

    /** Map author */
    author: string;

    /** World bounds */
    bounds: MapBounds;

    /** Visual geometry */
    geometry: MapGeometry[];

    /** Collision shapes */
    colliders: MapCollider[];

    /** Player spawn zones */
    spawnZones: SpawnZone[];

    /** Objective zones */
    objectiveZones: ObjectiveZone[];

    /** Swappable art assets */
    assets: AssetManifest;

    /** Optional lighting preset */
    lighting?: LightingPreset;
}

export interface MapBounds {
    min: Vector3;
    max: Vector3;
}

// =============================================================================
// GEOMETRY
// =============================================================================

export interface MapGeometry {
    /** Unique ID for this geometry */
    id: string;

    /** Primitive type or mesh reference */
    type: 'box' | 'cylinder' | 'sphere' | 'plane' | 'mesh';

    /** World position */
    position: Vector3;

    /** Rotation (quaternion) */
    rotation: Quaternion;

    /** Scale */
    scale: Vector3;

    /** Material reference */
    material: MaterialRef;

    /** External mesh asset (for type='mesh') */
    meshAsset?: string;

    /** Cast shadows */
    castShadow: boolean;

    /** Receive shadows */
    receiveShadow: boolean;

    /** Optional tags for filtering */
    tags?: string[];
}

export interface MaterialRef {
    /** Material type */
    type: 'color' | 'texture' | 'asset';

    /** Hex color, texture path, or asset ID */
    value: string;

    /** Optional opacity (0-1) */
    opacity?: number;
}

// =============================================================================
// COLLISION
// =============================================================================

export enum CollisionLayer {
    Default = 0,
    Ground = 1 << 0,
    Wall = 1 << 1,
    Ceiling = 1 << 2,
    Platform = 1 << 3,
    Cover = 1 << 4,
    Trigger = 1 << 5,
    Projectile = 1 << 6,
    Player = 1 << 7,
}

export interface MapCollider {
    /** Unique ID */
    id: string;

    /** Shape type */
    type: 'box' | 'sphere' | 'capsule' | 'mesh';

    /** World position */
    position: Vector3;

    /** Rotation */
    rotation: Quaternion;

    /** Size (interpretation depends on type) */
    size: Vector3;

    /** Collision layer this belongs to */
    layer: CollisionLayer;

    /** Layers this collides with (bitmask) */
    mask: number;

    /** Is trigger (no physical response) */
    isTrigger: boolean;

    /** Optional mesh asset for complex collision */
    meshAsset?: string;
}

// =============================================================================
// SPAWN ZONES
// =============================================================================

export type SpawnType = 'initial' | 'respawn' | 'both';

export interface SpawnZone {
    /** Unique ID */
    id: string;

    /** Center position */
    position: Vector3;

    /** Spawn radius */
    radius: number;

    /** Team ID (null = neutral) */
    teamId: TeamId | null;

    /** When this spawn is used */
    spawnType: SpawnType;

    /** Max concurrent spawns */
    maxPlayers: number;

    /** Cooldown between spawns (seconds) */
    cooldown: number;

    /** Safety radius (no enemies) */
    safetyRadius: number;

    /** Spawn direction (facing) */
    spawnDirection?: Vector3;
}

// =============================================================================
// OBJECTIVE ZONES
// =============================================================================

export type ObjectiveType = 'capture' | 'payload' | 'extract' | 'koth' | 'ctf';

export interface ObjectiveZone {
    /** Unique ID */
    id: string;

    /** Objective type */
    type: ObjectiveType;

    /** Center position */
    position: Vector3;

    /** Zone bounds */
    bounds: { width: number; height: number; depth: number };

    /** Time to capture (seconds) */
    captureTime: number;

    /** Time before reset when contested */
    contestTime: number;

    /** Display name */
    displayName: string;

    /** Icon asset ID */
    iconId: string;

    /** Zone color (hex) */
    color: string;

    /** Capture order (for sequential modes) */
    order?: number;

    /** Required to win */
    required: boolean;
}

// =============================================================================
// ASSETS
// =============================================================================

export interface AssetManifest {
    /** Texture assets */
    textures: Record<string, TextureAsset>;

    /** Mesh assets */
    meshes: Record<string, MeshAsset>;

    /** Material presets */
    materials: Record<string, MaterialAsset>;

    /** Skybox */
    skybox?: SkyboxAsset;
}

export interface TextureAsset {
    /** Path to texture file */
    path: string;

    /** Fallback color if not loaded */
    fallback?: string;

    /** Repeat UV */
    repeat?: { x: number; y: number };
}

export interface MeshAsset {
    /** Path to mesh file */
    path: string;

    /** File format */
    format: 'gltf' | 'glb' | 'fbx' | 'obj';

    /** Scale override */
    scale?: number;
}

export interface MaterialAsset {
    /** Base color */
    color: string;

    /** Texture ID (from textures map) */
    textureId?: string;

    /** Roughness (0-1) */
    roughness?: number;

    /** Metalness (0-1) */
    metalness?: number;

    /** Emissive color */
    emissive?: string;
}

export interface SkyboxAsset {
    /** Type of skybox */
    type: 'color' | 'cubemap' | 'hdri';

    /** Value (color hex, or path) */
    value: string;

    /** Paths for cubemap faces */
    faces?: {
        px: string; nx: string;
        py: string; ny: string;
        pz: string; nz: string;
    };
}

// =============================================================================
// LIGHTING
// =============================================================================

export interface LightingPreset {
    /** Ambient light color */
    ambientColor: string;

    /** Ambient intensity */
    ambientIntensity: number;

    /** Directional lights */
    directionalLights: DirectionalLightDef[];

    /** Fog settings */
    fog?: FogDef;
}

export interface DirectionalLightDef {
    color: string;
    intensity: number;
    direction: Vector3;
    castShadow: boolean;
}

export interface FogDef {
    type: 'linear' | 'exp' | 'exp2';
    color: string;
    near?: number;
    far?: number;
    density?: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const MAP_FORMAT_VERSION = 1;

export const DEFAULT_SPAWN_ZONE: Partial<SpawnZone> = {
    radius: 5,
    spawnType: 'both',
    maxPlayers: 4,
    cooldown: 0,
    safetyRadius: 10,
};

export const DEFAULT_OBJECTIVE: Partial<ObjectiveZone> = {
    captureTime: 30,
    contestTime: 5,
    required: true,
};
