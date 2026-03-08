import * as THREE from 'three';
import { RapierWorld, PlayerPhysicsController, type PlayerPhysicsInput, DEFAULT_PLAYER_PHYSICS, type PlayerPhysicsConfig } from '@snapshot/shared';

export interface RapierControllerConfig extends Partial<PlayerPhysicsConfig> {}

export class RapierCharacterController {
    private world: RapierWorld;
    private controller: PlayerPhysicsController | null = null;
    private ready = false;
    private position = new THREE.Vector3();
    private velocity = new THREE.Vector3();
    private config: PlayerPhysicsConfig;
    modelEulerY = 0;
    private boundsMin: THREE.Vector3 | null = null;
    private boundsMax: THREE.Vector3 | null = null;
    private colliderReady = false;

    constructor(startPosition: THREE.Vector3, config: RapierControllerConfig = {}) {
        this.world = new RapierWorld();
        this.config = { ...DEFAULT_PLAYER_PHYSICS, ...config };
        this.position.copy(startPosition);
    }

    async init(): Promise<void> {
        if (this.ready) return;
        await this.world.init({ x: 0, y: this.config.gravity, z: 0 });
        this.controller = new PlayerPhysicsController(this.world, {
            x: this.position.x,
            y: this.position.y,
            z: this.position.z,
        }, this.config);
        this.ready = true;
    }

    /**
     * Build static colliders from a GLTF scene/group.
     */
    setColliderFromGroup(group: THREE.Object3D): void {
        if (!this.world.world) return;
        const rapier = this.world.rapier;
        let colliderCount = 0;
        const boundsMin = new THREE.Vector3(Infinity, Infinity, Infinity);
        const boundsMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

        group.traverse((child) => {
            if (!(child as THREE.Mesh).isMesh) return;
            const mesh = child as THREE.Mesh;
            if (!mesh.geometry) return;

            const geom = mesh.geometry.clone();
            geom.applyMatrix4(mesh.matrixWorld);

            const posAttr = geom.getAttribute('position');
            if (!posAttr) return;
            const posArray = posAttr.array as Float32Array;
            for (let i = 0; i < posAttr.count; i++) {
                const x = posArray[i * 3] ?? 0;
                const y = posArray[i * 3 + 1] ?? 0;
                const z = posArray[i * 3 + 2] ?? 0;
                boundsMin.x = Math.min(boundsMin.x, x);
                boundsMin.y = Math.min(boundsMin.y, y);
                boundsMin.z = Math.min(boundsMin.z, z);
                boundsMax.x = Math.max(boundsMax.x, x);
                boundsMax.y = Math.max(boundsMax.y, y);
                boundsMax.z = Math.max(boundsMax.z, z);
            }

            let indices: Uint32Array;
            if (geom.index) {
                const idx = geom.index.array;
                indices = idx instanceof Uint32Array ? idx : new Uint32Array(idx);
            } else {
                const count = posAttr.count;
                indices = new Uint32Array(count);
                for (let i = 0; i < count; i++) indices[i] = i;
            }

            const verts = new Float32Array(posArray);
            const desc = rapier.ColliderDesc.trimesh(verts, indices);
            this.world.world!.createCollider(desc);
            colliderCount++;
        });
        console.log('Rapier colliders created:', colliderCount);
        this.colliderReady = colliderCount > 0;
        if (boundsMin.x !== Infinity) {
            this.boundsMin = boundsMin;
            this.boundsMax = boundsMax;
        }
    }

    setCollider(mesh: THREE.Mesh): void {
        this.setColliderFromGroup(mesh);
    }

    update(dt: number, input: { forward: boolean; backward: boolean; left: boolean; right: boolean; jump: boolean; sprint: boolean; slide: boolean; aim: boolean }, cameraYaw: number): void {
        if (!this.ready || !this.controller || !this.colliderReady) return;
        const physicsInput: PlayerPhysicsInput = {
            forward: input.forward,
            backward: input.backward,
            left: input.left,
            right: input.right,
            jump: input.jump,
            sprint: input.sprint,
            slide: input.slide,
            aim: input.aim,
            yaw: cameraYaw,
        };
        this.controller.update(dt, physicsInput);
        this.world.step(dt);

        const pos = this.controller.getPosition();
        this.position.set(pos.x, pos.y, pos.z);
        const vel = this.controller.getVelocity();
        this.velocity.set(vel.x, vel.y, vel.z);
    }

    getPosition(): THREE.Vector3 {
        return this.position.clone();
    }

    getVisualPosition(): THREE.Vector3 {
        return this.position.clone();
    }

    getVelocity(): THREE.Vector3 {
        return this.velocity.clone();
    }

    get isGrounded(): boolean {
        return this.controller?.isGrounded ?? false;
    }

    setVelocity(velocity: THREE.Vector3): void {
        if (!this.controller) return;
        this.controller.setVelocity({ x: velocity.x, y: velocity.y, z: velocity.z });
    }

    get sliding(): boolean {
        return this.controller?.sliding ?? false;
    }

    reset(position: THREE.Vector3): void {
        this.position.copy(position);
        this.velocity.set(0, 0, 0);
        this.controller?.reset({ x: position.x, y: position.y, z: position.z });
    }

    applyPositionOffset(offset: THREE.Vector3): void {
        this.position.add(offset);
        this.controller?.applyPositionOffset({ x: offset.x, y: offset.y, z: offset.z });
    }
}

export function createRapierCharacterController(
    startPosition: THREE.Vector3,
    config?: RapierControllerConfig
): RapierCharacterController {
    return new RapierCharacterController(startPosition, config);
}
