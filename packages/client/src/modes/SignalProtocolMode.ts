import {
    type DropBuffKey,
    DropRewardType,
    DropState,
    GameEventType,
    type ActiveBuff,
    type GameEvent,
    type GameEventMap,
    type JsonVec3,
    type MatchReceipt,
    type PlayerSnapshot,
    type SignalMatchFlowState,
    type SignalProtocolModeConfig,
    type SignalProtocolState,
    type SignalZoneSnapshot,
    type Team,
} from '../types/SignalProtocol';
import { DropBuffRuntime, type FragmentPickup } from './DropBuffRuntime';
import type { HardpointManager } from '../systems/HardpointManager';
import {
    createSignalAuthorityClient,
    type SignalAuthorityAction as SnapAction,
    type SignalAuthorityManifest as SnapManifest,
    type SignalAuthorityState as SnapState,
} from './SignalAuthorityEngine';

type SignalProtocolLocalAdapter<TEvent> = {
    record(event: TEvent): void;
};

interface SignalProtocolOptions {
    targetSignal?: number;
    modeConfig?: Partial<SignalProtocolModeConfig>;
    onEvent?: (event: GameEvent) => void;
    onAnnounce?: (message: string, severity?: 'info' | 'warning' | 'success') => void;
    onApplyBoundaryDamage?: (playerId: string, damage: number) => void;
    onInstantRespawn?: (playerId: string) => void;
    onSetUltimateCharge?: (playerId: string, charge: number) => void;
    onApplyStampedeKnockback?: (attackerId: string, victimId: string, impulse: JsonVec3) => void;
    onApplyToxinDamage?: (playerId: string, damage: number) => void;
    onScrapPullTick?: (pickupId: string, team: Team, from: JsonVec3, to: JsonVec3) => void;
    onScrapCollected?: (pickupId: string, team: Team) => void;
    onAuthorityAction?: (action: SnapAction) => void;
    hardAuthority?: boolean;
    authorityAdapter?: SignalProtocolLocalAdapter<GameEvent>;
}

const WIN_SIGNAL = 500;
/**
 * Flow: PREMATCH_LOADOUT -> LIVE -> POSTMATCH.
 * Hardpoint timing loop while LIVE:
 * 1) Zone 1 starts in COUNTDOWN.
 * 2) COUNTDOWN blocks capture/scoring, then transitions to ACTIVE.
 * 3) ACTIVE allows capture + 1 signal/sec scoring while owned and not contested.
 * 4) On rotate, outgoing zone is cleared and next zone starts COUNTDOWN.
 *
 * Drops preserved: active drops are not despawned on rotate; they continue until
 * capture/timeout with existing extraction behavior unchanged.
 */
const DEFAULT_MODE_CONFIG: SignalProtocolModeConfig = {
    winSignal: WIN_SIGNAL,
    zoneCountdownSec: 30,
    zoneActiveSec: 60,
    signalPerSecond: 1,
};
const DROP_INTERVAL_SECONDS = 30;
const DROP_INCOMING_SECONDS = 2;
const DROP_EXTRACT_SECONDS = 8;
const DROP_EXPIRE_SECONDS = 60;
const EXTRACTION_RADIUS = 5;
const TOXIN_RADIUS = 6;
const COLLAPSE_CHECK_SECONDS = 7 * 60;
const COLLAPSE_WARNING_SECONDS = 25;
const COLLAPSE_START_RADIUS = 50;
const COLLAPSE_MIN_RADIUS = 20;
const COLLAPSE_SHRINK_PER_SEC = 1;
const COLLAPSE_DAMAGE_PER_SEC = 5;
const GOLDEN_DROP_DELAY_SECONDS = 30;
const SNAP_PRESENCE_INTERVAL_MS = 33;
const SIGNAL_ACTIVE_ZONE_IDS = ['hardpoint1', 'hardpoint2', 'hardpoint4'] as const;

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function distance2D(a: JsonVec3, b: JsonVec3): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
}

function getMonoNowMs(): number {
    if (typeof performance !== 'undefined' && Number.isFinite(performance.now())) {
        return performance.now();
    }
    return Date.now();
}

type SnapDropState = 'INACTIVE' | 'INCOMING' | 'LANDED' | 'EXTRACTING' | 'EXTRACTED' | 'EXPIRED';

function toDropRewardType(raw: string): DropRewardType {
    switch (raw) {
        case DropRewardType.FORGE_LINK:
            return DropRewardType.FORGE_LINK;
        case DropRewardType.SKY_EYE_RECON:
            return DropRewardType.SKY_EYE_RECON;
        case DropRewardType.NEURO_TOXIN_CLOUD:
            return DropRewardType.NEURO_TOXIN_CLOUD;
        case DropRewardType.STAMPEDE_OVERDRIVE:
            return DropRewardType.STAMPEDE_OVERDRIVE;
        case DropRewardType.SCRAP_MAGNET:
            return DropRewardType.SCRAP_MAGNET;
        case DropRewardType.GOLDEN_SIGNAL:
            return DropRewardType.GOLDEN_SIGNAL;
        default:
            return DropRewardType.FORGE_LINK;
    }
}

type SnapHardpointView = {
    activeZoneIndex: number;
    zonePhase: 'COUNTDOWN' | 'ACTIVE';
    phaseEndsAtSec: number | null;
    ownerTeamId: Team | null;
    contested: boolean;
    presenceByTeam: Record<string, number>;
    dropScheduleRemainingMs: number;
    drop: {
        state: SnapDropState;
        dropId: string | null;
        zoneIndex: number | null;
        eligibleTeamId: Team | null;
        endsAtMs: number | null;
        extractProgressMs: number;
        rewardKey: string;
        extractingTeamId?: string;
        extractingPlayerId?: string;
    };
    grantedDropIds: Record<string, true>;
    activeDropBuffByTeam: Record<string, string>;
    activeDropBuffEndsAtMsByTeam: Record<string, number | null>;
};

export type SnapDebugInfo = {
    enabled: boolean;
    backend: 'local' | 'magicblock';
    seq: number;
    stateHash: string;
    signalBlue: number;
    signalRed: number;
    activeZoneIndex: number;
    zonePhase: 'COUNTDOWN' | 'ACTIVE';
    zoneRemainingSec: number;
    activeDropModifierId: string | null;
};

function getSnapSignalCounters(state: SnapState): { blue: number; red: number } {
    const scoring = (state.modules.scoring ?? {}) as { counters?: Record<string, Record<string, number>> };
    const signal = scoring.counters?.signal ?? {};
    return {
        blue: Number(signal.blue ?? 0),
        red: Number(signal.red ?? 0),
    };
}

function getSnapHardpointView(state: SnapState): SnapHardpointView {
    const raw = (state.custom.snapshotHardpoint ?? {}) as Partial<SnapHardpointView> & {
        phaseEndsAtMs?: number;
    };
    const dropRaw = raw.drop;
    const dropState: SnapDropState = dropRaw?.state === 'INCOMING'
        || dropRaw?.state === 'LANDED'
        || dropRaw?.state === 'EXTRACTING'
        || dropRaw?.state === 'EXTRACTED'
        || dropRaw?.state === 'EXPIRED'
        ? dropRaw.state
        : 'INACTIVE';
    return {
        activeZoneIndex: Number.isFinite(raw.activeZoneIndex) ? Number(raw.activeZoneIndex) : 0,
        zonePhase: raw.zonePhase === 'ACTIVE' ? 'ACTIVE' : 'COUNTDOWN',
        phaseEndsAtSec: Number.isFinite((raw as any).phaseEndsAtMs) ? Number((raw as any).phaseEndsAtMs) / 1000 : null,
        ownerTeamId: raw.ownerTeamId === 'blue' || raw.ownerTeamId === 'red' ? raw.ownerTeamId : null,
        contested: Boolean(raw.contested),
        presenceByTeam: { ...(raw.presenceByTeam ?? {}) },
        dropScheduleRemainingMs: Number.isFinite(raw.dropScheduleRemainingMs) ? Math.max(0, Number(raw.dropScheduleRemainingMs)) : 0,
        drop: {
            state: dropState,
            dropId: dropRaw?.dropId ? String(dropRaw.dropId) : null,
            zoneIndex: Number.isFinite(dropRaw?.zoneIndex) ? Number(dropRaw?.zoneIndex) : null,
            eligibleTeamId: dropRaw?.eligibleTeamId === 'blue' || dropRaw?.eligibleTeamId === 'red'
                ? dropRaw.eligibleTeamId
                : null,
            endsAtMs: Number.isFinite(dropRaw?.endsAtMs) ? Number(dropRaw?.endsAtMs) : null,
            extractProgressMs: Number.isFinite(dropRaw?.extractProgressMs) ? Number(dropRaw?.extractProgressMs) : 0,
            rewardKey: typeof dropRaw?.rewardKey === 'string' && dropRaw.rewardKey ? String(dropRaw.rewardKey) : 'FORGE_LINK',
            ...(dropRaw?.extractingTeamId ? { extractingTeamId: String(dropRaw.extractingTeamId) } : {}),
            ...(dropRaw?.extractingPlayerId ? { extractingPlayerId: String(dropRaw.extractingPlayerId) } : {}),
        },
        grantedDropIds: { ...(raw.grantedDropIds ?? {}) },
        activeDropBuffByTeam: { ...(raw.activeDropBuffByTeam ?? {}) },
        activeDropBuffEndsAtMsByTeam: { ...((raw as any).activeDropBuffEndsAtMsByTeam ?? {}) },
    };
}

