import { chooseInitialHost, type HostSelectionCandidate } from './HostSelection.js';
import { MatchTokenService, type MatchTokenPayload } from './MatchTokenService.js';

export type PublicMatchmakingMode = '1v1' | '2v2' | '4v4';
export type MatchmakingStatus = 'queued' | 'room_found' | 'connecting' | 'ready' | 'live' | 'cancelled' | 'expired';

export interface EnqueueRequest {
    playerId: string;
    peerId?: string;
    displayName?: string;
    mode: PublicMatchmakingMode;
    region?: string;
    buildVersion: string;
}

export interface AssignedPlayer {
    playerId: string;
    displayName: string;
    peerId: string;
    team: 1 | 2;
    ticketId: string;
    matchToken: string;
    connectedAt: number | null;
}

export interface PendingRoom {
    roomId: string;
    matchId: string;
    mode: PublicMatchmakingMode;
    hostPlayerId: string;
    hostPeerId: string;
    status: MatchmakingStatus;
    maxPlayers: number;
    teamSize: number;
    buildVersion: string;
    region: string;
    players: AssignedPlayer[];
    createdAt: number;
    expiresAt: number;
    liveAt: number | null;
}

interface QueuedPlayer {
    ticketId: string;
    playerId: string;
    peerId: string;
    displayName: string;
    mode: PublicMatchmakingMode;
    region: string;
    buildVersion: string;
    status: MatchmakingStatus;
    joinedAt: number;
    lastHeartbeatAt: number;
    roomId: string | null;
    cancelledAt: number | null;
    expiredAt: number | null;
}

interface ModeConfig {
    maxPlayers: number;
    teamSize: number;
}

const MODE_CONFIG: Record<PublicMatchmakingMode, ModeConfig> = {
    '1v1': { maxPlayers: 2, teamSize: 1 },
    '2v2': { maxPlayers: 4, teamSize: 2 },
    '4v4': { maxPlayers: 8, teamSize: 4 },
};

