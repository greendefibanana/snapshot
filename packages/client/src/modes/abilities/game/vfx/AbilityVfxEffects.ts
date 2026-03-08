// @ts-nocheck — three.quarks runtime exports are valid; its bundled .d.ts is stale
import * as THREE from 'three';
import {
    ParticleSystem, CircleEmitter, ConeEmitter,
    SphereEmitter, DonutEmitter, ConstantValue, IntervalValue,
    ColorRange, Gradient, RenderMode,
    SizeOverLife, ColorOverLife, RotationOverLife, ForceOverLife,
    OrbitOverLife, TurbulenceField, ColorBySpeed,
    SizeBySpeed, SpeedOverLife, Bezier, PiecewiseBezier,
} from 'three.quarks';

// ─── shared helpers ──────────────────────────────────────────────────────────

function grad(stops: Array<[r: number, g: number, b: number, a: number]>): Gradient {
    const n = Math.max(1, stops.length - 1);
    return new Gradient(
        stops.map(([r, g, b], i) => [new THREE.Vector3(r, g, b), i / n] as [THREE.Vector3, number]),
        stops.map(([, , , a], i) => [a, i / n] as [number, number]),
    );
}

function growFade(): PiecewiseBezier {
    return new PiecewiseBezier([[new Bezier(0.0, 0.35, 0.90, 0.65), 0.5], [new Bezier(0.65, 0.4, 0.15, 0.0), 1]]);
}

function steadyFade(): PiecewiseBezier {
    return new PiecewiseBezier([[new Bezier(0.85, 0.95, 1.0, 1.0), 0.65], [new Bezier(1.0, 0.65, 0.25, 0.0), 1]]);
}

function mat(hex: number, additive = true): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
        color: hex, transparent: true, opacity: 1, depthWrite: false,
        side: THREE.DoubleSide,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
}

function disc(): THREE.BufferGeometry { return new THREE.CircleGeometry(0.5, 14); }
function ring(): THREE.BufferGeometry { return new THREE.RingGeometry(0.28, 0.5, 18); }
function shard(): THREE.BufferGeometry { return new THREE.TetrahedronGeometry(0.4, 0); }
function chunk(): THREE.BufferGeometry { return new THREE.DodecahedronGeometry(0.35, 0); }
function sq(): THREE.BufferGeometry { return new THREE.PlaneGeometry(0.5, 0.5); }

function burst(n: number, t = 0) {
    return { time: t, count: new ConstantValue(n), cycle: 1, interval: 0.01, probability: 1 };
}

function group(...systems: ParticleSystem[]): THREE.Group {
    const g = new THREE.Group();
    for (const s of systems) g.add(s.emitter);
    return g;
}

// ─── SEISMIC SLAM ────────────────────────────────────────────────────────────
// Layer 1: giant ground crack dust sheet (disc ring)
// Layer 2: magma chunk boulders flying outward
// Layer 3: white-hot core flash
// Layer 4: lingering ember float
export function makeSlamEffect(): THREE.Group {
    // L1 — ground shockwave ring
    const shockwave = new ParticleSystem({
        looping: false, duration: 0.08, worldSpace: true, maxParticle: 80,
        shape: new DonutEmitter({ radius: 2.8, donutRadius: 0.25, thickness: 0.92 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(80)],
        startLife: new IntervalValue(0.5, 1.2), startSpeed: new IntervalValue(0.1, 0.6),
        startSize: new IntervalValue(0.5, 1.8),
        startColor: new ColorRange(new THREE.Vector4(1, 0.72, 0.22, 0.9), new THREE.Vector4(0.8, 0.35, 0.05, 0.5)),
        material: mat(0xff9e22), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[1, .7, .1, 0.9], [1, .4, .0, 0.7], [.6, .2, .0, 0]])), new RotationOverLife(new IntervalValue(-6, 6))],
    });
    // L2 — boulders
    const boulders = new ParticleSystem({
        looping: false, duration: 0.12, worldSpace: true, maxParticle: 500,
        shape: new CircleEmitter({ radius: 2.5, arc: Math.PI * 2, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(500)],
        startLife: new IntervalValue(0.5, 1.4), startSpeed: new IntervalValue(5, 18),
        startSize: new IntervalValue(0.12, 0.65),
        startColor: new ColorRange(new THREE.Vector4(1, 0.75, 0.2, 1), new THREE.Vector4(0.75, 0.35, 0.05, 0.85)),
        material: mat(0xff8800), renderMode: RenderMode.Mesh, instancingGeometry: chunk(), autoDestroy: true,
        behaviors: [
            new SizeOverLife(growFade()), new ColorOverLife(grad([[1, .8, .2, 1], [.8, .35, .05, .8], [.3, .1, 0, 0]])),
            new RotationOverLife(new IntervalValue(-15, 15)),
            new ForceOverLife(new ConstantValue(0), new IntervalValue(-28, -8), new ConstantValue(0)),
            new TurbulenceField(new THREE.Vector3(6, 3, 6), 3, new THREE.Vector3(1.5, 0.5, 1.5), new THREE.Vector3(0.4, 0.2, 0.4)),
        ],
    });
    // L3 — core white flash
    const flash = new ParticleSystem({
        looping: false, duration: 0.05, worldSpace: false, maxParticle: 12,
        shape: new SphereEmitter({ radius: 0.3, thickness: 1 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(12)],
        startLife: new IntervalValue(0.12, 0.32), startSpeed: new IntervalValue(0.5, 2),
        startSize: new IntervalValue(1.2, 3.5),
        startColor: new ColorRange(new THREE.Vector4(1, 1, 0.9, 1), new THREE.Vector4(1, 0.8, 0.4, 0.8)),
        material: mat(0xffffff), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[1, 1, .9, 1], [1, .6, .1, .5], [1, .2, 0, 0]]))],
    });
    // L4 — lingering embers rising
    const embers = new ParticleSystem({
        looping: false, duration: 0.5, worldSpace: true, maxParticle: 120,
        shape: new CircleEmitter({ radius: 2.0, arc: Math.PI * 2, thickness: 0.95 }),
        emissionOverTime: new ConstantValue(240), emissionBursts: [],
        startLife: new IntervalValue(1.0, 2.4), startSpeed: new IntervalValue(0.5, 3.0),
        startSize: new IntervalValue(0.04, 0.18),
        startColor: new ColorRange(new THREE.Vector4(1, 0.6, 0.1, 0.9), new THREE.Vector4(1, 0.3, 0, 0.5)),
        material: mat(0xff5500), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: true,
        behaviors: [
            new SizeOverLife(steadyFade()), new ColorOverLife(grad([[1, .6, .1, .9], [.8, .2, 0, .5], [.3, .05, 0, 0]])),
            new ForceOverLife(new ConstantValue(0), new IntervalValue(0.8, 2.5), new ConstantValue(0)),
            new TurbulenceField(new THREE.Vector3(3, 5, 3), 2, new THREE.Vector3(0.8, 2, 0.8), new THREE.Vector3(0.3, 0.8, 0.3)),
        ],
    });
    return group(shockwave, boulders, flash, embers);
}

// ─── IRON FORTRESS DOME CAST ─────────────────────────────────────────────────
// L1: UV hex ring burst outward from player
// L2: energy sphere implode inward
// L3: electric arc sparks
// L4: persistent floor glow disc
export function makeIronFortressDome(): THREE.Group {
    const rings = new ParticleSystem({
        looping: false, duration: 0.15, worldSpace: true, maxParticle: 200,
        shape: new SphereEmitter({ radius: 4.5, thickness: 0.06 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(200)],
        startLife: new IntervalValue(0.4, 1.0), startSpeed: new IntervalValue(0.05, 0.3),
        startSize: new IntervalValue(0.18, 0.72),
        startColor: new ColorRange(new THREE.Vector4(0.4, 0.95, 1, 1), new THREE.Vector4(0.1, 0.55, 1, 0.8)),
        material: mat(0x22ddff), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.4, .95, 1, 1], [.1, .5, 1, .6], [.02, .1, .4, 0]])), new RotationOverLife(new IntervalValue(-8, 8))],
    });
    const implode = new ParticleSystem({
        looping: false, duration: 0.2, worldSpace: true, maxParticle: 300,
        shape: new SphereEmitter({ radius: 6.5, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(300)],
        startLife: new IntervalValue(0.3, 0.8), startSpeed: new IntervalValue(8, 22),
        startSize: new IntervalValue(0.06, 0.28),
        startColor: new ColorRange(new THREE.Vector4(0.7, 1, 1, 0.9), new THREE.Vector4(0.2, 0.7, 1, 0.6)),
        material: mat(0x88eeff), renderMode: RenderMode.Mesh, instancingGeometry: shard(), autoDestroy: true,
        behaviors: [
            new SizeOverLife(growFade()), new ColorOverLife(grad([[.8, 1, 1, .9], [.2, .7, 1, .5], [.02, .1, .3, 0]])),
            new ForceOverLife(new ConstantValue(0), new IntervalValue(-4, -1), new ConstantValue(0)),
        ],
    });
    const sparks = new ParticleSystem({
        looping: false, duration: 0.12, worldSpace: false, maxParticle: 160,
        shape: new SphereEmitter({ radius: 0.3, thickness: 1 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(160)],
        startLife: new IntervalValue(0.15, 0.55), startSpeed: new IntervalValue(4, 16),
        startSize: new IntervalValue(0.04, 0.18),
        startColor: new ColorRange(new THREE.Vector4(1, 1, 1, 1), new THREE.Vector4(0.5, 0.9, 1, 0.8)),
        material: mat(0xffffff), renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: { speedFactor: 1.5, lengthFactor: 4 }, autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[1, 1, 1, 1], [.5, .9, 1, .6], [.1, .3, .8, 0]]))],
    });
    const glow = new ParticleSystem({
        looping: false, duration: 0.08, worldSpace: false, maxParticle: 8,
        shape: new CircleEmitter({ radius: 0.5, arc: Math.PI * 2, thickness: 0.02 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(8)],
        startLife: new IntervalValue(0.8, 1.5), startSpeed: new IntervalValue(0.01, 0.05),
        startSize: new IntervalValue(4, 9),
        startColor: new ColorRange(new THREE.Vector4(0.1, 0.7, 1, 0.35), new THREE.Vector4(0.05, 0.35, 0.8, 0.15)),
        material: mat(0x0088ff), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.1, .7, 1, .35], [.05, .3, .8, .1], [0, 0, 0, 0]]))],
    });
    return group(glow, rings, implode, sparks);
}

