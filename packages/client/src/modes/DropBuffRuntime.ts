import {
    GameEventType,
    type GameEventMap,
    type JsonVec3,
    type PlayerSnapshot,
    type Team,
} from '../types/SignalProtocol';

export type DropBuffKey =
    | 'FORGE_LINK'
    | 'SKY_EYE_RECON'
    | 'NEURO_TOXIN_CLOUD'
    | 'STAMPEDE_OVERDRIVE'
    | 'SCRAP_MAGNET';

export type DropBuffEndReason = 'expired' | 'replaced' | 'break_200';

type ForgeLinkMeta = {
    absorbedTotal: number;
};

type ToxinMeta = {
    center: JsonVec3;
    radius: number;
    nextTickAtMs: number;
};

type StampedeMeta = {
    knockGateByPair: Map<string, number>;
};

type ScrapMeta = {
    lastPullTickAtMs: number;
};

type ActiveDropBuff = {
    key: DropBuffKey;
    team: Team;
    startT: number;
    endT: number;
    forge?: ForgeLinkMeta;
    toxin?: ToxinMeta;
    stampede?: StampedeMeta;
    scrap?: ScrapMeta;
};

export type ActiveTeamDropBuff = {
    key: DropBuffKey;
    team: Team;
    startT: number;
    endT: number;
};

type TeamState = {
    activeBuff?: ActiveDropBuff;
    pendingCredits: number;
};

export type FragmentPickup = {
    id: string;
    position: JsonVec3;
};

type RuntimeCallbacks = {
    emitEvent: <T extends GameEventType>(type: T, data: GameEventMap[T]) => void;
    onApplyToxinDamage?: (playerId: string, damage: number) => void;
    onApplyStampedeKnockback?: (attackerId: string, victimId: string, impulse: JsonVec3) => void;
    onScrapPullTick?: (pickupId: string, team: Team, from: JsonVec3, to: JsonVec3) => void;
    onScrapCollected?: (pickupId: string, team: Team) => void;
};

const BUFF_DURATION_MS: Record<DropBuffKey, number> = {
    FORGE_LINK: 15_000,
    SKY_EYE_RECON: 12_000,
    NEURO_TOXIN_CLOUD: 8_000,
    STAMPEDE_OVERDRIVE: 12_000,
    SCRAP_MAGNET: 12_000,
};

const FORGE_LINK_RANGE_M = 20;
const FORGE_REDUCED_FACTOR = 0.70;
const FORGE_BREAK_ABSORB = 200;
const TOXIN_DPS = 5;
const TOXIN_TICK_HZ = 10;
const TOXIN_TICK_MS = Math.floor(1000 / TOXIN_TICK_HZ);
const TOXIN_COOLDOWN_REGEN_MULT = 0.4;
const STAMPEDE_KNOCK_GATE_MS = 1500;
const STAMPEDE_TOUCH_RADIUS = 1.4;
const STAMPEDE_PUSH_M = 3.2;
const STAMPEDE_SPEED_THRESHOLD_MPS = 6.0;
const SCRAP_PENDING_CREDITS = 100;
const SCRAP_PULL_RADIUS_M = 18;
const SCRAP_PULL_SPEED_MPS = 20;
const SCRAP_CAPTURE_RADIUS_M = 0.75;
const SCRAP_PULL_TICK_MS = 120;

function dist2D(a: JsonVec3, b: JsonVec3): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
}

function normalize2D(from: JsonVec3, to: JsonVec3): { x: number; z: number; d: number } {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d <= 1e-6) return { x: 0, z: 0, d: 0 };
    return { x: dx / d, z: dz / d, d };
}

function enemyTeam(team: Team): Team {
    return team === 'blue' ? 'red' : 'blue';
}

export class DropBuffRuntime {
    private readonly teams: Record<Team, TeamState> = {
        blue: { pendingCredits: 0 },
        red: { pendingCredits: 0 },
    };
    private readonly prevPos = new Map<string, JsonVec3>();
    private pickups = new Map<string, FragmentPickup>();

