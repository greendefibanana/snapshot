import * as THREE from 'three';
import type { EntityId } from '@snapshot/shared';
import { ABILITY_VFX_MAP } from './AbilityVfxMap';
import type { AbilityCastPayload, AbilityRuntime } from './AbilityRuntime';
import type { AbilitiesEventBus } from './EventBus';
import type { TeamId } from './GameEvents';
import type { VfxLoopHandle, VfxSystem } from '../game/vfx/VfxSystem';
import { ABILITIES_TUNING } from './AbilityTuning';


type TeamLoopAnchor = {
    teamId: TeamId;
    object: THREE.Object3D;
    handle: VfxLoopHandle;
    followPlayerId?: EntityId;
    alignToForward?: boolean;
};

type PlayerLoopRecord = {
    key: string;
    playerId: EntityId;
    anchor: THREE.Object3D;
    handle: VfxLoopHandle;
    remainingSec: number;
};

type ScheduledOneShot = {
    key: string;
    fireAtSec: number;
    position: { x: number; y: number; z: number };
};

export class AbilityVfxBindings {
    private readonly unsubs: Array<() => void> = [];
    private readonly buffLoopHandles = new Map<string, TeamLoopAnchor>();
    private readonly deployLoopHandles = new Map<string, { handle: VfxLoopHandle; anchor: THREE.Object3D }>();
    private readonly temporaryPlayerLoops = new Map<string, PlayerLoopRecord>();
    private readonly herdAuraLoops = new Map<string, { teamId: TeamId; playerId: EntityId; anchor: THREE.Object3D; handle: VfxLoopHandle }>();
    private readonly herdTrailTimers = new Map<TeamId, { accSec: number; lastPos: Map<number, { x: number; y: number; z: number }> }>();
    private readonly forgeAuraLoops = new Map<string, { teamId: TeamId; playerId: EntityId; anchor: THREE.Object3D; handle: VfxLoopHandle }>();
    private readonly scrapPulseAtByTeam = new Map<TeamId, number>();
    private readonly scheduledOneShots: ScheduledOneShot[] = [];
    private forgeTetherMesh: THREE.LineSegments | null = null;
    private forgeTetherGlowMesh: THREE.LineSegments | null = null;
    private forgeTetherTeam: TeamId | null = null;
    private forgeEmberTimeSec = 0;
    private forgeNextEmberAt = 0;
    private elapsedSec = 0;

    constructor(
        private readonly eventBus: AbilitiesEventBus,
        private readonly runtime: AbilityRuntime,
        private readonly vfx: VfxSystem,
        private readonly scene: THREE.Scene
    ) { }