// ─── IRON FORTRESS DOME LOOP ─────────────────────────────────────────────────
export function makeIronFortressLoop(): THREE.Group {
    const orbit = new ParticleSystem({
        looping: true, duration: 2.0, worldSpace: false, maxParticle: 350,
        shape: new CircleEmitter({ radius: 4.5, arc: Math.PI * 2, thickness: 0.04 }),
        emissionOverTime: new ConstantValue(175), emissionBursts: [],
        startLife: new IntervalValue(1.2, 2.2), startSpeed: new IntervalValue(0.02, 0.08),
        startSize: new IntervalValue(0.12, 0.42),
        startColor: new ColorRange(new THREE.Vector4(0.5, 0.95, 1, 0.7), new THREE.Vector4(0.15, 0.6, 1, 0.35)),
        material: mat(0x22ccff), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: false,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.5, .95, 1, .7], [.15, .6, 1, .35], [0, .05, .2, 0]])), new OrbitOverLife(new IntervalValue(1.5, 3.5), new THREE.Vector3(0, 1, 0))],
    });
    const topGlow = new ParticleSystem({
        looping: true, duration: 1.6, worldSpace: false, maxParticle: 40,
        shape: new SphereEmitter({ radius: 4.4, thickness: 0.05 }),
        emissionOverTime: new ConstantValue(25), emissionBursts: [],
        startLife: new IntervalValue(0.6, 1.4), startSpeed: new IntervalValue(0.01, 0.05),
        startSize: new IntervalValue(0.3, 1.2),
        startColor: new ColorRange(new THREE.Vector4(0.3, 0.9, 1, 0.55), new THREE.Vector4(0.08, 0.4, 0.9, 0.25)),
        material: mat(0x00aaff), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: false,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.3, .9, 1, .55], [.05, .3, .8, .2], [0, 0, 0, 0]]))],
    });
    return group(orbit, topGlow);
}

// ─── IRON FORTRESS BLOCK PARRY ───────────────────────────────────────────────
export function makeIronFortressBlock(): THREE.Group {
    // L1: arc of energy shards
    const arcShards = new ParticleSystem({
        looping: false, duration: 0.15, worldSpace: false, maxParticle: 200,
        shape: new CircleEmitter({ radius: 4.0, arc: Math.PI, thickness: 0.15 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(200)],
        startLife: new IntervalValue(0.2, 0.6), startSpeed: new IntervalValue(2, 9),
        startSize: new IntervalValue(0.1, 0.5),
        startColor: new ColorRange(new THREE.Vector4(1, 1, 1, 1), new THREE.Vector4(0.4, 0.88, 1, 0.85)),
        material: mat(0xaaf0ff), renderMode: RenderMode.Mesh, instancingGeometry: shard(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[1, 1, 1, 1], [.4, .9, 1, .7], [.05, .3, .8, 0]])), new ForceOverLife(new ConstantValue(0), new IntervalValue(-6, -2), new ConstantValue(0))],
    });
    // L2: white flash disc
    const flashDisc = new ParticleSystem({
        looping: false, duration: 0.06, worldSpace: false, maxParticle: 6,
        shape: new CircleEmitter({ radius: 0.2, arc: Math.PI * 2, thickness: 0 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(6)],
        startLife: new IntervalValue(0.08, 0.22), startSpeed: new IntervalValue(0.01, 0.05), startSize: new IntervalValue(2, 5),
        startColor: new ColorRange(new THREE.Vector4(1, 1, 1, 0.9), new THREE.Vector4(0.5, 0.9, 1, 0.5)),
        material: mat(0xffffff), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[1, 1, 1, .9], [.4, .85, 1, .4], [0, 0, 0, 0]]))],
    });
    return group(flashDisc, arcShards);
}

// ─── GALE FORCE CAST ─────────────────────────────────────────────────────────
// L1: wind cone ribbons (stretched, speed-colored)
// L2: cyan ring shockwave
// L3: debris blown away
export function makeGaleForce(): THREE.Group {
    const ribbons = new ParticleSystem({
        looping: false, duration: 0.4, worldSpace: false, maxParticle: 400,
        shape: new ConeEmitter({ radius: 0.22, angle: 14 }),
        emissionOverTime: new ConstantValue(1000), emissionBursts: [burst(80)],
        startLife: new IntervalValue(0.22, 0.62), startSpeed: new IntervalValue(14, 28),
        startSize: new IntervalValue(0.07, 0.28),
        startColor: new ColorRange(new THREE.Vector4(0.9, 1, 1, 0.95), new THREE.Vector4(0.5, 0.88, 1, 0.55)),
        material: mat(0xbaf8ff), renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: { speedFactor: 1.1, lengthFactor: 5.5 }, autoDestroy: true,
        behaviors: [
            new ColorOverLife(grad([[.9, 1, 1, .95], [.5, .88, 1, .55], [.15, .45, .8, 0]])),
            new ColorBySpeed(grad([[1, 1, 1, 1], [.5, .9, 1, .8], [.2, .6, 1, .3]]), new IntervalValue(12, 28)),
            new SizeBySpeed(new IntervalValue(0.6, 1.6), new IntervalValue(12, 28)),
            new SpeedOverLife(new PiecewiseBezier([[new Bezier(1, 0.85, 0.6, 0.3), 1]])),
        ],
    });
    const shockRing = new ParticleSystem({
        looping: false, duration: 0.08, worldSpace: true, maxParticle: 60,
        shape: new DonutEmitter({ radius: 0.5, donutRadius: 0.2, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(60)],
        startLife: new IntervalValue(0.3, 0.9), startSpeed: new IntervalValue(6, 20),
        startSize: new IntervalValue(0.18, 0.65),
        startColor: new ColorRange(new THREE.Vector4(1, 1, 1, 0.9), new THREE.Vector4(0.4, 0.9, 1, 0.6)),
        material: mat(0xd0f8ff), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[1, 1, 1, .9], [.4, .9, 1, .5], [.1, .3, .7, 0]])), new RotationOverLife(new IntervalValue(-10, 10))],
    });
    const debris = new ParticleSystem({
        looping: false, duration: 0.2, worldSpace: true, maxParticle: 80,
        shape: new SphereEmitter({ radius: 0.5, thickness: 0.8 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(80)],
        startLife: new IntervalValue(0.35, 1.0), startSpeed: new IntervalValue(8, 22),
        startSize: new IntervalValue(0.05, 0.22),
        startColor: new ColorRange(new THREE.Vector4(0.9, 0.95, 1, 0.7), new THREE.Vector4(0.5, 0.7, 0.9, 0.4)),
        material: mat(0x88ccdd), renderMode: RenderMode.Mesh, instancingGeometry: chunk(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[.9, .95, 1, .7], [.4, .6, .85, .35], [0, 0, 0, 0]])), new RotationOverLife(new IntervalValue(-12, 12))],
    });
    return group(shockRing, ribbons, debris);
}

// ─── GALE FORCE HIT ──────────────────────────────────────────────────────────
export function makeGaleForceHit(): THREE.Group {
    const blast = new ParticleSystem({
        looping: false, duration: 0.15, worldSpace: true, maxParticle: 220,
        shape: new SphereEmitter({ radius: 0.35, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(220)],
        startLife: new IntervalValue(0.18, 0.65), startSpeed: new IntervalValue(5, 20),
        startSize: new IntervalValue(0.06, 0.32),
        startColor: new ColorRange(new THREE.Vector4(1, 1, 1, 1), new THREE.Vector4(0.5, 0.9, 1, 0.7)),
        material: mat(0xd0f8ff), renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: { speedFactor: 1.2, lengthFactor: 3.5 }, autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[1, 1, 1, 1], [.5, .9, 1, .5], [.1, .3, .6, 0]]))],
    });
    const rings2 = new ParticleSystem({
        looping: false, duration: 0.08, worldSpace: true, maxParticle: 40,
        shape: new DonutEmitter({ radius: 0.2, donutRadius: 0.1, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(40)],
        startLife: new IntervalValue(0.25, 0.7), startSpeed: new IntervalValue(3, 10),
        startSize: new IntervalValue(0.3, 1.2),
        startColor: new ColorRange(new THREE.Vector4(0.7, 1, 1, 0.8), new THREE.Vector4(0.2, 0.7, 1, 0.4)),
        material: mat(0x88eeff), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.7, 1, 1, .8], [.15, .6, 1, .35], [0, 0, 0, 0]])), new RotationOverLife(new IntervalValue(-6, 6))],
    });
    return group(rings2, blast);
}