function decodeDropBuffKey(modifierId: string | undefined): DropBuffKey | null {
    if (!modifierId) return null;
    const normalized = modifierId.startsWith('dropbuff:') ? modifierId.slice('dropbuff:'.length) : modifierId;
    if (!normalized) return null;
    return normalized as DropBuffKey;
}

function dropBuffFromChainCode(code: number): DropBuffKey | null {
    if (code === 1) return 'FORGE_LINK';
    if (code === 2) return 'SKY_EYE_RECON';
    if (code === 3) return 'NEURO_TOXIN_CLOUD';
    if (code === 4) return 'STAMPEDE_OVERDRIVE';
    if (code === 5) return 'SCRAP_MAGNET';
    return null;
}

function dropStateFromChainCode(code: number): SnapDropState {
    if (code === 1) return 'INCOMING';
    if (code === 2) return 'LANDED';
    if (code === 3) return 'EXTRACTING';
    if (code === 4) return 'EXTRACTED';
    if (code === 5) return 'EXPIRED';
    return 'INACTIVE';
}

export class SignalProtocolMode {
    private readonly state: SignalProtocolState;
    private readonly eventQueue: GameEvent[] = [];
    private readonly eventLog: GameEvent[] = [];
    private readonly receipts: MatchReceipt['capturedDrops'] = [];
    private readonly capturedSnapDropIds: Record<string, true> = {};
    private readonly onEvent: ((event: GameEvent) => void) | null;
    private readonly onAnnounce: ((message: string, severity?: 'info' | 'warning' | 'success') => void) | null;
    private readonly onApplyBoundaryDamage: ((playerId: string, damage: number) => void) | null;
    private readonly onInstantRespawn: ((playerId: string) => void) | null;
    private readonly dropBuffRuntime: DropBuffRuntime;
    private eventSeq = 0;
    private timeScale = 1;
    private lastNow = 0;
    private lastPlayers: PlayerSnapshot[] = [];
    private readonly interactIntentByPlayerId: Record<string, boolean> = {};
    private readonly dropDamageSinceLastTickByPlayerId: Record<string, boolean> = {};
    private readonly extractionIntentActiveByPlayerId: Record<string, boolean> = {};
    private readonly modeConfig: SignalProtocolModeConfig;
    private readonly authorityAdapter: SignalProtocolLocalAdapter<GameEvent> | null;
    private readonly onAuthorityAction: ((action: SnapAction) => void) | null;
    private readonly hardAuthority: boolean;
    private readonly useSnapAuthority: boolean;
    private readonly snapClient: ReturnType<typeof createSignalAuthorityClient>;
    private snapBackend: 'local' | 'magicblock';
    private snapState: SnapState;
    private snapMatchId = 'signal-protocol-local';
    private authorityTickCarrySec = 0;
    private chainAuthoritySeq = 0;
    private chainAuthorityHash = '';
    private chainAuthorityZoneIndex = 0;
    private chainAuthorityZonePhase: 'COUNTDOWN' | 'ACTIVE' = 'COUNTDOWN';
    private chainAuthorityZoneRemainingSec = 0;
    private chainAuthorityBuffByTeam: Record<Team, DropBuffKey | null> = { blue: null, red: null };
    private chainAuthorityBuffEndsAtByTeam: Record<Team, number | null> = { blue: null, red: null };
    private chainAuthoritySignal: { blue: number; red: number } | null = null;
    private chainAuthorityFlow: SignalMatchFlowState | null = null;
    private powerupBurnNonce = 0;
    private lastSnapPresenceAtMs = 0;
    private zoneOrderIds: string[] = [];
    private zoneState: SignalZoneSnapshot = {
        activeZoneIndex: 0,
        activeZoneId: null,
        state: 'COUNTDOWN',
        stateEndsAtSec: 0,
        countdownRemainingSec: 0,
        activeRemainingSec: 0,
        ownerTeamId: null,
        contested: false,
    };
    private zoneLoopStarted = false;

    constructor(startTime: number, options: SignalProtocolOptions = {}) {
        this.onEvent = options.onEvent ?? null;
        this.onAnnounce = options.onAnnounce ?? null;
        this.onApplyBoundaryDamage = options.onApplyBoundaryDamage ?? null;
        this.onInstantRespawn = options.onInstantRespawn ?? null;
        this.onAuthorityAction = options.onAuthorityAction ?? null;
        this.authorityAdapter = options.authorityAdapter ?? null;
        this.hardAuthority = Boolean(options.hardAuthority);
        const runtimeCallbacks = {
            emitEvent: <T extends GameEventType>(type: T, data: GameEventMap[T]) => this.emitEvent(type as any, data as any),
            ...(options.onApplyToxinDamage ? { onApplyToxinDamage: options.onApplyToxinDamage } : {}),
            ...(options.onApplyStampedeKnockback ? { onApplyStampedeKnockback: options.onApplyStampedeKnockback } : {}),
            ...(options.onScrapPullTick ? { onScrapPullTick: options.onScrapPullTick } : {}),
            ...(options.onScrapCollected ? { onScrapCollected: options.onScrapCollected } : {}),
        };
        this.dropBuffRuntime = new DropBuffRuntime(runtimeCallbacks);
        this.lastNow = startTime;
        this.modeConfig = { ...DEFAULT_MODE_CONFIG, ...(options.modeConfig ?? {}) };
        const env = (import.meta as any).env ?? {};
        this.useSnapAuthority = true;
        const backendRaw = String(env.SNAP_BACKEND ?? env.SNAP_AUTHORITY_BACKEND ?? 'local').toLowerCase();
        this.snapBackend = backendRaw === 'magicblock' ? 'magicblock' : 'local';
        const manifest: SnapManifest = {
            version: '1',
            gameId: 'snapshot',
            rulesetId: 'ingame-signal-hardpoint',
            ruleVars: {
                matchId: { type: 'string', value: `signal-protocol-${Date.now()}` },
                zoneCount: { type: 'number', value: 3 },
                dropIntervalSec: { type: 'number', value: DROP_INTERVAL_SECONDS },
                dropIncomingSec: { type: 'number', value: DROP_INCOMING_SECONDS },
                dropExtractSec: { type: 'number', value: DROP_EXTRACT_SECONDS },
                dropExpireSec: { type: 'number', value: DROP_EXPIRE_SECONDS },
            },
        };
        this.snapMatchId = String((manifest.ruleVars?.matchId as any)?.value ?? this.snapMatchId);
        this.snapState = {
            matchId: this.snapMatchId,
            phase: 'PREMATCH',
            seq: 0,
            stateHash: '',
            ruleVars: { ...(manifest.ruleVars ?? {}) },
            modules: {
                scoring: { counters: { signal: { blue: 0, red: 0 } } },
            },
            custom: {
                snapshotHardpoint: {
                    activeZoneIndex: 0,
                    zonePhase: 'COUNTDOWN',
                    phaseEndsAtMs: getMonoNowMs() + (this.modeConfig.zoneCountdownSec * 1000),
                    ownerTeamId: null,
                    contested: false,
                    presenceByTeam: { blue: 0, red: 0 },
                    dropSeq: 0,
                    dropScheduleRemainingMs: DROP_INTERVAL_SECONDS * 1000,
                    selectedLoadoutSlot: null,
                    drop: {
                        state: 'INACTIVE',
                        dropId: null,
                        zoneIndex: null,
                        eligibleTeamId: null,
                        endsAtMs: null,
                        extractProgressMs: 0,
                        rewardKey: 'FORGE_LINK',
                    },
                    grantedDropIds: {},
                    activeDropBuffByTeam: {},
                    activeDropBuffEndsAtMsByTeam: {},
                },
            },
        };
        if (this.snapBackend === 'magicblock') {
            console.warn('[SignalProtocol] SNAP_BACKEND=magicblock requested. Using in-game authority for now; add MagicBlock bridge to mirror actions on-chain.');
            this.snapBackend = 'local';
        }
        this.snapClient = createSignalAuthorityClient(manifest);
        this.snapClient.subscribe((state: SnapState) => {
            this.snapState = state;
            this.snapMatchId = state.matchId;
        });
        this.state = {
            matchFlowState: 'PREMATCH_LOADOUT',
            matchStartTime: startTime,
            elapsedSeconds: 0,
            signal: { blue: 0, red: 0 },
            signalPaused: false,
            signalEmitBuckets: { blue: 0, red: 0 },
            pendingSignalAmounts: { blue: 0, red: 0 },
            targetSignal: options.targetSignal ?? this.modeConfig.winSignal,
            nextDropIn: 0,
            currentDrop: null,
            extraction: {
                activePlayerId: null,
                progressSeconds: 0,
                lastProgressEmitAt: 0,
            },
            buffs: {
                activeBuffs: [],
                overshields: {},
                respawnTokens: { blue: false, red: false },
                fragmentCaches: { blue: 0, red: 0 },
            },
            suddenDeath: {
                warningActive: false,
                active: false,
                shrinkRadius: COLLAPSE_START_RADIUS,
                lastBoundaryDamageTick: startTime,
                goldenDropSpawned: false,
            },
            matchEnded: false,
            winner: null,
        };
    }

