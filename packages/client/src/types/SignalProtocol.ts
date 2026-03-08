export type Team = 'blue' | 'red';

export type ZoneLoopState = 'COUNTDOWN' | 'ACTIVE';
export type SignalMatchFlowState = 'PREMATCH_LOADOUT' | 'LIVE' | 'POSTMATCH';

export interface JsonVec3 {
    x: number;
    y: number;
    z: number;
}

export enum GameEventType {
    SIGNAL_GENERATED = 'SIGNAL_GENERATED',
    MATCH_WON = 'MATCH_WON',
    DROP_SPAWNED = 'DROP_SPAWNED',
    DROP_TIMEOUT = 'DROP_TIMEOUT',
    EXTRACTION_STARTED = 'EXTRACTION_STARTED',
    EXTRACTION_PROGRESS = 'EXTRACTION_PROGRESS',
    EXTRACTION_STALLED = 'EXTRACTION_STALLED',
    EXTRACTION_RESET = 'EXTRACTION_RESET',
    DROP_CAPTURED = 'DROP_CAPTURED',
    BUFF_APPLIED = 'BUFF_APPLIED',
    BUFF_EXPIRED = 'BUFF_EXPIRED',
    RESPAWN_TOKEN_CONSUMED = 'RESPAWN_TOKEN_CONSUMED',
    SUDDEN_DEATH_WARNING = 'SUDDEN_DEATH_WARNING',
    SUDDEN_DEATH_ACTIVATED = 'SUDDEN_DEATH_ACTIVATED',
    BOUNDARY_DAMAGE = 'BOUNDARY_DAMAGE',
    GOLDEN_DROP_SPAWNED = 'GOLDEN_DROP_SPAWNED',
    GOLDEN_DROP_CAPTURED = 'GOLDEN_DROP_CAPTURED',
    DROP_BUFF_START = 'DROP_BUFF_START',
    DROP_BUFF_END = 'DROP_BUFF_END',
    FORGE_LINK_PULSE = 'FORGE_LINK_PULSE',
    STAMPEDE_KNOCK = 'STAMPEDE_KNOCK',
    TOXIN_START = 'TOXIN_START',
    TOXIN_END = 'TOXIN_END',
    SCRAP_MAGNET_START = 'SCRAP_MAGNET_START',
    SCRAP_MAGNET_END = 'SCRAP_MAGNET_END',
}

export enum DropState {
    INACTIVE = 'INACTIVE',
    SPAWNED = 'SPAWNED',
    EXTRACTING = 'EXTRACTING',
    CAPTURED = 'CAPTURED',
    TIMEOUT = 'TIMEOUT',
}

export enum DropRewardType {
    FORGE_LINK = 'FORGE_LINK',
    SKY_EYE_RECON = 'SKY_EYE_RECON',
    NEURO_TOXIN_CLOUD = 'NEURO_TOXIN_CLOUD',
    STAMPEDE_OVERDRIVE = 'STAMPEDE_OVERDRIVE',
    SCRAP_MAGNET = 'SCRAP_MAGNET',
    GOLDEN_SIGNAL = 'GOLDEN_SIGNAL',
}

export type DropBuffKey =
    | 'FORGE_LINK'
    | 'SKY_EYE_RECON'
    | 'NEURO_TOXIN_CLOUD'
    | 'STAMPEDE_OVERDRIVE'
    | 'SCRAP_MAGNET';

export interface SignalGeneratedData {
    team: Team;
    amount: number;
    newTotal: number;
}

export interface MatchWonData {
    winner: Team;
    finalScore: { blue: number; red: number };
    matchDuration: number;
}

export interface DropSpawnedData {
    dropId: string;
    position: JsonVec3;
    team: Team | 'neutral';
    rewardType: DropRewardType;
    hardpointId: string;
    spawnTime: number;
}

export interface DropTimeoutData {
    dropId: string;
}

export interface ExtractionStartedData {
    playerId: string;
    dropId: string;
    team: Team;
}

export interface ExtractionProgressData {
    playerId: string;
    dropId: string;
    progress: number;
    secondsRemaining: number;
}