// ─── SKY FIRE TELEGRAPH ───────────────────────────────────────────────────────
// L1: rotating orange warning rings on ground
// L2: red smoke wisps rising
export function makeSkyFireTelegraph(): THREE.Group {
    const rings = new ParticleSystem({
        looping: true, duration: 1.5, worldSpace: false, maxParticle: 100,
        shape: new DonutEmitter({ radius: 3.8, donutRadius: 0.22, thickness: 0.4 }),
        emissionOverTime: new ConstantValue(67), emissionBursts: [],
        startLife: new IntervalValue(1.2, 1.9), startSpeed: new IntervalValue(0.01, 0.06),
        startSize: new IntervalValue(0.6, 1.9),
        startColor: new ColorRange(new THREE.Vector4(1, 0.85, 0.2, 0.6), new THREE.Vector4(1, 0.32, 0.04, 0.35)),
        material: mat(0xff8800), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: false,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[1, .85, .2, .55], [1, .32, .04, .35], [.6, .05, 0, 0]])), new RotationOverLife(new IntervalValue(2.5, 5))],
    });
    const smoke = new ParticleSystem({
        looping: true, duration: 1.5, worldSpace: true, maxParticle: 60,
        shape: new DonutEmitter({ radius: 3.6, donutRadius: 0.5, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(40), emissionBursts: [],
        startLife: new IntervalValue(0.8, 2.0), startSpeed: new IntervalValue(0.5, 2.0),
        startSize: new IntervalValue(0.5, 2.2),
        startColor: new ColorRange(new THREE.Vector4(0.9, 0.3, 0.05, 0.4), new THREE.Vector4(0.5, 0.1, 0, 0.15)),
        material: mat(0xff4400), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: false,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.9, .3, .05, .4], [.4, .05, 0, .15], [0, 0, 0, 0]])),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(1.5, 3.5), new ConstantValue(0)),
        new TurbulenceField(new THREE.Vector3(4, 6, 4), 2, new THREE.Vector3(1, 2.5, 1), new THREE.Vector3(0.35, 0.8, 0.35))],
    });
    return group(rings, smoke);
}

// ─── SKY FIRE IMPACT ─────────────────────────────────────────────────────────
// L1: white-hot beam explosion shards
// L2: thermite rain spheres
// L3: ground scorchwave
// L4: smoke column rising
export function makeSkyFireImpact(): THREE.Group {
    const shards = new ParticleSystem({
        looping: false, duration: 0.12, worldSpace: true, maxParticle: 500,
        shape: new SphereEmitter({ radius: 0.4, thickness: 0.7 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(500)],
        startLife: new IntervalValue(0.2, 0.85), startSpeed: new IntervalValue(8, 35),
        startSize: new IntervalValue(0.05, 0.32),
        startColor: new ColorRange(new THREE.Vector4(1, 1, 0.9, 1), new THREE.Vector4(1, 0.55, 0.08, 0.9)),
        material: mat(0xffe066), renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: { speedFactor: 1.8, lengthFactor: 4.5 }, autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[1, 1, .9, 1], [1, .6, .08, .8], [.5, .1, 0, 0]])),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(-38, -14), new ConstantValue(0))],
    });
    const rain = new ParticleSystem({
        looping: false, duration: 0.4, worldSpace: true, maxParticle: 300,
        shape: new SphereEmitter({ radius: 3.5, thickness: 0.85 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(300)],
        startLife: new IntervalValue(0.3, 0.9), startSpeed: new IntervalValue(2, 10),
        startSize: new IntervalValue(0.06, 0.28),
        startColor: new ColorRange(new THREE.Vector4(1, 0.92, 0.7, 1), new THREE.Vector4(1, 0.4, 0.04, 0.9)),
        material: mat(0xffaa22), renderMode: RenderMode.Mesh, instancingGeometry: shard(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[1, .9, .7, 1], [1, .4, .05, .8], [.3, .06, 0, 0]])),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(-32, -18), new ConstantValue(0))],
    });
    const scorch = new ParticleSystem({
        looping: false, duration: 0.08, worldSpace: true, maxParticle: 60,
        shape: new CircleEmitter({ radius: 2.2, arc: Math.PI * 2, thickness: 0.95 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(60)],
        startLife: new IntervalValue(0.6, 1.4), startSpeed: new IntervalValue(0.5, 3.5),
        startSize: new IntervalValue(0.4, 1.6),
        startColor: new ColorRange(new THREE.Vector4(1, 0.5, 0.1, 0.7), new THREE.Vector4(0.6, 0.15, 0, 0.35)),
        material: mat(0xff6600), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[1, .5, .1, .7], [.5, .1, 0, .3], [0, 0, 0, 0]])), new RotationOverLife(new IntervalValue(-5, 5))],
    });
    const smokeCol = new ParticleSystem({
        looping: false, duration: 0.5, worldSpace: true, maxParticle: 80,
        shape: new CircleEmitter({ radius: 0.8, arc: Math.PI * 2, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(160), emissionBursts: [],
        startLife: new IntervalValue(0.9, 2.2), startSpeed: new IntervalValue(0.5, 2.5),
        startSize: new IntervalValue(0.8, 3.5),
        startColor: new ColorRange(new THREE.Vector4(0.5, 0.35, 0.2, 0.5), new THREE.Vector4(0.2, 0.15, 0.1, 0.2)),
        material: mat(0x554433, false), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.5, .35, .2, .5], [.2, .12, .08, .2], [0, 0, 0, 0]])),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(1.5, 4.0), new ConstantValue(0)),
        new TurbulenceField(new THREE.Vector3(3, 8, 3), 2, new THREE.Vector3(0.8, 3.5, 0.8), new THREE.Vector3(0.3, 1.2, 0.3))],
    });
    return group(scorch, shards, rain, smokeCol);
}

// ─── SHADOW LEAP DEPART ───────────────────────────────────────────────────────
// L1: void implosion (particles sucked inward)
// L2: dark tentacle shards
// L3: purple flash
export function makeShadowLeapDepart(): THREE.Group {
    const voidPull = new ParticleSystem({
        looping: false, duration: 0.2, worldSpace: true, maxParticle: 300,
        shape: new SphereEmitter({ radius: 3.5, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(300)],
        startLife: new IntervalValue(0.25, 0.85), startSpeed: new IntervalValue(6, 20),
        startSize: new IntervalValue(0.05, 0.28),
        startColor: new ColorRange(new THREE.Vector4(0.8, 0.1, 1, 0.9), new THREE.Vector4(0.2, 0, 0.45, 0.5)),
        material: mat(0xaa00ff), renderMode: RenderMode.Mesh, instancingGeometry: shard(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[.8, .1, 1, .9], [.2, 0, .45, .45], [0, 0, 0, 0]])),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(2, 8), new ConstantValue(0)),
        new TurbulenceField(new THREE.Vector3(5, 4, 5), 3, new THREE.Vector3(2, 1.5, 2), new THREE.Vector3(0.7, 1.2, 0.7))],
    });
    const darkTentacles = new ParticleSystem({
        looping: false, duration: 0.18, worldSpace: true, maxParticle: 200,
        shape: new SphereEmitter({ radius: 0.4, thickness: 1 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(200)],
        startLife: new IntervalValue(0.2, 0.7), startSpeed: new IntervalValue(2.5, 12),
        startSize: new IntervalValue(0.06, 0.38),
        startColor: new ColorRange(new THREE.Vector4(0.9, 0.15, 1, 0.95), new THREE.Vector4(0.15, 0, 0.3, 0.5)),
        material: mat(0xcc00ff), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[.9, .15, 1, .95], [.2, 0, .4, .45], [0, 0, .05, 0]])),
        new OrbitOverLife(new IntervalValue(-22, 22), new THREE.Vector3(0, 1, 0))],
    });
    const flash = new ParticleSystem({
        looping: false, duration: 0.05, worldSpace: false, maxParticle: 8,
        shape: new CircleEmitter({ radius: 0.1, arc: Math.PI * 2, thickness: 0 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(8)],
        startLife: new IntervalValue(0.08, 0.2), startSpeed: new IntervalValue(0.01, 0.04), startSize: new IntervalValue(3, 8),
        startColor: new ColorRange(new THREE.Vector4(0.9, 0.4, 1, 0.9), new THREE.Vector4(0.3, 0, 0.6, 0.4)),
        material: mat(0xdd88ff), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.9, .4, 1, .9], [.3, 0, .6, .3], [0, 0, 0, 0]]))],
    });
    return group(flash, darkTentacles, voidPull);
}