    tick(dt: number, hardpointManager: HardpointManager, players: PlayerSnapshot[], now: number = performance.now()): void {
        if (this.state.matchEnded) return;
        this.lastNow = now;
        this.lastPlayers = players;
        const simDt = dt * this.timeScale;
        this.state.elapsedSeconds += simDt;
        this.syncSnapPresence(hardpointManager, players, now, false);
        this.syncSnapZoneControl(hardpointManager);
        this.applySnap('TICK', { dtSec: simDt }, hardpointManager, now / 1000);
        this.syncStateFromSnap(hardpointManager);
        if (this.state.matchFlowState !== 'LIVE') {
            this.flushEvents();
            return;
        }

        this.dispatchDropExtractionActions(players, hardpointManager, simDt);
        if (!this.hardAuthority) {
            this.dropBuffRuntime.update(simDt, now, players);
        }
        this.checkSuddenDeathTrigger(now);
        this.applySuddenDeathBoundary(simDt, hardpointManager, players, now);
        this.flushEvents();
    }

    emitEvent<T extends GameEventType>(type: T, data: GameEventMap[T]): void {
        const event: GameEvent<T> = {
            seq: ++this.eventSeq,
            timestamp: this.lastNow || Date.now(),
            type,
            data,
        };
        this.eventQueue.push(event);
        this.authorityAdapter?.record(event);
        // Network hook for future host-authoritative broadcast.
        // this.networkBridge?.broadcast(event);
    }

    applyEvent(event: any): void {
        switch (event.type) {
            case GameEventType.SIGNAL_GENERATED: {
                const team = event.data.team as Team;
                const amount = Number(event.data.amount ?? 0);
                const newTotal = Number(event.data.newTotal ?? 0);
                this.state.signal[team] = newTotal;
                this.state.pendingSignalAmounts[team] = Math.max(0, this.state.pendingSignalAmounts[team] - amount);
                if (newTotal >= this.state.targetSignal && !this.state.matchEnded) {
                    const winner = team;
                    this.emitEvent(GameEventType.MATCH_WON, {
                        winner,
                        finalScore: { ...this.state.signal },
                        matchDuration: this.state.elapsedSeconds,
                    });
                }
                return;
            }
            case GameEventType.MATCH_WON:
                this.state.matchEnded = true;
                this.state.winner = event.data.winner;
                this.state.matchFlowState = 'POSTMATCH';
                return;
            case GameEventType.DROP_SPAWNED:
                this.state.currentDrop = {
                    id: event.data.dropId,
                    state: DropState.SPAWNED,
                    rewardType: event.data.rewardType,
                    team: event.data.team,
                    position: event.data.position,
                    hardpointId: event.data.hardpointId,
                    spawnedAt: event.data.spawnTime,
                    expiresAt: event.data.spawnTime + DROP_EXPIRE_SECONDS * 1000,
                    lockedByPlayerId: null,
                    stallUntilByPlayerId: {},
                };
                this.state.signalPaused = true;
                return;
            case GameEventType.DROP_TIMEOUT:
                if (this.state.currentDrop && this.state.currentDrop.id === event.data.dropId) {
                    this.state.currentDrop.state = DropState.TIMEOUT;
                    this.state.currentDrop = null;
                    this.state.signalPaused = false;
                    this.state.extraction.activePlayerId = null;
                    this.state.extraction.progressSeconds = 0;
                }
                return;
            case GameEventType.EXTRACTION_STARTED:
                this.state.extraction.activePlayerId = event.data.playerId;
                this.state.extraction.progressSeconds = 0;
                this.state.extraction.startedAt = event.timestamp;
                return;
            case GameEventType.EXTRACTION_PROGRESS:
                this.state.extraction.progressSeconds = clamp(event.data.progress * DROP_EXTRACT_SECONDS, 0, DROP_EXTRACT_SECONDS);
                this.state.extraction.lastProgressEmitAt = event.timestamp;
                return;
            case GameEventType.EXTRACTION_STALLED:
                this.state.extraction.stalledUntil = event.data.stalledUntil;
                return;
            case GameEventType.EXTRACTION_RESET:
                if (this.state.extraction.activePlayerId === event.data.playerId) {
                    this.state.extraction.activePlayerId = null;
                    this.state.extraction.progressSeconds = 0;
                    delete this.state.extraction.stalledUntil;
                }
                if (this.state.currentDrop) {
                    this.state.currentDrop.lockedByPlayerId = null;
                }
                return;
            case GameEventType.DROP_CAPTURED:
                if (this.state.currentDrop && this.state.currentDrop.id === event.data.dropId) {
                    this.state.currentDrop.state = DropState.CAPTURED;
                }
                this.receipts.push({
                    dropId: event.data.dropId,
                    playerId: event.data.playerId,
                    team: event.data.team,
                    rewardType: event.data.rewardType,
                    capturedAt: event.data.captureTime,
                });
                this.state.currentDrop = null;
                this.state.signalPaused = false;
                this.state.extraction.activePlayerId = null;
                this.state.extraction.progressSeconds = 0;
                return;
            case GameEventType.DROP_BUFF_START: {
                this.state.buffs.activeBuffs = this.state.buffs.activeBuffs.filter((b) => b.team !== event.data.team);
                const buff: ActiveBuff = {
                    type: event.data.key,
                    team: event.data.team,
                    appliedAt: event.data.startT,
                    expiresAt: event.data.endT,
                };
                this.state.buffs.activeBuffs.push(buff);
                return;
            }
            case GameEventType.DROP_BUFF_END:
                this.state.buffs.activeBuffs = this.state.buffs.activeBuffs.filter(
                    (b) => !(b.type === event.data.key && b.team === event.data.team)
                );
                console.log(`[SignalDropBuff] END team=${event.data.team} key=${event.data.key} reason=${event.data.reason} at=${Math.floor(event.data.t)}`);
                return;
            case GameEventType.BUFF_APPLIED:
            case GameEventType.BUFF_EXPIRED:
                return;
            case GameEventType.RESPAWN_TOKEN_CONSUMED:
                this.state.buffs.respawnTokens[event.data.team as Team] = false;
                return;
            case GameEventType.SUDDEN_DEATH_WARNING:
                this.state.suddenDeath.warningActive = true;
                this.state.suddenDeath.warningStartTime = event.timestamp;
                return;
            case GameEventType.SUDDEN_DEATH_ACTIVATED:
                this.state.suddenDeath.warningActive = false;
                this.state.suddenDeath.active = true;
                this.state.suddenDeath.activatedAt = event.timestamp;
                this.state.suddenDeath.centerPoint = event.data.centerPoint;
                this.state.suddenDeath.shrinkRadius = event.data.shrinkRadius;
                return;
            case GameEventType.BOUNDARY_DAMAGE:
                return;
            case GameEventType.GOLDEN_DROP_SPAWNED:
                this.state.currentDrop = {
                    id: event.data.dropId,
                    state: DropState.SPAWNED,
                    rewardType: DropRewardType.GOLDEN_SIGNAL,
                    team: 'neutral',
                    position: event.data.position,
                    hardpointId: 'hardpoint4',
                    spawnedAt: event.timestamp,
                    expiresAt: Number.MAX_SAFE_INTEGER,
                    lockedByPlayerId: null,
                    stallUntilByPlayerId: {},
                };
                this.state.signalPaused = true;
                this.state.suddenDeath.goldenDropSpawned = true;
                return;
            case GameEventType.GOLDEN_DROP_CAPTURED:
                this.state.signal[event.data.team as Team] += Number(event.data.signalBonus ?? 0);
                return;
            default:
                return;
        }
    }

