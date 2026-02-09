/**
 * Map Loader
 * 
 * Loads map data and creates Three.js geometry and physics colliders.
 */

import * as THREE from 'three';
import type {
    MapData,
    MapGeometry,
    MapCollider,
    SpawnZone,
    ObjectiveZone,
    CollisionLayer,
} from '@snapshot/shared';
// TODO: Add MapValidator when needed
// import { validateMap, type ValidationResult } from './MapValidator';

// =============================================================================
// TYPES
// =============================================================================

export interface LoadedMap {
    /** Original map data */
    data: MapData;

    /** Three.js scene group */
    scene: THREE.Group;

    /** Physics colliders */
    colliders: RuntimeCollider[];

    /** Spawn points */
    spawnPoints: RuntimeSpawnPoint[];

    /** Objectives */
    objectives: RuntimeObjective[];
}

export interface RuntimeCollider {
    id: string;
    type: string;
    position: THREE.Vector3;
    size: THREE.Vector3;
    layer: CollisionLayer;
    mask: number;
    isTrigger: boolean;
}

export interface RuntimeSpawnPoint {
    id: string;
    position: THREE.Vector3;
    teamId: number | null;
    spawnType: string;
    radius: number;
    safetyRadius: number;
    direction: THREE.Vector3 | undefined;
}

export interface RuntimeObjective {
    id: string;
    type: string;
    position: THREE.Vector3;
    bounds: THREE.Box3;
    captureTime: number;
    displayName: string;
}

// =============================================================================
// MAP LOADER
// =============================================================================

export class MapLoader {
    private loadedMaps: Map<string, LoadedMap> = new Map();
    private textureLoader: THREE.TextureLoader;

    constructor() {
        this.textureLoader = new THREE.TextureLoader();
    }

    /**
     * Load a map from data.
     */
    async load(data: MapData): Promise<LoadedMap> {
        // Validate first (TODO: re-enable when MapValidator is implemented)
        // const validation = validateMap(data);
        // if (!validation.valid) {
        //     throw new Error(`Invalid map: ${validation.errors.map(e => e.code).join(', ')}`);
        // }

        // Create scene group
        const scene = new THREE.Group();
        scene.name = `map_${data.id}`;

        // Load geometry
        for (const geo of data.geometry) {
            const mesh = await this.createGeometry(geo, data);
            if (mesh) {
                scene.add(mesh);
            }
        }

        // Create colliders
        const colliders = data.colliders.map(c => this.createCollider(c));

        // Create spawn points
        const spawnPoints = data.spawnZones.map(s => this.createSpawnPoint(s));

        // Create objectives
        const objectives = data.objectiveZones.map(o => this.createObjective(o));

        // Apply lighting
        if (data.lighting) {
            this.applyLighting(scene, data.lighting);
        }

        const loaded: LoadedMap = {
            data,
            scene,
            colliders,
            spawnPoints,
            objectives,
        };

        this.loadedMaps.set(data.id, loaded);
        return loaded;
    }

    /**
     * Load map from JSON file.
     */
    async loadFromUrl(url: string): Promise<LoadedMap> {
        const response = await fetch(url);
        const data = await response.json() as MapData;
        return this.load(data);
    }

    /**
     * Unload a map.
     */
    unload(mapId: string): void {
        const loaded = this.loadedMaps.get(mapId);
        if (loaded) {
            // Dispose geometry and materials
            loaded.scene.traverse((obj) => {
                if (obj instanceof THREE.Mesh) {
                    obj.geometry.dispose();
                    if (obj.material instanceof THREE.Material) {
                        obj.material.dispose();
                    }
                }
            });
            this.loadedMaps.delete(mapId);
        }
    }

    /**
     * Get a loaded map.
     */
    getMap(mapId: string): LoadedMap | undefined {
        return this.loadedMaps.get(mapId);
    }

    // =========================================================================
    // GEOMETRY CREATION
    // =========================================================================

