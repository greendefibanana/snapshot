export type PublicMatchmakingMode = '1v1' | '2v2' | '4v4';
export type MatchmakingStatus = 'queued' | 'room_found' | 'connecting' | 'ready' | 'live' | 'cancelled' | 'expired';

export interface MatchmakingPlayerSummary {
    playerId: string;
    displayName: string;
    peerId: string;
    team: 1 | 2;
    connected?: boolean;
}

export interface MatchmakingAssignment {
    matchId: string;
    roomId: string;
    mode: PublicMatchmakingMode;
    hostPeerId: string;
    hostPlayerId: string;
    status: MatchmakingStatus;
    maxPlayers: number;
    teamSize: number;
    players: MatchmakingPlayerSummary[];
}

export interface MatchmakingStatusResponse {
    status: MatchmakingStatus;
    position?: number;
    match?: MatchmakingAssignment;
    auth?: { matchToken: string };
}

function getApiBaseUrl(): string {
    const configuredServerUrl = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim();
    const devServerPort = (import.meta.env.VITE_SERVER_PORT as string | undefined)?.trim() || '10000';
    if (configuredServerUrl) return configuredServerUrl.replace(/\/+$/, '');
    if (import.meta.env.DEV) {
        return `${window.location.protocol}//${window.location.hostname}:${devServerPort}`;
    }
    return window.location.origin;
}

async function requestJson<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
        },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = typeof data?.error === 'string' ? data.error : `HTTP ${response.status}`;
        throw new Error(message);
    }
    return data as TResponse;
}

export class MatchmakingApi {
    enqueue(body: {
        playerId: string;
        peerId?: string;
        displayName?: string;
        mode: PublicMatchmakingMode;
        region?: string;
        buildVersion: string;
    }): Promise<{ ticketId: string; status: MatchmakingStatus }> {
        return requestJson('/api/matchmaking/enqueue', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    getStatus(ticketId: string): Promise<MatchmakingStatusResponse> {
        return requestJson(`/api/matchmaking/status?ticketId=${encodeURIComponent(ticketId)}`, {
            method: 'GET',
        });
    }

    heartbeat(ticketId: string): Promise<{ ok: boolean; status: MatchmakingStatus }> {
        return requestJson('/api/matchmaking/heartbeat', {
            method: 'POST',
            body: JSON.stringify({ ticketId }),
        });
    }

    cancel(ticketId: string): Promise<{ ok: boolean; status: MatchmakingStatus }> {
        return requestJson('/api/matchmaking/cancel', {
            method: 'POST',
            body: JSON.stringify({ ticketId }),
        });
    }

    reportConnected(ticketId: string): Promise<{ ok: boolean; status: MatchmakingStatus }> {
        return requestJson('/api/matchmaking/report-connected', {
            method: 'POST',
            body: JSON.stringify({ ticketId }),
        });
    }

    reportFailed(ticketId: string): Promise<{ ok: boolean; status: MatchmakingStatus }> {
        return requestJson('/api/matchmaking/report-failed', {
            method: 'POST',
            body: JSON.stringify({ ticketId }),
        });
    }

    reportLive(roomId: string): Promise<{ ok: boolean; status: MatchmakingStatus }> {
        return requestJson('/api/matchmaking/report-live', {
            method: 'POST',
            body: JSON.stringify({ roomId }),
        });
    }

    verifyJoin(body: {
        roomId: string;
        matchId: string;
        playerId: string;
        matchToken: string;
    }): Promise<{ ok: boolean; room?: MatchmakingAssignment; error?: string }> {
        return requestJson('/api/matchmaking/verify-join', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    getRoom(roomId: string): Promise<MatchmakingAssignment> {
        return requestJson(`/api/matchmaking/room/${encodeURIComponent(roomId)}`, {
            method: 'GET',
        });
    }
}

let matchmakingApiInstance: MatchmakingApi | null = null;

export function getMatchmakingApi(): MatchmakingApi {
    if (!matchmakingApiInstance) {
        matchmakingApiInstance = new MatchmakingApi();
    }
    return matchmakingApiInstance;
}