// ─── SHADOW LEAP ARRIVE ───────────────────────────────────────────────────────
export function makeShadowLeapArrive(): THREE.Group {
    const explosion = new ParticleSystem({
        looping: false, duration: 0.15, worldSpace: true, maxParticle: 350,
        shape: new DonutEmitter({ radius: 0.8, donutRadius: 0.4, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(350)],
        startLife: new IntervalValue(0.2, 0.75), startSpeed: new IntervalValue(4, 18),
        startSize: new IntervalValue(0.07, 0.42),
        startColor: new ColorRange(new THREE.Vector4(1, 0.5, 1, 1), new THREE.Vector4(0.4, 0, 0.85, 0.75)),
        material: mat(0xee44ff), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[1, .5, 1, 1], [.4, 0, .85, .65], [.05, 0, .1, 0]])), new RotationOverLife(new IntervalValue(-16, 16))],
    });
    const voidRipple = new ParticleSystem({
        looping: false, duration: 0.08, worldSpace: false, maxParticle: 12,
        shape: new CircleEmitter({ radius: 0.3, arc: Math.PI * 2, thickness: 0 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(12)],
        startLife: new IntervalValue(0.3, 0.8), startSpeed: new IntervalValue(5, 12), startSize: new IntervalValue(0.8, 3.5),
        startColor: new ColorRange(new THREE.Vector4(0.6, 0, 1, 0.8), new THREE.Vector4(0.15, 0, 0.4, 0.3)),
        material: mat(0x8800ff), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.6, 0, 1, .8], [.1, 0, .3, .25], [0, 0, 0, 0]]))],
    });
    return group(voidRipple, explosion);
}

// ─── SHADOW FORM LOOP ─────────────────────────────────────────────────────────
export function makeShadowForm(): THREE.Group {
    const aura = new ParticleSystem({
        looping: true, duration: 1.2, worldSpace: false, maxParticle: 220,
        shape: new SphereEmitter({ radius: 0.65, thickness: 1 }),
        emissionOverTime: new ConstantValue(185), emissionBursts: [],
        startLife: new IntervalValue(0.3, 0.95), startSpeed: new IntervalValue(0.4, 2.5),
        startSize: new IntervalValue(0.04, 0.26),
        startColor: new ColorRange(new THREE.Vector4(0.75, 0.05, 1, 0.85), new THREE.Vector4(0.1, 0, 0.28, 0.35)),
        material: mat(0x9900cc), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: false,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.75, .05, 1, .85], [.1, 0, .28, .3], [0, 0, 0, 0]])),
        new OrbitOverLife(new IntervalValue(-10, 10), new THREE.Vector3(0, 1, 0)),
        new TurbulenceField(new THREE.Vector3(3, 2, 3), 2, new THREE.Vector3(1.8, 1, 1.8), new THREE.Vector3(0.6, 1, 0.6))],
    });
    return group(aura);
}

// ─── BASILISK PULSE ───────────────────────────────────────────────────────────
// L1: expanding neuro-venom rings
// L2: glitch static particles
// L3: corruption cloud plume
export function makeBasiliskPulse(): THREE.Group {
    const rings = new ParticleSystem({
        looping: false, duration: 0.3, worldSpace: true, maxParticle: 180,
        shape: new DonutEmitter({ radius: 0.6, donutRadius: 0.25, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(180)],
        startLife: new IntervalValue(0.4, 1.1), startSpeed: new IntervalValue(3, 12),
        startSize: new IntervalValue(0.15, 0.9),
        startColor: new ColorRange(new THREE.Vector4(0.45, 1, 0.35, 1), new THREE.Vector4(0.8, 0.25, 1, 0.8)),
        material: mat(0x66ff33), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[.45, 1, .35, 1], [.8, .25, 1, .65], [.05, .02, .1, 0]])), new RotationOverLife(new IntervalValue(-10, 10))],
    });
    const static_ = new ParticleSystem({
        looping: false, duration: 0.35, worldSpace: true, maxParticle: 250,
        shape: new SphereEmitter({ radius: 1.5, thickness: 0.95 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(250)],
        startLife: new IntervalValue(0.15, 0.55), startSpeed: new IntervalValue(2, 8),
        startSize: new IntervalValue(0.03, 0.16),
        startColor: new ColorRange(new THREE.Vector4(0.6, 1, 0.4, 0.9), new THREE.Vector4(0.9, 0.2, 1, 0.7)),
        material: mat(0x99ff44), renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: { speedFactor: 1.2, lengthFactor: 2.5 }, autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[.6, 1, .4, .9], [.85, .2, 1, .55], [0, 0, 0, 0]]))],
    });
    const cloud = new ParticleSystem({
        looping: false, duration: 0.4, worldSpace: true, maxParticle: 50,
        shape: new SphereEmitter({ radius: 0.5, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(125), emissionBursts: [],
        startLife: new IntervalValue(0.6, 1.8), startSpeed: new IntervalValue(0.3, 1.5),
        startSize: new IntervalValue(0.6, 2.8),
        startColor: new ColorRange(new THREE.Vector4(0.38, 0.92, 0.28, 0.5), new THREE.Vector4(0.1, 0.55, 0.1, 0.2)),
        material: mat(0x33cc11, false), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.38, .92, .28, .5], [.08, .45, .08, .18], [0, 0, 0, 0]])),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(0.6, 2), new ConstantValue(0)),
        new TurbulenceField(new THREE.Vector3(3, 4, 3), 2, new THREE.Vector3(0.8, 1.8, 0.8), new THREE.Vector3(0.25, 0.6, 0.25))],
    });
    return group(rings, static_, cloud);
}

// ─── BASILISK GAZE HIT ────────────────────────────────────────────────────────
export function makeBasiliskGazeHit(): THREE.Group {
    const freeze = new ParticleSystem({
        looping: false, duration: 0.2, worldSpace: true, maxParticle: 280,
        shape: new DonutEmitter({ radius: 1.1, donutRadius: 0.5, thickness: 0.85 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(280)],
        startLife: new IntervalValue(0.35, 1.1), startSpeed: new IntervalValue(2, 10),
        startSize: new IntervalValue(0.08, 0.55),
        startColor: new ColorRange(new THREE.Vector4(0.35, 1, 0.28, 1), new THREE.Vector4(0.85, 0.2, 1, 0.8)),
        material: mat(0x55ff44), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[.35, 1, .28, 1], [.8, .2, 1, .65], [0, .02, .04, 0]])),
        new OrbitOverLife(new IntervalValue(-14, 14), new THREE.Vector3(0, 1, 0)),
        new TurbulenceField(new THREE.Vector3(4, 2, 4), 3, new THREE.Vector3(1.2, 0.6, 1.2), new THREE.Vector3(0.5, 0.8, 0.5))],
    });
    return group(freeze);
}


// â”€â”€â”€ BATTERING RAM CHARGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function makeBatteringRamCharge(): THREE.Group {
    const speedLines = new ParticleSystem({
        looping: true, duration: 0.4, worldSpace: false, maxParticle: 500,
        shape: new ConeEmitter({ radius: 0.15, angle: 6 }),
        emissionOverTime: new ConstantValue(1250), emissionBursts: [],
        startLife: new IntervalValue(0.08, 0.28), startSpeed: new IntervalValue(18, 40),
        startSize: new IntervalValue(0.05, 0.22),
        startColor: new ColorRange(new THREE.Vector4(1, 0.82, 0.2, 0.9), new THREE.Vector4(1, 0.42, 0.05, 0.6)),
        material: mat(0xffcc22), renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: { speedFactor: 2, lengthFactor: 6 }, autoDestroy: false,
        behaviors: [new ColorBySpeed(grad([[1, 1, .6, 1], [1, .5, .1, .7], [.6, .15, 0, 0]]), new IntervalValue(18, 42)),
        new SizeBySpeed(new IntervalValue(0.5, 1.8), new IntervalValue(18, 42)),
        new SpeedOverLife(new PiecewiseBezier([[new Bezier(1, 0.7, 0.4, 0.1), 1]]))],
    });
    const groundDust = new ParticleSystem({
        looping: true, duration: 0.4, worldSpace: true, maxParticle: 150,
        shape: new CircleEmitter({ radius: 0.5, arc: Math.PI * 2, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(375), emissionBursts: [],
        startLife: new IntervalValue(0.3, 0.9), startSpeed: new IntervalValue(1, 5),
        startSize: new IntervalValue(0.15, 0.7),
        startColor: new ColorRange(new THREE.Vector4(0.9, 0.75, 0.45, 0.7), new THREE.Vector4(0.55, 0.38, 0.18, 0.3)),
        material: mat(0xd4a055, false), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: false,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.9, .75, .45, .7], [.5, .35, .2, .25], [0, 0, 0, 0]])),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(1, 3.5), new ConstantValue(0))],
    });
    return group(speedLines, groundDust);
}