    constructor(private readonly cb: RuntimeCallbacks) {}

    hasBuff(team: Team, key: DropBuffKey): boolean {
        return this.teams[team].activeBuff?.key === key;
    }

    getActiveBuff(team: Team): ActiveTeamDropBuff | null {
        const active = this.teams[team].activeBuff;
        if (!active) return null;
        return {
            key: active.key,
            team: active.team,
            startT: active.startT,
            endT: active.endT,
        };
    }

    getPendingCredits(team: Team): number {
        return this.teams[team].pendingCredits;
    }

    setFragmentPickups(next: FragmentPickup[]): void {
        this.pickups.clear();
        for (const p of next) this.pickups.set(p.id, { id: p.id, position: { ...p.position } });
    }

    getFragmentPickups(): FragmentPickup[] {
        return Array.from(this.pickups.values()).map((p) => ({ id: p.id, position: { ...p.position } }));
    }

    applyBuffFromExtraction(
        team: Team,
        buffKey: DropBuffKey,
        now: number,
        context: { hardpointCenter?: JsonVec3; toxinRadius: number }
    ): void {
        // Policy: REPLACE existing active team drop buff immediately.
        const existing = this.teams[team].activeBuff;
        if (existing) this.endBuff(team, now, 'replaced');

        const active: ActiveDropBuff = {
            key: buffKey,
            team,
            startT: now,
            endT: now + BUFF_DURATION_MS[buffKey],
        };
        if (buffKey === 'FORGE_LINK') {
            active.forge = { absorbedTotal: 0 };
        } else if (buffKey === 'NEURO_TOXIN_CLOUD') {
            const center = context.hardpointCenter ?? { x: 0, y: 0, z: 0 };
            active.toxin = {
                center: { ...center },
                radius: context.toxinRadius,
                nextTickAtMs: now + TOXIN_TICK_MS,
            };
        } else if (buffKey === 'STAMPEDE_OVERDRIVE') {
            active.stampede = { knockGateByPair: new Map() };
        } else if (buffKey === 'SCRAP_MAGNET') {
            active.scrap = { lastPullTickAtMs: now };
            this.teams[team].pendingCredits += SCRAP_PENDING_CREDITS;
        }

        this.teams[team].activeBuff = active;
        this.cb.emitEvent(GameEventType.DROP_BUFF_START, {
            team,
            key: active.key,
            startT: active.startT,
            endT: active.endT,
            extraPayload: this.startPayload(active),
        });
        if (active.toxin) {
            this.cb.emitEvent(GameEventType.TOXIN_START, {
                team,
                center: { ...active.toxin.center },
                radius: active.toxin.radius,
                endT: active.endT,
            });
        }
        if (active.key === 'SCRAP_MAGNET') {
            this.cb.emitEvent(GameEventType.SCRAP_MAGNET_START, { team, endT: active.endT });
        }
    }

    resolveDamageDistribution(victimId: string, incomingDamage: number, players: PlayerSnapshot[], now: number): Array<{ playerId: string; damage: number }> {
        const victim = players.find((p) => p.id === victimId);
        if (!victim || !victim.isAlive || incomingDamage <= 0) {
            return [{ playerId: victimId, damage: Math.max(0, incomingDamage) }];
        }
        const active = this.teams[victim.team].activeBuff;
        if (!active || active.key !== 'FORGE_LINK' || !active.forge) {
            return [{ playerId: victimId, damage: incomingDamage }];
        }

        const linked = players.filter((p) => p.isAlive && p.team === victim.team && dist2D(p.position, victim.position) <= FORGE_LINK_RANGE_M);
        if (linked.length <= 1) return [{ playerId: victimId, damage: incomingDamage }];

        const reducedTotal = incomingDamage * FORGE_REDUCED_FACTOR;
        const perPlayer = reducedTotal / linked.length;
        active.forge.absorbedTotal += (incomingDamage - reducedTotal);

        this.cb.emitEvent(GameEventType.FORGE_LINK_PULSE, {
            team: victim.team,
            sourceVictimId: victimId,
            linkedPlayerIds: linked.map((p) => p.id),
            incomingDamage,
            reducedTotalDamage: reducedTotal,
            perPlayerDamage: perPlayer,
            absorbedTotal: active.forge.absorbedTotal,
        });

        if (active.forge.absorbedTotal >= FORGE_BREAK_ABSORB) {
            this.endBuff(victim.team, now, 'break_200');
        }

        return linked.map((p) => ({ playerId: p.id, damage: perPlayer }));
    }