    onPlayerDamaged(playerId: string, _damage: number): void {
        this.dropDamageSinceLastTickByPlayerId[playerId] = true;
    }

    onPlayerDeath(playerId: string): void {
        const player = this.lastPlayers.find((p) => p.id === playerId);
        if (!player) return;
        if (this.state.extraction.activePlayerId === playerId && this.state.currentDrop) {
            this.emitEvent(GameEventType.EXTRACTION_RESET, {
                playerId,
                dropId: this.state.currentDrop.id,
                reason: 'death',
            });
        }
        const team = player.team;
        if (this.state.buffs.respawnTokens[team]) {
            this.state.buffs.respawnTokens[team] = false;
            this.emitEvent(GameEventType.RESPAWN_TOKEN_CONSUMED, {
                team,
                playerId,
                timestamp: this.lastNow || Date.now(),
            });
            this.onInstantRespawn?.(playerId);
        }
    }

    onPlayerRespawn(_playerId: string): void {
        // Hook kept for integration parity.
    }

    setPlayerInteractIntent(playerId: string, interacting: boolean): void {
        this.interactIntentByPlayerId[playerId] = interacting;
    }

    getSignal(): { blue: number; red: number } {
        if (this.hardAuthority && this.chainAuthoritySignal) {
            return {
                blue: this.chainAuthoritySignal.blue,
                red: this.chainAuthoritySignal.red,
            };
        }
        const signal = getSnapSignalCounters(this.snapState);
        return {
            blue: signal.blue,
            red: signal.red,
        };
    }

    getNextDropTimer(): number {
        return Math.max(0, this.state.nextDropIn);
    }

    getExtractionProgress(): number {
        return clamp(this.state.extraction.progressSeconds / DROP_EXTRACT_SECONDS, 0, 1);
    }

    getCurrentDrop(): DropState | null {
        return this.state.currentDrop ? this.state.currentDrop.state : null;
    }

    getCurrentDropVisual(): { id: string; position: JsonVec3; isGolden: boolean } | null {
        const drop = this.state.currentDrop;
        if (!drop) return null;
        return {
            id: drop.id,
            position: { ...drop.position },
            isGolden: drop.rewardType === DropRewardType.GOLDEN_SIGNAL,
        };
    }

    getActiveBuffs(): ActiveBuff[] {
        return this.state.buffs.activeBuffs.slice();
    }

    getSnapDebugInfo(): SnapDebugInfo {
        const hp = getSnapHardpointView(this.snapState);
        const signal = this.getSignal();
        const nowMs = this.lastNow || Date.now();
        const zoneRemainingSec = this.hardAuthority
            ? Math.max(0, this.chainAuthorityZoneRemainingSec)
            : (hp.phaseEndsAtSec === null ? 0 : Math.max(0, hp.phaseEndsAtSec - (nowMs / 1000)));
        const blueMod = hp.activeDropBuffByTeam.blue;
        const redMod = hp.activeDropBuffByTeam.red;
        const chainMod = this.chainAuthorityBuffByTeam.blue ?? this.chainAuthorityBuffByTeam.red ?? null;
        return {
            enabled: this.useSnapAuthority,
            backend: this.snapBackend,
            seq: this.hardAuthority ? this.chainAuthoritySeq : Number(this.snapState.seq ?? 0),
            stateHash: this.hardAuthority ? this.chainAuthorityHash : String(this.snapState.stateHash ?? ''),
            signalBlue: Math.floor(signal.blue),
            signalRed: Math.floor(signal.red),
            activeZoneIndex: this.hardAuthority ? Math.max(0, this.chainAuthorityZoneIndex) : Math.max(0, hp.activeZoneIndex),
            zonePhase: this.hardAuthority ? this.chainAuthorityZonePhase : hp.zonePhase,
            zoneRemainingSec,
            activeDropModifierId: this.hardAuthority ? (chainMod ? `dropbuff:${chainMod}` : null) : (blueMod || redMod || null),
        };
    }

    hasDropBuff(team: Team, key: DropBuffKey): boolean {
        if (this.hardAuthority) {
            return this.chainAuthorityBuffByTeam[team] === key;
        }
        return this.dropBuffRuntime.hasBuff(team, key);
    }

    getActiveDropBuff(team: Team): ActiveBuff | null {
        if (this.hardAuthority) {
            const key = this.chainAuthorityBuffByTeam[team];
            if (!key) return null;
            const expiresAt = this.chainAuthorityBuffEndsAtByTeam[team];
            return {
                type: key,
                team,
                appliedAt: this.lastNow || Date.now(),
                ...(expiresAt !== null ? { expiresAt } : {}),
            };
        }
        const active = this.dropBuffRuntime.getActiveBuff(team);
        if (!active) return null;
        return {
            type: active.key as any,
            team: active.team,
            appliedAt: active.startT,
            expiresAt: active.endT,
        };
    }

    getSprintSpeedMultiplier(team: Team): number {
        if (this.hardAuthority) {
            return this.chainAuthorityBuffByTeam[team] === 'STAMPEDE_OVERDRIVE' ? 1.5 : 1;
        }
        return this.dropBuffRuntime.getSprintSpeedMultiplier(team);
    }

    shouldIgnoreHeavyPenalty(team: Team): boolean {
        if (this.hardAuthority) {
            return this.chainAuthorityBuffByTeam[team] === 'STAMPEDE_OVERDRIVE';
        }
        return this.dropBuffRuntime.shouldIgnoreHeavyPenalty(team);
    }

    getCooldownRegenMultiplier(playerId: string): number {
        if (this.hardAuthority) return 1;
        const player = this.lastPlayers.find((p) => p.id === playerId);
        if (!player) return 1;
        return this.dropBuffRuntime.getCooldownRegenMultiplierFor(player);
    }

    isEnemyRevealed(observerTeam: Team, targetId: string): boolean {
        const target = this.lastPlayers.find((p) => p.id === targetId);
        if (!target || !target.isAlive || target.team === observerTeam) return false;
        if (this.hardAuthority) {
            return this.chainAuthorityBuffByTeam[observerTeam] === 'SKY_EYE_RECON';
        }
        return this.dropBuffRuntime.hasBuff(observerTeam, 'SKY_EYE_RECON');
    }

    resolveIncomingDamage(_attackerId: string, victimId: string, amount: number): Array<{ playerId: string; damage: number }> {
        if (this.hardAuthority) return [{ playerId: victimId, damage: amount }];
        return this.dropBuffRuntime.resolveDamageDistribution(victimId, amount, this.lastPlayers, this.lastNow || Date.now());
    }

    setFragmentPickups(pickups: FragmentPickup[]): void {
        this.dropBuffRuntime.setFragmentPickups(pickups);
    }

    getPendingCredits(team: Team): number {
        return this.dropBuffRuntime.getPendingCredits(team);
    }

    isSuddenDeathActive(): boolean {
        return this.state.suddenDeath.active;
    }