export function makeBatteringRamImpact(): THREE.Group {
    const wall = new ParticleSystem({
        looping: false, duration: 0.1, worldSpace: true, maxParticle: 550,
        shape: new SphereEmitter({ radius: 0.5, thickness: 0.8 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(550)],
        startLife: new IntervalValue(0.25, 0.9), startSpeed: new IntervalValue(6, 30),
        startSize: new IntervalValue(0.1, 0.65),
        startColor: new ColorRange(new THREE.Vector4(1, 0.9, 0.5, 1), new THREE.Vector4(0.7, 0.45, 0.15, 0.8)),
        material: mat(0xffcc44), renderMode: RenderMode.Mesh, instancingGeometry: chunk(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[1, .9, .5, 1], [.7, .4, .12, .75], [.2, .1, 0, 0]])),
        new RotationOverLife(new IntervalValue(-20, 20)),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(-28, -10), new ConstantValue(0)),
        new TurbulenceField(new THREE.Vector3(8, 4, 8), 3, new THREE.Vector3(2, 1, 2), new THREE.Vector3(0.5, 0.35, 0.5))],
    });
    const shockRing = new ParticleSystem({
        looping: false, duration: 0.08, worldSpace: true, maxParticle: 80,
        shape: new DonutEmitter({ radius: 0.5, donutRadius: 0.3, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(80)],
        startLife: new IntervalValue(0.4, 1.0), startSpeed: new IntervalValue(5, 18),
        startSize: new IntervalValue(0.3, 1.4),
        startColor: new ColorRange(new THREE.Vector4(1, 0.85, 0.35, 0.8), new THREE.Vector4(0.7, 0.4, 0.1, 0.4)),
        material: mat(0xffbb22), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[1, .85, .35, .8], [.6, .3, .05, .35], [0, 0, 0, 0]])), new RotationOverLife(new IntervalValue(-8, 8))],
    });
    const flash = new ParticleSystem({
        looping: false, duration: 0.06, worldSpace: false, maxParticle: 8,
        shape: new CircleEmitter({ radius: 0.2, arc: Math.PI * 2, thickness: 0 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(8)],
        startLife: new IntervalValue(0.08, 0.22), startSpeed: new IntervalValue(0.01, 0.05), startSize: new IntervalValue(3, 9),
        startColor: new ColorRange(new THREE.Vector4(1, 1, 0.9, 0.9), new THREE.Vector4(1, 0.7, 0.2, 0.4)),
        material: mat(0xffffff), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[1, 1, .9, .9], [1, .6, .15, .4], [0, 0, 0, 0]]))],
    });
    return group(flash, shockRing, wall);
}

export function makeUnstoppableHerd(): THREE.Group {
    const golden = new ParticleSystem({
        looping: false, duration: 0.15, worldSpace: true, maxParticle: 400,
        shape: new DonutEmitter({ radius: 3.5, donutRadius: 0.4, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(400)],
        startLife: new IntervalValue(0.4, 1.2), startSpeed: new IntervalValue(4, 18),
        startSize: new IntervalValue(0.15, 0.85),
        startColor: new ColorRange(new THREE.Vector4(1, 0.95, 0.3, 1), new THREE.Vector4(1, 0.65, 0.05, 0.8)),
        material: mat(0xffe033), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[1, .95, .3, 1], [1, .55, .04, .75], [.5, .2, 0, 0]])),
        new RotationOverLife(new IntervalValue(-14, 14)),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(-12, -4), new ConstantValue(0))],
    });
    const flash = new ParticleSystem({
        looping: false, duration: 0.06, worldSpace: false, maxParticle: 10,
        shape: new CircleEmitter({ radius: 0.3, arc: Math.PI * 2, thickness: 0 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(10)],
        startLife: new IntervalValue(0.2, 0.6), startSpeed: new IntervalValue(0.01, 0.05), startSize: new IntervalValue(5, 12),
        startColor: new ColorRange(new THREE.Vector4(1, 0.98, 0.7, 0.9), new THREE.Vector4(1, 0.8, 0.2, 0.35)),
        material: mat(0xffffff), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[1, .98, .7, .9], [1, .7, .1, .35], [0, 0, 0, 0]]))],
    });
    return group(flash, golden);
}

export function makeUnstoppableHerdAura(): THREE.Group {
    const aura = new ParticleSystem({
        looping: true, duration: 1.5, worldSpace: false, maxParticle: 300,
        shape: new SphereEmitter({ radius: 0.8, thickness: 1 }),
        emissionOverTime: new ConstantValue(200), emissionBursts: [],
        startLife: new IntervalValue(0.5, 1.4), startSpeed: new IntervalValue(0.5, 3.5),
        startSize: new IntervalValue(0.06, 0.32),
        startColor: new ColorRange(new THREE.Vector4(1, 0.88, 0.25, 0.9), new THREE.Vector4(0.9, 0.55, 0.04, 0.4)),
        material: mat(0xffcc00), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: false,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[1, .88, .25, .9], [.85, .45, .04, .4], [0, 0, 0, 0]])),
        new OrbitOverLife(new IntervalValue(-8, 8), new THREE.Vector3(0, 1, 0))],
    });
    return group(aura);
}

export function makeUnstoppableHerdDust(): THREE.Group {
    const dust = new ParticleSystem({
        looping: false, duration: 0.15, worldSpace: true, maxParticle: 120,
        shape: new CircleEmitter({ radius: 0.6, arc: Math.PI * 2, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(120)],
        startLife: new IntervalValue(0.3, 0.9), startSpeed: new IntervalValue(1, 6),
        startSize: new IntervalValue(0.1, 0.6),
        startColor: new ColorRange(new THREE.Vector4(0.9, 0.75, 0.4, 0.8), new THREE.Vector4(0.6, 0.45, 0.2, 0.35)),
        material: mat(0xd4a022, false), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.9, .75, .4, .8], [.55, .4, .18, .3], [0, 0, 0, 0]])),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(0.5, 2.5), new ConstantValue(0))],
    });
    return group(dust);
}

export function makeNeuroToxin(): THREE.Group {
    const burst1 = new ParticleSystem({
        looping: false, duration: 0.2, worldSpace: true, maxParticle: 300,
        shape: new SphereEmitter({ radius: 0.5, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(300)],
        startLife: new IntervalValue(0.3, 1.1), startSpeed: new IntervalValue(3, 14),
        startSize: new IntervalValue(0.08, 0.5),
        startColor: new ColorRange(new THREE.Vector4(0.45, 1, 0.28, 0.9), new THREE.Vector4(0.2, 0.7, 0.1, 0.55)),
        material: mat(0x55ee22), renderMode: RenderMode.Mesh, instancingGeometry: shard(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[.45, 1, .28, .9], [.18, .6, .08, .45], [0, .02, 0, 0]])),
        new TurbulenceField(new THREE.Vector3(4, 4, 4), 3, new THREE.Vector3(1.5, 1.5, 1.5), new THREE.Vector3(0.5, 0.5, 0.5))],
    });
    const fog = new ParticleSystem({
        looping: false, duration: 0.5, worldSpace: true, maxParticle: 60,
        shape: new SphereEmitter({ radius: 1, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(120), emissionBursts: [],
        startLife: new IntervalValue(0.8, 2.4), startSpeed: new IntervalValue(0.3, 1.5),
        startSize: new IntervalValue(1.0, 4.5),
        startColor: new ColorRange(new THREE.Vector4(0.28, 0.92, 0.18, 0.42), new THREE.Vector4(0.08, 0.45, 0.04, 0.15)),
        material: mat(0x33cc11, false), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.28, .92, .18, .42], [.06, .38, .04, .15], [0, 0, 0, 0]])),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(0.5, 2), new ConstantValue(0)),
        new TurbulenceField(new THREE.Vector3(3, 5, 3), 2, new THREE.Vector3(0.8, 2, 0.8), new THREE.Vector3(0.3, 0.7, 0.3))],
    });
    return group(burst1, fog);
}

export function makeNeuroToxinFog(): THREE.Group {
    const denseBase = new ParticleSystem({
        looping: true, duration: 2.4, worldSpace: true, maxParticle: 220,
        shape: new CircleEmitter({ radius: 3.8, arc: Math.PI * 2, thickness: 0.85 }),
        emissionOverTime: new ConstantValue(95), emissionBursts: [],
        startLife: new IntervalValue(1.8, 4.4), startSpeed: new IntervalValue(0.04, 0.35),
        startSize: new IntervalValue(1.8, 7.2),
        startColor: new ColorRange(new THREE.Vector4(0.24, 0.9, 0.16, 0.44), new THREE.Vector4(0.08, 0.42, 0.06, 0.2)),
        material: mat(0x2eb012, false), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: false,
        behaviors: [
            new SizeOverLife(steadyFade()),
            new ColorOverLife(grad([[.24, .9, .16, .44], [.08, .42, .06, .2], [0, 0, 0, 0]])),
            new ForceOverLife(new IntervalValue(-0.2, 0.2), new IntervalValue(0.12, 0.7), new IntervalValue(-0.2, 0.2)),
            new TurbulenceField(new THREE.Vector3(3.2, 1.6, 3.2), 2, new THREE.Vector3(1.2, 0.5, 1.2), new THREE.Vector3(0.45, 0.2, 0.45)),
        ],
    });
    const highPlumes = new ParticleSystem({
        looping: true, duration: 2.0, worldSpace: true, maxParticle: 120,
        shape: new SphereEmitter({ radius: 2.8, thickness: 0.7 }),
        emissionOverTime: new ConstantValue(46), emissionBursts: [],
        startLife: new IntervalValue(1.4, 3.2), startSpeed: new IntervalValue(0.25, 1.1),
        startSize: new IntervalValue(1.0, 4.8),
        startColor: new ColorRange(new THREE.Vector4(0.42, 1, 0.22, 0.28), new THREE.Vector4(0.14, 0.55, 0.07, 0.1)),
        material: mat(0x63e531, false), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: false,
        behaviors: [
            new SizeOverLife(steadyFade()),
            new ColorOverLife(grad([[.42, 1, .22, .28], [.14, .55, .07, .1], [0, 0, 0, 0]])),
            new ForceOverLife(new ConstantValue(0), new IntervalValue(0.3, 1.5), new ConstantValue(0)),
            new TurbulenceField(new THREE.Vector3(2.8, 4.5, 2.8), 2, new THREE.Vector3(1, 2.2, 1), new THREE.Vector3(0.35, 0.8, 0.35)),
        ],
    });
    return group(denseBase, highPlumes);
}

