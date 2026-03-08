import crypto from 'node:crypto';

export interface MatchTokenPayload {
    matchId: string;
    roomId: string;
    playerId: string;
    peerId: string;
    mode: string;
    exp: number;
}

function toBase64Url(input: Buffer | string): string {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function fromBase64Url(input: string): Buffer {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, 'base64');
}

export class MatchTokenService {
    private readonly secret: string;

    constructor(secret: string) {
        this.secret = secret.trim() || 'snapshot-dev-matchmaking-secret';
    }

    sign(payload: MatchTokenPayload): string {
        const body = toBase64Url(JSON.stringify(payload));
        const signature = toBase64Url(
            crypto.createHmac('sha256', this.secret).update(body).digest(),
        );
        return `${body}.${signature}`;
    }

    verify(token: string): MatchTokenPayload | null {
        const [body, signature] = String(token ?? '').split('.');
        if (!body || !signature) return null;
        const expected = toBase64Url(
            crypto.createHmac('sha256', this.secret).update(body).digest(),
        );
        const actualBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expected);
        if (actualBuffer.length !== expectedBuffer.length) return null;
        if (!crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
        try {
            const parsed = JSON.parse(fromBase64Url(body).toString('utf8')) as MatchTokenPayload;
            if (!parsed || typeof parsed !== 'object') return null;
            if (typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) return null;
            if (!parsed.matchId || !parsed.roomId || !parsed.playerId || !parsed.mode) return null;
            return parsed;
        } catch {
            return null;
        }
    }
}
