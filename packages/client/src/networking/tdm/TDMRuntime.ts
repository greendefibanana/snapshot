import type { InputFrame, Tick } from '@snapshot/shared/simulation';
import type { Vector3, Quaternion } from '@snapshot/shared';
import type { BVHCharacterController } from '../../game/physics/BVHCharacterController';
import type { TdmMatchPhase, TdmReliableEnvelope, TdmRoomConfig } from './TDMProtocol';
import type { PeerMeshClientTransport, PeerMeshHostTransport } from '../transport/PeerMeshTransport';

export interface TdmNetDebugState {
    role: 'host' | 'client';
    pingMs: number;
    snapshotRateHz: number;
    droppedSnapshots: number;
    eventBacklog: number;
    bytesInPerSec: number;
    bytesOutPerSec: number;
    lastSnapshotTick: number;
    sendBacklogBytes: number;
}

export interface TdmPlayerState {
    slot: number;
    playerId: string;
    displayName: string;
    teamId: 1 | 2;
    entityId: number;
    peerId: string | null;
    connected: boolean;
    characterModelId: string;
    weaponModelId: string;
    activeWeaponSlot: number;
    health: number;
    alive: boolean;
    kills: number;
    deaths: number;
    position: Vector3;
    velocity: Vector3;
    rotation: Quaternion;
    isGrounded: boolean;
    controller: BVHCharacterController | null;
    lastInput: InputFrame | null;
    lastInputSeq: number;
    lastProcessedInputSeq: number;
    lastProcessedInputTick: Tick;
    nextShotAtMs: number;
    pendingRespawnAtMs: number | null;
    lastPrimaryFire: boolean;
    localPose: {
        position: Vector3;
        velocity: Vector3;
        rotation: Quaternion;
        isGrounded: boolean;
        atMs: number;
    } | null;
}

export interface OrderedEnvelopeBuffer {
    expectedSeq: number;
    buffered: Map<number, TdmReliableEnvelope>;
}

export interface Tdm4v4Runtime {
    role: 'host' | 'client';
    code: string;
    hostPlayerId: string;
    localPlayerId: string;
    phase: TdmMatchPhase;
    config: TdmRoomConfig;
    players: Map<string, TdmPlayerState>;
    playerOrder: string[];
    peerIdToPlayerId: Map<string, string>;
    hostTransport: PeerMeshHostTransport | null;
    clientTransport: PeerMeshClientTransport | null;
    startTimeout: number | null;
    prematchTimeout: number | null;
    simInterval: number | null;
    snapshotInterval: number | null;
    statsInterval: number | null;
    pingInterval: number | null;
    enteredScene: boolean;
    requiredPlayers: number;
    startedAtMs: number | null;
    endsAtMs: number | null;
    teamScores: { 1: number; 2: number };
    reliableNextSeq: number;
    reliableLastAckByPeerId: Map<string, number>;
    reliablePendingByPeerId: Map<string, Map<number, { payload: ArrayBuffer; lastSentAtMs: number }>>;
    orderedEvents: OrderedEnvelopeBuffer;
    debug: TdmNetDebugState;
    bytesInWindow: number;
    bytesOutWindow: number;
    lastStatsSampleAtMs: number;
    snapshotIntervalMs: number;
    lastInputSentAtMs: number;
}

export function createOrderedEnvelopeBuffer(): OrderedEnvelopeBuffer {
    return {
        expectedSeq: 1,
        buffered: new Map(),
    };
}

export function pushOrderedEnvelope(
    state: OrderedEnvelopeBuffer,
    envelope: TdmReliableEnvelope,
): TdmReliableEnvelope[] {
    if (!Number.isFinite(envelope.seq) || envelope.seq <= 0) return [];
    if (envelope.seq < state.expectedSeq) return [];
    state.buffered.set(envelope.seq, envelope);
    const out: TdmReliableEnvelope[] = [];
    while (state.buffered.has(state.expectedSeq)) {
        const next = state.buffered.get(state.expectedSeq);
        state.buffered.delete(state.expectedSeq);
        if (next) out.push(next);
        state.expectedSeq += 1;
    }
    return out;
}