    async init(): Promise<void> {
        // ── Register AAA programmatic multi-layer factories ───────────────────
        const E = await import('../game/vfx/AbilityVfxEffects');
        this.vfx.registerPrefabFactory('seismic_slam', () => E.makeSlamEffect());
        this.vfx.registerPrefabFactory('iron_fortress_dome', () => E.makeIronFortressDome());
        this.vfx.registerPrefabFactory('iron_fortress_dome_loop', () => E.makeIronFortressLoop());
        this.vfx.registerPrefabFactory('iron_fortress_block', () => E.makeIronFortressBlock());
        this.vfx.registerPrefabFactory('gale_force', () => E.makeGaleForce());
        this.vfx.registerPrefabFactory('gale_force_hit', () => E.makeGaleForceHit());
        this.vfx.registerPrefabFactory('sky_fire_telegraph', () => E.makeSkyFireTelegraph());
        this.vfx.registerPrefabFactory('sky_fire_impact', () => E.makeSkyFireImpact());
        this.vfx.registerPrefabFactory('shadow_leap_depart', () => E.makeShadowLeapDepart());
        this.vfx.registerPrefabFactory('shadow_leap_arrive', () => E.makeShadowLeapArrive());
        this.vfx.registerPrefabFactory('shadow_form', () => E.makeShadowForm());
        this.vfx.registerPrefabFactory('basilisk_pulse', () => E.makeBasiliskPulse());
        this.vfx.registerPrefabFactory('basilisk_gaze', () => E.makeBasiliskGazeHit());
        this.vfx.registerPrefabFactory('battering_ram_charge', () => E.makeBatteringRamCharge());
        this.vfx.registerPrefabFactory('battering_ram_impact', () => E.makeBatteringRamImpact());
        this.vfx.registerPrefabFactory('unstoppable_herd', () => E.makeUnstoppableHerd());
        this.vfx.registerPrefabFactory('unstoppable_herd_aura', () => E.makeUnstoppableHerdAura());
        this.vfx.registerPrefabFactory('unstoppable_herd_dust', () => E.makeUnstoppableHerdDust());
        this.vfx.registerPrefabFactory('neuro_toxin', () => E.makeNeuroToxin());
        this.vfx.registerPrefabFactory('neuro_toxin_fog', () => E.makeNeuroToxinFog());
        this.vfx.registerPrefabFactory('neuro_toxin_tick', () => E.makeNeuroToxinTick());
        this.vfx.registerPrefabFactory('scrap_magnet', () => E.makeScrapMagnet());
        this.vfx.registerPrefabFactory('scrap_magnet_pull', () => E.makeScrapMagnetPull());
        this.vfx.registerPrefabFactory('scrap_magnet_hit', () => E.makeScrapMagnetHit());
        this.vfx.registerPrefabFactory('junk_turret_deploy', () => E.makeJunkTurretDeploy());
        this.vfx.registerPrefabFactory('junk_turret_idle', () => E.makeJunkTurretIdle());
        this.vfx.registerPrefabFactory('junk_turret_shot', () => E.makeJunkTurretShot());
        this.vfx.registerPrefabFactory('scavengers_feast', () => E.makeScavengersFeast());
        this.vfx.registerPrefabFactory('scavengers_feast_zone', () => E.makeScavengersFeastZone());
        this.vfx.registerPrefabFactory('stampede_overdrive', () => E.makeStampedeOverdrive());
        this.vfx.registerPrefabFactory('stampede_aura', () => E.makeStampedeAura());
        this.vfx.registerPrefabFactory('stampede_impact', () => E.makeStampedeImpact());
        this.vfx.registerPrefabFactory('stampede_dust', () => E.makeStampedeDust());
        this.vfx.registerPrefabFactory('forge_link', () => E.makeForgeLinkCast());
        this.vfx.registerPrefabFactory('forge_link_tether', () => E.makeForgeLinkTether());
        this.vfx.registerPrefabFactory('forge_link_hit', () => E.makeForgeLinkHit());
        this.vfx.registerPrefabFactory('sky_eye_recon', () => E.makeSkyEyeRecon());
        this.vfx.registerPrefabFactory('sky_eye_recon_scan', () => E.makeSkyEyeReconScan());
        this.bindEvents();
    }


    update(dt: number): void {
        this.elapsedSec += dt;
        this.forgeEmberTimeSec += dt;
        for (const loop of this.buffLoopHandles.values()) {
            if (loop.followPlayerId !== undefined) {
                const pos = this.runtime.getPlayerPosition(loop.followPlayerId);
                if (pos) loop.object.position.set(pos.x, pos.y, pos.z);
                if (loop.alignToForward) {
                    const fwd = this.runtime.getPlayerForward(loop.followPlayerId);
                    if (fwd) {
                        const yaw = Math.atan2(fwd.x, fwd.z);
                        loop.object.rotation.set(0, yaw, 0);
                    }
                }
                continue;
            }
            const center = this.runtime.getTeamCenter(loop.teamId);
            loop.object.position.set(center.x, center.y, center.z);
        }
        for (const [deployableId, loop] of this.deployLoopHandles) {
            const pos = this.runtime.getDeployablePosition(deployableId);
            if (!pos) continue;
            loop.anchor.position.set(pos.x, pos.y, pos.z);
        }
        this.updateTemporaryPlayerLoops(dt);
        this.updateUnstoppableHerd(dt);
        this.updateForgeLinkAuras();
        this.updateScheduledOneShots();
        this.updateForgeLinkTether();
        this.updateScrapMagnetPulse();
    }

