import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import fs from 'node:fs';
import path from 'node:path';
import { Extension, NodeIO } from '@gltf-transform/core';
import { mat4 } from 'gl-matrix';

export type BVHBounds = { min: THREE.Vector3; max: THREE.Vector3 };

class KHRTextureTransformCompat extends Extension {
    public static readonly EXTENSION_NAME = 'KHR_texture_transform';
    public readonly extensionName = 'KHR_texture_transform';
    public read(): this {
        return this;
    }
    public write(): this {
        return this;
    }
}

export class ServerBVH {
    private collider: THREE.Mesh | null = null;
    private bounds: BVHBounds | null = null;

    async loadMap(glbPath: string, scale = 3, offsetY = 0.1): Promise<void> {
        const data = fs.readFileSync(glbPath);
        const io = new NodeIO().registerExtensions([KHRTextureTransformCompat]);
        const doc = await io.readBinary(new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)));
        const positions: number[] = [];
        const indices: number[] = [];

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const node of doc.getRoot().listNodes()) {
            const mesh = node.getMesh();
            if (!mesh) continue;

            const world = node.getWorldMatrix() as mat4;
            for (const prim of mesh.listPrimitives()) {
                const posAttr = prim.getAttribute('POSITION');
                if (!posAttr) continue;
                const posArray = posAttr.getArray() as Float32Array;
                const vertOffset = positions.length / 3;

                for (let i = 0; i < posAttr.getCount(); i++) {
                    const x = posArray[i * 3];
                    const y = posArray[i * 3 + 1];
                    const z = posArray[i * 3 + 2];
                    let wx = world[0] * x + world[4] * y + world[8] * z + world[12];
                    let wy = world[1] * x + world[5] * y + world[9] * z + world[13];
                    let wz = world[2] * x + world[6] * y + world[10] * z + world[14];
                    wx *= scale;
                    wy = wy * scale + offsetY;
                    wz *= scale;
                    positions.push(wx, wy, wz);
                    minX = Math.min(minX, wx); minY = Math.min(minY, wy); minZ = Math.min(minZ, wz);
                    maxX = Math.max(maxX, wx); maxY = Math.max(maxY, wy); maxZ = Math.max(maxZ, wz);
                }

                const idx = prim.getIndices();
                if (idx) {
                    const idxArray = idx.getArray() as Uint16Array | Uint32Array;
                    for (let i = 0; i < idxArray.length; i++) {
                        indices.push(vertOffset + idxArray[i]);
                    }
                } else {
                    for (let i = 0; i < posAttr.getCount(); i++) {
                        indices.push(vertOffset + i);
                    }
                }
            }
        }

        if (positions.length === 0 || indices.length === 0) {
            throw new Error(`ServerBVH: No geometry data found in ${glbPath}`);
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeBoundingBox();
        geom.boundsTree = new MeshBVH(geom);

        this.collider = new THREE.Mesh(geom, new THREE.MeshBasicMaterial());
        this.bounds = {
            min: new THREE.Vector3(minX, minY, minZ),
            max: new THREE.Vector3(maxX, maxY, maxZ),
        };
    }

    getBounds(): BVHBounds | null {
        return this.bounds;
    }

    isInsideBounds(pos: THREE.Vector3): boolean {
        if (!this.bounds) return true;
        return (
            pos.x >= this.bounds.min.x && pos.x <= this.bounds.max.x &&
            pos.y >= this.bounds.min.y && pos.y <= this.bounds.max.y &&
            pos.z >= this.bounds.min.z && pos.z <= this.bounds.max.z
        );
    }

    /**
     * Quick ground check by casting a ray down.
     */
    isGrounded(pos: THREE.Vector3, maxDist = 0.2): boolean {
        if (!this.collider || !this.collider.geometry.boundsTree) return false;
        const ray = new THREE.Ray(pos.clone().add(new THREE.Vector3(0, 0.1, 0)), new THREE.Vector3(0, -1, 0));
        const hit = this.collider.geometry.boundsTree.raycastFirst(ray, THREE.DoubleSide);
        return !!hit && hit.distance <= maxDist;
    }
}

export function mapPathFromCwd(): string {
    return path.resolve(process.cwd(), '../client/public/maps/space.glb');
}