    getSprintSpeedMultiplier(team: Team): number {
        return this.hasBuff(team, 'STAMPEDE_OVERDRIVE') ? 1.5 : 1;
    }

    shouldIgnoreHeavyPenalty(team: Team): boolean {
        return this.hasBuff(team, 'STAMPEDE_OVERDRIVE');
    }

    getCooldownRegenMultiplierFor(player: PlayerSnapshot): number {
        const enemy = enemyTeam(player.team);
        const active = this.teams[enemy].activeBuff;
        if (!active || active.key !== 'NEURO_TOXIN_CLOUD' || !active.toxin) return 1;
        return dist2D(player.position, active.toxin.center) <= active.toxin.radius
            ? TOXIN_COOLDOWN_REGEN_MULT
            : 1;
    }

    update(dt: number, now: number, players: PlayerSnapshot[]): void {
        this.tickExpiry(now);
        this.tickToxin(now, players);
        this.tickStampede(now, dt, players);
        this.tickScrapMagnet(now, dt, players);
        for (const p of players) {
            this.prevPos.set(p.id, { ...p.position });
        }
    }

    private tickExpiry(now: number): void {
        (['blue', 'red'] as Team[]).forEach((team) => {
            const active = this.teams[team].activeBuff;
            if (!active) return;
            if (now < active.endT) return;
            this.endBuff(team, now, 'expired');
        });
    }

    private tickToxin(now: number, players: PlayerSnapshot[]): void {
        (['blue', 'red'] as Team[]).forEach((team) => {
            const active = this.teams[team].activeBuff;
            if (!active || active.key !== 'NEURO_TOXIN_CLOUD' || !active.toxin) return;
            if (now < active.toxin.nextTickAtMs) return;
            active.toxin.nextTickAtMs += TOXIN_TICK_MS;
            const enemy = enemyTeam(team);
            const tickDamage = TOXIN_DPS / TOXIN_TICK_HZ;
            for (const p of players) {
                if (!p.isAlive || p.team !== enemy) continue;
                if (dist2D(p.position, active.toxin.center) > active.toxin.radius) continue;
                this.cb.onApplyToxinDamage?.(p.id, tickDamage);
            }
        });
    }

    private tickStampede(now: number, dt: number, players: PlayerSnapshot[]): void {
        (['blue', 'red'] as Team[]).forEach((team) => {
            const active = this.teams[team].activeBuff;
            if (!active || active.key !== 'STAMPEDE_OVERDRIVE' || !active.stampede) return;
            const enemies = players.filter((p) => p.isAlive && p.team !== team);
            const allies = players.filter((p) => p.isAlive && p.team === team);
            for (const attacker of allies) {
                const prev = this.prevPos.get(attacker.id) ?? attacker.position;
                const speed = dist2D(attacker.position, prev) / Math.max(0.001, dt);
                if (speed < STAMPEDE_SPEED_THRESHOLD_MPS) continue;
                for (const victim of enemies) {
                    if (dist2D(attacker.position, victim.position) > STAMPEDE_TOUCH_RADIUS) continue;
                    const gateKey = `${attacker.id}:${victim.id}`;
                    const nextAllowed = active.stampede.knockGateByPair.get(gateKey) ?? 0;
                    if (nextAllowed > now) continue;
                    active.stampede.knockGateByPair.set(gateKey, now + STAMPEDE_KNOCK_GATE_MS);
                    const dir = normalize2D(attacker.position, victim.position);
                    const impulse = { x: dir.x * STAMPEDE_PUSH_M, y: 0, z: dir.z * STAMPEDE_PUSH_M };
                    this.cb.onApplyStampedeKnockback?.(attacker.id, victim.id, impulse);
                    this.cb.emitEvent(GameEventType.STAMPEDE_KNOCK, {
                        team,
                        attackerId: attacker.id,
                        victimId: victim.id,
                        impulse,
                        cooldownMs: STAMPEDE_KNOCK_GATE_MS,
                    });
                }
            }
        });
    }