    dispose(): void {
        for (const off of this.unsubs) off();
        this.unsubs.length = 0;
        for (const entry of this.buffLoopHandles.values()) {
            this.vfx.stop(entry.handle);
            this.scene.remove(entry.object);
        }
        this.buffLoopHandles.clear();
        for (const entry of this.deployLoopHandles.values()) {
            this.vfx.stop(entry.handle);
            this.scene.remove(entry.anchor);
        }
        this.deployLoopHandles.clear();
        for (const loop of this.temporaryPlayerLoops.values()) {
            this.vfx.stop(loop.handle);
            this.scene.remove(loop.anchor);
        }
        this.temporaryPlayerLoops.clear();
        this.clearAllUnstoppableLoops();
        this.clearForgeLinkAuras();
        this.destroyForgeTether();
        this.scrapPulseAtByTeam.clear();
    }

    private bindEvents(): void {
        this.unsubs.push(this.eventBus.on('ABILITY_CAST', ({ casterId, abilityKey, payload }) => {
            const map = ABILITY_VFX_MAP[abilityKey];
            const casterPos = this.runtime.getPlayerPosition(casterId);

            if (abilityKey === 'SKY_FIRE_STRIKE') {
                const targets = this.runtime.getSkyFireStrikeTargets(casterId, payload as AbilityCastPayload | undefined);
                for (const p of targets) {
                    this.vfx.playOneShot('sky_fire_telegraph_circle', p);
                    this.scheduledOneShots.push({
                        key: 'sky_fire_beam_strike',
                        fireAtSec: this.elapsedSec + ABILITIES_TUNING.ABILITY.SKY_FIRE_STRIKE.delaySec,
                        position: p,
                    });
                    this.scheduleSkyFireThermiteRain(p, ABILITIES_TUNING.ABILITY.SKY_FIRE_STRIKE.delaySec);
                }
            }

            if (abilityKey === 'SHADOW_LEAP') {
                this.startTemporaryPlayerLoop('shadow_leap_trail', casterId, ABILITIES_TUNING.ABILITY.SHADOW_LEAP.shadowFormSec);
            }
            if (abilityKey === 'BATTERING_RAM') {
                this.startTemporaryPlayerLoop('battering_ram_speed_lines', casterId, 0.35);
            }

            const vfxCast = map.vfxCast;
            if (vfxCast && casterPos) this.vfx.playOneShot(vfxCast, casterPos);
            if (map.vfxTrail && casterPos && abilityKey !== 'SHADOW_LEAP') this.vfx.playOneShot(map.vfxTrail, casterPos);
        }));

        this.unsubs.push(this.eventBus.on('ABILITY_HIT', ({ targetId, abilityKey }) => {
            const vfxHit = ABILITY_VFX_MAP[abilityKey].vfxHit;
            if (vfxHit) {
                const pos = this.runtime.getPlayerPosition(targetId);
                if (pos) this.vfx.playOneShot(vfxHit, pos);
            }
            if (abilityKey === 'BASILISK_GAZE') {
                this.eventBus.emit('VFX_TAG', {
                    tag: 'BASILISK_AFFECTED_MARKER',
                    targetId,
                    durationSec: ABILITIES_TUNING.ABILITY.BASILISK_GAZE.freezeSec + ABILITIES_TUNING.ABILITY.BASILISK_GAZE.slowSec,
                });
            }
        }));

        this.unsubs.push(this.eventBus.on('BUFF_START', ({ teamId, abilityKey }) => {
            const loopKey = `${teamId}:${abilityKey}`;
            const existing = this.buffLoopHandles.get(loopKey);
            if (existing) {
                this.vfx.stop(existing.handle);
                this.scene.remove(existing.object);
                this.buffLoopHandles.delete(loopKey);
            }

            if (abilityKey === 'UNSTOPPABLE_HERD') {
                this.rebuildUnstoppableLoops(teamId);
                this.herdTrailTimers.set(teamId, { accSec: 0, lastPos: new Map() });
            } else {
                const vfxLoop = abilityKey === 'FORGE_LINK' ? null : ABILITY_VFX_MAP[abilityKey].vfxLoop;
                if (vfxLoop) {
                    const anchor = new THREE.Object3D();
                    const center = this.runtime.getTeamCenter(teamId);
                    anchor.position.set(center.x, center.y, center.z);
                    this.scene.add(anchor);
                    const handle = this.vfx.startLoop(vfxLoop, anchor);
                    const sourceId = (abilityKey === 'SCRAP_MAGNET' || abilityKey === 'IRON_FORTRESS')
                        ? this.runtime.getBuffSourcePlayer(teamId, abilityKey)
                        : null;
                    if (sourceId) {
                        this.buffLoopHandles.set(loopKey, {
                            teamId,
                            object: anchor,
                            handle,
                            followPlayerId: sourceId,
                            alignToForward: abilityKey === 'IRON_FORTRESS',
                        });
                    } else {
                        this.buffLoopHandles.set(loopKey, { teamId, object: anchor, handle });
                    }
                }
            }

            if (abilityKey === 'FORGE_LINK') {
                this.forgeTetherTeam = teamId;
                this.ensureForgeTether();
                this.rebuildForgeLinkAuras(teamId);
            }
            if (abilityKey === 'SCRAP_MAGNET') {
                this.scrapPulseAtByTeam.set(teamId, this.elapsedSec);
            }
        }));

        this.unsubs.push(this.eventBus.on('BUFF_END', ({ teamId, abilityKey }) => {
            const loopKey = `${teamId}:${abilityKey}`;
            const existing = this.buffLoopHandles.get(loopKey);
            if (existing) {
                this.vfx.stop(existing.handle);
                this.scene.remove(existing.object);
                this.buffLoopHandles.delete(loopKey);
            }
            if (abilityKey === 'UNSTOPPABLE_HERD') {
                this.clearUnstoppableTeamLoops(teamId);
                this.herdTrailTimers.delete(teamId);
            }
            if (abilityKey === 'FORGE_LINK' && this.forgeTetherTeam === teamId) {
                this.forgeTetherTeam = null;
                this.clearForgeLinkAuras(teamId);
                this.destroyForgeTether();
            }
            if (abilityKey === 'SCRAP_MAGNET') {
                this.scrapPulseAtByTeam.delete(teamId);
            }
        }));

        this.unsubs.push(this.eventBus.on('DEPLOYABLE_SPAWN', ({ deployableId, abilityKey, ownerId }) => {
            const position = this.runtime.getDeployablePosition(deployableId) ?? this.runtime.getPlayerPosition(ownerId);
            if (!position) return;

            const vfxCast = ABILITY_VFX_MAP[abilityKey].vfxCast;
            if (vfxCast) this.vfx.playOneShot(vfxCast, position);

            if (abilityKey === 'JUNK_TURRET' || abilityKey === 'NEURO_TOXIN_CLOUD') {
                const vfxLoop = ABILITY_VFX_MAP[abilityKey].vfxLoop;
                if (!vfxLoop) return;
                const anchor = new THREE.Object3D();
                anchor.position.set(position.x, position.y, position.z);
                this.scene.add(anchor);
                const handle = this.vfx.startLoop(vfxLoop, anchor);
                this.deployLoopHandles.set(deployableId, { handle, anchor });
            }
        }));

        this.unsubs.push(this.eventBus.on('DEPLOYABLE_DESPAWN', ({ deployableId }) => {
            const entry = this.deployLoopHandles.get(deployableId);
            if (!entry) return;
            this.vfx.stop(entry.handle);
            this.scene.remove(entry.anchor);
            this.deployLoopHandles.delete(deployableId);
        }));

        this.unsubs.push(this.eventBus.on('SCRAP_MAGNET_TOKEN_PULL', ({ startPos, endPos }) => {
            this.vfx.playOneShot('scrap_magnet_token_pull', startPos);
            this.vfx.playOneShot('scrap_magnet_hit', endPos);
        }));

        this.unsubs.push(this.eventBus.on('FORGE_LINK_SHARED_DAMAGE', ({ targetId, sharedDamage }) => {
            const pos = this.runtime.getPlayerPosition(targetId);
            if (!pos) return;
            this.vfx.playOneShot('vfx_forge_link_impact', pos);
            if (!this.forgeTetherTeam) return;
            const segments = this.runtime.getForgeLinkSegments(this.forgeTetherTeam);
            for (const s of segments) {
                const mid = {
                    x: (s.aPos.x + s.bPos.x) * 0.5,
                    y: (s.aPos.y + s.bPos.y) * 0.5,
                    z: (s.aPos.z + s.bPos.z) * 0.5,
                };
                this.vfx.playOneShot('vfx_forge_link_impact', mid);
            }
            if (sharedDamage > 0) {
                for (const s of segments) {
                    const pulse = {
                        x: s.aPos.x + (s.bPos.x - s.aPos.x) * 0.33,
                        y: s.aPos.y + 0.8 + (s.bPos.y - s.aPos.y) * 0.33,
                        z: s.aPos.z + (s.bPos.z - s.aPos.z) * 0.33,
                    };
                    this.vfx.playOneShot('vfx_forge_link_trail', pulse);
                }
            }
        }));
    }

