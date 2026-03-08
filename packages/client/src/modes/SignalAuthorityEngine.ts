type ZonePhase = 'COUNTDOWN' | 'ACTIVE';
type DropState = 'INACTIVE' | 'INCOMING' | 'LANDED' | 'EXTRACTING' | 'EXTRACTED' | 'EXPIRED';
type TeamId = 'blue' | 'red';

type RuleVar = { type: 'number'; value: number } | { type: 'string' | 'enum'; value: string };

export interface SignalAuthorityManifest {
    version: string;
    gameId: string;
    rulesetId: string;
    ruleVars?: Record<string, RuleVar>;
}

export interface SignalAuthorityAction {
    matchId: string;
    actor: string;
    t: number;
    kind: string;
    payload?: unknown;
}

interface SnapshotHardpointDrop {
    state: DropState;
    dropId: string | null;
    zoneIndex: number | null;
    eligibleTeamId: TeamId | null;
    endsAtMs: number | null;
    extractProgressMs: number;
    rewardKey: string;
    extractingTeamId?: TeamId;
    extractingPlayerId?: string;
}

interface SnapshotHardpointState {
    activeZoneIndex: number;
    zonePhase: ZonePhase;
    phaseEndsAtMs: number;
    ownerTeamId: TeamId | null;
    contested: boolean;
    presenceByTeam: Record<string, number>;
    drop: SnapshotHardpointDrop;
    dropSeq: number;
    dropScheduleRemainingMs: number;
    selectedLoadoutSlot: number | null;
    grantedDropIds: Record<string, true>;
    activeDropBuffByTeam: Record<string, string>;
    activeDropBuffEndsAtMsByTeam: Record<string, number | null>;
}

type ScoringState = {
    counters: Record<string, Record<string, number>>;
};

export interface SignalAuthorityState {
    matchId: string;
    phase: 'PREMATCH' | 'LIVE' | 'POSTMATCH';
    seq: number;
    stateHash: string;
    ruleVars: Record<string, RuleVar>;
    modules: {
        scoring: ScoringState;
    };
    custom: {
        snapshotHardpoint: SnapshotHardpointState;
    };
}

type Subscriber = (state: SignalAuthorityState) => void;

export interface SignalAuthorityClient {
    dispatch(action: SignalAuthorityAction): void;
    getState(): SignalAuthorityState;
    subscribe(fn: Subscriber): () => void;
}

const COUNTDOWN_MS = 30_000;
const ACTIVE_MS = 60_000;
const DEFAULT_ZONE_COUNT = 3;
const DEFAULT_DROP_INTERVAL_SEC = 30;
const DEFAULT_DROP_INCOMING_SEC = 2;
const DEFAULT_DROP_EXTRACT_SEC = 8;
const DEFAULT_DROP_EXPIRE_SEC = 60;
const DROP_TERMINAL_LINGER_MS = 1_000;
const DROP_BUFF_DURATION_MS_BY_KEY: Record<string, number> = {
    FORGE_LINK: 15_000,
    SKY_EYE_RECON: 12_000,
    NEURO_TOXIN_CLOUD: 8_000,
    STAMPEDE_OVERDRIVE: 12_000,
    SCRAP_MAGNET: 12_000,
};

const DROP_REWARDS = [
    'FORGE_LINK',
    'SKY_EYE_RECON',
    'NEURO_TOXIN_CLOUD',
    'STAMPEDE_OVERDRIVE',
    'SCRAP_MAGNET',
] as const;

function getNowMs(): number {
    if (typeof performance !== 'undefined' && Number.isFinite(performance.now())) {
        return performance.now();
    }
    return Date.now();
}