    private tickScrapMagnet(now: number, dt: number, players: PlayerSnapshot[]): void {
        (['blue', 'red'] as Team[]).forEach((team) => {
            const active = this.teams[team].activeBuff;
            if (!active || active.key !== 'SCRAP_MAGNET' || !active.scrap) return;
            if (this.pickups.size === 0) return;
            const allies = players.filter((p) => p.isAlive && p.team === team);
            if (allies.length === 0) return;

            for (const pickup of this.pickups.values()) {
                let nearest: PlayerSnapshot | null = null;
                let nearestD = Number.POSITIVE_INFINITY;
                for (const ally of allies) {
                    const d = dist2D(pickup.position, ally.position);
                    if (d < nearestD) {
                        nearestD = d;
                        nearest = ally;
                    }
                }
                if (!nearest || nearestD > SCRAP_PULL_RADIUS_M) continue;
                if (nearestD <= SCRAP_CAPTURE_RADIUS_M) {
                    this.pickups.delete(pickup.id);
                    this.cb.onScrapCollected?.(pickup.id, team);
                    continue;
                }
                const dir = normalize2D(pickup.position, nearest.position);
                const step = Math.min(nearestD, SCRAP_PULL_SPEED_MPS * dt);
                const from = { ...pickup.position };
                pickup.position = {
                    x: pickup.position.x + dir.x * step,
                    y: pickup.position.y,
                    z: pickup.position.z + dir.z * step,
                };
                if (now >= active.scrap.lastPullTickAtMs + SCRAP_PULL_TICK_MS) {
                    this.cb.onScrapPullTick?.(pickup.id, team, from, { ...pickup.position });
                }
            }
            if (now >= active.scrap.lastPullTickAtMs + SCRAP_PULL_TICK_MS) {
                active.scrap.lastPullTickAtMs = now;
            }
        });
    }

    private endBuff(team: Team, now: number, reason: DropBuffEndReason): void {
        const active = this.teams[team].activeBuff;
        if (!active) return;
        if (active.key === 'NEURO_TOXIN_CLOUD' && active.toxin) {
            this.cb.emitEvent(GameEventType.TOXIN_END, { team, t: now, reason });
        }
        if (active.key === 'SCRAP_MAGNET') {
            this.cb.emitEvent(GameEventType.SCRAP_MAGNET_END, { team, t: now, reason });
        }
        this.cb.emitEvent(GameEventType.DROP_BUFF_END, {
            team,
            key: active.key,
            t: now,
            reason,
        });
        delete this.teams[team].activeBuff;
    }

    private startPayload(active: ActiveDropBuff): Record<string, number | string> | undefined {
        if (active.key === 'FORGE_LINK') return { linkRangeM: FORGE_LINK_RANGE_M, damageReductionPct: 0.3, breakAbsorb: FORGE_BREAK_ABSORB };
        if (active.key === 'NEURO_TOXIN_CLOUD' && active.toxin) return { radiusM: active.toxin.radius, dps: TOXIN_DPS };
        if (active.key === 'STAMPEDE_OVERDRIVE') return { sprintMul: 1.5, knockGateMs: STAMPEDE_KNOCK_GATE_MS };
        if (active.key === 'SCRAP_MAGNET') return { pendingCredits: SCRAP_PENDING_CREDITS };
        return undefined;
    }
}
