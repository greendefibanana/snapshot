const STORAGE_PREFIX = 'snapshot_username:';

export function getUsernameForPublicKey(publicKey?: string | null): string | null {
    if (!publicKey) return null;
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${publicKey}`);
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed.length ? trimmed : null;
}

export function setUsernameForPublicKey(publicKey: string, username: string): void {
    const trimmed = username.trim();
    window.localStorage.setItem(`${STORAGE_PREFIX}${publicKey}`, trimmed);
}

export function normalizeUsername(input: string): string {
    return input.trim().replace(/\s+/g, ' ');
}

export function validateUsername(input: string): string | null {
    const name = normalizeUsername(input);
    if (name.length < 3) return 'Username must be at least 3 characters.';
    if (name.length > 20) return 'Username must be 20 characters or fewer.';
    if (!/^[a-zA-Z0-9 _-]+$/.test(name)) {
        return 'Use letters, numbers, spaces, underscores, or hyphens.';
    }
    return null;
}
