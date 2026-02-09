/**
 * LobbyScreen - Final phase-based renderer
 * 
 * UI = f(lobbyState)
 * No internal state, no effects, no timers.
 */

import React from 'react';
import type { LobbyState } from '@snapshot/shared';
import { LobbyIdle } from './LobbyIdle.js';
import { LobbyQueueing } from './LobbyQueueing.js';
import { LobbyAssembling } from './LobbyAssembling.js';
import { LobbyReadyCheck } from './LobbyReadyCheck.js';
import { LobbyCountdown } from './LobbyCountdown.js';
import { LobbyError } from './LobbyError.js';

// =============================================================================
// PROPS
// =============================================================================

export interface LobbyScreenProps {
    readonly lobbyState: LobbyState;
    readonly onStartTraining?: () => void;
}

// =============================================================================
// LOBBY SCREEN
// =============================================================================

export const LobbyScreen: React.FC<LobbyScreenProps> = ({ lobbyState, onStartTraining }) => {
    switch (lobbyState.phase) {
        case 'idle':
            return (
                <LobbyIdle
                    modes={[
                        { mode: '1v1', label: '1v1 Duel', description: 'Face off', ruleset: lobbyState.ruleset, access: lobbyState.access },
                        { mode: '4v4', label: '4v4 Team', description: 'Team battle', ruleset: lobbyState.ruleset, access: lobbyState.access },
                        { mode: 'training', label: 'Training', description: 'Practice', ruleset: 'casual', access: 'public' },
                        { mode: '1v1', label: '1v1 Wager Match', description: 'Bet SOL to win', ruleset: 'wager', access: 'public', accent: 'green' },
                    ]}
                    onStartTraining={onStartTraining}
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
                        wagerAmountSol: undefined,
                        totalPotSol: undefined,
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