export function makeNeuroToxinTick(): THREE.Group {
    const tick = new ParticleSystem({
        looping: false, duration: 0.08, worldSpace: true, maxParticle: 40,
        shape: new SphereEmitter({ radius: 0.2, thickness: 1 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(40)],
        startLife: new IntervalValue(0.12, 0.45), startSpeed: new IntervalValue(1, 6),
        startSize: new IntervalValue(0.04, 0.22),
        startColor: new ColorRange(new THREE.Vector4(0.55, 1, 0.35, 0.9), new THREE.Vector4(0.2, 0.8, 0.1, 0.5)),
        material: mat(0x77ff33), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[.55, 1, .35, .9], [.18, .7, .06, .4], [0, 0, 0, 0]]))],
    });
    return group(tick);
}

export function makeScrapMagnet(): THREE.Group {
    const singularity = new ParticleSystem({
        looping: false, duration: 0.25, worldSpace: true, maxParticle: 300,
        shape: new SphereEmitter({ radius: 5, thickness: 0.95 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(300)],
        startLife: new IntervalValue(0.3, 1.0), startSpeed: new IntervalValue(5, 20),
        startSize: new IntervalValue(0.06, 0.4),
        startColor: new ColorRange(new THREE.Vector4(1, 0.75, 0.08, 0.9), new THREE.Vector4(0.8, 0.35, 0.04, 0.55)),
        material: mat(0xffaa00), renderMode: RenderMode.Mesh, instancingGeometry: shard(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[1, .75, .08, .9], [.7, .28, .04, .5], [0, 0, 0, 0]])),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(4, 16), new ConstantValue(0)),
        new OrbitOverLife(new IntervalValue(-20, 20), new THREE.Vector3(0, 1, 0))],
    });
    return group(singularity);
}

export function makeScrapMagnetPull(): THREE.Group {
    const swirl = new ParticleSystem({
        looping: true, duration: 1.5, worldSpace: false, maxParticle: 280,
        shape: new SphereEmitter({ radius: 6.2, thickness: 0.45 }),
        emissionOverTime: new ConstantValue(185), emissionBursts: [],
        startLife: new IntervalValue(0.45, 1.6), startSpeed: new IntervalValue(6, 20),
        startSize: new IntervalValue(0.05, 0.32),
        startColor: new ColorRange(new THREE.Vector4(1, 0.84, 0.12, 0.85), new THREE.Vector4(0.84, 0.4, 0.05, 0.45)),
        material: mat(0xffbf1c), renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: { speedFactor: 1.7, lengthFactor: 3.6 }, autoDestroy: false,
        behaviors: [
            new SizeOverLife(steadyFade()),
            new ColorOverLife(grad([[1, .84, .12, .85], [.72, .34, .05, .45], [0, 0, 0, 0]])),
            new ForceOverLife(new ConstantValue(0), new IntervalValue(-15, -4), new ConstantValue(0)),
            new OrbitOverLife(new IntervalValue(-22, 22), new THREE.Vector3(0, 1, 0)),
            new TurbulenceField(new THREE.Vector3(6, 3, 6), 2, new THREE.Vector3(2.2, 1, 2.2), new THREE.Vector3(0.55, 0.4, 0.55)),
        ],
    });
    const coreWell = new ParticleSystem({
        looping: true, duration: 1.0, worldSpace: false, maxParticle: 120,
        shape: new SphereEmitter({ radius: 1.2, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(72), emissionBursts: [],
        startLife: new IntervalValue(0.22, 0.7), startSpeed: new IntervalValue(0.2, 1.4),
        startSize: new IntervalValue(0.18, 0.75),
        startColor: new ColorRange(new THREE.Vector4(1, 0.95, 0.7, 0.72), new THREE.Vector4(1, 0.66, 0.25, 0.22)),
        material: mat(0xffdf88), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: false,
        behaviors: [
            new SizeOverLife(steadyFade()),
            new ColorOverLife(grad([[1, .95, .7, .72], [1, .66, .25, .22], [0, 0, 0, 0]])),
            new ForceOverLife(new ConstantValue(0), new IntervalValue(-2.5, 1.8), new ConstantValue(0)),
        ],
    });
    return group(swirl, coreWell);
}

export function makeScrapMagnetHit(): THREE.Group {
    const hit = new ParticleSystem({
        looping: false, duration: 0.08, worldSpace: true, maxParticle: 60,
        shape: new SphereEmitter({ radius: 0.25, thickness: 1 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(60)],
        startLife: new IntervalValue(0.1, 0.4), startSpeed: new IntervalValue(2, 10),
        startSize: new IntervalValue(0.04, 0.2),
        startColor: new ColorRange(new THREE.Vector4(1, 0.88, 0.3, 1), new THREE.Vector4(0.8, 0.5, 0.08, 0.6)),
        material: mat(0xffcc22), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[1, .88, .3, 1], [.7, .4, .06, .5], [0, 0, 0, 0]]))],
    });
    return group(hit);
}

export function makeJunkTurretDeploy(): THREE.Group {
    const electric = new ParticleSystem({
        looping: false, duration: 0.2, worldSpace: true, maxParticle: 220,
        shape: new SphereEmitter({ radius: 0.5, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(220)],
        startLife: new IntervalValue(0.15, 0.55), startSpeed: new IntervalValue(3, 14),
        startSize: new IntervalValue(0.04, 0.22),
        startColor: new ColorRange(new THREE.Vector4(0.5, 0.95, 1, 1), new THREE.Vector4(0.15, 0.6, 0.9, 0.7)),
        material: mat(0x44ddff), renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: { speedFactor: 1.4, lengthFactor: 3 }, autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[.5, .95, 1, 1], [.12, .55, .9, .6], [0, .02, .05, 0]]))],
    });
    const scrapChunks = new ParticleSystem({
        looping: false, duration: 0.15, worldSpace: true, maxParticle: 80,
        shape: new SphereEmitter({ radius: 0.3, thickness: 1 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(80)],
        startLife: new IntervalValue(0.3, 0.9), startSpeed: new IntervalValue(3, 12),
        startSize: new IntervalValue(0.08, 0.38),
        startColor: new ColorRange(new THREE.Vector4(0.7, 0.7, 0.7, 0.8), new THREE.Vector4(0.35, 0.3, 0.25, 0.5)),
        material: mat(0x888877, false), renderMode: RenderMode.Mesh, instancingGeometry: chunk(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[.7, .7, .7, .8], [.3, .28, .22, .4], [0, 0, 0, 0]])),
        new RotationOverLife(new IntervalValue(-18, 18)),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(-22, -8), new ConstantValue(0))],
    });
    return group(electric, scrapChunks);
}

export function makeJunkTurretIdle(): THREE.Group {
    const energyOrbit = new ParticleSystem({
        looping: true, duration: 1.8, worldSpace: false, maxParticle: 120,
        shape: new CircleEmitter({ radius: 0.8, arc: Math.PI * 2, thickness: 0.05 }),
        emissionOverTime: new ConstantValue(67), emissionBursts: [],
        startLife: new IntervalValue(0.8, 2.0), startSpeed: new IntervalValue(0.02, 0.06),
        startSize: new IntervalValue(0.08, 0.32),
        startColor: new ColorRange(new THREE.Vector4(0.4, 0.92, 1, 0.6), new THREE.Vector4(0.12, 0.5, 0.85, 0.25)),
        material: mat(0x22ccff), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: false,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.4, .92, 1, .6], [.1, .45, .8, .2], [0, 0, 0, 0]])),
        new OrbitOverLife(new IntervalValue(3, 7), new THREE.Vector3(0, 1, 0))],
    });
    return group(energyOrbit);
}