export interface ExtractionStalledData {
    playerId: string;
    dropId: string;
    reason: 'damage';
    stalledUntil: number;
}

export interface ExtractionResetData {
    playerId: string;
    dropId: string;
    reason: 'left_zone' | 'death';
}

export interface DropCapturedData {
    playerId: string;
    dropId: string;
    rewardType: DropRewardType;
    team: Team;
    captureTime: number;
}

export interface BuffAppliedData {
    buffType: DropRewardType;
    team: Team;
    duration?: number;
    affectedPlayers: string[];
    timestamp: number;
}

export interface BuffExpiredData {
    buffType: DropRewardType;
    team: Team;
    timestamp: number;
}

export interface RespawnTokenConsumedData {
    team: Team;
    playerId: string;
    timestamp: number;
}

export interface SuddenDeathWarningData {
    timeUntilShrink: number;
    triggerReason: 'close_score' | 'high_percentage';
    timestamp: number;
}

export interface SuddenDeathActivatedData {
    centerPoint: JsonVec3;
    shrinkRadius: number;
    timestamp: number;
}

export interface BoundaryDamageData {
    playerId: string;
    damage: number;
    distanceFromCenter: number;
    timestamp: number;
}

export interface GoldenDropSpawnedData {
    dropId: string;
    position: JsonVec3;
    timestamp: number;
}

export interface GoldenDropCapturedData {
    playerId: string;
    dropId: string;
    team: Team;
    signalBonus: number;
    timestamp: number;
}

export interface DropBuffStartData {
    team: Team;
    key: DropBuffKey;
    startT: number;
    endT: number;
    extraPayload?: Record<string, number | string>;
}

export interface DropBuffEndData {
    team: Team;
    key: DropBuffKey;
    t: number;
    reason: 'expired' | 'replaced' | 'break_200';
}

export interface ForgeLinkPulseData {
    team: Team;
    sourceVictimId: string;
    linkedPlayerIds: string[];
    incomingDamage: number;
    reducedTotalDamage: number;
    perPlayerDamage: number;
    absorbedTotal: number;
}

export interface StampedeKnockData {
    team: Team;
    attackerId: string;
    victimId: string;
    impulse: JsonVec3;
    cooldownMs: number;
}

export interface ToxinStartData {
    team: Team;
    center: JsonVec3;
    radius: number;
    endT: number;
}

export interface ToxinEndData {
    team: Team;
    t: number;
    reason: 'expired' | 'replaced' | 'break_200';
}

export interface ScrapMagnetStartData {
    team: Team;
    endT: number;
}

export interface ScrapMagnetEndData {
    team: Team;
    t: number;
    reason: 'expired' | 'replaced' | 'break_200';
}

export interface GameEventMap {
    [GameEventType.SIGNAL_GENERATED]: SignalGeneratedData;
    [GameEventType.MATCH_WON]: MatchWonData;
    [GameEventType.DROP_SPAWNED]: DropSpawnedData;
    [GameEventType.DROP_TIMEOUT]: DropTimeoutData;
    [GameEventType.EXTRACTION_STARTED]: ExtractionStartedData;
    [GameEventType.EXTRACTION_PROGRESS]: ExtractionProgressData;
    [GameEventType.EXTRACTION_STALLED]: ExtractionStalledData;
    [GameEventType.EXTRACTION_RESET]: ExtractionResetData;
    [GameEventType.DROP_CAPTURED]: DropCapturedData;
    [GameEventType.BUFF_APPLIED]: BuffAppliedData;
    [GameEventType.BUFF_EXPIRED]: BuffExpiredData;
    [GameEventType.RESPAWN_TOKEN_CONSUMED]: RespawnTokenConsumedData;
    [GameEventType.SUDDEN_DEATH_WARNING]: SuddenDeathWarningData;
    [GameEventType.SUDDEN_DEATH_ACTIVATED]: SuddenDeathActivatedData;
    [GameEventType.BOUNDARY_DAMAGE]: BoundaryDamageData;
    [GameEventType.GOLDEN_DROP_SPAWNED]: GoldenDropSpawnedData;
    [GameEventType.GOLDEN_DROP_CAPTURED]: GoldenDropCapturedData;
    [GameEventType.DROP_BUFF_START]: DropBuffStartData;
    [GameEventType.DROP_BUFF_END]: DropBuffEndData;
    [GameEventType.FORGE_LINK_PULSE]: ForgeLinkPulseData;
    [GameEventType.STAMPEDE_KNOCK]: StampedeKnockData;
    [GameEventType.TOXIN_START]: ToxinStartData;
    [GameEventType.TOXIN_END]: ToxinEndData;
    [GameEventType.SCRAP_MAGNET_START]: ScrapMagnetStartData;
    [GameEventType.SCRAP_MAGNET_END]: ScrapMagnetEndData;
}

