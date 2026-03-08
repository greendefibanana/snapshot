import * as THREE from 'three';
import type { Hardpoint, HardpointPlayer, Team } from '../types/HardpointSystem';
import type { HardpointSnapshot } from '../types/SignalProtocol';
import { ZoneVFXManager } from '../vfx/ZoneVFXManager';

interface HardpointRuntime {
    captureTeam: Team | null;
}

// ─── Drop marker tracking ──────────────────────────────────────
interface DropMarkerBundle {
    group: THREE.Group;
    mesh: THREE.Mesh;
    glowRing: THREE.Mesh;
    isGolden: boolean;
    elapsed: number;
    baseY: number;
}

// ─── Team hex colours ──────────────────────────────────────────
const TEAM_HEX = {
    blue: 0x1f7aff,
    red: 0xff3b30,
    neutral: 0x00ffaa,
    contested: 0xffdd00,
    inactive: 0x8b9bb4,
} as const;

const HARDPOINT_RADIUS = 8;
const CAPTURE_SECONDS = 3;
const ROTATE_SECONDS = 90;
const ROTATION_ORDER = ['hardpoint1', 'hardpoint2', 'hardpoint3'] as const;
const ALL_HARDPOINT_IDS = ['hardpoint1', 'hardpoint2', 'hardpoint3', 'hardpoint4'] as const;
const GROUND_Y = 0.1; // Hardpoints must sit on the floor, not scaled with map
const FALLBACK_POSITIONS: Record<string, { x: number; y: number; z: number }> = {
    hardpoint1: { x: -24, y: GROUND_Y, z: 0 },
    hardpoint2: { x: 0, y: GROUND_Y, z: 0 },
    hardpoint3: { x: 24, y: GROUND_Y, z: 0 },
    hardpoint4: { x: 0, y: GROUND_Y, z: 18 },
};

function toVec3(input: THREE.Vector3 | { x: number; y: number; z: number }): THREE.Vector3 {
    if (input instanceof THREE.Vector3) return input;
    return new THREE.Vector3(input.x, input.y, input.z);
}

function toHardpointSnapshot(hardpoint: Hardpoint): HardpointSnapshot {
    return {
        id: hardpoint.id,
        position: { x: hardpoint.position.x, y: hardpoint.position.y, z: hardpoint.position.z },
        radius: hardpoint.radius,
        owner: hardpoint.owner,
        isContested: hardpoint.isContested,
        isActive: hardpoint.isActive,
        captureProgress: hardpoint.captureProgress,
    };
}

export class HardpointManager {
    private hardpoints: Hardpoint[];
    private rotationTimer: number;
    private activeIndex: number;
    private readonly runtimeById: Record<string, HardpointRuntime> = {};
    private readonly zoneIndicatorsById: Record<string, THREE.Mesh> = {};
    private readonly pillarById: Record<string, THREE.Mesh> = {};
    private readonly captureRingById: Record<string, THREE.Mesh> = {};
    private suddenDeathActive = false;
    private rotationEnabled = true;
    private captureEnabled = true;
    private forceContestedActive = false;
    private visualTime = 0;
    private scene: THREE.Scene;
    private dropMarker: DropMarkerBundle | null = null;
    private vfxManager: ZoneVFXManager;

    constructor(
        scene: THREE.Scene,
        seedHardpoints?: Array<{ id: string; position: { x: number; y: number; z: number }; radius?: number }>,
    ) {
        this.scene = scene;
        this.rotationTimer = ROTATE_SECONDS;
        this.activeIndex = 0;
        this.vfxManager = new ZoneVFXManager(scene);
        this.hardpoints = seedHardpoints?.length
            ? this.createHardpointsFromPositions(seedHardpoints)
            : this.extractFromScene(scene);
        this.createZoneIndicators(scene);
        this.applyActiveFlags();
        // Create particle VFX for each hardpoint zone
        for (const hp of this.hardpoints) {
            this.vfxManager.createZoneVFX(hp.id, hp.position, hp.radius);
        }
    }