export function makeJunkTurretShot(): THREE.Group {
    const spark = new ParticleSystem({
        looping: false, duration: 0.06, worldSpace: true, maxParticle: 50,
        shape: new SphereEmitter({ radius: 0.15, thickness: 1 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(50)],
        startLife: new IntervalValue(0.08, 0.32), startSpeed: new IntervalValue(3, 12),
        startSize: new IntervalValue(0.03, 0.16),
        startColor: new ColorRange(new THREE.Vector4(0.6, 0.98, 1, 1), new THREE.Vector4(0.15, 0.58, 0.9, 0.65)),
        material: mat(0x55eeff), renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: { speedFactor: 1.5, lengthFactor: 2.5 }, autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[.6, .98, 1, 1], [.12, .5, .88, .5], [0, 0, 0, 0]]))],
    });
    return group(spark);
}

export function makeScavengersFeast(): THREE.Group {
    const dataStorm = new ParticleSystem({
        looping: false, duration: 0.35, worldSpace: true, maxParticle: 350,
        shape: new SphereEmitter({ radius: 2.5, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(350)],
        startLife: new IntervalValue(0.3, 1.1), startSpeed: new IntervalValue(3, 16),
        startSize: new IntervalValue(0.05, 0.4),
        startColor: new ColorRange(new THREE.Vector4(0.3, 1, 0.55, 1), new THREE.Vector4(0.06, 0.65, 0.28, 0.6)),
        material: mat(0x22ff77), renderMode: RenderMode.Mesh, instancingGeometry: shard(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[.3, 1, .55, 1], [.05, .55, .22, .55], [0, .02, 0, 0]])),
        new OrbitOverLife(new IntervalValue(-12, 12), new THREE.Vector3(0, 1, 0)),
        new TurbulenceField(new THREE.Vector3(4, 6, 4), 3, new THREE.Vector3(1.5, 2.5, 1.5), new THREE.Vector3(0.5, 0.8, 0.5))],
    });
    const flash = new ParticleSystem({
        looping: false, duration: 0.06, worldSpace: false, maxParticle: 8,
        shape: new CircleEmitter({ radius: 0.2, arc: Math.PI * 2, thickness: 0 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(8)],
        startLife: new IntervalValue(0.1, 0.3), startSpeed: new IntervalValue(0.01, 0.04), startSize: new IntervalValue(4, 10),
        startColor: new ColorRange(new THREE.Vector4(0.7, 1, 0.8, 0.85), new THREE.Vector4(0.2, 0.8, 0.4, 0.3)),
        material: mat(0xaaffcc), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.7, 1, .8, .85], [.15, .7, .35, .3], [0, 0, 0, 0]]))],
    });
    return group(flash, dataStorm);
}

export function makeScavengersFeastZone(): THREE.Group {
    const harvest = new ParticleSystem({
        looping: true, duration: 2.0, worldSpace: false, maxParticle: 200,
        shape: new SphereEmitter({ radius: 4.5, thickness: 0.4 }),
        emissionOverTime: new ConstantValue(100), emissionBursts: [],
        startLife: new IntervalValue(0.8, 2.5), startSpeed: new IntervalValue(1, 6),
        startSize: new IntervalValue(0.06, 0.35),
        startColor: new ColorRange(new THREE.Vector4(0.25, 0.95, 0.5, 0.75), new THREE.Vector4(0.05, 0.55, 0.22, 0.3)),
        material: mat(0x22ee66), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: false,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.25, .95, .5, .75], [.04, .45, .18, .28], [0, 0, 0, 0]])),
        new OrbitOverLife(new IntervalValue(-5, 5), new THREE.Vector3(0, 1, 0)),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(-5, -1), new ConstantValue(0))],
    });
    return group(harvest);
}

export function makeStampedeOverdrive(): THREE.Group {
    const warCharge = new ParticleSystem({
        looping: false, duration: 0.2, worldSpace: true, maxParticle: 500,
        shape: new DonutEmitter({ radius: 1.5, donutRadius: 0.5, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(500)],
        startLife: new IntervalValue(0.3, 1.1), startSpeed: new IntervalValue(5, 22),
        startSize: new IntervalValue(0.1, 0.65),
        startColor: new ColorRange(new THREE.Vector4(1, 0.95, 0.35, 1), new THREE.Vector4(1, 0.58, 0.05, 0.8)),
        material: mat(0xffdd22), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[1, .95, .35, 1], [1, .5, .04, .75], [.5, .15, 0, 0]])),
        new RotationOverLife(new IntervalValue(-15, 15)),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(-20, -8), new ConstantValue(0)),
        new TurbulenceField(new THREE.Vector3(6, 4, 6), 3, new THREE.Vector3(2, 1.2, 2), new THREE.Vector3(0.5, 0.4, 0.5))],
    });
    const flash = new ParticleSystem({
        looping: false, duration: 0.06, worldSpace: false, maxParticle: 10,
        shape: new CircleEmitter({ radius: 0.3, arc: Math.PI * 2, thickness: 0 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(10)],
        startLife: new IntervalValue(0.15, 0.4), startSpeed: new IntervalValue(0.01, 0.04), startSize: new IntervalValue(5, 14),
        startColor: new ColorRange(new THREE.Vector4(1, 1, 0.8, 0.95), new THREE.Vector4(1, 0.75, 0.15, 0.35)),
        material: mat(0xffffff), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[1, 1, .8, .95], [1, .6, .08, .35], [0, 0, 0, 0]]))],
    });
    return group(flash, warCharge);
}

export function makeStampedeAura(): THREE.Group {
    const aura = new ParticleSystem({
        looping: true, duration: 1.2, worldSpace: false, maxParticle: 280,
        shape: new SphereEmitter({ radius: 0.9, thickness: 1 }),
        emissionOverTime: new ConstantValue(235), emissionBursts: [],
        startLife: new IntervalValue(0.4, 1.2), startSpeed: new IntervalValue(0.5, 3.5),
        startSize: new IntervalValue(0.05, 0.3),
        startColor: new ColorRange(new THREE.Vector4(1, 0.9, 0.22, 0.9), new THREE.Vector4(0.9, 0.5, 0.04, 0.4)),
        material: mat(0xffdd00), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: false,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[1, .9, .22, .9], [.85, .42, .04, .4], [0, 0, 0, 0]])),
        new OrbitOverLife(new IntervalValue(-6, 6), new THREE.Vector3(0, 1, 0))],
    });
    return group(aura);
}

export function makeStampedeImpact(): THREE.Group {
    const explosion = new ParticleSystem({
        looping: false, duration: 0.12, worldSpace: true, maxParticle: 500,
        shape: new SphereEmitter({ radius: 0.5, thickness: 0.85 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(500)],
        startLife: new IntervalValue(0.2, 0.85), startSpeed: new IntervalValue(6, 28),
        startSize: new IntervalValue(0.08, 0.55),
        startColor: new ColorRange(new THREE.Vector4(1, 0.98, 0.6, 1), new THREE.Vector4(1, 0.55, 0.06, 0.85)),
        material: mat(0xffee44), renderMode: RenderMode.Mesh, instancingGeometry: chunk(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[1, .95, .55, 1], [1, .45, .05, .8], [.4, .1, 0, 0]])),
        new RotationOverLife(new IntervalValue(-20, 20)),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(-35, -12), new ConstantValue(0)),
        new TurbulenceField(new THREE.Vector3(8, 5, 8), 3, new THREE.Vector3(2.5, 1.5, 2.5), new THREE.Vector3(0.6, 0.4, 0.6))],
    });
    const shockRing = new ParticleSystem({
        looping: false, duration: 0.08, worldSpace: true, maxParticle: 80,
        shape: new DonutEmitter({ radius: 1, donutRadius: 0.35, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(80)],
        startLife: new IntervalValue(0.4, 1.0), startSpeed: new IntervalValue(4, 16),
        startSize: new IntervalValue(0.3, 1.6),
        startColor: new ColorRange(new THREE.Vector4(1, 0.9, 0.35, 0.85), new THREE.Vector4(0.8, 0.5, 0.06, 0.4)),
        material: mat(0xffcc00), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[1, .9, .35, .85], [.7, .38, .05, .35], [0, 0, 0, 0]])), new RotationOverLife(new IntervalValue(-8, 8))],
    });
    return group(shockRing, explosion);
}

export function makeStampedeDust(): THREE.Group {
    const dust = new ParticleSystem({
        looping: false, duration: 0.12, worldSpace: true, maxParticle: 100,
        shape: new CircleEmitter({ radius: 0.55, arc: Math.PI * 2, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(100)],
        startLife: new IntervalValue(0.25, 0.8), startSpeed: new IntervalValue(1, 5.5),
        startSize: new IntervalValue(0.1, 0.55),
        startColor: new ColorRange(new THREE.Vector4(0.92, 0.78, 0.42, 0.8), new THREE.Vector4(0.6, 0.45, 0.2, 0.35)),
        material: mat(0xc8882a, false), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: true,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.92, .78, .42, .8], [.55, .4, .18, .3], [0, 0, 0, 0]])),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(0.5, 2.5), new ConstantValue(0))],
    });
    return group(dust);
}

