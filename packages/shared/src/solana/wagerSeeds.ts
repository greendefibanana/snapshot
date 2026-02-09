export function wagerMatchSeed(matchId: string): Uint8Array {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(matchId);
    if (bytes.length === 32) return bytes;
    if (bytes.length > 32) return bytes.slice(0, 32);
    const out = new Uint8Array(32);
    out.set(bytes, 0);
    return out;
}