    /** Access the particle VFX manager */
    getVFXManager(): ZoneVFXManager {
        return this.vfxManager;
    }

    /** Clean up all resources */
    dispose(): void {
        this.removeDropMarker();
        for (const mesh of Object.values(this.zoneIndicatorsById)) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            if (mesh.material instanceof THREE.Material) mesh.material.dispose();
        }
        for (const mesh of Object.values(this.pillarById)) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            if (mesh.material instanceof THREE.Material) mesh.material.dispose();
        }
        for (const mesh of Object.values(this.captureRingById)) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            if (mesh.material instanceof THREE.Material) mesh.material.dispose();
        }
        this.vfxManager.dispose();
    }

    // ─── Drop marker API ────────────────────────────────────────

    /** Create a glowing octahedron at the drop position */
    createDropMarker(position: { x: number; y: number; z: number }, isGolden: boolean): void {
        this.removeDropMarker();

        const group = new THREE.Group();
        group.position.set(position.x, position.y + 1.5, position.z);

        // Main octahedron
        const geo = isGolden
            ? new THREE.IcosahedronGeometry(0.6, 1)
            : new THREE.OctahedronGeometry(0.45, 0);
        const mat = new THREE.MeshStandardMaterial({
            color: isGolden ? 0xffd700 : 0x00ffcc,
            emissive: isGolden ? 0xffa500 : 0x00cc99,
            emissiveIntensity: 1.5,
            metalness: 0.6,
            roughness: 0.2,
            transparent: true,
            opacity: 0.9,
            depthTest: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 1500;
        group.add(mesh);

        // Glow ring below
        const ringGeo = new THREE.RingGeometry(0.8, 1.2, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: isGolden ? 0xffd700 : 0x00ffaa,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
        });
        const glowRing = new THREE.Mesh(ringGeo, ringMat);
        glowRing.rotation.x = -Math.PI / 2;
        glowRing.position.y = -1.0;
        glowRing.renderOrder = 1505;
        group.add(glowRing);

        this.scene.add(group);
        this.dropMarker = { group, mesh, glowRing, isGolden, elapsed: 0, baseY: position.y + 1.5 };
    }

    /** Remove drop marker from scene */
    removeDropMarker(): void {
        if (!this.dropMarker) return;
        this.scene.remove(this.dropMarker.group);
        this.dropMarker.group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                if (child.material instanceof THREE.Material) child.material.dispose();
            }
        });
        this.dropMarker = null;
    }

    static fromPositions(
        positions: Array<{ id: string; position: { x: number; y: number; z: number }; radius?: number }>,
        scene?: THREE.Scene,
    ): HardpointManager {
        return new HardpointManager(scene ?? new THREE.Scene(), positions);
    }

    tick(dt: number, players: HardpointPlayer[]): void {
        this.visualTime += dt;
        if (!this.suddenDeathActive && this.rotationEnabled) {
            this.updateHardpointRotation(dt);
        }
        for (let i = 0; i < this.hardpoints.length; i++) {
            const hp = this.hardpoints[i]!;
            this.updateHardpointOwnership(hp, players, dt);
            this.updateHardpointVisuals(hp);
            // Sync particle VFX state with game state
            this.vfxManager.updateZoneState(hp.id, hp.owner as 'blue' | 'red' | null, hp.isContested, hp.isActive);
        }
        this.animateDropMarker(dt);
        this.vfxManager.update(dt);
    }

    /** Animate the drop marker: bob + spin */
    private animateDropMarker(dt: number): void {
        if (!this.dropMarker) return;
        this.dropMarker.elapsed += dt;
        const t = this.dropMarker.elapsed;
        // Bob up/down using absolute position relative to baseY
        this.dropMarker.group.position.y = this.dropMarker.baseY + Math.sin(t * 2.5) * 0.25;
        // Spin
        this.dropMarker.mesh.rotation.y += dt * 1.2;
        this.dropMarker.mesh.rotation.x += dt * 0.3;
        // Glow ring pulse
        const ringScale = 1 + Math.sin(t * 3) * 0.15;
        this.dropMarker.glowRing.scale.set(ringScale, ringScale, ringScale);
        const ringMat = this.dropMarker.glowRing.material as THREE.MeshBasicMaterial;
        ringMat.opacity = 0.35 + Math.sin(t * 4) * 0.15;
    }

    getActiveHardpoint(): Hardpoint | null {
        for (let i = 0; i < this.hardpoints.length; i++) {
            const hp = this.hardpoints[i]!;
            if (hp.isActive) return hp;
        }
        return null;
    }

    getHardpointById(id: string): Hardpoint | null {
        for (let i = 0; i < this.hardpoints.length; i++) {
            const hp = this.hardpoints[i]!;
            if (hp.id === id) return hp;
        }
        return null;
    }

    getHardpoints(): Hardpoint[] {
        return this.hardpoints.slice();
    }

    getSnapshots(): HardpointSnapshot[] {
        return this.hardpoints.map(toHardpointSnapshot);
    }

    getRotationTimerSeconds(): number {
        return Math.max(0, this.rotationTimer);
    }

    setRotationEnabled(enabled: boolean): void {
        this.rotationEnabled = enabled;
    }

    setCaptureEnabled(enabled: boolean): void {
        this.captureEnabled = enabled;
    }

    setActiveHardpointById(id: string): void {
        for (let i = 0; i < this.hardpoints.length; i++) {
            const hp = this.hardpoints[i]!;
            hp.isActive = hp.id === id;
            this.updateHardpointVisuals(hp);
        }
    }

    clearHardpointControlState(hardpointId: string): void {
        const hp = this.getHardpointById(hardpointId);
        if (!hp) return;
        hp.owner = null;
        hp.isContested = false;
        hp.captureProgress = 0;
        this.runtimeById[hardpointId] = { captureTeam: null };
        this.updateHardpointVisuals(hp);
    }

    clearAllHardpointControlStates(): void {
        for (let i = 0; i < this.hardpoints.length; i++) {
            this.clearHardpointControlState(this.hardpoints[i]!.id);
        }
    }

    toggleForcedContested(): boolean {
        this.forceContestedActive = !this.forceContestedActive;
        return this.forceContestedActive;
    }

    setForcedContested(active: boolean): void {
        this.forceContestedActive = active;
    }

    isForcedContested(): boolean {
        return this.forceContestedActive;
    }

    forceSetOwner(hardpointId: string, owner: Team | null): void {
        const hp = this.getHardpointById(hardpointId);
        if (!hp) return;
        hp.owner = owner;
        hp.captureProgress = owner ? 1 : 0;
        hp.isContested = false;
        this.runtimeById[hardpointId] = { captureTeam: null };
        this.updateHardpointVisuals(hp);
    }

    rotateNow(): void {
        if (this.suddenDeathActive) return;
        this.activeIndex = (this.activeIndex + 1) % ROTATION_ORDER.length;
        this.rotationTimer = ROTATE_SECONDS;
        this.applyActiveFlags();
    }

    activateSuddenDeathHardpoint(): void {
        this.suddenDeathActive = true;
        for (let i = 0; i < this.hardpoints.length; i++) {
            const hp = this.hardpoints[i]!;
            hp.isActive = hp.id === 'hardpoint4';
            this.updateHardpointVisuals(hp);
        }
    }

    deactivateSuddenDeathHardpoint(): void {
        this.suddenDeathActive = false;
        this.applyActiveFlags();
    }

    private extractFromScene(scene: THREE.Scene): Hardpoint[] {
        const found: Hardpoint[] = [];
        const byNameLower = new Map<string, THREE.Object3D>();
        scene.traverse((obj) => {
            const key = (obj.name || '').trim().toLowerCase();
            if (!key || byNameLower.has(key)) return;
            byNameLower.set(key, obj);
        });

        for (const id of ALL_HARDPOINT_IDS) {
            const mesh = scene.getObjectByName(id) ?? byNameLower.get(id);
            if (!mesh) continue;
            const worldPos = new THREE.Vector3();
            mesh.getWorldPosition(worldPos);
            // Ground the Y position — the map is scaled 3x which inflates
            // hardpoint mesh Y coords into the sky. Zones must be on the floor.
            found.push({
                id,
                position: worldPos,
                radius: HARDPOINT_RADIUS,
                owner: null,
                isContested: false,
                isActive: false,
                captureProgress: 0,
                mesh,
            });
            this.runtimeById[id] = { captureTeam: null };
        }

        for (const id of ALL_HARDPOINT_IDS) {
            const exists = found.some((hp) => hp.id === id);
            if (exists) continue;
            const fallback = FALLBACK_POSITIONS[id]!;
            const marker = new THREE.Object3D();
            marker.name = id;
            marker.position.set(fallback.x, fallback.y, fallback.z);
            found.push({
                id,
                position: marker.position.clone(),
                radius: HARDPOINT_RADIUS,
                owner: null,
                isContested: false,
                isActive: false,
                captureProgress: 0,
                mesh: marker,
            });
            this.runtimeById[id] = { captureTeam: null };
        }

        return found;
    }

    private createHardpointsFromPositions(positions: Array<{ id: string; position: { x: number; y: number; z: number }; radius?: number }>): Hardpoint[] {
        const hardpoints: Hardpoint[] = [];
        for (const entry of positions) {
            const y = Number.isFinite(entry.position.y) ? entry.position.y : GROUND_Y;
            const marker = new THREE.Object3D();
            marker.name = entry.id;
            marker.position.set(entry.position.x, y, entry.position.z);
            hardpoints.push({
                id: entry.id,
                position: new THREE.Vector3(entry.position.x, y, entry.position.z),
                radius: Number(entry.radius ?? HARDPOINT_RADIUS),
                owner: null,
                isContested: false,
                isActive: false,
                captureProgress: 0,
                mesh: marker,
            });
            this.runtimeById[entry.id] = { captureTeam: null };
        }
        return hardpoints;
    }

    private applyActiveFlags(): void {
        let activeId = ROTATION_ORDER[this.activeIndex];
        const hasActiveId = this.hardpoints.some((hp) => hp.id === activeId);
        if (!hasActiveId) {
            for (let i = 0; i < ROTATION_ORDER.length; i++) {
                const candidate = ROTATION_ORDER[i]!;
                if (this.hardpoints.some((hp) => hp.id === candidate)) {
                    this.activeIndex = i;
                    activeId = candidate;
                    break;
                }
            }
        }
        for (let i = 0; i < this.hardpoints.length; i++) {
            const hp = this.hardpoints[i]!;
            hp.isActive = hp.id === activeId;
            this.updateHardpointVisuals(hp);
        }
    }

    private updateHardpointRotation(dt: number): void {
        this.rotationTimer -= dt;
        if (this.rotationTimer > 0) return;
        this.activeIndex = (this.activeIndex + 1) % ROTATION_ORDER.length;
        this.rotationTimer = ROTATE_SECONDS;
        this.applyActiveFlags();
    }

    private updateHardpointOwnership(hardpoint: Hardpoint, players: HardpointPlayer[], dt: number): void {
        if (!hardpoint.isActive) {
            hardpoint.isContested = false;
            hardpoint.captureProgress = 0;
            this.runtimeById[hardpoint.id] = { captureTeam: null };
            return;
        }
        if (!this.captureEnabled) {
            hardpoint.isContested = false;
            hardpoint.captureProgress = 0;
            this.runtimeById[hardpoint.id] = { captureTeam: null };
            return;
        }
        if (this.forceContestedActive) {
            hardpoint.isContested = true;
            hardpoint.captureProgress = 0;
            this.runtimeById[hardpoint.id] = { captureTeam: null };
            return;
        }
        const inZone = players.filter((player) => {
            if (!player.isAlive) return false;
            const p = toVec3(player.position);
            const dx = p.x - hardpoint.position.x;
            const dz = p.z - hardpoint.position.z;
            return (dx * dx + dz * dz) < (hardpoint.radius * hardpoint.radius);
        });

        let blueCount = 0;
        let redCount = 0;
        for (let i = 0; i < inZone.length; i++) {
            const p = inZone[i]!;
            if (p.team === 'blue') blueCount++;
            else redCount++;
        }

        if (blueCount > 0 && redCount > 0) {
            hardpoint.isContested = true;
            hardpoint.captureProgress = 0;
            this.runtimeById[hardpoint.id] = { captureTeam: null };
            return;
        }

        if (blueCount > 0 && redCount === 0) {
            this.captureForTeam(hardpoint, 'blue', dt);
            return;
        }

        if (redCount > 0 && blueCount === 0) {
            this.captureForTeam(hardpoint, 'red', dt);
            return;
        }

        hardpoint.isContested = false;
        // No players in zone: pause capture/ownership as-is so re-entry can continue.
    }

    private captureForTeam(hardpoint: Hardpoint, team: Team, dt: number): void {
        hardpoint.isContested = false;
        if (hardpoint.owner === team) {
            hardpoint.captureProgress = 1;
            this.runtimeById[hardpoint.id] = { captureTeam: team };
            return;
        }

        const runtime = this.runtimeById[hardpoint.id] ?? { captureTeam: null };
        if (runtime.captureTeam !== team) {
            hardpoint.captureProgress = 0;
            runtime.captureTeam = team;
        }

        hardpoint.captureProgress += dt / CAPTURE_SECONDS;
        if (hardpoint.captureProgress >= 1) {
            hardpoint.owner = team;
            hardpoint.captureProgress = 1;
        }
        this.runtimeById[hardpoint.id] = runtime;
    }

    private updateHardpointVisuals(hardpoint: Hardpoint): void {
        const mesh = hardpoint.mesh as THREE.Object3D & {
            material?: { color?: { setHex: (hex: number) => void } };
        };
        const zoneRing = this.zoneIndicatorsById[hardpoint.id];
        const pillar = this.pillarById[hardpoint.id];
        const captureRing = this.captureRingById[hardpoint.id];

        // ── Inactive zones: hide everything ──────────────────────
        if (!hardpoint.isActive) {
            if (zoneRing) zoneRing.visible = false;
            if (pillar) pillar.visible = false;
            if (captureRing) captureRing.visible = false;
            if (mesh.material?.color) mesh.material.color.setHex(0x808080);
            mesh.scale.set(1, 1, 1);
            return;
        }

        // ── Active zone only ─────────────────────────────────────
        if (mesh.material?.color) {
            if (hardpoint.isContested) {
                const flashOn = Math.floor(this.visualTime * 6) % 2 === 0;
                mesh.material.color.setHex(flashOn ? TEAM_HEX.contested : 0xffffff);
            } else if (hardpoint.owner === 'blue') {
                mesh.material.color.setHex(TEAM_HEX.blue);
            } else if (hardpoint.owner === 'red') {
                mesh.material.color.setHex(TEAM_HEX.red);
            } else {
                mesh.material.color.setHex(TEAM_HEX.neutral);
            }
        }
        mesh.scale.set(1.2, 1.2, 1.2);

        // ── Ring (active zone only) ──────────────────────────────
        if (zoneRing) {
            zoneRing.visible = true;
            const mat = zoneRing.material as THREE.MeshBasicMaterial;
            if (hardpoint.isContested) {
                const flashOn = Math.floor(this.visualTime * 6) % 2 === 0;
                mat.color.setHex(flashOn ? TEAM_HEX.contested : 0xffffff);
                mat.opacity = 0.55;
            } else if (hardpoint.owner === 'blue') {
                mat.color.setHex(TEAM_HEX.blue);
                mat.opacity = 0.45;
            } else if (hardpoint.owner === 'red') {
                mat.color.setHex(TEAM_HEX.red);
                mat.opacity = 0.45;
            } else {
                mat.color.setHex(TEAM_HEX.neutral);
                mat.opacity = 0.4;
            }
            const pulse = 1 + Math.sin(this.visualTime * 4) * 0.12;
            zoneRing.scale.set(pulse, pulse, pulse);
        }

        // ── Pillar (active zone, owned) ──────────────────────────
        if (pillar) {
            const pMat = pillar.material as THREE.MeshBasicMaterial;
            if (hardpoint.owner && !hardpoint.isContested) {
                pillar.visible = true;
                pMat.color.setHex(hardpoint.owner === 'blue' ? TEAM_HEX.blue : TEAM_HEX.red);
                pMat.opacity = 0.18;
                const pPulse = 1 + Math.sin(this.visualTime * 3) * 0.03;
                pillar.scale.set(pPulse, 1, pPulse);
            } else if (hardpoint.isContested) {
                pillar.visible = true;
                const flashOn = Math.floor(this.visualTime * 8) % 2 === 0;
                pMat.color.setHex(flashOn ? TEAM_HEX.contested : 0x000000);
                pMat.opacity = 0.12;
            } else {
                pillar.visible = false;
            }
        }

        // ── Capture progress ring (active zone, mid-capture) ────
        if (captureRing) {
            if (hardpoint.captureProgress > 0 && hardpoint.captureProgress < 1 && !hardpoint.isContested) {
                captureRing.visible = true;
                const cMat = captureRing.material as THREE.MeshBasicMaterial;
                const captureTeam = this.runtimeById[hardpoint.id]?.captureTeam;
                cMat.color.setHex(captureTeam === 'blue' ? TEAM_HEX.blue : captureTeam === 'red' ? TEAM_HEX.red : TEAM_HEX.neutral);
                cMat.opacity = 0.5;
                const s = hardpoint.captureProgress;
                captureRing.scale.set(s, s, s);
            } else {
                captureRing.visible = false;
            }
        }
    }

    private createZoneIndicators(scene: THREE.Scene): void {
        for (let i = 0; i < this.hardpoints.length; i++) {
            const hp = this.hardpoints[i]!;

            // ── Zone ring — visible boundary ────────────────────
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(hp.radius - 0.35, hp.radius, 72),
                new THREE.MeshBasicMaterial({
                    color: TEAM_HEX.inactive,
                    transparent: true,
                    opacity: 0.4,
                    side: THREE.DoubleSide,
                    depthTest: false,
                    depthWrite: false,
                })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(hp.position.x, hp.position.y + 0.05, hp.position.z);
            ring.renderOrder = 1400;
            ring.visible = false; // hidden until zone becomes active
            scene.add(ring);
            this.zoneIndicatorsById[hp.id] = ring;

            // ── Team pillar — transparent column on ownership ───
            const pillarGeo = new THREE.CylinderGeometry(hp.radius * 0.85, hp.radius * 0.85, 12, 32, 1, true);
            const pillarMat = new THREE.MeshBasicMaterial({
                color: TEAM_HEX.inactive,
                transparent: true,
                opacity: 0,
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            });
            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            pillar.position.set(hp.position.x, hp.position.y + 6, hp.position.z);
            pillar.renderOrder = 1300;
            pillar.visible = false;
            scene.add(pillar);
            this.pillarById[hp.id] = pillar;

            // ── Capture progress ring — grows from center ───────
            const capRing = new THREE.Mesh(
                new THREE.RingGeometry(hp.radius * 0.3, hp.radius * 0.65, 48),
                new THREE.MeshBasicMaterial({
                    color: TEAM_HEX.neutral,
                    transparent: true,
                    opacity: 0.5,
                    side: THREE.DoubleSide,
                    depthTest: false,
                    depthWrite: false,
                })
            );
            capRing.rotation.x = -Math.PI / 2;
            capRing.position.set(hp.position.x, hp.position.y + 0.08, hp.position.z);
            capRing.renderOrder = 1450;
            capRing.visible = false;
            scene.add(capRing);
            this.captureRingById[hp.id] = capRing;
        }
    }
}
