/**
 * LobbyAssembling Screen
 * 
 * Shown when lobbyState.phase === "assembling"
 * Displays player slots as teams form.
 * 
 * Read-only, no actions, no animations.
 */

import React from 'react';
import type { PlayerSlot, Ruleset, AccessType, PlayerId } from '@snapshot/shared';
import { Badge } from '../primitives/Badge.js';
import { Card } from '../primitives/Card.js';
import { PlayerAvatar } from '../primitives/PlayerAvatar.js';
import { SlotPlaceholder } from '../primitives/SlotPlaceholder.js';

// =============================================================================
// PROPS
// =============================================================================

export interface LobbyAssemblingProps {
    readonly players: readonly PlayerSlot[];
    readonly localPlayerId: PlayerId;
    readonly mode: GameMode;
    readonly ruleset?: Ruleset;
    readonly access?: AccessType;
    readonly maxPlayers: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function getModeLabel(mode: GameMode): string {
    return mode === '1v1' ? '1v1 Duel' : 'Duel Match';
}

function createSlots(
    players: readonly PlayerSlot[],
    maxPlayers: number
): (PlayerSlot | undefined)[] {
    const slots: (PlayerSlot | undefined)[] = new Array(maxPlayers).fill(undefined);
    for (const player of players) {
        if (player.slot >= 0 && player.slot < maxPlayers) {
            slots[player.slot] = player;
        }
    }
    return slots;
}

// =============================================================================
// PLAYER SLOT CARD
// =============================================================================

interface PlayerSlotCardProps {
    readonly player: PlayerSlot | undefined;
    readonly slotIndex: number;
    readonly isLocal: boolean;
}

const PlayerSlotCard: React.FC<PlayerSlotCardProps> = ({ player, slotIndex, isLocal }) => {
    if (!player) {
        return <SlotPlaceholder slotIndex={slotIndex} />;
    }

    return (
        <Card variant={isLocal ? 'elevated' : 'default'}>
            <div data-component="player-slot-card" data-local={isLocal} data-team={player.team}>
                <PlayerAvatar
                    playerId={player.playerId}
                    displayName={player.displayName}
                    isLocal={isLocal}
                />
                <span data-label="name">{player.displayName}</span>
                {isLocal && <Badge variant="status">YOU</Badge>}
                {player.isHost && <Badge variant="mode">HOST</Badge>}
            </div>
        </Card>
    );
};

// =============================================================================
// LOBBY ASSEMBLING SCREEN
// =============================================================================

export const LobbyAssembling: React.FC<LobbyAssemblingProps> = ({
    players,
    localPlayerId,
    mode,
    ruleset = 'casual',
    access = 'public',
    maxPlayers,
}) => {
    const slots = createSlots(players, maxPlayers);

    return (
        <div data-screen="lobby-assembling">
            {/* Header with badges */}
            <div data-component="header">
                <h2>{getModeLabel(mode)}</h2>
                <div data-component="badges">
                    <Badge variant="mode">{mode.toUpperCase()}</Badge>
                    {ruleset === 'wager' && <Badge variant="wager">WAGER</Badge>}
                    {access !== 'public' && <Badge variant="access">{access.toUpperCase()}</Badge>}
                </div>
            </div>

            {/* Progress */}
            <p data-label="progress">Assembling players... {players.length}/{maxPlayers}</p>

            {/* Player slot grid */}
            <div data-component="slot-grid">
                {slots.map((player, index) => (
                    <PlayerSlotCard
                        key={index}
                        player={player}
                        slotIndex={index}
                        isLocal={player?.playerId === localPlayerId}
                    />
                ))}
            </div>
        </div>
    );
};

export default LobbyAssembling;
type GameMode = string;