    getMatchReceipt(): MatchReceipt {
        const end = this.lastNow || Date.now();
        return {
            mode: 'SIGNAL_PROTOCOL',
            startedAt: this.state.matchStartTime,
            endedAt: this.state.matchEnded ? end : end,
            winner: this.state.winner,
            finalSignal: { ...this.state.signal },
            capturedDrops: this.receipts.slice(),
            fragmentsEarned: { ...this.state.buffs.fragmentCaches },
            pendingCreditsEarned: {
                blue: this.dropBuffRuntime.getPendingCredits('blue'),
                red: this.dropBuffRuntime.getPendingCredits('red'),
            },
            totalEvents: this.eventLog.length,
        };
    }

    setTimeScale(scale: number): void {
        this.timeScale = clamp(scale, 0.1, 20);
    }

    startMatchZones(hardpointManager: HardpointManager, nowSec: number = (this.lastNow || performance.now()) / 1000): void {
        this.ensureZoneOrder(hardpointManager);
        if (this.zoneOrderIds.length === 0) return;
        this.zoneLoopStarted = true;
        hardpointManager.setRotationEnabled(false);
        hardpointManager.setCaptureEnabled(false);
        this.syncZoneFromSnap(hardpointManager, nowSec);
    }

    getMatchFlowState(): SignalMatchFlowState {
        return this.state.matchFlowState;
    }

    startLiveMatch(
        hardpointManager: HardpointManager,
        loadoutSlot: number = 0,
        nowSec: number = (this.lastNow || performance.now()) / 1000,
    ): void {
        if (this.state.matchFlowState !== 'PREMATCH_LOADOUT') return;
        this.onAnnounce?.('Ruleset: in-game signal hardpoint', 'info');
        const safeSlot = Math.max(0, Math.floor(loadoutSlot));
        this.applySnap('SELECT_LOADOUT', { slot: safeSlot }, hardpointManager, nowSec);
        this.syncStateFromSnap(hardpointManager);
        this.startMatchZones(hardpointManager, nowSec);
    }

    updateZones(_dtSec: number, hardpointManager: HardpointManager, nowSec: number = (this.lastNow || performance.now()) / 1000): void {
        if (this.state.matchFlowState !== 'LIVE') return;
        this.syncZoneFromSnap(hardpointManager, nowSec);
    }

    getCurrentZone(): SignalZoneSnapshot {
        return { ...this.zoneState };
    }

    forceSkipCountdown(hardpointManager: HardpointManager, nowSec: number = (this.lastNow || performance.now()) / 1000): void {
        const hp = getSnapHardpointView(this.snapState);
        if (hp.zonePhase !== 'COUNTDOWN' || hp.phaseEndsAtSec === null) return;
        const advanceBy = Math.max(0, hp.phaseEndsAtSec - nowSec) + 0.001;
        this.applySnap('TICK', { dtSec: advanceBy }, hardpointManager, nowSec + advanceBy);
        this.syncStateFromSnap(hardpointManager);
    }

    forceRotateToNextZone(hardpointManager: HardpointManager, nowSec: number = (this.lastNow || performance.now()) / 1000): void {
        const hp = getSnapHardpointView(this.snapState);
        if (hp.phaseEndsAtSec === null) return;
        const advanceBy = Math.max(0, hp.phaseEndsAtSec - nowSec) + 0.001;
        this.applySnap('TICK', { dtSec: advanceBy }, hardpointManager, nowSec + advanceBy);
        this.syncStateFromSnap(hardpointManager);
    }

    forceDropSpawn(): void {
        this.state.nextDropIn = 0;
    }

    forceSuddenDeath(): void {
        if (this.state.suddenDeath.active) return;
        const now = this.lastNow || Date.now();
        const hp4 = this.state.suddenDeath.centerPoint ?? { x: 0, y: 0, z: 0 };
        if (!hp4) return;
        this.emitEvent(GameEventType.SUDDEN_DEATH_WARNING, {
            timeUntilShrink: COLLAPSE_WARNING_SECONDS,
            triggerReason: 'close_score',
            timestamp: now,
        });
        this.emitEvent(GameEventType.SUDDEN_DEATH_ACTIVATED, {
            centerPoint: hp4,
            shrinkRadius: COLLAPSE_START_RADIUS,
            timestamp: now + COLLAPSE_WARNING_SECONDS * 1000,
        });
        this.flushEvents();
    }

    dumpEvents(): GameEvent[] {
        return this.eventLog.slice();
    }

    consumeIncomingDamage(playerId: string, amount: number): number {
        const shield = this.state.buffs.overshields[playerId] ?? 0;
        if (shield <= 0) return amount;
        const absorbed = Math.min(shield, amount);
        const remaining = amount - absorbed;
        const next = shield - absorbed;
        if (next > 0) this.state.buffs.overshields[playerId] = next;
        else delete this.state.buffs.overshields[playerId];
        return remaining;
    }

    debugAddSignal(team: Team, amount: number): void {
        this.applySnap('PRESENCE_UPDATE', { teamId: team, count: 1 }, null, (this.lastNow || Date.now()) / 1000);
        this.applySnap('PRESENCE_UPDATE', { teamId: team === 'blue' ? 'red' : 'blue', count: 0 }, null, (this.lastNow || Date.now()) / 1000);
        this.applySnap('TICK', { dtSec: Math.max(0, amount) }, null, (this.lastNow || Date.now()) / 1000);
        this.syncStateFromSnap(null);
        this.flushEvents();
    }

    notifyPowerupBurnUse(team: Team, buffKey: DropBuffKey): void {
        this.powerupBurnNonce += 1;
        if (this.onAuthorityAction) {
            this.onAuthorityAction({
                matchId: this.snapMatchId,
                actor: 'signal-authority-mirror',
                t: this.lastNow || Date.now(),
                kind: 'POWERUP_BURN_USE',
                payload: {
                    teamId: team,
                    buffKey,
                    burnNonce: this.powerupBurnNonce,
                },
            });
        }
        if (this.hardAuthority) return;
        this.state.buffs.activeBuffs = this.state.buffs.activeBuffs.filter((buff) => !(buff.team === team && buff.type === buffKey));
    }

    private ensureZoneOrder(hardpointManager: HardpointManager): void {
        if (this.zoneOrderIds.length > 0) return;
        const snapshots = hardpointManager.getSnapshots();
        const byId = new Set(snapshots.map((hp) => hp.id.toLowerCase()));
        this.zoneOrderIds = SIGNAL_ACTIVE_ZONE_IDS
            .filter((id) => byId.has(id))
            .map((id) => snapshots.find((hp) => hp.id.toLowerCase() === id)?.id ?? id);
        if (this.zoneOrderIds.length === 0) {
            this.zoneOrderIds = snapshots
                .map((hp) => hp.id)
                .filter((id) => !/hardpoint4/i.test(id));
        }
    }

    private enterCountdown(zoneIndex: number, nowSec: number, hardpointManager: HardpointManager): void {
        const zoneId = this.zoneOrderIds[zoneIndex] ?? null;
        if (!zoneId) return;
        hardpointManager.setRotationEnabled(false);
        hardpointManager.setCaptureEnabled(false);
        hardpointManager.setActiveHardpointById(zoneId);
        hardpointManager.clearHardpointControlState(zoneId);
        this.zoneState = {
            activeZoneIndex: zoneIndex,
            activeZoneId: zoneId,
            state: 'COUNTDOWN',
            stateEndsAtSec: nowSec + this.modeConfig.zoneCountdownSec,
            countdownRemainingSec: this.modeConfig.zoneCountdownSec,
            activeRemainingSec: 0,
            ownerTeamId: null,
            contested: false,
        };
        this.debugLog('ZONE_COUNTDOWN_START', {
            zoneIndex: zoneIndex + 1,
            duration: this.modeConfig.zoneCountdownSec,
        });
        this.onAnnounce?.(`Zone ${zoneIndex + 1} in ${this.modeConfig.zoneCountdownSec}s`, 'info');
    }

    private enterActive(zoneIndex: number, nowSec: number, hardpointManager: HardpointManager): void {
        const zoneId = this.zoneOrderIds[zoneIndex] ?? null;
        if (!zoneId) return;
        hardpointManager.setRotationEnabled(false);
        hardpointManager.setActiveHardpointById(zoneId);
        hardpointManager.clearHardpointControlState(zoneId);
        hardpointManager.setCaptureEnabled(true);
        this.zoneState = {
            activeZoneIndex: zoneIndex,
            activeZoneId: zoneId,
            state: 'ACTIVE',
            stateEndsAtSec: nowSec + this.modeConfig.zoneActiveSec,
            countdownRemainingSec: 0,
            activeRemainingSec: this.modeConfig.zoneActiveSec,
            ownerTeamId: null,
            contested: false,
        };
        this.debugLog('ZONE_ACTIVE_START', {
            zoneIndex: zoneIndex + 1,
            duration: this.modeConfig.zoneActiveSec,
        });
        this.onAnnounce?.('Zone Active', 'success');
    }

