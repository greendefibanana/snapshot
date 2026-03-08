import * as THREE from 'three';
import {
    BatchedRenderer,
    QuarksLoader,
    ParticleSystem,
    PointEmitter,
    ConstantValue,
    IntervalValue,
    ConstantColor,
    RenderMode,
} from 'three.quarks';
import { AbilitiesEventBus } from '../../systems/EventBus';

export type VfxLoopHandle = string;

type PrefabRecord = {
    key: string;
    url: string;
    template: THREE.Object3D | null;
    factory?: () => THREE.Object3D;
};


type LoopRecord = {
    id: VfxLoopHandle;
    key: string;
    root: THREE.Object3D;
    parent: THREE.Object3D;
    localOffset: THREE.Vector3;
};

type OneShotRecord = {
    root: THREE.Object3D;
    remainingSec: number;
};

export class VfxSystem {
    private readonly batch: BatchedRenderer;
    private readonly loader: QuarksLoader;
    private readonly prefabs = new Map<string, PrefabRecord>();
    private readonly loops = new Map<VfxLoopHandle, LoopRecord>();
    private readonly oneshots: OneShotRecord[] = [];
    private seq = 0;
    private enabled = true;

    constructor(
        private readonly scene: THREE.Scene,
        private readonly eventBus: AbilitiesEventBus
    ) {
        this.batch = new BatchedRenderer();
        this.loader = new QuarksLoader();
        this.scene.add(this.batch);
    }

    async init(): Promise<void> {
        this.eventBus.emit('DEBUG_MESSAGE', { message: 'Abilities VFX initialized (three.quarks BatchedRenderer).' });
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) {
            for (const [id] of this.loops) this.stop(id);
            for (const one of this.oneshots) this.scene.remove(one.root);
            this.oneshots.length = 0;
        }
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    getRegisteredKeys(): string[] {
        return Array.from(this.prefabs.keys()).sort();
    }

    async loadPrefab(key: string, url: string): Promise<boolean> {
        const loaded = await this.loadWithQuarks(url);
        if (!loaded) {
            this.prefabs.set(key, { key, url, template: null });
            this.eventBus.emit('DEBUG_MESSAGE', { message: `Abilities VFX: failed to load ${key} from ${url}, fallback enabled.` });
            return false;
        }
        this.prefabs.set(key, { key, url, template: loaded });
        this.eventBus.emit('DEBUG_MESSAGE', { message: `Abilities VFX: loaded ${key} from ${url}` });
        return true;
    }

    /** Register an effect built entirely at runtime (no JSON file needed). */
    registerPrefabFactory(key: string, factory: () => THREE.Object3D): void {
        this.prefabs.set(key, { key, url: '', template: null, factory });
    }

    playOneShot(key: string, worldPos: { x: number; y: number; z: number }, worldQuat?: { x: number; y: number; z: number; w: number }): void {
        if (!this.enabled) return;
        const root = this.spawnPrefabOrFallback(key);
        if (!root) return;
        this.activateEmitterSystems(root, false);
        root.position.set(worldPos.x, worldPos.y, worldPos.z);
        if (worldQuat) {
            root.quaternion.set(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w);
        }
        this.scene.add(root);
        this.oneshots.push({ root, remainingSec: 1.2 });
    }

    startLoop(key: string, parentObject3D: THREE.Object3D, localOffset?: { x: number; y: number; z: number }): VfxLoopHandle {
        const id = `abilities_vfx_loop_${++this.seq}`;
        if (!this.enabled) return id;
        const root = this.spawnPrefabOrFallback(key);
        if (!root) return id;
        this.activateEmitterSystems(root, true);
        const off = new THREE.Vector3(localOffset?.x ?? 0, localOffset?.y ?? 0, localOffset?.z ?? 0);
        root.position.copy(off);
        parentObject3D.add(root);
        this.loops.set(id, { id, key, root, parent: parentObject3D, localOffset: off });
        return id;
    }

    stop(handle: VfxLoopHandle): void {
        const loop = this.loops.get(handle);
        if (!loop) return;
        this.loops.delete(handle);
        loop.parent.remove(loop.root);
    }

    // Backward-compatible aliases for existing abilities code.
    startLoopAttached(key: string, target: THREE.Object3D | { position: { x: number; y: number; z: number } }): VfxLoopHandle {
        if (target instanceof THREE.Object3D) {
            return this.startLoop(key, target);
        }
        const anchor = new THREE.Object3D();
        anchor.position.set(target.position.x, target.position.y, target.position.z);
        this.scene.add(anchor);
        return this.startLoop(key, anchor);
    }

