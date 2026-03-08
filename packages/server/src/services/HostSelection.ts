export interface HostSelectionCandidate {
    playerId: string;
    joinedAt: number;
}

export function chooseInitialHost(candidates: readonly HostSelectionCandidate[]): HostSelectionCandidate | null {
    if (candidates.length <= 0) return null;
    return [...candidates].sort((a, b) => a.joinedAt - b.joinedAt)[0] ?? null;
}
