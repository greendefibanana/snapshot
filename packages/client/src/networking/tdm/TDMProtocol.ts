import {
    BinaryMessageType,
    deserializeServerMessage,
    serializeServerMessage,
    unwrapBinaryMessage,
    wrapBinaryMessage,
    type ServerMessage,
} from '@snapshot/shared';
import {
    deserializeSnapshot,
    serializeSnapshot,
    type Snapshot,
} from '@snapshot/shared/simulation';

export type TdmMatchPhase = 'lobby' | 'prematch' | 'live' | 'postmatch';

export interface TdmRoomConfig {
    maxPlayers: number;
    teamSize: number;
    scoreLimit: number;
    timeLimitSec: number;
    respawnDelayMs: number;
    prematchDelaySec: number;
    snapshotRateHz: number;
    inputRateHz: number;
}

export interface TdmLobbyPlayer {
    playerId: string;
    displayName: string;
    teamId: 1 | 2;
    entityId: number;
    slotIndex: number;
    peerId?: string | null;
    connected: boolean;
    characterModelId: string;
    weaponModelId: string;
}

export interface TdmHelloPayload {
    type: 'tdm_hello';
    playerId: string;
    displayName: string;
    peerId?: string;
    roomId?: string;
    matchId?: string;
    matchToken?: string;
    characterModelId: string;
    weaponModelId: string;
    selectedSlot: number;
}

export interface TdmEventAckPayload {
    type: 'tdm_event_ack';
    ack: number;
}

export interface TdmSelectLoadoutPayload {
    type: 'tdm_select_loadout';
    characterModelId: string;
    weaponModelId: string;
    selectedSlot: number;
}

export interface TdmLobbyEnvelope {
    type: 'tdm_lobby';
    code: string;
    hostPlayerId: string;
    phase: TdmMatchPhase;
    config: TdmRoomConfig;
    players: TdmLobbyPlayer[];
}

export interface TdmMatchStartEnvelope {
    type: 'tdm_match_start';
    startedAtMs: number;
    phase: TdmMatchPhase;
    config: TdmRoomConfig;
}

export interface TdmServerMessageEnvelope {
    type: 'tdm_server_message';
    message: ServerMessage;
}

export type TdmReliablePayload =
    | TdmLobbyEnvelope
    | TdmMatchStartEnvelope
    | TdmServerMessageEnvelope;

export interface TdmReliableEnvelope {
    type: 'tdm_reliable';
    seq: number;
    payload: TdmReliablePayload;
}

export type TdmClientControlPayload =
    | TdmHelloPayload
    | TdmEventAckPayload
    | TdmSelectLoadoutPayload;

export function encodeTdmSnapshot(snapshot: Snapshot): ArrayBuffer {
    return wrapBinaryMessage(BinaryMessageType.Snapshot, serializeSnapshot(snapshot));
}

export function decodeTdmSnapshot(buffer: ArrayBuffer): Snapshot | null {
    const decoded = unwrapBinaryMessage(buffer);
    if (decoded.type !== BinaryMessageType.Snapshot) return null;
    return deserializeSnapshot(decoded.payload);
}

export function encodeTdmReliableEnvelope(envelope: TdmReliableEnvelope): ArrayBuffer {
    return wrapBinaryMessage(
        BinaryMessageType.ServerEvent,
        serializeServerMessage(envelope as unknown as ServerMessage),
    );
}

export function decodeTdmReliableEnvelope(buffer: ArrayBuffer): TdmReliableEnvelope | null {
    const decoded = unwrapBinaryMessage(buffer);
    if (decoded.type !== BinaryMessageType.ServerEvent) return null;
    const envelope = deserializeServerMessage(decoded.payload) as unknown as TdmReliableEnvelope;
    return envelope?.type === 'tdm_reliable' ? envelope : null;
}

export function encodeTdmClientControl(payload: TdmClientControlPayload): ArrayBuffer {
    return wrapBinaryMessage(
        BinaryMessageType.ClientEvent,
        serializeServerMessage(payload as unknown as ServerMessage),
    );
}

export function decodeTdmClientControl(buffer: ArrayBuffer): TdmClientControlPayload | null {
    const decoded = unwrapBinaryMessage(buffer);
    if (decoded.type !== BinaryMessageType.ClientEvent) return null;
    const payload = deserializeServerMessage(decoded.payload) as unknown as TdmClientControlPayload;
    if (!payload || typeof payload !== 'object') return null;
    if (payload.type === 'tdm_hello' || payload.type === 'tdm_event_ack' || payload.type === 'tdm_select_loadout') {
        return payload;
    }
    return null;
}