    private startTemporaryPlayerLoop(key: string, playerId: EntityId, durationSec: number): void {
        const id = `${key}:${playerId}`;
        const prev = this.temporaryPlayerLoops.get(id);
        if (prev) {
            this.vfx.stop(prev.handle);
            this.scene.remove(prev.anchor);
            this.temporaryPlayerLoops.delete(id);
        }
        const pos = this.runtime.getPlayerPosition(playerId);
        if (!pos) return;
        const anchor = new THREE.Object3D();
        anchor.position.set(pos.x, pos.y, pos.z);
        this.scene.add(anchor);
        const handle = this.vfx.startLoop(key, anchor);
        this.temporaryPlayerLoops.set(id, { key, playerId, anchor, handle, remainingSec: durationSec });
    }

    private updateTemporaryPlayerLoops(dt: number): void {
        for (const [id, loop] of this.temporaryPlayerLoops) {
            loop.remainingSec -= dt;
            const pos = this.runtime.getPlayerPosition(loop.playerId);
            if (pos) loop.anchor.position.set(pos.x, pos.y, pos.z);
            if (loop.remainingSec > 0) continue;
            this.vfx.stop(loop.handle);
            this.scene.remove(loop.anchor);
            this.temporaryPlayerLoops.delete(id);
        }
    }

