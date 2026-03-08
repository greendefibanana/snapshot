import { getGameBridge, type GameBridge } from '../bridge/GameBridge';
import {
    BinaryMessageType,
    deserializeServerMessage,
    msToTicks,
    normalizeBinaryData,
    serializeClientMessage,
    type ClientMessage,
    type ServerMessage,
    unwrapBinaryMessage,
    wrapBinaryMessage,
} from '@snapshot/shared';
import {
    createMagicBlockSnapClient,
    createMagicBlockAuthorityClientAdapter,
    SignalProtocolErClient,
    parseMatchSeedHex,
    type SnapAction,
    type MagicBlockAuthorityClientAdapter,
    type SnapAuthorityBackend,
} from '@snapshot/snap';
import type { LobbyState } from '@snapshot/shared';
import {
    ComponentType,
    serializeInput,
    tick,
    type InputFrame,
    type Snapshot,
} from '@snapshot/shared/simulation';
import { Connection, PublicKey } from '@solana/web3.js';
import { createSocketIoGameTransport, type GameTransport } from './transport/GameTransport';
import { PeerTransport } from './transport/PeerTransport';
import { PeerMeshClientTransport, PeerMeshHostTransport, prewarmIceServers } from './transport/PeerMeshTransport';
import { SignalProtocolMode } from '../modes/SignalProtocolMode';
import { DropRewardType, type DropBuffKey, type GameEvent as SignalModeEvent, type SignalMatchFlowState, type Team } from '../types/SignalProtocol';
import { HardpointManager } from '../systems/HardpointManager';
import { createBVHCharacterController } from '../game/physics/BVHCharacterController';
import * as THREE from 'three';
import {
    P2P,
    P2PMoveFlags,
    P2PVfxType,
    createHitPayload,
    createMovePayload,
    createPingPayload,
    createPongPayload,
    createShootPayload,
    createVfxPayload,
    readP2PPacket,
    wrapP2PAck,
    wrapP2PClientEvent,
    wrapP2PInput,
    wrapP2PServerEvent,
    type P2PMatchState,
    type P2PPlayerState,
} from './p2p/P2PProtocol';
import {
    decodeTdmClientControl,
    decodeTdmReliableEnvelope,
    decodeTdmSnapshot,
    encodeTdmClientControl,
    encodeTdmReliableEnvelope,
    encodeTdmSnapshot,
    type TdmClientControlPayload,
    type TdmLobbyEnvelope,
    type TdmReliableEnvelope,
    type TdmReliablePayload,
    type TdmRoomConfig,
} from './tdm/TDMProtocol';
import {
    createOrderedEnvelopeBuffer,
    pushOrderedEnvelope,
    type Tdm4v4Runtime,
    type TdmPlayerState,
} from './tdm/TDMRuntime';
import {
    getMatchmakingApi,
    type MatchmakingAssignment,
    type MatchmakingStatus,
    type MatchmakingStatusResponse,
    type PublicMatchmakingMode,
} from './matchmaking/MatchmakingApi';

type TransportMode = 'socket' | 'p2p_host' | 'p2p_joiner' | 'signal4v4_host' | 'signal4v4_client' | 'tdm4v4_host' | 'tdm4v4_client';
type P2PPhase = 'idle' | 'hosting' | 'connecting' | 'connected' | 'failed';

export interface P2PStatus {
    phase: P2PPhase;
    role?: 'host' | 'joiner';
    code?: string;
    error?: string;
}

type P2PStatusListener = (status: P2PStatus) => void;
type GameEvent = any;
type SignalRewardType = 'team_overclock' | 'instant_ult_charge' | 'overshield_pack' | 'fragment_cache' | 'respawn_token' | 'golden_signal';
type DropState = {
    id: string;
    hardpointId: string;
    position: { x: number; y: number; z: number };
    ownerTeam: 1 | 2 | null;
    contested: boolean;
    landed: boolean;
    golden: boolean;
    rewardType: SignalRewardType;
    spawnedAtMs: number;
    landedAtMs?: number;
};
type MatchReceipt = {
    mode: 'signal';
    matchId: string;
    hostPlayerId: any;
    mintedBy: any;
    winnerTeam: any;
    startedAtMs: number;
    endedAtMs: number;
    teamSignal: [number, number];
    teamFragments: Record<string, number>;
    rewards: ReadonlyArray<{ rewardType: SignalRewardType; teamId?: any; playerId?: any; amount?: number; atMs: number }>;
    eventCount: number;
};

type P2PMode = 'duel' | 'duel_er' | 'signal';

interface PublicMatchmakingSession {
    ticketId: string;
    mode: PublicMatchmakingMode;
    buildVersion: string;
    region: string;
    queuedAtMs: number;
    status: MatchmakingStatus;
    matchToken: string | null;
    assignment: MatchmakingAssignment | null;
    pollingInterval: number | null;
    heartbeatInterval: number | null;
    connectStarted: boolean;
    connectedReported: boolean;
}

interface ReliableGameEventEnvelope {
    seq: number;
    event: GameEvent;
}

interface ReliablePendingMessage {
    payload: ArrayBuffer;
    lastSentAtMs: number;
}

interface SignalHardpoint {
    id: 'hardpoint1' | 'hardpoint2' | 'hardpoint3' | 'hardpoint4';
    position: { x: number; y: number; z: number };
    radius: number;
    suddenDeath: boolean;
}

const SIGNAL_P2P_ACTIVE_HARDPOINT_IDS = ['hardpoint1', 'hardpoint2', 'hardpoint4'] as const;