    stopLoop(handle: VfxLoopHandle): void {
        this.stop(handle);
    }

    update(dt: number): void {
        if (!this.enabled) return;
        this.batch.update(dt); // dt is in seconds from the main loop.
        for (let i = this.oneshots.length - 1; i >= 0; i--) {
            this.oneshots[i]!.remainingSec -= dt;
            if (this.oneshots[i]!.remainingSec > 0) continue;
            this.scene.remove(this.oneshots[i]!.root);
            this.oneshots.splice(i, 1);
        }
    }

    dispose(): void {
        for (const [id] of this.loops) this.stop(id);
        for (const one of this.oneshots) this.scene.remove(one.root);
        this.oneshots.length = 0;
        this.scene.remove(this.batch);
    }

    private async loadWithQuarks(url: string): Promise<THREE.Object3D | null> {
        return new Promise((resolve) => {
            try {
                this.loader.setCrossOrigin('');
                this.loader.load(
                    url,
                    (obj) => resolve(obj instanceof THREE.Object3D ? obj : null),
                    undefined,
                    () => resolve(null)
                );
            } catch {
                resolve(null);
            }
        });
    }

    private spawnPrefabOrFallback(key: string): THREE.Object3D | null {
        const rec = this.prefabs.get(key);
        if (rec?.factory) {
            const obj = rec.factory();
            this.addToBatchRendererCompat(obj);
            return obj;
        }
        if (rec?.template) {
            const cloned = rec.template.clone(true);
            this.addToBatchRendererCompat(cloned);
            return cloned;
        }
        return this.createFallbackBurst(key);
    }

    private createFallbackBurst(key: string): THREE.Object3D {
        const root = new THREE.Object3D();
        try {
            const mat = new THREE.MeshBasicMaterial({ color: 0x99ccff, transparent: true, opacity: 0.9 });
            const sys = new ParticleSystem({
                looping: false,
                duration: 0.35,
                worldSpace: false,
                maxParticle: 14,
                emissionOverTime: new ConstantValue(0),
                emissionBursts: [{
                    time: 0,
                    count: new ConstantValue(14),
                    cycle: 1,
                    interval: 0.01,
                    probability: 1,
                }],
                shape: new PointEmitter(),
                startLife: new IntervalValue(0.12, 0.28),
                startSpeed: new IntervalValue(1.5, 3.8),
                startSize: new IntervalValue(0.06, 0.16),
                startColor: new ConstantColor(new THREE.Vector4(0.6, 0.85, 1.0, 1.0)),
                material: mat,
                renderMode: RenderMode.Mesh,
                autoDestroy: true,
            });
            sys.emitter.name = `fallback_${key}`;
            this.addToBatchRendererCompat(sys.emitter);
            root.add(sys.emitter);
            return root;
        } catch {
            // Final fallback if quarks runtime creation fails.
            const g = new THREE.SphereGeometry(0.14, 6, 6);
            const m = new THREE.MeshBasicMaterial({ color: 0x66ccff, wireframe: true, transparent: true, opacity: 0.7 });
            root.add(new THREE.Mesh(g, m));
            return root;
        }
    }

    private addToBatchRendererCompat(obj: THREE.Object3D): void {
        // Compatible path across three.quarks builds where QuarksUtil may not be exported.
        const asAny = obj as unknown as { type?: string; system?: unknown; traverse?: (cb: (child: unknown) => void) => void };
        if (asAny.type === 'ParticleEmitter' && asAny.system) {
            this.batch.addSystem(asAny.system);
        }
        if (typeof asAny.traverse === 'function') {
            asAny.traverse((child: unknown) => {
                const c = child as { type?: string; system?: unknown };
                if (c.type === 'ParticleEmitter' && c.system) {
                    this.batch.addSystem(c.system);
                }
            });
        }
    }

    private activateEmitterSystems(obj: THREE.Object3D, asLoop: boolean): void {
        const asAny = obj as unknown as { type?: string; system?: { looping?: boolean; restart?: () => void; play?: () => void }; traverse?: (cb: (child: unknown) => void) => void };
        const activate = (node: { system?: { looping?: boolean; restart?: () => void; play?: () => void } }): void => {
            if (!node.system) return;
            if (typeof node.system.looping === 'boolean') node.system.looping = asLoop || node.system.looping;
            node.system.restart?.();
            node.system.play?.();
        };
        activate(asAny);
        if (typeof asAny.traverse === 'function') {
            asAny.traverse((child: unknown) => activate(child as { system?: { looping?: boolean; restart?: () => void; play?: () => void } }));
        }
    }
}
