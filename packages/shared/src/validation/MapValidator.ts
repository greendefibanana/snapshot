/**
 * Map Validator
 * 
 * Validates map data for correctness and completeness.
 */

import type { MapData, MapGeometry, SpawnZone, ObjectiveZone, MapBounds } from '../types/map.js';
import { MAP_FORMAT_VERSION } from '../types/map.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ValidationError {
    code: ValidationErrorCode;
    message: string;
    id?: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
}

export type ValidationErrorCode =
    | 'VERSION_MISMATCH'
    | 'MISSING_ID'
    | 'MISSING_NAME'
    | 'INVALID_BOUNDS'
    | 'GEOMETRY_OUT_OF_BOUNDS'
    | 'INSUFFICIENT_SPAWNS'
    | 'MISSING_TEAM_SPAWN'
    | 'MISSING_OBJECTIVE'
    | 'COLLIDER_OVERLAP'
    | 'MISSING_ASSET'
    | 'INVALID_MATERIAL'
    | 'DUPLICATE_ID';

// =============================================================================
// VALIDATOR
// =============================================================================

export function validateMap(data: MapData): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const ids = new Set<string>();

    // Version check
    if (data.version !== MAP_FORMAT_VERSION) {
        warnings.push({
            code: 'VERSION_MISMATCH',
            message: `Map version ${data.version} differs from expected ${MAP_FORMAT_VERSION}`,
        });
    }

    // Required fields
    if (!data.id) {
        errors.push({ code: 'MISSING_ID', message: 'Map missing id' });
    }
    if (!data.name) {
        errors.push({ code: 'MISSING_NAME', message: 'Map missing name' });
    }

    // Bounds check
    if (!isValidBounds(data.bounds)) {
        errors.push({ code: 'INVALID_BOUNDS', message: 'Invalid map bounds' });
    }

    // Geometry validation
    for (const geo of data.geometry) {
        validateGeometry(geo, data, errors, warnings, ids);
    }

    // Collider validation
    for (const col of data.colliders) {
        if (ids.has(col.id)) {
            errors.push({ code: 'DUPLICATE_ID', message: `Duplicate ID: ${col.id}`, id: col.id });
        }
        ids.add(col.id);

        if (!isWithinBounds(col.position, data.bounds)) {
            warnings.push({
                code: 'GEOMETRY_OUT_OF_BOUNDS',
                message: `Collider ${col.id} outside bounds`,
                id: col.id,
            });
        }
    }

    // Spawn zone validation
    validateSpawnZones(data.spawnZones, errors, ids);

    // Objective validation
    validateObjectives(data.objectiveZones, errors, ids);

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

// =============================================================================
// HELPERS
// =============================================================================

function isValidBounds(bounds: MapBounds): boolean {
    return (
        bounds.min.x < bounds.max.x &&
        bounds.min.y < bounds.max.y &&
        bounds.min.z < bounds.max.z
    );
}

function isWithinBounds(pos: { x: number; y: number; z: number }, bounds: MapBounds): boolean {
    return (
        pos.x >= bounds.min.x && pos.x <= bounds.max.x &&
        pos.y >= bounds.min.y && pos.y <= bounds.max.y &&
        pos.z >= bounds.min.z && pos.z <= bounds.max.z
    );
}

function validateGeometry(
    geo: MapGeometry,
    map: MapData,
    errors: ValidationError[],
    warnings: ValidationError[],
    ids: Set<string>
): void {
    // Duplicate ID check
    if (ids.has(geo.id)) {
        errors.push({ code: 'DUPLICATE_ID', message: `Duplicate ID: ${geo.id}`, id: geo.id });
    }
    ids.add(geo.id);

    // Bounds check
    if (!isWithinBounds(geo.position, map.bounds)) {
        warnings.push({
            code: 'GEOMETRY_OUT_OF_BOUNDS',
            message: `Geometry ${geo.id} outside bounds`,
            id: geo.id,
        });
    }

    // Material asset reference check
    if (geo.material.type === 'asset') {
        if (!map.assets.materials[geo.material.value]) {
            errors.push({
                code: 'MISSING_ASSET',
                message: `Material asset ${geo.material.value} not found`,
                id: geo.id,
            });
        }
    }

    // Mesh asset reference check
    if (geo.type === 'mesh' && geo.meshAsset) {
        if (!map.assets.meshes[geo.meshAsset]) {
            errors.push({
                code: 'MISSING_ASSET',
                message: `Mesh asset ${geo.meshAsset} not found`,
                id: geo.id,
            });
        }
    }
}

function validateSpawnZones(zones: SpawnZone[], errors: ValidationError[], ids: Set<string>): void {
    // Minimum spawn count
    if (zones.length < 2) {
        errors.push({
            code: 'INSUFFICIENT_SPAWNS',
            message: 'Map must have at least 2 spawn zones',
        });
    }

    // Team spawn check
    const teamSpawns = new Map<number, SpawnZone[]>();

    for (const zone of zones) {
        // Duplicate ID
        if (ids.has(zone.id)) {
            errors.push({ code: 'DUPLICATE_ID', message: `Duplicate ID: ${zone.id}`, id: zone.id });
        }
        ids.add(zone.id);

        // Track team spawns
        if (zone.teamId !== null) {
            const existing = teamSpawns.get(zone.teamId) ?? [];
            existing.push(zone);
            teamSpawns.set(zone.teamId, existing);
        }
    }

    // Ensure both teams have spawns
    if (!teamSpawns.has(1)) {
        errors.push({
            code: 'MISSING_TEAM_SPAWN',
            message: 'No spawn zone for team 1',
        });
    }
    if (!teamSpawns.has(2)) {
        errors.push({
            code: 'MISSING_TEAM_SPAWN',
            message: 'No spawn zone for team 2',
        });
    }
}

function validateObjectives(zones: ObjectiveZone[], errors: ValidationError[], ids: Set<string>): void {
    // At least one objective for most modes
    if (zones.length === 0) {
        errors.push({
            code: 'MISSING_OBJECTIVE',
            message: 'Map must have at least 1 objective zone',
        });
    }

    for (const zone of zones) {
        if (ids.has(zone.id)) {
            errors.push({ code: 'DUPLICATE_ID', message: `Duplicate ID: ${zone.id}`, id: zone.id });
        }
        ids.add(zone.id);
    }
}