function getRuleVarSeconds(state: SignalAuthorityState, key: string, fallbackSec: number): number {
    const raw = state.ruleVars[key];
    if (raw && raw.type === 'number') {
        const n = Number(raw.value);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return fallbackSec;
}

function getZoneCount(state: SignalAuthorityState): number {
    const raw = state.ruleVars.zoneCount;
    if (raw && raw.type === 'number') {
        const n = Math.floor(raw.value);
        if (n > 0) return n;
    }
    return DEFAULT_ZONE_COUNT;
}

function getDropIntervalMs(state: SignalAuthorityState): number {
    return Math.round(getRuleVarSeconds(state, 'dropIntervalSec', DEFAULT_DROP_INTERVAL_SEC) * 1000);
}

function getDropIncomingMs(state: SignalAuthorityState): number {
    return Math.round(getRuleVarSeconds(state, 'dropIncomingSec', DEFAULT_DROP_INCOMING_SEC) * 1000);
}

function getDropExtractMs(state: SignalAuthorityState): number {
    return Math.round(getRuleVarSeconds(state, 'dropExtractSec', DEFAULT_DROP_EXTRACT_SEC) * 1000);
}

function getDropExpireMs(state: SignalAuthorityState): number {
    return Math.round(getRuleVarSeconds(state, 'dropExpireSec', DEFAULT_DROP_EXPIRE_SEC) * 1000);
}

function pickDeterministicReward(dropId: string): string {
    let h = 2166136261;
    for (let i = 0; i < dropId.length; i++) {
        h ^= dropId.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return DROP_REWARDS[h % DROP_REWARDS.length] ?? DROP_REWARDS[0];
}

function snapshotHash(state: SignalAuthorityState): string {
    const hp = state.custom.snapshotHardpoint;
    const signal = state.modules.scoring.counters.signal ?? {};
    const parts = [
        String(state.seq),
        state.phase,
        String(hp.activeZoneIndex),
        hp.zonePhase,
        hp.ownerTeamId ?? 'none',
        hp.contested ? '1' : '0',
        hp.drop.state,
        hp.drop.dropId ?? 'none',
        String(Math.floor(Number(signal.blue ?? 0))),
        String(Math.floor(Number(signal.red ?? 0))),
    ];
    return parts.join(':');
}

function createInitialState(manifest: SignalAuthorityManifest): SignalAuthorityState {
    const matchIdRaw = manifest.ruleVars?.matchId;
    const matchId = matchIdRaw && (matchIdRaw.type === 'string' || matchIdRaw.type === 'enum')
        ? String(matchIdRaw.value)
        : 'signal-protocol-local';
    const ruleVars = { ...(manifest.ruleVars ?? {}) };
    const nowMs = getNowMs();
    const state: SignalAuthorityState = {
        matchId,
        phase: 'PREMATCH',
        seq: 0,
        stateHash: '',
        ruleVars,
        modules: {
            scoring: { counters: { signal: { blue: 0, red: 0 } } },
        },
        custom: {
            snapshotHardpoint: {
                activeZoneIndex: 0,
                zonePhase: 'COUNTDOWN',
                phaseEndsAtMs: nowMs + COUNTDOWN_MS,
                ownerTeamId: null,
                contested: false,
                presenceByTeam: { blue: 0, red: 0 },
                drop: {
                    state: 'INACTIVE',
                    dropId: null,
                    zoneIndex: null,
                    eligibleTeamId: null,
                    endsAtMs: null,
                    extractProgressMs: 0,
                    rewardKey: 'FORGE_LINK',
                },
                dropSeq: 0,
                dropScheduleRemainingMs: DEFAULT_DROP_INTERVAL_SEC * 1000,
                selectedLoadoutSlot: null,
                grantedDropIds: {},
                activeDropBuffByTeam: {},
                activeDropBuffEndsAtMsByTeam: {},
            },
        },
    };
    state.custom.snapshotHardpoint.dropScheduleRemainingMs = getDropIntervalMs(state);
    state.stateHash = snapshotHash(state);
    return state;
}

function addSignal(state: SignalAuthorityState, teamId: string, delta: number): SignalAuthorityState {
    if (!teamId || delta <= 0) return state;
    const scoring = state.modules.scoring;
    const signal = { ...(scoring.counters.signal ?? {}) };
    signal[teamId] = Number(signal[teamId] ?? 0) + delta;
    return {
        ...state,
        modules: {
            ...state.modules,
            scoring: {
                ...scoring,
                counters: {
                    ...scoring.counters,
                    signal,
                },
            },
        },
    };
}

function resetDropToInactive(state: SignalAuthorityState, hardpoint: SnapshotHardpointState): SnapshotHardpointState {
    return {
        ...hardpoint,
        drop: {
            state: 'INACTIVE',
            dropId: null,
            zoneIndex: null,
            eligibleTeamId: null,
            endsAtMs: null,
            extractProgressMs: 0,
            rewardKey: 'FORGE_LINK',
        },
        dropScheduleRemainingMs: getDropIntervalMs(state),
    };
}

function startIncomingDrop(state: SignalAuthorityState, hardpoint: SnapshotHardpointState, nowMs: number): SnapshotHardpointState {
    const nextSeq = Math.max(0, Math.floor(hardpoint.dropSeq)) + 1;
    const dropId = `drop_${nextSeq}`;
    return {
        ...hardpoint,
        dropSeq: nextSeq,
        dropScheduleRemainingMs: 0,
        drop: {
            state: 'INCOMING',
            dropId,
            zoneIndex: hardpoint.activeZoneIndex,
            eligibleTeamId: hardpoint.contested ? null : hardpoint.ownerTeamId,
            endsAtMs: nowMs + getDropIncomingMs(state),
            extractProgressMs: 0,
            rewardKey: pickDeterministicReward(dropId),
        },
    };
}

function isDropTeamEligible(drop: SnapshotHardpointDrop, teamId: string): boolean {
    if (!drop.eligibleTeamId) return true;
    return drop.eligibleTeamId === teamId;
}

function completeDropExtraction(
    state: SignalAuthorityState,
    hardpoint: SnapshotHardpointState,
    action: SignalAuthorityAction,
    teamId: TeamId,
): SignalAuthorityState {
    const dropId = hardpoint.drop.dropId;
    if (!dropId) return state;
    if (hardpoint.grantedDropIds[dropId]) return state;
    const buffKey = hardpoint.drop.rewardKey || 'FORGE_LINK';
    const modifierId = `dropbuff:${buffKey}`;
    const defaultBuffDurationMs = DROP_BUFF_DURATION_MS_BY_KEY.FORGE_LINK ?? 15_000;
    const buffEndsAtMs = action.t + (DROP_BUFF_DURATION_MS_BY_KEY[buffKey] ?? defaultBuffDurationMs);
    return {
        ...state,
        custom: {
            ...state.custom,
            snapshotHardpoint: {
                ...hardpoint,
                grantedDropIds: {
                    ...hardpoint.grantedDropIds,
                    [dropId]: true,
                },
                activeDropBuffByTeam: {
                    ...hardpoint.activeDropBuffByTeam,
                    [teamId]: modifierId,
                },
                activeDropBuffEndsAtMsByTeam: {
                    ...hardpoint.activeDropBuffEndsAtMsByTeam,
                    [teamId]: buffEndsAtMs,
                },
                drop: {
                    ...hardpoint.drop,
                    state: 'EXTRACTED',
                    endsAtMs: action.t + DROP_TERMINAL_LINGER_MS,
                    extractProgressMs: getDropExtractMs(state),
                    extractingTeamId: teamId,
                },
            },
        },
    };
}

function advanceDropByTime(state: SignalAuthorityState, hardpoint: SnapshotHardpointState, upToMs: number): SnapshotHardpointState {
    let next = hardpoint;
    let activeDropBuffByTeam = next.activeDropBuffByTeam;
    let activeDropBuffEndsAtMsByTeam = next.activeDropBuffEndsAtMsByTeam;
    let buffStateChanged = false;

    for (const [teamId, endsAtMs] of Object.entries(activeDropBuffEndsAtMsByTeam)) {
        if (!Number.isFinite(endsAtMs) || endsAtMs === null || upToMs < Number(endsAtMs)) continue;
        if (!buffStateChanged) {
            activeDropBuffByTeam = { ...activeDropBuffByTeam };
            activeDropBuffEndsAtMsByTeam = { ...activeDropBuffEndsAtMsByTeam };
            buffStateChanged = true;
        }
        delete activeDropBuffByTeam[teamId];
        activeDropBuffEndsAtMsByTeam[teamId] = null;
    }

    if (buffStateChanged) {
        next = {
            ...next,
            activeDropBuffByTeam,
            activeDropBuffEndsAtMsByTeam,
        };
    }

    if (next.drop.state === 'INCOMING') {
        const endsAtMs = next.drop.endsAtMs;
        if (endsAtMs !== null && upToMs >= endsAtMs) {
            next = {
                ...next,
                drop: {
                    ...next.drop,
                    state: 'LANDED',
                    endsAtMs: endsAtMs + getDropExpireMs(state),
                },
            };
        }
    }

    if (next.drop.state === 'LANDED' || next.drop.state === 'EXTRACTING') {
        const endsAtMs = next.drop.endsAtMs;
        if (endsAtMs !== null && upToMs >= endsAtMs) {
            const drop: SnapshotHardpointDrop = {
                ...next.drop,
                state: 'EXPIRED',
                endsAtMs: endsAtMs + DROP_TERMINAL_LINGER_MS,
                extractProgressMs: 0,
            };
            delete drop.extractingTeamId;
            delete drop.extractingPlayerId;
            next = { ...next, drop };
        }
    }

    if (next.drop.state === 'EXTRACTED' || next.drop.state === 'EXPIRED') {
        const cleanupAtMs = next.drop.endsAtMs;
        if (cleanupAtMs !== null && upToMs >= cleanupAtMs) {
            next = resetDropToInactive(state, next);
        }
    }

    return next;
}

function reduce(state: SignalAuthorityState, action: SignalAuthorityAction): SignalAuthorityState {
    let nextState = state;
    let hardpoint = state.custom.snapshotHardpoint;
    const kind = action.kind;

    if (kind === 'SELECT_LOADOUT') {
        const payload = (action.payload ?? {}) as { slot?: number };
        hardpoint = {
            ...hardpoint,
            selectedLoadoutSlot: Number.isFinite(payload.slot) ? Number(payload.slot) : null,
        };
        return {
            ...state,
            phase: 'LIVE',
            custom: { ...state.custom, snapshotHardpoint: hardpoint },
        };
    }

    if (kind === 'PRESENCE_UPDATE' || kind === 'PRESENCE') {
        const payload = (action.payload ?? {}) as { teamId?: string; count?: number };
        const teamId = String(payload.teamId ?? '').trim();
        if (!teamId) return state;
        const count = Math.max(0, Math.floor(Number(payload.count ?? 0)));
        hardpoint = {
            ...hardpoint,
            presenceByTeam: {
                ...hardpoint.presenceByTeam,
                [teamId]: count,
            },
        };
        return { ...state, custom: { ...state.custom, snapshotHardpoint: hardpoint } };
    }

    if (kind === 'ZONE_OWNER_SET') {
        const payload = (action.payload ?? {}) as { teamId?: string | null };
        const rawTeamId = payload.teamId == null ? '' : String(payload.teamId).trim().toLowerCase();
        const ownerTeamId: TeamId | null = rawTeamId === 'blue' || rawTeamId === 'red'
            ? rawTeamId as TeamId
            : null;
        hardpoint = {
            ...hardpoint,
            ownerTeamId,
            contested: false,
        };
        return { ...state, custom: { ...state.custom, snapshotHardpoint: hardpoint } };
    }

    if (kind === 'ZONE_CONTESTED_SET') {
        const payload = (action.payload ?? {}) as { contested?: boolean };
        const contested = Boolean(payload.contested);
        hardpoint = {
            ...hardpoint,
            contested,
            ownerTeamId: contested ? null : hardpoint.ownerTeamId,
        };
        return { ...state, custom: { ...state.custom, snapshotHardpoint: hardpoint } };
    }

    if (kind === 'DROP_EXTRACT_START') {
        const payload = (action.payload ?? {}) as {
            dropId?: string;
            playerId?: string;
            teamId?: string;
            inRange?: boolean;
        };
        const dropId = String(payload.dropId ?? '').trim();
        const playerId = String(payload.playerId ?? '').trim();
        const teamId = String(payload.teamId ?? '').trim() as TeamId;
        const inRange = Boolean(payload.inRange);
        if (!dropId || !playerId || !teamId || !inRange) return state;
        if (hardpoint.drop.dropId !== dropId) return state;
        if (hardpoint.grantedDropIds[dropId]) return state;
        if (!isDropTeamEligible(hardpoint.drop, teamId)) return state;
        if (hardpoint.drop.state === 'LANDED') {
            hardpoint = {
                ...hardpoint,
                drop: {
                    ...hardpoint.drop,
                    state: 'EXTRACTING',
                    extractingTeamId: teamId,
                    extractingPlayerId: playerId,
                    extractProgressMs: 0,
                },
            };
            return { ...state, custom: { ...state.custom, snapshotHardpoint: hardpoint } };
        }
        return state;
    }

    if (kind === 'DROP_EXTRACT_CANCEL') {
        const payload = (action.payload ?? {}) as {
            dropId?: string;
            playerId?: string;
            teamId?: string;
        };
        const dropId = String(payload.dropId ?? '').trim();
        const playerId = String(payload.playerId ?? '').trim();
        const teamId = String(payload.teamId ?? '').trim();
        if (!dropId || !playerId || !teamId) return state;
        if (hardpoint.drop.state !== 'EXTRACTING') return state;
        if (hardpoint.drop.dropId !== dropId) return state;
        if (hardpoint.drop.extractingPlayerId !== playerId || hardpoint.drop.extractingTeamId !== teamId) return state;
        const drop: SnapshotHardpointDrop = {
            ...hardpoint.drop,
            state: 'LANDED',
            extractProgressMs: 0,
        };
        delete drop.extractingPlayerId;
        delete drop.extractingTeamId;
        hardpoint = { ...hardpoint, drop };
        return { ...state, custom: { ...state.custom, snapshotHardpoint: hardpoint } };
    }

    if (kind === 'DROP_EXTRACT_TICK') {
        const payload = (action.payload ?? {}) as {
            dropId?: string;
            playerId?: string;
            teamId?: string;
            dtSec?: number;
            inRange?: boolean;
            tookDamage?: boolean;
        };
        const dropId = String(payload.dropId ?? '').trim();
        const playerId = String(payload.playerId ?? '').trim();
        const teamId = String(payload.teamId ?? '').trim() as TeamId;
        const inRange = Boolean(payload.inRange);
        const tookDamage = Boolean(payload.tookDamage);
        const dtMs = Math.max(0, Math.round(Number(payload.dtSec ?? 0) * 1000));
        if (!dropId || !playerId || !teamId || dtMs <= 0) return state;
        if (hardpoint.drop.dropId !== dropId) return state;
        if (hardpoint.grantedDropIds[dropId]) return state;
        if (!isDropTeamEligible(hardpoint.drop, teamId)) return state;

        if (hardpoint.drop.state === 'LANDED') {
            if (!inRange) return state;
            hardpoint = {
                ...hardpoint,
                drop: {
                    ...hardpoint.drop,
                    state: 'EXTRACTING',
                    extractingTeamId: teamId,
                    extractingPlayerId: playerId,
                    extractProgressMs: 0,
                },
            };
        }

        if (hardpoint.drop.state !== 'EXTRACTING') return state;
        if (hardpoint.drop.extractingPlayerId !== playerId || hardpoint.drop.extractingTeamId !== teamId) return state;
        if (!inRange) {
            const drop: SnapshotHardpointDrop = {
                ...hardpoint.drop,
                state: 'LANDED',
                extractProgressMs: 0,
            };
            delete drop.extractingPlayerId;
            delete drop.extractingTeamId;
            hardpoint = { ...hardpoint, drop };
            return { ...state, custom: { ...state.custom, snapshotHardpoint: hardpoint } };
        }
        if (tookDamage) {
            return state;
        }

        const extractTargetMs = getDropExtractMs(state);
        const extractProgressMs = Math.min(extractTargetMs, hardpoint.drop.extractProgressMs + dtMs);
        hardpoint = {
            ...hardpoint,
            drop: {
                ...hardpoint.drop,
                extractProgressMs,
            },
        };
        if (extractProgressMs < extractTargetMs) {
            return { ...state, custom: { ...state.custom, snapshotHardpoint: hardpoint } };
        }
        return completeDropExtraction(state, hardpoint, action, teamId);
    }

    if (kind === 'DROP_EXTRACT_COMPLETE') {
        const payload = (action.payload ?? {}) as { dropId?: string; teamId?: string };
        const dropId = String(payload.dropId ?? '').trim();
        const teamId = String(payload.teamId ?? '').trim() as TeamId;
        if (!dropId || !teamId) return state;
        if (hardpoint.drop.dropId !== dropId) return state;
        if (hardpoint.grantedDropIds[dropId]) return state;
        if (!isDropTeamEligible(hardpoint.drop, teamId)) return state;
        return completeDropExtraction(state, hardpoint, action, teamId);
    }

    if (kind === 'TICK') {
        const payload = (action.payload ?? {}) as { dtSec?: number };
        const dtSec = Math.max(0, Number(payload.dtSec ?? 0));
        if (dtSec <= 0) return state;

        const dtMs = Math.round(dtSec * 1000);
        let nowMs = action.t - dtMs;
        let remainingMs = dtMs;

        while (remainingMs > 0) {
            const untilPhaseEnd = Math.max(0, hardpoint.phaseEndsAtMs - nowMs);
            const segmentMs = Math.max(1, Math.min(remainingMs, untilPhaseEnd > 0 ? untilPhaseEnd : remainingMs));
            const segmentEndMs = nowMs + segmentMs;

            if (hardpoint.zonePhase === 'ACTIVE' && hardpoint.ownerTeamId && !hardpoint.contested) {
                nextState = addSignal(nextState, hardpoint.ownerTeamId, segmentMs / 1000);
            }

            if (hardpoint.drop.state === 'INACTIVE' && hardpoint.zonePhase === 'ACTIVE') {
                hardpoint = {
                    ...hardpoint,
                    dropScheduleRemainingMs: Math.max(0, hardpoint.dropScheduleRemainingMs - segmentMs),
                };
                if (hardpoint.dropScheduleRemainingMs <= 0) {
                    hardpoint = startIncomingDrop(nextState, hardpoint, segmentEndMs);
                }
            }

            hardpoint = advanceDropByTime(nextState, hardpoint, segmentEndMs);
            nowMs = segmentEndMs;
            remainingMs -= segmentMs;

            if (segmentEndMs >= hardpoint.phaseEndsAtMs) {
                if (hardpoint.zonePhase === 'COUNTDOWN') {
                    hardpoint = {
                        ...hardpoint,
                        zonePhase: 'ACTIVE',
                        phaseEndsAtMs: segmentEndMs + ACTIVE_MS,
                    };
                    nextState = { ...nextState, phase: 'LIVE' };
                } else {
                    const zoneCount = getZoneCount(nextState);
                    hardpoint = {
                        ...hardpoint,
                        zonePhase: 'COUNTDOWN',
                        activeZoneIndex: (hardpoint.activeZoneIndex + 1) % zoneCount,
                        phaseEndsAtMs: segmentEndMs + COUNTDOWN_MS,
                        ownerTeamId: null,
                        contested: false,
                    };
                }
            }
        }

        return {
            ...nextState,
            custom: {
                ...nextState.custom,
                snapshotHardpoint: hardpoint,
            },
        };
    }

    return state;
}

export function createSignalAuthorityClient(manifest: SignalAuthorityManifest): SignalAuthorityClient {
    let state = createInitialState(manifest);
    const listeners = new Set<Subscriber>();

    return {
        dispatch(action: SignalAuthorityAction): void {
            if (action.matchId && action.matchId !== state.matchId) return;
            const reduced = reduce(state, action);
            state = {
                ...reduced,
                seq: (state.seq ?? 0) + 1,
            };
            state = {
                ...state,
                stateHash: snapshotHash(state),
            };
            for (const fn of listeners) fn(state);
        },
        getState(): SignalAuthorityState {
            return state;
        },
        subscribe(fn: Subscriber): () => void {
            listeners.add(fn);
            return () => {
                listeners.delete(fn);
            };
        },
    };
}
