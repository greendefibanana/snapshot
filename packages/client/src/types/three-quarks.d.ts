/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Ambient module declaration for three.quarks.
 *
 * The library ships correct types at dist/types/index.d.ts, but its
 * package.json "exports" field is malformed so TypeScript's module
 * resolution cannot pick them up automatically.
 *
 * Rather than patching the upstream package.json we declare the module
 * here so the rest of our code type-checks.  Vite resolves the actual
 * JS bundle at runtime without issues.
 */
declare module 'three.quarks' {
    import type { BufferGeometry, Material, Layers, Object3D, Vector3, Vector4 } from 'three';

    // ── Value generators ──────────────────────────────────
    export class ConstantValue { constructor(v: number); genValue(t?: number): number; toJSON(): any; clone(): ConstantValue; type: 'value'; }
    export class IntervalValue { constructor(a: number, b: number); genValue(t?: number): number; toJSON(): any; clone(): IntervalValue; type: 'value'; }
    export class Bezier { constructor(p1: number, p2: number, p3: number, p4: number); p: number[]; genValue(t: number): number; clone(): Bezier; toJSON(): any; }
    export class PiecewiseBezier { constructor(curves?: Array<[Bezier, number]>); genValue(t?: number): number; toJSON(): any; clone(): PiecewiseBezier; type: 'function'; }

    // ── Color generators ──────────────────────────────────
    export class ConstantColor { constructor(color: Vector4); toJSON(): any; clone(): ConstantColor; }
    export class Gradient {
        constructor(color?: Array<[Vector3, number]>, alpha?: Array<[number, number]>);
        genColor(color: Vector4, t: number): Vector4;
        toJSON(): any; clone(): any;
        type: 'function';
    }

    // ── Emitter shapes ────────────────────────────────────
    interface CircleEmitterParameters { radius?: number; arc?: number; thickness?: number; mode?: number; spread?: number; speed?: any; }
    export class CircleEmitter { constructor(params?: CircleEmitterParameters); radius: number; type: string; }
    interface ConeEmitterParameters { radius?: number; arc?: number; thickness?: number; angle?: number; mode?: number; spread?: number; speed?: any; }
    export class ConeEmitter { constructor(params?: ConeEmitterParameters); radius: number; type: string; }
    interface SphereEmitterParameters { radius?: number; arc?: number; thickness?: number; mode?: number; spread?: number; speed?: any; }
    export class SphereEmitter { constructor(params?: SphereEmitterParameters); radius: number; type: string; }
    export class PointEmitter { constructor(); type: string; }

    // ── Behaviors ──────────────────────────────────────────
    export class SizeOverLife { constructor(size: any); type: string; }
    export class ColorOverLife { constructor(color: any); type: string; }
    export class OrbitOverLife { constructor(orbitSpeed: any, axis?: Vector3); type: string; }
    export class SpeedOverLife { constructor(speed: any); type: string; }

    // ── Render mode ───────────────────────────────────────
    export enum RenderMode { BillBoard = 0, StretchedBillBoard = 1, Mesh = 2, Trail = 3, HorizontalBillBoard = 4, VerticalBillBoard = 5 }

    // ── ParticleSystem ────────────────────────────────────
    export interface ParticleSystemParameters {
        autoDestroy?: boolean;
        looping?: boolean;
        prewarm?: boolean;
        duration?: number;
        shape?: any;
        startLife?: any;
        startSpeed?: any;
        startRotation?: any;
        startSize?: any;
        startColor?: any;
        emissionOverTime?: any;
        emissionOverDistance?: any;
        emissionBursts?: any[];
        onlyUsedByOther?: boolean;
        maxParticle?: number;
        material?: Material;
        renderMode?: RenderMode;
        rendererEmitterSettings?: any;
        renderOrder?: number;
        worldSpace?: boolean;
        behaviors?: any[];
        instancingGeometry?: BufferGeometry;
        startTileIndex?: any;
        uTileCount?: number;
        vTileCount?: number;
        layers?: Layers;
        [key: string]: any;
    }
    export class ParticleSystem {
        constructor(params: ParticleSystemParameters);
        emitter: Object3D;
        emissionOverTime: any;
        startColor: any;
        duration: number;
        looping: boolean;
        paused: boolean;
        particleNum: number;
        particles: any[];
        worldSpace: boolean;
        autoDestroy: boolean;
        emissionState: { time: number };
        pause(): void;
        play(): void;
        restart(): void;
        clone(): ParticleSystem;
        getRendererSettings(): any;
        _renderer?: BatchedRenderer;
        instancingGeometry: BufferGeometry;
        rendererEmitterSettings: any;
        toJSON(meta: any, options: any): any;
    }

    // ── BatchedRenderer ───────────────────────────────────
    export class BatchedRenderer extends Object3D {
        constructor();
        batches: any[];
        systemToBatchIndex: Map<any, number>;
        addSystem(system: any): void;
        deleteSystem(system: any): void;
        updateSystem(system: any): void;
        update(delta: number): void;
        setDepthTexture(tex: any): void;
    }

    // ── Loader ────────────────────────────────────────────
    export class QuarksLoader {
        setCrossOrigin(v: string): void;
        load(url: string, cb: (obj: any) => void, onProgress?: () => void, onError?: () => void): void;
    }
    export class QuarksUtil { static addToBatchRenderer(obj: any, renderer: BatchedRenderer): void; }
}