export type GameEvent<T extends GameEventType = GameEventType> = {
    seq: number;
    timestamp: number;
    type: T;
    data: GameEventMap[T];
};

export interface Drop {
    id: string;
    state: DropState;
    rewardType: DropRewardType;
    team: Team | 'neutral';
    position: JsonVec3;
    hardpointId: string;
    spawnedAt: number;
    expiresAt: number;
    lockedByPlayerId: string | null;
    stallUntilByPlayerId: Record<string, number>;
}

export interface ExtractionState {
    activePlayerId: string | null;
    progressSeconds: number;
    startedAt?: number;
    stalledUntil?: number;
    lastProgressEmitAt: number;
}

export interface ActiveBuff {
    type: DropBuffKey;
    team: Team;
    appliedAt: number;
    expiresAt?: number;
}

export interface BuffState {
    activeBuffs: ActiveBuff[];
    overshields: Record<string, number>;
    respawnTokens: { blue: boolean; red: boolean };
    fragmentCaches: { blue: number; red: number };
}

export interface SuddenDeathState {
    warningActive: boolean;
    active: boolean;
    warningStartTime?: number;
    activatedAt?: number;
    centerPoint?: JsonVec3;
    shrinkRadius: number;
    lastBoundaryDamageTick: number;
    goldenDropSpawned: boolean;
}

export interface HardpointSnapshot {
    id: string;
    position: JsonVec3;
    radius: number;
    owner: Team | null;
    isContested: boolean;
    isActive: boolean;
    captureProgress: number;
}

export interface PlayerSnapshot {
    id: string;
    team: Team;
    position: JsonVec3;
    isAlive: boolean;
    ultimateCharge: number;
}

export interface SignalProtocolState {
    matchFlowState: SignalMatchFlowState;
    matchStartTime: number;
    elapsedSeconds: number;
    signal: { blue: number; red: number };
    signalPaused: boolean;
    signalEmitBuckets: { blue: number; red: number };
    pendingSignalAmounts: { blue: number; red: number };
    targetSignal: number;
    nextDropIn: number;
    currentDrop: Drop | null;
    extraction: ExtractionState;
    buffs: BuffState;
    suddenDeath: SuddenDeathState;
    matchEnded: boolean;
    winner: Team | null;
}

export interface SignalProtocolModeConfig {
    winSignal: number;
    zoneCountdownSec: number;
    zoneActiveSec: number;
    signalPerSecond: number;
}

export interface SignalZoneSnapshot {
    activeZoneIndex: number;
    activeZoneId: string | null;
    state: ZoneLoopState;
    stateEndsAtSec: number;
    countdownRemainingSec: number;
    activeRemainingSec: number;
    ownerTeamId: Team | null;
    contested: boolean;
}

export interface MatchReceipt {
    mode: 'SIGNAL_PROTOCOL';
    startedAt: number;
    endedAt: number;
    winner: Team | null;
    finalSignal: { blue: number; red: number };
    capturedDrops: Array<{
        dropId: string;
        playerId: string;
        team: Team;
        rewardType: DropRewardType;
        capturedAt: number;
    }>;
    fragmentsEarned: { blue: number; red: number };
    pendingCreditsEarned: { blue: number; red: number };
    totalEvents: number;
}