const QUEUE_HEARTBEAT_TTL_MS = 20_000;
const ROOM_CONNECT_TTL_MS = 45_000;
const READY_GRACE_TTL_MS = 15_000;
const TOKEN_TTL_MS = 10 * 60_000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class PublicMatchmakingService {
    private readonly tokenService: MatchTokenService;
    private readonly tickets = new Map<string, QueuedPlayer>();
    private readonly ticketByPlayerId = new Map<string, string>();
    private readonly rooms = new Map<string, PendingRoom>();

    constructor(tokenService: MatchTokenService) {
        this.tokenService = tokenService;
    }

    enqueue(request: EnqueueRequest): { ticketId: string; status: MatchmakingStatus } {
        this.cleanup(Date.now());
        this.cancelByPlayerId(request.playerId);

        const now = Date.now();
        const ticketId = this.createId('ticket');
        const ticket: QueuedPlayer = {
            ticketId,
            playerId: request.playerId,
            peerId: String(request.peerId ?? '').trim(),
            displayName: String(request.displayName ?? request.playerId).trim() || request.playerId,
            mode: request.mode,
            region: String(request.region ?? 'global').trim().toLowerCase() || 'global',
            buildVersion: String(request.buildVersion ?? '').trim() || 'dev',
            status: 'queued',
            joinedAt: now,
            lastHeartbeatAt: now,
            roomId: null,
            cancelledAt: null,
            expiredAt: null,
        };
        this.tickets.set(ticketId, ticket);
        this.ticketByPlayerId.set(ticket.playerId, ticketId);
        console.info('[MatchmakingAPI] enqueue', {
            ticketId,
            playerId: ticket.playerId,
            mode: ticket.mode,
            region: ticket.region,
            buildVersion: ticket.buildVersion,
        });
        this.matchmake(now);
        return { ticketId, status: ticket.status };
    }

    getStatus(ticketId: string): Record<string, unknown> {
        this.cleanup(Date.now());
        const ticket = this.tickets.get(ticketId);
        if (!ticket) {
            return { status: 'expired' satisfies MatchmakingStatus };
        }
        if (ticket.status === 'queued') {
            return {
                status: 'queued' satisfies MatchmakingStatus,
                position: this.getQueuePosition(ticket),
            };
        }
        if (ticket.status === 'cancelled' || ticket.status === 'expired') {
            return { status: ticket.status };
        }

        const room = ticket.roomId ? this.rooms.get(ticket.roomId) : null;
        if (!room) {
            return { status: 'expired' satisfies MatchmakingStatus };
        }

        const assignedPlayer = room.players.find((player) => player.ticketId === ticket.ticketId);
        const playerStatus = room.status === 'room_found'
            ? 'room_found'
            : room.status === 'ready'
                ? 'ready'
                : room.status === 'live'
                    ? 'live'
                    : 'connecting';

        return {
            status: playerStatus satisfies MatchmakingStatus,
            match: this.toRoomPayload(room),
            auth: {
                matchToken: assignedPlayer?.matchToken ?? '',
            },
        };
    }

    heartbeat(ticketId: string): { ok: boolean; status: MatchmakingStatus } {
        this.cleanup(Date.now());
        const ticket = this.tickets.get(ticketId);
        if (!ticket) {
            return { ok: false, status: 'expired' };
        }
        ticket.lastHeartbeatAt = Date.now();
        return { ok: true, status: ticket.status };
    }

    cancel(ticketId: string): { ok: boolean; status: MatchmakingStatus } {
        const ticket = this.tickets.get(ticketId);
        if (!ticket) return { ok: false, status: 'expired' };
        this.expireTicket(ticket, 'cancelled');
        return { ok: true, status: 'cancelled' };
    }

    cancelByPlayerId(playerId: string): void {
        const ticketId = this.ticketByPlayerId.get(playerId);
        if (!ticketId) return;
        const ticket = this.tickets.get(ticketId);
        if (!ticket) return;
        if (ticket.status === 'queued') {
            this.expireTicket(ticket, 'cancelled');
        }
    }

    handleDisconnect(playerId: string): void {
        this.cleanup(Date.now());
        const ticketId = this.ticketByPlayerId.get(playerId);
        if (!ticketId) return;
        const ticket = this.tickets.get(ticketId);
        if (!ticket) return;
        if (ticket.roomId) {
            const room = this.rooms.get(ticket.roomId);
            if (room) {
                this.expireRoom(room, 'expired');
                return;
            }
        }
        this.expireTicket(ticket, 'expired');
    }

    reportConnected(ticketId: string): { ok: boolean; status: MatchmakingStatus } {
        this.cleanup(Date.now());
        const ticket = this.tickets.get(ticketId);
        if (!ticket || !ticket.roomId) {
            return { ok: false, status: 'expired' };
        }
        const room = this.rooms.get(ticket.roomId);
        if (!room) {
            this.expireTicket(ticket, 'expired');
            return { ok: false, status: 'expired' };
        }
        const player = room.players.find((entry) => entry.ticketId === ticketId);
        if (!player) {
            this.expireTicket(ticket, 'expired');
            return { ok: false, status: 'expired' };
        }
        player.connectedAt = Date.now();
        if (room.players.every((entry) => entry.connectedAt !== null)) {
            room.status = 'ready';
            room.expiresAt = Date.now() + READY_GRACE_TTL_MS;
        } else {
            room.status = 'connecting';
        }
        ticket.status = room.status;
        console.info('[MatchmakingAPI] report-connected', {
            ticketId,
            playerId: ticket.playerId,
            roomId: room.roomId,
            status: room.status,
        });
        return { ok: true, status: room.status };
    }

    reportFailed(ticketId: string): { ok: boolean; status: MatchmakingStatus } {
        this.cleanup(Date.now());
        const ticket = this.tickets.get(ticketId);
        if (!ticket) return { ok: false, status: 'expired' };
        if (ticket.roomId) {
            const room = this.rooms.get(ticket.roomId);
            if (room) {
                this.expireRoom(room, 'expired');
            }
        } else {
            this.expireTicket(ticket, 'expired');
        }
        return { ok: true, status: 'expired' };
    }

    reportLive(roomId: string): { ok: boolean; status: MatchmakingStatus } {
        this.cleanup(Date.now());
        const room = this.rooms.get(roomId);
        if (!room) return { ok: false, status: 'expired' };
        room.status = 'live';
        room.liveAt = Date.now();
        for (const player of room.players) {
            const ticket = this.tickets.get(player.ticketId);
            if (ticket) ticket.status = 'live';
        }
        return { ok: true, status: 'live' };
    }

    getRoom(roomId: string): Record<string, unknown> | null {
        this.cleanup(Date.now());
        const room = this.rooms.get(roomId);
        return room ? this.toRoomPayload(room) : null;
    }

    verifyJoin(roomId: string, matchId: string, playerId: string, token: string): { ok: boolean; room?: Record<string, unknown>; error?: string } {
        this.cleanup(Date.now());
        const room = this.rooms.get(roomId);
        if (!room) return { ok: false, error: 'room_not_found' };
        if (room.matchId !== matchId) return { ok: false, error: 'match_mismatch' };
        const payload = this.tokenService.verify(token);
        if (!payload) return { ok: false, error: 'token_invalid' };
        if (payload.roomId !== roomId || payload.matchId !== matchId || payload.playerId !== playerId || payload.mode !== room.mode) {
            return { ok: false, error: 'token_mismatch' };
        }
        const player = room.players.find((entry) => entry.playerId === playerId && entry.matchToken === token);
        if (!player) return { ok: false, error: 'player_not_assigned' };
        console.info('[MatchmakingAPI] verify-join', {
            roomId,
            matchId,
            playerId,
            peerId: payload.peerId,
        });
        return { ok: true, room: this.toRoomPayload(room) };
    }

    private matchmake(now: number): void {
        const grouped = new Map<string, QueuedPlayer[]>();
        for (const ticket of this.tickets.values()) {
            if (ticket.status !== 'queued') continue;
            const key = `${ticket.mode}:${ticket.region}:${ticket.buildVersion}`;
            const bucket = grouped.get(key);
            if (bucket) bucket.push(ticket);
            else grouped.set(key, [ticket]);
        }

        for (const tickets of grouped.values()) {
            const sorted = [...tickets].sort((a, b) => a.joinedAt - b.joinedAt);
            const mode = sorted[0]?.mode;
            if (!mode) continue;
            const config = MODE_CONFIG[mode];
            if (!config) continue;
            while (sorted.length >= config.maxPlayers) {
                const slice = sorted.splice(0, config.maxPlayers);
                const room = this.createRoom(slice, now);
                if (!room) break;
            }
        }
    }

    private createRoom(tickets: QueuedPlayer[], now: number): PendingRoom | null {
        const mode = tickets[0]?.mode;
        if (!mode) return null;
        const config = MODE_CONFIG[mode];
        if (!config || tickets.length !== config.maxPlayers) return null;

        const hostCandidate = chooseInitialHost(
            tickets.map<HostSelectionCandidate>((ticket) => ({
                playerId: ticket.playerId,
                joinedAt: ticket.joinedAt,
            })),
        );
        if (!hostCandidate) return null;

        const roomId = this.createCode();
        const matchId = this.createId('match');
        const players = tickets.map((ticket, index) => {
            const team: 1 | 2 = index < config.teamSize ? 1 : 2;
            const payload: MatchTokenPayload = {
                matchId,
                roomId,
                playerId: ticket.playerId,
                peerId: ticket.playerId === hostCandidate.playerId ? roomId : '*',
                mode,
                exp: now + TOKEN_TTL_MS,
            };
            return {
                playerId: ticket.playerId,
                displayName: ticket.displayName,
                peerId: payload.peerId,
                team,
                ticketId: ticket.ticketId,
                matchToken: this.tokenService.sign(payload),
                connectedAt: null,
            } satisfies AssignedPlayer;
        });

        const room: PendingRoom = {
            roomId,
            matchId,
            mode,
            hostPlayerId: hostCandidate.playerId,
            hostPeerId: roomId,
            status: 'room_found',
            maxPlayers: config.maxPlayers,
            teamSize: config.teamSize,
            buildVersion: tickets[0]!.buildVersion,
            region: tickets[0]!.region,
            players,
            createdAt: now,
            expiresAt: now + ROOM_CONNECT_TTL_MS,
            liveAt: null,
        };
        this.rooms.set(roomId, room);

        for (const ticket of tickets) {
            ticket.status = 'room_found';
            ticket.roomId = roomId;
        }

        console.info('[MatchmakingAPI] room-created', {
            roomId,
            matchId,
            mode: room.mode,
            hostPlayerId: room.hostPlayerId,
            maxPlayers: room.maxPlayers,
        });
        return room;
    }

    private cleanup(now: number): void {
        for (const ticket of Array.from(this.tickets.values())) {
            if (ticket.status === 'queued' && (now - ticket.lastHeartbeatAt) > QUEUE_HEARTBEAT_TTL_MS) {
                this.expireTicket(ticket, 'expired');
            }
        }
        for (const room of Array.from(this.rooms.values())) {
            if (room.status !== 'live' && now > room.expiresAt) {
                this.expireRoom(room, 'expired');
            }
        }
    }

    private expireRoom(room: PendingRoom, status: 'expired' | 'cancelled'): void {
        this.rooms.delete(room.roomId);
        console.info('[MatchmakingAPI] room-expired', {
            roomId: room.roomId,
            matchId: room.matchId,
            status,
        });
        for (const player of room.players) {
            const ticket = this.tickets.get(player.ticketId);
            if (ticket) {
                this.expireTicket(ticket, status);
            }
        }
    }

    private expireTicket(ticket: QueuedPlayer, status: 'expired' | 'cancelled'): void {
        ticket.status = status;
        if (status === 'cancelled') ticket.cancelledAt = Date.now();
        if (status === 'expired') ticket.expiredAt = Date.now();
        this.ticketByPlayerId.delete(ticket.playerId);
        if (ticket.roomId) {
            const room = this.rooms.get(ticket.roomId);
            if (room) {
                room.players = room.players.filter((entry) => entry.ticketId !== ticket.ticketId);
                if (room.players.length <= 0) {
                    this.rooms.delete(room.roomId);
                }
            }
        }
    }

    private getQueuePosition(ticket: QueuedPlayer): number {
        const compatible = Array.from(this.tickets.values())
            .filter((entry) =>
                entry.status === 'queued'
                && entry.mode === ticket.mode
                && entry.region === ticket.region
                && entry.buildVersion === ticket.buildVersion,
            )
            .sort((a, b) => a.joinedAt - b.joinedAt);
        const index = compatible.findIndex((entry) => entry.ticketId === ticket.ticketId);
        return index >= 0 ? index + 1 : compatible.length + 1;
    }

    private toRoomPayload(room: PendingRoom): Record<string, unknown> {
        return {
            matchId: room.matchId,
            roomId: room.roomId,
            mode: room.mode,
            hostPeerId: room.hostPeerId,
            hostPlayerId: room.hostPlayerId,
            status: room.status,
            maxPlayers: room.maxPlayers,
            teamSize: room.teamSize,
            players: room.players.map((player) => ({
                playerId: player.playerId,
                displayName: player.displayName,
                peerId: player.peerId,
                team: player.team,
                connected: player.connectedAt !== null,
            })),
        };
    }

    private createId(prefix: string): string {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    private createCode(length: number = 8): string {
        let out = '';
        for (let i = 0; i < length; i++) {
            out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)] ?? 'X';
        }
        return out;
    }
}