    private updateScheduledOneShots(): void {
        for (let i = this.scheduledOneShots.length - 1; i >= 0; i--) {
            const entry = this.scheduledOneShots[i]!;
            if (entry.fireAtSec > this.elapsedSec) continue;
            this.vfx.playOneShot(entry.key, entry.position);
            this.scheduledOneShots.splice(i, 1);
        }
    }

    private scheduleSkyFireThermiteRain(target: { x: number; y: number; z: number }, delaySec: number): void {
        const ringRadius = ABILITIES_TUNING.ABILITY.SKY_FIRE_STRIKE.outerRadiusM;
        const impacts = 10;
        for (let i = 0; i < impacts; i++) {
            const angle = (i * 2.399963229728653) % (Math.PI * 2);
            const band = i % 3;
            const radius = 0.8 + ((ringRadius - 0.8) * (band / 2));
            this.scheduledOneShots.push({
                key: 'sky_fire_thermite_rain',
                fireAtSec: this.elapsedSec + delaySec + (i * 0.09),
                position: {
                    x: target.x + Math.cos(angle) * radius,
                    y: target.y + 6.2,
                    z: target.z + Math.sin(angle) * radius,
                },
            });
        }
    }

    private rebuildUnstoppableLoops(teamId: TeamId): void {
        this.clearUnstoppableTeamLoops(teamId);
        const players = this.runtime.getTeamPlayerSnapshots(teamId).filter((p) => p.alive);
        for (const p of players) {
            const anchor = new THREE.Object3D();
            anchor.position.set(p.position.x, p.position.y, p.position.z);
            this.scene.add(anchor);
            const handle = this.vfx.startLoop('unstoppable_herd_aura', anchor);
            this.herdAuraLoops.set(`${teamId}:${p.playerId}`, { teamId, playerId: p.playerId, anchor, handle });
        }
    }

