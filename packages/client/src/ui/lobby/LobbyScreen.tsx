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
    readonly onCreateP2PRoom?: () => Promise<string>;
    readonly onJoinP2PRoom?: (code: string) => Promise<void>;
    readonly onFallbackServer1v1?: () => void;
    readonly p2pStatus?: {
        phase: 'idle' | 'hosting' | 'connecting' | 'connected' | 'failed';
        code?: string;
        error?: string;
    };
}

// =============================================================================
// LOBBY SCREEN
// =============================================================================

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
    lobbyState,
    onStartTraining,
    onCreateP2PRoom,
    onJoinP2PRoom,
    onFallbackServer1v1,
    p2pStatus,
}) => {
    switch (lobbyState.phase) {
        case 'idle':
            return (
                <LobbyIdle
                    modes={[
                        {
                            mode: '1v1',
                            label: '1v1 Duel',
                            description: 'Face off',
                            ruleset: lobbyState.ruleset,
                            access: lobbyState.access,
                            optimizingForProduction: true,
                            comingSoon: true,
                        },
                        { mode: '4v4', label: '4v4 Team', description: 'Team battle', ruleset: lobbyState.ruleset, access: lobbyState.access, comingSoon: true },
                        { mode: 'training', label: 'Training', description: 'Practice', ruleset: 'casual', access: 'public' },
                        { mode: '1v1', label: '1v1 P2P', description: 'Direct peer-to-peer duel', ruleset: 'casual', access: 'public', accent: 'orange', p2pTag: 'P2P multiplayer' },
                        {
                            mode: '1v1',
                            label: '1v1 Wager Match',
                            description: 'Bet SOL to win',
                            ruleset: 'wager',
                            access: 'public',
                            accent: 'green',
                            optimizingForProduction: true,
                            comingSoon: true,
                        },
                    ]}
                    {...(onStartTraining ? { onStartTraining } : {})}
                    {...(onCreateP2PRoom ? { onCreateP2PRoom } : {})}
                    {...(onJoinP2PRoom ? { onJoinP2PRoom } : {})}
                    {...(onFallbackServer1v1 ? { onFallbackServer1v1 } : {})}
                    {...(p2pStatus ? { p2pStatus } : {})}
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