    private debugLog(tag: string, payload: Record<string, unknown>): void {
        console.log(`[SignalProtocol] ${tag}`, payload);
    }

    private resolveDropWorldPosition(hardpointManager: HardpointManager, zoneIndex: number | null): JsonVec3 | null {
        if (zoneIndex === null) return null;
        this.ensureZoneOrder(hardpointManager);
        const zoneId = this.zoneOrderIds[zoneIndex] ?? null;
        if (!zoneId) return null;
        const snapshots = hardpointManager.getSnapshots();
        const zone = snapshots.find((hp) => hp.id === zoneId);
        if (!zone) return null;
        return { x: zone.position.x, y: zone.position.y, z: zone.position.z };
    }

    private dispatchDropExtractionActions(players: PlayerSnapshot[], hardpointManager: HardpointManager, dtSec: number): void {
        if (!this.useSnapAuthority) return;
        const hp = getSnapHardpointView(this.snapState);
        const drop = hp.drop;
        const dropPosition = this.resolveDropWorldPosition(hardpointManager, drop.zoneIndex);
        const isExtractable = drop.state === 'LANDED' || drop.state === 'EXTRACTING';
        const activeDropId = isExtractable ? drop.dropId : null;

        for (let i = 0; i < players.length; i++) {
            const player = players[i]!;
            const wasChanneling = Boolean(this.extractionIntentActiveByPlayerId[player.id]);
            const interacting = Boolean(this.interactIntentByPlayerId[player.id]) && player.isAlive;
            const inRange = activeDropId !== null
                && dropPosition !== null
                && distance2D(player.position, dropPosition) <= EXTRACTION_RADIUS;
            const eligible = drop.eligibleTeamId === null || player.team === drop.eligibleTeamId;
            const shouldChannel = interacting && inRange && eligible;

            if (activeDropId && shouldChannel) {
                if (!wasChanneling) {
                    this.applySnap('DROP_EXTRACT_START', {
                        dropId: activeDropId,
                        playerId: player.id,
                        teamId: player.team,
                        inRange: true,
                    }, null, (this.lastNow || Date.now()) / 1000);
                }
                this.applySnap('DROP_EXTRACT_TICK', {
                    dropId: activeDropId,
                    playerId: player.id,
                    teamId: player.team,
                    dtSec,
                    inRange: true,
                    tookDamage: Boolean(this.dropDamageSinceLastTickByPlayerId[player.id]),
                }, null, (this.lastNow || Date.now()) / 1000);
            } else if (activeDropId && wasChanneling) {
                this.applySnap('DROP_EXTRACT_CANCEL', {
                    dropId: activeDropId,
                    playerId: player.id,
                    teamId: player.team,
                }, null, (this.lastNow || Date.now()) / 1000);
            }

            this.extractionIntentActiveByPlayerId[player.id] = shouldChannel;
            this.dropDamageSinceLastTickByPlayerId[player.id] = false;
        }
    }

    private applySnap(kind: string, payload: unknown, hardpointManager: HardpointManager | null, nowSec: number): void {
        if (!this.useSnapAuthority) return;
        const prevState = this.snapState;
        const action: SnapAction = {
            matchId: this.snapMatchId,
            actor: 'signal-protocol-mode',
            t: this.lastNow || Date.now(),
            kind,
            payload,
        };
        this.snapClient.dispatch(action);
        this.snapState = this.snapClient.getState();
        this.snapMatchId = this.snapState.matchId;
        this.emitAuthorityActions(prevState, action, this.snapState);
        if (hardpointManager) {
            this.syncZoneFromSnap(hardpointManager, nowSec);
        }
    }

    private emitAuthorityActions(prevState: SnapState, sourceAction: SnapAction, nextState: SnapState): void {
        if (!this.onAuthorityAction) return;
        const nowMs = this.lastNow || Date.now();
        const emit = (kind: string, payload: unknown): void => {
            this.onAuthorityAction?.({
                matchId: this.snapMatchId,
                actor: 'signal-authority-mirror',
                t: nowMs,
                kind,
                payload,
            });
        };

        if (sourceAction.kind === 'SELECT_LOADOUT') {
            const payload = (sourceAction.payload ?? {}) as { slot?: number };
            emit('SELECT_LOADOUT', { slot: Math.max(0, Math.floor(Number(payload.slot ?? 0))) });
        }

        if (sourceAction.kind === 'TICK') {
            const payload = (sourceAction.payload ?? {}) as { dtSec?: number };
            const dtSec = Math.max(0, Number(payload.dtSec ?? 0));
            this.authorityTickCarrySec += dtSec;
            const wholeSeconds = Math.floor(this.authorityTickCarrySec);
            if (wholeSeconds > 0) {
                this.authorityTickCarrySec -= wholeSeconds;
                emit('TICK', { dtSec: wholeSeconds });
            }
        }

        const prevSignal = getSnapSignalCounters(prevState);
        const nextSignal = getSnapSignalCounters(nextState);
        const blueDelta = Math.max(0, Math.floor(nextSignal.blue) - Math.floor(prevSignal.blue));
        const redDelta = Math.max(0, Math.floor(nextSignal.red) - Math.floor(prevSignal.red));
        if (blueDelta > 0) emit('SCORE_ADD', { counter: 'signal', entityId: 'blue', delta: blueDelta });
        if (redDelta > 0) emit('SCORE_ADD', { counter: 'signal', entityId: 'red', delta: redDelta });

        const prevHp = getSnapHardpointView(prevState);
        const nextHp = getSnapHardpointView(nextState);
        const zoneChanged = prevHp.activeZoneIndex !== nextHp.activeZoneIndex || prevHp.zonePhase !== nextHp.zonePhase;
        if (zoneChanged) {
            const remainingSec = nextHp.phaseEndsAtSec === null
                ? 0
                : Math.max(0, Math.floor(nextHp.phaseEndsAtSec - (nowMs / 1000)));
            emit('ZONE_SET', {
                index: nextHp.activeZoneIndex,
                phase: nextHp.zonePhase,
                remainingSec,
            });
        }
        if (prevHp.contested !== nextHp.contested) {
            emit('ZONE_CONTESTED_SET', { contested: nextHp.contested });
        }
        if (prevHp.ownerTeamId !== nextHp.ownerTeamId) {
            emit('ZONE_OWNER_SET', { teamId: nextHp.ownerTeamId });
        }

        const extractedNow = prevHp.drop.state !== 'EXTRACTED' && nextHp.drop.state === 'EXTRACTED';
        const extractedByTeam = nextHp.drop.extractingTeamId === 'blue' || nextHp.drop.extractingTeamId === 'red'
            ? nextHp.drop.extractingTeamId
            : null;
        const dropStateChanged = prevHp.drop.state !== nextHp.drop.state
            || prevHp.drop.zoneIndex !== nextHp.drop.zoneIndex
            || prevHp.drop.eligibleTeamId !== nextHp.drop.eligibleTeamId
            || prevHp.drop.extractingTeamId !== nextHp.drop.extractingTeamId
            || prevHp.drop.extractProgressMs !== nextHp.drop.extractProgressMs
            || prevHp.drop.endsAtMs !== nextHp.drop.endsAtMs;
        if (dropStateChanged) {
            const dropId = nextHp.drop.dropId ?? prevHp.drop.dropId ?? null;
            if (dropId) {
                emit('DROP_STATE_SET', {
                    dropId,
                    state: nextHp.drop.state,
                    zone: nextHp.drop.zoneIndex ?? 0,
                    eligibleTeam: nextHp.drop.eligibleTeamId ?? '',
                    extractingTeam: nextHp.drop.extractingTeamId ?? '',
                    extractProgressMs: Math.max(0, Math.floor(nextHp.drop.extractProgressMs)),
                    extractTargetMs: DROP_EXTRACT_SECONDS * 1000,
                    rewardKey: nextHp.drop.rewardKey,
                    ...(nextHp.drop.endsAtMs !== null ? { expiresAt: Math.floor(nextHp.drop.endsAtMs / 1000) } : {}),
                });
            }
        }
        if (extractedNow && nextHp.drop.dropId && extractedByTeam) {
            emit('DROP_EXTRACT_COMPLETE', {
                dropId: nextHp.drop.dropId,
                teamId: extractedByTeam,
                buffKey: nextHp.drop.rewardKey,
                ...(nextHp.drop.endsAtMs !== null ? { endsAt: Math.floor(nextHp.drop.endsAtMs / 1000) } : {}),
            });
        }
    }