    private updateUnstoppableHerd(dt: number): void {
        for (const loop of this.herdAuraLoops.values()) {
            const pos = this.runtime.getPlayerPosition(loop.playerId);
            if (!pos) continue;
            loop.anchor.position.set(pos.x, pos.y, pos.z);
        }
        for (const [teamId, state] of this.herdTrailTimers) {
            state.accSec += dt;
            if (state.accSec < 0.16) continue;
            state.accSec = 0;
            const players = this.runtime.getTeamPlayerSnapshots(teamId).filter((p) => p.alive);
            for (const p of players) {
                const playerNum = Number(p.playerId);
                const prev = state.lastPos.get(playerNum);
                if (prev) {
                    const dx = p.position.x - prev.x;
                    const dz = p.position.z - prev.z;
                    if ((dx * dx + dz * dz) > (0.35 * 0.35)) {
                        this.vfx.playOneShot('unstoppable_herd_dust_trail', p.position);
                    }
                }
                state.lastPos.set(playerNum, { ...p.position });
            }
        }
    }

    private clearUnstoppableTeamLoops(teamId: TeamId): void {
        for (const [id, loop] of this.herdAuraLoops) {
            if (loop.teamId !== teamId) continue;
            this.vfx.stop(loop.handle);
            this.scene.remove(loop.anchor);
            this.herdAuraLoops.delete(id);
        }
    }

    private clearAllUnstoppableLoops(): void {
        for (const loop of this.herdAuraLoops.values()) {
            this.vfx.stop(loop.handle);
            this.scene.remove(loop.anchor);
        }
        this.herdAuraLoops.clear();
        this.herdTrailTimers.clear();
    }

    private ensureForgeTether(): void {
        if (this.forgeTetherMesh) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        const mat = new THREE.LineBasicMaterial({
            color: 0xffa347,
            transparent: true,
            opacity: 0.75,
            depthWrite: false,
            depthTest: false,
        });
        this.forgeTetherMesh = new THREE.LineSegments(geo, mat);
        this.forgeTetherMesh.renderOrder = 9000;
        this.scene.add(this.forgeTetherMesh);

        const glowGeo = new THREE.BufferGeometry();
        glowGeo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        const glowMat = new THREE.LineBasicMaterial({
            color: 0xffe2a8,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
            depthTest: false,
            blending: THREE.AdditiveBlending,
        });
        this.forgeTetherGlowMesh = new THREE.LineSegments(glowGeo, glowMat);
        this.forgeTetherGlowMesh.renderOrder = 9001;
        this.scene.add(this.forgeTetherGlowMesh);
    }

    private destroyForgeTether(): void {
        if (!this.forgeTetherMesh) return;
        this.scene.remove(this.forgeTetherMesh);
        this.forgeTetherMesh.geometry.dispose();
        (this.forgeTetherMesh.material as THREE.Material).dispose();
        this.forgeTetherMesh = null;
        if (this.forgeTetherGlowMesh) {
            this.scene.remove(this.forgeTetherGlowMesh);
            this.forgeTetherGlowMesh.geometry.dispose();
            (this.forgeTetherGlowMesh.material as THREE.Material).dispose();
            this.forgeTetherGlowMesh = null;
        }
    }

