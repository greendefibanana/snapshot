import type { EntityId } from '@snapshot/shared';
import { ABILITIES, ABILITY_RULES, AbilityKind, type AbilityKey } from '../registry/abilities.registry';
import { ABILITIES_TUNING, type ChargeReason } from './AbilityTuning';
import { AbilitiesEventBus } from './EventBus';
import type { TeamId } from './GameEvents';

type Vec3 = { x: number; y: number; z: number };

type PlayerState = {
    playerId: EntityId;
    teamId: TeamId;
    position: Vec3;
    forward: Vec3;
    hp: number;
    alive: boolean;
    tacticalCharge: number;
    ultimateCharge: number;
    tacticalCooldowns: Map<AbilityKey, number>;
    extracting: boolean;
    status: {
        stunSec: number;
        freezeSec: number;
        slowSec: number;
        slowPct: number;
        shadowFormSec: number;
    };
    passiveKey: AbilityKey | null;
    maxHp: number;
    previousPosition: Vec3;
};

type TeamBuffState = {
    abilityKey: AbilityKey;
    remainingSec: number | null;
    sourcePlayerId: EntityId;
    meta: Record<string, number>;
};

type DomeState = {
    teamId: TeamId;
    center: Vec3;
    radiusM: number;
    remainingSec: number;
};

type PendingStrike = {
    casterId: EntityId;
    teamId: TeamId;
    positions: Vec3[];
    executeInSec: number;
};

type DeployableState = {
    deployableId: string;
    ownerId: EntityId;
    ownerTeamId: TeamId;
    abilityKey: AbilityKey;
    position: Vec3;
    radiusM: number;
    remainingSec: number | null;
    tickEverySec: number;
    tickAccumulatorSec: number;
    dps: number;
};

type FragmentPickupState = {
    pickupId: string;
    position: Vec3;
};

export interface AbilityCastPayload {
    direction?: Vec3;
    teamId?: TeamId;
    targets?: Vec3[];
    hitTargetIds?: EntityId[];
    position?: Vec3;
}

export interface AbilityRuntimeAdapter {
    getZoneCenter?: () => Vec3;
    getZoneRadiusM?: () => number;
    getDropPosition?: () => Vec3 | null;
    getPlayers?: () => Array<{
        playerId: EntityId;
        teamId: TeamId;
        position: Vec3;
        forward: Vec3;
        alive?: boolean;
        passiveKey?: AbilityKey | null;
    }>;
    isPlayerExtracting?: (playerId: EntityId) => boolean;
    isPlayerInsideZone?: (playerId: EntityId) => boolean;
    isTeamOwningZone?: (teamId: TeamId) => boolean;
    isPlayerSprinting?: (playerId: EntityId) => boolean;
    interruptExtraction?: (playerId: EntityId) => void;
    setPlayerPosition?: (playerId: EntityId, position: Vec3) => void;
    getFragmentPickups?: () => FragmentPickupState[];
    setFragmentPickupPosition?: (pickupId: string, position: Vec3) => void;
    consumeFragmentPickup?: (pickupId: string, teamId: TeamId) => void;
}