    private syncStateFromSnap(hardpointManager: HardpointManager | null): void {
        if (!this.useSnapAuthority) return;
        const nowMs = this.lastNow || Date.now();
        const signal = this.getSignal();
        const hp = getSnapHardpointView(this.snapState);
        this.state.signal.blue = signal.blue;
        this.state.signal.red = signal.red;
        this.state.nextDropIn = hp.drop.state === 'INACTIVE' ? hp.dropScheduleRemainingMs / 1000 : 0;
        this.state.matchFlowState = this.snapState.phase === 'PREMATCH'
            ? 'PREMATCH_LOADOUT'
            : this.snapState.phase === 'LIVE'
                ? 'LIVE'
                : 'POSTMATCH';

        if (this.snapState.phase === 'POSTMATCH' && !this.state.matchEnded) {
            const winner = signal.blue >= signal.red ? 'blue' : 'red';
            this.emitEvent(GameEventType.MATCH_WON, {
                winner,
                finalScore: { ...this.state.signal },
                matchDuration: this.state.elapsedSeconds,
            });
        }

        if (hp.drop.state === 'EXTRACTED' && hp.drop.dropId && !this.capturedSnapDropIds[hp.drop.dropId]) {
            this.capturedSnapDropIds[hp.drop.dropId] = true;
            const captureTeam = hp.drop.extractingTeamId === 'blue' || hp.drop.extractingTeamId === 'red'
                ? hp.drop.extractingTeamId
                : 'blue';
            const capturePlayerId = hp.drop.extractingPlayerId ?? 'unknown';
            if (!this.hardAuthority && hardpointManager) {
                const toxinCenter = this.resolveDropWorldPosition(hardpointManager, hp.drop.zoneIndex);
                this.dropBuffRuntime.applyBuffFromExtraction(
                    captureTeam,
                    (decodeDropBuffKey(hp.activeDropBuffByTeam[captureTeam]) ?? toDropRewardType(hp.drop.rewardKey)) as DropBuffKey,
                    nowMs,
                    {
                        ...(toxinCenter ? { hardpointCenter: toxinCenter } : {}),
                        toxinRadius: TOXIN_RADIUS,
                    },
                );
            }
            this.receipts.push({
                dropId: hp.drop.dropId,
                playerId: capturePlayerId,
                team: captureTeam,
                rewardType: toDropRewardType(hp.drop.rewardKey),
                capturedAt: nowMs,
            });
        }

        const shouldRenderDrop = hp.drop.state === 'LANDED' || hp.drop.state === 'EXTRACTING';
        const dropPosition = hardpointManager ? this.resolveDropWorldPosition(hardpointManager, hp.drop.zoneIndex) : null;
        if (!shouldRenderDrop || !hp.drop.dropId || !dropPosition) {
            this.state.currentDrop = null;
            this.state.signalPaused = false;
            this.state.extraction.activePlayerId = null;
            this.state.extraction.progressSeconds = 0;
            delete this.state.extraction.startedAt;
            return;
        }

        const rewardType = toDropRewardType(hp.drop.rewardKey);
        const eligibleTeam = hp.drop.eligibleTeamId;
        const team: Team | 'neutral' = eligibleTeam ?? 'neutral';
        const spawnTime = (hp.drop.endsAtMs ?? nowMs) - (hp.drop.state === 'LANDED' || hp.drop.state === 'EXTRACTING'
            ? DROP_EXPIRE_SECONDS * 1000
            : 0);
        this.state.currentDrop = {
            id: hp.drop.dropId,
            state: hp.drop.state === 'EXTRACTING' ? DropState.EXTRACTING : DropState.SPAWNED,
            rewardType,
            team,
            position: dropPosition,
            hardpointId: this.zoneOrderIds[hp.drop.zoneIndex ?? 0] ?? this.zoneState.activeZoneId ?? 'hardpoint1',
            spawnedAt: spawnTime,
            expiresAt: hp.drop.endsAtMs ?? nowMs,
            lockedByPlayerId: hp.drop.extractingPlayerId ?? null,
            stallUntilByPlayerId: {},
        };
        this.state.signalPaused = true;
        this.state.extraction.activePlayerId = hp.drop.extractingPlayerId ?? null;
        this.state.extraction.progressSeconds = hp.drop.extractProgressMs / 1000;
        if (!this.state.extraction.startedAt) {
            this.state.extraction.startedAt = nowMs - hp.drop.extractProgressMs;
        }
    }

    applyChainAuthorityState(state: any): void {
        const chain = state?.custom?.onchain;
        const signal = state?.modules?.scoring?.counters?.signal;
        if (!chain || !signal) return;
        this.chainAuthoritySeq = Number(state?.seq ?? this.chainAuthoritySeq);
        this.chainAuthorityHash = String(state?.stateHash ?? this.chainAuthorityHash);
        this.chainAuthoritySignal = {
            blue: Number(signal.blue ?? 0),
            red: Number(signal.red ?? 0),
        };
        this.chainAuthorityZoneIndex = Math.max(0, Math.floor(Number(chain?.zone?.index ?? this.chainAuthorityZoneIndex)));
        this.chainAuthorityZonePhase = chain?.zone?.phase === 'ACTIVE' ? 'ACTIVE' : 'COUNTDOWN';
        this.chainAuthorityZoneRemainingSec = Math.max(0, Number(chain?.zone?.remainingSec ?? 0));
        const chainOwnerTeamRaw = Number(chain?.zone?.ownerTeam ?? 0);
        const chainOwnerTeam: Team | null = chainOwnerTeamRaw === 1 ? 'blue' : chainOwnerTeamRaw === 2 ? 'red' : null;
        const chainContested = Boolean(chain?.zone?.contested);
        const blueCode = Number(chain?.activeDropBuff?.blue ?? 0);
        const redCode = Number(chain?.activeDropBuff?.red ?? 0);
        this.chainAuthorityBuffByTeam = {
            blue: dropBuffFromChainCode(blueCode),
            red: dropBuffFromChainCode(redCode),
        };
        const blueEndsAtSec = Number(chain?.dropInfo?.blueEndsAt ?? 0);
        const redEndsAtSec = Number(chain?.dropInfo?.redEndsAt ?? 0);
        this.chainAuthorityBuffEndsAtByTeam = {
            blue: blueEndsAtSec > 0 ? blueEndsAtSec * 1000 : null,
            red: redEndsAtSec > 0 ? redEndsAtSec * 1000 : null,
        };
        this.chainAuthorityFlow = state?.phase === 'POSTMATCH'
            ? 'POSTMATCH'
            : state?.phase === 'LIVE'
                ? 'LIVE'
                : 'PREMATCH_LOADOUT';
        if (!this.hardAuthority) return;
        this.state.signal.blue = this.chainAuthoritySignal.blue;
        this.state.signal.red = this.chainAuthoritySignal.red;
        this.state.matchFlowState = this.chainAuthorityFlow;
        this.zoneState.activeZoneIndex = this.chainAuthorityZoneIndex;
        this.zoneState.state = this.chainAuthorityZonePhase;
        this.zoneState.ownerTeamId = chainOwnerTeam;
        this.zoneState.contested = chainContested;
        this.zoneState.countdownRemainingSec = this.chainAuthorityZonePhase === 'COUNTDOWN' ? this.chainAuthorityZoneRemainingSec : 0;
        this.zoneState.activeRemainingSec = this.chainAuthorityZonePhase === 'ACTIVE' ? this.chainAuthorityZoneRemainingSec : 0;
        const chainDropState = dropStateFromChainCode(Number(chain?.dropInfo?.state ?? 0));
        const chainExtractMs = Math.max(0, Number(chain?.dropInfo?.extractProgressMs ?? 0));
        this.state.extraction.progressSeconds = chainExtractMs / 1000;
        if (chainDropState !== 'EXTRACTING') {
            this.state.extraction.activePlayerId = null;
        }
        if (chainDropState === 'INACTIVE' || chainDropState === 'EXPIRED' || chainDropState === 'EXTRACTED') {
            this.state.currentDrop = null;
            this.state.signalPaused = false;
        }
        this.state.buffs.activeBuffs = (['blue', 'red'] as Team[])
            .map((team) => {
                const buff = this.chainAuthorityBuffByTeam[team];
                if (!buff) return null;
                return {
                    type: buff,
                    team,
                    appliedAt: this.lastNow || Date.now(),
                    ...(this.chainAuthorityBuffEndsAtByTeam[team] !== null ? { expiresAt: this.chainAuthorityBuffEndsAtByTeam[team]! } : {}),
                } as ActiveBuff;
            })
            .filter((buff): buff is ActiveBuff => buff !== null);
    }