function getHardpointDisplayNumber(hardpointId: string | null | undefined, fallbackIndex: number): number {
    const match = typeof hardpointId === 'string' ? /^hardpoint(\d+)$/i.exec(hardpointId.trim()) : null;
    if (match) {
        const parsed = Number(match[1]);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return Math.max(1, Math.floor(fallbackIndex) + 1);
}

interface MatchLoadoutSelection {
    slotIndex: number;
    characterModelId: string;
    weaponModelId: string;
    primaryWeaponModelId?: string;
    secondaryWeaponModelId?: string;
}

interface SignalPlayerRuntime {
    playerId: string;
    teamId: 1 | 2;
    wantsExtract: boolean;
    extractProgressSec: number;
    extractStalledUntilMs: number;
    overclockUntilMs: number;
    overshield: number;
    respawnTokenUses: number;
}

class LocalSignalEventAdapter<TEvent> {
    record(_event: TEvent): void {
        // Local in-game authority currently only needs a record hook.
    }
}

interface SignalDropRuntime {
    id: string;
    hardpointId: string;
    position: { x: number; y: number; z: number };
    ownerTeam: 1 | 2 | null;
    contested: boolean;
    landed: boolean;
    golden: boolean;
    rewardType: SignalRewardType;
    spawnedAtMs: number;
    landedAtMs?: number;
    extractionByPlayerId: Record<string, number>;
}

interface SignalProtocolRuntime {
    targetSignal: number;
    signalPerSec: number;
    activeHardpointIndex: number;
    hardpoints: SignalHardpoint[];
    lastRotateAtMs: number;
    nextDropAtMs: number;
    teamSignal: [number, number];
    controllingTeam: 1 | 2 | null;
    contested: boolean;
    scoreboardFrozen: boolean;
    drop: SignalDropRuntime | null;
    players: Map<string, SignalPlayerRuntime>;
    teamFragments: { 1: number; 2: number };
    matchStartedAtMs: number;
    collapseWarningAtMs: number | null;
    collapseActiveAtMs: number | null;
    collapseRadius: number | null;
    goldenHardpointActive: boolean;
    goldenDropSpawnedAtMs: number | null;
    goldenDropCaptured: boolean;
    reliableSeqNext: number;
    reliableExpectedSeq: number;
    reliableLastAck: number;
    reliablePending: Map<number, ReliablePendingMessage>;
    reliableBuffer: Map<number, GameEvent>;
    eventLog: Array<{ seq: number; event: GameEvent; atMs: number }>;
    receipts: MatchReceipt[];
    lastSignalStateBroadcastMs: number;
    lastExtractBroadcastMs: number;
    modeTickInterval: number | null;
    reliableResendInterval: number | null;
    lastTickAtMs: number;
}

interface P2PRuntime {
    role: 'host' | 'joiner';
    transport: PeerTransport;
    code: string;
    connected: boolean;
    localPlayerId: string;
    localDisplayName: string;
    remotePlayerId: string | null;
    remoteDisplayName: string;
    matchStarted: boolean;
    lastRemoteInputSeq: number;
    state: P2PMatchState;
    pingInterval: number | null;
    fullSyncInterval: number | null;
    preRoundTimeout: number | null;
    hostHeartbeatInterval: number | null;
    lastPongRttMs: number;
    lastPoseSentAtMs: number;
    moveSequence: number;
    shotSequence: number;
    lastRemoteMoveSequence: number;
    lastRemoteShotSequence: number;
    poseHistoryByPlayerId: Map<string, { t: number; x: number; y: number; z: number }[]>;
    lastRemoteMoveRecvAtMs: number;
    moveJitterMs: number;
    lastRemoteShotRecvAtMs: number;
    telemetryInterval: number | null;
    sentFastPackets: number;
    recvFastPackets: number;
    simulatedDropIn: number;
    simulatedDropOut: number;
    antiCheatDropCount: number;
    matchMode: P2PMode;
    signal: SignalProtocolRuntime | null;
    signalSoloMode: SignalProtocolMode | null;
    signalSoloHardpointManager: HardpointManager | null;
    signalSoloLastTickAtMs: number | null;
    signalSoloAuthority: LocalSignalEventAdapter<SignalModeEvent> | null;
    signalSoloVisualDropId: string | null;
    signalSoloSpawnPoints: { 1: { x: number; y: number; z: number }; 2: { x: number; y: number; z: number } } | null;
    signalP2PVisualHardpointManager: HardpointManager | null;
    signalP2PVisualDropId: string | null;
    isSignalSolo: boolean;
    serverRoomRegistered: boolean;
}

interface Signal4v4PlayerState {
    playerId: string;
    displayName: string;
    teamId: 1 | 2;
    entityId: number;
    peerId: string | null;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    velocity: { x: number; y: number; z: number };
    health: number;
    alive: boolean;
    kills: number;
    deaths: number;
    wantsExtract: boolean;
    characterModelId: string;
    weaponModelId: string;
    lastPoseAtMs: number;
    lastSentPosition: { x: number; y: number; z: number };
}

interface Signal4v4Runtime {
    role: 'host' | 'client';
    code: string;
    matchId: string;
    localPlayerId: string;
    localTeamId: 1 | 2;
    hostPlayerId: string;
    expectedPlayers: number;
    players: Map<string, Signal4v4PlayerState>;
    hostTransport: PeerMeshHostTransport | null;
    clientTransport: PeerMeshClientTransport | null;
    matchStarted: boolean;
    hostHeartbeatInterval: number | null;
    snapshotInterval: number | null;
    tickInterval: number | null;
    preRoundTimeout: number | null;
    peerIdToPlayerId: Map<string, string>;
    connectedPlayerIds: Set<string>;
    signalMode: SignalProtocolMode | null;
    hardpointManager: HardpointManager | null;
    visualHardpointManager: HardpointManager | null;
    visualTickInterval: number | null;
    lastTickAtMs: number;
    signalVisualDropId: string | null;
    selectedLoadoutSlotByPlayerId: Record<string, number>;
    moveSequence: number;
    shotSequence: number;
}

function normalizeCode(value: string): string {
    return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function mkPlayerState(id: string, displayName: string, position: { x: number; y: number; z: number }): P2PPlayerState {
    return {
        id,
        displayName,
        health: P2P.PLAYER_MAX_HEALTH,
        kills: 0,
        deaths: 0,
        alive: true,
        position: { ...position },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        lastInputSeq: -1,
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function toLocomotionCode(name: string | undefined): number {
    switch ((name ?? '').toLowerCase()) {
        case 'walking female': return 1;
        case 'sprint': return 2;
        case 'running slide': return 3;
        case 'jump start': return 4;
        case 'jump loop': return 5;
        default: return 0;
    }
}

function fromLocomotionCode(code: number): string {
    switch (code | 0) {
        case 1: return 'Walking female';
        case 2: return 'Sprint';
        case 3: return 'Running Slide';
        case 4: return 'Jump start';
        case 5: return 'Jump Loop';
        default: return 'idle';
    }
}

const P2P_WEAPON_KIND_BY_MODEL_ID: Record<string, number> = {
    'smg1': 1,
    'sniper': 2,
    'shotta': 3,
    'short-gun': 3,
    'g88_workhorse': 4,
    'g-88-workhorse': 4,
    'kilometer': 5,
    'the_mainline': 6,
    'the-mainline': 6,
    'tungsten': 7,
    'v3_interval': 8,
    'v-3-interval': 8,
    'direct_blaser': 9,
    'direct-blaser': 9,
};

const P2P_WEAPON_MODEL_ID_BY_KIND: Record<number, string> = Object.fromEntries(
    Object.entries(P2P_WEAPON_KIND_BY_MODEL_ID).map(([modelId, kind]) => [kind, modelId])
);

const P2P_WEAPON_DAMAGE_BY_MODEL_ID: Record<string, number> = {
    'smg1': 20,
    'sniper': 55,
    'shotta': 34,
    'short-gun': 34,
    'g88_workhorse': 28,
    'g-88-workhorse': 28,
    'kilometer': 22,
    'the_mainline': 30,
    'the-mainline': 30,
    'tungsten': 38,
    'v3_interval': 26,
    'v-3-interval': 26,
    'direct_blaser': 60,
    'direct-blaser': 60,
};
const P2P_WEAPON_FIRE_INTERVAL_MS_BY_MODEL_ID: Record<string, number> = {
    'smg1': 95,
    'sniper': 750,
    'shotta': 650,
    'short-gun': 650,
    'g88_workhorse': 120,
    'g-88-workhorse': 120,
    'kilometer': 90,
    'the_mainline': 160,
    'the-mainline': 160,
    'tungsten': 420,
    'v3_interval': 140,
    'v-3-interval': 140,
    'direct_blaser': 900,
    'direct-blaser': 900,
};

const P2P_SIM_PACKET_LOSS = clamp(Number((import.meta as any).env?.VITE_P2P_SIM_PACKET_LOSS ?? 0), 0, 0.5);
const SNAP_AUTHORITY_BACKEND_DEFAULT: SnapAuthorityBackend = 'local';
const SNAP_SOLANA_RPC_URL_DEFAULT = 'https://api.devnet.solana.com';
const SNAP_MAGICBLOCK_RPC_URL_DEFAULT = 'http://127.0.0.1:8899';
const SNAP_MB_DELEGATION_PROGRAM_ID_DEFAULT = 'DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh';
const SIGNAL_AUTHORITY_COMMIT_INTERVAL_MS = 30_000;
const P2P_MAX_MOVE_STEP = 1.6;
const P2P_MAX_MOVE_SPEED = 18.0;
const P2P_MIN_SHOT_INTERVAL_MS = 55;
const P2P_TELEMETRY_INTERVAL_MS = 1000;
const TDM_RESPAWN_DELAY_MS = 3000;
const TDM_EVENT_RESEND_MS = 120;
const TDM_SEND_BACKLOG_SOFT_LIMIT = 128 * 1024;
const TDM_SEND_BACKLOG_HARD_LIMIT = 256 * 1024;
const TDM_SNAPSHOT_RATE_DEFAULT = 12;
const TDM_INPUT_RATE_DEFAULT = 20;
const TDM_SIM_TICK_MS = 1000 / 60;
const TDM_DEFAULT_CONFIG: TdmRoomConfig = {
    maxPlayers: 8,
    teamSize: 4,
    scoreLimit: 30,
    timeLimitSec: 480,
    respawnDelayMs: TDM_RESPAWN_DELAY_MS,
    prematchDelaySec: 5,
    snapshotRateHz: TDM_SNAPSHOT_RATE_DEFAULT,
    inputRateHz: TDM_INPUT_RATE_DEFAULT,
};
const SIGNAL4V4_POSE_SEND_MS = 33;
const SIGNAL4V4_SNAPSHOT_INTERVAL_MS = 100;
const SIGNAL = {
    TARGET: 500,
    SIGNAL_PER_SEC: 10,
    ROTATE_EVERY_MS: 90_000,
    DROP_EVERY_MS: 90_000,
    DROP_LAND_DELAY_MS: 3000,
    EXTRACTION_RADIUS: 5,
    EXTRACTION_SEC: 8,
    EXTRACTION_STALL_MS: 1500,
    EXTRACT_BROADCAST_MS: 100,
    STATE_BROADCAST_MS: 100,
    COLLAPSE_TRIGGER_MS: 7 * 60_000,
    COLLAPSE_WARNING_MS: 25_000,
    COLLAPSE_SHRINK_DURATION_MS: 45_000,
    COLLAPSE_RADIUS_START: 65,
    COLLAPSE_RADIUS_END: 18,
    GOLDEN_DROP_DELAY_MS: 30_000,
    GOLDEN_SIGNAL_BONUS: 150,
    RELIABLE_RESEND_MS: 120,
    MAX_EVENT_LOG: 4096,
};

function parseSnapAuthorityBackend(raw: unknown): SnapAuthorityBackend {
    return String(raw ?? '').toLowerCase() === 'magicblock' ? 'magicblock' : SNAP_AUTHORITY_BACKEND_DEFAULT;
}

function cloneDropState(drop: SignalDropRuntime): DropState {
    return {
        id: drop.id,
        hardpointId: drop.hardpointId,
        position: { ...drop.position },
        ownerTeam: drop.ownerTeam,
        contested: drop.contested,
        landed: drop.landed,
        golden: drop.golden,
        rewardType: drop.rewardType,
        spawnedAtMs: drop.spawnedAtMs,
        ...(typeof drop.landedAtMs === 'number' ? { landedAtMs: drop.landedAtMs } : {}),
    };
}

function quaternionFromAim(yaw: number, pitch: number): { x: number; y: number; z: number; w: number } {
    const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
    const quat = new THREE.Quaternion().setFromEuler(euler);
    return { x: quat.x, y: quat.y, z: quat.z, w: quat.w };
}

function normalizeWeaponModelId(raw: unknown): string {
    const value = String(raw ?? '').trim().toLowerCase();
    if (!value) return 'smg1';
    if (value === 'shotta') return 'short-gun';
    if (value === 'g88_workhorse') return 'g-88-workhorse';
    if (value === 'the_mainline') return 'the-mainline';
    if (value === 'v3_interval') return 'v-3-interval';
    return value;
}

function readTdmConfig(overrides?: Partial<Pick<TdmRoomConfig, 'maxPlayers' | 'teamSize'>>): TdmRoomConfig {
    const params = new URLSearchParams(window.location.search);
    const scoreLimit = Number(params.get('tdmScore') ?? TDM_DEFAULT_CONFIG.scoreLimit);
    const timeLimitSec = Number(params.get('tdmTime') ?? TDM_DEFAULT_CONFIG.timeLimitSec);
    const respawnDelayMs = Number(params.get('tdmRespawnMs') ?? TDM_DEFAULT_CONFIG.respawnDelayMs);
    const prematchDelaySec = Number(params.get('tdmPrematch') ?? TDM_DEFAULT_CONFIG.prematchDelaySec);
    return {
        maxPlayers: Math.max(2, Math.floor(overrides?.maxPlayers ?? TDM_DEFAULT_CONFIG.maxPlayers)),
        teamSize: Math.max(1, Math.floor(overrides?.teamSize ?? TDM_DEFAULT_CONFIG.teamSize)),
        scoreLimit: Math.max(5, Math.min(200, Math.floor(scoreLimit) || TDM_DEFAULT_CONFIG.scoreLimit)),
        timeLimitSec: Math.max(60, Math.min(1800, Math.floor(timeLimitSec) || TDM_DEFAULT_CONFIG.timeLimitSec)),
        respawnDelayMs: Math.max(1000, Math.min(10000, Math.floor(respawnDelayMs) || TDM_DEFAULT_CONFIG.respawnDelayMs)),
        prematchDelaySec: Math.max(2, Math.min(15, Math.floor(prematchDelaySec) || TDM_DEFAULT_CONFIG.prematchDelaySec)),
        snapshotRateHz: TDM_DEFAULT_CONFIG.snapshotRateHz,
        inputRateHz: TDM_DEFAULT_CONFIG.inputRateHz,
    };
}

export class GameClient {
    private channel: GameTransport;
    private bridge: GameBridge;
    private walletPublicKey: string | null = null;
    private walletDisplayName: string | null = null;
    private lastAppliedServerTick: number | null = null;
    private warnedStorageCollision = false;
    private matchEndTimeout: number | null = null;
    private mode: TransportMode = 'socket';
    private p2p: P2PRuntime | null = null;
    private signalSceneForSoloHardpoints: THREE.Scene | null = null;
    private p2pStatus: P2PStatus = { phase: 'idle' };
    private p2pStatusListeners: Set<P2PStatusListener> = new Set();
    private p2pSimPacketLoss = P2P_SIM_PACKET_LOSS;
    private snapAuthorityBackend: SnapAuthorityBackend = SNAP_AUTHORITY_BACKEND_DEFAULT;
    private snapAuthorityRpcUrl: string = SNAP_SOLANA_RPC_URL_DEFAULT;
    private magicBlockRpcUrl: string = SNAP_MAGICBLOCK_RPC_URL_DEFAULT;
    private snapAuthorityTxAdapter!: MagicBlockAuthorityClientAdapter;
    private signalAuthoritySnapClient: ReturnType<typeof createMagicBlockSnapClient> | null = null;
    private signalAuthorityErClient: SignalProtocolErClient | null = null;
    private signalAuthorityDispatchChain: Promise<void> = Promise.resolve();
    private signalAuthorityUnsubscribe: (() => void) | null = null;
    private signalAuthorityProgramId: string | null = null;
    private signalAuthoritySigner: { publicKey: any; signTransaction: (transaction: any) => Promise<any> } | null = null;
    private signalAuthorityLastCommitAtMs = 0;
    private signalAuthoritySessionId = 0;
    private activeMatchmadeP2PCode: string | null = null;
    private hardSignalAuthority = false;
    private selectedLoadoutSlotIndex = 0;
    private selectedWeaponModelId = 'smg1';
    private selectedPrimaryWeaponModelId = 'smg1';
    private selectedSecondaryWeaponModelId = 'smg1';
    private signalAuthorityMatchId: string | null = null;
    private signalAuthorityDelegated = false;
    private signalAuthorityLastCommitSignature: string | null = null;
    private pendingSignalAuthorityFinalize: { winner: Team; blue: number; red: number } | null = null;
    private signal4v4: Signal4v4Runtime | null = null;
    private tdm4v4: Tdm4v4Runtime | null = null;
    private readonly matchmakingApi = getMatchmakingApi();
    private publicMatchmaking: PublicMatchmakingSession | null = null;
    private authoritativeCollider: THREE.Mesh | null = null;
    private teamSpawnAnchors: { 1: { x: number; y: number; z: number }; 2: { x: number; y: number; z: number } } = {
        1: { x: -8, y: 3, z: -8 },
        2: { x: 8, y: 3, z: 8 },
    };
    private signalHardpointPositions: Array<{ id: string; position: { x: number; y: number; z: number }; radius?: number }> | null = null;

    constructor() {
        this.bridge = getGameBridge();
        const env = (import.meta as any).env ?? {};
        this.snapAuthorityBackend = parseSnapAuthorityBackend(env.SNAP_AUTHORITY_BACKEND);
        this.snapAuthorityRpcUrl = String(env.SOLANA_RPC_URL ?? SNAP_SOLANA_RPC_URL_DEFAULT).trim() || SNAP_SOLANA_RPC_URL_DEFAULT;
        this.magicBlockRpcUrl = String(env.MAGICBLOCK_RPC_URL ?? SNAP_MAGICBLOCK_RPC_URL_DEFAULT).trim() || SNAP_MAGICBLOCK_RPC_URL_DEFAULT;
        this.snapAuthorityTxAdapter = createMagicBlockAuthorityClientAdapter({
            backend: this.snapAuthorityBackend,
            solanaRpcUrl: this.snapAuthorityRpcUrl,
            magicblockRpcUrl: this.magicBlockRpcUrl,
        });
        this.signalAuthorityProgramId = String(
            env.SNAP_AUTHORITY_PROGRAM_ID
            ?? env.VITE_SNAP_AUTHORITY_PROGRAM_ID
            ?? '',
        ).trim() || null;
        const hardAuthorityRaw = String(env.SIGNAL_HARD_AUTHORITY ?? env.VITE_SIGNAL_HARD_AUTHORITY ?? 'false').trim().toLowerCase();
        this.hardSignalAuthority = hardAuthorityRaw === '1' || hardAuthorityRaw === 'true' || hardAuthorityRaw === 'on';

        // Use same-origin in production. Override with VITE_SERVER_URL when needed.
        const configuredServerUrl = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
        const devServerPort = (import.meta.env.VITE_SERVER_PORT as string | undefined)?.trim() || '10000';
        const devFallbackUrl =
            import.meta.env.DEV && !configuredServerUrl
                ? `${window.location.protocol}//${window.location.hostname}:${devServerPort}`
                : undefined;
        const socketUrl = configuredServerUrl || devFallbackUrl;
        const socketOptions = {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 500,
            reconnectionDelayMax: 5000,
            timeout: 20000,
        };

        this.channel = createSocketIoGameTransport(socketUrl, socketOptions);

        // Setup bridge listeners (UI -> Game)
        this.setupBridgeListeners();

        // Setup network handlers immediately so we never miss connect events
        this.setupNetworkHandlers();
        // Binary handlers use dynamic import; fire and forget
        void this.setupBinaryHandlers();

        window.addEventListener('storage', (event) => {
            if (this.warnedStorageCollision) return;
            if (event.key === 'localPlayerId' && event.newValue && event.newValue === this.channel.id) {
                console.warn('GameClient: localPlayerId seen in localStorage; use per-tab identity to avoid visibility issues.');
                this.warnedStorageCollision = true;
            }
        });
    }

    subscribeToP2PStatus(listener: P2PStatusListener): () => void {
        this.p2pStatusListeners.add(listener);
        listener(this.p2pStatus);
        return () => this.p2pStatusListeners.delete(listener);
    }

    setP2PSimulatedPacketLoss(lossRatio: number): void {
        this.p2pSimPacketLoss = clamp(lossRatio, 0, 0.5);
        console.info('[P2P NET] simulated packet loss updated', { lossRatio: this.p2pSimPacketLoss });
    }

    getP2PSimulatedPacketLoss(): number {
        return this.p2pSimPacketLoss;
    }

    private getPublicMatchmakingMode(mode: string, ruleset: string): PublicMatchmakingMode | null {
        if (ruleset !== 'casual') return null;
        if (mode === '1v1') return mode;
        return null;
    }

    private getBuildVersion(): string {
        const env = (import.meta as any).env ?? {};
        return String(env.VITE_BUILD_VERSION ?? env.BUILD_VERSION ?? env.npm_package_version ?? 'dev').trim() || 'dev';
    }

    private getPublicAssignmentForRoom(roomId: string): MatchmakingAssignment | null {
        const assignment = this.publicMatchmaking?.assignment;
        if (!assignment) return null;
        return assignment.roomId === roomId ? assignment : null;
    }

    private isPublicMatchHost(assignment: MatchmakingAssignment): boolean {
        return String(this.channel.id ?? '') !== '' && String(this.channel.id) === assignment.hostPlayerId;
    }

    private buildPublicMatchmakingLobbyState(session: PublicMatchmakingSession, status: MatchmakingStatusResponse): LobbyState {
        const assignment = status.match ?? session.assignment;
        const localPlayerId = String(this.channel.id ?? '');
        if (!assignment) {
            return {
                lobbyId: `public:${session.mode}:${session.ticketId}`,
                phase: 'queueing',
                players: [],
                localPlayerId: localPlayerId as any,
                mode: session.mode as any,
                ruleset: 'casual',
                access: 'public',
                maxPlayers: 2,
                minPlayers: 2,
                countdownSec: 0,
                queue: {
                    waitTimeSec: Math.max(0, Math.floor((Date.now() - session.queuedAtMs) / 1000)),
                    mode: session.mode as any,
                    ruleset: 'casual',
                    playersInQueue: Math.max(1, Number(status.position ?? 1)),
                },
            };
        }
        return {
            lobbyId: `public:${assignment.matchId}`,
            phase: assignment.status === 'queued' ? 'queueing' : 'assembling',
            players: assignment.players.map((player, index) => ({
                playerId: player.playerId as any,
                displayName: player.displayName,
                team: player.team,
                slot: index,
                isReady: Boolean(player.connected),
                isHost: player.playerId === assignment.hostPlayerId,
            })),
            localPlayerId: localPlayerId as any,
            mode: assignment.mode as any,
            ruleset: 'casual',
            access: 'public',
            maxPlayers: assignment.maxPlayers,
            minPlayers: assignment.maxPlayers,
            countdownSec: 0,
        };
    }

    private refreshPublicMatchmakingLobby(status: MatchmakingStatusResponse): void {
        const session = this.publicMatchmaking;
        if (!session) return;
        this.bridge.updateLobbyState(this.buildPublicMatchmakingLobbyState(session, status));
    }

    private stopPublicMatchmakingTimers(session: PublicMatchmakingSession | null): void {
        if (!session) return;
        if (session.pollingInterval !== null) window.clearInterval(session.pollingInterval);
        if (session.heartbeatInterval !== null) window.clearInterval(session.heartbeatInterval);
        session.pollingInterval = null;
        session.heartbeatInterval = null;
    }

    private resetPublicMatchmaking(requestLobbyRefresh: boolean): void {
        const session = this.publicMatchmaking;
        this.stopPublicMatchmakingTimers(session);
        this.publicMatchmaking = null;
        if (requestLobbyRefresh && this.channel.connected) {
            this.emitAuthAndLobbyRequest();
        }
    }

    private async startPublicMatchmaking(mode: PublicMatchmakingMode): Promise<void> {
        if (!this.channel.connected || !this.channel.id) {
            this.bridge.notifyGameMessage('Matchmaking is not ready. Reconnecting to backend.', 'warning');
            this.emitAuthAndLobbyRequest();
            return;
        }
        if (this.publicMatchmaking) {
            await this.cancelPublicMatchmaking(false);
        }
        const buildVersion = this.getBuildVersion();
        const region = 'global';
        // Pre-warm ICE servers while queuing so they're cached when room_found arrives
        prewarmIceServers();
        const response = await this.matchmakingApi.enqueue({
            playerId: String(this.channel.id),
            displayName: this.walletDisplayName ?? String(this.channel.id),
            mode,
            region,
            buildVersion,
        });
        const session: PublicMatchmakingSession = {
            ticketId: response.ticketId,
            mode,
            buildVersion,
            region,
            queuedAtMs: Date.now(),
            status: response.status,
            matchToken: null,
            assignment: null,
            pollingInterval: null,
            heartbeatInterval: null,
            connectStarted: false,
            connectedReported: false,
        };
        this.publicMatchmaking = session;
        this.refreshPublicMatchmakingLobby({ status: 'queued', position: 1 });
        session.heartbeatInterval = window.setInterval(() => {
            const active = this.publicMatchmaking;
            if (!active || active.ticketId !== session.ticketId) return;
            void this.matchmakingApi.heartbeat(active.ticketId).catch((error) => {
                console.warn('[MatchmakingAPI] heartbeat failed', error);
            });
        }, 5000);
        session.pollingInterval = window.setInterval(() => {
            const active = this.publicMatchmaking;
            if (!active || active.ticketId !== session.ticketId) return;
            void this.pollPublicMatchmakingStatus(active);
        }, 1500);
        void this.pollPublicMatchmakingStatus(session);
    }

    private async cancelPublicMatchmaking(refreshLobby: boolean = true): Promise<void> {
        const session = this.publicMatchmaking;
        if (!session) return;
        this.stopPublicMatchmakingTimers(session);
        try {
            await this.matchmakingApi.cancel(session.ticketId);
        } catch (error) {
            console.warn('[MatchmakingAPI] cancel failed', error);
        }
        this.publicMatchmaking = null;
        if (refreshLobby && this.channel.connected) {
            this.emitAuthAndLobbyRequest();
        }
    }

    private async pollPublicMatchmakingStatus(session: PublicMatchmakingSession): Promise<void> {
        try {
            const status = await this.matchmakingApi.getStatus(session.ticketId);
            if (!this.publicMatchmaking || this.publicMatchmaking.ticketId !== session.ticketId) return;
            session.status = status.status;
            if (status.auth?.matchToken) {
                session.matchToken = status.auth.matchToken;
            }
            if (status.match) {
                session.assignment = status.match;
            }
            this.refreshPublicMatchmakingLobby(status);
            if (status.status === 'room_found' || status.status === 'connecting' || status.status === 'ready' || status.status === 'live') {
                await this.startAssignedPublicMatch(session, status);
                return;
            }
            if (status.status === 'cancelled' || status.status === 'expired') {
                this.bridge.notifyGameMessage(
                    status.status === 'expired' ? 'Public matchmaking expired. Retry the search.' : 'Matchmaking cancelled.',
                    status.status === 'expired' ? 'warning' : 'info',
                );
                this.resetPublicMatchmaking(true);
            }
        } catch (error) {
            console.warn('[MatchmakingAPI] status failed', error);
        }
    }

    private async startAssignedPublicMatch(session: PublicMatchmakingSession, status: MatchmakingStatusResponse): Promise<void> {
        const assignment = status.match ?? session.assignment;
        if (!assignment || session.connectStarted) return;
        session.connectStarted = true;
        session.assignment = assignment;
        session.matchToken = status.auth?.matchToken ?? session.matchToken;

        const isHost = this.isPublicMatchHost(assignment);
        const maxAttempts = 3;
        const retryDelayMs = 3_000;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                if (attempt > 0) {
                    console.info(`[MatchmakingAPI] connection retry ${attempt + 1}/${maxAttempts}`);
                    this.bridge.notifyGameMessage(`Retrying connection (${attempt + 1}/${maxAttempts})...`, 'info');
                }

                // Non-host clients wait before connecting to give host time to register PeerJS ID
                if (!isHost && attempt === 0) {
                    await new Promise((resolve) => setTimeout(resolve, P2P.CLIENT_CONNECT_DELAY_MS));
                }

                if (assignment.mode !== '1v1') {
                    throw new Error(`Unsupported public matchmaking mode: ${assignment.mode}`);
                }
                if (isHost) {
                    await this.createP2PRoom(assignment.roomId, 'duel');
                } else {
                    await this.joinP2PRoom(assignment.roomId, 'duel');
                }
                // Connected successfully — exit retry loop
                return;
            } catch (error) {
                console.warn(`[MatchmakingAPI] connection attempt ${attempt + 1} failed`, error);
                if (attempt < maxAttempts - 1) {
                    // Wait before retry
                    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
                    // Check if session is still valid
                    if (!this.publicMatchmaking || this.publicMatchmaking.ticketId !== session.ticketId) return;
                    continue;
                }
                // All retries exhausted
                session.connectStarted = false;
                await this.reportPublicMatchFailed();
                this.bridge.notifyGameMessage(
                    error instanceof Error ? error.message : 'Failed to connect to the assigned room after multiple attempts.',
                    'error',
                );
                this.resetPublicMatchmaking(true);
            }
        }
    }

    private async reportPublicMatchConnected(): Promise<void> {
        const session = this.publicMatchmaking;
        if (!session || session.connectedReported) return;
        session.connectedReported = true;
        try {
            const response = await this.matchmakingApi.reportConnected(session.ticketId);
            session.status = response.status;
        } catch (error) {
            session.connectedReported = false;
            console.warn('[MatchmakingAPI] report-connected failed', error);
        }
    }

    private async reportPublicMatchFailed(): Promise<void> {
        const ticketId = this.publicMatchmaking?.ticketId;
        if (!ticketId) return;
        try {
            await this.matchmakingApi.reportFailed(ticketId);
        } catch (error) {
            console.warn('[MatchmakingAPI] report-failed failed', error);
        }
    }

    private async reportPublicMatchLive(roomId: string): Promise<void> {
        const session = this.publicMatchmaking;
        if (!session?.assignment || session.assignment.roomId !== roomId) return;
        try {
            const response = await this.matchmakingApi.reportLive(roomId);
            session.status = response.status;
            this.stopPublicMatchmakingTimers(session);
        } catch (error) {
            console.warn('[MatchmakingAPI] report-live failed', error);
        }
    }

    private async verifyPublicJoin(roomId: string, matchId: string, playerId: string, matchToken: string | undefined): Promise<boolean> {
        if (!matchToken) return false;
        try {
            const response = await this.matchmakingApi.verifyJoin({
                roomId,
                matchId,
                playerId,
                matchToken,
            });
            return response.ok === true;
        } catch (error) {
            console.warn('[MatchmakingAPI] verify-join failed', error);
            return false;
        }
    }

    getSnapAuthorityBackend(): SnapAuthorityBackend {
        return this.snapAuthorityBackend;
    }

    getSnapAuthorityRpcConfig(): { backend: SnapAuthorityBackend; solanaRpcUrl: string; magicblockRpcUrl: string } {
        return {
            backend: this.snapAuthorityBackend,
            solanaRpcUrl: this.snapAuthorityRpcUrl,
            magicblockRpcUrl: this.magicBlockRpcUrl,
        };
    }

    async submitAuthorityTransactionSkeleton(
        base64Transaction: string,
        options: { delegated?: boolean } = {},
    ): Promise<{ backendUsed: SnapAuthorityBackend; rpcUrl: string; signature: string }> {
        // Wiring point only: transaction construction/signing stays in caller.
        return this.snapAuthorityTxAdapter.sendRawTransaction(base64Transaction, {
            delegated: options.delegated ?? false,
            skipPreflight: true,
        });
    }

    configureSignalAuthorityWallet(
        signer: { publicKey: any; signTransaction: (transaction: any) => Promise<any> } | null,
        options: { programId?: string } = {},
    ): void {
        this.signalAuthoritySigner = signer;
        if (options.programId && options.programId.trim()) {
            this.signalAuthorityProgramId = options.programId.trim();
        }
    }

    private fnvHexSeed(input: string): string {
        let hash = 0x811c9dc5;
        const bytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            const c = input.charCodeAt(i % Math.max(1, input.length));
            hash ^= c;
            hash = Math.imul(hash, 0x01000193) >>> 0;
            bytes[i] = hash & 0xff;
        }
        return Array.from(bytes).map((n) => n.toString(16).padStart(2, '0')).join('');
    }

    private createUniqueAuthorityMatchId(prefix: string, roomCode: string, hostId: string, joinerId: string): string {
        const randomSuffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        return `${prefix}:${roomCode}:${hostId}:${joinerId}:${randomSuffix}`;
    }

    private formatAuthorityError(error: unknown): string {
        const message = error instanceof Error && error.message.trim()
            ? error.message.trim()
            : String(error ?? 'Unknown authority error');
        const logs = Array.isArray((error as any)?.logs)
            ? ((error as any).logs as unknown[]).filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            : [];
        if (message.includes('AccountOwnedByWrongProgram') && message.includes('DelegateMatchAccounts')) {
            return 'The current match seed is already delegated or stale. Start a fresh room after restarting the client so a new match seed is used.';
        }
        const anchorLog = logs.find((entry) => entry.includes('Program log:'));
        if (anchorLog) {
            return anchorLog.replace(/^.*Program log:\s*/, '').trim();
        }
        return String(error ?? 'Unknown authority error');
    }

    private getSignalAuthorityDelegationConfig(): { delegationProgram: PublicKey; validator: PublicKey } | null {
        const env = (import.meta as any).env ?? {};
        const validatorRaw = String(
            env.MAGICBLOCK_VALIDATOR_ID
            ?? env.VITE_MAGICBLOCK_VALIDATOR_ID
            ?? '',
        ).trim();
        if (!validatorRaw) return null;
        const delegationProgramRaw = String(
            env.SNAP_MB_DELEGATION_PROGRAM_ID
            ?? env.VITE_SNAP_MB_DELEGATION_PROGRAM_ID
            ?? SNAP_MB_DELEGATION_PROGRAM_ID_DEFAULT,
        ).trim();
        try {
            return {
                delegationProgram: new PublicKey(delegationProgramRaw),
                validator: new PublicKey(validatorRaw),
            };
        } catch (error) {
            console.warn('[SignalAuthority] invalid delegation configuration', error);
            return null;
        }
    }

    private isSignalAuthoritySessionActive(
        sessionId: number,
        matchId: string | null,
        erClient: SignalProtocolErClient | null = this.signalAuthorityErClient,
    ): boolean {
        return this.signalAuthoritySessionId === sessionId
            && this.signalAuthorityMatchId === matchId
            && this.signalAuthorityErClient === erClient;
    }

    private async autoDelegateSignalAuthorityAccounts(
        erClient: SignalProtocolErClient,
        matchId: string,
        sessionId: number,
    ): Promise<void> {
        const programId = this.signalAuthorityProgramId;
        if (!programId) {
            await (erClient as any).ensureInitialized();
            return;
        }
        const config = this.getSignalAuthorityDelegationConfig();
        if (!config) {
            await (erClient as any).ensureInitialized();
            return;
        }
        const resolution = await erClient.resolveDelegationAccounts({
            ownerProgram: new PublicKey(programId),
            delegationProgram: config.delegationProgram,
            validator: config.validator,
        });
        if (!this.isSignalAuthoritySessionActive(sessionId, matchId, erClient)) return;
        if (resolution.alreadyDelegated) {
            this.signalAuthorityDelegated = true;
            this.bridge.updateState({
                signalAuthorityDelegated: true,
                signalAuthoritySource: 'magicblock_er',
                signalAuthorityMatchId: matchId,
            });
            this.flushPendingSignalAuthorityFinalize();
            return;
        }
        const bootstrapResult = await (erClient as any).ensureInitialized({
            delegateAccounts: resolution.accounts,
        }) as { signature?: string | null; backendUsed?: 'solana_l1' } | null;
        if (!this.isSignalAuthoritySessionActive(sessionId, matchId, erClient)) return;
        this.signalAuthorityDelegated = true;
        this.bridge.updateState({
            signalAuthorityDelegated: true,
            signalAuthoritySource: bootstrapResult?.backendUsed ?? 'solana_l1',
            signalAuthorityMatchId: matchId,
        });
        this.updateSignalAuthorityCommitDebug(bootstrapResult?.signature ?? null);
        this.bridge.notifyGameMessage('MagicBlock authority delegated on Solana. ER scoring is live.', 'info');
        this.flushPendingSignalAuthorityFinalize();
    }

    private ensureSignalAuthoritySnapClient(matchIdHint: string): void {
        if (this.snapAuthorityBackend !== 'magicblock') return;
        const sessionId = ++this.signalAuthoritySessionId;
        if (this.signalAuthorityUnsubscribe) {
            this.signalAuthorityUnsubscribe();
            this.signalAuthorityUnsubscribe = null;
        }
        if (!this.signalAuthorityProgramId || !this.signalAuthoritySigner?.publicKey || !this.signalAuthoritySigner?.signTransaction) {
            if ((import.meta as any).env?.DEV) {
                console.warn('[SignalAuthority] MagicBlock backend enabled but signer/programId is missing. Chain mirroring disabled.');
            }
            this.signalAuthoritySnapClient = null;
            this.signalAuthorityErClient = null;
            return;
        }
        const env = (import.meta as any).env ?? {};
        const matchSeedHex = String(env.SNAP_MATCH_SEED_HEX ?? '').trim() || this.fnvHexSeed(matchIdHint);
        this.signalAuthorityMatchId = matchIdHint;
        this.bridge.updateState({
            signalAuthorityMatchId: matchIdHint,
            signalAuthoritySource: this.snapAuthorityBackend === 'magicblock' ? 'magicblock_er' : 'local',
            signalAuthorityDelegated: false,
        });
        this.signalAuthoritySnapClient = createMagicBlockSnapClient({
            backend: this.snapAuthorityBackend,
            programId: this.signalAuthorityProgramId,
            signer: this.signalAuthoritySigner as any,
            solanaRpcUrl: this.snapAuthorityRpcUrl,
            magicblockRpcUrl: this.magicBlockRpcUrl,
            matchSeedHex,
            pollHz: Number(env.SNAP_POLL_HZ ?? 6),
            matchId: matchIdHint,
        } as any);
        try {
            const signerPk = this.signalAuthoritySigner.publicKey instanceof PublicKey
                ? this.signalAuthoritySigner.publicKey
                : new PublicKey(String(this.signalAuthoritySigner.publicKey));
            const l1Connection = new Connection(this.snapAuthorityRpcUrl, 'confirmed');
            const erConnection = new Connection(this.magicBlockRpcUrl, 'confirmed');
            const routerUrl = String(
                env.MAGIC_ROUTER_URL
                ?? env.VITE_MAGIC_ROUTER_URL
                ?? '',
            ).trim();
            const magicProgramRaw = String(
                env.MAGIC_PROGRAM_ID
                ?? env.VITE_MAGIC_PROGRAM_ID
                ?? '',
            ).trim();
            const magicContextRaw = String(
                env.MAGIC_CONTEXT_ID
                ?? env.VITE_MAGIC_CONTEXT_ID
                ?? env.MAGIC_CONTEXT_PUBKEY
                ?? env.VITE_MAGIC_CONTEXT_PUBKEY
                ?? '',
            ).trim();
            const erClient = new SignalProtocolErClient({
                programId: new PublicKey(this.signalAuthorityProgramId),
                signer: {
                    publicKey: signerPk,
                    signTransaction: this.signalAuthoritySigner.signTransaction,
                },
                l1Connection,
                erConnection,
                ...(routerUrl ? { magicRouterUrl: routerUrl } : {}),
                matchSeed: parseMatchSeedHex(matchSeedHex),
                ...(magicProgramRaw ? { magicProgram: new PublicKey(magicProgramRaw) } : {}),
                ...(magicContextRaw ? { magicContext: new PublicKey(magicContextRaw) } : {}),
            });
            this.signalAuthorityErClient = erClient;
            erClient.resetMirroredScores(0, 0);
            this.signalAuthorityLastCommitAtMs = 0;
            this.bridge.updateState({
                signalAuthoritySource: routerUrl ? 'magic_router' : 'magicblock_er',
                signalAuthorityDelegated: false,
                signalAuthorityLastCommitSignature: null,
                signalAuthorityLatestCommitSeq: 0,
                signalAuthorityMatchId: matchIdHint,
            });
        this.signalAuthorityDispatchChain = this.signalAuthorityDispatchChain
                .then(async () => {
                    await this.autoDelegateSignalAuthorityAccounts(erClient, matchIdHint, sessionId);
                })
                .catch((error) => {
                    if (!this.isSignalAuthoritySessionActive(sessionId, matchIdHint, erClient)) return;
                    console.warn('[SignalAuthority] failed to bootstrap/delegate Anchor ER accounts', error);
                    this.bridge.updateState({
                        signalAuthoritySource: 'error',
                        signalAuthorityDelegated: false,
                        signalAuthorityMatchId: matchIdHint,
                    });
                    this.bridge.notifyGameMessage(`MagicBlock authority bootstrap failed: ${this.formatAuthorityError(error)}`, 'error');
                });
        } catch (error) {
            this.signalAuthorityErClient = null;
            this.bridge.updateState({
                signalAuthoritySource: 'error',
                signalAuthorityDelegated: false,
                signalAuthorityMatchId: matchIdHint,
            });
            this.bridge.notifyGameMessage(`MagicBlock authority initialization failed: ${this.formatAuthorityError(error)}`, 'error');
            if ((import.meta as any).env?.DEV) {
                console.warn('[SignalAuthority] failed to initialize Anchor ER mirror client', error);
            }
        }
    }

    private updateSignalAuthorityCommitDebug(signature: string | null, seq: number | null = null): void {
        this.signalAuthorityLastCommitSignature = signature;
        this.bridge.updateState({
            signalAuthorityLastCommitSignature: this.signalAuthorityLastCommitSignature,
            ...(typeof seq === 'number' ? { signalAuthorityLatestCommitSeq: seq } : {}),
            signalAuthorityDelegated: this.signalAuthorityDelegated,
            signalAuthorityMatchId: this.signalAuthorityMatchId,
        });
    }

    private isMagicBlockDuelMode(mode: P2PMode): boolean {
        return mode === 'duel_er';
    }

    private shouldAutoCommitDuringMatch(): boolean {
        return this.p2p?.matchMode === 'signal' || this.signal4v4 !== null;
    }

    private getDuelAuthorityWinnerTeam(runtime: P2PRuntime, playerId: string): Team | null {
        if (playerId === runtime.state.host.id) return 'blue';
        if (playerId === runtime.state.joiner.id) return 'red';
        return null;
    }

    private bindDuelAuthoritySubscription(runtime: P2PRuntime): void {
        if (runtime.role !== 'host' || !this.isMagicBlockDuelMode(runtime.matchMode)) return;
    }

    private initializeDuelAuthority(runtime: P2PRuntime): void {
        if (runtime.role !== 'host' || !this.isMagicBlockDuelMode(runtime.matchMode)) return;
        if (this.snapAuthorityBackend !== 'magicblock') {
            this.bridge.notifyGameMessage('MagicBlock backend is not enabled. Duel authority stayed local.', 'warning');
            return;
        }
        const duelMatchId = this.createUniqueAuthorityMatchId(
            'duel-er',
            runtime.code,
            runtime.state.host.id,
            runtime.state.joiner.id,
        );
        this.ensureSignalAuthoritySnapClient(duelMatchId);
        if (!this.signalAuthorityErClient) {
            this.bridge.notifyGameMessage('MagicBlock ER authority failed to initialize. Duel authority stayed local.', 'warning');
            return;
        }
        this.bridge.notifyGameMessage('MagicBlock ER duel authority active on host.', 'info');
    }

    private activateDuelAuthority(runtime: P2PRuntime): void {
        if (runtime.role !== 'host' || !this.isMagicBlockDuelMode(runtime.matchMode) || !this.signalAuthorityMatchId) return;
        this.bridge.notifyGameMessage('MagicBlock ER delegated for duel. Final score will commit on match end.', 'info');
    }

    private mirrorDuelAuthorityKill(runtime: P2PRuntime, scorerId: string): void {
        if (runtime.role !== 'host' || !this.isMagicBlockDuelMode(runtime.matchMode) || !this.signalAuthorityMatchId) return;
        const winnerTeam = this.getDuelAuthorityWinnerTeam(runtime, scorerId);
        if (!winnerTeam) return;
        this.bridge.updateState({
            signalSnapSignalBlue: runtime.state.host.kills,
            signalSnapSignalRed: runtime.state.joiner.kills,
        } as any);
    }

    private finalizeDuelAuthority(runtime: P2PRuntime, winnerId: string): void {
        if (runtime.role !== 'host' || !this.isMagicBlockDuelMode(runtime.matchMode)) return;
        const winnerTeam = this.getDuelAuthorityWinnerTeam(runtime, winnerId);
        if (!winnerTeam) return;
        this.scheduleSignalAuthorityFinalize(winnerTeam, runtime.state.host.kills, runtime.state.joiner.kills);
    }

    private bindSignalAuthoritySubscription(mode: SignalProtocolMode | null): void {
        if (this.signalAuthorityUnsubscribe) {
            this.signalAuthorityUnsubscribe();
            this.signalAuthorityUnsubscribe = null;
        }
        if (!mode || !this.hardSignalAuthority) return;
        const erClient = this.signalAuthorityErClient;
        const snapClient = this.signalAuthoritySnapClient;
        const matchId = this.signalAuthorityMatchId;
        const sessionId = this.signalAuthoritySessionId;
        if (erClient && matchId) {
            this.signalAuthorityUnsubscribe = erClient.subscribeState((state: any) => {
                if (!this.isSignalAuthoritySessionActive(sessionId, matchId, erClient)) return;
                mode.applyChainAuthorityState(state);
            }, Number((import.meta as any).env?.SNAP_POLL_HZ ?? 6));
            return;
        }
        if (!snapClient) return;
        this.signalAuthorityUnsubscribe = snapClient.subscribe((state: any) => {
            if (this.signalAuthoritySessionId !== sessionId || this.signalAuthorityMatchId !== matchId || this.signalAuthoritySnapClient !== snapClient) return;
            mode.applyChainAuthorityState(state);
        });
    }

    private mirrorSignalAuthorityAction(action: SnapAction): void {
        const erClient = this.signalAuthorityErClient;
        const snapClient = this.signalAuthoritySnapClient;
        const matchId = this.signalAuthorityMatchId;
        const sessionId = this.signalAuthoritySessionId;
        if (!snapClient && !erClient) return;
        this.signalAuthorityDispatchChain = this.signalAuthorityDispatchChain
            .then(async () => {
                if (matchId && action.matchId !== matchId) return;
                let handledByEr = false;
                if (erClient) {
                    try {
                        handledByEr = await erClient.mirrorAuthorityAction(action);
                        if (handledByEr && this.isSignalAuthoritySessionActive(sessionId, matchId, erClient)) {
                            this.bridge.updateState({
                                signalAuthoritySource: 'magicblock_er',
                                signalAuthorityDelegated: this.signalAuthorityDelegated,
                                signalAuthorityMatchId: matchId,
                            });
                        }
                    } catch (error) {
                        handledByEr = false;
                        console.warn('[SignalAuthority] Anchor ER mirror failed; falling back to legacy mirror', {
                            kind: action.kind,
                            error: error instanceof Error ? error.message : String(error),
                        });
                    }
                }
                if (!handledByEr && snapClient) {
                    await snapClient.dispatch(action as any);
                }
            })
            .catch((error) => {
                console.warn('[SignalAuthority] failed to mirror action to MagicBlock', {
                    kind: action.kind,
                    error: error instanceof Error ? error.message : String(error),
                });
            });
    }

    private scheduleSignalAuthorityCheckpoint(): void {
        if (!this.shouldAutoCommitDuringMatch()) return;
        const erClient = this.signalAuthorityErClient;
        const matchId = this.signalAuthorityMatchId;
        const sessionId = this.signalAuthoritySessionId;
        if (!erClient || !matchId || !erClient.canCommit()) return;
        const now = Date.now();
        if (now - this.signalAuthorityLastCommitAtMs < SIGNAL_AUTHORITY_COMMIT_INTERVAL_MS) return;
        this.signalAuthorityLastCommitAtMs = now;
        const ix = erClient.createCommitCheckpointInstruction();
        if (!ix) return;
        this.signalAuthorityDispatchChain = this.signalAuthorityDispatchChain
            .then(async () => {
                const result = await erClient.sendRouted(ix);
                if (!this.isSignalAuthoritySessionActive(sessionId, matchId, erClient)) return;
                this.updateSignalAuthorityCommitDebug(result?.signature ?? null);
            })
            .catch((error) => {
                console.warn('[SignalAuthority] periodic commit checkpoint failed', error);
                this.bridge.notifyGameMessage(`MagicBlock checkpoint failed: ${this.formatAuthorityError(error)}`, 'warning');
            });
    }

    private flushPendingSignalAuthorityFinalize(): void {
        const pending = this.pendingSignalAuthorityFinalize;
        const erClient = this.signalAuthorityErClient;
        const matchId = this.signalAuthorityMatchId;
        if (!pending || !erClient || !matchId || !erClient.canCommit()) return;
        this.pendingSignalAuthorityFinalize = null;
        this.scheduleSignalAuthorityFinalize(pending.winner, pending.blue, pending.red);
    }

    private scheduleSignalAuthorityFinalize(winner: Team, blue: number, red: number): void {
        const erClient = this.signalAuthorityErClient;
        const matchId = this.signalAuthorityMatchId;
        const sessionId = this.signalAuthoritySessionId;
        if (!erClient || !matchId || !erClient.canCommit()) {
            this.pendingSignalAuthorityFinalize = {
                winner,
                blue: Math.max(0, Math.floor(blue)),
                red: Math.max(0, Math.floor(red)),
            };
            this.bridge.notifyGameMessage(
                this.signalAuthorityDelegated
                    ? 'MagicBlock finalize queued. Waiting for authority commit readiness.'
                    : 'MagicBlock finalize queued. Waiting for delegation to finish.',
                'warning',
            );
            return;
        }
        this.pendingSignalAuthorityFinalize = null;
        const winnerTeam = winner === 'blue' ? 1 : 2;
        const ix = erClient.createCommitAndFinalizeInstruction(
            winnerTeam,
            Math.max(0, Math.floor(blue)),
            Math.max(0, Math.floor(red)),
            Math.floor(Date.now() / 1000),
        );
        if (!ix) return;
        this.signalAuthorityDispatchChain = this.signalAuthorityDispatchChain
            .then(async () => {
                const result = await erClient.sendRouted(ix);
                if (!this.isSignalAuthoritySessionActive(sessionId, matchId, erClient)) return;
                this.updateSignalAuthorityCommitDebug(result?.signature ?? null);
                this.bridge.notifyGameMessage(`MagicBlock ER match committed: ${result?.signature ?? 'pending signature'}`, 'success');
            })
            .catch((error) => {
                this.pendingSignalAuthorityFinalize = {
                    winner,
                    blue: Math.max(0, Math.floor(blue)),
                    red: Math.max(0, Math.floor(red)),
                };
                console.warn('[SignalAuthority] commit+finalize failed', error);
                this.bridge.notifyGameMessage(`MagicBlock finalize failed: ${this.formatAuthorityError(error)}`, 'error');
            });
    }

    async delegateSignalAuthorityAccounts(accounts: any): Promise<{ signature: string; backendUsed: 'solana_l1' | 'magic_router' | 'direct_er' }> {
        const erClient = this.signalAuthorityErClient;
        const matchId = this.signalAuthorityMatchId;
        const sessionId = this.signalAuthoritySessionId;
        if (!erClient || !matchId) {
            throw new Error('Signal authority ER client is not initialized.');
        }
        const result = await erClient.delegateMatchAccounts(accounts);
        if (!this.isSignalAuthoritySessionActive(sessionId, matchId, erClient)) {
            throw new Error('Signal authority session changed before delegation completed.');
        }
        this.signalAuthorityDelegated = true;
        this.bridge.updateState({
            signalAuthorityDelegated: true,
            signalAuthoritySource: result.backendUsed,
            signalAuthorityMatchId: matchId,
        });
        this.updateSignalAuthorityCommitDebug(result.signature);
        return result;
    }

    async ensureSignalAuthorityDelegated(): Promise<{ signature: string | null; backendUsed: 'solana_l1' | 'magicblock_er'; alreadyDelegated: boolean }> {
        const erClient = this.signalAuthorityErClient;
        const matchId = this.signalAuthorityMatchId;
        const sessionId = this.signalAuthoritySessionId;
        if (!erClient || !matchId) {
            throw new Error('Signal authority ER client is not initialized.');
        }
        if (!this.signalAuthorityProgramId) {
            throw new Error('SNAP_AUTHORITY_PROGRAM_ID is missing.');
        }
        const config = this.getSignalAuthorityDelegationConfig();
        if (!config) {
            throw new Error('MagicBlock delegation configuration is missing or invalid.');
        }
        const resolution = await erClient.resolveDelegationAccounts({
            ownerProgram: new PublicKey(this.signalAuthorityProgramId),
            delegationProgram: config.delegationProgram,
            validator: config.validator,
        });
        if (!this.isSignalAuthoritySessionActive(sessionId, matchId, erClient)) {
            throw new Error('Signal authority session changed before delegation resolved.');
        }
        if (resolution.alreadyDelegated) {
            this.signalAuthorityDelegated = true;
            this.bridge.updateState({
                signalAuthorityDelegated: true,
                signalAuthoritySource: 'magicblock_er',
                signalAuthorityMatchId: matchId,
            });
            this.bridge.notifyGameMessage('MagicBlock authority already delegated.', 'info');
            this.flushPendingSignalAuthorityFinalize();
            return { signature: null, backendUsed: 'magicblock_er', alreadyDelegated: true };
        }
        const result = await erClient.delegateMatchAccounts(resolution.accounts);
        if (!this.isSignalAuthoritySessionActive(sessionId, matchId, erClient)) {
            throw new Error('Signal authority session changed before delegation completed.');
        }
        this.signalAuthorityDelegated = true;
        this.bridge.updateState({
            signalAuthorityDelegated: true,
            signalAuthoritySource: result.backendUsed,
            signalAuthorityMatchId: matchId,
        });
        this.updateSignalAuthorityCommitDebug(result.signature);
        this.bridge.notifyGameMessage(`MagicBlock authority delegated: ${result.signature}`, 'success');
        this.flushPendingSignalAuthorityFinalize();
        return { signature: result.signature, backendUsed: result.backendUsed, alreadyDelegated: false };
    }

    async sendSignalAuthorityTransaction(ix: import('@solana/web3.js').TransactionInstruction): Promise<{ signature: string; backendUsed: 'magic_router' | 'direct_er' }> {
        const erClient = this.signalAuthorityErClient;
        const matchId = this.signalAuthorityMatchId;
        const sessionId = this.signalAuthoritySessionId;
        if (!erClient || !matchId) {
            throw new Error('Signal authority ER client is not initialized.');
        }
        const result = await erClient.sendErTransaction(ix);
        if (!this.isSignalAuthoritySessionActive(sessionId, matchId, erClient)) {
            throw new Error('Signal authority session changed before transaction completed.');
        }
        this.updateSignalAuthorityCommitDebug(result.signature);
        return result;
    }

    async syncSignalAuthorityScore(blue: number, red: number): Promise<{ signature: string; backendUsed: 'magic_router' | 'direct_er' }> {
        const erClient = this.signalAuthorityErClient;
        const matchId = this.signalAuthorityMatchId;
        const sessionId = this.signalAuthoritySessionId;
        if (!erClient || !matchId) {
            throw new Error('Signal authority ER client is not initialized.');
        }
        const blueScore = Math.max(0, Math.floor(blue));
        const redScore = Math.max(0, Math.floor(red));
        erClient.resetMirroredScores(blueScore, redScore);
        const ix = erClient.buildInstruction(
            'checkpoint_signal_score',
            erClient.getAuthorityMutateKeys(),
            erClient.encodeCheckpointSignalScore(blueScore, redScore, BigInt(Math.floor(Date.now() / 1000))),
        );
        const result = await erClient.sendErTransaction(ix);
        if (!this.isSignalAuthoritySessionActive(sessionId, matchId, erClient)) {
            throw new Error('Signal authority session changed before score sync completed.');
        }
        this.bridge.updateState({
            signalAuthoritySource: result.backendUsed,
            signalAuthorityMatchId: matchId,
            signalSnapSignalBlue: blueScore,
            signalSnapSignalRed: redScore,
        });
        this.updateSignalAuthorityCommitDebug(result.signature);
        this.bridge.notifyGameMessage(`MagicBlock ER score synced: ${blueScore}-${redScore}`, 'success');
        return result;
    }

    async commitSignalAuthorityCheckpoint(): Promise<{ signature: string; backendUsed: 'magic_router' | 'direct_er' } | null> {
        const erClient = this.signalAuthorityErClient;
        const matchId = this.signalAuthorityMatchId;
        const sessionId = this.signalAuthoritySessionId;
        if (!erClient || !matchId) return null;
        const ix = erClient.createCommitCheckpointInstruction();
        if (!ix) return null;
        const result = await erClient.sendErTransaction(ix);
        if (!this.isSignalAuthoritySessionActive(sessionId, matchId, erClient)) return null;
        this.updateSignalAuthorityCommitDebug(result.signature);
        this.bridge.notifyGameMessage(`MagicBlock checkpoint committed: ${result.signature}`, 'success');
        return result;
    }

    async finalizeSignalAuthorityMatch(winner: Team, blue: number, red: number): Promise<{ signature: string; backendUsed: 'magic_router' | 'direct_er' } | null> {
        const erClient = this.signalAuthorityErClient;
        const matchId = this.signalAuthorityMatchId;
        const sessionId = this.signalAuthoritySessionId;
        if (!erClient || !matchId) return null;
        const ix = erClient.createCommitAndFinalizeInstruction(
            winner === 'blue' ? 1 : 2,
            Math.max(0, Math.floor(blue)),
            Math.max(0, Math.floor(red)),
            Math.floor(Date.now() / 1000),
        );
        if (!ix) return null;
        const result = await erClient.sendErTransaction(ix);
        if (!this.isSignalAuthoritySessionActive(sessionId, matchId, erClient)) return null;
        this.updateSignalAuthorityCommitDebug(result.signature);
        this.bridge.notifyGameMessage(`MagicBlock finalize sent: ${result.signature}`, 'success');
        return result;
    }

    async createP2PRoom(codeOverride?: string, matchMode: P2PMode = 'duel'): Promise<string> {
        this.teardownP2P(false);
        this.teardownSignal4v4(false);
        this.teardownTdm4v4(false);
        const assignment = codeOverride ? this.getPublicAssignmentForRoom(codeOverride) : null;
        const roomMode = matchMode === 'signal' ? 'signal' : '1v1';
        let transport: PeerTransport | null = null;
        let registeredCode = '';
        const maxAttempts = codeOverride ? 1 : 6;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const candidate = PeerTransport.createHost(codeOverride, P2P.CONNECT_TIMEOUT_MS);
            const code = candidate.joinCode;
            const response = await this.requestServerAck<any>('p2p_register_host', {
                code,
                peerId: code,
                mode: roomMode,
                maxPeers: 2,
            }, 5000);
            if (response?.ok) {
                transport = candidate;
                registeredCode = code;
                break;
            }
            if (response?.error === 'code_in_use') {
                continue;
            }
            throw new Error(response?.error ? `Failed to create room: ${response.error}` : 'Failed to create room.');
        }
        if (!transport || !registeredCode) {
            throw new Error('Unable to create a unique room code. Please retry.');
        }
        const localId = assignment ? String(this.channel.id ?? transport.joinCode) : `p2p-host-${transport.joinCode.toLowerCase()}`;
        const localName = this.walletDisplayName ?? 'Host';
        const signalSpawns = matchMode === 'signal' ? this.getSignalP2PSpawnAnchors() : null;
        const hostSpawn = signalSpawns?.host ?? { x: -8, y: 3, z: -8 };
        const joinSpawn = signalSpawns?.joiner ?? { x: 8, y: 3, z: 8 };

        this.p2p = {
            role: 'host',
            transport,
            code: transport.joinCode,
            connected: false,
            localPlayerId: localId,
            localDisplayName: localName,
            remotePlayerId: null,
            remoteDisplayName: 'Joiner',
            matchStarted: false,
            lastRemoteInputSeq: -1,
            state: {
                hostId: localId,
                joinerId: 'p2p-joiner-pending',
                hostDisplayName: localName,
                joinerDisplayName: 'Joiner',
                host: mkPlayerState(localId, localName, hostSpawn),
                joiner: mkPlayerState('p2p-joiner-pending', 'Joiner', joinSpawn),
            },
            pingInterval: null,
            fullSyncInterval: null,
            preRoundTimeout: null,
            hostHeartbeatInterval: null,
            lastPongRttMs: 0,
            lastPoseSentAtMs: 0,
            moveSequence: 0,
            shotSequence: 0,
            lastRemoteMoveSequence: -1,
            lastRemoteShotSequence: -1,
            poseHistoryByPlayerId: new Map(),
            lastRemoteMoveRecvAtMs: 0,
            moveJitterMs: 0,
            lastRemoteShotRecvAtMs: 0,
            telemetryInterval: null,
            sentFastPackets: 0,
            recvFastPackets: 0,
            simulatedDropIn: 0,
            simulatedDropOut: 0,
            antiCheatDropCount: 0,
            matchMode,
            signal: null,
            signalSoloMode: null,
            signalSoloHardpointManager: null,
            signalSoloLastTickAtMs: null,
            signalSoloAuthority: null,
            signalSoloVisualDropId: null,
            signalSoloSpawnPoints: null,
            signalP2PVisualHardpointManager: null,
            signalP2PVisualDropId: null,
            isSignalSolo: false,
            serverRoomRegistered: true,
        };
        this.p2p.hostHeartbeatInterval = window.setInterval(() => {
            void this.requestServerAck<any>('p2p_host_heartbeat', { code: registeredCode }, 3000).catch(() => undefined);
        }, 10_000);
        this.bindP2PTransport(this.p2p);
        this.setP2PStatus({ phase: 'hosting', role: 'host', code: transport.joinCode });
        this.activeMatchmadeP2PCode = registeredCode;
        transport.connect();
        return transport.joinCode;
    }

    async joinP2PRoom(code: string, matchMode: P2PMode = 'duel'): Promise<void> {
        this.teardownP2P(false);
        this.teardownSignal4v4(false);
        this.teardownTdm4v4(false);
        const normalized = normalizeCode(code);
        const assignment = this.getPublicAssignmentForRoom(normalized);
        if (!normalized) throw new Error('Enter a valid join code.');
        const reservation = await this.requestServerAck<any>('p2p_request_join', { code: normalized }, 5000);
        if (!reservation?.ok) {
            if (reservation?.error === 'room_not_found') throw new Error('Room not found. Check the code.');
            if (reservation?.error === 'room_full') throw new Error('Room is already occupied.');
            if (reservation?.error === 'host_offline') throw new Error('Host is offline.');
            if (reservation?.error === 'cannot_join_own_room') throw new Error('You cannot join your own room.');
            throw new Error('Failed to join room.');
        }
        const targetPeerId = typeof reservation.peerId === 'string' ? reservation.peerId : '';
        if (!targetPeerId) throw new Error('Room host is unavailable.');
        const transport = PeerTransport.createJoiner(normalized, targetPeerId, P2P.CONNECT_TIMEOUT_MS);
        const localId = assignment ? String(this.channel.id ?? normalized) : `p2p-join-${Math.random().toString(36).slice(2, 8)}`;
        const localName = this.walletDisplayName ?? 'Joiner';
        const signalSpawns = matchMode === 'signal' ? this.getSignalP2PSpawnAnchors() : null;
        const hostSpawn = signalSpawns?.host ?? { x: -8, y: 3, z: -8 };
        const joinSpawn = signalSpawns?.joiner ?? { x: 8, y: 3, z: 8 };

        this.p2p = {
            role: 'joiner',
            transport,
            code: normalized,
            connected: false,
            localPlayerId: localId,
            localDisplayName: localName,
            remotePlayerId: null,
            remoteDisplayName: 'Host',
            matchStarted: false,
            lastRemoteInputSeq: -1,
            state: {
                hostId: `p2p-host-${normalized.toLowerCase()}`,
                joinerId: localId,
                hostDisplayName: 'Host',
                joinerDisplayName: localName,
                host: mkPlayerState(`p2p-host-${normalized.toLowerCase()}`, 'Host', hostSpawn),
                joiner: mkPlayerState(localId, localName, joinSpawn),
            },
            pingInterval: null,
            fullSyncInterval: null,
            preRoundTimeout: null,
            hostHeartbeatInterval: null,
            lastPongRttMs: 0,
            lastPoseSentAtMs: 0,
            moveSequence: 0,
            shotSequence: 0,
            lastRemoteMoveSequence: -1,
            lastRemoteShotSequence: -1,
            poseHistoryByPlayerId: new Map(),
            lastRemoteMoveRecvAtMs: 0,
            moveJitterMs: 0,
            lastRemoteShotRecvAtMs: 0,
            telemetryInterval: null,
            sentFastPackets: 0,
            recvFastPackets: 0,
            simulatedDropIn: 0,
            simulatedDropOut: 0,
            antiCheatDropCount: 0,
            matchMode,
            signal: null,
            signalSoloMode: null,
            signalSoloHardpointManager: null,
            signalSoloLastTickAtMs: null,
            signalSoloAuthority: null,
            signalSoloVisualDropId: null,
            signalSoloSpawnPoints: null,
            signalP2PVisualHardpointManager: null,
            signalP2PVisualDropId: null,
            isSignalSolo: false,
            serverRoomRegistered: false,
        };
        this.bindP2PTransport(this.p2p);
        this.setP2PStatus({ phase: 'connecting', role: 'joiner', code: normalized });
        this.activeMatchmadeP2PCode = normalized;
        transport.connect();
    }

    setAuthoritativeCollider(mesh: THREE.Mesh | null): void {
        this.authoritativeCollider = mesh;
        const runtime = this.tdm4v4;
        if (!runtime || runtime.role !== 'host') return;
        for (const player of runtime.players.values()) {
            player.controller?.setCollider(mesh as THREE.Mesh);
        }
    }

    private createTdmPlayerState(
        playerId: string,
        displayName: string,
        teamId: 1 | 2,
        slot: number,
        teamSlot: number,
        connected: boolean,
    ): TdmPlayerState {
        const spawn = this.getSignal4v4SpawnPosition(teamId, teamSlot);
        const controller = createBVHCharacterController(new THREE.Vector3(spawn.x, spawn.y, spawn.z));
        if (this.authoritativeCollider) {
            controller.setCollider(this.authoritativeCollider);
        }
        return {
            slot,
            playerId,
            displayName,
            teamId,
            entityId: 4001 + slot,
            peerId: null,
            connected,
            characterModelId: this.bridge.getState().selectedCharacterModelId,
            weaponModelId: normalizeWeaponModelId(this.selectedPrimaryWeaponModelId),
            activeWeaponSlot: 0,
            health: P2P.PLAYER_MAX_HEALTH,
            alive: true,
            kills: 0,
            deaths: 0,
            position: { ...spawn },
            velocity: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            isGrounded: true,
            controller,
            lastInput: null,
            lastInputSeq: -1,
            lastProcessedInputSeq: -1,
            lastProcessedInputTick: tick(0),
            nextShotAtMs: 0,
            pendingRespawnAtMs: null,
            lastPrimaryFire: false,
            localPose: {
                position: { ...spawn },
                velocity: { x: 0, y: 0, z: 0 },
                rotation: { x: 0, y: 0, z: 0, w: 1 },
                isGrounded: true,
                atMs: performance.now(),
            },
        };
    }

    private seedTdmPlayersFromAssignment(assignment: MatchmakingAssignment, localPlayerId: string): {
        players: Map<string, TdmPlayerState>;
        playerOrder: string[];
    } {
        const players = new Map<string, TdmPlayerState>();
        const playerOrder: string[] = [];
        for (const [slot, entry] of assignment.players.entries()) {
            const teamSlot = Math.max(
                0,
                assignment.players.filter((player) => player.team === entry.team).findIndex((player) => player.playerId === entry.playerId),
            );
            const player = this.createTdmPlayerState(
                entry.playerId,
                entry.displayName,
                entry.team,
                slot,
                teamSlot,
                entry.playerId === localPlayerId ? true : Boolean(entry.connected),
            );
            players.set(entry.playerId, player);
            playerOrder.push(entry.playerId);
        }
        return { players, playerOrder };
    }

    async createTdm4v4Room(codeOverride?: string): Promise<string> {
        this.teardownP2P(false);
        this.teardownSignal4v4(false);
        this.teardownTdm4v4(false);
        const assignment = codeOverride ? this.getPublicAssignmentForRoom(codeOverride) : null;
        let transport: PeerMeshHostTransport | null = null;
        let registeredCode = '';
        const maxAttempts = codeOverride ? 1 : 6;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const candidate = new PeerMeshHostTransport(codeOverride ?? normalizeCode(Math.random().toString(36).slice(2, 8)), P2P.MESH_CONNECT_TIMEOUT_MS);
            const response = await this.requestServerAck<any>('p2p_register_host', {
                code: candidate.joinCode,
                peerId: candidate.joinCode,
                mode: '4v4',
                maxPeers: assignment?.maxPlayers ?? 8,
            }, 5000);
            if (response?.ok) {
                transport = candidate;
                registeredCode = candidate.joinCode;
                break;
            }
            if (response?.error !== 'code_in_use') {
                throw new Error(response?.error ? `Failed to create TDM room: ${response.error}` : 'Failed to create TDM room.');
            }
        }
        if (!transport || !registeredCode) {
            throw new Error('Unable to create a unique TDM room code. Please retry.');
        }

        const config = readTdmConfig(assignment ? { maxPlayers: assignment.maxPlayers, teamSize: assignment.teamSize } : undefined);
        const localPlayerId = String(this.channel.id ?? `tdm-host-${registeredCode.toLowerCase()}`);
        const assignedLocal = assignment?.players.find((player) => player.playerId === localPlayerId);
        const localTeamId = assignedLocal?.team ?? 1;
        const localTeamSlot = assignment
            ? Math.max(0, assignment.players.filter((player) => player.team === localTeamId).findIndex((player) => player.playerId === localPlayerId))
            : 0;
        const seeded = assignment ? this.seedTdmPlayersFromAssignment(assignment, localPlayerId) : null;
        const localPlayer = seeded?.players.get(localPlayerId)
            ?? this.createTdmPlayerState(localPlayerId, this.walletDisplayName ?? 'Host', localTeamId, 0, localTeamSlot, true);
        localPlayer.weaponModelId = normalizeWeaponModelId(this.selectedPrimaryWeaponModelId);
        localPlayer.characterModelId = this.bridge.getState().selectedCharacterModelId;
        localPlayer.connected = true;

        this.tdm4v4 = {
            role: 'host',
            code: registeredCode,
            hostPlayerId: localPlayerId,
            localPlayerId,
            phase: 'lobby',
            config,
            players: seeded?.players ?? new Map([[localPlayerId, localPlayer]]),
            playerOrder: seeded?.playerOrder ?? [localPlayerId],
            peerIdToPlayerId: new Map(),
            hostTransport: transport,
            clientTransport: null,
            startTimeout: null,
            prematchTimeout: null,
            simInterval: null,
            snapshotInterval: null,
            statsInterval: null,
            pingInterval: null,
            enteredScene: false,
            requiredPlayers: assignment?.maxPlayers ?? 2,
            startedAtMs: null,
            endsAtMs: null,
            teamScores: { 1: 0, 2: 0 },
            reliableNextSeq: 1,
            reliableLastAckByPeerId: new Map(),
            reliablePendingByPeerId: new Map(),
            orderedEvents: createOrderedEnvelopeBuffer(),
            debug: {
                role: 'host',
                pingMs: 0,
                snapshotRateHz: 0,
                droppedSnapshots: 0,
                eventBacklog: 0,
                bytesInPerSec: 0,
                bytesOutPerSec: 0,
                lastSnapshotTick: 0,
                sendBacklogBytes: 0,
            },
            bytesInWindow: 0,
            bytesOutWindow: 0,
            lastStatsSampleAtMs: performance.now(),
            snapshotIntervalMs: 1000 / config.snapshotRateHz,
            lastInputSentAtMs: 0,
        };
        this.mode = 'tdm4v4_host';
        this.setP2PStatus({ phase: 'hosting', role: 'host', code: registeredCode });
        this.activeMatchmadeP2PCode = registeredCode;
        this.ensureTdmMatchEntered(this.tdm4v4);
        this.pushTdmLobbyState(this.tdm4v4, true);
        const runtimeSnapshot = this.tdm4v4;

        transport.onOpen(() => {
            const runtime = this.tdm4v4;
            if (!runtime || runtime.role !== 'host') return;
            this.setP2PStatus({ phase: 'connected', role: 'host', code: registeredCode });
            void this.reportPublicMatchConnected();
            runtime.pingInterval = window.setInterval(() => {
                void this.requestServerAck<any>('p2p_host_heartbeat', { code: registeredCode }, 3000).catch(() => undefined);
                this.flushTdmReliableResends(runtime);
            }, 10_000);
            this.startTdmRuntimeIntervals(runtime);
        });
        transport.onPeerClose((peerId) => {
            const runtime = this.tdm4v4;
            if (!runtime || runtime.role !== 'host') return;
            const playerId = runtime.peerIdToPlayerId.get(peerId);
            if (!playerId) return;
            const player = runtime.players.get(playerId);
            if (!player) return;
            player.connected = false;
            runtime.peerIdToPlayerId.delete(peerId);
            this.pushTdmLobbyState(runtime, true);
            this.evaluateTdmMatchEnd(runtime);
        });
        transport.onMessage((peerId, payload) => {
            this.handleTdmHostPacket(peerId, payload);
        });
        transport.onClose(() => {
            if (this.tdm4v4 !== runtimeSnapshot || runtimeSnapshot.role !== 'host') return;
            if (this.getPublicAssignmentForRoom(runtimeSnapshot.code) && runtimeSnapshot.phase !== 'live' && runtimeSnapshot.phase !== 'postmatch') {
                void this.reportPublicMatchFailed();
                this.resetPublicMatchmaking(true);
            }
            this.bridge.notifyGameMessage('TDM host room closed.', 'warning');
            this.teardownTdm4v4(true);
        });
        transport.onError((error) => {
            if (this.getPublicAssignmentForRoom(registeredCode)) {
                void this.reportPublicMatchFailed();
                this.resetPublicMatchmaking(true);
            }
            this.setP2PStatus({
                phase: 'failed',
                role: 'host',
                code: registeredCode,
                error: error instanceof Error ? error.message : 'Peer host transport failed.',
            });
        });
        transport.connect();
        return registeredCode;
    }

    async joinTdm4v4Room(code: string): Promise<void> {
        this.teardownP2P(false);
        this.teardownSignal4v4(false);
        this.teardownTdm4v4(false);
        const normalized = normalizeCode(code);
        const assignment = this.getPublicAssignmentForRoom(normalized);
        if (!normalized) throw new Error('Enter a valid TDM room code.');
        const reservation = await this.requestServerAck<any>('p2p_request_join', { code: normalized }, 5000);
        if (!reservation?.ok) {
            if (reservation?.error === 'room_not_found') throw new Error('TDM room not found. Check the code.');
            if (reservation?.error === 'room_full') throw new Error('TDM room is full.');
            if (reservation?.error === 'host_offline') throw new Error('TDM host is offline.');
            throw new Error('Failed to join TDM room.');
        }
        const targetPeerId = typeof reservation.peerId === 'string' ? reservation.peerId : '';
        if (!targetPeerId) throw new Error('TDM host peer is unavailable.');
        const transport = new PeerMeshClientTransport(
            normalized, targetPeerId, P2P.MESH_CONNECT_TIMEOUT_MS,
            P2P.MESH_CLIENT_MAX_RETRIES, P2P.MESH_CLIENT_RETRY_DELAY_MS,
        );
        const localPlayerId = String(this.channel.id ?? `tdm-${Math.random().toString(36).slice(2, 8)}`);
        const seeded = assignment ? this.seedTdmPlayersFromAssignment(assignment, localPlayerId) : null;
        this.tdm4v4 = {
            role: 'client',
            code: normalized,
            hostPlayerId: assignment?.hostPlayerId ?? '',
            localPlayerId,
            phase: 'lobby',
            config: readTdmConfig(assignment ? { maxPlayers: assignment.maxPlayers, teamSize: assignment.teamSize } : undefined),
            players: seeded?.players ?? new Map(),
            playerOrder: seeded?.playerOrder ?? [],
            peerIdToPlayerId: new Map(),
            hostTransport: null,
            clientTransport: transport,
            startTimeout: null,
            prematchTimeout: null,
            simInterval: null,
            snapshotInterval: null,
            statsInterval: null,
            pingInterval: null,
            enteredScene: false,
            requiredPlayers: assignment?.maxPlayers ?? 2,
            startedAtMs: null,
            endsAtMs: null,
            teamScores: { 1: 0, 2: 0 },
            reliableNextSeq: 1,
            reliableLastAckByPeerId: new Map(),
            reliablePendingByPeerId: new Map(),
            orderedEvents: createOrderedEnvelopeBuffer(),
            debug: {
                role: 'client',
                pingMs: 0,
                snapshotRateHz: 0,
                droppedSnapshots: 0,
                eventBacklog: 0,
                bytesInPerSec: 0,
                bytesOutPerSec: 0,
                lastSnapshotTick: 0,
                sendBacklogBytes: 0,
            },
            bytesInWindow: 0,
            bytesOutWindow: 0,
            lastStatsSampleAtMs: performance.now(),
            snapshotIntervalMs: 1000 / TDM_DEFAULT_CONFIG.snapshotRateHz,
            lastInputSentAtMs: 0,
        };
        this.mode = 'tdm4v4_client';
        this.setP2PStatus({ phase: 'connecting', role: 'joiner', code: normalized });
        this.activeMatchmadeP2PCode = normalized;
        transport.onOpen(() => {
            const runtime = this.tdm4v4;
            if (!runtime || runtime.role !== 'client') return;
            this.setP2PStatus({ phase: 'connected', role: 'joiner', code: normalized });
            void this.requestServerAck<any>('p2p_mark_connected', { code: normalized }, 3000).catch(() => undefined);
            void this.reportPublicMatchConnected();
            runtime.pingInterval = window.setInterval(() => {
                runtime.clientTransport?.send(createPingPayload(performance.now()));
            }, P2P.PING_INTERVAL_MS);
            this.startTdmRuntimeIntervals(runtime);
            runtime.clientTransport?.send(encodeTdmClientControl({
                type: 'tdm_hello',
                playerId: localPlayerId,
                displayName: this.walletDisplayName ?? localPlayerId,
                ...(transport.localPeerId ? { peerId: transport.localPeerId } : {}),
                ...(assignment?.roomId ? { roomId: assignment.roomId } : {}),
                ...(assignment?.matchId ? { matchId: assignment.matchId } : {}),
                ...(this.publicMatchmaking?.matchToken ? { matchToken: this.publicMatchmaking.matchToken } : {}),
                characterModelId: this.bridge.getState().selectedCharacterModelId,
                weaponModelId: normalizeWeaponModelId(this.selectedPrimaryWeaponModelId),
                selectedSlot: this.selectedLoadoutSlotIndex,
            }));
        });
        transport.onMessage((_peerId, payload) => {
            this.handleTdmClientPacket(payload);
        });
        transport.onClose(() => {
            const runtime = this.tdm4v4;
            if (!runtime || runtime.role !== 'client') return;
            if (this.getPublicAssignmentForRoom(runtime.code) && runtime.phase !== 'live' && runtime.phase !== 'postmatch') {
                void this.reportPublicMatchFailed();
                this.resetPublicMatchmaking(true);
            }
            this.bridge.notifyGameMessage('Disconnected from TDM host.', 'warning');
            this.teardownTdm4v4(true);
        });
        transport.onError((error) => {
            if (this.getPublicAssignmentForRoom(normalized)) {
                void this.reportPublicMatchFailed();
                this.resetPublicMatchmaking(true);
            }
            this.setP2PStatus({
                phase: 'failed',
                role: 'joiner',
                code: normalized,
                error: error instanceof Error ? error.message : 'Peer client transport failed.',
            });
        });
        transport.connect();
    }

    private startTdmRuntimeIntervals(runtime: Tdm4v4Runtime): void {
        if (runtime.role === 'host' && runtime.simInterval === null) {
            runtime.simInterval = window.setInterval(() => this.tickTdmHost(runtime), TDM_SIM_TICK_MS);
        }
        if (runtime.role === 'host' && runtime.snapshotInterval === null) {
            runtime.snapshotInterval = window.setInterval(() => this.broadcastTdmSnapshot(runtime), runtime.snapshotIntervalMs);
        }
        if (runtime.statsInterval === null) {
            runtime.statsInterval = window.setInterval(() => this.sampleTdmStats(runtime), 1000);
        }
    }

    private ensureTdmMatchEntered(runtime: Tdm4v4Runtime): void {
        const local = runtime.players.get(runtime.localPlayerId);
        if (!local || runtime.enteredScene) return;
        const allPlayers = runtime.playerOrder
            .map((playerId) => runtime.players.get(playerId))
            .filter((player): player is TdmPlayerState => !!player)
            .map((player) => ({
                playerId: player.playerId,
                teamId: player.teamId as any,
                spawnPosition: player.position,
            }));
        this.bridge.setLocalPlayerId(runtime.localPlayerId as any);
        this.bridge.notifyMatchStart({
            mode: '4v4',
            teamId: local.teamId as any,
            spawnPosition: { ...local.position },
            allPlayers,
        });
        for (const player of runtime.players.values()) {
            this.bridge.registerPlayerEntity(
                player.playerId as any,
                player.entityId as any,
                player.characterModelId,
                player.weaponModelId,
                player.teamId as any,
            );
        }
        this.bridge.updateState({
            netRole: runtime.role === 'host' ? 'p2p_host' : 'p2p_client',
            netInterpolationDelayTicks: 7,
            localPlayerEntityId: local.entityId as any,
            localTeamId: local.teamId as any,
            health: local.health,
            isDead: !local.alive,
            matchTimeRemaining: runtime.config.timeLimitSec,
            teamScores: { ...runtime.teamScores },
            ping: runtime.debug.pingMs,
        });
        runtime.enteredScene = true;
    }

    private syncTdmPlayerEntities(runtime: Tdm4v4Runtime): void {
        for (const player of runtime.players.values()) {
            this.bridge.registerPlayerEntity(
                player.playerId as any,
                player.entityId as any,
                player.characterModelId,
                player.weaponModelId,
                player.teamId as any,
            );
        }
    }

    private buildTdmLobbyEnvelope(runtime: Tdm4v4Runtime): TdmLobbyEnvelope {
        return {
            type: 'tdm_lobby',
            code: runtime.code,
            hostPlayerId: runtime.hostPlayerId || runtime.localPlayerId,
            phase: runtime.phase,
            config: runtime.config,
            players: runtime.playerOrder
                .map((playerId) => runtime.players.get(playerId))
                .filter((player): player is TdmPlayerState => !!player)
                .map((player) => ({
                    playerId: player.playerId,
                    displayName: player.displayName,
                    teamId: player.teamId,
                    entityId: player.entityId,
                    slotIndex: player.slot,
                    peerId: player.peerId,
                    connected: player.connected,
                    characterModelId: player.characterModelId,
                    weaponModelId: player.weaponModelId,
                })),
        };
    }

    private pushTdmLobbyState(runtime: Tdm4v4Runtime, broadcast: boolean): void {
        const envelope = this.buildTdmLobbyEnvelope(runtime);
        const lobbyState: LobbyState = {
            lobbyId: `tdm:${runtime.code}`,
            phase: runtime.phase === 'prematch' ? 'countdown' : runtime.phase === 'live' ? 'starting' : 'idle',
            players: envelope.players.map((player) => ({
                playerId: player.playerId,
                displayName: player.displayName,
                team: player.teamId,
                slot: player.slotIndex,
                isReady: player.connected,
                isHost: player.playerId === envelope.hostPlayerId,
            })),
            localPlayerId: runtime.localPlayerId as any,
            mode: (runtime.requiredPlayers === 4 ? '2v2' : '4v4') as any,
            ruleset: 'casual',
            access: this.getPublicAssignmentForRoom(runtime.code) ? 'public' : 'friends',
            maxPlayers: runtime.config.maxPlayers,
            minPlayers: runtime.requiredPlayers,
            countdownSec: runtime.phase === 'prematch' && runtime.startedAtMs
                ? Math.max(0, Math.ceil((runtime.startedAtMs - Date.now()) / 1000))
                : 0,
        };
        this.bridge.updateLobbyState(lobbyState);
        this.syncTdmPlayerEntities(runtime);
        this.ensureTdmMatchEntered(runtime);
        if (broadcast && runtime.role === 'host' && runtime.hostTransport) {
            this.sendTdmReliable(runtime, envelope);
        }
    }

    private handleTdmHostPacket(peerId: string, payload: ArrayBuffer): void {
        const runtime = this.tdm4v4;
        if (!runtime || runtime.role !== 'host') return;
        runtime.bytesInWindow += payload.byteLength;
        const reliableControl = decodeTdmClientControl(payload);
        if (reliableControl) {
            if (reliableControl.type === 'tdm_hello') {
                void this.applyTdmClientHello(runtime, peerId, reliableControl);
            } else {
                this.applyTdmClientControl(runtime, peerId, reliableControl);
            }
            return;
        }
        const packet = readP2PPacket(payload);
        if (packet.kind === 'input') {
            const playerId = runtime.peerIdToPlayerId.get(peerId);
            if (!playerId) return;
            const player = runtime.players.get(playerId);
            if (!player || packet.input.sequence <= player.lastInputSeq) return;
            player.lastInputSeq = packet.input.sequence;
            player.lastInput = packet.input;
            return;
        }
        if (packet.kind === 'ping') {
            runtime.hostTransport?.sendTo(peerId, createPongPayload(packet.sentAt, performance.now()));
        }
    }

    private applyTdmClientControl(runtime: Tdm4v4Runtime, peerId: string, payload: TdmClientControlPayload): void {
        if (payload.type === 'tdm_event_ack') {
            const ack = Math.max(0, Math.floor(Number(payload.ack ?? 0)));
            runtime.reliableLastAckByPeerId.set(peerId, ack);
            const pending = runtime.reliablePendingByPeerId.get(peerId);
            if (pending) {
                for (const seq of Array.from(pending.keys())) {
                    if (seq <= ack) pending.delete(seq);
                }
            }
            return;
        }
        if (payload.type === 'tdm_select_loadout') {
            const playerId = runtime.peerIdToPlayerId.get(peerId);
            if (!playerId) return;
            const player = runtime.players.get(playerId);
            if (!player) return;
            player.characterModelId = payload.characterModelId;
            player.weaponModelId = normalizeWeaponModelId(payload.weaponModelId);
            this.bridge.notifyCharacterSelected(playerId as any, player.characterModelId);
            this.bridge.notifyWeaponSelected(playerId as any, player.weaponModelId);
            this.pushTdmLobbyState(runtime, true);
        }
    }

    private async applyTdmClientHello(runtime: Tdm4v4Runtime, peerId: string, payload: Extract<TdmClientControlPayload, { type: 'tdm_hello' }>): Promise<void> {
        const assignment = this.getPublicAssignmentForRoom(runtime.code);
        if (assignment) {
            const valid = await this.verifyPublicJoin(
                String(payload.roomId ?? runtime.code),
                String(payload.matchId ?? ''),
                payload.playerId,
                payload.matchToken,
            );
            if (!valid) {
                console.warn('[MatchmakingAPI] rejected public team join', {
                    roomId: runtime.code,
                    playerId: payload.playerId,
                });
                return;
            }
        }
        let player = runtime.players.get(payload.playerId);
        if (!player) {
            const assignedPlayer = assignment?.players.find((entry) => entry.playerId === payload.playerId);
            const team1Count = Array.from(runtime.players.values()).filter((entry) => entry.teamId === 1).length;
            const team2Count = Array.from(runtime.players.values()).filter((entry) => entry.teamId === 2).length;
            const teamId: 1 | 2 = assignedPlayer?.team ?? (team1Count <= team2Count ? 1 : 2);
            const teamSlot = assignment
                ? Math.max(0, assignment.players.filter((entry) => entry.team === teamId).findIndex((entry) => entry.playerId === payload.playerId))
                : Array.from(runtime.players.values()).filter((entry) => entry.teamId === teamId).length;
            player = this.createTdmPlayerState(payload.playerId, payload.displayName, teamId, runtime.playerOrder.length, teamSlot, true);
            runtime.players.set(player.playerId, player);
            runtime.playerOrder.push(player.playerId);
        }
        player.peerId = peerId;
        player.connected = true;
        player.displayName = payload.displayName;
        player.characterModelId = payload.characterModelId;
        player.weaponModelId = normalizeWeaponModelId(payload.weaponModelId);
        runtime.peerIdToPlayerId.set(peerId, player.playerId);
        runtime.reliablePendingByPeerId.set(peerId, new Map());
        runtime.reliableLastAckByPeerId.set(peerId, 0);
        this.pushTdmLobbyState(runtime, true);
        this.maybeStartTdmPrematch(runtime);
    }

    private maybeStartTdmPrematch(runtime: Tdm4v4Runtime): void {
        if (runtime.phase !== 'lobby') return;
        if (Array.from(runtime.players.values()).filter((player) => player.connected).length < runtime.requiredPlayers) return;
        if (runtime.startTimeout !== null) {
            window.clearTimeout(runtime.startTimeout);
        }
        runtime.startTimeout = window.setTimeout(() => {
            if (!this.tdm4v4 || this.tdm4v4 !== runtime) return;
            this.startTdmPrematch(runtime);
            runtime.startTimeout = null;
        }, 1000);
    }

    private startTdmPrematch(runtime: Tdm4v4Runtime): void {
        runtime.phase = 'prematch';
        runtime.startedAtMs = Date.now() + (runtime.config.prematchDelaySec * 1000);
        this.pushTdmLobbyState(runtime, true);
        this.bridge.notifyPreRoundStart({
            durationSec: runtime.config.prematchDelaySec,
            availableCharacterModelIds: ['assasin', 'grizzly', 'kodiak', 'panda'],
        });
        this.sendTdmReliable(runtime, {
            type: 'tdm_match_start',
            startedAtMs: runtime.startedAtMs,
            phase: runtime.phase,
            config: runtime.config,
        });
        if (runtime.prematchTimeout !== null) window.clearTimeout(runtime.prematchTimeout);
        runtime.prematchTimeout = window.setTimeout(() => {
            if (!this.tdm4v4 || this.tdm4v4 !== runtime) return;
            this.startTdmLiveMatch(runtime);
            runtime.prematchTimeout = null;
        }, runtime.config.prematchDelaySec * 1000);
    }

    private startTdmLiveMatch(runtime: Tdm4v4Runtime): void {
        runtime.phase = 'live';
        runtime.startedAtMs = Date.now();
        runtime.endsAtMs = runtime.startedAtMs + (runtime.config.timeLimitSec * 1000);
        this.bridge.notifyPreRoundEnd();
        this.pushTdmLobbyState(runtime, true);
        void this.reportPublicMatchLive(runtime.code);
        this.sendTdmReliable(runtime, {
            type: 'tdm_server_message',
            message: {
                type: 'event',
                event: { type: 'match_started', mode: (runtime.requiredPlayers === 4 ? '2v2' : '4v4') as any },
                tick: tick(0 as any),
            } as any,
        });
    }

    private tickTdmHost(runtime: Tdm4v4Runtime): void {
        if (!this.tdm4v4 || this.tdm4v4 !== runtime || runtime.role !== 'host') return;
        const now = Date.now();
        const dt = TDM_SIM_TICK_MS / 1000;
        if (runtime.phase === 'live') {
            for (const player of runtime.players.values()) {
                this.advanceTdmPlayer(runtime, player, dt, now);
            }
            this.evaluateTdmMatchEnd(runtime);
            this.bridge.updateState({
                matchTimeRemaining: runtime.endsAtMs ? Math.max(0, Math.ceil((runtime.endsAtMs - now) / 1000)) : runtime.config.timeLimitSec,
                teamScores: { ...runtime.teamScores },
            });
        }
        this.flushTdmReliableResends(runtime);
    }

    private advanceTdmPlayer(runtime: Tdm4v4Runtime, player: TdmPlayerState, dt: number, now: number): void {
        if (!player.connected) return;
        if (!player.alive) {
            if (player.pendingRespawnAtMs !== null && now >= player.pendingRespawnAtMs) {
                this.respawnTdmPlayer(runtime, player);
            }
            return;
        }
        if (player.playerId === runtime.hostPlayerId && player.localPose) {
            player.position = { ...player.localPose.position };
            player.velocity = { ...player.localPose.velocity };
            player.rotation = { ...player.localPose.rotation };
            player.isGrounded = player.localPose.isGrounded;
        } else if (player.controller) {
            const input = player.lastInput;
            const aimYaw = Number(input?.aim.yaw ?? 0);
            player.controller.update(dt, {
                forward: Boolean(input?.movement.forward),
                backward: Boolean(input?.movement.backward),
                left: Boolean(input?.movement.left),
                right: Boolean(input?.movement.right),
                jump: Boolean(input?.movement.jump),
                sprint: Boolean(input?.movement.sprint),
                slide: Boolean(input?.movement.crouch || input?.movement.dodge),
                aim: Boolean(input?.secondaryFire),
            }, aimYaw);
            const pos = player.controller.getPosition();
            const vel = player.controller.getVelocity();
            player.position = { x: pos.x, y: pos.y, z: pos.z };
            player.velocity = { x: vel.x, y: vel.y, z: vel.z };
            player.isGrounded = player.controller.isGrounded;
            player.rotation = quaternionFromAim(aimYaw, Number(input?.aim.pitch ?? 0));
        }
        player.lastProcessedInputSeq = Math.max(player.lastProcessedInputSeq, player.lastInput?.sequence ?? -1);
        player.lastProcessedInputTick = player.lastInput?.tick ?? player.lastProcessedInputTick;
        this.processTdmPlayerFire(runtime, player, now);
    }

    private processTdmPlayerFire(runtime: Tdm4v4Runtime, player: TdmPlayerState, now: number): void {
        const input = player.lastInput;
        if (!input?.primaryFire || now < player.nextShotAtMs) return;
        const aimYaw = Number(input.aim.yaw ?? 0);
        const aimPitch = Number(input.aim.pitch ?? 0);
        const direction = {
            x: Math.sin(aimYaw) * Math.cos(aimPitch),
            y: Math.sin(aimPitch),
            z: Math.cos(aimYaw) * Math.cos(aimPitch),
        };
        const origin = {
            x: player.position.x,
            y: player.position.y + 1.2,
            z: player.position.z,
        };
        const weaponModelId = normalizeWeaponModelId(player.weaponModelId);
        const weaponDamage = P2P_WEAPON_DAMAGE_BY_MODEL_ID[weaponModelId] ?? P2P.DAMAGE_PER_HIT;
        const fireIntervalMs = P2P_WEAPON_FIRE_INTERVAL_MS_BY_MODEL_ID[weaponModelId] ?? P2P_MIN_SHOT_INTERVAL_MS;
        player.nextShotAtMs = now + fireIntervalMs;
        this.sendTdmReliable(runtime, {
            type: 'tdm_server_message',
            message: {
                type: 'event',
                event: {
                    type: 'shot_fired',
                    sourceId: player.entityId as any,
                    origin,
                    direction,
                    weapon: weaponModelId,
                },
                tick: player.lastProcessedInputTick,
            } as any,
        });

        let bestTarget: TdmPlayerState | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const target of runtime.players.values()) {
            if (!target.alive || target.teamId === player.teamId || target.playerId === player.playerId) continue;
            const distance = this.raySphereIntersection(
                origin,
                direction,
                { x: target.position.x, y: target.position.y + 1.2, z: target.position.z },
                P2P.PLAYER_RADIUS,
            );
            if (distance === null || distance >= bestDistance) continue;
            bestDistance = distance;
            bestTarget = target;
        }
        if (bestTarget) {
            this.applyTdmDamage(runtime, player, bestTarget, weaponDamage);
        }
    }

    private applyTdmDamage(runtime: Tdm4v4Runtime, attacker: TdmPlayerState, victim: TdmPlayerState, amount: number): void {
        victim.health = Math.max(0, victim.health - Math.max(0, Math.floor(amount)));
        this.sendTdmReliable(runtime, {
            type: 'tdm_server_message',
            message: {
                type: 'damage_applied',
                targetId: victim.playerId,
                attackerId: attacker.playerId,
                amount,
                healthAfter: victim.health,
            } as any,
        });
        if (victim.health > 0) return;
        victim.alive = false;
        victim.deaths += 1;
        victim.pendingRespawnAtMs = Date.now() + runtime.config.respawnDelayMs;
        attacker.kills += 1;
        runtime.teamScores[attacker.teamId] += 1;
        this.sendTdmReliable(runtime, {
            type: 'tdm_server_message',
            message: {
                type: 'player_died',
                victimId: victim.playerId,
                killerId: attacker.playerId,
                killerScore: attacker.kills,
            } as any,
        });
        this.sendTdmReliable(runtime, {
            type: 'tdm_server_message',
            message: {
                type: 'event',
                event: { type: 'player_died', entityId: victim.entityId, killerId: attacker.entityId, weapon: attacker.weaponModelId },
                tick: victim.lastProcessedInputTick,
            } as any,
        });
        this.sendTdmReliable(runtime, {
            type: 'tdm_server_message',
            message: {
                type: 'event',
                event: { type: 'respawn_started', playerId: victim.playerId, remainingMs: runtime.config.respawnDelayMs },
                tick: victim.lastProcessedInputTick,
            } as any,
        });
        this.sendTdmReliable(runtime, {
            type: 'tdm_server_message',
            message: {
                type: 'score_update',
                scores: {
                    team_1: runtime.teamScores[1],
                    team_2: runtime.teamScores[2],
                    [attacker.playerId]: attacker.kills,
                    [victim.playerId]: victim.kills,
                },
                targetScore: runtime.config.scoreLimit,
            } as any,
        });
    }

    private respawnTdmPlayer(runtime: Tdm4v4Runtime, player: TdmPlayerState): void {
        const teamSlot = Array.from(runtime.players.values())
            .filter((entry) => entry.teamId === player.teamId)
            .sort((a, b) => a.slot - b.slot)
            .findIndex((entry) => entry.playerId === player.playerId);
        const spawn = this.getSignal4v4SpawnPosition(player.teamId, Math.max(0, teamSlot));
        player.health = P2P.PLAYER_MAX_HEALTH;
        player.alive = true;
        player.pendingRespawnAtMs = null;
        player.position = { ...spawn };
        player.velocity = { x: 0, y: 0, z: 0 };
        player.rotation = { x: 0, y: 0, z: 0, w: 1 };
        player.nextShotAtMs = 0;
        player.controller?.reset(new THREE.Vector3(spawn.x, spawn.y, spawn.z));
        this.sendTdmReliable(runtime, {
            type: 'tdm_server_message',
            message: {
                type: 'event',
                event: { type: 'player_spawned', entityId: player.entityId, position: spawn },
                tick: tick(0 as any),
            } as any,
        });
        this.sendTdmReliable(runtime, {
            type: 'tdm_server_message',
            message: {
                type: 'event',
                event: { type: 'respawn_finished', playerId: player.playerId },
                tick: tick(0 as any),
            } as any,
        });
    }

    private evaluateTdmMatchEnd(runtime: Tdm4v4Runtime): void {
        if (runtime.phase === 'postmatch') return;
        const now = Date.now();
        const scoreWinner = runtime.teamScores[1] >= runtime.config.scoreLimit
            ? 'team_1'
            : runtime.teamScores[2] >= runtime.config.scoreLimit
                ? 'team_2'
                : null;
        const timerExpired = runtime.endsAtMs !== null && now >= runtime.endsAtMs;
        if (!scoreWinner && !timerExpired) return;
        runtime.phase = 'postmatch';
        const winnerId = scoreWinner ?? (runtime.teamScores[1] >= runtime.teamScores[2] ? 'team_1' : 'team_2');
        this.pushTdmLobbyState(runtime, true);
        this.sendTdmReliable(runtime, {
            type: 'tdm_server_message',
            message: {
                type: 'match_ended',
                winnerId,
                scores: { team_1: runtime.teamScores[1], team_2: runtime.teamScores[2] },
                targetScore: runtime.config.scoreLimit,
            } as any,
        });
    }

    private createTdmSnapshot(runtime: Tdm4v4Runtime): Snapshot {
        const snapshotTick = tick(Math.max(1, Math.floor(performance.now() / TDM_SIM_TICK_MS)));
        return {
            tick: snapshotTick,
            timestamp: Date.now(),
            deletedEntityIds: [],
            entities: runtime.playerOrder
                .map((playerId) => runtime.players.get(playerId))
                .filter((player): player is TdmPlayerState => !!player)
                .map((player) => ({
                    id: player.entityId as any,
                    components: ComponentType.Transform | ComponentType.Physics | ComponentType.Player | ComponentType.Health | ComponentType.Weapon,
                    transform: {
                        position: { ...player.position },
                        rotation: { ...player.rotation },
                    },
                    physics: {
                        velocity: { ...player.velocity },
                        isGrounded: player.isGrounded,
                    },
                    player: {
                        playerId: player.playerId,
                        teamId: player.teamId,
                        isAlive: player.alive,
                        characterModelId: player.characterModelId,
                        lastProcessedInputTick: player.lastProcessedInputTick,
                    },
                    health: {
                        health: player.health,
                        maxHealth: P2P.PLAYER_MAX_HEALTH,
                        shield: 0,
                        maxShield: 0,
                    },
                    weapon: {
                        activeSlot: player.activeWeaponSlot,
                        ammo: 30,
                        isReloading: false,
                        reloadEndTick: tick(0 as any),
                        nextFireTick: tick(0 as any),
                    },
                })),
        };
    }

    private broadcastTdmSnapshot(runtime: Tdm4v4Runtime): void {
        if (!this.tdm4v4 || this.tdm4v4 !== runtime || runtime.role !== 'host' || !runtime.hostTransport) return;
        const bufferedAmount = runtime.hostTransport.getMaxBufferedAmount();
        runtime.debug.sendBacklogBytes = bufferedAmount;
        if (bufferedAmount >= TDM_SEND_BACKLOG_HARD_LIMIT) {
            runtime.debug.droppedSnapshots += 1;
            this.bridge.updateState({ netDroppedSnapshots: runtime.debug.droppedSnapshots, netSendBacklogBytes: bufferedAmount });
            return;
        }
        const snapshot = this.createTdmSnapshot(runtime);
        const payload = encodeTdmSnapshot(snapshot);
        if (bufferedAmount >= TDM_SEND_BACKLOG_SOFT_LIMIT) {
            runtime.debug.droppedSnapshots += 1;
            this.bridge.updateState({ netDroppedSnapshots: runtime.debug.droppedSnapshots, netSendBacklogBytes: bufferedAmount });
        } else {
            runtime.hostTransport.broadcast(payload);
            runtime.bytesOutWindow += payload.byteLength * Math.max(1, runtime.hostTransport.connectedPeerIds.length);
        }
        this.applyTdmSnapshot(runtime, snapshot);
    }

    private sampleTdmStats(runtime: Tdm4v4Runtime): void {
        const now = performance.now();
        const elapsedSec = Math.max(1, (now - runtime.lastStatsSampleAtMs) / 1000);
        runtime.debug.bytesInPerSec = Math.round(runtime.bytesInWindow / elapsedSec);
        runtime.debug.bytesOutPerSec = Math.round(runtime.bytesOutWindow / elapsedSec);
        runtime.debug.snapshotRateHz = runtime.snapshotIntervalMs > 0 ? Math.round(1000 / runtime.snapshotIntervalMs) : 0;
        runtime.debug.eventBacklog = runtime.orderedEvents.buffered.size;
        runtime.bytesInWindow = 0;
        runtime.bytesOutWindow = 0;
        runtime.lastStatsSampleAtMs = now;
        this.bridge.updateState({
            ping: runtime.debug.pingMs,
            netRole: runtime.role === 'host' ? 'p2p_host' : 'p2p_client',
            netSnapshotRate: runtime.debug.snapshotRateHz,
            netDroppedSnapshots: runtime.debug.droppedSnapshots,
            netEventBacklog: runtime.debug.eventBacklog,
            netBytesInPerSec: runtime.debug.bytesInPerSec,
            netBytesOutPerSec: runtime.debug.bytesOutPerSec,
            netSendBacklogBytes: runtime.debug.sendBacklogBytes,
        });
    }

    private sendTdmReliable(runtime: Tdm4v4Runtime, payload: TdmReliablePayload, targetPeerId?: string): void {
        const envelope: TdmReliableEnvelope = {
            type: 'tdm_reliable',
            seq: runtime.reliableNextSeq++,
            payload,
        };
        if (runtime.role !== 'host' || !runtime.hostTransport) {
            this.applyTdmReliablePayload(runtime, envelope.payload);
            return;
        }
        const encoded = encodeTdmReliableEnvelope(envelope);
        const recipients = targetPeerId ? [targetPeerId] : runtime.hostTransport.connectedPeerIds;
        for (const peerId of recipients) {
            runtime.hostTransport.sendTo(peerId, encoded);
            runtime.bytesOutWindow += encoded.byteLength;
            const pending = runtime.reliablePendingByPeerId.get(peerId) ?? new Map<number, { payload: ArrayBuffer; lastSentAtMs: number }>();
            pending.set(envelope.seq, { payload: encoded, lastSentAtMs: performance.now() });
            runtime.reliablePendingByPeerId.set(peerId, pending);
        }
        this.applyTdmReliablePayload(runtime, envelope.payload);
    }

    private flushTdmReliableResends(runtime: Tdm4v4Runtime): void {
        if (runtime.role !== 'host' || !runtime.hostTransport) return;
        const now = performance.now();
        for (const peerId of runtime.hostTransport.connectedPeerIds) {
            const ack = runtime.reliableLastAckByPeerId.get(peerId) ?? 0;
            const pending = runtime.reliablePendingByPeerId.get(peerId);
            if (!pending) continue;
            for (const [seq, state] of pending.entries()) {
                if (seq <= ack) {
                    pending.delete(seq);
                    continue;
                }
                if (now - state.lastSentAtMs < TDM_EVENT_RESEND_MS) continue;
                runtime.hostTransport.sendTo(peerId, state.payload);
                runtime.bytesOutWindow += state.payload.byteLength;
                state.lastSentAtMs = now;
            }
        }
    }

    private handleTdmClientPacket(payload: ArrayBuffer): void {
        const runtime = this.tdm4v4;
        if (!runtime || runtime.role !== 'client') return;
        runtime.bytesInWindow += payload.byteLength;
        const envelope = decodeTdmReliableEnvelope(payload);
        if (envelope) {
            const contiguous = pushOrderedEnvelope(runtime.orderedEvents, envelope);
            for (const next of contiguous) {
                this.applyTdmReliablePayload(runtime, next.payload);
            }
            runtime.clientTransport?.send(encodeTdmClientControl({
                type: 'tdm_event_ack',
                ack: runtime.orderedEvents.expectedSeq - 1,
            }));
            return;
        }
        const snapshot = decodeTdmSnapshot(payload);
        if (snapshot) {
            this.applyTdmSnapshot(runtime, snapshot);
            return;
        }
        const packet = readP2PPacket(payload);
        if (packet.kind === 'ping') {
            runtime.clientTransport?.send(createPongPayload(packet.sentAt, performance.now()));
            return;
        }
        if (packet.kind === 'pong') {
            runtime.debug.pingMs = Math.max(0, Math.round(performance.now() - packet.sentAt));
            this.bridge.updateState({ ping: runtime.debug.pingMs });
        }
    }

    private applyTdmReliablePayload(runtime: Tdm4v4Runtime, payload: TdmReliablePayload): void {
        if (payload.type === 'tdm_lobby') {
            runtime.hostPlayerId = payload.hostPlayerId;
            runtime.phase = payload.phase;
            runtime.config = payload.config;
            runtime.requiredPlayers = Math.max(2, payload.config.maxPlayers);
            runtime.playerOrder = [];
            const seen = new Set<string>();
            for (const playerInfo of payload.players) {
                let player = runtime.players.get(playerInfo.playerId);
                if (!player) {
                    const teamSlot = Math.max(
                        0,
                        payload.players
                            .filter((entry) => entry.teamId === playerInfo.teamId)
                            .findIndex((entry) => entry.playerId === playerInfo.playerId),
                    );
                    player = this.createTdmPlayerState(
                        playerInfo.playerId,
                        playerInfo.displayName,
                        playerInfo.teamId,
                        playerInfo.slotIndex,
                        teamSlot,
                        playerInfo.connected,
                    );
                    runtime.players.set(player.playerId, player);
                }
                player.displayName = playerInfo.displayName;
                player.teamId = playerInfo.teamId;
                player.entityId = playerInfo.entityId;
                player.peerId = playerInfo.peerId ?? null;
                player.connected = playerInfo.connected;
                player.characterModelId = playerInfo.characterModelId;
                player.weaponModelId = normalizeWeaponModelId(playerInfo.weaponModelId);
                runtime.playerOrder.push(player.playerId);
                seen.add(player.playerId);
            }
            for (const playerId of Array.from(runtime.players.keys())) {
                if (!seen.has(playerId)) runtime.players.delete(playerId);
            }
            this.pushTdmLobbyState(runtime, false);
            return;
        }
        if (payload.type === 'tdm_match_start') {
            runtime.phase = payload.phase;
            runtime.config = payload.config;
            runtime.startedAtMs = payload.startedAtMs;
            this.bridge.notifyPreRoundStart({
                durationSec: Math.max(1, Math.ceil((payload.startedAtMs - Date.now()) / 1000)),
                availableCharacterModelIds: ['assasin', 'grizzly', 'kodiak', 'panda'],
            });
            return;
        }
        if (payload.type === 'tdm_server_message') {
            this.handleServerMessage(payload.message as any);
            if (payload.message.type === 'match_ended') {
                runtime.phase = 'postmatch';
            }
            if (payload.message.type === 'score_update') {
                runtime.teamScores = {
                    1: Number(payload.message.scores?.team_1 ?? runtime.teamScores[1]),
                    2: Number(payload.message.scores?.team_2 ?? runtime.teamScores[2]),
                };
            }
            if (payload.message.type === 'event' && (payload.message.event as any)?.type === 'match_started') {
                runtime.phase = 'live';
                this.bridge.notifyPreRoundEnd();
            }
        }
    }

    private applyTdmSnapshot(runtime: Tdm4v4Runtime, snapshot: Snapshot): void {
        if ((snapshot.tick as number) <= runtime.debug.lastSnapshotTick) {
            runtime.debug.droppedSnapshots += 1;
            return;
        }
        runtime.debug.lastSnapshotTick = snapshot.tick as number;
        this.bridge.processSnapshot(snapshot as any);
        const local = runtime.players.get(runtime.localPlayerId);
        if (local) {
            this.bridge.updateState({
                localPlayerEntityId: local.entityId as any,
                localTeamId: local.teamId as any,
            });
        }
    }

    private teardownTdm4v4(resetStatus: boolean): void {
        const runtime = this.tdm4v4;
        if (runtime) {
            if (runtime.role === 'host') {
                this.channel.emit('p2p_release_room', { code: runtime.code });
            }
            if (runtime.startTimeout !== null) window.clearTimeout(runtime.startTimeout);
            if (runtime.prematchTimeout !== null) window.clearTimeout(runtime.prematchTimeout);
            if (runtime.simInterval !== null) window.clearInterval(runtime.simInterval);
            if (runtime.snapshotInterval !== null) window.clearInterval(runtime.snapshotInterval);
            if (runtime.statsInterval !== null) window.clearInterval(runtime.statsInterval);
            if (runtime.pingInterval !== null) window.clearInterval(runtime.pingInterval);
            runtime.hostTransport?.disconnect();
            runtime.clientTransport?.disconnect();
        }
        this.tdm4v4 = null;
        if (this.mode === 'tdm4v4_host' || this.mode === 'tdm4v4_client') {
            this.mode = 'socket';
        }
        this.bridge.updateState({
            netRole: this.channel.connected ? 'socket' : 'offline',
            netSnapshotRate: 0,
            netDroppedSnapshots: 0,
            netEventBacklog: 0,
            netBytesInPerSec: 0,
            netBytesOutPerSec: 0,
            netSendBacklogBytes: 0,
        });
        if (resetStatus) this.setP2PStatus({ phase: 'idle' });
    }

    private buildSignal4v4Player(
        playerId: string,
        teamId: 1 | 2,
        entityId: number,
        slotIndex: number,
    ): Signal4v4PlayerState {
        const spawn = this.getSignal4v4SpawnPosition(teamId, slotIndex);
        return {
            playerId,
            displayName: playerId,
            teamId,
            entityId,
            peerId: null,
            position: { ...spawn },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            velocity: { x: 0, y: 0, z: 0 },
            health: P2P.PLAYER_MAX_HEALTH,
            alive: true,
            kills: 0,
            deaths: 0,
            wantsExtract: false,
            characterModelId: 'assasin',
            weaponModelId: 'smg1',
            lastPoseAtMs: performance.now(),
            lastSentPosition: { ...spawn },
        };
    }

    private getSignal4v4SpawnPosition(teamId: 1 | 2, slotIndex: number): { x: number; y: number; z: number } {
        const base = this.teamSpawnAnchors[teamId];
        const offsets = [
            { x: -2.5, z: -2.5 },
            { x: 2.5, z: -2.5 },
            { x: -2.5, z: 2.5 },
            { x: 2.5, z: 2.5 },
        ];
        const offset = offsets[slotIndex % offsets.length] ?? { x: 0, z: 0 };
        return {
            x: base.x + offset.x,
            y: base.y,
            z: base.z + offset.z,
        };
    }

    private getSignal4v4HardpointLayout(): Array<{ id: string; position: { x: number; y: number; z: number }; radius?: number }> {
        if (this.signalHardpointPositions && this.signalHardpointPositions.length >= 3) {
            return this.signalHardpointPositions;
        }
        return this.createDefaultSignalHardpoints().map((hp) => ({
            id: hp.id,
            position: { ...hp.position },
            radius: hp.radius,
        }));
    }

    private createSceneBoundHardpointManager(scene: THREE.Scene): HardpointManager {
        return HardpointManager.fromPositions(this.getSignal4v4HardpointLayout(), scene);
    }

    async createSignal4v4Room(code: string, matchData: any): Promise<void> {
        this.teardownP2P(false);
        this.teardownSignal4v4(false);
        this.teardownTdm4v4(false);
        const transport = new PeerMeshHostTransport(code, P2P.MESH_CONNECT_TIMEOUT_MS);
        const localPlayerId = String(this.channel.id ?? '');
        const roster = Array.isArray(matchData?.players) ? matchData.players : [];
        const players = new Map<string, Signal4v4PlayerState>();
        const teamSlots = { 1: 0, 2: 0 };
        roster.forEach((entry: any, index: number) => {
            const teamId = Number(entry?.teamId ?? 1) === 2 ? 2 : 1;
            const slotIndex = teamSlots[teamId as 1 | 2]++;
            players.set(String(entry.playerId), this.buildSignal4v4Player(String(entry.playerId), teamId as 1 | 2, 2001 + index, slotIndex));
        });
        const local = players.get(localPlayerId);
        if (!local) {
            throw new Error('4v4 host player is missing from match roster.');
        }
        local.displayName = this.walletDisplayName ?? localPlayerId;
        local.characterModelId = this.bridge.getState().selectedCharacterModelId;
        local.weaponModelId = this.selectedPrimaryWeaponModelId;
        this.signal4v4 = {
            role: 'host',
            code,
            matchId: String(matchData?.matchId ?? `sig4:${code}`),
            localPlayerId,
            localTeamId: local.teamId,
            hostPlayerId: String(matchData?.hostPlayerId ?? localPlayerId),
            expectedPlayers: Number(matchData?.maxPlayers ?? roster.length ?? 8),
            players,
            hostTransport: transport,
            clientTransport: null,
            matchStarted: false,
            hostHeartbeatInterval: null,
            snapshotInterval: null,
            tickInterval: null,
            preRoundTimeout: null,
            peerIdToPlayerId: new Map(),
            connectedPlayerIds: new Set([localPlayerId]),
            signalMode: null,
            hardpointManager: null,
            visualHardpointManager: null,
            visualTickInterval: null,
            lastTickAtMs: performance.now(),
            signalVisualDropId: null,
            selectedLoadoutSlotByPlayerId: {},
            moveSequence: 0,
            shotSequence: 0,
        };
        this.mode = 'signal4v4_host';
        this.setP2PStatus({ phase: 'hosting', role: 'host', code });
        this.activeMatchmadeP2PCode = code;
        await this.requestServerAck<any>('p2p_register_host', { code, peerId: code, mode: 'signal_4v4', maxPeers: this.signal4v4?.expectedPlayers ?? 8 }, 5000);
        const runtimeSnapshot = this.signal4v4;
        transport.onOpen(() => {
            if (!this.signal4v4) return;
            this.setP2PStatus({ phase: 'connected', role: 'host', code });
            this.signal4v4.hostHeartbeatInterval = window.setInterval(() => {
                void this.requestServerAck<any>('p2p_host_heartbeat', { code }, 3000).catch(() => undefined);
            }, 10_000);
        });
        transport.onPeerOpen((peerId) => {
            if (!this.signal4v4) return;
            console.info('[Signal4v4] peer connected', { peerId, connected: this.signal4v4.connectedPlayerIds.size + 1, expected: this.signal4v4.expectedPlayers });
        });
        transport.onPeerClose((peerId) => {
            if (!this.signal4v4) return;
            const playerId = this.signal4v4.peerIdToPlayerId.get(peerId);
            if (playerId) {
                this.signal4v4.connectedPlayerIds.delete(playerId);
                this.signal4v4.peerIdToPlayerId.delete(peerId);
            }
        });
        transport.onMessage((peerId, payload) => {
            this.handleSignal4v4HostPacket(peerId, payload);
        });
        transport.onClose(() => {
            if (this.signal4v4 !== runtimeSnapshot || runtimeSnapshot?.role !== 'host') return;
            this.bridge.notifyGameMessage('Signal 4v4 host room closed.', 'warning');
            this.teardownSignal4v4(true);
        });
        transport.onError((error) => {
            this.setP2PStatus({
                phase: 'failed',
                role: 'host',
                code,
                error: error instanceof Error ? error.message : 'Signal 4v4 host transport failed.',
            });
        });
        transport.connect();
    }

    async joinSignal4v4Room(code: string, matchData: any): Promise<void> {
        this.teardownP2P(false);
        this.teardownSignal4v4(false);
        this.teardownTdm4v4(false);
        const reservation = await this.requestServerAck<any>('p2p_request_join', { code }, 5000);
        if (!reservation?.ok) {
            throw new Error('Failed to join 4v4 host room.');
        }
        const targetPeerId = typeof reservation.peerId === 'string' ? reservation.peerId : '';
        if (!targetPeerId) throw new Error('4v4 host peer is unavailable.');
        const transport = new PeerMeshClientTransport(
            code, targetPeerId, P2P.MESH_CONNECT_TIMEOUT_MS,
            P2P.MESH_CLIENT_MAX_RETRIES, P2P.MESH_CLIENT_RETRY_DELAY_MS,
        );
        const localPlayerId = String(this.channel.id ?? '');
        const roster = Array.isArray(matchData?.players) ? matchData.players : [];
        const players = new Map<string, Signal4v4PlayerState>();
        const teamSlots = { 1: 0, 2: 0 };
        roster.forEach((entry: any, index: number) => {
            const teamId = Number(entry?.teamId ?? 1) === 2 ? 2 : 1;
            const slotIndex = teamSlots[teamId as 1 | 2]++;
            players.set(String(entry.playerId), this.buildSignal4v4Player(String(entry.playerId), teamId as 1 | 2, 2001 + index, slotIndex));
        });
        const local = players.get(localPlayerId);
        if (!local) {
            throw new Error('4v4 client player is missing from match roster.');
        }
        local.displayName = this.walletDisplayName ?? localPlayerId;
        local.characterModelId = this.bridge.getState().selectedCharacterModelId;
        local.weaponModelId = this.selectedPrimaryWeaponModelId;
        this.signal4v4 = {
            role: 'client',
            code,
            matchId: String(matchData?.matchId ?? `sig4:${code}`),
            localPlayerId,
            localTeamId: local.teamId,
            hostPlayerId: String(matchData?.hostPlayerId ?? ''),
            expectedPlayers: Number(matchData?.maxPlayers ?? roster.length ?? 8),
            players,
            hostTransport: null,
            clientTransport: transport,
            matchStarted: false,
            hostHeartbeatInterval: null,
            snapshotInterval: null,
            tickInterval: null,
            preRoundTimeout: null,
            peerIdToPlayerId: new Map(),
            connectedPlayerIds: new Set([localPlayerId]),
            signalMode: null,
            hardpointManager: null,
            visualHardpointManager: null,
            visualTickInterval: null,
            lastTickAtMs: performance.now(),
            signalVisualDropId: null,
            selectedLoadoutSlotByPlayerId: {},
            moveSequence: 0,
            shotSequence: 0,
        };
        this.mode = 'signal4v4_client';
        this.setP2PStatus({ phase: 'connecting', role: 'joiner', code });
        this.activeMatchmadeP2PCode = code;
        transport.onOpen(() => {
            this.setP2PStatus({ phase: 'connected', role: 'joiner', code });
            void this.requestServerAck<any>('p2p_mark_connected', { code }, 3000).catch(() => undefined);
            transport.send(wrapP2PClientEvent({
                type: 'sig4_hello',
                playerId: localPlayerId,
                displayName: this.walletDisplayName ?? localPlayerId,
                selectedSlot: this.selectedLoadoutSlotIndex,
                characterModelId: this.bridge.getState().selectedCharacterModelId,
                weaponModelId: this.selectedPrimaryWeaponModelId,
            }));
        });
        transport.onMessage((_peerId, payload) => {
            this.handleSignal4v4ClientPacket(payload);
        });
        transport.onClose(() => {
            const runtime = this.signal4v4;
            if (!runtime || runtime.role !== 'client') return;
            this.bridge.notifyGameMessage('Disconnected from Signal 4v4 host.', 'warning');
            this.teardownSignal4v4(true);
        });
        transport.onError((error) => {
            this.setP2PStatus({
                phase: 'failed',
                role: 'joiner',
                code,
                error: error instanceof Error ? error.message : 'Signal 4v4 client transport failed.',
            });
        });
        transport.connect();
    }

    cancelP2P(): void {
        if (this.publicMatchmaking) {
            this.resetPublicMatchmaking(true);
        }
        this.teardownTdm4v4(false);
        this.teardownSignal4v4(false);
        this.teardownP2P(true);
    }

    startSignalSoloHost(): void {
        this.channel.disconnect();
        this.bridge.resetForLocalMode();
        this.teardownP2P(false);
        this.teardownSignal4v4(false);
        this.teardownTdm4v4(false);
        const transport = PeerTransport.createHost('SOLOSIG', P2P.CONNECT_TIMEOUT_MS);
        const localId = `signal-host-${Math.random().toString(36).slice(2, 7)}`;
        const localName = this.walletDisplayName ?? 'Host';
        const hostSpawn = { x: -8, y: 3, z: -8 };
        const joinSpawn = { x: 8, y: 3, z: 8 };
        this.p2p = {
            role: 'host',
            transport,
            code: 'SOLOSIG',
            connected: true,
            localPlayerId: localId,
            localDisplayName: localName,
            remotePlayerId: 'signal-ghost',
            remoteDisplayName: 'Ghost',
            matchStarted: false,
            lastRemoteInputSeq: -1,
            state: {
                hostId: localId,
                joinerId: 'signal-ghost',
                hostDisplayName: localName,
                joinerDisplayName: 'Ghost',
                host: mkPlayerState(localId, localName, hostSpawn),
                joiner: { ...mkPlayerState('signal-ghost', 'Ghost', joinSpawn), alive: false, health: 0 },
            },
            pingInterval: null,
            fullSyncInterval: null,
            preRoundTimeout: null,
            hostHeartbeatInterval: null,
            lastPongRttMs: 0,
            lastPoseSentAtMs: 0,
            moveSequence: 0,
            shotSequence: 0,
            lastRemoteMoveSequence: -1,
            lastRemoteShotSequence: -1,
            poseHistoryByPlayerId: new Map(),
            lastRemoteMoveRecvAtMs: 0,
            moveJitterMs: 0,
            lastRemoteShotRecvAtMs: 0,
            telemetryInterval: null,
            sentFastPackets: 0,
            recvFastPackets: 0,
            simulatedDropIn: 0,
            simulatedDropOut: 0,
            antiCheatDropCount: 0,
            matchMode: 'signal',
            signal: null,
            signalSoloMode: null,
            signalSoloHardpointManager: null,
            signalSoloLastTickAtMs: performance.now(),
            signalSoloAuthority: null,
            signalSoloVisualDropId: null,
            signalSoloSpawnPoints: { 1: { ...hostSpawn }, 2: { ...joinSpawn } },
            signalP2PVisualHardpointManager: null,
            signalP2PVisualDropId: null,
            isSignalSolo: true,
            serverRoomRegistered: false,
        };
        this.mode = 'p2p_host';
        this.setP2PStatus({ phase: 'connected', role: 'host', code: 'SOLOSIG' });
        this.startP2PMatch(this.p2p);
        this.startP2PIntervals(this.p2p);
        this.startP2PTelemetry(this.p2p);
    }

    bindSignalHardpointScene(scene: THREE.Scene): void {
        this.signalSceneForSoloHardpoints = scene;
        if (this.p2p?.isSignalSolo && this.p2p.signalSoloHardpointManager) {
            this.p2p.signalSoloHardpointManager.dispose();
            this.p2p.signalSoloHardpointManager = this.createSceneBoundHardpointManager(scene);
            this.p2p.signalSoloHardpointManager.setRotationEnabled(false);
        }
        if (this.p2p?.matchMode === 'signal' && !this.p2p.isSignalSolo) {
            this.recreateP2PSignalVisualHardpointManager(this.p2p);
            this.syncSignalP2PVisualState(this.p2p);
        }
        if (this.signal4v4) {
            this.recreateSignal4v4VisualHardpointManager(this.signal4v4);
        }
    }

    setTeamSpawnPoints(team1Spawn: { x: number; y: number; z: number }, team2Spawn: { x: number; y: number; z: number }): void {
        this.teamSpawnAnchors = {
            1: { ...team1Spawn },
            2: { ...team2Spawn },
        };
    }

    setSignalHardpointPositions(positions: Array<{ id: string; position: { x: number; y: number; z: number }; radius?: number }>): void {
        this.signalHardpointPositions = positions.map((entry) => ({
            id: entry.id,
            position: { ...entry.position },
            ...(typeof entry.radius === 'number' ? { radius: entry.radius } : {}),
        }));
        if (this.p2p?.matchMode === 'signal' && !this.p2p.isSignalSolo) {
            if (this.p2p.role === 'host' && this.p2p.signalSoloHardpointManager) {
                this.p2p.signalSoloHardpointManager.dispose();
                this.p2p.signalSoloHardpointManager = this.createSignalP2PAuthorityHardpointManager();
                this.p2p.signalSoloHardpointManager.setRotationEnabled(false);
                this.p2p.signalSoloHardpointManager.setCaptureEnabled(false);
            }
            this.recreateP2PSignalVisualHardpointManager(this.p2p);
            this.syncSignalP2PVisualState(this.p2p);
        }
        if (this.signal4v4 && this.signalSceneForSoloHardpoints) {
            this.recreateSignal4v4VisualHardpointManager(this.signal4v4);
        }
    }

    private recreateP2PSignalVisualHardpointManager(runtime: P2PRuntime): void {
        runtime.signalP2PVisualHardpointManager?.dispose();
        runtime.signalP2PVisualHardpointManager = null;
        runtime.signalP2PVisualDropId = null;
        if (!this.signalSceneForSoloHardpoints || runtime.matchMode !== 'signal' || runtime.isSignalSolo) return;
        runtime.signalP2PVisualHardpointManager = this.createSceneBoundHardpointManager(this.signalSceneForSoloHardpoints);
        runtime.signalP2PVisualHardpointManager.setRotationEnabled(false);
        runtime.signalP2PVisualHardpointManager.setCaptureEnabled(false);
    }

    private recreateSignal4v4VisualHardpointManager(runtime: Signal4v4Runtime): void {
        if (!this.signalSceneForSoloHardpoints) return;
        runtime.visualHardpointManager?.dispose();
        runtime.visualHardpointManager = this.createSceneBoundHardpointManager(this.signalSceneForSoloHardpoints);
        runtime.visualHardpointManager.setRotationEnabled(false);
        runtime.visualHardpointManager.setCaptureEnabled(false);
        if (runtime.role === 'client' && runtime.visualTickInterval === null) {
            runtime.visualTickInterval = window.setInterval(() => {
                if (!this.signal4v4 || this.signal4v4 !== runtime || !runtime.visualHardpointManager) return;
                runtime.visualHardpointManager.tick(0.05, []);
            }, 50);
        }
    }

    private updateSignalP2PHud(runtime: P2PRuntime, now: number): void {
        const signal = runtime.signal;
        if (!signal) return;
        const ownerLabel = signal.contested
            ? 'CONTESTED'
            : signal.controllingTeam === 1
                ? 'BLUE'
                : signal.controllingTeam === 2
                    ? 'RED'
                    : 'NEUTRAL';
        const rotateRemainingSec = signal.goldenHardpointActive
            ? 0
            : Math.max(0, Math.ceil((SIGNAL.ROTATE_EVERY_MS - (now - signal.lastRotateAtMs)) / 1000));
        const nextDropSec = signal.drop
            ? 0
            : Math.max(0, Math.ceil((signal.nextDropAtMs - now) / 1000));
        this.bridge.updateState({
            teamScores: { 1: Math.round(signal.teamSignal[0]), 2: Math.round(signal.teamSignal[1]) },
            matchTimeRemaining: Math.max(0, Math.floor((SIGNAL.COLLAPSE_TRIGGER_MS - (now - signal.matchStartedAtMs)) / 1000)),
            signalNextDropSec: nextDropSec,
            signalSuddenDeathStatus: signal.collapseActiveAtMs !== null ? 'active' : this.bridge.getState().signalSuddenDeathStatus,
            signalZoneNumber: Math.max(1, signal.activeHardpointIndex + 1),
            signalZoneState: 'ACTIVE',
            signalZoneTimerSec: rotateRemainingSec,
            signalZoneOwnerLabel: ownerLabel,
        } as any);
    }

    private syncSignalP2PVisualState(runtime: P2PRuntime): void {
        const manager = runtime.signalP2PVisualHardpointManager;
        const signal = runtime.signal;
        if (!manager || !signal) return;
        const vfx = manager.getVFXManager();
        const activeHardpoint = signal.hardpoints[signal.activeHardpointIndex] ?? signal.hardpoints[0] ?? null;
        const activeId = activeHardpoint?.id ?? null;
        const ownerTeam: Team | null = signal.controllingTeam === 1 ? 'blue' : signal.controllingTeam === 2 ? 'red' : null;
        for (const hardpoint of manager.getHardpoints()) {
            hardpoint.isActive = hardpoint.id === activeId;
            hardpoint.owner = hardpoint.isActive ? ownerTeam : null;
            hardpoint.isContested = hardpoint.isActive ? signal.contested : false;
            hardpoint.captureProgress = 0;
        }
        if (signal.drop) {
            if (runtime.signalP2PVisualDropId !== signal.drop.id) {
                manager.createDropMarker(signal.drop.position, Boolean(signal.drop.golden));
                vfx?.createDropVFX(signal.drop.position, Boolean(signal.drop.golden));
                runtime.signalP2PVisualDropId = signal.drop.id;
            }
        } else if (runtime.signalP2PVisualDropId !== null) {
            manager.removeDropMarker();
            vfx?.removeDropVFX();
            runtime.signalP2PVisualDropId = null;
        }
        manager.tick(0, []);
    }

    private syncSignal4v4VisualState(runtime: Signal4v4Runtime, hud: any, dropVisual: any): void {
        const manager = runtime.visualHardpointManager;
        if (!manager) return;
        const zoneNumber = Math.max(1, Math.min(3, Math.floor(Number(hud?.signalZoneNumber ?? 1))));
        const zoneId = `hardpoint${zoneNumber}`;
        const zoneState = String(hud?.signalZoneState ?? 'COUNTDOWN');
        const ownerLabel = String(hud?.signalZoneOwnerLabel ?? 'NEUTRAL').toUpperCase();
        const isContested = ownerLabel === 'CONTESTED';
        const ownerTeam: Team | null = ownerLabel === 'BLUE' ? 'blue' : ownerLabel === 'RED' ? 'red' : null;
        for (const hardpoint of manager.getHardpoints()) {
            hardpoint.isActive = hardpoint.id === zoneId && zoneState !== 'POSTMATCH';
            hardpoint.owner = hardpoint.isActive ? ownerTeam : null;
            hardpoint.isContested = hardpoint.isActive ? isContested : false;
            hardpoint.captureProgress = 0;
        }
        if (dropVisual?.id && dropVisual?.position) {
            if (runtime.signalVisualDropId !== String(dropVisual.id)) {
                manager.createDropMarker(dropVisual.position, Boolean(dropVisual.isGolden));
                runtime.signalVisualDropId = String(dropVisual.id);
            }
        } else if (runtime.signalVisualDropId !== null) {
            manager.removeDropMarker();
            runtime.signalVisualDropId = null;
        }
        manager.tick(0, []);
    }

    private teardownSignal4v4(resetStatus: boolean): void {
        if (this.signal4v4) {
            if (this.signal4v4.role === 'host') {
                this.channel.emit('p2p_release_room', { code: this.signal4v4.code });
            }
            if (this.signal4v4.hostHeartbeatInterval !== null) window.clearInterval(this.signal4v4.hostHeartbeatInterval);
            if (this.signal4v4.snapshotInterval !== null) window.clearInterval(this.signal4v4.snapshotInterval);
            if (this.signal4v4.tickInterval !== null) window.clearInterval(this.signal4v4.tickInterval);
            if (this.signal4v4.visualTickInterval !== null) window.clearInterval(this.signal4v4.visualTickInterval);
            if (this.signal4v4.preRoundTimeout !== null) window.clearTimeout(this.signal4v4.preRoundTimeout);
            this.signal4v4.visualHardpointManager?.dispose();
            this.signal4v4.hostTransport?.disconnect();
            this.signal4v4.clientTransport?.disconnect();
            this.signal4v4 = null;
        }
        if (this.mode === 'signal4v4_host' || this.mode === 'signal4v4_client') {
            this.mode = 'socket';
        }
        if (resetStatus) this.setP2PStatus({ phase: 'idle' });
    }

    private handleSignal4v4HostPacket(peerId: string, payload: ArrayBuffer): void {
        const runtime = this.signal4v4;
        if (!runtime || runtime.role !== 'host') return;
        const packet = readP2PPacket(payload);
        if (packet.kind === 'client_event') {
            const event = packet.event;
            if (event?.type === 'sig4_hello') {
                const playerId = String(event.playerId ?? '');
                const player = runtime.players.get(playerId);
                if (!player) return;
                player.peerId = peerId;
                player.displayName = typeof event.displayName === 'string' ? event.displayName : player.displayName;
                player.characterModelId = typeof event.characterModelId === 'string' ? event.characterModelId : player.characterModelId;
                player.weaponModelId = typeof event.weaponModelId === 'string' ? event.weaponModelId : player.weaponModelId;
                runtime.selectedLoadoutSlotByPlayerId[playerId] = Math.max(0, Math.floor(Number(event.selectedSlot ?? 0)));
                runtime.peerIdToPlayerId.set(peerId, playerId);
                runtime.connectedPlayerIds.add(playerId);
                this.broadcastSignal4v4Lobby(runtime);
                this.maybeStartSignal4v4Match(runtime);
                return;
            }
            const playerId = runtime.peerIdToPlayerId.get(peerId);
            if (!playerId) return;
            const player = runtime.players.get(playerId);
            if (!player) return;
            if (event?.type === 'sig4_interact') {
                player.wantsExtract = Boolean(event.interacting);
                runtime.signalMode?.setPlayerInteractIntent(playerId, player.wantsExtract);
                return;
            }
            if (event?.type === 'sig4_select_character') {
                player.characterModelId = typeof event.characterModelId === 'string' ? event.characterModelId : player.characterModelId;
                player.weaponModelId = typeof event.weaponModelId === 'string' ? event.weaponModelId : player.weaponModelId;
                runtime.selectedLoadoutSlotByPlayerId[playerId] = Math.max(0, Math.floor(Number(event.slotIndex ?? 0)));
                this.broadcastSignal4v4Lobby(runtime);
            }
            return;
        }

        const playerId = runtime.peerIdToPlayerId.get(peerId);
        if (!playerId) return;
        const player = runtime.players.get(playerId);
        if (!player) return;
        if (packet.kind === 'move') {
            this.applySignal4v4MovePacket(runtime, player, packet.move);
            return;
        }
        if (packet.kind === 'shoot' && runtime.matchStarted) {
            const weaponModelId = P2P_WEAPON_MODEL_ID_BY_KIND[packet.shoot.weaponKind] ?? player.weaponModelId;
            this.processSignal4v4Shot(runtime, playerId, {
                origin: packet.shoot.origin,
                dir: packet.shoot.direction,
                time: packet.shoot.sentAt,
                weaponModelId,
            });
        }
    }

    private applySignal4v4MovePacket(runtime: Signal4v4Runtime, player: Signal4v4PlayerState, move: any): void {
        const dx = Number(move?.dx ?? 0);
        const dy = Number(move?.dy ?? 0);
        const dz = Number(move?.dz ?? 0);
        const vx = Number(move?.vx ?? 0);
        const vy = Number(move?.vy ?? 0);
        const vz = Number(move?.vz ?? 0);
        const speed = Math.sqrt((vx * vx) + (vy * vy) + (vz * vz));
        if (
            !Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)
            || !Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)
            || Math.abs(dx) > P2P_MAX_MOVE_STEP
            || Math.abs(dy) > P2P_MAX_MOVE_STEP
            || Math.abs(dz) > P2P_MAX_MOVE_STEP
            || speed > P2P_MAX_MOVE_SPEED
        ) {
            return;
        }

        player.position = {
            x: player.position.x + dx,
            y: player.position.y + dy,
            z: player.position.z + dz,
        };
        player.rotation = {
            x: Number(move?.qx ?? player.rotation.x),
            y: Number(move?.qy ?? player.rotation.y),
            z: Number(move?.qz ?? player.rotation.z),
            w: Number(move?.qw ?? player.rotation.w),
        };
        player.velocity = { x: vx, y: vy, z: vz };
        player.lastPoseAtMs = performance.now();
        runtime.connectedPlayerIds.add(player.playerId);

        this.bridge.processNetPose({
            type: 'net_pose',
            playerId: player.playerId as any,
            position: player.position as any,
            rotation: player.rotation as any,
            velocity: player.velocity as any,
            tick: tick(msToTicks(player.lastPoseAtMs) as any),
        } as any);
        this.broadcastSignal4v4Pose(runtime, player, player.peerId ?? undefined);
    }

    private broadcastSignal4v4Pose(runtime: Signal4v4Runtime, player: Signal4v4PlayerState, exceptPeerId?: string): void {
        if (runtime.role !== 'host' || !runtime.hostTransport) return;
        const now = performance.now();
        runtime.hostTransport.broadcast(wrapP2PServerEvent({
            type: 'event',
            event: {
                type: 'net_pose',
                playerId: player.playerId,
                position: { ...player.position },
                rotation: { ...player.rotation },
                velocity: { ...player.velocity },
                tick: tick(msToTicks(now) as any),
            },
            tick: tick(msToTicks(now) as any),
        } as any), exceptPeerId);
    }

    private handleSignal4v4ClientPacket(payload: ArrayBuffer): void {
        const runtime = this.signal4v4;
        if (!runtime || runtime.role !== 'client') return;
        const packet = readP2PPacket(payload);
        if (packet.kind !== 'server_event') return;
        const message = packet.event as any;
        const event = message?.event;
        if (event?.type === 'sig4_lobby') {
            const connected = Number(event.connectedPlayers ?? runtime.connectedPlayerIds.size);
            this.bridge.notifyGameMessage(`Lobby ${connected}/${runtime.expectedPlayers} connected`, 'info');
            return;
        }
        if (event?.type === 'sig4_preround_start') {
            this.bridge.notifyPreRoundStart({
                durationSec: Number(event.durationSec ?? 10),
                availableCharacterModelIds: ['assasin', 'grizzly', 'kodiak', 'panda'],
            });
            return;
        }
        if (event?.type === 'sig4_preround_end') {
            this.bridge.notifyPreRoundEnd();
            return;
        }
        if (event?.type === 'sig4_snapshot') {
            this.applySignal4v4Snapshot(runtime, event.snapshot);
            return;
        }
        if (event?.type === 'sig4_match_start') {
            this.applySignal4v4MatchStart(runtime, event);
            return;
        }
        if (event?.type === 'sig4_character_selected') {
            this.bridge.notifyCharacterSelected(event.playerId as any, String(event.characterModelId ?? 'assasin'));
            return;
        }
        this.handleServerMessage(message as any);
    }

    private broadcastSignal4v4Lobby(runtime: Signal4v4Runtime): void {
        if (runtime.role !== 'host' || !runtime.hostTransport) return;
        const payload = wrapP2PServerEvent({
            type: 'event',
            event: {
                type: 'sig4_lobby',
                connectedPlayers: runtime.connectedPlayerIds.size,
                maxPlayers: runtime.expectedPlayers,
                players: Array.from(runtime.players.values()).map((player) => ({
                    playerId: player.playerId,
                    displayName: player.displayName,
                    teamId: player.teamId,
                    connected: runtime.connectedPlayerIds.has(player.playerId),
                })),
            },
            tick: tick(0 as any) as any,
        } as any);
        runtime.hostTransport.broadcast(payload);
    }

    private maybeStartSignal4v4Match(runtime: Signal4v4Runtime): void {
        if (runtime.matchStarted) return;
        if (runtime.connectedPlayerIds.size < runtime.expectedPlayers) return;
        this.startSignal4v4Match(runtime);
    }

    private applySignal4v4MatchStart(runtime: Signal4v4Runtime, _event: any): void {
        const local = runtime.players.get(runtime.localPlayerId);
        if (!local) return;
        runtime.matchStarted = true;
        this.bridge.setLocalPlayerId(runtime.localPlayerId as any);
        this.bridge.notifyMatchStart({
            mode: 'signal_4v4',
            teamId: local.teamId as any,
            spawnPosition: { ...local.position },
            opponent: null as any,
            opponentSpawnPosition: null,
            allPlayers: Array.from(runtime.players.values()).map((player) => ({
                playerId: player.playerId,
                teamId: player.teamId as any,
                spawnPosition: { ...player.position },
            })),
        });
        for (const player of runtime.players.values()) {
            this.bridge.registerPlayerEntity(
                player.playerId as any,
                player.entityId as any,
                player.characterModelId,
                player.weaponModelId,
                player.teamId as any,
            );
            this.bridge.setEntityTeamId(player.entityId as any, player.teamId as any);
        }
        this.bridge.updateState({
            localPlayerEntityId: local.entityId as any,
            localTeamId: local.teamId as any,
            health: local.health,
            maxHealth: P2P.PLAYER_MAX_HEALTH,
            teamScores: { 1: 0, 2: 0 },
            isDead: false,
            isGameOver: false,
            matchTimeRemaining: 7 * 60,
            signalZoneState: 'PREMATCH_LOADOUT',
            preRoundActive: true,
        } as any);
        this.bridge.notifyConnected();
    }

    private startSignal4v4Match(runtime: Signal4v4Runtime): void {
        const layout = this.getSignal4v4HardpointLayout();
        runtime.hardpointManager = HardpointManager.fromPositions(layout);
        runtime.hardpointManager.setRotationEnabled(false);
        this.recreateSignal4v4VisualHardpointManager(runtime);
        runtime.signalMode = new SignalProtocolMode(performance.now(), {
            targetSignal: 500,
            onEvent: (event) => this.onSignal4v4ModeEvent(runtime, event),
            onAnnounce: (message, severity) => this.bridge.notifyGameMessage(message, severity ?? 'info'),
            onApplyBoundaryDamage: (playerId, damage) => this.applySignal4v4Damage(runtime, 'boundary', playerId, damage),
            onApplyToxinDamage: (playerId, damage) => this.applySignal4v4Damage(runtime, 'toxin', playerId, damage),
            onApplyStampedeKnockback: (_attackerId, victimId, impulse) => {
                const victim = runtime.players.get(victimId);
                if (!victim || !victim.alive) return;
                victim.position = {
                    x: victim.position.x + impulse.x,
                    y: victim.position.y + impulse.y,
                    z: victim.position.z + impulse.z,
                };
                if (victimId === runtime.localPlayerId) {
                    this.bridge.applyServerCorrection(victim.position as any);
                }
            },
            onInstantRespawn: (playerId) => this.respawnSignal4v4Player(runtime, playerId, true),
            onSetUltimateCharge: (playerId, charge) => {
                if (playerId === runtime.localPlayerId) {
                    this.bridge.updateState({ ultimateCharge: charge, ultimateReady: charge >= 100 } as any);
                }
            },
            onAuthorityAction: (action) => this.mirrorSignalAuthorityAction(action as any),
            hardAuthority: this.hardSignalAuthority,
            authorityAdapter: new LocalSignalEventAdapter<SignalModeEvent>(),
        });
        this.ensureSignalAuthoritySnapClient(runtime.matchId);
        this.bindSignalAuthoritySubscription(runtime.signalMode);
        this.applySignal4v4MatchStart(runtime, { type: 'sig4_match_start' });
        runtime.hostTransport?.broadcast(wrapP2PServerEvent({
            type: 'event',
            event: { type: 'sig4_match_start' },
            tick: tick(0 as any) as any,
        } as any));
        this.broadcastSignal4v4Lobby(runtime);
        this.bridge.notifyPreRoundStart({
            durationSec: 10,
            availableCharacterModelIds: ['assasin', 'grizzly', 'kodiak', 'panda'],
        });
        runtime.hostTransport?.broadcast(wrapP2PServerEvent({
            type: 'event',
            event: { type: 'sig4_preround_start', durationSec: 10 },
            tick: tick(0 as any) as any,
        } as any));
        runtime.preRoundTimeout = window.setTimeout(() => {
            if (!this.signal4v4 || this.signal4v4 !== runtime || !runtime.signalMode || !runtime.hardpointManager) return;
            this.bridge.notifyPreRoundEnd();
            runtime.hostTransport?.broadcast(wrapP2PServerEvent({
                type: 'event',
                event: { type: 'sig4_preround_end' },
                tick: tick(0 as any),
            } as any));
            runtime.signalMode.startLiveMatch(runtime.hardpointManager, this.selectedLoadoutSlotIndex, performance.now() / 1000);
            runtime.matchStarted = true;
        }, 10_000);
        runtime.lastTickAtMs = performance.now();
        runtime.tickInterval = window.setInterval(() => this.tickSignal4v4Host(runtime), 50);
        runtime.snapshotInterval = window.setInterval(() => this.broadcastSignal4v4Snapshot(runtime), SIGNAL4V4_SNAPSHOT_INTERVAL_MS);
        this.setP2PStatus({ phase: 'connected', role: 'host', code: runtime.code });
    }

    private tickSignal4v4Host(runtime: Signal4v4Runtime): void {
        if (!this.signal4v4 || this.signal4v4 !== runtime || runtime.role !== 'host' || !runtime.signalMode || !runtime.hardpointManager) return;
        const now = performance.now();
        const dt = Math.max(0.001, Math.min(0.1, (now - runtime.lastTickAtMs) / 1000));
        runtime.lastTickAtMs = now;
        const localRenderPos = this.bridge.getLocalRenderPos();
        const local = runtime.players.get(runtime.localPlayerId);
        if (local && localRenderPos) {
            const prev = { ...local.position };
            local.position = { x: localRenderPos.x, y: localRenderPos.y, z: localRenderPos.z };
            local.velocity = {
                x: (local.position.x - prev.x) / Math.max(dt, 0.001),
                y: (local.position.y - prev.y) / Math.max(dt, 0.001),
                z: (local.position.z - prev.z) / Math.max(dt, 0.001),
            };
            if ((now - local.lastPoseAtMs) >= SIGNAL4V4_POSE_SEND_MS) {
                local.lastPoseAtMs = now;
                this.broadcastSignal4v4Pose(runtime, local);
            }
        }
        const players = Array.from(runtime.players.values()).map((player) => ({
            id: player.playerId,
            team: player.teamId === 1 ? 'blue' : 'red',
            position: { ...player.position },
            isAlive: player.alive,
            ultimateCharge: player.playerId === runtime.localPlayerId ? this.bridge.getState().ultimateCharge : 0,
        }));
        runtime.signalMode.updateZones(dt, runtime.hardpointManager, now / 1000);
        runtime.hardpointManager.tick(dt, players as any);
        runtime.signalMode.tick(dt, runtime.hardpointManager, players as any, now);
        const localState = this.bridge.getState();
        if (localState.tacticalCooldown > 0) {
            const regenMul = runtime.signalMode.getCooldownRegenMultiplier(runtime.localPlayerId);
            const nextCd = Math.max(0, localState.tacticalCooldown - (dt * regenMul));
            this.bridge.updateState({ tacticalCooldown: nextCd } as any);
        }
        this.scheduleSignalAuthorityCheckpoint();
        this.updateSignal4v4HudFromMode(runtime, now);
        this.syncSignal4v4VisualState(runtime, this.bridge.getState(), runtime.signalMode.getCurrentDropVisual());
        runtime.visualHardpointManager?.tick(dt, []);
    }

    private formatSignalDropBuffName(buffKey: string | null | undefined): string | null {
        switch (String(buffKey ?? '').trim().toUpperCase()) {
            case 'FORGE_LINK':
                return 'Forge-Link';
            case 'SKY_EYE_RECON':
                return 'Sky-Eye Recon';
            case 'NEURO_TOXIN_CLOUD':
                return 'Neuro-Toxin Cloud';
            case 'STAMPEDE_OVERDRIVE':
                return 'Stampede Overdrive';
            case 'SCRAP_MAGNET':
                return 'Scrap-Magnet';
            default:
                return null;
        }
    }

    private getSignal4v4TeamBuffSnapshot(signalMode: SignalProtocolMode | null, now: number): Record<number, { name: string | null; remainingSec: number }> {
        const blue = signalMode?.getActiveDropBuff('blue') ?? null;
        const red = signalMode?.getActiveDropBuff('red') ?? null;
        return {
            1: {
                name: this.formatSignalDropBuffName(blue?.type ? String(blue.type) : null),
                remainingSec: blue?.expiresAt ? Math.max(0, (blue.expiresAt - now) / 1000) : 0,
            },
            2: {
                name: this.formatSignalDropBuffName(red?.type ? String(red.type) : null),
                remainingSec: red?.expiresAt ? Math.max(0, (red.expiresAt - now) / 1000) : 0,
            },
        };
    }

    private updateSignal4v4HudFromMode(runtime: Signal4v4Runtime, now: number): void {
        if (!runtime.signalMode) return;
        const signal = runtime.signalMode.getSignal();
        const snapDebug = runtime.signalMode.getSnapDebugInfo();
        const extraction = runtime.signalMode.getExtractionProgress();
        const nextDrop = runtime.signalMode.getNextDropTimer();
        const zone = runtime.signalMode.getCurrentZone();
        const localTeam: Team = runtime.localTeamId === 1 ? 'blue' : 'red';
        const teamBuffs = this.getSignal4v4TeamBuffSnapshot(runtime.signalMode, now);
        const localBuffState = teamBuffs[runtime.localTeamId] ?? { name: null, remainingSec: 0 };
        const buffs = localBuffState.name ? [localBuffState.name] : [];
        const activeDropBuff = runtime.signalMode.getActiveDropBuff(localTeam);
        const activeDropBuffName = this.formatSignalDropBuffName(activeDropBuff ? String(activeDropBuff.type) : null);
        const currentSuddenDeathStatus = this.bridge.getState().signalSuddenDeathStatus;
        const suddenDeathStatus = runtime.signalMode.isSuddenDeathActive() ? 'active' : currentSuddenDeathStatus === 'warning' ? 'warning' : 'idle';
        const ownerLabel = zone.state === 'COUNTDOWN'
            ? 'NEUTRAL'
            : zone.contested
                ? 'CONTESTED'
                : zone.ownerTeamId ? zone.ownerTeamId.toUpperCase() : 'NEUTRAL';
        this.bridge.updateState({
            teamScores: { 1: Math.floor(signal.blue), 2: Math.floor(signal.red) },
            signalNextDropSec: Math.ceil(nextDrop),
            signalExtractionPct: extraction,
            signalActiveBuffs: buffs,
            signalActiveDropBuffName: activeDropBuffName,
            signalActiveDropBuffRemainingSec: localBuffState.remainingSec,
            signalSuddenDeathStatus: suddenDeathStatus,
            signalZoneNumber: zone.activeZoneIndex + 1,
            signalZoneState: zone.state as any,
            signalZoneTimerSec: Math.max(0, Math.ceil(zone.state === 'COUNTDOWN' ? zone.countdownRemainingSec : zone.activeRemainingSec)),
            signalZoneOwnerLabel: ownerLabel,
            signalSnapBackend: snapDebug.backend,
            signalSnapSeq: snapDebug.seq,
            signalSnapStateHash: snapDebug.stateHash,
            signalSnapSignalBlue: snapDebug.signalBlue,
            signalSnapSignalRed: snapDebug.signalRed,
            signalSnapActiveZone: snapDebug.activeZoneIndex + 1,
            signalSnapZonePhase: snapDebug.zonePhase,
            signalSnapZoneRemainingSec: Math.max(0, Math.ceil(snapDebug.zoneRemainingSec)),
            signalSnapActiveDropModifierId: snapDebug.activeDropModifierId,
        } as any);
    }

    private broadcastSignal4v4Snapshot(runtime: Signal4v4Runtime): void {
        if (runtime.role !== 'host' || !runtime.hostTransport) return;
        const teamBuffs = this.getSignal4v4TeamBuffSnapshot(runtime.signalMode, performance.now());
        const snapshot = {
            players: Array.from(runtime.players.values()).map((player) => ({
                playerId: player.playerId,
                entityId: player.entityId,
                teamId: player.teamId,
                position: { ...player.position },
                rotation: { ...player.rotation },
                velocity: { ...player.velocity },
                health: player.health,
                alive: player.alive,
                kills: player.kills,
                deaths: player.deaths,
                characterModelId: player.characterModelId,
                weaponModelId: player.weaponModelId,
            })),
            hud: { ...this.bridge.getState() },
            teamBuffs,
            dropVisual: runtime.signalMode?.getCurrentDropVisual() ?? null,
        };
        const payload = wrapP2PServerEvent({
            type: 'event',
            event: { type: 'sig4_snapshot', snapshot },
            tick: tick(msToTicks(performance.now()) as any),
        } as any);
        runtime.hostTransport.broadcast(payload);
        this.applySignal4v4Snapshot(runtime, snapshot);
    }

    private applySignal4v4Snapshot(runtime: Signal4v4Runtime, snapshot: any): void {
        if (!snapshot) return;
        const previousLocalPosition = runtime.players.get(runtime.localPlayerId)
            ? { ...runtime.players.get(runtime.localPlayerId)!.position }
            : null;
        for (const playerSnapshot of Array.isArray(snapshot.players) ? snapshot.players : []) {
            const playerId = String(playerSnapshot.playerId ?? '');
            const player = runtime.players.get(playerId);
            if (!player) continue;
            player.position = { ...playerSnapshot.position };
            player.rotation = { ...playerSnapshot.rotation };
            player.velocity = { ...(playerSnapshot.velocity ?? { x: 0, y: 0, z: 0 }) };
            player.health = Number(playerSnapshot.health ?? player.health);
            player.alive = Boolean(playerSnapshot.alive);
            player.kills = Number(playerSnapshot.kills ?? player.kills);
            player.deaths = Number(playerSnapshot.deaths ?? player.deaths);
            player.characterModelId = typeof playerSnapshot.characterModelId === 'string' ? playerSnapshot.characterModelId : player.characterModelId;
            player.weaponModelId = typeof playerSnapshot.weaponModelId === 'string' ? playerSnapshot.weaponModelId : player.weaponModelId;
            player.lastSentPosition = { ...player.position };
            this.bridge.registerPlayerEntity(playerId as any, player.entityId as any, player.characterModelId, player.weaponModelId, player.teamId as any);
            this.bridge.setEntityTeamId(player.entityId as any, player.teamId as any);
            if (playerId !== runtime.localPlayerId) {
                this.bridge.processNetPose({
                    type: 'net_pose',
                    playerId: playerId as any,
                    position: player.position as any,
                    rotation: player.rotation as any,
                    velocity: player.velocity as any,
                    tick: tick(msToTicks(performance.now()) as any),
                } as any);
            }
        }
        const local = runtime.players.get(runtime.localPlayerId);
        if (local) {
            if (runtime.role === 'client' && previousLocalPosition) {
                const dx = local.position.x - previousLocalPosition.x;
                const dy = local.position.y - previousLocalPosition.y;
                const dz = local.position.z - previousLocalPosition.z;
                if ((dx * dx) + (dy * dy) + (dz * dz) > 1.0) {
                    this.bridge.applyServerCorrection(local.position as any);
                }
            }
            this.bridge.updateState({
                localPlayerEntityId: local.entityId as any,
                localTeamId: local.teamId as any,
                health: local.health,
                isDead: !local.alive,
                kills: local.kills,
                deaths: local.deaths,
            } as any);
        }
        if (snapshot.hud) {
            const localTeamId = local?.teamId ?? runtime.localTeamId;
            const localTeamBuff = snapshot.teamBuffs?.[localTeamId] ?? snapshot.teamBuffs?.[String(localTeamId)] ?? null;
            const localBuffName = typeof localTeamBuff?.name === 'string' ? localTeamBuff.name : snapshot.hud.signalActiveDropBuffName;
            const localBuffRemainingSec = Number.isFinite(localTeamBuff?.remainingSec)
                ? Number(localTeamBuff.remainingSec)
                : Number(snapshot.hud.signalActiveDropBuffRemainingSec ?? 0);
            this.bridge.updateState({
                teamScores: snapshot.hud.teamScores,
                signalNextDropSec: snapshot.hud.signalNextDropSec,
                signalExtractionPct: snapshot.hud.signalExtractionPct,
                signalExtractionStalled: snapshot.hud.signalExtractionStalled,
                signalActiveBuffs: localBuffName ? [localBuffName] : [],
                signalActiveDropBuffName: localBuffName,
                signalActiveDropBuffRemainingSec: localBuffRemainingSec,
                signalSuddenDeathStatus: snapshot.hud.signalSuddenDeathStatus,
                signalZoneNumber: snapshot.hud.signalZoneNumber,
                signalZoneState: snapshot.hud.signalZoneState,
                signalZoneTimerSec: snapshot.hud.signalZoneTimerSec,
                signalZoneOwnerLabel: snapshot.hud.signalZoneOwnerLabel,
                signalSnapBackend: snapshot.hud.signalSnapBackend,
                signalSnapSeq: snapshot.hud.signalSnapSeq,
                signalSnapStateHash: snapshot.hud.signalSnapStateHash,
                signalSnapSignalBlue: snapshot.hud.signalSnapSignalBlue,
                signalSnapSignalRed: snapshot.hud.signalSnapSignalRed,
                signalSnapActiveZone: snapshot.hud.signalSnapActiveZone,
                signalSnapZonePhase: snapshot.hud.signalSnapZonePhase,
                signalSnapZoneRemainingSec: snapshot.hud.signalSnapZoneRemainingSec,
                signalSnapActiveDropModifierId: snapshot.hud.signalSnapActiveDropModifierId,
                signalAuthoritySource: snapshot.hud.signalAuthoritySource,
                signalAuthorityLatestCommitSeq: snapshot.hud.signalAuthorityLatestCommitSeq,
                signalAuthorityLastCommitSignature: snapshot.hud.signalAuthorityLastCommitSignature,
                signalAuthorityMatchId: snapshot.hud.signalAuthorityMatchId,
                signalAuthorityDelegated: snapshot.hud.signalAuthorityDelegated,
            } as any);
        }
        this.syncSignal4v4VisualState(runtime, snapshot.hud, snapshot.dropVisual ?? null);
    }

    private onSignal4v4ModeEvent(runtime: Signal4v4Runtime, event: SignalModeEvent): void {
        const data = event.data as any;
        if (event.type === 'MATCH_WON') {
            this.scheduleSignalAuthorityFinalize(data.winner, Number(data.finalScore?.blue ?? 0), Number(data.finalScore?.red ?? 0));
            const winnerId = data.winner === 'red' ? 'team_2' : 'team_1';
            this.handleServerMessage({ type: 'match_ended', winnerId, scores: { team_1: Math.floor(data.finalScore?.blue ?? 0), team_2: Math.floor(data.finalScore?.red ?? 0) }, targetScore: 500 } as any);
        }
        if (event.type === 'SUDDEN_DEATH_WARNING') {
            this.bridge.updateState({ signalSuddenDeathStatus: 'warning' } as any);
        }
        if (event.type === 'SUDDEN_DEATH_ACTIVATED') {
            this.bridge.updateState({ signalSuddenDeathStatus: 'active' } as any);
        }
        if (event.type === 'EXTRACTION_STALLED' && data.playerId === runtime.localPlayerId) {
            this.bridge.updateState({ signalExtractionStalled: true } as any);
        }
        if (event.type === 'EXTRACTION_PROGRESS' && data.playerId === runtime.localPlayerId) {
            this.bridge.updateState({ signalExtractionPct: data.progress, signalExtractionStalled: false } as any);
        }
        if (event.type === 'DROP_BUFF_START') {
            this.bridge.notifyGameMessage(`Drop Buff Active: ${this.formatSignalDropBuffName(String(data.key)) ?? data.key}`, 'success');
        }
        if (event.type === 'DROP_BUFF_END') {
            this.bridge.notifyGameMessage(`Drop Buff Ended: ${this.formatSignalDropBuffName(String(data.key)) ?? data.key} (${data.reason})`, 'warning');
        }
        if (event.type === 'TOXIN_START') {
            this.bridge.notifyGameMessage('Neuro-Toxin Cloud deployed at hardpoint', 'warning');
        }
        if (event.type === 'TOXIN_END') {
            this.bridge.notifyGameMessage(`Neuro-Toxin Cloud ended (${data.reason})`, 'info');
        }
        if (event.type === 'SCRAP_MAGNET_START') {
            this.bridge.notifyGameMessage('Scrap-Magnet active (+100 pending credits)', 'success');
        }
        if (event.type === 'SCRAP_MAGNET_END') {
            this.bridge.notifyGameMessage(`Scrap-Magnet ended (${data.reason})`, 'info');
        }
        this.bridge.emitGameEvent(event as any);
        if (runtime.role === 'host' && runtime.hostTransport) {
            const payload = wrapP2PServerEvent({
                type: 'event',
                event: event as any,
                tick: tick(msToTicks(performance.now()) as any),
            } as any);
            runtime.hostTransport.broadcast(payload);
        }
    }

    private applySignal4v4Damage(runtime: Signal4v4Runtime, attackerId: string, victimId: string, amount: number): void {
        const victim = runtime.players.get(victimId);
        if (!victim || !victim.alive) return;
        const damage = Math.max(0, Number(amount ?? 0));
        const distributions = runtime.signalMode?.resolveIncomingDamage(attackerId, victimId, damage) ?? [{ playerId: victimId, damage }];
        const attacker = runtime.players.get(attackerId);
        for (const split of distributions) {
            const splitVictim = runtime.players.get(split.playerId);
            if (!splitVictim || !splitVictim.alive) continue;
            runtime.signalMode?.onPlayerDamaged(split.playerId, split.damage);
            const remainingDamage = runtime.signalMode?.consumeIncomingDamage(split.playerId, split.damage) ?? split.damage;
            splitVictim.health = Math.max(0, splitVictim.health - remainingDamage);
            this.broadcastSignal4v4ServerMessage(runtime, {
                type: 'damage_applied',
                targetId: split.playerId,
                attackerId,
                amount: remainingDamage,
                healthAfter: splitVictim.health,
            } as any);
            if (splitVictim.health > 0) continue;
            splitVictim.alive = false;
            splitVictim.deaths += 1;
            if (attacker) attacker.kills += 1;
            this.broadcastSignal4v4ServerMessage(runtime, {
                type: 'event',
                event: { type: 'player_died', entityId: splitVictim.entityId, killerId: attacker?.entityId ?? null, weapon: 'smg' },
                tick: tick(0 as any),
            } as any);
            runtime.signalMode?.onPlayerDeath(split.playerId);
            if (!splitVictim.alive) {
                window.setTimeout(() => this.respawnSignal4v4Player(runtime, split.playerId, false), 3000);
            }
        }
    }

    private respawnSignal4v4Player(runtime: Signal4v4Runtime, playerId: string, immediate: boolean): void {
        const player = runtime.players.get(playerId);
        if (!player) return;
        player.alive = true;
        player.health = P2P.PLAYER_MAX_HEALTH;
        const teamSlot = Array.from(runtime.players.values()).filter((entry) => entry.teamId === player.teamId && entry.playerId <= playerId).length - 1;
        player.position = this.getSignal4v4SpawnPosition(player.teamId, Math.max(0, teamSlot));
        player.lastSentPosition = { ...player.position };
        this.broadcastSignal4v4ServerMessage(runtime, {
            type: 'event',
            event: { type: 'player_spawned', entityId: player.entityId, position: player.position },
            tick: tick(0 as any) as any,
        } as any);
        if (immediate && playerId === runtime.localPlayerId) {
            this.bridge.updateState({ isDead: false, respawnTimeRemaining: 0, health: P2P.PLAYER_MAX_HEALTH } as any);
        }
    }

    private processSignal4v4Shot(runtime: Signal4v4Runtime, shooterId: string, shot: any): void {
        const shooter = runtime.players.get(shooterId);
        if (!shooter || !shooter.alive || !shot?.origin || !shot?.dir) return;
        const weaponModelId = typeof shot?.weaponModelId === 'string' && shot.weaponModelId ? shot.weaponModelId : shooter.weaponModelId;
        const normalizedDir = this.normalizeDir(shot.dir);
        if (!normalizedDir) return;
        const shotOrigin = this.resolveP2PShotOrigin(shooter.position, shot.origin, normalizedDir);
        this.broadcastSignal4v4ServerMessage(runtime, {
            type: 'event',
            event: {
                type: 'shot_fired',
                sourceId: shooter.entityId,
                origin: shotOrigin,
                direction: normalizedDir,
                weapon: weaponModelId,
            },
            tick: tick(0 as any),
        } as any);
        let bestTarget: Signal4v4PlayerState | null = null;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const target of runtime.players.values()) {
            if (target.playerId === shooterId || !target.alive || target.teamId === shooter.teamId) continue;
            const distance = this.raySphereIntersection(shotOrigin, normalizedDir, { x: target.position.x, y: target.position.y + 1.2, z: target.position.z }, P2P.PLAYER_RADIUS);
            if (distance === null || distance >= bestDist) continue;
            bestDist = distance;
            bestTarget = target;
        }
        if (!bestTarget) return;
        const weaponDamage = P2P_WEAPON_DAMAGE_BY_MODEL_ID[weaponModelId] ?? P2P.DAMAGE_PER_HIT;
        this.applySignal4v4Damage(runtime, shooterId, bestTarget.playerId, weaponDamage);
    }

    private broadcastSignal4v4ServerMessage(runtime: Signal4v4Runtime, message: any): void {
        this.handleServerMessage(message as any);
        if (runtime.role === 'host' && runtime.hostTransport) {
            runtime.hostTransport.broadcast(wrapP2PServerEvent(message));
        }
    }

    getSignalSoloMatchFlowState(): SignalMatchFlowState | null {
        if (!this.p2p?.isSignalSolo || !this.p2p.signalSoloMode) return null;
        return this.p2p.signalSoloMode.getMatchFlowState();
    }

    setSignalSoloSpawnPoints(team1Spawn: { x: number; y: number; z: number }, team2Spawn: { x: number; y: number; z: number }): void {
        if (!this.p2p || this.p2p.matchMode !== 'signal') return;
        const runtime = this.p2p;
        runtime.signalSoloSpawnPoints = {
            1: { ...team1Spawn },
            2: { ...team2Spawn },
        };
        if (!runtime.isSignalSolo && runtime.matchStarted) return;
        runtime.state.host.position = { ...team1Spawn };
        runtime.state.joiner.position = { ...team2Spawn };
    }

    confirmSignalSoloPrematchLoadout(selection: MatchLoadoutSelection): boolean {
        const runtime = this.p2p;
        if (!runtime?.isSignalSolo || !runtime.signalSoloMode || !runtime.signalSoloHardpointManager) return false;
        if (runtime.signalSoloMode.getMatchFlowState() !== 'PREMATCH_LOADOUT') return false;
        this.selectMatchLoadout(selection);
        runtime.signalSoloMode.startLiveMatch(runtime.signalSoloHardpointManager, selection.slotIndex, performance.now() / 1000);
        this.bridge.updateState({
            preRoundActive: false,
            signalZoneNumber: 1,
            signalZoneState: 'COUNTDOWN',
            signalZoneTimerSec: 30,
            signalZoneOwnerLabel: 'NEUTRAL',
        } as any);
        console.log(`[SignalProtocol] PREMATCH selected slot=${Math.max(1, Math.min(5, Math.floor(selection.slotIndex) + 1))}`);
        return true;
    }

    setSignalSoloTimeScale(multiplier: number): void {
        if (!this.p2p?.isSignalSolo || !this.p2p.signalSoloMode) return;
        this.p2p.signalSoloMode.setTimeScale(multiplier);
    }

    forceSignalSoloDropSpawn(): void {
        if (!this.p2p?.isSignalSolo || !this.p2p.signalSoloMode) return;
        this.p2p.signalSoloMode.forceDropSpawn();
    }

    forceSignalSoloDamageStall(): void {
        if (!this.p2p?.isSignalSolo || !this.p2p.signalSoloMode) return;
        this.p2p.signalSoloMode.onPlayerDamaged(this.p2p.localPlayerId, 10);
    }

    forceSignalSoloDamage(playerId: string, amount: number = 10): void {
        if (!this.p2p?.isSignalSolo || !this.p2p.signalSoloMode) return;
        this.p2p.signalSoloMode.onPlayerDamaged(playerId, amount);
    }

    forceSignalSoloAddSignal(team: Team, amount: number): void {
        if (!this.p2p?.isSignalSolo || !this.p2p.signalSoloMode) return;
        this.p2p.signalSoloMode.debugAddSignal(team, amount);
    }

    forceSignalSoloHardpointOwner(hardpointId: string, team: Team): void {
        if (!this.p2p?.isSignalSolo || !this.p2p.signalSoloHardpointManager) return;
        this.p2p.signalSoloHardpointManager.forceSetOwner(hardpointId, team);
    }

    forceSignalSoloRotateHardpoint(): void {
        if (!this.p2p?.isSignalSolo || !this.p2p.signalSoloHardpointManager || !this.p2p.signalSoloMode) return;
        this.p2p.signalSoloMode.forceRotateToNextZone(this.p2p.signalSoloHardpointManager);
    }

    forceSignalSoloSkipCountdown(): void {
        if (!this.p2p?.isSignalSolo || !this.p2p.signalSoloHardpointManager || !this.p2p.signalSoloMode) return;
        this.p2p.signalSoloMode.forceSkipCountdown(this.p2p.signalSoloHardpointManager);
    }

    toggleSignalSoloContested(): boolean {
        if (!this.p2p?.isSignalSolo || !this.p2p.signalSoloHardpointManager) return false;
        return this.p2p.signalSoloHardpointManager.toggleForcedContested();
    }

    dumpSignalSoloHardpoints(): Array<{
        id: string;
        owner: Team | null;
        isActive: boolean;
        isContested: boolean;
        captureProgress: number;
        position: { x: number; y: number; z: number };
    }> {
        if (!this.p2p?.isSignalSolo || !this.p2p.signalSoloHardpointManager) return [];
        return this.p2p.signalSoloHardpointManager.getSnapshots().map((hp) => ({
            id: hp.id,
            owner: hp.owner,
            isActive: hp.isActive,
            isContested: hp.isContested,
            captureProgress: hp.captureProgress,
            position: hp.position,
        }));
    }

    forceSignalSoloSuddenDeath(): void {
        if (!this.p2p?.isSignalSolo || !this.p2p.signalSoloMode) return;
        this.p2p.signalSoloMode.forceSuddenDeath();
    }

    burnSignalDropPowerup(buffKey: DropBuffKey): void {
        const runtime = this.p2p;
        if (!runtime?.isSignalSolo || !runtime.signalSoloMode) return;
        const team: Team = runtime.localPlayerId === runtime.state.host.id ? 'blue' : 'red';
        runtime.signalSoloMode.notifyPowerupBurnUse(team, buffKey);
    }

    dumpSignalSoloEvents(): SignalModeEvent[] {
        if (!this.p2p?.isSignalSolo || !this.p2p.signalSoloMode) return [];
        return this.p2p.signalSoloMode.dumpEvents();
    }

    private setP2PStatus(status: P2PStatus): void {
        this.p2pStatus = status;
        for (const listener of this.p2pStatusListeners) {
            listener(status);
        }
    }

    private createDefaultSignalHardpoints(): SignalHardpoint[] {
        if (this.signalHardpointPositions && this.signalHardpointPositions.length >= 3) {
            return this.signalHardpointPositions.map((entry, index) => ({
                id: entry.id as SignalHardpoint['id'],
                position: { ...entry.position },
                radius: Number(entry.radius ?? 8),
                suddenDeath: index === 3,
            }));
        }
        return [
            { id: 'hardpoint1', position: { x: -24, y: 0.1, z: 0 }, radius: 8, suddenDeath: false },
            { id: 'hardpoint2', position: { x: 0, y: 0.1, z: 0 }, radius: 8, suddenDeath: false },
            { id: 'hardpoint3', position: { x: 24, y: 0.1, z: 0 }, radius: 8, suddenDeath: false },
            { id: 'hardpoint4', position: { x: 0, y: 0.1, z: 18 }, radius: 8, suddenDeath: true },
        ];
    }

    private createSignalP2PHardpoints(): SignalHardpoint[] {
        const all = this.createDefaultSignalHardpoints();
        const byId = new Map(all.map((hardpoint) => [hardpoint.id, hardpoint]));
        return SIGNAL_P2P_ACTIVE_HARDPOINT_IDS
            .map((id) => byId.get(id))
            .filter((hardpoint): hardpoint is SignalHardpoint => hardpoint !== undefined)
            .map((hardpoint) => ({
                ...hardpoint,
                position: { ...hardpoint.position },
            }));
    }

    private getSignalP2PSpawnAnchors(): { host: { x: number; y: number; z: number }; joiner: { x: number; y: number; z: number } } {
        return {
            host: { ...this.teamSpawnAnchors[1] },
            joiner: { ...this.teamSpawnAnchors[2] },
        };
    }

    private createSignalP2PAuthorityHardpointManager(): HardpointManager {
        const layout = this.createSignalP2PHardpoints().map((hardpoint) => ({
            id: hardpoint.id,
            position: { ...hardpoint.position },
            radius: hardpoint.radius,
        }));
        return HardpointManager.fromPositions(layout);
    }

    private createSignalProtocolRuntime(runtime: P2PRuntime): SignalProtocolRuntime {
        const now = performance.now();
        return {
            targetSignal: SIGNAL.TARGET,
            signalPerSec: SIGNAL.SIGNAL_PER_SEC,
            activeHardpointIndex: 0,
            hardpoints: this.createSignalP2PHardpoints(),
            lastRotateAtMs: now,
            nextDropAtMs: now + SIGNAL.DROP_EVERY_MS,
            teamSignal: [0, 0],
            controllingTeam: null,
            contested: false,
            scoreboardFrozen: false,
            drop: null,
            players: new Map([
                [runtime.state.host.id, {
                    playerId: runtime.state.host.id,
                    teamId: 1,
                    wantsExtract: false,
                    extractProgressSec: 0,
                    extractStalledUntilMs: 0,
                    overclockUntilMs: 0,
                    overshield: 0,
                    respawnTokenUses: 0,
                }],
                [runtime.state.joiner.id, {
                    playerId: runtime.state.joiner.id,
                    teamId: 2,
                    wantsExtract: false,
                    extractProgressSec: 0,
                    extractStalledUntilMs: 0,
                    overclockUntilMs: 0,
                    overshield: 0,
                    respawnTokenUses: 0,
                }],
            ]),
            teamFragments: { 1: 0, 2: 0 },
            matchStartedAtMs: now,
            collapseWarningAtMs: null,
            collapseActiveAtMs: null,
            collapseRadius: null,
            goldenHardpointActive: false,
            goldenDropSpawnedAtMs: null,
            goldenDropCaptured: false,
            reliableSeqNext: 0,
            reliableExpectedSeq: 1,
            reliableLastAck: 0,
            reliablePending: new Map(),
            reliableBuffer: new Map(),
            eventLog: [],
            receipts: [],
            lastSignalStateBroadcastMs: 0,
            lastExtractBroadcastMs: 0,
            modeTickInterval: null,
            reliableResendInterval: null,
            lastTickAtMs: now,
        };
    }

    private setupBridgeListeners(): void {
        this.bridge.subscribeToUI((event) => {
            switch (event.type) {
                case 'join_queue':
                    {
                        const publicMode = this.getPublicMatchmakingMode(event.mode, event.ruleset);
                        if (publicMode && event.transport !== 'p2p') {
                            void this.startPublicMatchmaking(publicMode).catch((error) => {
                                this.bridge.notifyGameMessage(
                                    error instanceof Error ? error.message : 'Failed to join public matchmaking queue.',
                                    'error',
                                );
                                this.resetPublicMatchmaking(true);
                            });
                            break;
                        }
                        this.channel.emit('join_queue', {
                            mode: event.mode,
                            transport: event.transport,
                            walletKey: this.walletPublicKey,
                            displayName: this.walletDisplayName,
                            ruleset: event.ruleset,
                            wagerAmountSol: event.wagerAmountSol,
                            selectedLoadoutSlot: this.selectedLoadoutSlotIndex,
                        });
                    }
                    break;
                case 'wager_locked':
                    this.channel.emit('wager_locked', { matchId: event.matchId });
                    break;
                case 'leave_queue':
                    if (this.publicMatchmaking) {
                        void this.cancelPublicMatchmaking(true);
                    } else {
                        this.channel.emit('leave_queue', {});
                    }
                    break;
                case 'quit_match':
                    if (this.publicMatchmaking) {
                        this.resetPublicMatchmaking(true);
                    }
                    if (this.mode === 'socket') {
                        this.channel.emit('leave_match', {});
                    }
                    this.teardownTdm4v4(false);
                    this.teardownSignal4v4(false);
                    this.teardownP2P(true);
                    break;
                case 'select_character':
                    this.sendSelectCharacter(event.characterModelId);
                    break;
            }
        });
    }

    /**
     * Connect to the game server.
     */
    async connect(walletPublicKey: string, displayName: string): Promise<void> {
        this.walletPublicKey = walletPublicKey;
        this.walletDisplayName = displayName;

        if (!this.channel.connected) {
            this.channel.connect();
        }

        // If we are already connected, send auth + lobby request immediately.
        const isConnected = this.channel.connected;
        if (isConnected) {
            this.emitAuthAndLobbyRequest();
        }
    }

    /**
     * Disconnect from server.
     */
    disconnect(): void {
        this.channel.disconnect();
        this.resetPublicMatchmaking(false);
        this.teardownTdm4v4(false);
        this.teardownSignal4v4(false);
        this.teardownP2P(false);
    }

    private setupNetworkHandlers(): void {
        this.channel.on('connect', () => {
            console.log('GameClient: Connected to server');
            this.bridge.notifyConnected();
            this.lastAppliedServerTick = null;
            if (this.channel.id) {
                this.bridge.setLocalPlayerId(this.channel.id as any);
            }

            this.emitAuthAndLobbyRequest();
        });

        this.channel.on('connect_error', (error) => {
            console.error('GameClient: Connection error', error);
            console.warn('GameClient: Check VITE_SERVER_URL or ensure backend is reachable.');
            if (this.mode === 'socket') {
                this.bridge.notifyDisconnected();
            }
        });

        this.channel.on('disconnect', (reason) => {
            console.log('GameClient: Disconnected');
            if (reason) {
                console.warn('GameClient: Disconnect reason:', reason);
            }
            if (this.mode === 'socket') {
                this.bridge.notifyDisconnected();
            }
            this.lastAppliedServerTick = null;
            this.resetPublicMatchmaking(false);
        });

        // --- MESSAGE HANDLERS ---
        this.channel.on('lobby_state', (data: any) => {
            console.log('GameClient: Received lobby state', data);
            this.bridge.updateLobbyState(data as LobbyState);
        });
        this.channel.on('social_state', (data: any) => {
            this.bridge.updateSocialState(data);
        });

        this.channel.on('game_message', (data: any) => {
            // data matches format sent by server: { type: 'opponent_left', message: '...' }
            // or generic message object
            if (data.type === 'opponent_left') {
                this.bridge.notifyGameMessage(data.message || 'Opponent disconnected', 'warning');
            } else {
                const severity = data.severity ?? (data.type === 'error' || data.type === 'success' || data.type === 'warning' ? data.type : 'info');
                this.bridge.notifyGameMessage(data.message, severity);
            }
        });

        this.channel.on('match_found', (data: any) => {
            console.log('GameClient: Match found', data);
            if (data?.transport === 'p2p' && data?.mode === 'signal_4v4' && typeof data?.p2pCode === 'string') {
                const code = normalizeCode(data.p2pCode);
                if (!code || this.activeMatchmadeP2PCode === code) {
                    return;
                }
                const localSocketId = String(this.channel.id ?? '');
                const hostPlayerId = String(data.hostPlayerId ?? '');
                const start = localSocketId && hostPlayerId && localSocketId === hostPlayerId
                    ? this.createSignal4v4Room(code, data)
                    : this.joinSignal4v4Room(code, data);
                void start.catch((error) => {
                    this.activeMatchmadeP2PCode = null;
                    this.bridge.notifyGameMessage(
                        error instanceof Error ? error.message : 'Failed to start 4v4 Signal P2P session.',
                        'error',
                    );
                });
                return;
            }
            if (data?.transport === 'p2p' && typeof data?.p2pCode === 'string') {
                const code = normalizeCode(data.p2pCode);
                if (!code || this.activeMatchmadeP2PCode === code) {
                    return;
                }
                const localSocketId = String(this.channel.id ?? '');
                const hostPlayerId = String(data.hostPlayerId ?? '');
                const matchMode: P2PMode = data?.mode === 'signal' ? 'signal' : 'duel';
                const start = localSocketId && hostPlayerId && localSocketId === hostPlayerId
                    ? this.createP2PRoom(code, matchMode)
                    : this.joinP2PRoom(code, matchMode);
                void start.catch((error) => {
                    this.activeMatchmadeP2PCode = null;
                    this.bridge.notifyGameMessage(
                        error instanceof Error ? error.message : 'Failed to start matchmade P2P session.',
                        'error',
                    );
                });
                return;
            }
            if (data?.ruleset === 'wager' && typeof data?.wagerAmountSol === 'number') {
                this.bridge.notifyWagerLock(data.matchId, data.wagerAmountSol, data.opponentWallet, data.lockRole);
            }
            // Trigger game start logic if needed, or rely on lobby state change
        });

        this.channel.on('match_start', (data: any) => {
            console.log('GameClient: Match starting!', data);
            // Notify bridge that game should start with spawn positions
            this.bridge.notifyMatchStart(data);
        });

        this.channel.on('server_correction', (data: any) => {
            if (!data || !data.position) return;
            this.bridge.applyServerCorrection(data.position);
        });

        this.channel.on('preround_start', (data: any) => {
            this.bridge.notifyPreRoundStart({
                durationSec: Number(data?.durationSec ?? 10),
                endTick: Number(data?.endTick ?? 0),
                availableCharacterModelIds: Array.isArray(data?.availableCharacterModelIds) ? data.availableCharacterModelIds : undefined,
            });
        });

        this.channel.on('preround_end', () => {
            this.bridge.notifyPreRoundEnd();
        });

        this.channel.on('character_selected', (data: any) => {
            const playerId = data?.playerId;
            const characterModelId = typeof data?.characterModelId === 'string' ? data.characterModelId : null;
            if (!playerId || !characterModelId) return;
            this.bridge.notifyCharacterSelected(playerId, characterModelId);
        });
    }

    private async setupBinaryHandlers(): Promise<void> {
        // --- BINARY MESSAGE HANDLERS ---
        const { deserializeSnapshot, deserializeDelta, serializeInputAck, deserializeInputAck } = await import('@snapshot/shared/simulation');

        this.channel.on('bin', (data: any) => {
            if (this.mode !== 'socket') return;
            const buffer = normalizeBinaryData(data);
            if (!buffer) return;

            const legacyJsonMessage = new Uint8Array(buffer)[0] === 123;
            if (legacyJsonMessage) {
                try {
                    this.handleServerMessage(deserializeServerMessage(buffer) as ServerMessage);
                } catch (e) {
                    console.error('GameClient: Failed to handle legacy server message', e);
                }
                return;
            }

            let type = 0;
            let payload: ArrayBuffer = buffer;
            try {
                const decoded = unwrapBinaryMessage(buffer);
                type = decoded.type;
                payload = decoded.payload;
            } catch (e) {
                console.error('GameClient: Failed to decode binary message envelope', e);
                return;
            }

            switch (type) {
                case BinaryMessageType.Snapshot: {
                    try {
                        const snapshot = deserializeSnapshot(payload);
                        const serverTick = (snapshot as any).tick as number | undefined;
                        if (serverTick !== undefined && this.lastAppliedServerTick !== null && serverTick <= this.lastAppliedServerTick) {
                            break;
                        }
                        if (serverTick !== undefined) {
                            this.lastAppliedServerTick = serverTick;
                        }
                        this.bridge.processSnapshot(snapshot as any);

                        // Ack the snapshot
                        const ackData = serializeInputAck({
                            lastProcessedSequence: 0,
                            processedAtTick: snapshot.tick,
                            serverTime: Date.now()
                        });
                        this.channel.emit('bin', wrapBinaryMessage(BinaryMessageType.InputAck, ackData));
                    } catch (e) {
                        console.error('GameClient: Failed to handle snapshot', e);
                    }
                    break;
                }
                case BinaryMessageType.Delta: {
                    try {
                        const delta = deserializeDelta(payload);
                        const serverTick = (delta as any).targetTick as number | undefined;
                        if (serverTick !== undefined && this.lastAppliedServerTick !== null && serverTick <= this.lastAppliedServerTick) {
                            break;
                        }
                        if (serverTick !== undefined) {
                            this.lastAppliedServerTick = serverTick;
                        }
                        this.bridge.processDelta(delta as any);
                    } catch (e) {
                        console.error('GameClient: Failed to handle delta', e);
                    }
                    break;
                }
                case BinaryMessageType.InputAck: {
                    try {
                        const ack = deserializeInputAck(payload);
                        this.bridge.processInputAck(ack as any);
                    } catch (e) {
                        console.error('GameClient: Failed to handle input ack', e);
                    }
                    break;
                }
                case BinaryMessageType.ServerEvent: {
                    try {
                        const message = deserializeServerMessage(payload) as ServerMessage;
                        this.handleServerMessage(message);
                    } catch (e) {
                        console.error('GameClient: Failed to handle server event', e);
                    }
                    break;
                }
            }
        });
    }

    private isFastBinaryType(type: number): boolean {
        return type === BinaryMessageType.P2PMove
            || type === BinaryMessageType.P2PShoot
            || type === BinaryMessageType.P2PHit
            || type === BinaryMessageType.P2PVfx;
    }

    private sendP2PPacket(runtime: P2PRuntime, payload: ArrayBuffer): void {
        const type = new Uint8Array(payload)[0] ?? 0;
        if (this.isFastBinaryType(type)) {
            if (this.p2pSimPacketLoss > 0 && Math.random() < this.p2pSimPacketLoss) {
                runtime.simulatedDropOut++;
                return;
            }
            runtime.sentFastPackets++;
        }
        runtime.transport.send(payload);
    }

    private shouldDropIncomingFastPacket(runtime: P2PRuntime, payload: ArrayBuffer): boolean {
        const type = new Uint8Array(payload)[0] ?? 0;
        if (!this.isFastBinaryType(type)) return false;
        runtime.recvFastPackets++;
        if (this.p2pSimPacketLoss <= 0) return false;
        if (Math.random() >= this.p2pSimPacketLoss) return false;
        runtime.simulatedDropIn++;
        return true;
    }

    private updateMoveJitter(runtime: P2PRuntime, recvAtMs: number): void {
        if (runtime.lastRemoteMoveRecvAtMs <= 0) {
            runtime.lastRemoteMoveRecvAtMs = recvAtMs;
            return;
        }
        const dt = recvAtMs - runtime.lastRemoteMoveRecvAtMs;
        runtime.lastRemoteMoveRecvAtMs = recvAtMs;
        const err = Math.abs(dt - P2P.MOVE_TICK_MS);
        runtime.moveJitterMs = runtime.moveJitterMs * 0.85 + err * 0.15;
    }

    private validateHostRemoteMove(runtime: P2PRuntime, move: any): boolean {
        const dx = Number(move?.dx ?? 0);
        const dy = Number(move?.dy ?? 0);
        const dz = Number(move?.dz ?? 0);
        if (Math.abs(dx) > P2P_MAX_MOVE_STEP || Math.abs(dy) > P2P_MAX_MOVE_STEP || Math.abs(dz) > P2P_MAX_MOVE_STEP) {
            runtime.antiCheatDropCount++;
            return false;
        }
        const vx = Number(move?.vx ?? 0);
        const vy = Number(move?.vy ?? 0);
        const vz = Number(move?.vz ?? 0);
        const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
        if (!Number.isFinite(speed) || speed > P2P_MAX_MOVE_SPEED) {
            runtime.antiCheatDropCount++;
            return false;
        }
        return true;
    }

    private validateHostRemoteShoot(runtime: P2PRuntime): boolean {
        const now = performance.now();
        if (runtime.lastRemoteShotRecvAtMs > 0 && (now - runtime.lastRemoteShotRecvAtMs) < P2P_MIN_SHOT_INTERVAL_MS) {
            runtime.antiCheatDropCount++;
            return false;
        }
        runtime.lastRemoteShotRecvAtMs = now;
        return true;
    }

    private startP2PTelemetry(runtime: P2PRuntime): void {
        if (runtime.telemetryInterval !== null) return;
        runtime.telemetryInterval = window.setInterval(() => {
            const stats = this.bridge.getNetInterpolationStats?.();
            const extrapMs = Number(stats?.extrapolationMs ?? 0);
            const inDropPct = runtime.recvFastPackets > 0 ? (runtime.simulatedDropIn / runtime.recvFastPackets) * 100 : 0;
            const outDropPct = runtime.sentFastPackets > 0 ? (runtime.simulatedDropOut / runtime.sentFastPackets) * 100 : 0;
            console.info('[P2P NET]', {
                rttMs: Math.round(runtime.lastPongRttMs),
                moveJitterMs: Math.round(runtime.moveJitterMs),
                extrapolationMs: Math.round(extrapMs),
                configuredSimLossPct: Number((this.p2pSimPacketLoss * 100).toFixed(1)),
                simLossInPct: Number(inDropPct.toFixed(1)),
                simLossOutPct: Number(outDropPct.toFixed(1)),
                antiCheatDrops: runtime.antiCheatDropCount,
            });
        }, P2P_TELEMETRY_INTERVAL_MS);
    }

    private bindP2PTransport(runtime: P2PRuntime): void {
        runtime.transport.onOpen(() => {
            runtime.connected = true;
            void this.requestServerAck<any>('p2p_mark_connected', { code: runtime.code }, 3000).catch(() => undefined);
            this.setP2PStatus({ phase: 'connected', role: runtime.role, code: runtime.code });
            void this.reportPublicMatchConnected();
            if (runtime.role === 'joiner') {
                const assignment = this.getPublicAssignmentForRoom(runtime.code);
                this.sendP2PPacket(runtime, wrapP2PClientEvent({
                    type: 'p2p_hello',
                    playerId: runtime.localPlayerId,
                    peerId: runtime.transport.localPeerId ?? undefined,
                    displayName: runtime.localDisplayName,
                    roomId: assignment?.roomId,
                    matchId: assignment?.matchId,
                    matchToken: this.publicMatchmaking?.matchToken ?? undefined,
                }));
            }
            this.startP2PIntervals(runtime);
            this.startP2PTelemetry(runtime);
        });

        runtime.transport.onClose((reason) => {
            const active = this.p2p === runtime && this.mode !== 'socket';
            if (this.getPublicAssignmentForRoom(runtime.code) && !runtime.matchStarted) {
                void this.reportPublicMatchFailed();
                this.resetPublicMatchmaking(true);
            }
            if (active) {
                this.bridge.notifyGameMessage(runtime.role === 'joiner' ? 'Host left' : 'Peer disconnected', 'warning');
                this.bridge.updateState({ isGameOver: true, isRunning: false });
            }
            if (reason === 'timeout') {
                if (this.p2p !== runtime) return;
                this.setP2PStatus({
                    phase: 'failed',
                    role: runtime.role,
                    code: runtime.code,
                    error: 'P2P connection failed (ICE/NAT timeout after 10s).',
                });
            }
        });

        runtime.transport.onError((error) => {
            if (this.getPublicAssignmentForRoom(runtime.code) && !runtime.matchStarted) {
                void this.reportPublicMatchFailed();
                this.resetPublicMatchmaking(true);
            }
            this.setP2PStatus({
                phase: 'failed',
                role: runtime.role,
                code: runtime.code,
                error: error instanceof Error ? error.message : 'P2P connection error',
            });
        });

        runtime.transport.onMessage((buffer) => {
            if (this.p2p !== runtime) return;
            if (this.shouldDropIncomingFastPacket(runtime, buffer)) return;
            void this.handleP2PMessage(runtime, buffer);
        });
    }

    private async handleP2PMessage(runtime: P2PRuntime, buffer: ArrayBuffer): Promise<void> {
        const packet = readP2PPacket(buffer);
        if (runtime.role === 'host') {
            switch (packet.kind) {
                case 'input': {
                    if (packet.input.sequence <= runtime.lastRemoteInputSeq) return;
                    runtime.lastRemoteInputSeq = packet.input.sequence;
                    runtime.state.joiner.lastInputSeq = packet.input.sequence;
                    if (runtime.matchMode === 'signal' && runtime.signal) {
                        const wantsExtract = Boolean(packet.input.interact || packet.input.tactical);
                        const joinerSignal = runtime.signal.players.get(runtime.state.joiner.id);
                        if (joinerSignal) {
                            joinerSignal.wantsExtract = wantsExtract;
                        }
                        runtime.signalSoloMode?.setPlayerInteractIntent(runtime.state.joiner.id, wantsExtract);
                    }
                    this.sendP2PPacket(runtime, wrapP2PAck({
                        lastProcessedSequence: packet.input.sequence,
                        processedAtTick: packet.input.tick,
                        serverTime: Date.now(),
                    }));
                    return;
                }
                case 'client_event': {
                    const event = packet.event;
                    if (event?.type === 'p2p_hello') {
                        const assignment = this.getPublicAssignmentForRoom(runtime.code);
                        if (assignment) {
                            const valid = await this.verifyPublicJoin(
                                String(event.roomId ?? runtime.code),
                                String(event.matchId ?? ''),
                                String(event.playerId ?? ''),
                                typeof event.matchToken === 'string' ? event.matchToken : undefined,
                            );
                            if (!valid) {
                                console.warn('[MatchmakingAPI] rejected public duel join', {
                                    roomId: runtime.code,
                                    playerId: event?.playerId,
                                });
                                return;
                            }
                        }
                        runtime.remotePlayerId = String(event.playerId ?? '').trim() || `p2p-join-${runtime.code.toLowerCase()}`;
                        runtime.remoteDisplayName = typeof event.displayName === 'string' ? event.displayName : 'Joiner';
                        runtime.state.joinerId = runtime.remotePlayerId;
                        runtime.state.joiner.id = runtime.remotePlayerId;
                        runtime.state.joiner.displayName = runtime.remoteDisplayName;
                        this.sendP2PPacket(runtime, wrapP2PServerEvent({
                            type: 'event',
                            event: {
                                type: 'p2p_welcome',
                                hostId: runtime.localPlayerId,
                                hostDisplayName: runtime.localDisplayName,
                                joinerId: runtime.remotePlayerId,
                                joinerDisplayName: runtime.remoteDisplayName,
                                matchMode: runtime.matchMode,
                            },
                        }));
                        this.startP2PMatch(runtime);
                        return;
                    }
                    if (event?.type === 'p2p_event_ack') {
                        this.onPeerReliableAck(runtime, Number(event.ack ?? 0));
                        return;
                    }
                    if (event?.type === 'p2p_event_replay_request') {
                        this.replaySignalEventsFrom(runtime, Number(event.fromSeq ?? 1));
                        return;
                    }
                    if (event?.type === 'p2p_pose') {
                        this.updateP2PRemotePose(runtime, event.pose);
                        return;
                    }
                    if (event?.type === 'shoot') {
                        if (!this.validateHostRemoteShoot(runtime)) return;
                        const weaponModelId = typeof event?.weaponModelId === 'string'
                            ? event.weaponModelId
                            : (typeof event?.weaponId === 'string' ? event.weaponId : 'smg1');
                        this.processP2PShot(runtime, runtime.state.joiner.id, { ...event, weaponModelId });
                        return;
                    }
                    if (event?.type === 'select_character') {
                        const characterModelId = typeof event.characterModelId === 'string' ? event.characterModelId : '';
                        if (!characterModelId) return;
                        this.bridge.notifyCharacterSelected(runtime.state.joiner.id as any, characterModelId);
                        this.sendP2PPacket(runtime, wrapP2PServerEvent({
                            type: 'event',
                            event: {
                                type: 'p2p_character_selected',
                                playerId: runtime.state.joiner.id,
                                characterModelId,
                            },
                            tick: tick(0 as any),
                        } as any));
                    }
                    return;
                }
                case 'move':
                    if (!this.validateHostRemoteMove(runtime, packet.move)) return;
                    this.updateMoveJitter(runtime, performance.now());
                    this.applyP2PMovePacket(runtime, packet.move, runtime.state.joiner.id, true);
                    return;
                case 'shoot':
                    if (packet.shoot.shotSequence <= runtime.lastRemoteShotSequence) return;
                    if (!this.validateHostRemoteShoot(runtime)) return;
                    runtime.lastRemoteShotSequence = packet.shoot.shotSequence;
                    const weaponModelId = P2P_WEAPON_MODEL_ID_BY_KIND[packet.shoot.weaponKind] ?? 'smg1';
                    this.processP2PShot(runtime, runtime.state.joiner.id, {
                        origin: packet.shoot.origin,
                        dir: packet.shoot.direction,
                        time: packet.shoot.sentAt,
                        weaponModelId,
                    });
                    return;
                case 'vfx':
                    this.applyIncomingP2PVfx(runtime, packet.vfx, runtime.state.joiner.id);
                    return;
                case 'ping':
                    this.sendP2PPacket(runtime, createPongPayload(packet.sentAt, performance.now()));
                    return;
                case 'pong':
                    runtime.lastPongRttMs = Math.max(0, Math.round(performance.now() - packet.sentAt));
                    this.bridge.updateState({ ping: runtime.lastPongRttMs });
                    return;
                default:
                    return;
            }
        }

        switch (packet.kind) {
            case 'server_event': {
                const message = packet.event as ServerMessage;
                const eventType = (message as any)?.event?.type;
                if (eventType === 'p2p_welcome') {
                    const ev = (message as any).event;
                    runtime.remotePlayerId = String(ev.hostId ?? runtime.remotePlayerId ?? '');
                    runtime.remoteDisplayName = String(ev.hostDisplayName ?? 'Host');
                    runtime.state.hostId = runtime.remotePlayerId || runtime.state.hostId;
                    runtime.state.host.id = runtime.state.hostId;
                    runtime.state.host.displayName = runtime.remoteDisplayName;
                    runtime.state.joinerId = runtime.localPlayerId;
                    runtime.state.joiner.id = runtime.localPlayerId;
                    runtime.state.joiner.displayName = runtime.localDisplayName;
                    runtime.matchMode = ev.matchMode === 'signal'
                        ? 'signal'
                        : ev.matchMode === 'duel_er'
                            ? 'duel_er'
                            : 'duel';
                    this.startP2PMatch(runtime);
                    return;
                }
                if (eventType === 'p2p_full_sync') {
                    this.applyP2PFullSync(runtime, (message as any).event);
                    return;
                }
                if (eventType === 'p2p_preround_start') {
                    const ev = (message as any).event;
                    this.bridge.notifyPreRoundStart({
                        durationSec: Number(ev?.durationSec ?? 10),
                        availableCharacterModelIds: Array.isArray(ev?.availableCharacterModelIds) ? ev.availableCharacterModelIds : undefined,
                    });
                    return;
                }
                if (eventType === 'p2p_preround_end') {
                    this.bridge.notifyPreRoundEnd();
                    return;
                }
                if (eventType === 'p2p_character_selected') {
                    const ev = (message as any).event;
                    const playerId = typeof ev?.playerId === 'string' ? ev.playerId : '';
                    const characterModelId = typeof ev?.characterModelId === 'string' ? ev.characterModelId : '';
                    if (playerId && characterModelId) {
                        this.bridge.notifyCharacterSelected(playerId as any, characterModelId);
                    }
                    return;
                }
                if (eventType === 'p2p_reliable_game_event') {
                    const ev = (message as any).event as ReliableGameEventEnvelope | undefined;
                    if (!ev) return;
                    this.onReliableEventFromHost(runtime, ev);
                    return;
                }
                this.handleServerMessage(message);
                return;
            }
            case 'ack':
                this.bridge.processInputAck(packet.ack);
                return;
            case 'move':
                this.updateMoveJitter(runtime, performance.now());
                this.applyP2PMovePacket(runtime, packet.move, runtime.state.host.id, false);
                return;
            case 'hit':
                this.applyIncomingP2PHit(runtime, packet.hit);
                return;
            case 'vfx':
                this.applyIncomingP2PVfx(runtime, packet.vfx, runtime.state.host.id);
                return;
            case 'ping':
                this.sendP2PPacket(runtime, createPongPayload(packet.sentAt, performance.now()));
                return;
            case 'pong':
                runtime.lastPongRttMs = Math.max(0, Math.round(performance.now() - packet.sentAt));
                this.bridge.updateState({ ping: runtime.lastPongRttMs });
                return;
            default:
                return;
        }
    }

    private startP2PIntervals(runtime: P2PRuntime): void {
        if (runtime.pingInterval === null) {
            runtime.pingInterval = window.setInterval(() => {
                this.sendP2PPacket(runtime, createPingPayload(performance.now()));
            }, P2P.PING_INTERVAL_MS);
        }
        if (runtime.role === 'host' && runtime.fullSyncInterval === null) {
            runtime.fullSyncInterval = window.setInterval(() => {
                if (!runtime.matchStarted) return;
                this.sendP2PPacket(runtime, wrapP2PServerEvent({
                    type: 'event',
                    event: {
                        type: 'p2p_full_sync',
                        state: runtime.state,
                        serverTime: Date.now(),
                    },
                }));
            }, P2P.FULL_SYNC_INTERVAL_MS);
        }
        if (runtime.role === 'host' && runtime.matchMode === 'signal') {
            if (runtime.signalSoloMode) {
                if (runtime.signal?.modeTickInterval === null || runtime.signal === null) {
                    const interval = window.setInterval(() => {
                        this.tickSignalProtocolSolo(runtime);
                    }, 50);
                    if (!runtime.signal) {
                        runtime.signal = this.createSignalProtocolRuntime(runtime);
                    }
                    runtime.signal.modeTickInterval = interval;
                }
                if (!runtime.isSignalSolo && runtime.signal && runtime.signal.reliableResendInterval === null) {
                    runtime.signal.reliableResendInterval = window.setInterval(() => {
                        this.flushReliableResends(runtime);
                    }, SIGNAL.RELIABLE_RESEND_MS);
                }
                return;
            }
            if (runtime.signal) {
                if (runtime.signal.modeTickInterval === null) {
                    runtime.signal.modeTickInterval = window.setInterval(() => {
                        this.tickSignalProtocol(runtime);
                    }, 50);
                }
                if (runtime.signal.reliableResendInterval === null) {
                    runtime.signal.reliableResendInterval = window.setInterval(() => {
                        this.flushReliableResends(runtime);
                    }, SIGNAL.RELIABLE_RESEND_MS);
                }
            }
        }
    }

    private startP2PMatch(runtime: P2PRuntime): void {
        if (runtime.matchStarted) return;
        if (runtime.role === 'host' && !runtime.remotePlayerId && !runtime.isSignalSolo) return;

        runtime.matchStarted = true;
        if (runtime.matchMode === 'duel') {
            void this.reportPublicMatchLive(runtime.code);
        }
        this.mode = runtime.role === 'host' ? 'p2p_host' : 'p2p_joiner';
        if (runtime.role === 'host' && this.isMagicBlockDuelMode(runtime.matchMode)) {
            this.initializeDuelAuthority(runtime);
        }
        if (runtime.matchMode === 'signal' && !runtime.signalSoloMode) {
            // Wiring point for delegated backend routing; no on-chain flow yet.
            const delegatedRpc = this.snapAuthorityTxAdapter.getRpcUrl(true);
            const fallbackRpc = this.snapAuthorityTxAdapter.getRpcUrl(false);
            this.ensureSignalAuthoritySnapClient(`signal:${runtime.code}:${Date.now()}`);
            if ((import.meta as any).env?.DEV) {
                console.info('[SnapAuthority]', {
                    backend: this.snapAuthorityBackend,
                    delegatedRpc,
                    fallbackRpc,
                    mirroredToMagicBlock: Boolean(this.signalAuthoritySnapClient),
                    hardAuthority: this.hardSignalAuthority,
                });
            }
            if (this.hardSignalAuthority && !this.signalAuthoritySnapClient) {
                console.warn('[SignalAuthority] hard authority requested but MagicBlock client is unavailable; mode will degrade to local authority.');
            }
            runtime.signalSoloAuthority = new LocalSignalEventAdapter<SignalModeEvent>();
            runtime.signalSoloMode = new SignalProtocolMode(performance.now(), {
                targetSignal: 500,
                onEvent: (event) => this.onSignalSoloEvent(runtime, event),
                onAnnounce: (message, severity) => this.bridge.notifyGameMessage(message, severity ?? 'info'),
                onApplyBoundaryDamage: (playerId, damage) => {
                    this.applySignalDamage(runtime, 'environment', playerId, damage);
                },
                onApplyToxinDamage: (playerId, damage) => {
                    this.applySignalDamage(runtime, 'environment_toxin', playerId, damage);
                },
                onApplyStampedeKnockback: (_attackerId, victimId, impulse) => {
                    const victim = victimId === runtime.state.host.id ? runtime.state.host : runtime.state.joiner;
                    victim.position = {
                        x: victim.position.x + impulse.x,
                        y: victim.position.y + impulse.y,
                        z: victim.position.z + impulse.z,
                    };
                },
                onInstantRespawn: (playerId) => {
                    const victim = playerId === runtime.state.host.id ? runtime.state.host : runtime.state.joiner;
                    victim.alive = true;
                    victim.health = P2P.PLAYER_MAX_HEALTH;
                    this.bridge.updateState({ isDead: false, respawnTimeRemaining: 0, health: P2P.PLAYER_MAX_HEALTH });
                },
                onSetUltimateCharge: (playerId, charge) => {
                    if (playerId === runtime.localPlayerId) {
                        this.bridge.updateState({ ultimateCharge: charge, ultimateReady: charge >= 100 });
                    }
                },
                onAuthorityAction: (action) => this.mirrorSignalAuthorityAction(action as any),
                hardAuthority: this.hardSignalAuthority,
                authorityAdapter: runtime.signalSoloAuthority,
            });
            this.bindSignalAuthoritySubscription(runtime.signalSoloMode);
            const fallback = this.createDefaultSignalHardpoints().map((hp) => ({
                id: hp.id,
                position: hp.position,
                radius: hp.radius,
            }));
            if (runtime.isSignalSolo) {
                runtime.signalSoloHardpointManager = this.signalSceneForSoloHardpoints
                    ? this.createSceneBoundHardpointManager(this.signalSceneForSoloHardpoints)
                    : HardpointManager.fromPositions(fallback);
            } else {
                if (!runtime.signalP2PVisualHardpointManager) {
                    this.recreateP2PSignalVisualHardpointManager(runtime);
                }
                runtime.signalSoloHardpointManager = runtime.role === 'host'
                    ? this.createSignalP2PAuthorityHardpointManager()
                    : (runtime.signalP2PVisualHardpointManager ?? HardpointManager.fromPositions(fallback));
            }
            runtime.signalSoloHardpointManager.setRotationEnabled(false);
            runtime.signalSoloHardpointManager.setCaptureEnabled(false);
            runtime.signalSoloLastTickAtMs = performance.now();
        }
        if (runtime.matchMode === 'signal' && !runtime.signal) {
            runtime.signal = this.createSignalProtocolRuntime(runtime);
            if (!runtime.isSignalSolo) {
                this.recreateP2PSignalVisualHardpointManager(runtime);
                this.syncSignalP2PVisualState(runtime);
            }
        }
        const hostId = runtime.state.host.id;
        const joinerId = runtime.state.joiner.id;
        const hostSpawn = runtime.state.host.position;
        const joinSpawn = runtime.state.joiner.position;

        this.bridge.setLocalPlayerId(runtime.localPlayerId as any);
        this.bridge.updateState({
            localPlayerEntityId: (runtime.localPlayerId === hostId ? 1001 : 1002) as any,
            health: P2P.PLAYER_MAX_HEALTH,
            maxHealth: P2P.PLAYER_MAX_HEALTH,
            kills: 0,
            deaths: 0,
            assists: 0,
            teamScores: { 1: 0, 2: 0 },
            isDead: false,
            isGameOver: false,
            ping: 0,
            matchTimeRemaining: runtime.matchMode === 'signal' ? 420 : 0,
            signalNextDropSec: 30,
            signalExtractionPct: 0,
            signalExtractionStalled: false,
            signalActiveBuffs: [],
            signalActiveDropBuffName: null,
            signalActiveDropBuffRemainingSec: 0,
            signalSuddenDeathStatus: 'idle',
            signalZoneNumber: 1,
            signalZoneState: runtime.isSignalSolo ? 'PREMATCH_LOADOUT' : 'COUNTDOWN',
            signalZoneTimerSec: runtime.isSignalSolo ? 0 : 30,
            signalZoneOwnerLabel: 'NEUTRAL',
            signalSnapBackend: this.getSnapAuthorityBackend(),
            signalSnapSeq: 0,
            signalSnapStateHash: '',
            signalSnapSignalBlue: 0,
            signalSnapSignalRed: 0,
            signalSnapActiveZone: 1,
            signalSnapZonePhase: 'COUNTDOWN',
            signalSnapZoneRemainingSec: 0,
            signalSnapActiveDropModifierId: null,
            preRoundActive: runtime.isSignalSolo,
        });
        this.bridge.notifyMatchStart({
            mode: runtime.matchMode === 'signal' ? 'signal' : '1v1',
            spawnPosition: runtime.localPlayerId === hostId ? hostSpawn : joinSpawn,
            opponent: runtime.localPlayerId === hostId ? joinerId : hostId,
            opponentSpawnPosition: runtime.localPlayerId === hostId ? joinSpawn : hostSpawn,
            allPlayers: [
                { playerId: hostId, spawnPosition: hostSpawn },
                { playerId: joinerId, spawnPosition: joinSpawn },
            ],
        });
        // notifyMatchStart resets bridge entity mappings; register P2P mappings after it.
        this.bridge.registerPlayerEntity(hostId as any, 1001 as any);
        this.bridge.registerPlayerEntity(joinerId as any, 1002 as any);
        this.pushPoseHistory(runtime, hostId, hostSpawn, performance.now());
        this.pushPoseHistory(runtime, joinerId, joinSpawn, performance.now());
        this.startP2PPreRound(runtime);
        if (runtime.role === 'joiner' && runtime.matchMode === 'signal') {
            this.sendP2PPacket(runtime, wrapP2PClientEvent({ type: 'p2p_event_replay_request', fromSeq: 1 }));
        }
        this.startP2PIntervals(runtime);
        this.bridge.notifyConnected();
    }

    private startP2PPreRound(runtime: P2PRuntime): void {
        const durationSec = 10;
        const availableCharacterModelIds = ['assasin', 'grizzly', 'kodiak', 'panda'];
        this.bridge.notifyPreRoundStart({ durationSec, availableCharacterModelIds });
        if (runtime.role !== 'host') return;
        this.sendP2PPacket(runtime, wrapP2PServerEvent({
            type: 'event',
            event: {
                type: 'p2p_preround_start',
                durationSec,
                availableCharacterModelIds,
            },
            tick: tick(0 as any) as any,
        } as any));
        if (runtime.preRoundTimeout !== null) window.clearTimeout(runtime.preRoundTimeout);
        runtime.preRoundTimeout = window.setTimeout(() => {
            if (this.p2p !== runtime) return;
            this.bridge.notifyPreRoundEnd();
            this.sendP2PPacket(runtime, wrapP2PServerEvent({
                type: 'event',
                event: { type: 'p2p_preround_end' },
                tick: tick(0 as any),
            } as any));
            if (runtime.role === 'host' && this.isMagicBlockDuelMode(runtime.matchMode)) {
                this.activateDuelAuthority(runtime);
            }
            if (runtime.role === 'host' && runtime.matchMode === 'signal' && !runtime.isSignalSolo && runtime.signalSoloMode && runtime.signalSoloHardpointManager) {
                runtime.signalSoloMode.startLiveMatch(runtime.signalSoloHardpointManager, this.selectedLoadoutSlotIndex, performance.now() / 1000);
            }
            runtime.preRoundTimeout = null;
        }, durationSec * 1000);
    }

    private onPeerReliableAck(runtime: P2PRuntime, ackSeq: number): void {
        const signal = runtime.signal;
        if (!signal || runtime.role !== 'host') return;
        if (!Number.isFinite(ackSeq) || ackSeq <= signal.reliableLastAck) return;
        signal.reliableLastAck = ackSeq;
        for (const seq of Array.from(signal.reliablePending.keys())) {
            if (seq <= ackSeq) signal.reliablePending.delete(seq);
        }
    }

    private replaySignalEventsFrom(runtime: P2PRuntime, fromSeqRaw: number): void {
        const signal = runtime.signal;
        if (!signal || runtime.role !== 'host' || runtime.isSignalSolo) return;
        const fromSeq = Math.max(1, Math.floor(fromSeqRaw || 1));
        for (const record of signal.eventLog) {
            if (record.seq < fromSeq) continue;
            const payload = wrapP2PServerEvent({
                type: 'event',
                event: { type: 'p2p_reliable_game_event', seq: record.seq, event: record.event },
                tick: tick(msToTicks(performance.now()) as any),
            } as any);
            signal.reliablePending.set(record.seq, { payload, lastSentAtMs: performance.now() });
            this.sendP2PPacket(runtime, payload);
        }
    }

    private onReliableEventFromHost(runtime: P2PRuntime, envelope: ReliableGameEventEnvelope): void {
        const signal = runtime.signal;
        if (!signal || runtime.role !== 'joiner') return;
        const seq = Math.floor(Number(envelope.seq ?? 0));
        if (!Number.isFinite(seq) || seq <= 0) return;
        if (seq < signal.reliableExpectedSeq) {
            this.sendP2PPacket(runtime, wrapP2PClientEvent({ type: 'p2p_event_ack', ack: signal.reliableExpectedSeq - 1 }));
            return;
        }
        signal.reliableBuffer.set(seq, envelope.event);
        let advanced = false;
        while (signal.reliableBuffer.has(signal.reliableExpectedSeq)) {
            const event = signal.reliableBuffer.get(signal.reliableExpectedSeq)!;
            signal.reliableBuffer.delete(signal.reliableExpectedSeq);
            this.applySignalEvent(runtime, event);
            signal.reliableExpectedSeq += 1;
            advanced = true;
        }
        if (advanced) {
            this.sendP2PPacket(runtime, wrapP2PClientEvent({ type: 'p2p_event_ack', ack: signal.reliableExpectedSeq - 1 }));
        }
    }

    private flushReliableResends(runtime: P2PRuntime): void {
        const signal = runtime.signal;
        if (!signal || runtime.role !== 'host' || runtime.isSignalSolo) return;
        const now = performance.now();
        for (const [seq, pending] of signal.reliablePending.entries()) {
            if (seq <= signal.reliableLastAck) {
                signal.reliablePending.delete(seq);
                continue;
            }
            if (now - pending.lastSentAtMs < SIGNAL.RELIABLE_RESEND_MS) continue;
            pending.lastSentAtMs = now;
            this.sendP2PPacket(runtime, pending.payload);
        }
    }

    private emitSignalReliableEvent(runtime: P2PRuntime, event: GameEvent): void {
        const signal = runtime.signal;
        if (!signal) return;
        const seq = ++signal.reliableSeqNext;
        signal.eventLog.push({ seq, event, atMs: performance.now() });
        if (signal.eventLog.length > SIGNAL.MAX_EVENT_LOG) {
            signal.eventLog.splice(0, signal.eventLog.length - SIGNAL.MAX_EVENT_LOG);
        }
        this.applySignalEvent(runtime, event);
        if (runtime.isSignalSolo) return;
        const payload = wrapP2PServerEvent({
            type: 'event',
            event: { type: 'p2p_reliable_game_event', seq, event },
            tick: tick(msToTicks(performance.now()) as any),
        } as any);
        signal.reliablePending.set(seq, { payload, lastSentAtMs: performance.now() });
        this.sendP2PPacket(runtime, payload);
    }

    private applySignalEvent(runtime: P2PRuntime, event: GameEvent): void {
        if (event.type === 'player_died') {
            const localEntityId = this.bridge.getState().localPlayerEntityId;
            if (localEntityId && event.entityId === localEntityId) {
                this.bridge.updateState({ isDead: true, respawnTimeRemaining: 3 });
            }
        }
        if (event.type === 'player_spawned') {
            const localEntityId = this.bridge.getState().localPlayerEntityId;
            if (localEntityId && event.entityId === localEntityId) {
                this.bridge.updateState({ isDead: false, respawnTimeRemaining: 0, health: P2P.PLAYER_MAX_HEALTH });
            }
        }
        if (event.type === 'signal_state') {
            if (runtime.signal) {
                runtime.signal.activeHardpointIndex = Math.max(0, Math.floor(Number(event.activeHardpointIndex ?? runtime.signal.activeHardpointIndex)));
                runtime.signal.controllingTeam = event.controllingTeam === 1 || event.controllingTeam === 2
                    ? event.controllingTeam
                    : null;
                runtime.signal.contested = Boolean(event.contested);
                runtime.signal.scoreboardFrozen = Boolean(event.frozen);
                runtime.signal.teamSignal = [
                    Math.round(Number(event.teamSignal?.[0] ?? runtime.signal.teamSignal[0])),
                    Math.round(Number(event.teamSignal?.[1] ?? runtime.signal.teamSignal[1])),
                ];
                runtime.signal.targetSignal = Math.max(1, Math.round(Number(event.targetSignal ?? runtime.signal.targetSignal)));
                runtime.signal.collapseRadius = Number.isFinite(event.playAreaRadius) ? Number(event.playAreaRadius) : runtime.signal.collapseRadius;
                runtime.signal.collapseActiveAtMs = event.collapseActive
                    ? (runtime.signal.collapseActiveAtMs ?? performance.now())
                    : null;
                const nextDropInMs = Math.max(0, Number((event as any).nextDropInMs ?? 0));
                runtime.signal.nextDropAtMs = performance.now() + nextDropInMs;
            }
            this.bridge.updateState({
                teamScores: { 1: Math.round(event.teamSignal[0]), 2: Math.round(event.teamSignal[1]) },
                matchTimeRemaining: Math.max(0, Math.floor((SIGNAL.COLLAPSE_TRIGGER_MS - (performance.now() - (runtime.signal?.matchStartedAtMs ?? performance.now()))) / 1000)),
                signalNextDropSec: Math.ceil(Math.max(0, Number((event as any).nextDropInMs ?? 0) / 1000)),
                signalZoneNumber: Math.max(1, Math.floor(Number((event as any).signalZoneNumber ?? (Number(event.activeHardpointIndex ?? 0) + 1)))),
                signalZoneState: String((event as any).signalZoneState ?? 'ACTIVE') as any,
                signalZoneTimerSec: Math.max(0, Math.ceil(Number((event as any).signalZoneTimerSec ?? 0))),
                signalZoneOwnerLabel: String((event as any).signalZoneOwnerLabel ?? 'NEUTRAL'),
                signalSuddenDeathStatus: event.collapseActive ? 'active' : this.bridge.getState().signalSuddenDeathStatus,
            });
            this.syncSignalP2PVisualState(runtime);
        }
        if (event.type === 'drop_spawned' || event.type === 'golden_drop_spawned') {
            if (runtime.signal && event.drop) {
                runtime.signal.drop = {
                    ...event.drop,
                    extractionByPlayerId: {},
                };
            }
            this.syncSignalP2PVisualState(runtime);
        }
        if (event.type === 'drop_landed') {
            if (runtime.signal?.drop && event.drop) {
                runtime.signal.drop = {
                    ...event.drop,
                    extractionByPlayerId: runtime.signal.drop.extractionByPlayerId ?? {},
                };
                runtime.signal.scoreboardFrozen = Boolean(event.scoreboardFrozen);
            }
            this.syncSignalP2PVisualState(runtime);
        }
        if (event.type === 'extraction_progress') {
            if (runtime.signal) {
                const entry = runtime.signal.players.get(String(event.playerId));
                if (entry) {
                    entry.extractProgressSec = Math.max(0, Math.min(SIGNAL.EXTRACTION_SEC, Number(event.pct ?? 0) * SIGNAL.EXTRACTION_SEC));
                    entry.extractStalledUntilMs = Boolean(event.stalled) ? performance.now() + SIGNAL.EXTRACTION_STALL_MS : 0;
                }
            }
            const localId = this.getLocalPlayerIdForMessages();
            if (localId && event.playerId === localId) {
                this.bridge.updateState({
                    signalExtractionPct: Math.max(0, Math.min(1, event.pct)),
                    signalExtractionStalled: Boolean(event.stalled),
                } as any);
            }
        }
        if (event.type === 'signal_reward_applied' && event.rewardType === 'instant_ult_charge') {
            const localId = this.getLocalPlayerIdForMessages();
            if (localId && event.playerId === localId) {
                this.bridge.updateState({ ultimateCharge: 100, ultimateReady: true });
            }
        }
        if (event.type === 'signal_reward_applied') {
            const active = [...(this.bridge.getState() as any).signalActiveBuffs ?? []] as string[];
            if (event.buff?.kind === 'team_overclock' && !active.includes('Team Overclock')) {
                active.push('Team Overclock');
            }
            if (event.buff?.kind === 'respawn_token' && !active.includes('Respawn Token')) {
                active.push('Respawn Token');
            }
            if (event.buff?.kind === 'overshield' && !active.some((v) => v.startsWith('Overshield'))) {
                active.push('Overshield +50');
            }
            this.bridge.updateState({ signalActiveBuffs: active } as any);
        }
        if (event.type === 'collapse_warning') {
            this.bridge.updateState({ signalSuddenDeathStatus: 'warning' } as any);
            this.bridge.notifyGameMessage(`Collapse in ${event.warningSeconds}s`, 'warning');
        }
        if (event.type === 'collapse_started') {
            if (runtime.signal) {
                runtime.signal.collapseActiveAtMs = performance.now();
            }
            this.bridge.updateState({ signalSuddenDeathStatus: 'active' } as any);
            this.bridge.notifyGameMessage('The Collapse has begun', 'warning');
        }
        if (event.type === 'drop_captured') {
            if (runtime.signal) {
                runtime.signal.drop = null;
                runtime.signal.scoreboardFrozen = false;
                for (const state of runtime.signal.players.values()) {
                    state.extractProgressSec = 0;
                    state.wantsExtract = false;
                }
            }
            this.bridge.updateState({ signalExtractionPct: 0, signalExtractionStalled: false } as any);
            this.bridge.notifyGameMessage(`Drop captured: ${event.rewardType}`, 'success');
            this.syncSignalP2PVisualState(runtime);
        }
        if (event.type === 'drop_timeout') {
            if (runtime.signal) {
                runtime.signal.drop = null;
                runtime.signal.scoreboardFrozen = false;
            }
            this.syncSignalP2PVisualState(runtime);
        }
        if (runtime.role === 'host' && event.type === 'player_died') {
            return;
        }
        this.bridge.emitGameEvent(event as any);
    }

    private tickSignalProtocolSolo(runtime: P2PRuntime): void {
        if (!runtime.signalSoloMode || !runtime.signalSoloHardpointManager || !runtime.matchStarted) return;
        const now = performance.now();
        const lastTickAt = runtime.signalSoloLastTickAtMs ?? now;
        const dt = Math.max(0.001, Math.min(0.1, (now - lastTickAt) / 1000));
        runtime.signalSoloLastTickAtMs = now;
        const localRenderPos = this.bridge.getLocalRenderPos();
        if (localRenderPos) {
            runtime.state.host.position = {
                x: localRenderPos.x,
                y: localRenderPos.y,
                z: localRenderPos.z,
            };
        }

        const players = [
            {
                id: runtime.state.host.id,
                team: 'blue' as const,
                position: { ...runtime.state.host.position },
                isAlive: runtime.state.host.alive,
                ultimateCharge: runtime.localPlayerId === runtime.state.host.id ? this.bridge.getState().ultimateCharge : 0,
            },
            {
                id: runtime.state.joiner.id,
                team: 'red' as const,
                position: { ...runtime.state.joiner.position },
                isAlive: runtime.state.joiner.alive,
                ultimateCharge: 0,
            },
        ];
        const liveForSimulation = runtime.signalSoloMode.getMatchFlowState() === 'LIVE';
        runtime.signalSoloMode.updateZones(dt, runtime.signalSoloHardpointManager, now / 1000);
        if (liveForSimulation) {
            runtime.signalSoloHardpointManager.tick(dt, players);
        }
        runtime.signalSoloMode.tick(dt, runtime.signalSoloHardpointManager, players, now);
        const flowState = runtime.signalSoloMode.getMatchFlowState();
        const isLive = flowState === 'LIVE';
        if (isLive) {
            this.scheduleSignalAuthorityCheckpoint();
        }

        const localState = this.bridge.getState();
        if (isLive && localState.tacticalCooldown > 0) {
            const regenMul = runtime.signalSoloMode.getCooldownRegenMultiplier(runtime.localPlayerId);
            const nextCd = Math.max(0, localState.tacticalCooldown - (dt * regenMul));
            this.bridge.updateState({ tacticalCooldown: nextCd });
        }

        const signal = runtime.signalSoloMode.getSignal();
        const snapDebug = runtime.signalSoloMode.getSnapDebugInfo();
        const extraction = runtime.signalSoloMode.getExtractionProgress();
        const nextDrop = runtime.signalSoloMode.getNextDropTimer();
        const zone = runtime.signalSoloMode.getCurrentZone();
        const localTeam: Team = runtime.localPlayerId === runtime.state.host.id ? 'blue' : 'red';
        const buffs = runtime.signalSoloMode.getActiveBuffs();
        const buffLabels = buffs.filter((b) => b.team === localTeam).map((b) => {
            if (b.type === DropRewardType.FORGE_LINK) return 'Forge-Link';
            if (b.type === DropRewardType.SKY_EYE_RECON) return 'Sky-Eye Recon';
            if (b.type === DropRewardType.NEURO_TOXIN_CLOUD) return 'Neuro-Toxin Cloud';
            if (b.type === DropRewardType.STAMPEDE_OVERDRIVE) return 'Stampede Overdrive';
            if (b.type === DropRewardType.SCRAP_MAGNET) return 'Scrap-Magnet';
            return b.type;
        });
        const activeDropBuff = runtime.signalSoloMode.getActiveDropBuff(localTeam);
        const activeDropBuffName = activeDropBuff
            ? (activeDropBuff.type === DropRewardType.FORGE_LINK ? 'Forge-Link'
                : activeDropBuff.type === DropRewardType.SKY_EYE_RECON ? 'Sky-Eye Recon'
                    : activeDropBuff.type === DropRewardType.NEURO_TOXIN_CLOUD ? 'Neuro-Toxin Cloud'
                        : activeDropBuff.type === DropRewardType.STAMPEDE_OVERDRIVE ? 'Stampede Overdrive'
                            : activeDropBuff.type === DropRewardType.SCRAP_MAGNET ? 'Scrap-Magnet'
                                : String(activeDropBuff.type))
            : null;
        const activeDropBuffRemainingSec = activeDropBuff?.expiresAt
            ? Math.max(0, (activeDropBuff.expiresAt - now) / 1000)
            : 0;
        const currentSuddenDeathStatus = this.bridge.getState().signalSuddenDeathStatus;
        const suddenDeathStatus = runtime.signalSoloMode.isSuddenDeathActive()
            ? 'active'
            : currentSuddenDeathStatus === 'warning'
                ? 'warning'
                : 'idle';
        const ownerLabel = !isLive
            ? 'NEUTRAL'
            : zone.state === 'COUNTDOWN'
                ? 'NEUTRAL'
                : zone.contested
                    ? 'CONTESTED'
                    : zone.ownerTeamId
                        ? zone.ownerTeamId.toUpperCase()
                        : 'NEUTRAL';
        const zoneTimer = !isLive ? 0 : zone.state === 'COUNTDOWN' ? zone.countdownRemainingSec : zone.activeRemainingSec;
        const zoneNumber = getHardpointDisplayNumber(zone.activeZoneId, zone.activeZoneIndex);
        this.bridge.updateState({
            teamScores: { 1: Math.floor(signal.blue), 2: Math.floor(signal.red) },
            signalNextDropSec: Math.ceil(nextDrop),
            signalExtractionPct: extraction,
            signalActiveBuffs: buffLabels,
            signalActiveDropBuffName: activeDropBuffName,
            signalActiveDropBuffRemainingSec: activeDropBuffRemainingSec,
            signalSuddenDeathStatus: suddenDeathStatus,
            signalZoneNumber: isLive ? zoneNumber : 1,
            signalZoneState: isLive ? zone.state : flowState,
            signalZoneTimerSec: Math.max(0, Math.ceil(zoneTimer)),
            signalZoneOwnerLabel: ownerLabel,
            signalSnapBackend: snapDebug.backend,
            signalSnapSeq: snapDebug.seq,
            signalSnapStateHash: snapDebug.stateHash,
            signalSnapSignalBlue: snapDebug.signalBlue,
            signalSnapSignalRed: snapDebug.signalRed,
            signalSnapActiveZone: isLive ? zoneNumber : 1,
            signalSnapZonePhase: snapDebug.zonePhase,
            signalSnapZoneRemainingSec: Math.max(0, Math.ceil(snapDebug.zoneRemainingSec)),
            signalSnapActiveDropModifierId: snapDebug.activeDropModifierId,
            preRoundActive: flowState === 'PREMATCH_LOADOUT',
        } as any);

        if (!runtime.isSignalSolo && runtime.signal) {
            runtime.signal.teamSignal = [Math.floor(signal.blue), Math.floor(signal.red)];
            runtime.signal.activeHardpointIndex = Math.max(0, zone.activeZoneIndex);
            runtime.signal.controllingTeam = zone.ownerTeamId === 'blue' ? 1 : zone.ownerTeamId === 'red' ? 2 : null;
            runtime.signal.contested = Boolean(zone.contested);
            runtime.signal.nextDropAtMs = now + (Math.max(0, nextDrop) * 1000);
            const activeHardpoint = runtime.signalSoloHardpointManager
                .getSnapshots()
                .find((hardpoint) => hardpoint.id === zone.activeZoneId)
                ?? runtime.signalSoloHardpointManager.getSnapshots()[Math.max(0, zone.activeZoneIndex)]
                ?? null;
            if (now - runtime.signal.lastSignalStateBroadcastMs >= SIGNAL.STATE_BROADCAST_MS) {
                runtime.signal.lastSignalStateBroadcastMs = now;
                this.emitSignalReliableEvent(runtime, {
                    type: 'signal_state',
                    activeHardpointId: activeHardpoint?.id ?? `hardpoint${zoneNumber}`,
                    activeHardpointIndex: Math.max(0, zone.activeZoneIndex),
                    hardpointPosition: { ...(activeHardpoint?.position ?? { x: 0, y: 0, z: 0 }) },
                    hardpointRadius: Number(activeHardpoint?.radius ?? 8),
                    controllingTeam: runtime.signal.controllingTeam,
                    contested: runtime.signal.contested,
                    frozen: Boolean(runtime.signal.scoreboardFrozen),
                    teamSignal: [Math.floor(signal.blue), Math.floor(signal.red)],
                    targetSignal: runtime.signal.targetSignal,
                    nextDropInMs: Math.max(0, Math.round(nextDrop * 1000)),
                    signalZoneNumber: zoneNumber,
                    signalZoneState: isLive ? zone.state : flowState,
                    signalZoneTimerSec: Math.max(0, Math.ceil(zoneTimer)),
                    signalZoneOwnerLabel: ownerLabel,
                    collapseActive: runtime.signalSoloMode.isSuddenDeathActive(),
                    tick: tick(msToTicks(now) as any),
                } as GameEvent);
            }
        }

        this.syncSignalSoloDropVisuals(runtime);

        // Tick particle VFX
        runtime.signalSoloHardpointManager.getVFXManager()?.update(dt);
    }

    private syncSignalSoloDropVisuals(runtime: P2PRuntime): void {
        if (!runtime.signalSoloMode || !runtime.signalSoloHardpointManager) return;
        if (!runtime.isSignalSolo) {
            this.syncSignalP2PVisualState(runtime);
            return;
        }
        const drop = runtime.signalSoloMode.getCurrentDropVisual();
        const manager = runtime.isSignalSolo
            ? runtime.signalSoloHardpointManager
            : (runtime.signalP2PVisualHardpointManager ?? runtime.signalSoloHardpointManager);
        const vfx = manager.getVFXManager();
        const activeDropId = runtime.isSignalSolo ? runtime.signalSoloVisualDropId : runtime.signalP2PVisualDropId;
        if (!drop) {
            if (activeDropId !== null) {
                manager.removeDropMarker();
                vfx?.removeDropVFX();
                if (runtime.isSignalSolo) runtime.signalSoloVisualDropId = null;
                else runtime.signalP2PVisualDropId = null;
            }
            return;
        }
        if (activeDropId === drop.id) return;
        manager.createDropMarker(drop.position, drop.isGolden);
        vfx?.createDropVFX(drop.position, drop.isGolden);
        if (runtime.isSignalSolo) runtime.signalSoloVisualDropId = drop.id;
        else runtime.signalP2PVisualDropId = drop.id;
    }

    private onSignalSoloEvent(runtime: P2PRuntime, event: SignalModeEvent): void {
        const data = event.data as any;
        const vfx = runtime.signalSoloHardpointManager?.getVFXManager() ?? null;
        const mirrorToPeer = !runtime.isSignalSolo && runtime.role === 'host';
        if (mirrorToPeer && !runtime.signal) {
            runtime.signal = this.createSignalProtocolRuntime(runtime);
        }
        if (event.type === 'DROP_SPAWNED' || event.type === 'DROP_CAPTURED' || event.type === 'DROP_TIMEOUT' || event.type === 'EXTRACTION_STARTED' || event.type === 'EXTRACTION_PROGRESS' || event.type === 'EXTRACTION_RESET') {
            console.log(`[SignalProtocolDrop] ${event.type}`, data);
        }

        if (event.type === 'MATCH_WON') {
            this.scheduleSignalAuthorityFinalize(data.winner, Number(data.finalScore?.blue ?? 0), Number(data.finalScore?.red ?? 0));
            const winnerId = data.winner === 'blue'
                ? runtime.state.host.id
                : runtime.state.joiner.id;
            const scores = { team_1: Math.floor(data.finalScore.blue), team_2: Math.floor(data.finalScore.red) } as Record<string, number>;
            this.handleServerMessage({ type: 'match_ended', winnerId, scores, targetScore: 500 } as any);
            if (mirrorToPeer) {
                this.sendP2PPacket(runtime, wrapP2PServerEvent({ type: 'match_ended', winnerId, scores, targetScore: 500 } as any));
            }
        } else if (event.type === 'DROP_SPAWNED') {
            if (runtime.signal) {
                runtime.signal.drop = {
                    id: String(data.dropId),
                    hardpointId: String(data.hardpointId ?? `hardpoint${(runtime.signal.activeHardpointIndex ?? 0) + 1}`),
                    position: data.position ? { ...data.position } : { x: 0, y: 0, z: 0 },
                    ownerTeam: null,
                    contested: false,
                    landed: true,
                    golden: false,
                    rewardType: String(data.rewardType ?? 'FORGE_LINK') as any,
                    spawnedAtMs: Number(data.spawnTime ?? performance.now()),
                    landedAtMs: Number(data.spawnTime ?? performance.now()),
                    extractionByPlayerId: {},
                };
            }
            this.bridge.notifyGameMessage(`Drop spawned: ${data.rewardType}`, 'info');
            if (mirrorToPeer && runtime.signal?.drop) {
                this.emitSignalReliableEvent(runtime, { type: 'drop_spawned', drop: cloneDropState(runtime.signal.drop) } as GameEvent);
            }
        } else if (event.type === 'GOLDEN_DROP_SPAWNED') {
            if (runtime.signal) {
                runtime.signal.drop = {
                    id: String(data.dropId),
                    hardpointId: `hardpoint${(runtime.signal.activeHardpointIndex ?? 0) + 1}`,
                    position: data.position ? { ...data.position } : { x: 0, y: 0, z: 0 },
                    ownerTeam: null,
                    contested: false,
                    landed: true,
                    golden: true,
                    rewardType: 'golden_signal',
                    spawnedAtMs: Number(data.timestamp ?? performance.now()),
                    landedAtMs: Number(data.timestamp ?? performance.now()),
                    extractionByPlayerId: {},
                };
            }
            this.bridge.notifyGameMessage('Golden Drop spawned!', 'warning');
            if (mirrorToPeer && runtime.signal?.drop) {
                this.emitSignalReliableEvent(runtime, { type: 'golden_drop_spawned', drop: cloneDropState(runtime.signal.drop), bonusSignal: SIGNAL.GOLDEN_SIGNAL_BONUS } as GameEvent);
            }
        } else if (event.type === 'DROP_CAPTURED') {
            this.bridge.notifyGameMessage(`Drop captured: ${data.rewardType}`, 'success');
            if (vfx) {
                const captureTeam = data.team ?? (data.playerId === runtime.state.host.id ? 'blue' : 'red');
                if (data.position) vfx.triggerCaptureBurst(data.position, captureTeam);
            }
            if (mirrorToPeer) {
                this.emitSignalReliableEvent(runtime, {
                    type: 'drop_captured',
                    rewardType: String(data.rewardType ?? 'FORGE_LINK') as any,
                    playerId: data.playerId,
                    team: data.team,
                    position: data.position,
                } as any);
            }
            if (runtime.signal) {
                runtime.signal.drop = null;
                runtime.signal.scoreboardFrozen = false;
            }
        } else if (event.type === 'DROP_TIMEOUT') {
            // Drop visuals are synced from mode state each tick.
            if (mirrorToPeer) {
                this.emitSignalReliableEvent(runtime, { type: 'drop_timeout' } as any);
            }
            if (runtime.signal) {
                runtime.signal.drop = null;
                runtime.signal.scoreboardFrozen = false;
            }
        } else if (event.type === 'EXTRACTION_STARTED') {
            if (vfx && data.position) {
                const playerPos = data.playerId === runtime.state.host.id
                    ? runtime.state.host.position
                    : runtime.state.joiner.position;
                vfx.startExtractionVFX(data.position, playerPos);
            }
        } else if (event.type === 'EXTRACTION_STALLED') {
            if (data.playerId === runtime.localPlayerId) {
                this.bridge.updateState({ signalExtractionStalled: true } as any);
            }
            if (vfx) vfx.stopExtractionVFX();
            if (mirrorToPeer) {
                this.emitSignalReliableEvent(runtime, {
                    type: 'extraction_progress',
                    playerId: data.playerId,
                    pct: runtime.signalSoloMode?.getExtractionProgress() ?? 0,
                    stalled: true,
                } as any);
            }
        } else if (event.type === 'EXTRACTION_PROGRESS') {
            if (data.playerId === runtime.localPlayerId) {
                this.bridge.updateState({ signalExtractionPct: data.progress, signalExtractionStalled: false } as any);
            }
            if (mirrorToPeer) {
                this.emitSignalReliableEvent(runtime, {
                    type: 'extraction_progress',
                    playerId: data.playerId,
                    pct: data.progress,
                    stalled: false,
                } as any);
            }
        } else if (event.type === 'EXTRACTION_RESET') {
            if (data.playerId === runtime.localPlayerId) {
                this.bridge.updateState({ signalExtractionPct: 0, signalExtractionStalled: false } as any);
            }
            if (vfx) vfx.stopExtractionVFX();
            if (mirrorToPeer) {
                this.emitSignalReliableEvent(runtime, {
                    type: 'extraction_progress',
                    playerId: data.playerId,
                    pct: 0,
                    stalled: false,
                } as any);
            }
        } else if (event.type === 'SUDDEN_DEATH_WARNING') {
            this.bridge.updateState({ signalSuddenDeathStatus: 'warning' } as any);
            this.bridge.notifyGameMessage(`Collapse in ${data.timeUntilShrink}s`, 'warning');
        } else if (event.type === 'SUDDEN_DEATH_ACTIVATED') {
            this.bridge.updateState({ signalSuddenDeathStatus: 'active' } as any);
            this.bridge.notifyGameMessage('The Collapse has begun', 'warning');
        } else if (event.type === 'DROP_BUFF_START') {
            this.bridge.notifyGameMessage(`Drop Buff Active: ${data.key} (${Math.max(0, Math.ceil((Number(data.endT) - Number(data.startT)) / 1000))}s)`, 'success');
        } else if (event.type === 'DROP_BUFF_END') {
            this.bridge.notifyGameMessage(`Drop Buff Ended: ${data.key} (${data.reason})`, 'warning');
        } else if (event.type === 'TOXIN_START') {
            this.bridge.notifyGameMessage('Neuro-Toxin Cloud deployed at hardpoint', 'warning');
        } else if (event.type === 'TOXIN_END') {
            this.bridge.notifyGameMessage(`Neuro-Toxin Cloud ended (${data.reason})`, 'info');
        } else if (event.type === 'SCRAP_MAGNET_START') {
            this.bridge.notifyGameMessage('Scrap-Magnet active (+100 pending credits)', 'success');
        } else if (event.type === 'SCRAP_MAGNET_END') {
            this.bridge.notifyGameMessage(`Scrap-Magnet ended (${data.reason})`, 'info');
        }
    }

    private tickSignalProtocol(runtime: P2PRuntime): void {
        if (runtime.role !== 'host' || !runtime.signal || !runtime.matchStarted) return;
        const signal = runtime.signal;
        const now = performance.now();
        const dt = Math.max(0.001, Math.min(0.1, (now - signal.lastTickAtMs) / 1000));
        signal.lastTickAtMs = now;
        const host = runtime.state.host;
        const joiner = runtime.state.joiner;

        if (!signal.goldenHardpointActive && now - signal.lastRotateAtMs >= SIGNAL.ROTATE_EVERY_MS) {
            signal.lastRotateAtMs = now;
            signal.activeHardpointIndex = (signal.activeHardpointIndex + 1) % 3;
        }
        const activeHardpoint = signal.hardpoints[signal.activeHardpointIndex] ?? signal.hardpoints[0]!;

        const onPoint = { 1: 0, 2: 0 };
        if (host.alive && this.pointInsideRadius(host.position, activeHardpoint.position, activeHardpoint.radius)) onPoint[1] += 1;
        if (joiner.alive && this.pointInsideRadius(joiner.position, activeHardpoint.position, activeHardpoint.radius)) onPoint[2] += 1;
        signal.contested = onPoint[1] > 0 && onPoint[2] > 0;
        signal.controllingTeam = signal.contested ? null : onPoint[1] > 0 ? 1 : onPoint[2] > 0 ? 2 : null;

        if (!signal.drop && now >= signal.nextDropAtMs) {
            const rewardPool: SignalRewardType[] = ['team_overclock', 'instant_ult_charge', 'overshield_pack', 'fragment_cache', 'respawn_token'];
            const rewardType = rewardPool[Math.floor(Math.random() * rewardPool.length)] ?? 'fragment_cache';
            signal.drop = {
                id: `drop_${Math.floor(now)}`,
                hardpointId: activeHardpoint.id,
                position: { ...activeHardpoint.position },
                ownerTeam: signal.contested ? null : signal.controllingTeam,
                contested: signal.contested,
                landed: false,
                golden: false,
                rewardType,
                spawnedAtMs: now,
                extractionByPlayerId: {},
            };
            signal.nextDropAtMs = now + SIGNAL.DROP_EVERY_MS;
            this.emitSignalReliableEvent(runtime, { type: 'drop_spawned', drop: cloneDropState(signal.drop) } as GameEvent);
        }

        if (signal.drop && !signal.drop.landed && now - signal.drop.spawnedAtMs >= SIGNAL.DROP_LAND_DELAY_MS) {
            signal.drop.landed = true;
            signal.drop.landedAtMs = now;
            signal.scoreboardFrozen = true;
            this.emitSignalReliableEvent(runtime, { type: 'drop_landed', drop: cloneDropState(signal.drop), scoreboardFrozen: true } as GameEvent);
        }

        this.processSignalExtraction(runtime, dt, now);

        if (!signal.scoreboardFrozen && signal.controllingTeam !== null) {
            const multiplier = signal.goldenHardpointActive ? 2 : 1;
            const idx = signal.controllingTeam === 1 ? 0 : 1;
            signal.teamSignal[idx] = Math.min(signal.targetSignal, signal.teamSignal[idx] + signal.signalPerSec * multiplier * dt);
        }

        this.processCollapse(runtime, now, dt);
        this.updateSignalP2PHud(runtime, now);
        this.syncSignalP2PVisualState(runtime);

        if (now - signal.lastSignalStateBroadcastMs >= SIGNAL.STATE_BROADCAST_MS) {
            signal.lastSignalStateBroadcastMs = now;
            const rotateRemainingMs = signal.goldenHardpointActive
                ? 0
                : Math.max(0, SIGNAL.ROTATE_EVERY_MS - (now - signal.lastRotateAtMs));
            this.emitSignalReliableEvent(runtime, {
                type: 'signal_state',
                activeHardpointId: activeHardpoint.id,
                activeHardpointIndex: signal.activeHardpointIndex,
                hardpointPosition: { ...activeHardpoint.position },
                hardpointRadius: activeHardpoint.radius,
                controllingTeam: signal.controllingTeam,
                contested: signal.contested,
                frozen: signal.scoreboardFrozen,
                teamSignal: [Math.round(signal.teamSignal[0]), Math.round(signal.teamSignal[1])],
                targetSignal: signal.targetSignal,
                nextDropInMs: signal.drop ? 0 : Math.max(0, signal.nextDropAtMs - now),
                signalZoneNumber: Math.max(1, signal.activeHardpointIndex + 1),
                signalZoneState: 'ACTIVE',
                signalZoneTimerSec: Math.ceil(rotateRemainingMs / 1000),
                signalZoneOwnerLabel: signal.contested ? 'CONTESTED' : signal.controllingTeam === 1 ? 'BLUE' : signal.controllingTeam === 2 ? 'RED' : 'NEUTRAL',
                ...(signal.collapseRadius !== null ? { playAreaRadius: signal.collapseRadius } : {}),
                collapseActive: signal.collapseActiveAtMs !== null,
                tick: tick(msToTicks(now) as any),
            } as GameEvent);
        }

        if (signal.teamSignal[0] >= signal.targetSignal || signal.teamSignal[1] >= signal.targetSignal) {
            const winnerId = signal.teamSignal[0] >= signal.targetSignal ? 'team_1' : 'team_2';
            const scores = { team_1: Math.round(signal.teamSignal[0]), team_2: Math.round(signal.teamSignal[1]) } as Record<string, number>;
            this.handleServerMessage({ type: 'match_ended', winnerId, scores, targetScore: signal.targetSignal } as any);
            if (!runtime.isSignalSolo) {
                this.sendP2PPacket(runtime, wrapP2PServerEvent({ type: 'match_ended', winnerId, scores, targetScore: signal.targetSignal } as any));
            }
            if (signal.modeTickInterval !== null) {
                window.clearInterval(signal.modeTickInterval);
                signal.modeTickInterval = null;
            }
        }
    }

    private processSignalExtraction(runtime: P2PRuntime, dt: number, now: number): void {
        const signal = runtime.signal;
        if (!signal || !signal.drop || !signal.drop.landed) return;
        const players = [
            { player: runtime.state.host, signal: signal.players.get(runtime.state.host.id)!, teamId: 1 as const },
            { player: runtime.state.joiner, signal: signal.players.get(runtime.state.joiner.id)!, teamId: 2 as const },
        ];
        let anyProgressChanged = false;
        for (const entry of players) {
            if (!entry.player.alive) {
                if (entry.signal.extractProgressSec !== 0) anyProgressChanged = true;
                entry.signal.extractProgressSec = 0;
                continue;
            }
            const inRange = this.pointInsideRadius(entry.player.position, signal.drop.position, SIGNAL.EXTRACTION_RADIUS);
            if (!inRange) {
                if (entry.signal.extractProgressSec !== 0) anyProgressChanged = true;
                entry.signal.extractProgressSec = 0;
                continue;
            }
            if (!entry.signal.wantsExtract) continue;
            const stalled = now < entry.signal.extractStalledUntilMs;
            if (!stalled) {
                const before = entry.signal.extractProgressSec;
                entry.signal.extractProgressSec = Math.min(SIGNAL.EXTRACTION_SEC, entry.signal.extractProgressSec + dt);
                if (entry.signal.extractProgressSec !== before) anyProgressChanged = true;
            }
            if (entry.signal.extractProgressSec >= SIGNAL.EXTRACTION_SEC) {
                this.completeDropCapture(runtime, entry.player.id, entry.teamId);
                return;
            }
        }
        if (anyProgressChanged && now - signal.lastExtractBroadcastMs >= SIGNAL.EXTRACT_BROADCAST_MS) {
            signal.lastExtractBroadcastMs = now;
            for (const entry of players) {
                const pct = Math.round((entry.signal.extractProgressSec / SIGNAL.EXTRACTION_SEC) * 1000) / 1000;
                this.emitSignalReliableEvent(runtime, {
                    type: 'extraction_progress',
                    dropId: signal.drop.id,
                    playerId: entry.player.id as any,
                    teamId: entry.teamId as any,
                    pct,
                    stalled: now < entry.signal.extractStalledUntilMs,
                } as GameEvent);
            }
        }
    }

    private processCollapse(runtime: P2PRuntime, now: number, dt: number): void {
        const signal = runtime.signal;
        if (!signal) return;
        const elapsed = now - signal.matchStartedAtMs;
        const diff = Math.abs(signal.teamSignal[0] - signal.teamSignal[1]);
        const nearWin = signal.teamSignal[0] >= SIGNAL.TARGET * 0.9 && signal.teamSignal[1] >= SIGNAL.TARGET * 0.9;
        if (signal.collapseWarningAtMs === null && elapsed >= SIGNAL.COLLAPSE_TRIGGER_MS && (diff < 50 || nearWin)) {
            signal.collapseWarningAtMs = now;
            this.emitSignalReliableEvent(runtime, { type: 'collapse_warning', warningSeconds: Math.round(SIGNAL.COLLAPSE_WARNING_MS / 1000) } as GameEvent);
        }
        if (signal.collapseWarningAtMs !== null && signal.collapseActiveAtMs === null && now - signal.collapseWarningAtMs >= SIGNAL.COLLAPSE_WARNING_MS) {
            signal.collapseActiveAtMs = now;
            signal.goldenHardpointActive = true;
            signal.activeHardpointIndex = 3;
            signal.collapseRadius = SIGNAL.COLLAPSE_RADIUS_START;
            const hp = signal.hardpoints[3] ?? signal.hardpoints[0]!;
            this.emitSignalReliableEvent(runtime, { type: 'collapse_started', playAreaRadius: SIGNAL.COLLAPSE_RADIUS_START, shrinkDurationSec: Math.round(SIGNAL.COLLAPSE_SHRINK_DURATION_MS / 1000) } as GameEvent);
            this.emitSignalReliableEvent(runtime, { type: 'golden_hardpoint_spawned', hardpointId: hp.id, position: { ...hp.position }, radius: hp.radius } as GameEvent);
        }
        if (signal.collapseActiveAtMs !== null) {
            const t = clamp((now - signal.collapseActiveAtMs) / SIGNAL.COLLAPSE_SHRINK_DURATION_MS, 0, 1);
            signal.collapseRadius = SIGNAL.COLLAPSE_RADIUS_START + (SIGNAL.COLLAPSE_RADIUS_END - SIGNAL.COLLAPSE_RADIUS_START) * t;
            const hp = signal.hardpoints[3] ?? signal.hardpoints[0]!;
            this.applyCollapseDamage(runtime, hp.position, signal.collapseRadius, dt);
            if (!signal.goldenDropSpawnedAtMs && now - signal.collapseActiveAtMs >= SIGNAL.GOLDEN_DROP_DELAY_MS) {
                signal.goldenDropSpawnedAtMs = now;
                signal.drop = {
                    id: `golden_drop_${Math.floor(now)}`,
                    hardpointId: hp.id,
                    position: { ...hp.position },
                    ownerTeam: null,
                    contested: false,
                    landed: true,
                    golden: true,
                    rewardType: 'golden_signal',
                    spawnedAtMs: now,
                    landedAtMs: now,
                    extractionByPlayerId: {},
                };
                signal.scoreboardFrozen = true;
                this.emitSignalReliableEvent(runtime, { type: 'golden_drop_spawned', drop: cloneDropState(signal.drop), bonusSignal: SIGNAL.GOLDEN_SIGNAL_BONUS } as GameEvent);
                this.emitSignalReliableEvent(runtime, { type: 'drop_landed', drop: cloneDropState(signal.drop), scoreboardFrozen: true } as GameEvent);
            }
        }
    }

    private applyCollapseDamage(runtime: P2PRuntime, center: { x: number; y: number; z: number }, radius: number, dt: number): void {
        const damage = 20 * dt;
        if (damage <= 0) return;
        for (const player of [runtime.state.host, runtime.state.joiner]) {
            if (!player.alive) continue;
            if (this.pointInsideRadius(player.position, center, radius)) continue;
            this.applySignalDamage(runtime, 'environment', player.id, damage);
        }
    }

    private completeDropCapture(runtime: P2PRuntime, playerId: string, teamId: 1 | 2): void {
        const signal = runtime.signal;
        if (!signal || !signal.drop) return;
        const drop = signal.drop;
        if (drop.golden) {
            const idx = teamId === 1 ? 0 : 1;
            signal.teamSignal[idx] = Math.min(signal.targetSignal, signal.teamSignal[idx] + SIGNAL.GOLDEN_SIGNAL_BONUS);
            signal.goldenDropCaptured = true;
        }
        this.applySignalReward(runtime, drop.rewardType, teamId, playerId);
        const receipt: MatchReceipt = {
            mode: 'signal',
            matchId: `sig_${Math.floor(signal.matchStartedAtMs)}`,
            hostPlayerId: runtime.state.host.id as any,
            mintedBy: playerId as any,
            winnerTeam: (teamId as any),
            startedAtMs: signal.matchStartedAtMs,
            endedAtMs: performance.now(),
            teamSignal: [Math.round(signal.teamSignal[0]), Math.round(signal.teamSignal[1])],
            teamFragments: { team_1: signal.teamFragments[1], team_2: signal.teamFragments[2] },
            rewards: [{ rewardType: drop.rewardType, teamId: teamId as any, playerId: playerId as any, atMs: performance.now() }],
            eventCount: signal.eventLog.length,
        };
        signal.receipts.push(receipt);
        this.emitSignalReliableEvent(runtime, {
            type: 'drop_captured',
            drop: cloneDropState(drop),
            rewardType: drop.rewardType,
            mintedBy: playerId as any,
            receipt,
        } as GameEvent);
        signal.scoreboardFrozen = false;
        signal.drop = null;
        for (const state of signal.players.values()) {
            state.extractProgressSec = 0;
            state.wantsExtract = false;
        }
    }

    private applySignalReward(runtime: P2PRuntime, rewardType: SignalRewardType, teamId: 1 | 2, playerId: string): void {
        const signal = runtime.signal;
        if (!signal) return;
        const now = performance.now();
        const teamPlayers = [runtime.state.host, runtime.state.joiner].filter((p) => (p.id === runtime.state.host.id ? 1 : 2) === teamId);
        if (rewardType === 'team_overclock') {
            for (const p of teamPlayers) {
                const state = signal.players.get(p.id);
                if (state) state.overclockUntilMs = now + 20_000;
            }
            this.emitSignalReliableEvent(runtime, {
                type: 'signal_reward_applied',
                rewardType,
                teamId: teamId as any,
                buff: {
                    kind: 'team_overclock',
                    teamId: teamId as any,
                    startedAtMs: now,
                    expiresAtMs: now + 20_000,
                    moveSpeedMultiplier: 1.2,
                    reloadMultiplier: 0.7,
                },
            } as GameEvent);
            return;
        }
        if (rewardType === 'instant_ult_charge') {
            const pick = teamPlayers[Math.floor(Math.random() * teamPlayers.length)] ?? runtime.state.host;
            this.emitSignalReliableEvent(runtime, { type: 'signal_reward_applied', rewardType, teamId: teamId as any, playerId: pick.id as any } as GameEvent);
            return;
        }
        if (rewardType === 'overshield_pack') {
            const state = signal.players.get(playerId);
            if (state) state.overshield += 50;
            this.emitSignalReliableEvent(runtime, {
                type: 'signal_reward_applied',
                rewardType,
                teamId: teamId as any,
                playerId: playerId as any,
                buff: {
                    kind: 'overshield',
                    teamId: teamId as any,
                    playerId: playerId as any,
                    startedAtMs: now,
                    overshieldAmount: 50,
                },
            } as GameEvent);
            return;
        }
        if (rewardType === 'fragment_cache') {
            signal.teamFragments[teamId] += 50;
            this.emitSignalReliableEvent(runtime, { type: 'signal_reward_applied', rewardType, teamId: teamId as any, amount: 50 } as GameEvent);
            return;
        }
        if (rewardType === 'respawn_token') {
            const state = signal.players.get(playerId);
            if (state) state.respawnTokenUses += 1;
            this.emitSignalReliableEvent(runtime, {
                type: 'signal_reward_applied',
                rewardType,
                teamId: teamId as any,
                playerId: playerId as any,
                buff: {
                    kind: 'respawn_token',
                    teamId: teamId as any,
                    playerId: playerId as any,
                    startedAtMs: now,
                    usesRemaining: 1,
                },
            } as GameEvent);
            return;
        }
        if (rewardType === 'golden_signal') {
            this.emitSignalReliableEvent(runtime, {
                type: 'signal_reward_applied',
                rewardType,
                teamId: teamId as any,
                playerId: playerId as any,
                amount: SIGNAL.GOLDEN_SIGNAL_BONUS,
            } as GameEvent);
        }
    }

    private applySignalDamage(runtime: P2PRuntime, attackerId: string, targetId: string, amountRaw: number): void {
        const signal = runtime.signal;
        const signalMode = runtime.signalSoloMode;
        if (!signal && !signalMode) return;
        const amount = Math.max(0, amountRaw);
        if (amount <= 0) return;
        const target = targetId === runtime.state.host.id ? runtime.state.host : runtime.state.joiner;
        if (!target.alive) return;

        const distributions = signalMode
            ? signalMode.resolveIncomingDamage(attackerId, targetId, amount)
            : [{ playerId: targetId, damage: amount }];

        const damagedPlayers = new Set<string>();
        for (const split of distributions) {
            if (split.damage <= 0) continue;
            const victim = split.playerId === runtime.state.host.id ? runtime.state.host : runtime.state.joiner;
            if (!victim.alive) continue;
            damagedPlayers.add(victim.id);

            const signalState = signal?.players.get(victim.id);
            if (signalState) {
                signalState.extractStalledUntilMs = performance.now() + SIGNAL.EXTRACTION_STALL_MS;
            }
            if (signalMode) {
                signalMode.onPlayerDamaged(victim.id, split.damage);
            }

            let remaining = split.damage;
            if (signalMode) {
                remaining = signalMode.consumeIncomingDamage(victim.id, remaining);
            }
            if (signalState && signalState.overshield > 0) {
                const absorbed = Math.min(signalState.overshield, remaining);
                signalState.overshield -= absorbed;
                remaining -= absorbed;
            }
            if (remaining > 0) {
                victim.health = Math.max(0, victim.health - remaining);
            }
            this.handleServerMessage({
                type: 'damage_applied',
                targetId: victim.id,
                attackerId,
                amount: split.damage,
                healthAfter: victim.health,
            } as any);
        }

        for (const playerId of damagedPlayers) {
            const victim = playerId === runtime.state.host.id ? runtime.state.host : runtime.state.joiner;
            if (victim.health > 0) continue;
            this.processSignalDeath(runtime, attackerId, victim.id);
        }
    }

    private processSignalDeath(runtime: P2PRuntime, attackerId: string, victimId: string): void {
        const signal = runtime.signal;
        const signalMode = runtime.signalSoloMode;
        const host = runtime.state.host;
        const joiner = runtime.state.joiner;
        const victim = victimId === host.id ? host : joiner;
        const killer = attackerId === host.id ? host : attackerId === joiner.id ? joiner : null;
        victim.alive = false;
        victim.deaths += 1;
        if (killer) killer.kills += 1;
        if (signalMode) {
            signalMode.onPlayerDeath(victim.id);
        }
        if (!signal) {
            this.handleServerMessage({
                type: 'player_died',
                victimId: victim.id,
                killerId: killer?.id ?? victim.id,
                killerScore: killer?.kills ?? 0,
            } as any);
            window.setTimeout(() => {
                victim.alive = true;
                victim.health = P2P.PLAYER_MAX_HEALTH;
                this.handleServerMessage({
                    type: 'event',
                    event: {
                        type: 'player_spawned',
                        entityId: this.getP2PEntityId(runtime, victim.id) as any,
                        position: victim.position as any,
                    },
                    tick: tick(0 as any),
                } as any);
            }, 3000);
            return;
        }
        this.emitSignalReliableEvent(runtime, {
            type: 'player_died',
            entityId: this.getP2PEntityId(runtime, victim.id) as any,
            killerId: killer ? (this.getP2PEntityId(runtime, killer.id) as any) : null,
            weapon: 'smg',
        } as GameEvent);
        this.handleServerMessage({
            type: 'player_died',
            victimId: victim.id,
            killerId: killer?.id ?? victim.id,
            killerScore: killer?.kills ?? 0,
        } as any);
        if (signalMode && victim.alive) {
            victim.health = P2P.PLAYER_MAX_HEALTH;
            this.emitSignalReliableEvent(runtime, {
                type: 'player_spawned',
                entityId: this.getP2PEntityId(runtime, victim.id) as any,
                position: victim.position as any,
            } as GameEvent);
            return;
        }
        const victimSignal = signal.players.get(victim.id);
        if (victimSignal) {
            victimSignal.extractProgressSec = 0;
            victimSignal.wantsExtract = false;
            if (victimSignal.respawnTokenUses > 0) {
                victimSignal.respawnTokenUses -= 1;
                victim.alive = true;
                victim.health = P2P.PLAYER_MAX_HEALTH;
                this.emitSignalReliableEvent(runtime, {
                    type: 'player_spawned',
                    entityId: this.getP2PEntityId(runtime, victim.id) as any,
                    position: victim.position as any,
                } as GameEvent);
                return;
            }
        }
        window.setTimeout(() => {
            if (this.p2p !== runtime) return;
            victim.alive = true;
            victim.health = P2P.PLAYER_MAX_HEALTH;
            const respawnPoints = runtime.signalSoloSpawnPoints;
            victim.position = victim.id === host.id
                ? { ...(respawnPoints?.[1] ?? { x: -8, y: 3, z: -8 }) }
                : { ...(respawnPoints?.[2] ?? { x: 8, y: 3, z: 8 }) };
            this.emitSignalReliableEvent(runtime, {
                type: 'player_spawned',
                entityId: this.getP2PEntityId(runtime, victim.id) as any,
                position: victim.position as any,
            } as GameEvent);
        }, 3000);
    }

    private pointInsideRadius(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, radius: number): boolean {
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        return (dx * dx + dz * dz) <= (radius * radius);
    }

    private updateP2PRemotePose(runtime: P2PRuntime, pose: any): void {
        if (!pose?.position) return;
        const prev = { ...runtime.state.joiner.position };
        runtime.state.joiner.position = {
            x: Number(pose.position.x ?? 0),
            y: Number(pose.position.y ?? 0),
            z: Number(pose.position.z ?? 0),
        };
        runtime.state.joiner.rotation = {
            x: Number(pose.rotation?.x ?? 0),
            y: Number(pose.rotation?.y ?? 0),
            z: Number(pose.rotation?.z ?? 0),
            w: Number(pose.rotation?.w ?? 1),
        };
        this.pushPoseHistory(runtime, runtime.state.joiner.id, runtime.state.joiner.position, performance.now());
        const velocity = {
            x: runtime.state.joiner.position.x - prev.x,
            y: runtime.state.joiner.position.y - prev.y,
            z: runtime.state.joiner.position.z - prev.z,
        };
        const message: ServerMessage = {
            type: 'event',
            event: {
                type: 'net_pose',
                playerId: runtime.state.joiner.id as any,
                position: runtime.state.joiner.position as any,
                rotation: runtime.state.joiner.rotation as any,
                velocity: velocity as any,
                tick: tick(0 as any),
            } as any,
            tick: tick(0 as any) as any,
        };
        this.handleServerMessage(message);
        this.sendP2PPacket(runtime, wrapP2PServerEvent(message));
        const joinerEntityId = this.getP2PEntityId(runtime, runtime.state.joiner.id);
        const joinerAiming = Boolean(pose?.isAiming);
        const aimMessage: ServerMessage = {
            type: 'event',
            event: {
                type: 'aim_state',
                sourceId: joinerEntityId as any,
                isAiming: joinerAiming,
            } as any,
            tick: 0 as any,
        };
        this.handleServerMessage(aimMessage);
        this.sendP2PPacket(runtime, wrapP2PServerEvent(aimMessage));
        const joinerAnim = pose?.animation;
        if (joinerAnim && typeof joinerAnim.locomotion === 'string') {
            const animMessage: ServerMessage = {
                type: 'event',
                event: {
                    type: 'p2p_anim_state',
                    sourceId: joinerEntityId as any,
                    locomotion: joinerAnim.locomotion,
                    isSliding: Boolean(joinerAnim.isSliding),
                } as any,
                tick: tick(0 as any) as any,
            };
            this.handleServerMessage(animMessage);
            this.sendP2PPacket(runtime, wrapP2PServerEvent(animMessage));
        }
    }

    private applyP2PFullSync(runtime: P2PRuntime, event: any): void {
        const state = event?.state as P2PMatchState | undefined;
        if (!state) return;
        const previousLocal = runtime.state.host.id === runtime.localPlayerId ? runtime.state.host : runtime.state.joiner;
        runtime.state = state;
        const local = state.host.id === runtime.localPlayerId ? state.host : state.joiner;
        const remote = state.host.id === runtime.localPlayerId ? state.joiner : state.host;
        this.bridge.updateState({
            health: local.health,
            isDead: !local.alive,
            kills: local.kills,
            deaths: local.deaths,
            teamScores: { 1: state.host.kills, 2: state.joiner.kills },
        });
        const dx = local.position.x - previousLocal.position.x;
        const dy = local.position.y - previousLocal.position.y;
        const dz = local.position.z - previousLocal.position.z;
        const driftSq = dx * dx + dy * dy + dz * dz;
        // Avoid constant micro-corrections on joiner; only correct meaningful drift.
        if (driftSq > 1.0) {
            this.bridge.applyServerCorrection(local.position as any);
        }
        this.pushPoseHistory(runtime, local.id, local.position, performance.now());
        this.pushPoseHistory(runtime, remote.id, remote.position, performance.now());
        this.bridge.processNetPose({
            type: 'net_pose',
            playerId: remote.id as any,
            position: remote.position as any,
            rotation: remote.rotation as any,
            tick: tick(0 as any) as any,
        } as any);
    }

    private pushPoseHistory(runtime: P2PRuntime, playerId: string, position: { x: number; y: number; z: number }, atMs: number = performance.now()): void {
        const history = runtime.poseHistoryByPlayerId.get(playerId) ?? [];
        history.push({ t: atMs, x: position.x, y: position.y, z: position.z });
        const cutoff = atMs - 1200;
        while (history.length > 0 && history[0]!.t < cutoff) {
            history.shift();
        }
        runtime.poseHistoryByPlayerId.set(playerId, history);
    }

    private getRewoundPosition(runtime: P2PRuntime, playerId: string, rewindMs: number): { x: number; y: number; z: number } | null {
        const history = runtime.poseHistoryByPlayerId.get(playerId);
        if (!history || history.length === 0) return null;
        const targetTime = performance.now() - rewindMs;
        let best = history[0]!;
        for (const sample of history) {
            if (sample.t > targetTime) break;
            best = sample;
        }
        return { x: best.x, y: best.y, z: best.z };
    }

    private applyP2PMovePacket(runtime: P2PRuntime, move: any, playerId: string, isJoinerMove: boolean): void {
        if (move.sequence <= runtime.lastRemoteMoveSequence) return;
        runtime.lastRemoteMoveSequence = move.sequence;

        const player = isJoinerMove ? runtime.state.joiner : runtime.state.host;
        const maxStep = 1.6;
        const dx = clamp(Number(move.dx ?? 0), -maxStep, maxStep);
        const dy = clamp(Number(move.dy ?? 0), -maxStep, maxStep);
        const dz = clamp(Number(move.dz ?? 0), -maxStep, maxStep);
        player.position = {
            x: player.position.x + dx,
            y: player.position.y + dy,
            z: player.position.z + dz,
        };
        player.rotation = {
            x: Number(move.qx ?? 0),
            y: Number(move.qy ?? 0),
            z: Number(move.qz ?? 0),
            w: Number(move.qw ?? 1),
        };

        const velocity = {
            x: Number(move.vx ?? 0),
            y: Number(move.vy ?? 0),
            z: Number(move.vz ?? 0),
        };
        this.pushPoseHistory(runtime, playerId, player.position, performance.now());
        this.bridge.processNetPose({
            type: 'net_pose',
            playerId: playerId as any,
            position: player.position as any,
            rotation: player.rotation as any,
            velocity: velocity as any,
            tick: tick(0 as any),
        } as any);

        const sourceId = this.getP2PEntityId(runtime, playerId);
        this.bridge.emitGameEvent({
            type: 'aim_state',
            sourceId: sourceId as any,
            isAiming: (Number(move.flags ?? 0) & P2PMoveFlags.Aiming) !== 0,
        } as any);
        this.bridge.emitGameEvent({
            type: 'p2p_anim_state',
            sourceId: sourceId as any,
            locomotion: fromLocomotionCode(Number(move.locomotion ?? 0)),
            isSliding: (Number(move.flags ?? 0) & P2PMoveFlags.Sliding) !== 0,
        } as any);
    }

    private applyIncomingP2PHit(runtime: P2PRuntime, hit: any): void {
        const host = runtime.state.host;
        const joiner = runtime.state.joiner;
        const attacker = Number(hit.attackerRole ?? 0) === 0 ? host : joiner;
        const victim = Number(hit.victimRole ?? 1) === 0 ? host : joiner;
        victim.health = Math.max(0, Number(hit.healthAfter ?? victim.health));
        if (victim.health <= 0) {
            victim.alive = false;
        }

        this.handleServerMessage({
            type: 'damage_applied',
            targetId: victim.id,
            attackerId: attacker.id,
            amount: Number(hit.damage ?? P2P.DAMAGE_PER_HIT),
            healthAfter: victim.health,
        } as any);

        this.bridge.emitGameEvent({
            type: 'p2p_hit_vfx',
            position: {
                x: Number(hit.hitPosition?.x ?? victim.position.x),
                y: Number(hit.hitPosition?.y ?? (victim.position.y + 1.2)),
                z: Number(hit.hitPosition?.z ?? victim.position.z),
            },
            normal: { x: 0, y: 1, z: 0 },
        } as any);
    }

    private applyIncomingP2PVfx(runtime: P2PRuntime, vfx: any, sourcePlayerId: string): void {
        const sourceId = this.getP2PEntityId(runtime, sourcePlayerId);
        const position = {
            x: Number(vfx.position?.x ?? 0),
            y: Number(vfx.position?.y ?? 0),
            z: Number(vfx.position?.z ?? 0),
        };
        const direction = {
            x: Number(vfx.direction?.x ?? 0),
            y: Number(vfx.direction?.y ?? 0),
            z: Number(vfx.direction?.z ?? 1),
        };

        if (Number(vfx.vfxType) === P2PVfxType.Muzzle) {
            this.bridge.emitGameEvent({
                type: 'shot_fired',
                sourceId: sourceId as any,
                origin: position as any,
                direction: direction as any,
                weapon: 'smg',
            } as any);
            return;
        }

        this.bridge.emitGameEvent({
            type: 'p2p_hit_vfx',
            position: position as any,
            normal: direction as any,
        } as any);
    }

    private processP2PShot(runtime: P2PRuntime, shooterId: string, shot: any): void {
        const host = runtime.state.host;
        const joiner = runtime.state.joiner;
        const shooter = shooterId === host.id ? host : joiner;
        const target = shooterId === host.id ? joiner : host;
        if (!shooter.alive || !target.alive || !shot?.origin || !shot?.dir) return;
        const weaponModelId = typeof shot?.weaponModelId === 'string' && shot.weaponModelId
            ? shot.weaponModelId
            : this.selectedWeaponModelId;
        const weaponDamage = P2P_WEAPON_DAMAGE_BY_MODEL_ID[weaponModelId] ?? P2P.DAMAGE_PER_HIT;
        const normalizedDir = this.normalizeDir(shot.dir);
        if (!normalizedDir) return;
        const shotOrigin = this.resolveP2PShotOrigin(shooter.position, shot.origin, normalizedDir);

        const shooterEntityId = this.getP2PEntityId(runtime, shooter.id);
        const shotEvent: ServerMessage = {
            type: 'event',
            event: {
                type: 'shot_fired',
                sourceId: shooterEntityId as any,
                origin: shotOrigin as any,
                direction: normalizedDir as any,
                weapon: weaponModelId,
            } as any,
            tick: 0 as any,
        };
        this.handleServerMessage(shotEvent);
        this.sendP2PPacket(runtime, createVfxPayload({
            sentAt: performance.now(),
            vfxType: P2PVfxType.Muzzle,
            position: shotOrigin,
            direction: normalizedDir,
        }));
        if (shooter.id !== runtime.localPlayerId) {
            this.applyIncomingP2PVfx(runtime, {
                vfxType: P2PVfxType.Muzzle,
                position: shotOrigin,
                direction: normalizedDir,
            }, shooter.id);
        }

        const rewindMs = clamp(runtime.lastPongRttMs * 0.5, 0, 120);
        const rewoundTargetPos = this.getRewoundPosition(runtime, target.id, rewindMs) ?? target.position;
        if (!this.rayHitsPlayer(shotOrigin, normalizedDir, rewoundTargetPos, P2P.PLAYER_RADIUS)) return;

        const hitPosition = {
            x: rewoundTargetPos.x,
            y: rewoundTargetPos.y + 1.2,
            z: rewoundTargetPos.z,
        };
        if (runtime.matchMode === 'signal') {
            this.applySignalDamage(runtime, shooter.id, target.id, weaponDamage);
        } else {
            target.health = Math.max(0, target.health - weaponDamage);
            const damageMessage: ServerMessage = {
                type: 'damage_applied',
                targetId: target.id,
                attackerId: shooter.id,
                amount: weaponDamage,
                healthAfter: target.health,
            };
            this.handleServerMessage(damageMessage);
        }
        this.sendP2PPacket(runtime, createHitPayload({
            sentAt: performance.now(),
            attackerRole: shooter.id === host.id ? 0 : 1,
            victimRole: target.id === host.id ? 0 : 1,
            damage: weaponDamage,
            healthAfter: target.health,
            killed: target.health <= 0,
            hitPosition,
        }));
        this.sendP2PPacket(runtime, createVfxPayload({
            sentAt: performance.now(),
            vfxType: P2PVfxType.Hit,
            position: hitPosition,
            direction: { x: 0, y: 1, z: 0 },
        }));

        if (runtime.matchMode === 'signal') {
            return;
        }

        if (target.health > 0) return;
        target.alive = false;
        target.deaths += 1;
        shooter.kills += 1;
        this.mirrorDuelAuthorityKill(runtime, shooter.id);

        const deathMessage: ServerMessage = {
            type: 'player_died',
            victimId: target.id,
            killerId: shooter.id,
            killerScore: shooter.kills,
        };
        const scoreMessage: ServerMessage = {
            type: 'score_update',
            scores: {
                team_1: host.kills,
                team_2: joiner.kills,
                [host.id]: host.kills,
                [joiner.id]: joiner.kills,
            },
            targetScore: 10,
        };
        this.handleServerMessage(deathMessage);
        this.handleServerMessage(scoreMessage);
        this.sendP2PPacket(runtime, wrapP2PServerEvent(deathMessage));
        this.sendP2PPacket(runtime, wrapP2PServerEvent(scoreMessage));

        if (shooter.kills >= P2P.TARGET_SCORE) {
            const endMessage: ServerMessage = {
                type: 'match_ended',
                winnerId: shooter.id,
                scores: {
                    team_1: host.kills,
                    team_2: joiner.kills,
                    [host.id]: host.kills,
                    [joiner.id]: joiner.kills,
                },
                targetScore: 10,
            };
            this.finalizeDuelAuthority(runtime, shooter.id);
            this.handleServerMessage(endMessage);
            this.sendP2PPacket(runtime, wrapP2PServerEvent(endMessage));
            return;
        }

        window.setTimeout(() => {
            target.alive = true;
            target.health = P2P.PLAYER_MAX_HEALTH;
            target.position = target.id === host.id ? { x: -8, y: 3, z: -8 } : { x: 8, y: 3, z: 8 };
            const spawnMessage: ServerMessage = {
                type: 'event',
                event: {
                    type: 'player_spawned',
                    entityId: target.id === host.id ? (1001 as any) : (1002 as any),
                    position: target.position as any,
                } as any,
                tick: tick(0 as any) as any,
            };
            this.handleServerMessage(spawnMessage);
            this.sendP2PPacket(runtime, wrapP2PServerEvent(spawnMessage));
        }, 3000);
    }

    private rayHitsPlayer(
        origin: { x: number; y: number; z: number },
        dir: { x: number; y: number; z: number },
        target: { x: number; y: number; z: number },
        radius: number
    ): boolean {
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
        if (len < 1e-6) return false;
        const nx = dir.x / len;
        const ny = dir.y / len;
        const nz = dir.z / len;

        // Approximate player collision with body + head spheres (host authoritative).
        const n = { x: nx, y: ny, z: nz };
        const centers = [
            { x: target.x, y: target.y, z: target.z },
            { x: target.x, y: target.y + 0.9, z: target.z },
            { x: target.x, y: target.y + 1.6, z: target.z },
        ];
        const radii = [Math.max(0.9, radius), Math.max(0.75, radius), 0.3];
        for (let i = 0; i < centers.length; i++) {
            if (this.raySphereIntersection(origin, n, centers[i]!, radii[i]!) !== null) {
                return true;
            }
        }
        return false;
    }

    private raySphereIntersection(
        origin: { x: number; y: number; z: number },
        dir: { x: number; y: number; z: number },
        center: { x: number; y: number; z: number },
        radius: number
    ): number | null {
        const ox = origin.x - center.x;
        const oy = origin.y - center.y;
        const oz = origin.z - center.z;
        const b = ox * dir.x + oy * dir.y + oz * dir.z;
        const c = ox * ox + oy * oy + oz * oz - radius * radius;
        const disc = b * b - c;
        if (disc < 0) return null;
        const sqrtDisc = Math.sqrt(disc);
        const t1 = -b - sqrtDisc;
        const t2 = -b + sqrtDisc;
        if (t1 >= 0) return t1;
        if (t2 >= 0) return t2;
        return null;
    }

    private normalizeDir(dir: { x: number; y: number; z: number } | undefined): { x: number; y: number; z: number } | null {
        if (!dir) return null;
        const x = Number(dir.x ?? 0);
        const y = Number(dir.y ?? 0);
        const z = Number(dir.z ?? 0);
        const len = Math.sqrt(x * x + y * y + z * z);
        if (len < 1e-6) return null;
        return { x: x / len, y: y / len, z: z / len };
    }

    private resolveP2PShotOrigin(
        shooterPosition: { x: number; y: number; z: number },
        reportedOrigin: { x: number; y: number; z: number } | undefined,
        dir: { x: number; y: number; z: number }
    ): { x: number; y: number; z: number } {
        const anchor = {
            x: Number(shooterPosition.x ?? 0),
            y: Number(shooterPosition.y ?? 0) + 1.35,
            z: Number(shooterPosition.z ?? 0),
        };
        if (!reportedOrigin) return anchor;
        const ox = Number(reportedOrigin.x ?? anchor.x);
        const oy = Number(reportedOrigin.y ?? anchor.y);
        const oz = Number(reportedOrigin.z ?? anchor.z);
        const dx = ox - anchor.x;
        const dy = oy - anchor.y;
        const dz = oz - anchor.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        // Keep remote tracer origin close to replicated model to avoid obvious offsets.
        if (distSq > 4.0) {
            return {
                x: anchor.x + dir.x * 0.35,
                y: anchor.y + dir.y * 0.35,
                z: anchor.z + dir.z * 0.35,
            };
        }
        return { x: ox, y: oy, z: oz };
    }

    private getP2PEntityId(runtime: P2PRuntime, playerId: string): number {
        return playerId === runtime.state.host.id ? 1001 : 1002;
    }

    private teardownP2P(resetStatus: boolean): void {
        this.teardownSignal4v4(false);
        if (this.p2p) {
            const signalRuntime = this.p2p.signal;
            if (this.p2p.pingInterval !== null) window.clearInterval(this.p2p.pingInterval);
            if (this.p2p.fullSyncInterval !== null) window.clearInterval(this.p2p.fullSyncInterval);
            if (this.p2p.preRoundTimeout !== null) window.clearTimeout(this.p2p.preRoundTimeout);
            if (this.p2p.hostHeartbeatInterval !== null) window.clearInterval(this.p2p.hostHeartbeatInterval);
            if (this.p2p.telemetryInterval !== null) window.clearInterval(this.p2p.telemetryInterval);
            if (signalRuntime?.modeTickInterval !== null && signalRuntime?.modeTickInterval !== undefined) window.clearInterval(signalRuntime.modeTickInterval);
            if (signalRuntime?.reliableResendInterval !== null && signalRuntime?.reliableResendInterval !== undefined) window.clearInterval(signalRuntime.reliableResendInterval);
            this.p2p.signalP2PVisualHardpointManager?.dispose();
            if (this.p2p.role === 'host' && this.p2p.serverRoomRegistered) {
                this.channel.emit('p2p_release_room', { code: this.p2p.code });
            }
            this.p2p.transport.disconnect();
            this.p2p = null;
        }
        this.mode = 'socket';
        if (this.signalAuthorityUnsubscribe) {
            this.signalAuthorityUnsubscribe();
            this.signalAuthorityUnsubscribe = null;
        }
        this.signalAuthoritySnapClient = null;
        this.signalAuthorityErClient = null;
        this.signalAuthorityLastCommitAtMs = 0;
        this.signalAuthoritySessionId += 1;
        this.signalAuthorityMatchId = null;
        this.signalAuthorityDelegated = false;
        this.signalAuthorityLastCommitSignature = null;
        this.pendingSignalAuthorityFinalize = null;
        this.signalAuthorityDispatchChain = Promise.resolve();
        this.activeMatchmadeP2PCode = null;
        this.bridge.updateState({
            signalAuthorityMatchId: null,
            signalAuthorityDelegated: false,
            signalAuthorityLastCommitSignature: this.signalAuthorityLastCommitSignature,
            signalAuthorityLatestCommitSeq: 0,
        } as any);
        if (resetStatus) this.setP2PStatus({ phase: 'idle' });
    }

    private async requestServerAck<TResponse = any>(event: string, data: unknown, timeoutMs: number = 4000): Promise<TResponse> {
        if (!this.channel.connected) {
            throw new Error('Server connection required for P2P room operations.');
        }
        return this.channel.emitWithAck<TResponse>(event, data, timeoutMs);
    }

    private getLocalPlayerIdForMessages(): string | undefined {
        if (this.mode === 'socket') return this.channel.id;
        if (this.signal4v4) return this.signal4v4.localPlayerId;
        return this.p2p?.localPlayerId ?? undefined;
    }

    private handleServerMessage(message: ServerMessage): void {
        if (message.type === 'event') {
            if (message.event?.type === 'net_pose') {
                this.bridge.processNetPose(message.event as any);
                return;
            }
            if (message.event?.type === 'player_spawned') {
                const localEntityId = this.bridge.getState().localPlayerEntityId;
                if (localEntityId && message.event.entityId === localEntityId) {
                    this.bridge.updateState({ isDead: false, respawnTimeRemaining: 0, health: P2P.PLAYER_MAX_HEALTH });
                }
            }
            this.bridge.emitGameEvent(message.event as any);
            return;
        }

        const localId = this.getLocalPlayerIdForMessages();

        if (message.type === 'damage_applied') {
            if (message.attackerId === localId) {
                this.bridge.showHitMarker(false);
            }
            const isLocalTarget = message.targetId === localId;
            if (isLocalTarget) {
                const isDead = message.healthAfter <= 0;
                this.bridge.updateState({
                    health: message.healthAfter,
                    isDead,
                    respawnTimeRemaining: isDead ? 3 : this.bridge.getState().respawnTimeRemaining,
                });
            }
            const targetEntityId = this.bridge.getEntityIdForPlayerId(message.targetId as any);
            const attackerEntityId = this.bridge.getEntityIdForPlayerId(message.attackerId as any);
            if (targetEntityId && !isLocalTarget) {
                this.bridge.emitGameEvent({
                    type: 'damage_taken',
                    targetId: targetEntityId as any,
                    direction: { x: 0, y: 0, z: 0 },
                    damage: message.amount,
                    remainingHealth: message.healthAfter,
                    remainingShield: 0,
                });
            }
            if (attackerEntityId && targetEntityId) {
                this.bridge.emitGameEvent({
                    type: 'damage_dealt',
                    targetId: targetEntityId as any,
                    sourceId: attackerEntityId as any,
                    amount: message.amount,
                    weapon: 'smg',
                });
            }
            return;
        }

        if (message.type === 'player_died') {
            if (message.killerId === localId) {
                this.bridge.updateState({ kills: this.bridge.getState().kills + 1 });
            }
            if (message.victimId === localId) {
                this.bridge.updateState({ deaths: this.bridge.getState().deaths + 1, isDead: true, respawnTimeRemaining: 3 });
            }
            this.bridge.addKillFeedByPlayerIds(message.killerId as any, message.victimId as any, 'smg');
            this.bridge.emitPlayerDeathByPlayerId(message.victimId as any, message.killerId as any);
            return;
        }

        if (message.type === 'score_update') {
            const lobby = this.bridge.getLobbyState();
            const localTeamId = lobby?.players.find((player) => player.playerId === localId)?.team ?? 1;
            const otherTeamId = localTeamId === 1 ? 2 : 1;
            const localKills = localId ? (message.scores[localId] ?? this.bridge.getState().kills) : this.bridge.getState().kills;
            const teamScoreA = message.scores[`team_${localTeamId}`];
            const teamScoreB = message.scores[`team_${otherTeamId}`];
            const opponentId = this.bridge.getMatchData()?.opponent;
            const opponentKills = opponentId ? (message.scores[opponentId] ?? 0) : 0;
            this.bridge.updateState({
                kills: localKills,
                teamScores: {
                    1: typeof teamScoreA === 'number' ? teamScoreA : localKills,
                    2: typeof teamScoreB === 'number' ? teamScoreB : opponentKills,
                },
            });
            return;
        }

        if (message.type === 'match_ended') {
            const lobby = this.bridge.getLobbyState();
            const localTeamId = lobby?.players.find((player) => player.playerId === localId)?.team ?? 1;
            const youWon = !!localId && (
                message.winnerId === localId ||
                message.winnerId === `team_${localTeamId}`
            );
            this.bridge.notifyGameMessage(youWon ? 'Victory! Target score reached.' : 'Defeat. Enemy team reached target score.', youWon ? 'success' : 'warning');
            this.bridge.updateState({
                isGameOver: true,
                winnerName: message.winnerId,
            });
            if (this.matchEndTimeout) {
                window.clearTimeout(this.matchEndTimeout);
            }
            this.matchEndTimeout = window.setTimeout(() => {
                if (this.mode === 'socket') {
                    this.channel.emit('leave_match', {});
                } else {
                    this.teardownTdm4v4(false);
                    this.teardownSignal4v4(false);
                    this.teardownP2P(true);
                    this.resetPublicMatchmaking(true);
                }
                this.bridge.updateState({ isRunning: false });
                this.matchEndTimeout = null;
            }, 5000);
        }
    }

    private emitAuthAndLobbyRequest(): void {
        if (!this.walletPublicKey) return;
        this.channel.emit('auth', { publicKey: this.walletPublicKey, displayName: this.walletDisplayName });
        this.channel.emit('get_lobby_state', {});
        this.channel.emit('get_social_state', {});
    }

    async sendFriendRequest(toPlayerId: string): Promise<any> {
        return this.requestServerAck('friend_request_send', { toPlayerId }, 5000);
    }

    async acceptFriendRequest(fromPlayerId: string): Promise<any> {
        return this.requestServerAck('friend_request_accept', { fromPlayerId }, 5000);
    }

    async declineFriendRequest(fromPlayerId: string): Promise<any> {
        return this.requestServerAck('friend_request_decline', { fromPlayerId }, 5000);
    }

    async removeFriend(friendId: string): Promise<any> {
        return this.requestServerAck('friend_remove', { friendId }, 5000);
    }

    async createParty(): Promise<any> {
        return this.requestServerAck('party_create', {}, 5000);
    }

    async leaveParty(): Promise<any> {
        return this.requestServerAck('party_leave', {}, 5000);
    }

    async sendPartyInvite(toPlayerId: string): Promise<any> {
        return this.requestServerAck('party_invite_send', { toPlayerId }, 5000);
    }

    async respondPartyInvite(inviteId: string, accept: boolean): Promise<any> {
        return this.requestServerAck('party_invite_respond', { inviteId, accept }, 5000);
    }

    sendInput(input: InputFrame): void {
        if (this.tdm4v4) {
            const runtime = this.tdm4v4;
            const local = runtime.players.get(runtime.localPlayerId);
            if (local) {
                local.lastInput = input;
                local.lastInputSeq = Math.max(local.lastInputSeq, Number(input.sequence ?? -1));
                if (input.weaponSlot >= 0) {
                    local.activeWeaponSlot = input.weaponSlot === 1 ? 1 : 0;
                }
            }
            if (runtime.role === 'client' && runtime.clientTransport) {
                const now = performance.now();
                if ((now - runtime.lastInputSentAtMs) < (1000 / runtime.config.inputRateHz)) return;
                runtime.lastInputSentAtMs = now;
                const payload = wrapP2PInput(input);
                runtime.clientTransport.send(payload);
                runtime.bytesOutWindow += payload.byteLength;
                runtime.debug.sendBacklogBytes = runtime.clientTransport.getBufferedAmount();
            }
            return;
        }
        if (this.signal4v4) {
            const runtime = this.signal4v4;
            const wantsExtract = Boolean(input.interact || input.tactical);
            const local = runtime.players.get(runtime.localPlayerId);
            if (local) local.wantsExtract = wantsExtract;
            runtime.signalMode?.setPlayerInteractIntent(runtime.localPlayerId, wantsExtract);
            if (runtime.role === 'client' && runtime.clientTransport) {
                runtime.clientTransport.send(wrapP2PClientEvent({
                    type: 'sig4_interact',
                    interacting: wantsExtract,
                }));
            }
            return;
        }
        if (this.mode === 'socket') {
            if (!this.channel.connected) return;
            const inputData: ArrayBuffer = serializeInput(input);
            this.channel.emit('bin', wrapBinaryMessage(BinaryMessageType.Input, inputData));
            return;
        }
        if (this.mode === 'p2p_joiner' && this.p2p?.connected) {
            this.p2p.transport.send(wrapP2PInput(input));
            return;
        }
        if (this.mode === 'p2p_host' && this.p2p?.matchMode === 'signal') {
            if (this.p2p.signalSoloMode?.getMatchFlowState() !== 'LIVE') {
                return;
            }
            const wantsExtract = Boolean(input.interact || input.tactical);
            if (this.p2p.signal) {
                const localSignal = this.p2p.signal.players.get(this.p2p.localPlayerId);
                if (localSignal) {
                    localSignal.wantsExtract = wantsExtract;
                }
            }
            if (this.p2p.signalSoloMode) {
                this.p2p.signalSoloMode.setPlayerInteractIntent(this.p2p.localPlayerId, wantsExtract);
            }
        }
    }

    sendPose(pose: { position: { x: number; y: number; z: number }; velocity?: { x: number; y: number; z: number }; rotation?: { x: number; y: number; z: number; w: number }; isGrounded?: boolean; timeMs?: number; animation?: { locomotion: string; isSliding?: boolean } }): void {
        if (this.tdm4v4) {
            const runtime = this.tdm4v4;
            const local = runtime.players.get(runtime.localPlayerId);
            if (!local) return;
            local.localPose = {
                position: { ...pose.position },
                velocity: { ...(pose.velocity ?? { x: 0, y: 0, z: 0 }) },
                rotation: { ...(pose.rotation ?? { x: 0, y: 0, z: 0, w: 1 }) },
                isGrounded: Boolean(pose.isGrounded),
                atMs: performance.now(),
            };
            local.position = { ...local.localPose.position };
            local.velocity = { ...local.localPose.velocity };
            local.rotation = { ...local.localPose.rotation };
            local.isGrounded = local.localPose.isGrounded;
            return;
        }
        if (this.signal4v4) {
            const runtime = this.signal4v4;
            const local = runtime.players.get(runtime.localPlayerId);
            if (!local) return;
            const now = performance.now();
            local.position = { ...pose.position };
            local.rotation = { ...(pose.rotation ?? { x: 0, y: 0, z: 0, w: 1 }) };
            local.velocity = { ...(pose.velocity ?? { x: 0, y: 0, z: 0 }) };
            if (runtime.role === 'client' && runtime.clientTransport) {
                if ((now - local.lastPoseAtMs) < SIGNAL4V4_POSE_SEND_MS) return;
                local.lastPoseAtMs = now;
                const previousSent = local.lastSentPosition;
                let flags = 0;
                if (this.bridge.getState().isAiming) flags |= P2PMoveFlags.Aiming;
                if (pose.isGrounded) flags |= P2PMoveFlags.Grounded;
                if (pose.animation?.isSliding) flags |= P2PMoveFlags.Sliding;
                runtime.clientTransport.send(createMovePayload({
                    sequence: ++runtime.moveSequence,
                    sentAt: now,
                    dx: local.position.x - previousSent.x,
                    dy: local.position.y - previousSent.y,
                    dz: local.position.z - previousSent.z,
                    vx: Number(local.velocity.x ?? 0),
                    vy: Number(local.velocity.y ?? 0),
                    vz: Number(local.velocity.z ?? 0),
                    qx: local.rotation.x,
                    qy: local.rotation.y,
                    qz: local.rotation.z,
                    qw: local.rotation.w,
                    flags,
                    locomotion: toLocomotionCode(pose.animation?.locomotion),
                }));
                local.lastSentPosition = { ...local.position };
            }
            return;
        }
        if (this.mode === 'socket') {
            if (!this.channel.connected) return;
            this.channel.emit('pose', pose);
            return;
        }

        const runtime = this.p2p;
        if (!runtime?.connected) return;
        const now = performance.now();
        if (now - runtime.lastPoseSentAtMs < P2P.MOVE_TICK_MS) return;
        runtime.lastPoseSentAtMs = now;
        const local = runtime.role === 'host' ? runtime.state.host : runtime.state.joiner;
        const previous = { ...local.position };
        local.position = { ...pose.position };
        local.rotation = { ...(pose.rotation ?? { x: 0, y: 0, z: 0, w: 1 }) };
        this.pushPoseHistory(runtime, local.id, local.position, now);

        let flags = 0;
        if (this.bridge.getState().isAiming) flags |= P2PMoveFlags.Aiming;
        if (pose.isGrounded) flags |= P2PMoveFlags.Grounded;
        if (pose.animation?.isSliding) flags |= P2PMoveFlags.Sliding;

        const locomotion = toLocomotionCode(pose.animation?.locomotion);
        const movePacket = createMovePayload({
            sequence: ++runtime.moveSequence,
            sentAt: now,
            dx: local.position.x - previous.x,
            dy: local.position.y - previous.y,
            dz: local.position.z - previous.z,
            vx: Number(pose.velocity?.x ?? 0),
            vy: Number(pose.velocity?.y ?? 0),
            vz: Number(pose.velocity?.z ?? 0),
            qx: local.rotation.x,
            qy: local.rotation.y,
            qz: local.rotation.z,
            qw: local.rotation.w,
            flags,
            locomotion,
        });

        if (runtime.role === 'joiner') {
            this.sendP2PPacket(runtime, movePacket);
            return;
        }

        this.sendP2PPacket(runtime, movePacket);
    }

    sendShoot(shot: { shotId: string; origin: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number }; time: number; weaponId?: string }): void {
        const weaponId = shot.weaponId ?? this.selectedWeaponModelId;
        if (this.tdm4v4) {
            const runtime = this.tdm4v4;
            const local = runtime.players.get(runtime.localPlayerId);
            if (local) {
                local.weaponModelId = normalizeWeaponModelId(weaponId);
            }
            return;
        }
        if (this.signal4v4) {
            const runtime = this.signal4v4;
            if (!runtime.matchStarted) return;
            if (runtime.role === 'host') {
                this.processSignal4v4Shot(runtime, runtime.localPlayerId, { ...shot, weaponModelId: weaponId });
                return;
            }
            runtime.clientTransport?.send(createShootPayload({
                sentAt: performance.now(),
                shotSequence: ++runtime.shotSequence,
                origin: shot.origin,
                direction: shot.dir,
                weaponKind: P2P_WEAPON_KIND_BY_MODEL_ID[weaponId] ?? 1,
            }));
            return;
        }
        if (this.mode === 'socket') {
            if (!this.channel.connected) return;
            const msg: ClientMessage = {
                type: 'shoot',
                shotId: shot.shotId,
                origin: shot.origin,
                dir: shot.dir,
                time: shot.time,
                weaponId,
            };
            const payload = serializeClientMessage(msg);
            this.channel.emit('bin', wrapBinaryMessage(BinaryMessageType.ClientEvent, payload));
            return;
        }

        const runtime = this.p2p;
        if (!runtime?.connected) return;
        if (runtime.matchMode === 'signal' && runtime.signalSoloMode?.getMatchFlowState() !== 'LIVE') return;
        if (runtime.role === 'joiner') {
            this.sendP2PPacket(runtime, createShootPayload({
                sentAt: performance.now(),
                shotSequence: ++runtime.shotSequence,
                origin: shot.origin,
                direction: shot.dir,
                weaponKind: P2P_WEAPON_KIND_BY_MODEL_ID[weaponId] ?? 1,
            }));
            return;
        }
        this.processP2PShot(runtime, runtime.state.host.id, { ...shot, weaponModelId: weaponId });
    }

    setLoadoutSelection(slotIndex: number, weaponModelId: string): void {
        this.selectedLoadoutSlotIndex = Math.max(0, Math.min(4, Math.floor(slotIndex)));
        if (typeof weaponModelId === 'string' && weaponModelId.trim()) {
            this.selectedPrimaryWeaponModelId = weaponModelId;
            this.applyActiveWeaponModel(weaponModelId, 0);
        }
    }

    setMatchLoadoutWeapons(slotIndex: number, primaryWeaponModelId: string, secondaryWeaponModelId: string): void {
        this.selectedLoadoutSlotIndex = Math.max(0, Math.min(4, Math.floor(slotIndex)));
        if (typeof primaryWeaponModelId === 'string' && primaryWeaponModelId.trim()) {
            this.selectedPrimaryWeaponModelId = primaryWeaponModelId;
        }
        if (typeof secondaryWeaponModelId === 'string' && secondaryWeaponModelId.trim()) {
            this.selectedSecondaryWeaponModelId = secondaryWeaponModelId;
        }
        this.applyActiveWeaponModel(this.selectedPrimaryWeaponModelId, 0);
    }

    equipWeaponSlot(slot: number): string {
        if (slot === 1) {
            this.applyActiveWeaponModel(this.selectedSecondaryWeaponModelId, 1);
        } else {
            this.applyActiveWeaponModel(this.selectedPrimaryWeaponModelId, 0);
        }
        return this.selectedWeaponModelId;
    }

    cycleWeaponSlot(direction: number): string {
        const activeSlot = this.bridge.getState().activeWeaponSlot === 1 ? 1 : 0;
        if (direction === 0) return this.selectedWeaponModelId;
        const nextSlot = activeSlot === 0 ? 1 : 0;
        return this.equipWeaponSlot(nextSlot);
    }

    private applyActiveWeaponModel(weaponModelId: string, activeWeaponSlot: number): void {
        if (typeof weaponModelId !== 'string' || !weaponModelId.trim()) return;
        this.selectedWeaponModelId = weaponModelId;
        if (this.tdm4v4) {
            const local = this.tdm4v4.players.get(this.tdm4v4.localPlayerId);
            if (local) {
                local.weaponModelId = normalizeWeaponModelId(weaponModelId);
                local.activeWeaponSlot = activeWeaponSlot === 1 ? 1 : 0;
            }
            if (local) {
                this.bridge.notifyWeaponSelected(this.tdm4v4.localPlayerId as any, local.weaponModelId);
            }
            if (this.tdm4v4.role === 'host') {
                this.pushTdmLobbyState(this.tdm4v4, true);
            } else {
                this.tdm4v4.clientTransport?.send(encodeTdmClientControl({
                    type: 'tdm_select_loadout',
                    characterModelId: this.bridge.getState().selectedCharacterModelId,
                    weaponModelId: normalizeWeaponModelId(weaponModelId),
                    selectedSlot: this.selectedLoadoutSlotIndex,
                }));
            }
        } else if (this.signal4v4) {
            const local = this.signal4v4.players.get(this.signal4v4.localPlayerId);
            if (local) {
                local.weaponModelId = weaponModelId;
            }
        } else if (this.p2p?.connected) {
            const local = this.p2p.role === 'host' ? this.p2p.state.host : this.p2p.state.joiner;
            local.weaponModelId = weaponModelId;
        }
        this.bridge.updateState({
            selectedWeaponModelId: weaponModelId,
            activeWeaponSlot: activeWeaponSlot === 1 ? 1 : 0,
        });
        const localPlayerId = this.bridge.getLocalPlayerId();
        if (localPlayerId) {
            this.bridge.notifyWeaponSelected(localPlayerId as any, weaponModelId);
        }
    }

    async getPersistedLoadouts(): Promise<any> {
        return this.requestServerAck('loadouts_get', {}, 5000);
    }

    async savePersistedLoadouts(loadouts: any): Promise<any> {
        return this.requestServerAck('loadouts_save', { loadouts }, 5000);
    }

    selectMatchLoadout(selection: MatchLoadoutSelection): void {
        this.setMatchLoadoutWeapons(
            selection.slotIndex,
            selection.primaryWeaponModelId ?? selection.weaponModelId,
            selection.secondaryWeaponModelId ?? this.selectedSecondaryWeaponModelId,
        );
        this.sendSelectCharacter(selection.characterModelId);
        if (this.mode === 'socket') {
            this.channel.emit('select_match_loadout', {
                slotIndex: selection.slotIndex,
                characterModelId: selection.characterModelId,
                weaponModelId: selection.primaryWeaponModelId ?? selection.weaponModelId,
            });
        }
    }

    sendMapLoaded(): void {
        if (this.mode !== 'socket') return;
        if (!this.channel.connected) return;
        const msg: ClientMessage = { type: 'map_loaded' };
        const payload = serializeClientMessage(msg);
        this.channel.emit('bin', wrapBinaryMessage(BinaryMessageType.ClientEvent, payload));
    }

    sendSelectCharacter(characterModelId: string): void {
        if (this.tdm4v4) {
            const runtime = this.tdm4v4;
            const local = runtime.players.get(runtime.localPlayerId);
            if (local) {
                local.characterModelId = characterModelId;
                local.weaponModelId = normalizeWeaponModelId(this.selectedWeaponModelId);
            }
            this.bridge.notifyCharacterSelected(runtime.localPlayerId as any, characterModelId);
            this.bridge.notifyWeaponSelected(runtime.localPlayerId as any, normalizeWeaponModelId(this.selectedWeaponModelId));
            if (runtime.role === 'host') {
                this.pushTdmLobbyState(runtime, true);
            } else {
                runtime.clientTransport?.send(encodeTdmClientControl({
                    type: 'tdm_select_loadout',
                    characterModelId,
                    weaponModelId: normalizeWeaponModelId(this.selectedWeaponModelId),
                    selectedSlot: this.selectedLoadoutSlotIndex,
                }));
            }
            return;
        }
        if (this.signal4v4) {
            const runtime = this.signal4v4;
            const local = runtime.players.get(runtime.localPlayerId);
            if (local) {
                local.characterModelId = characterModelId;
                local.weaponModelId = this.selectedPrimaryWeaponModelId;
            }
            this.bridge.notifyCharacterSelected(runtime.localPlayerId as any, characterModelId);
            if (runtime.role === 'host') {
                this.broadcastSignal4v4Lobby(runtime);
                this.broadcastSignal4v4ServerMessage(runtime, {
                    type: 'event',
                    event: {
                        type: 'sig4_character_selected',
                        playerId: runtime.localPlayerId,
                        characterModelId,
                    },
                    tick: tick(0 as any),
                } as any);
                return;
            }
            runtime.clientTransport?.send(wrapP2PClientEvent({
                type: 'sig4_select_character',
                slotIndex: this.selectedLoadoutSlotIndex,
                characterModelId,
                weaponModelId: this.selectedPrimaryWeaponModelId,
            }));
            return;
        }
        if (this.mode === 'socket') {
            if (!this.channel.connected) return;
            const msg: ClientMessage = { type: 'select_character', characterModelId };
            const payload = serializeClientMessage(msg);
            this.channel.emit('bin', wrapBinaryMessage(BinaryMessageType.ClientEvent, payload));
            return;
        }
        const runtime = this.p2p;
        if (!runtime?.connected) return;
        this.bridge.notifyCharacterSelected(runtime.localPlayerId as any, characterModelId);
        if (this.mode === 'p2p_host') {
            this.sendP2PPacket(runtime, wrapP2PServerEvent({
                type: 'event',
                event: {
                    type: 'p2p_character_selected',
                    playerId: runtime.localPlayerId,
                    characterModelId,
                },
                tick: tick(0 as any),
            } as any));
            return;
        }
        if (this.mode === 'p2p_joiner' && this.p2p?.connected) {
            this.sendP2PPacket(this.p2p, wrapP2PClientEvent({ type: 'select_character', characterModelId }));
        }
    }
}

/** Global game client instance */
let clientInstance: GameClient | null = null;

export function getGameClient(): GameClient {
    if (!clientInstance) {
        clientInstance = new GameClient();
    }
    return clientInstance;
}