function vSub(a: Vec3, b: Vec3): Vec3 {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vAdd(a: Vec3, b: Vec3): Vec3 {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vScale(a: Vec3, s: number): Vec3 {
    return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function vLen(a: Vec3): number {
    return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

function vNorm(a: Vec3): Vec3 {
    const len = vLen(a);
    if (len <= 1e-6) return { x: 0, y: 0, z: 1 };
    return { x: a.x / len, y: a.y / len, z: a.z / len };
}

function vDist(a: Vec3, b: Vec3): number {
    return vLen(vSub(a, b));
}

function vDot(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function clampBounds(pos: Vec3): Vec3 {
    const b = ABILITIES_TUNING.MAP_BOUNDS_HALF_EXTENT_M;
    return {
        x: Math.max(-b, Math.min(b, pos.x)),
        y: pos.y,
        z: Math.max(-b, Math.min(b, pos.z)),
    };
}

export class AbilityRuntime {
    private readonly players = new Map<EntityId, PlayerState>();
    private readonly teamDropBuff = new Map<TeamId, TeamBuffState>();
    private readonly teamAuras = new Map<TeamId, TeamBuffState>();
    private readonly deployables = new Map<string, DeployableState>();
    private readonly pendingStrikes: PendingStrike[] = [];
    private readonly activeDomes: DomeState[] = [];
    private stampedeKnockbackAt = new Map<string, number>();
    private pendingCreditsByTeam: Record<TeamId, number> = { 1: 0, 2: 0 };
    private sandboxPickups = new Map<string, FragmentPickupState>();
    private scrapTokenVfxAt = new Map<string, number>();
    private deployableSeq = 0;
    private nowSec = 0;

    constructor(
        private readonly eventBus: AbilitiesEventBus,
        private readonly adapter: AbilityRuntimeAdapter = {}
    ) {}

    registerPlayer(playerId: EntityId, teamId: TeamId, position: Vec3, forward: Vec3 = { x: 0, y: 0, z: 1 }): void {
        this.players.set(playerId, {
            playerId,
            teamId,
            position: { ...position },
            forward: vNorm(forward),
            hp: ABILITIES_TUNING.BASE_PLAYER_HP,
            alive: true,
            tacticalCharge: 100,
            ultimateCharge: 100,
            tacticalCooldowns: new Map(),
            extracting: false,
            status: {
                stunSec: 0,
                freezeSec: 0,
                slowSec: 0,
                slowPct: 0,
                shadowFormSec: 0,
            },
            passiveKey: null,
            maxHp: ABILITIES_TUNING.BASE_PLAYER_HP,
            previousPosition: { ...position },
        });
    }

    setPlayerPassive(playerId: EntityId, passiveKey: AbilityKey | null): void {
        const p = this.players.get(playerId);
        if (!p) return;
        const hpRatio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
        p.passiveKey = passiveKey;
        p.maxHp = this.maxHpForPassive(passiveKey);
        if (!p.alive || p.hp <= 0) {
            p.hp = 0;
            return;
        }
        p.hp = Math.max(1, Math.min(p.maxHp, p.maxHp * hpRatio));
    }

    setPlayerTeam(playerId: EntityId, teamId: TeamId): void {
        const p = this.players.get(playerId);
        if (p) p.teamId = teamId;
    }

    setPlayerPose(playerId: EntityId, position: Vec3, forward?: Vec3): void {
        const p = this.players.get(playerId);
        if (!p) return;
        p.position = { ...position };
        if (forward) p.forward = vNorm(forward);
    }

    upsertPlayer(playerId: EntityId, teamId: TeamId, position: Vec3, forward?: Vec3): void {
        if (!this.players.has(playerId)) {
            this.registerPlayer(playerId, teamId, position, forward ?? { x: 0, y: 0, z: 1 });
            return;
        }
        this.setPlayerTeam(playerId, teamId);
        this.setPlayerPose(playerId, position, forward);
    }

    awardCharge(playerId: EntityId, reason: ChargeReason): void {
        const player = this.players.get(playerId);
        if (!player) return;
        const delta = ABILITIES_TUNING.CHARGE_VALUES[reason];
        player.tacticalCharge = Math.min(100, player.tacticalCharge + delta.tactical);
        player.ultimateCharge = Math.min(100, player.ultimateCharge + delta.ultimate);
    }

    debugForceCast(playerId: EntityId, abilityKey: AbilityKey, payload?: AbilityCastPayload): boolean {
        const caster = this.players.get(playerId);
        const def = ABILITIES[abilityKey];
        if (!caster || !def || !caster.alive) return false;
        this.eventBus.emit('ABILITY_CAST', { casterId: caster.playerId, abilityKey, ...(payload ? { payload } : {}) });
        this.executeCast(caster, abilityKey, payload);
        return true;
    }

    tryCast(playerId: EntityId, abilityKey: AbilityKey, payload?: AbilityCastPayload): boolean {
        const caster = this.players.get(playerId);
        const def = ABILITIES[abilityKey];
        if (!caster || !def || !caster.alive) return false;
        if (caster.status.shadowFormSec > 0 && abilityKey !== 'SHADOW_LEAP') return false;

        if (def.kind === AbilityKind.TACTICAL) {
            const cd = caster.tacticalCooldowns.get(abilityKey) ?? 0;
            if (cd > 0 || caster.tacticalCharge < 100) return false;
            caster.tacticalCharge = 0;
            if (typeof def.cooldownSec === 'number') caster.tacticalCooldowns.set(abilityKey, def.cooldownSec);
        } else if (def.kind === AbilityKind.ULTIMATE) {
            if (caster.ultimateCharge < 100) return false;
            caster.ultimateCharge = 0;
        }

        this.eventBus.emit('ABILITY_CAST', { casterId: caster.playerId, abilityKey, ...(payload ? { payload } : {}) });
        this.executeCast(caster, abilityKey, payload);
        return true;
    }

    private executeCast(caster: PlayerState, abilityKey: AbilityKey, payload?: AbilityCastPayload): void {
        switch (abilityKey) {
            case 'SEISMIC_SLAM':
                this.castSeismicSlam(caster, payload);
                break;
            case 'IRON_FORTRESS':
                this.castIronFortress(caster);
                break;
            case 'GALE_FORCE':
                this.castGaleForce(caster, payload);
                break;
            case 'SKY_FIRE_STRIKE':
                this.castSkyFireStrike(caster, payload);
                break;
            case 'SHADOW_LEAP':
                this.castShadowLeap(caster, payload);
                break;
            case 'BASILISK_GAZE':
                this.castBasiliskGaze(caster);
                break;
            case 'BATTERING_RAM':
                this.castBatteringRam(caster, payload);
                break;
            case 'UNSTOPPABLE_HERD':
                this.applyTeamAura(caster.teamId, abilityKey, ABILITIES_TUNING.ABILITY.UNSTOPPABLE_HERD.durationSec, caster.playerId);
                break;
            case 'JUNK_TURRET':
                this.castJunkTurret(caster, payload);
                break;
            case 'SCAVENGERS_FEAST':
                this.applyTeamAura(caster.teamId, abilityKey, ABILITIES_TUNING.ABILITY.SCAVENGERS_FEAST.durationSec, caster.playerId);
                break;
            case 'FORGE_LINK':
            case 'SKY_EYE_RECON':
            case 'NEURO_TOXIN_CLOUD':
            case 'STAMPEDE_OVERDRIVE':
            case 'SCRAP_MAGNET':
                this.castDropBuff(caster, abilityKey, payload);
                break;
            default:
                break;
        }
    }

    update(dt: number): void {
        this.nowSec += dt;
        this.syncAdapterPlayers();
        this.tickCooldownsAndStatus(dt);
        this.tickAurasAndBuffs(dt);
        this.tickStrikes(dt);
        this.tickDeployables(dt);
        this.tickStampedeOverdrive();
        this.tickScrapMagnet(dt);
        this.tickScavengersFeast(dt);
    }

    private syncAdapterPlayers(): void {
        const remotePlayers = this.adapter.getPlayers?.();
        if (!remotePlayers) return;
        remotePlayers.sort((a, b) => Number(a.playerId) - Number(b.playerId));
        for (const rp of remotePlayers) {
            if (!this.players.has(rp.playerId)) {
                this.registerPlayer(rp.playerId, rp.teamId, rp.position, rp.forward);
            }
            const p = this.players.get(rp.playerId)!;
            p.teamId = rp.teamId;
            p.position = { ...rp.position };
            p.forward = vNorm(rp.forward);
            p.alive = rp.alive ?? p.alive;
            p.extracting = this.adapter.isPlayerExtracting?.(rp.playerId) ?? false;
            if (typeof rp.passiveKey !== 'undefined' && rp.passiveKey !== p.passiveKey) {
                this.setPlayerPassive(rp.playerId, rp.passiveKey);
            }
        }
    }

    private tickCooldownsAndStatus(dt: number): void {
        for (const p of this.players.values()) {
            const cooldownScale = this.cooldownRegenScaleFor(p);
            const cooldownDt = dt * cooldownScale;
            for (const [abilityKey, cd] of p.tacticalCooldowns) {
                p.tacticalCooldowns.set(abilityKey, Math.max(0, cd - cooldownDt));
            }
            p.status.stunSec = Math.max(0, p.status.stunSec - dt);
            p.status.freezeSec = Math.max(0, p.status.freezeSec - dt);
            p.status.slowSec = Math.max(0, p.status.slowSec - dt);
            p.status.shadowFormSec = Math.max(0, p.status.shadowFormSec - dt);
            if (p.status.slowSec === 0) p.status.slowPct = 0;
        }
    }

    private tickAurasAndBuffs(dt: number): void {
        for (const [teamId, buff] of this.teamDropBuff) {
            if (buff.remainingSec === null) continue;
            buff.remainingSec = Math.max(0, buff.remainingSec - dt);
            if (buff.remainingSec <= 0) {
                this.teamDropBuff.delete(teamId);
                this.eventBus.emit('BUFF_END', { teamId, abilityKey: buff.abilityKey, reason: 'expired' });
            }
        }
        for (const [teamId, aura] of this.teamAuras) {
            if (aura.remainingSec === null) continue;
            aura.remainingSec = Math.max(0, aura.remainingSec - dt);
            if (aura.remainingSec <= 0) {
                this.teamAuras.delete(teamId);
                this.eventBus.emit('BUFF_END', { teamId, abilityKey: aura.abilityKey, reason: 'expired' });
            }
        }
        for (const [k, at] of this.stampedeKnockbackAt) {
            if (at <= this.nowSec) this.stampedeKnockbackAt.delete(k);
        }
        for (let i = this.activeDomes.length - 1; i >= 0; i--) {
            this.activeDomes[i]!.remainingSec = Math.max(0, this.activeDomes[i]!.remainingSec - dt);
            if (this.activeDomes[i]!.remainingSec <= 0) this.activeDomes.splice(i, 1);
        }
    }

    private tickStrikes(dt: number): void {
        for (let i = this.pendingStrikes.length - 1; i >= 0; i--) {
            const pending = this.pendingStrikes[i]!;
            pending.executeInSec -= dt;
            if (pending.executeInSec > 0) continue;
            for (const center of pending.positions) {
                for (const target of this.enemyPlayers(pending.teamId)) {
                    const d = vDist(target.position, center);
                    if (d <= ABILITIES_TUNING.ABILITY.SKY_FIRE_STRIKE.centerRadiusM) {
                        this.applyDamage(pending.casterId, target.playerId, ABILITIES_TUNING.ABILITY.SKY_FIRE_STRIKE.centerDamage, 'SKY_FIRE_STRIKE');
                    } else if (d <= ABILITIES_TUNING.ABILITY.SKY_FIRE_STRIKE.outerRadiusM) {
                        this.applyDamage(pending.casterId, target.playerId, ABILITIES_TUNING.ABILITY.SKY_FIRE_STRIKE.outerDamage, 'SKY_FIRE_STRIKE');
                    }
                }
            }
            this.pendingStrikes.splice(i, 1);
        }
    }

    private tickDeployables(dt: number): void {
        for (const [deployableId, d] of this.deployables) {
            if (d.remainingSec !== null) {
                d.remainingSec = Math.max(0, d.remainingSec - dt);
                if (d.remainingSec <= 0) {
                    this.deployables.delete(deployableId);
                    this.eventBus.emit('DEPLOYABLE_DESPAWN', {
                        deployableId,
                        ownerId: d.ownerId,
                        abilityKey: d.abilityKey,
                        reason: 'expired',
                    });
                    continue;
                }
            }
            d.tickAccumulatorSec += dt;
            if (d.tickAccumulatorSec < d.tickEverySec) continue;
            d.tickAccumulatorSec -= d.tickEverySec;

            if (d.abilityKey === 'JUNK_TURRET') {
                const target = this.nearestEnemyInRange(d.ownerTeamId, d.position, d.radiusM);
                if (!target) continue;
                this.applyDamage(d.ownerId, target.playerId, d.dps * d.tickEverySec, 'JUNK_TURRET');
            }

            if (d.abilityKey === 'NEURO_TOXIN_CLOUD') {
                for (const target of this.enemyPlayers(d.ownerTeamId)) {
                    if (vDist(target.position, d.position) > d.radiusM) continue;
                    this.applyDamage(d.ownerId, target.playerId, ABILITIES_TUNING.DROP.NEURO_TOXIN_CLOUD.dps * d.tickEverySec, 'NEURO_TOXIN_CLOUD');
                }
            }
        }
    }

    private tickScavengersFeast(_dt: number): void {
        for (const [teamId, aura] of this.teamAuras) {
            if (aura.abilityKey !== 'SCAVENGERS_FEAST') continue;
            const source = this.players.get(aura.sourcePlayerId);
            if (!source || !source.alive) {
                this.teamAuras.delete(teamId);
                this.eventBus.emit('BUFF_END', { teamId, abilityKey: 'SCAVENGERS_FEAST', reason: 'expired' });
                continue;
            }
            const inZone = this.adapter.isPlayerInsideZone?.(source.playerId) ?? (vDist(source.position, this.zoneCenter()) <= this.zoneRadius());
            const ownsZone = this.adapter.isTeamOwningZone?.(teamId) ?? true;
            if (!inZone || !ownsZone) continue;
            // Thin adapter path: if owning mode has zone signal ticks, this runtime just provides multiplier via aura state.
            // No direct signal state mutation here.
        }
    }

    private castSeismicSlam(caster: PlayerState, payload?: AbilityCastPayload): void {
        const dir = vNorm(payload?.direction ?? caster.forward);
        caster.position = clampBounds(vAdd(caster.position, vScale(dir, ABILITIES_TUNING.ABILITY.SEISMIC_SLAM.leapRangeM)));
        this.adapter.setPlayerPosition?.(caster.playerId, caster.position);
        const dropPos = this.adapter.getDropPosition?.() ?? ABILITIES_TUNING.DEFAULT_DROP_POS;

        for (const target of this.enemyPlayers(caster.teamId)) {
            const nearLanding = vDist(target.position, caster.position) <= ABILITIES_TUNING.ABILITY.SEISMIC_SLAM.stunRadiusM;
            const nearDrop = vDist(target.position, dropPos) <= ABILITIES_TUNING.ABILITY.SEISMIC_SLAM.stunRadiusM;
            if (!nearLanding && !nearDrop && !target.extracting) continue;
            this.applyDamage(caster.playerId, target.playerId, ABILITIES_TUNING.ABILITY.SEISMIC_SLAM.damage, 'SEISMIC_SLAM');
            if (target.extracting || nearDrop) this.applyCC(target, ABILITIES_TUNING.ABILITY.SEISMIC_SLAM.stunSec, 0, 0);
        }
    }

    private castIronFortress(caster: PlayerState): void {
        this.activeDomes.push({
            teamId: caster.teamId,
            center: { ...caster.position },
            radiusM: ABILITIES_TUNING.ABILITY.IRON_FORTRESS.radiusM,
            remainingSec: ABILITIES_TUNING.ABILITY.IRON_FORTRESS.durationSec,
        });
        this.applyTeamAura(caster.teamId, 'IRON_FORTRESS', ABILITIES_TUNING.ABILITY.IRON_FORTRESS.durationSec, caster.playerId);
    }

    private castGaleForce(caster: PlayerState, payload?: AbilityCastPayload): void {
        const forward = vNorm(payload?.direction ?? caster.forward);
        const cosAngle = Math.cos((ABILITIES_TUNING.ABILITY.GALE_FORCE.coneAngleDeg * Math.PI) / 180);
        for (const target of this.enemyPlayers(caster.teamId)) {
            const toTarget = vSub(target.position, caster.position);
            const dist = vLen(toTarget);
            if (dist <= 0.01 || dist > ABILITIES_TUNING.ABILITY.GALE_FORCE.rangeM) continue;
            const dir = vScale(toTarget, 1 / dist);
            if (vDot(forward, dir) < cosAngle) continue;
            const t = dist / ABILITIES_TUNING.ABILITY.GALE_FORCE.rangeM;
            const push = ABILITIES_TUNING.ABILITY.GALE_FORCE.closePushM * (1 - t) + ABILITIES_TUNING.ABILITY.GALE_FORCE.edgePushM * t;
            target.position = clampBounds(vAdd(target.position, vScale(dir, push)));
            this.adapter.setPlayerPosition?.(target.playerId, target.position);
            this.eventBus.emit('ABILITY_HIT', { casterId: caster.playerId, targetId: target.playerId, abilityKey: 'GALE_FORCE' });
            if (target.extracting) {
                target.extracting = false;
                this.adapter.interruptExtraction?.(target.playerId);
            }
        }
    }

    private castSkyFireStrike(caster: PlayerState, payload?: AbilityCastPayload): void {
        const targets = payload?.targets && payload.targets.length > 0
            ? payload.targets.slice(0, ABILITIES_TUNING.ABILITY.SKY_FIRE_STRIKE.strikeCount)
            : this.defaultStrikeTargets(caster);
        this.pendingStrikes.push({
            casterId: caster.playerId,
            teamId: caster.teamId,
            positions: targets.map((p) => ({ ...p })),
            executeInSec: ABILITIES_TUNING.ABILITY.SKY_FIRE_STRIKE.delaySec,
        });
    }

    private castShadowLeap(caster: PlayerState, payload?: AbilityCastPayload): void {
        const dir = vNorm(payload?.direction ?? caster.forward);
        caster.position = clampBounds(vAdd(caster.position, vScale(dir, ABILITIES_TUNING.ABILITY.SHADOW_LEAP.dashRangeM)));
        caster.status.shadowFormSec = ABILITIES_TUNING.ABILITY.SHADOW_LEAP.shadowFormSec;
        this.adapter.setPlayerPosition?.(caster.playerId, caster.position);
    }

    private castBasiliskGaze(caster: PlayerState): void {
        for (const target of this.enemyPlayers(caster.teamId)) {
            if (vDist(target.position, caster.position) > ABILITIES_TUNING.ABILITY.BASILISK_GAZE.radiusM) continue;
            const toCaster = vNorm(vSub(caster.position, target.position));
            const facing = vDot(vNorm(target.forward), toCaster);
            if (facing < ABILITIES_TUNING.ABILITY.BASILISK_GAZE.facingDotThreshold) continue;
            this.applyCC(
                target,
                ABILITIES_TUNING.ABILITY.BASILISK_GAZE.freezeSec,
                ABILITIES_TUNING.ABILITY.BASILISK_GAZE.slowSec,
                ABILITIES_TUNING.ABILITY.BASILISK_GAZE.slowPct
            );
            this.eventBus.emit('ABILITY_HIT', { casterId: caster.playerId, targetId: target.playerId, abilityKey: 'BASILISK_GAZE' });
        }
    }

    private castBatteringRam(caster: PlayerState, payload?: AbilityCastPayload): void {
        const dir = vNorm(payload?.direction ?? caster.forward);
        const end = clampBounds(vAdd(caster.position, vScale(dir, ABILITIES_TUNING.ABILITY.BATTERING_RAM.chargeRangeM)));
        let bestTarget: PlayerState | null = null;
        let bestAlong = Number.MAX_SAFE_INTEGER;

        for (const target of this.enemyPlayers(caster.teamId)) {
            const rel = vSub(target.position, caster.position);
            const along = vDot(rel, dir);
            if (along < 0 || along > ABILITIES_TUNING.ABILITY.BATTERING_RAM.chargeRangeM) continue;
            const closest = vAdd(caster.position, vScale(dir, along));
            const lateral = vDist(target.position, closest);
            if (lateral > ABILITIES_TUNING.ABILITY.BATTERING_RAM.chargeWidthM) continue;
            if (along < bestAlong) {
                bestAlong = along;
                bestTarget = target;
            }
        }

        caster.position = end;
        this.adapter.setPlayerPosition?.(caster.playerId, caster.position);
        if (!bestTarget) return;

        bestTarget.position = end;
        this.adapter.setPlayerPosition?.(bestTarget.playerId, bestTarget.position);
        const collidedWall = end.x === ABILITIES_TUNING.MAP_BOUNDS_HALF_EXTENT_M
            || end.x === -ABILITIES_TUNING.MAP_BOUNDS_HALF_EXTENT_M
            || end.z === ABILITIES_TUNING.MAP_BOUNDS_HALF_EXTENT_M
            || end.z === -ABILITIES_TUNING.MAP_BOUNDS_HALF_EXTENT_M;
        if (collidedWall) {
            this.applyDamage(caster.playerId, bestTarget.playerId, ABILITIES_TUNING.ABILITY.BATTERING_RAM.wallImpactDamage, 'BATTERING_RAM');
        } else {
            this.applyCC(bestTarget, ABILITIES_TUNING.ABILITY.BATTERING_RAM.knockdownSec, 0, 0);
            this.eventBus.emit('ABILITY_HIT', { casterId: caster.playerId, targetId: bestTarget.playerId, abilityKey: 'BATTERING_RAM' });
        }
    }

    private castJunkTurret(caster: PlayerState, payload?: AbilityCastPayload): void {
        const dir = vNorm(payload?.direction ?? caster.forward);
        const pos = payload?.position ?? clampBounds(vAdd(caster.position, vScale(dir, 2)));
        const id = `abilities_deploy_${++this.deployableSeq}`;
        this.deployables.set(id, {
            deployableId: id,
            ownerId: caster.playerId,
            ownerTeamId: caster.teamId,
            abilityKey: 'JUNK_TURRET',
            position: pos,
            radiusM: ABILITIES_TUNING.ABILITY.JUNK_TURRET.rangeM,
            remainingSec: ABILITIES_TUNING.ABILITY.JUNK_TURRET.durationSec,
            tickEverySec: ABILITIES_TUNING.ABILITY.JUNK_TURRET.tickSec,
            tickAccumulatorSec: 0,
            dps: ABILITIES_TUNING.ABILITY.JUNK_TURRET.dps,
        });
        this.eventBus.emit('DEPLOYABLE_SPAWN', {
            deployableId: id,
            ownerId: caster.playerId,
            abilityKey: 'JUNK_TURRET',
            durationSec: ABILITIES_TUNING.ABILITY.JUNK_TURRET.durationSec,
        });
    }

    private castDropBuff(caster: PlayerState, abilityKey: AbilityKey, payload?: AbilityCastPayload): void {
        const duration = this.dropDurationFor(abilityKey);
        this.applyTeamDropBuff(caster.teamId, abilityKey, duration, caster.playerId);
        if (abilityKey === 'NEURO_TOXIN_CLOUD') {
            const pos = payload?.position ?? this.zoneCenter();
            const id = `abilities_deploy_${++this.deployableSeq}`;
            this.deployables.set(id, {
                deployableId: id,
                ownerId: caster.playerId,
                ownerTeamId: caster.teamId,
                abilityKey: 'NEURO_TOXIN_CLOUD',
                position: pos,
                radiusM: ABILITIES_TUNING.DROP.NEURO_TOXIN_CLOUD.radiusM,
                remainingSec: ABILITIES_TUNING.DROP.NEURO_TOXIN_CLOUD.durationSec,
                tickEverySec: ABILITIES_TUNING.DROP.NEURO_TOXIN_CLOUD.tickSec,
                tickAccumulatorSec: 0,
                dps: ABILITIES_TUNING.DROP.NEURO_TOXIN_CLOUD.dps,
            });
            this.eventBus.emit('DEPLOYABLE_SPAWN', {
                deployableId: id,
                ownerId: caster.playerId,
                abilityKey: 'NEURO_TOXIN_CLOUD',
                durationSec: ABILITIES_TUNING.DROP.NEURO_TOXIN_CLOUD.durationSec,
            });
        }
        if (abilityKey === 'SCRAP_MAGNET') {
            this.pendingCreditsByTeam[caster.teamId] += ABILITIES_TUNING.DROP.SCRAP_MAGNET.pendingCredits;
        }
    }

    private applyTeamDropBuff(teamId: TeamId, abilityKey: AbilityKey, durationSec: number | null, sourcePlayerId: EntityId): void {
        const existing = this.teamDropBuff.get(teamId);
        if (existing) {
            this.eventBus.emit('BUFF_END', { teamId, abilityKey: existing.abilityKey, reason: 'replaced' });
        }
        if (ABILITY_RULES.DROP_BUFF_MAX_ACTIVE_PER_TEAM !== 1) {
            throw new Error('Drop buff exclusivity misconfigured.');
        }
        this.teamDropBuff.set(teamId, { abilityKey, remainingSec: durationSec, sourcePlayerId, meta: {} });
        this.eventBus.emit('BUFF_START', { teamId, abilityKey, durationSec });
    }

    private applyTeamAura(teamId: TeamId, abilityKey: AbilityKey, durationSec: number | null, sourcePlayerId: EntityId): void {
        this.teamAuras.set(teamId, { abilityKey, remainingSec: durationSec, sourcePlayerId, meta: {} });
        this.eventBus.emit('BUFF_START', { teamId, abilityKey, durationSec });
    }

    private applyDamage(sourceId: EntityId, targetId: EntityId, baseDamage: number, abilityKey: AbilityKey): void {
        const source = this.players.get(sourceId);
        const target = this.players.get(targetId);
        if (!source || !target || !target.alive) return;
        if (source.status.shadowFormSec > 0 || target.status.shadowFormSec > 0) return;
        if (this.teamAuras.get(target.teamId)?.abilityKey === 'UNSTOPPABLE_HERD' && this.isCCAbility(abilityKey)) return;

        let damage = baseDamage;
        const sourceDome = this.activeDomes.find((d) => d.teamId === source.teamId);
        if (sourceDome && vDist(source.position, sourceDome.center) <= sourceDome.radiusM && vDist(target.position, sourceDome.center) > sourceDome.radiusM) {
            damage *= ABILITIES_TUNING.ABILITY.IRON_FORTRESS.insideOutgoingDamageMultiplier;
        }
        const targetDome = this.activeDomes.find((d) => d.teamId === target.teamId);
        if (targetDome && vDist(target.position, targetDome.center) <= targetDome.radiusM && vDist(source.position, targetDome.center) > targetDome.radiusM) {
            return;
        }
        const forge = this.teamDropBuff.get(target.teamId);
        if (forge?.abilityKey === 'FORGE_LINK') {
            damage *= (1 - ABILITIES_TUNING.DROP.FORGE_LINK.damageReductionPct);
            const teammates = this.teamPlayers(target.teamId).filter((p) => p.alive && vDist(p.position, target.position) <= ABILITIES_TUNING.DROP.FORGE_LINK.linkRangeM);
            if (teammates.length > 0) {
                const split = damage / teammates.length;
                for (const mate of teammates) {
                    mate.hp -= split;
                    if (mate.hp <= 0) mate.alive = false;
                    this.eventBus.emit('ABILITY_HIT', { casterId: sourceId, targetId: mate.playerId, abilityKey });
                    this.eventBus.emit('FORGE_LINK_SHARED_DAMAGE', {
                        sourceId,
                        teamId: target.teamId,
                        targetId: mate.playerId,
                        sharedDamage: split,
                    });
                }
                forge.meta.absorbed = (forge.meta.absorbed ?? 0) + damage;
                if ((forge.meta.absorbed ?? 0) >= ABILITIES_TUNING.DROP.FORGE_LINK.absorbCap) {
                    this.teamDropBuff.delete(target.teamId);
                    this.eventBus.emit('BUFF_END', { teamId: target.teamId, abilityKey: 'FORGE_LINK', reason: 'expired' });
                }
                return;
            }
        }

        target.hp -= damage;
        if (target.hp <= 0) {
            target.hp = 0;
            target.alive = false;
        }
        this.eventBus.emit('ABILITY_HIT', { casterId: sourceId, targetId: target.playerId, abilityKey });
    }

    private applyCC(target: PlayerState, stunSec: number, slowSec: number, slowPct: number): void {
        const antiCC = this.teamAuras.get(target.teamId)?.abilityKey === 'UNSTOPPABLE_HERD';
        if (antiCC) return;
        if (stunSec > 0) target.status.stunSec = Math.max(target.status.stunSec, stunSec);
        if (slowSec > 0) {
            target.status.slowSec = Math.max(target.status.slowSec, slowSec);
            target.status.slowPct = Math.max(target.status.slowPct, slowPct);
        }
    }

    private zoneCenter(): Vec3 {
        return this.adapter.getZoneCenter?.() ?? ABILITIES_TUNING.DEFAULT_ZONE_CENTER;
    }

    private zoneRadius(): number {
        return this.adapter.getZoneRadiusM?.() ?? ABILITIES_TUNING.DEFAULT_ZONE_RADIUS_M;
    }

    private enemyPlayers(teamId: TeamId): PlayerState[] {
        return this.sortedPlayers().filter((p) => p.teamId !== teamId && p.alive);
    }

    private teamPlayers(teamId: TeamId): PlayerState[] {
        return this.sortedPlayers().filter((p) => p.teamId === teamId);
    }

    private nearestEnemyInRange(teamId: TeamId, origin: Vec3, rangeM: number): PlayerState | null {
        let best: PlayerState | null = null;
        let bestDist = Number.MAX_SAFE_INTEGER;
        for (const p of this.enemyPlayers(teamId)) {
            const d = vDist(origin, p.position);
            if (d > rangeM) continue;
            if (d < bestDist || (Math.abs(d - bestDist) < 1e-6 && Number(p.playerId) < Number(best?.playerId ?? p.playerId))) {
                best = p;
                bestDist = d;
            }
        }
        return best;
    }

    private sortedPlayers(): PlayerState[] {
        return Array.from(this.players.values()).sort((a, b) => Number(a.playerId) - Number(b.playerId));
    }

    private defaultStrikeTargets(caster: PlayerState): Vec3[] {
        const f = vNorm(caster.forward);
        const right = vNorm({ x: f.z, y: 0, z: -f.x });
        const origin = vAdd(caster.position, vScale(f, 10));
        return [
            origin,
            vAdd(origin, vScale(right, -3)),
            vAdd(origin, vScale(right, 3)),
        ];
    }

    private dropDurationFor(abilityKey: AbilityKey): number | null {
        switch (abilityKey) {
            case 'FORGE_LINK': return ABILITIES_TUNING.DROP.FORGE_LINK.durationSec;
            case 'SKY_EYE_RECON': return ABILITIES_TUNING.DROP.SKY_EYE_RECON.durationSec;
            case 'NEURO_TOXIN_CLOUD': return ABILITIES_TUNING.DROP.NEURO_TOXIN_CLOUD.durationSec;
            case 'STAMPEDE_OVERDRIVE': return ABILITIES_TUNING.DROP.STAMPEDE_OVERDRIVE.durationSec;
            case 'SCRAP_MAGNET': return ABILITIES_TUNING.DROP.SCRAP_MAGNET.durationSec;
            default: return ABILITIES[abilityKey].durationSec;
        }
    }

    private isCCAbility(abilityKey: AbilityKey): boolean {
        return abilityKey === 'SEISMIC_SLAM' || abilityKey === 'BASILISK_GAZE' || abilityKey === 'BATTERING_RAM';
    }

    getSprintSpeedMultiplier(playerId: EntityId): number {
        const p = this.players.get(playerId);
        if (!p) return 1;
        const drop = this.teamDropBuff.get(p.teamId)?.abilityKey;
        const passive = p.passiveKey;
        let multiplier = 1;
        if (passive === 'CHARGING_INSTINCT') {
            multiplier *= ABILITIES_TUNING.ABILITY.PASSIVE.CHARGING_INSTINCT.straightSprintMultiplier;
        }
        if (drop === 'STAMPEDE_OVERDRIVE') {
            multiplier *= ABILITIES_TUNING.DROP.STAMPEDE_OVERDRIVE.sprintSpeedMultiplier;
        }
        return multiplier;
    }

    getSignalGenerationMultiplier(teamId: TeamId): number {
        const aura = this.teamAuras.get(teamId);
        if (aura?.abilityKey !== 'SCAVENGERS_FEAST') return 1;
        return ABILITIES_TUNING.ABILITY.SCAVENGERS_FEAST.signalMultiplier;
    }

    isEnemyRevealedToTeam(observerTeamId: TeamId, targetId: EntityId): boolean {
        const target = this.players.get(targetId);
        if (!target || target.teamId === observerTeamId || !target.alive) return false;
        return this.teamDropBuff.get(observerTeamId)?.abilityKey === 'SKY_EYE_RECON';
    }

    getUltimateState(playerId: EntityId): 'READY' | 'CHARGING' | 'EMPTY' {
        const p = this.players.get(playerId);
        if (!p) return 'EMPTY';
        if (p.ultimateCharge >= 100) return 'READY';
        if (p.ultimateCharge <= 0) return 'EMPTY';
        return 'CHARGING';
    }

    getPendingCredits(teamId: TeamId): number {
        return this.pendingCreditsByTeam[teamId] ?? 0;
    }

    getPlayerTeam(playerId: EntityId): TeamId | null {
        return this.players.get(playerId)?.teamId ?? null;
    }

    getTacticalCharge(playerId: EntityId): number {
        return this.players.get(playerId)?.tacticalCharge ?? 0;
    }

    getUltimateCharge(playerId: EntityId): number {
        return this.players.get(playerId)?.ultimateCharge ?? 0;
    }

    getPlayerTacticalCooldowns(playerId: EntityId): Array<{ abilityKey: AbilityKey; remainingSec: number }> {
        const p = this.players.get(playerId);
        if (!p) return [];
        return Array.from(p.tacticalCooldowns.entries())
            .map(([abilityKey, remainingSec]) => ({ abilityKey, remainingSec }))
            .sort((a, b) => a.abilityKey.localeCompare(b.abilityKey));
    }

    getTeamActiveBuffs(teamId: TeamId): Array<{ kind: 'drop' | 'aura'; abilityKey: AbilityKey; remainingSec: number | null }> {
        const out: Array<{ kind: 'drop' | 'aura'; abilityKey: AbilityKey; remainingSec: number | null }> = [];
        const drop = this.teamDropBuff.get(teamId);
        if (drop) out.push({ kind: 'drop', abilityKey: drop.abilityKey, remainingSec: drop.remainingSec });
        const aura = this.teamAuras.get(teamId);
        if (aura) out.push({ kind: 'aura', abilityKey: aura.abilityKey, remainingSec: aura.remainingSec });
        return out;
    }

    getPlayerPassive(playerId: EntityId): AbilityKey | null {
        return this.players.get(playerId)?.passiveKey ?? null;
    }

    getPlayerPosition(playerId: EntityId): Vec3 | null {
        const p = this.players.get(playerId);
        if (!p) return null;
        return { ...p.position };
    }

    getPlayerForward(playerId: EntityId): Vec3 | null {
        const p = this.players.get(playerId);
        if (!p) return null;
        return { ...p.forward };
    }

    getTeamCenter(teamId: TeamId): Vec3 {
        const players = this.teamPlayers(teamId).filter((p) => p.alive);
        if (players.length === 0) return this.zoneCenter();
        let sx = 0;
        let sy = 0;
        let sz = 0;
        for (const p of players) {
            sx += p.position.x;
            sy += p.position.y;
            sz += p.position.z;
        }
        const inv = 1 / players.length;
        return { x: sx * inv, y: sy * inv, z: sz * inv };
    }

    getDeployablePosition(deployableId: string): Vec3 | null {
        const d = this.deployables.get(deployableId);
        if (!d) return null;
        return { ...d.position };
    }

    getSkyFireStrikeTargets(casterId: EntityId, payload?: AbilityCastPayload): Vec3[] {
        const caster = this.players.get(casterId);
        if (!caster || !caster.alive) return [];
        const targets = payload?.targets && payload.targets.length > 0
            ? payload.targets.slice(0, ABILITIES_TUNING.ABILITY.SKY_FIRE_STRIKE.strikeCount)
            : this.defaultStrikeTargets(caster);
        return targets.map((p) => ({ ...p }));
    }

    getTeamPlayerSnapshots(teamId: TeamId): Array<{ playerId: EntityId; position: Vec3; alive: boolean }> {
        return this.teamPlayers(teamId).map((p) => ({
            playerId: p.playerId,
            position: { ...p.position },
            alive: p.alive,
        }));
    }

    getBuffSourcePlayer(teamId: TeamId, abilityKey: AbilityKey): EntityId | null {
        const aura = this.teamAuras.get(teamId);
        if (aura?.abilityKey === abilityKey) return aura.sourcePlayerId;
        const drop = this.teamDropBuff.get(teamId);
        if (drop?.abilityKey === abilityKey) return drop.sourcePlayerId;
        return null;
    }

    getForgeLinkSegments(teamId: TeamId): Array<{ aId: EntityId; bId: EntityId; aPos: Vec3; bPos: Vec3 }> {
        const buff = this.teamDropBuff.get(teamId);
        if (!buff || buff.abilityKey !== 'FORGE_LINK') return [];
        const mates = this.teamPlayers(teamId).filter((p) => p.alive);
        const out: Array<{ aId: EntityId; bId: EntityId; aPos: Vec3; bPos: Vec3 }> = [];
        for (let i = 0; i < mates.length; i++) {
            for (let j = i + 1; j < mates.length; j++) {
                const a = mates[i]!;
                const b = mates[j]!;
                if (vDist(a.position, b.position) > ABILITIES_TUNING.DROP.FORGE_LINK.linkRangeM) continue;
                out.push({
                    aId: a.playerId,
                    bId: b.playerId,
                    aPos: { ...a.position },
                    bPos: { ...b.position },
                });
            }
        }
        return out;
    }

    getPassiveModifiers(playerId: EntityId): {
        jumpHeightMultiplier: number;
        midAirControlMultiplier: number;
        wallClimbEnabled: boolean;
        crouchVisibilityMultiplier: number;
        interactionSpeedMultiplier: number;
        hitboxScaleMultiplier: number;
        movementAbilitySlowdownMultiplier: number;
    } {
        const p = this.players.get(playerId);
        const key = p?.passiveKey ?? null;
        if (key === 'AERIAL_ADAPTATION') {
            return {
                jumpHeightMultiplier: ABILITIES_TUNING.ABILITY.PASSIVE.AERIAL_ADAPTATION.jumpHeightMultiplier,
                midAirControlMultiplier: ABILITIES_TUNING.ABILITY.PASSIVE.AERIAL_ADAPTATION.midAirControlMultiplier,
                wallClimbEnabled: false,
                crouchVisibilityMultiplier: 1,
                interactionSpeedMultiplier: 1,
                hitboxScaleMultiplier: 1,
                movementAbilitySlowdownMultiplier: 1,
            };
        }
        if (key === 'SERPENTINE_MOBILITY') {
            return {
                jumpHeightMultiplier: 1,
                midAirControlMultiplier: 1,
                wallClimbEnabled: ABILITIES_TUNING.ABILITY.PASSIVE.SERPENTINE_MOBILITY.wallClimbEnabled === 1,
                crouchVisibilityMultiplier: ABILITIES_TUNING.ABILITY.PASSIVE.SERPENTINE_MOBILITY.crouchVisibilityMultiplier,
                interactionSpeedMultiplier: 1,
                hitboxScaleMultiplier: 1,
                movementAbilitySlowdownMultiplier: 1,
            };
        }
        if (key === 'CHARGING_INSTINCT') {
            return {
                jumpHeightMultiplier: 1,
                midAirControlMultiplier: 1,
                wallClimbEnabled: false,
                crouchVisibilityMultiplier: 1,
                interactionSpeedMultiplier: 1,
                hitboxScaleMultiplier: 1,
                movementAbilitySlowdownMultiplier: ABILITIES_TUNING.ABILITY.PASSIVE.CHARGING_INSTINCT.movementAbilitySlowdownMultiplier,
            };
        }
        if (key === 'SCAVENGER_FRAME') {
            return {
                jumpHeightMultiplier: 1,
                midAirControlMultiplier: 1,
                wallClimbEnabled: false,
                crouchVisibilityMultiplier: 1,
                interactionSpeedMultiplier: ABILITIES_TUNING.ABILITY.PASSIVE.SCAVENGER_FRAME.interactionSpeedMultiplier,
                hitboxScaleMultiplier: ABILITIES_TUNING.ABILITY.PASSIVE.SCAVENGER_FRAME.hitboxScaleMultiplier,
                movementAbilitySlowdownMultiplier: 1,
            };
        }
        return {
            jumpHeightMultiplier: 1,
            midAirControlMultiplier: 1,
            wallClimbEnabled: false,
            crouchVisibilityMultiplier: 1,
            interactionSpeedMultiplier: 1,
            hitboxScaleMultiplier: 1,
            movementAbilitySlowdownMultiplier: 1,
        };
    }

    private cooldownRegenScaleFor(target: PlayerState): number {
        let scale = 1;
        for (const d of this.deployables.values()) {
            if (d.abilityKey !== 'NEURO_TOXIN_CLOUD') continue;
            if (d.ownerTeamId === target.teamId) continue;
            if (vDist(target.position, d.position) > d.radiusM) continue;
            scale = Math.min(scale, ABILITIES_TUNING.DROP.NEURO_TOXIN_CLOUD.cooldownRegenMultiplier);
        }
        return scale;
    }

    private tickStampedeOverdrive(): void {
        const byTeam = new Map<TeamId, PlayerState[]>();
        for (const p of this.sortedPlayers()) {
            if (!p.alive) continue;
            const buff = this.teamDropBuff.get(p.teamId);
            if (buff?.abilityKey !== 'STAMPEDE_OVERDRIVE') continue;
            const arr = byTeam.get(p.teamId) ?? [];
            arr.push(p);
            byTeam.set(p.teamId, arr);
        }

        for (const [teamId, rushers] of byTeam) {
            for (const rusher of rushers) {
                if (!this.isStampedeEligible(rusher)) continue;
                for (const enemy of this.enemyPlayers(teamId)) {
                    const d = vDist(rusher.position, enemy.position);
                    if (d > ABILITIES_TUNING.DROP.STAMPEDE_OVERDRIVE.knockbackRadiusM) continue;
                    const gateKey = `${rusher.playerId}:${enemy.playerId}`;
                    const nextAllowed = this.stampedeKnockbackAt.get(gateKey) ?? 0;
                    if (nextAllowed > this.nowSec) continue;
                    this.stampedeKnockbackAt.set(
                        gateKey,
                        this.nowSec + ABILITIES_TUNING.DROP.STAMPEDE_OVERDRIVE.knockbackCooldownSec
                    );
                    const dir = vNorm(vSub(enemy.position, rusher.position));
                    enemy.position = clampBounds(vAdd(enemy.position, vScale(dir, ABILITIES_TUNING.DROP.STAMPEDE_OVERDRIVE.knockbackDistanceM)));
                    this.adapter.setPlayerPosition?.(enemy.playerId, enemy.position);
                    this.eventBus.emit('ABILITY_HIT', {
                        casterId: rusher.playerId,
                        targetId: enemy.playerId,
                        abilityKey: 'STAMPEDE_OVERDRIVE',
                    });
                }
            }
        }

        for (const p of this.players.values()) {
            p.previousPosition = { ...p.position };
        }
    }

    private tickScrapMagnet(dt: number): void {
        const scrapTeams = new Set<TeamId>();
        for (const [teamId, buff] of this.teamDropBuff) {
            if (buff.abilityKey === 'SCRAP_MAGNET') scrapTeams.add(teamId);
        }
        if (scrapTeams.size === 0) return;

        for (const teamId of scrapTeams) {
            const source = this.teamPlayers(teamId)
                .filter((p) => p.alive)
                .sort((a, b) => Number(a.playerId) - Number(b.playerId))[0] ?? null;
            if (!source) continue;
            for (const pickup of this.fragmentPickups()) {
                const toSource = vSub(source.position, pickup.position);
                const dist = vLen(toSource);
                if (dist > ABILITIES_TUNING.DROP.SCRAP_MAGNET.pullRadiusM) continue;
                if (dist <= ABILITIES_TUNING.DROP.SCRAP_MAGNET.pickupCaptureRadiusM) {
                    this.adapter.consumeFragmentPickup?.(pickup.pickupId, teamId);
                    this.sandboxPickups.delete(pickup.pickupId);
                    this.scrapTokenVfxAt.delete(pickup.pickupId);
                    continue;
                }
                const from = { ...pickup.position };
                const step = Math.min(dist, ABILITIES_TUNING.DROP.SCRAP_MAGNET.pullSpeedMps * dt);
                const next = vAdd(pickup.position, vScale(vNorm(toSource), step));
                pickup.position = next;
                this.adapter.setFragmentPickupPosition?.(pickup.pickupId, next);
                if (!this.adapter.getFragmentPickups) {
                    this.sandboxPickups.set(pickup.pickupId, pickup);
                }
                const emitAt = this.scrapTokenVfxAt.get(pickup.pickupId) ?? 0;
                if (emitAt <= this.nowSec) {
                    this.scrapTokenVfxAt.set(pickup.pickupId, this.nowSec + 0.12);
                    this.eventBus.emit('SCRAP_MAGNET_TOKEN_PULL', {
                        teamId,
                        pickupId: pickup.pickupId,
                        startPos: from,
                        endPos: { ...source.position },
                    });
                }
            }
        }
    }

    private fragmentPickups(): FragmentPickupState[] {
        const fromAdapter = this.adapter.getFragmentPickups?.();
        if (fromAdapter) return fromAdapter.map((p) => ({ pickupId: p.pickupId, position: { ...p.position } }));
        return Array.from(this.sandboxPickups.values()).map((p) => ({ pickupId: p.pickupId, position: { ...p.position } }));
    }

    private isStampedeEligible(player: PlayerState): boolean {
        if (ABILITIES_TUNING.DROP.STAMPEDE_OVERDRIVE.knockbackRequireSprinting !== 1) return true;
        if (this.adapter.isPlayerSprinting) return this.adapter.isPlayerSprinting(player.playerId);
        const moved = vDist(player.position, player.previousPosition);
        return moved > ABILITIES_TUNING.DROP.STAMPEDE_OVERDRIVE.minSprintDistancePerTickM;
    }

    private maxHpForPassive(passiveKey: AbilityKey | null): number {
        if (passiveKey === 'BULWARK_PHYSIOLOGY') {
            return ABILITIES_TUNING.BASE_PLAYER_HP * ABILITIES_TUNING.ABILITY.PASSIVE.BULWARK_PHYSIOLOGY.maxHpMultiplier;
        }
        return ABILITIES_TUNING.BASE_PLAYER_HP;
    }
}