    private syncSnapPresence(hardpointManager: HardpointManager, players: PlayerSnapshot[], nowMs: number, force: boolean): void {
        if (!this.useSnapAuthority) return;
        if (!force && (nowMs - this.lastSnapPresenceAtMs) < SNAP_PRESENCE_INTERVAL_MS) return;
        this.lastSnapPresenceAtMs = nowMs;
        const active = hardpointManager.getActiveHardpoint();
        if (!active || !this.zoneLoopStarted) {
            this.applySnap('PRESENCE_UPDATE', { teamId: 'blue', count: 0 }, null, (this.lastNow || Date.now()) / 1000);
            this.applySnap('PRESENCE_UPDATE', { teamId: 'red', count: 0 }, null, (this.lastNow || Date.now()) / 1000);
            return;
        }

        let blueCount = 0;
        let redCount = 0;
        for (let i = 0; i < players.length; i++) {
            const p = players[i]!;
            if (!p.isAlive) continue;
            if (distance2D(p.position, active.position) > active.radius) continue;
            if (p.team === 'blue') blueCount += 1;
            else redCount += 1;
        }

        this.applySnap('PRESENCE_UPDATE', { teamId: 'blue', count: blueCount }, null, (this.lastNow || Date.now()) / 1000);
        this.applySnap('PRESENCE_UPDATE', { teamId: 'red', count: redCount }, null, (this.lastNow || Date.now()) / 1000);
    }

    private syncSnapZoneControl(hardpointManager: HardpointManager): void {
        if (!this.useSnapAuthority || !this.zoneLoopStarted) return;
        const active = hardpointManager.getActiveHardpoint();
        if (!active) return;
        const hp = getSnapHardpointView(this.snapState);
        if (hp.contested !== active.isContested) {
            this.applySnap('ZONE_CONTESTED_SET', { contested: active.isContested }, null, (this.lastNow || Date.now()) / 1000);
        }
        if (!active.isContested && hp.ownerTeamId !== active.owner) {
            this.applySnap('ZONE_OWNER_SET', { teamId: active.owner }, null, (this.lastNow || Date.now()) / 1000);
        }
    }

    private syncZoneFromSnap(hardpointManager: HardpointManager, nowSec: number): void {
        this.ensureZoneOrder(hardpointManager);
        if (!this.zoneLoopStarted || this.zoneOrderIds.length === 0) return;

        const hp = getSnapHardpointView(this.snapState);
        const desiredZoneIndex = hp.activeZoneIndex % this.zoneOrderIds.length;
        const desiredState = hp.zonePhase;
        const zoneChanged = desiredZoneIndex !== this.zoneState.activeZoneIndex;
        const stateChanged = this.zoneState.state !== desiredState;
        if (zoneChanged || stateChanged || !this.zoneState.activeZoneId) {
            if (zoneChanged) {
                const outgoingZoneId = this.zoneOrderIds[this.zoneState.activeZoneIndex];
                if (outgoingZoneId) {
                    hardpointManager.clearHardpointControlState(outgoingZoneId);
                }
            }

            if (desiredState === 'COUNTDOWN') {
                this.enterCountdown(desiredZoneIndex, nowSec, hardpointManager);
            } else {
                this.enterActive(desiredZoneIndex, nowSec, hardpointManager);
            }
        }

        const remaining = Math.max(0, (hp.phaseEndsAtSec ?? nowSec) - nowSec);
        this.zoneState.countdownRemainingSec = hp.zonePhase === 'COUNTDOWN' ? remaining : 0;
        this.zoneState.activeRemainingSec = hp.zonePhase === 'ACTIVE' ? remaining : 0;
        this.zoneState.stateEndsAtSec = hp.phaseEndsAtSec ?? nowSec;
        this.zoneState.state = hp.zonePhase;
        this.zoneState.ownerTeamId = hp.ownerTeamId;
        this.zoneState.contested = hp.contested;
    }

    private checkSuddenDeathTrigger(now: number): void {
        if (this.state.suddenDeath.warningActive || this.state.suddenDeath.active) return;
        if (this.state.elapsedSeconds < COLLAPSE_CHECK_SECONDS) return;
        const diff = Math.abs(this.state.signal.blue - this.state.signal.red);
        const nearCap = this.state.signal.blue >= this.state.targetSignal * 0.9 && this.state.signal.red >= this.state.targetSignal * 0.9;
        if (!(diff < 50 || nearCap)) return;
        this.emitEvent(GameEventType.SUDDEN_DEATH_WARNING, {
            timeUntilShrink: COLLAPSE_WARNING_SECONDS,
            triggerReason: diff < 50 ? 'close_score' : 'high_percentage',
            timestamp: now,
        });
    }

    private applySuddenDeathBoundary(dt: number, hardpointManager: HardpointManager, players: PlayerSnapshot[], now: number): void {
        if (this.state.suddenDeath.warningActive && !this.state.suddenDeath.active && this.state.suddenDeath.warningStartTime) {
            if (now >= this.state.suddenDeath.warningStartTime + COLLAPSE_WARNING_SECONDS * 1000) {
                const hardpoints = hardpointManager.getSnapshots();
                const hp4 = hardpoints.find((hp) => hp.id === 'hardpoint4') ?? hardpoints[0];
                if (!hp4) return;
                this.emitEvent(GameEventType.SUDDEN_DEATH_ACTIVATED, {
                    centerPoint: hp4.position,
                    shrinkRadius: COLLAPSE_START_RADIUS,
                    timestamp: now,
                });
            }
        }
        if (!this.state.suddenDeath.active || !this.state.suddenDeath.centerPoint) return;
        hardpointManager.activateSuddenDeathHardpoint();

        this.state.suddenDeath.shrinkRadius = Math.max(
            COLLAPSE_MIN_RADIUS,
            this.state.suddenDeath.shrinkRadius - COLLAPSE_SHRINK_PER_SEC * dt
        );

        if (now - this.state.suddenDeath.lastBoundaryDamageTick >= 1000) {
            this.state.suddenDeath.lastBoundaryDamageTick = now;
            for (let i = 0; i < players.length; i++) {
                const p = players[i]!;
                if (!p.isAlive) continue;
                const dist = distance2D(p.position, this.state.suddenDeath.centerPoint);
                if (dist <= this.state.suddenDeath.shrinkRadius) continue;
                this.emitEvent(GameEventType.BOUNDARY_DAMAGE, {
                    playerId: p.id,
                    damage: COLLAPSE_DAMAGE_PER_SEC,
                    distanceFromCenter: dist,
                    timestamp: now,
                });
                this.onApplyBoundaryDamage?.(p.id, COLLAPSE_DAMAGE_PER_SEC);
            }
        }

        if (!this.state.suddenDeath.goldenDropSpawned && this.state.suddenDeath.activatedAt) {
            if (now >= this.state.suddenDeath.activatedAt + GOLDEN_DROP_DELAY_SECONDS * 1000) {
                const dropId = `golden_drop_${Math.floor(now)}`;
                this.emitEvent(GameEventType.GOLDEN_DROP_SPAWNED, {
                    dropId,
                    position: this.state.suddenDeath.centerPoint,
                    timestamp: now,
                });
            }
        }
    }

    private flushEvents(): void {
        while (this.eventQueue.length > 0) {
            const event = this.eventQueue.shift()!;
            this.applyEvent(event);
            this.eventLog.push(event);
            if (this.eventLog.length > 4096) this.eventLog.shift();
            this.onEvent?.(event);
        }
    }
}