// ─── FORGE-LINK CAST ─────────────────────────────────────────────────────────
// L1: plasma ring burst from caster
// L2: molten sparks arcing
export function makeForgeLinkCast(): THREE.Group {
    const plasmaRing = new ParticleSystem({
        looping: false, duration: 0.15, worldSpace: true, maxParticle: 250,
        shape: new DonutEmitter({ radius: 2.0, donutRadius: 0.3, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(250)],
        startLife: new IntervalValue(0.35, 1.0), startSpeed: new IntervalValue(3, 14),
        startSize: new IntervalValue(0.12, 0.75),
        startColor: new ColorRange(new THREE.Vector4(1, 0.55, 0.08, 1), new THREE.Vector4(1, 0.85, 0.25, 0.8)),
        material: mat(0xff8811), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[1, .55, .08, 1], [1, .75, .2, .7], [.5, .2, 0, 0]])),
        new RotationOverLife(new IntervalValue(-12, 12))],
    });
    const sparks = new ParticleSystem({
        looping: false, duration: 0.2, worldSpace: true, maxParticle: 200,
        shape: new SphereEmitter({ radius: 0.4, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(200)],
        startLife: new IntervalValue(0.2, 0.7), startSpeed: new IntervalValue(4, 18),
        startSize: new IntervalValue(0.03, 0.2),
        startColor: new ColorRange(new THREE.Vector4(1, 0.9, 0.4, 1), new THREE.Vector4(1, 0.5, 0.06, 0.75)),
        material: mat(0xffbb00), renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: { speedFactor: 1.6, lengthFactor: 4 }, autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[1, .9, .4, 1], [1, .45, .06, .65], [.3, .1, 0, 0]])),
        new ForceOverLife(new ConstantValue(0), new IntervalValue(-18, -6), new ConstantValue(0))],
    });
    return group(plasmaRing, sparks);
}

// ─── FORGE-LINK TETHER LOOP ──────────────────────────────────────────────────
export function makeForgeLinkTether(): THREE.Group {
    const orbitRing = new ParticleSystem({
        looping: true, duration: 1.4, worldSpace: false, maxParticle: 220,
        shape: new DonutEmitter({ radius: 1.25, donutRadius: 0.22, thickness: 0.95 }),
        emissionOverTime: new ConstantValue(150), emissionBursts: [],
        startLife: new IntervalValue(0.35, 1.0), startSpeed: new IntervalValue(1.2, 4.8),
        startSize: new IntervalValue(0.05, 0.22),
        startColor: new ColorRange(new THREE.Vector4(1, 0.78, 0.2, 0.85), new THREE.Vector4(1, 0.48, 0.08, 0.42)),
        material: mat(0xffa32a), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: false,
        behaviors: [
            new SizeOverLife(steadyFade()),
            new ColorOverLife(grad([[1, .78, .2, .85], [1, .48, .08, .42], [.28, .08, 0, 0]])),
            new OrbitOverLife(new IntervalValue(8, 16), new THREE.Vector3(0, 1, 0)),
        ],
    });
    const emberLift = new ParticleSystem({
        looping: true, duration: 1.2, worldSpace: false, maxParticle: 120,
        shape: new SphereEmitter({ radius: 0.6, thickness: 0.85 }),
        emissionOverTime: new ConstantValue(80), emissionBursts: [],
        startLife: new IntervalValue(0.35, 1.1), startSpeed: new IntervalValue(0.3, 1.9),
        startSize: new IntervalValue(0.04, 0.16),
        startColor: new ColorRange(new THREE.Vector4(1, 0.92, 0.4, 0.75), new THREE.Vector4(1, 0.55, 0.14, 0.3)),
        material: mat(0xffcc66), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: false,
        behaviors: [
            new SizeOverLife(steadyFade()),
            new ColorOverLife(grad([[1, .92, .4, .75], [1, .55, .14, .3], [0, 0, 0, 0]])),
            new ForceOverLife(new ConstantValue(0), new IntervalValue(0.6, 2.2), new ConstantValue(0)),
        ],
    });
    return group(orbitRing, emberLift);
}

// ─── FORGE-LINK HIT ──────────────────────────────────────────────────────────
export function makeForgeLinkHit(): THREE.Group {
    const sparks = new ParticleSystem({
        looping: false, duration: 0.08, worldSpace: true, maxParticle: 60,
        shape: new SphereEmitter({ radius: 0.2, thickness: 1 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(60)],
        startLife: new IntervalValue(0.1, 0.4), startSpeed: new IntervalValue(2, 10),
        startSize: new IntervalValue(0.03, 0.18),
        startColor: new ColorRange(new THREE.Vector4(1, 0.88, 0.35, 1), new THREE.Vector4(1, 0.55, 0.08, 0.65)),
        material: mat(0xffcc22), renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: { speedFactor: 1.5, lengthFactor: 2.5 }, autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[1, .88, .35, 1], [.9, .45, .06, .55], [0, 0, 0, 0]]))],
    });
    return group(sparks);
}

// ─── SKY-EYE RECON CAST ──────────────────────────────────────────────────────
// L1: silver-blue sensor rings expanding outward
// L2: data-stream ribbons shooting up
export function makeSkyEyeRecon(): THREE.Group {
    const sensorRings = new ParticleSystem({
        looping: false, duration: 0.2, worldSpace: true, maxParticle: 200,
        shape: new DonutEmitter({ radius: 1.2, donutRadius: 0.3, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(0), emissionBursts: [burst(200)],
        startLife: new IntervalValue(0.4, 1.2), startSpeed: new IntervalValue(4, 16),
        startSize: new IntervalValue(0.15, 0.85),
        startColor: new ColorRange(new THREE.Vector4(0.7, 0.9, 1, 0.9), new THREE.Vector4(0.2, 0.6, 1, 0.6)),
        material: mat(0x88ccff), renderMode: RenderMode.Mesh, instancingGeometry: ring(), autoDestroy: true,
        behaviors: [new SizeOverLife(growFade()), new ColorOverLife(grad([[.7, .9, 1, .9], [.2, .55, 1, .55], [0, .05, .2, 0]])),
        new RotationOverLife(new IntervalValue(-10, 10))],
    });
    const dataStreams = new ParticleSystem({
        looping: false, duration: 0.3, worldSpace: true, maxParticle: 150,
        shape: new SphereEmitter({ radius: 0.5, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(500), emissionBursts: [burst(50)],
        startLife: new IntervalValue(0.2, 0.7), startSpeed: new IntervalValue(5, 20),
        startSize: new IntervalValue(0.03, 0.15),
        startColor: new ColorRange(new THREE.Vector4(0.9, 0.98, 1, 0.9), new THREE.Vector4(0.4, 0.75, 1, 0.55)),
        material: mat(0xccf0ff), renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: { speedFactor: 1.5, lengthFactor: 4 }, autoDestroy: true,
        behaviors: [new ColorBySpeed(grad([[1, 1, 1, 1], [.4, .75, 1, .7], [.1, .3, .8, 0]]), new IntervalValue(5, 22)),
        new SpeedOverLife(new PiecewiseBezier([[new Bezier(1, 0.8, 0.5, 0.15), 1]]))],
    });
    return group(sensorRings, dataStreams);
}

// ─── SKY-EYE RECON SCAN LOOP ─────────────────────────────────────────────────
export function makeSkyEyeReconScan(): THREE.Group {
    const floorSweep = new ParticleSystem({
        looping: true, duration: 1.7, worldSpace: false, maxParticle: 260,
        shape: new CircleEmitter({ radius: 7.2, arc: Math.PI * 2, thickness: 0.1 }),
        emissionOverTime: new ConstantValue(152), emissionBursts: [],
        startLife: new IntervalValue(0.55, 1.8), startSpeed: new IntervalValue(0.05, 0.22),
        startSize: new IntervalValue(0.08, 0.42),
        startColor: new ColorRange(new THREE.Vector4(0.58, 0.92, 1, 0.56), new THREE.Vector4(0.16, 0.54, 0.95, 0.2)),
        material: mat(0x66bbff), renderMode: RenderMode.Mesh, instancingGeometry: disc(), autoDestroy: false,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.58, .92, 1, .56], [.16, .54, .95, .2], [0, 0, 0, 0]]))],
    });
    const scanColumn = new ParticleSystem({
        looping: true, duration: 1.2, worldSpace: false, maxParticle: 100,
        shape: new SphereEmitter({ radius: 1.2, thickness: 0.9 }),
        emissionOverTime: new ConstantValue(66), emissionBursts: [],
        startLife: new IntervalValue(0.25, 0.95), startSpeed: new IntervalValue(1.4, 4.8),
        startSize: new IntervalValue(0.04, 0.18),
        startColor: new ColorRange(new THREE.Vector4(0.85, 0.98, 1, 0.7), new THREE.Vector4(0.28, 0.7, 1, 0.2)),
        material: mat(0xa8e5ff), renderMode: RenderMode.StretchedBillBoard,
        rendererEmitterSettings: { speedFactor: 1.3, lengthFactor: 3.4 }, autoDestroy: false,
        behaviors: [new SizeOverLife(steadyFade()), new ColorOverLife(grad([[.85, .98, 1, .7], [.28, .7, 1, .2], [0, 0, 0, 0]]))],
    });
    return group(floorSweep, scanColumn);
}
