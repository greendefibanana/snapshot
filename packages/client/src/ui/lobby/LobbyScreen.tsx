/**
 * LobbyScreen - Final phase-based renderer
 *
 * UI = f(lobbyState)
 * The idle phase renders the AAA lobby HUD with integrated mode selection,
 * loadout editor, and social panel. All game start callbacks flow through
 * a unified mode handler.
 */

import React, { useState, useCallback } from 'react';
import type { LobbyState } from '@snapshot/shared';
import { LobbyQueueing } from './LobbyQueueing.js';
import { LobbyAssembling } from './LobbyAssembling.js';
import { LobbyReadyCheck } from './LobbyReadyCheck.js';
import { LobbyCountdown } from './LobbyCountdown.js';
import { LobbyError } from './LobbyError.js';
import { LobbyIdle } from './LobbyIdle.js';
import type { PlayerLoadoutState } from './loadouts.js';
import { AAALobbyHUD, type LobbyPlayerProfile } from './AAALobbyHUD';
import type { CustomRoomMode, ModeCardData } from './ModeSelector';

// =============================================================================
// PROPS
// =============================================================================

export interface LobbyScreenProps {
    readonly lobbyState: LobbyState;
    readonly socialState?: any;
    readonly onStartTraining?: () => void;
    readonly onStartSignalSolo?: () => void;
    readonly onCreateP2PRoom?: (mode?: CustomRoomMode) => Promise<string>;
    readonly onJoinP2PRoom?: (code: string, mode?: CustomRoomMode) => Promise<void>;
    readonly onFallbackServer1v1?: () => void;
    readonly onSendFriendRequest?: (toPlayerId: string) => Promise<void>;
    readonly onAcceptFriendRequest?: (fromPlayerId: string) => Promise<void>;
    readonly onDeclineFriendRequest?: (fromPlayerId: string) => Promise<void>;
    readonly onCreateParty?: () => Promise<void>;
    readonly onLeaveParty?: () => Promise<void>;
    readonly onSendPartyInvite?: (toPlayerId: string) => Promise<void>;
    readonly onRespondPartyInvite?: (inviteId: string, accept: boolean) => Promise<void>;
    readonly p2pStatus?: {
        phase: 'idle' | 'hosting' | 'connecting' | 'connected' | 'failed';
        code?: string;
        error?: string;
    };
    readonly loadoutState?: PlayerLoadoutState;
    readonly onSelectLoadoutSlot?: (slotIndex: number) => void;
    readonly onUpdateLoadoutSlot?: (
        slotIndex: number,
        patch: Partial<{
            name: string;
            characterModelId: string;
            primaryWeaponModelId: string;
            secondaryWeaponModelId: string;
        }>
    ) => void;
    /** Bridge reference for sending game messages */
    readonly bridge?: any;
}

// =============================================================================
// DEFAULT MOCK PROFILE
// =============================================================================

const DEFAULT_PROFILE: LobbyPlayerProfile = {
    displayName: 'OPERATOR',
    level: 27,
    xp: { current: 4200, max: 8000 },
    rank: 'DIAMOND III',
    currency: { snapshot: 12500, credits: 3420 },
    stats: { wins: 142, losses: 98, kills: 1847, deaths: 1203 },
};

// =============================================================================
// LOBBY SCREEN
// =============================================================================

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
    lobbyState,
    socialState,
    onStartTraining,
    onCreateP2PRoom,
    onJoinP2PRoom,
    onFallbackServer1v1,
    onSendFriendRequest,
    onAcceptFriendRequest,
    onDeclineFriendRequest,
    onCreateParty,
    onLeaveParty,
    onSendPartyInvite,
    onRespondPartyInvite,
    p2pStatus,
    loadoutState,
    onSelectLoadoutSlot,
    onUpdateLoadoutSlot,
    bridge,
}) => {
    const [selectedCharacter, setSelectedCharacter] = useState('assasin');
    const [selectedWeapon] = useState('smg1');

    const handleSelectCharacter = useCallback((id: string) => {
        setSelectedCharacter(id);
        if (onUpdateLoadoutSlot && loadoutState) {
            onUpdateLoadoutSlot(loadoutState.selectedSlotIndex, {
                characterModelId: id,
            });
        }
    }, [onUpdateLoadoutSlot, loadoutState]);

    // Unified mode start handler — routes to the correct callback
    const handleStartMode = useCallback((mode: ModeCardData) => {
        if (mode.mode === 'training') {
            onStartTraining?.();
            return;
        }
        // P2P modes are handled inside ModeSelector (host/join modal)
        if (mode.p2pTag) return;
        // Wager / coming soon — skip
        if (mode.comingSoon) return;

        // Default: send join_queue via bridge
        bridge?.sendToGame?.({
            type: 'join_queue',
            mode: mode.mode,
            ruleset: mode.ruleset || 'casual',
            ...(mode.transport ? { transport: mode.transport } : {}),
        });
    }, [bridge, onStartTraining]);

    switch (lobbyState.phase) {
        case 'idle':
            return (
                <AAALobbyHUD
                    playerProfile={DEFAULT_PROFILE}
                    selectedCharacter={selectedCharacter}
                    selectedWeapon={selectedWeapon}
                    isReady={false}
                    gameMode="SELECT MODE"
                    mapName="—"
                    playerCount={lobbyState.players?.length ?? 1}
                    onReady={() => { }}
                    onSelectCharacter={handleSelectCharacter}
                    onStartMode={handleStartMode}
                    onCreateP2PRoom={onCreateP2PRoom}
                    onJoinP2PRoom={onJoinP2PRoom}
                    onFallbackServer1v1={onFallbackServer1v1}
                    p2pStatus={p2pStatus}
                    loadoutState={loadoutState}
                    onSelectLoadoutSlot={onSelectLoadoutSlot}
                    onUpdateLoadoutSlot={onUpdateLoadoutSlot}
                    socialState={socialState}
                    onSendFriendRequest={onSendFriendRequest}
                    onAcceptFriendRequest={onAcceptFriendRequest}
                    onDeclineFriendRequest={onDeclineFriendRequest}
                    onCreateParty={onCreateParty}
                    onLeaveParty={onLeaveParty}
                    onSendPartyInvite={onSendPartyInvite}
                    onRespondPartyInvite={onRespondPartyInvite}
                />
            );

        case 'queueing':
            return (
                <LobbyQueueing
                    queue={lobbyState.queue ?? {
                        waitTimeSec: 0,
                        mode: lobbyState.mode,
                        ruleset: lobbyState.ruleset,
                        playersInQueue: 0,
                    }}
                />
            );

        case 'assembling':
            return (
                <LobbyAssembling
                    players={lobbyState.players}
                    localPlayerId={lobbyState.localPlayerId as import('@snapshot/shared').PlayerId}
                    mode={lobbyState.mode}
                    maxPlayers={lobbyState.maxPlayers}
                />
            );

        case 'ready_check':
            return (
                <LobbyReadyCheck
                    players={lobbyState.players}
                    localPlayerId={lobbyState.localPlayerId}
                />
            );

        case 'countdown':
        case 'starting':
            return (
                <LobbyCountdown
                    countdownSec={lobbyState.countdownSec}
                    players={lobbyState.players}
                    mode={lobbyState.mode}
                />
            );

        case 'error':
            return (
                <LobbyError error={lobbyState.error?.message} />
            );

        default:
            return (
                <LobbyIdle modes={[]} />
            );
    }
};

export default LobbyScreen;