    private updateForgeLinkTether(): void {
        if (!this.forgeTetherMesh || !this.forgeTetherGlowMesh || this.forgeTetherTeam === null) return;
        const segments = this.runtime.getForgeLinkSegments(this.forgeTetherTeam);
        const verts: number[] = [];
        for (const s of segments) {
            verts.push(s.aPos.x, s.aPos.y + 0.8, s.aPos.z, s.bPos.x, s.bPos.y + 0.8, s.bPos.z);
            if (this.forgeEmberTimeSec >= this.forgeNextEmberAt) {
                const t = (Math.sin(this.forgeEmberTimeSec * 4) * 0.5) + 0.5;
                const ember = {
                    x: s.aPos.x + (s.bPos.x - s.aPos.x) * t,
                    y: s.aPos.y + 0.8 + (s.bPos.y - s.aPos.y) * t,
                    z: s.aPos.z + (s.bPos.z - s.aPos.z) * t,
                };
                this.vfx.playOneShot('vfx_forge_link_trail', ember);
            }
        }
        if (this.forgeEmberTimeSec >= this.forgeNextEmberAt) this.forgeNextEmberAt = this.forgeEmberTimeSec + 0.2;
        this.forgeTetherMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        this.forgeTetherMesh.geometry.computeBoundingSphere();
        this.forgeTetherGlowMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        this.forgeTetherGlowMesh.geometry.computeBoundingSphere();
        const pulse = 0.55 + ((Math.sin(this.forgeEmberTimeSec * 7) + 1) * 0.15);
        (this.forgeTetherMesh.material as THREE.LineBasicMaterial).opacity = pulse;
        (this.forgeTetherGlowMesh.material as THREE.LineBasicMaterial).opacity = pulse * 0.6;
    }

    private rebuildForgeLinkAuras(teamId: TeamId): void {
        this.clearForgeLinkAuras(teamId);
        const players = this.runtime.getTeamPlayerSnapshots(teamId).filter((p) => p.alive);
        for (const p of players) {
            const anchor = new THREE.Object3D();
            anchor.position.set(p.position.x, p.position.y, p.position.z);
            this.scene.add(anchor);
            const handle = this.vfx.startLoop('forge_link_tether', anchor);
            this.forgeAuraLoops.set(`${teamId}:${p.playerId}`, { teamId, playerId: p.playerId, anchor, handle });
        }
    }

    private updateForgeLinkAuras(): void {
        if (this.forgeTetherTeam === null) return;
        const seen = new Set<string>();
        const alive = this.runtime.getTeamPlayerSnapshots(this.forgeTetherTeam).filter((p) => p.alive);
        for (const p of alive) {
            const key = `${this.forgeTetherTeam}:${p.playerId}`;
            seen.add(key);
            const existing = this.forgeAuraLoops.get(key);
            if (existing) {
                existing.anchor.position.set(p.position.x, p.position.y, p.position.z);
                continue;
            }
            const anchor = new THREE.Object3D();
            anchor.position.set(p.position.x, p.position.y, p.position.z);
            this.scene.add(anchor);
            const handle = this.vfx.startLoop('forge_link_tether', anchor);
            this.forgeAuraLoops.set(key, { teamId: this.forgeTetherTeam, playerId: p.playerId, anchor, handle });
        }
        for (const [key, loop] of this.forgeAuraLoops) {
            if (loop.teamId !== this.forgeTetherTeam || seen.has(key)) continue;
            this.vfx.stop(loop.handle);
            this.scene.remove(loop.anchor);
            this.forgeAuraLoops.delete(key);
        }
    }

    private clearForgeLinkAuras(teamId?: TeamId): void {
        for (const [key, loop] of this.forgeAuraLoops) {
            if (typeof teamId === 'number' && loop.teamId !== teamId) continue;
            this.vfx.stop(loop.handle);
            this.scene.remove(loop.anchor);
            this.forgeAuraLoops.delete(key);
        }
    }

    private updateScrapMagnetPulse(): void {
        const teams: TeamId[] = [1, 2];
        for (const teamId of teams) {
            const source = this.runtime.getBuffSourcePlayer(teamId, 'SCRAP_MAGNET');
            if (!source) continue;
            const nextAt = this.scrapPulseAtByTeam.get(teamId) ?? 0;
            if (nextAt > this.elapsedSec) continue;
            const pos = this.runtime.getPlayerPosition(source);
            if (pos) this.vfx.playOneShot('scrap_magnet_hit', pos);
            this.scrapPulseAtByTeam.set(teamId, this.elapsedSec + 0.18);
        }
    }
}