    private async createGeometry(geo: MapGeometry, map: MapData): Promise<THREE.Object3D | null> {
        let geometry: THREE.BufferGeometry;

        switch (geo.type) {
            case 'box':
                geometry = new THREE.BoxGeometry(1, 1, 1);
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
                break;
            case 'sphere':
                geometry = new THREE.SphereGeometry(0.5, 32, 16);
                break;
            case 'plane':
                geometry = new THREE.PlaneGeometry(1, 1);
                break;
            case 'mesh':
                // TODO: Load external mesh
                geometry = new THREE.BoxGeometry(1, 1, 1);
                break;
            default:
                return null;
        }

        const material = this.createMaterial(geo.material, map);
        const mesh = new THREE.Mesh(geometry, material);

        mesh.name = geo.id;
        mesh.position.set(geo.position.x, geo.position.y, geo.position.z);
        mesh.quaternion.set(geo.rotation.x, geo.rotation.y, geo.rotation.z, geo.rotation.w);
        mesh.scale.set(geo.scale.x, geo.scale.y, geo.scale.z);
        mesh.castShadow = geo.castShadow;
        mesh.receiveShadow = geo.receiveShadow;

        // Rotate plane to be horizontal
        if (geo.type === 'plane') {
            mesh.rotation.x = -Math.PI / 2;
        }

        return mesh;
    }

    private createMaterial(ref: MapGeometry['material'], map: MapData): THREE.Material {
        switch (ref.type) {
            case 'color':
                return new THREE.MeshStandardMaterial({
                    color: ref.value,
                    opacity: ref.opacity ?? 1,
                    transparent: (ref.opacity ?? 1) < 1,
                });

            case 'texture':
                const texture = this.textureLoader.load(ref.value);
                return new THREE.MeshStandardMaterial({ map: texture });

            case 'asset':
                const matAsset = map.assets.materials[ref.value];
                if (matAsset) {
                    const mat = new THREE.MeshStandardMaterial({
                        color: matAsset.color,
                        roughness: matAsset.roughness ?? 0.5,
                        metalness: matAsset.metalness ?? 0,
                    });
                    if (matAsset.emissive) {
                        mat.emissive = new THREE.Color(matAsset.emissive);
                    }
                    if (matAsset.textureId) {
                        const textureAsset = map.assets.textures[matAsset.textureId];
                        if (textureAsset) {
                            mat.map = this.textureLoader.load(textureAsset.path);
                        }
                    }
                    return mat;
                }
                return new THREE.MeshStandardMaterial({ color: '#888888' });

            default:
                return new THREE.MeshStandardMaterial({ color: '#888888' });
        }
    }

    // =========================================================================
    // COLLIDERS
    // =========================================================================

    private createCollider(col: MapCollider): RuntimeCollider {
        return {
            id: col.id,
            type: col.type,
            position: new THREE.Vector3(col.position.x, col.position.y, col.position.z),
            size: new THREE.Vector3(col.size.x, col.size.y, col.size.z),
            layer: col.layer,
            mask: col.mask,
            isTrigger: col.isTrigger,
        };
    }

    // =========================================================================
    // SPAWN POINTS
    // =========================================================================

    private createSpawnPoint(zone: SpawnZone): RuntimeSpawnPoint {
        return {
            id: zone.id,
            position: new THREE.Vector3(zone.position.x, zone.position.y, zone.position.z),
            teamId: zone.teamId,
            spawnType: zone.spawnType,
            radius: zone.radius,
            safetyRadius: zone.safetyRadius,
            direction: zone.spawnDirection
                ? new THREE.Vector3(zone.spawnDirection.x, zone.spawnDirection.y, zone.spawnDirection.z)
                : undefined,
        };
    }

    // =========================================================================
    // OBJECTIVES
    // =========================================================================

    private createObjective(obj: ObjectiveZone): RuntimeObjective {
        const halfW = obj.bounds.width / 2;
        const halfH = obj.bounds.height / 2;
        const halfD = obj.bounds.depth / 2;

        return {
            id: obj.id,
            type: obj.type,
            position: new THREE.Vector3(obj.position.x, obj.position.y, obj.position.z),
            bounds: new THREE.Box3(
                new THREE.Vector3(obj.position.x - halfW, obj.position.y - halfH, obj.position.z - halfD),
                new THREE.Vector3(obj.position.x + halfW, obj.position.y + halfH, obj.position.z + halfD)
            ),
            captureTime: obj.captureTime,
            displayName: obj.displayName,
        };
    }

    // =========================================================================
    // LIGHTING
    // =========================================================================

    private applyLighting(scene: THREE.Group, lighting: MapData['lighting']): void {
        if (!lighting) return;

        // Ambient light
        const ambient = new THREE.AmbientLight(lighting.ambientColor, lighting.ambientIntensity);
        scene.add(ambient);

        // Directional lights
        for (const lightDef of lighting.directionalLights) {
            const light = new THREE.DirectionalLight(lightDef.color, lightDef.intensity);
            light.position.set(-lightDef.direction.x, -lightDef.direction.y, -lightDef.direction.z);
            light.castShadow = lightDef.castShadow;
            scene.add(light);
        }
    }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createMapLoader(): MapLoader {
    return new MapLoader();
}
