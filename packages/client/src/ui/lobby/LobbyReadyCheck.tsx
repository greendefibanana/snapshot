/**
 * LobbyReadyCheck Screen
 * 
 * Shown when lobbyState.phase === "ready_check"
 * Displays player ready states with confirm button.
 * 
 * Pure renderer: button logs intent only.
 */

import React from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface LobbyPlayer {
    readonly playerId: string;
    readonly displayName: string;
    readonly team: 0 | 1 | 2;
    readonly isReady: boolean;
    readonly slot: number;
}

export interface LobbyReadyCheckProps {
    readonly players: readonly LobbyPlayer[];
    readonly localPlayerId: string;
}

// =============================================================================
// PLAYER READY ROW
// =============================================================================

interface PlayerReadyRowProps {
    readonly player: LobbyPlayer;
    readonly isLocal: boolean;
}

const PlayerReadyRow: React.FC<PlayerReadyRowProps> = ({ player, isLocal }) => {
    return (
        <div
            data-component="player-ready-row"
            data-ready={player.isReady}
            data-local={isLocal}
        >
            <span data-label="name">
                {player.displayName}
                {isLocal && ' (You)'}
            </span>
            <span data-label="status">
                {player.isReady ? '✓ READY' : '○ WAITING'}
            </span>
        </div>
    );
};

// =============================================================================
// LOBBY READY CHECK SCREEN
// =============================================================================

export const LobbyReadyCheck: React.FC<LobbyReadyCheckProps> = ({
    players,
    localPlayerId,
}) => {
    const localPlayer = players.find(p => p.playerId === localPlayerId);
    const readyCount = players.filter(p => p.isReady).length;

    const handleConfirm = () => {
        console.log('[LobbyReadyCheck] Confirm ready clicked');
    };

    return (
        <div data-screen="lobby-ready-check">
            <h2>Ready Check</h2>
            <p>{readyCount}/{players.length} players ready</p>

            {/* Player list */}
            <div data-component="player-list">
                {players.map((player) => (
                    <PlayerReadyRow
                        key={player.playerId}
                        player={player}
                        isLocal={player.playerId === localPlayerId}
                    />
                ))}
            </div>

            {/* Confirm button (local player only) */}
            {localPlayer && !localPlayer.isReady && (
                <button onClick={handleConfirm}>CONFIRM READY</button>
            )}

            {localPlayer?.isReady && (
                <p data-label="waiting">Waiting for others...</p>
            )}
        </div>
    );
};

export default LobbyReadyCheck;
