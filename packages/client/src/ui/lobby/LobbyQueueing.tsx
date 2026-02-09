/**
 * LobbyQueueing Screen
 * 
 * Shown when lobbyState.phase === "queueing"
 * Displays search status and wait time.
 */

import React from 'react';
import { getGameBridge } from '../../bridge/GameBridge';

// =============================================================================
// TYPES
// =============================================================================

export type GameMode = '1v1' | '4v4' | 'training';
export type Ruleset = 'casual' | 'wager';

export interface QueueState {
    readonly waitTimeSec: number;
    readonly mode: GameMode;
    readonly ruleset: Ruleset;
    readonly playersInQueue?: number;
    readonly wagerAmountSol?: number;
    readonly totalPotSol?: number;
}

export interface LobbyQueueingProps {
    readonly queue: QueueState;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getModeLabel(mode: GameMode): string {
    switch (mode) {
        case '1v1': return '1v1 Duel';
        case '4v4': return '4v4 Team Battle';
        case 'training': return 'Training';
    }
}

// =============================================================================
// LOBBY QUEUEING SCREEN
// =============================================================================

export const LobbyQueueing: React.FC<LobbyQueueingProps> = ({ queue }) => {
    const bridge = getGameBridge();

    const handleCancel = () => {
        console.log('[LobbyQueueing] Cancel clicked');
        bridge.sendToGame({ type: 'leave_queue' });
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
        }}>
            {/* Animated searching indicator */}
            <div style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                border: '6px solid rgba(139, 92, 246, 0.2)',
                borderTopColor: '#8b5cf6',
                animation: 'spin 1s linear infinite',
                marginBottom: '32px',
            }} />

            <h2 style={{
                fontSize: '36px',
                fontWeight: 700,
                marginBottom: '16px',
                background: 'linear-gradient(135deg, #a78bfa, #e9d5ff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
            }}>
                {queue.ruleset === 'wager' && queue.wagerAmountSol
                    ? `Finding opponent (${queue.wagerAmountSol} SOL match)...`
                    : 'Searching for Match...'}
            </h2>

            {/* Mode info */}
            <div style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                marginBottom: '24px',
                flexWrap: 'wrap',
            }}>
                <span style={{
                    fontSize: '20px',
                    fontWeight: 600,
                    color: '#c4b5fd',
                }}>
                    {getModeLabel(queue.mode)}
                </span>
                {queue.ruleset === 'wager' && (
                    <span style={{
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#fff',
                    }}>
                        WAGER
                    </span>
                )}
                {queue.ruleset === 'wager' && queue.totalPotSol && (
                    <span style={{
                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#fff',
                    }}>
                        Total Pot: {queue.totalPotSol} SOL
                    </span>
                )}
            </div>

            {/* Wait timer */}
            <div style={{
                fontSize: '48px',
                fontWeight: 800,
                color: '#e9d5ff',
                marginBottom: '16px',
                fontFamily: 'monospace',
            }}>
                {formatTime(queue.waitTimeSec)}
            </div>

            {/* Players in queue */}
            {queue.playersInQueue !== undefined && (
                <p style={{
                    color: '#a78bfa',
                    fontSize: '16px',
                    marginBottom: '32px',
                }}>
                    {queue.playersInQueue} player{queue.playersInQueue !== 1 ? 's' : ''} in queue
                </p>
            )}

            {/* Cancel button */}
            <button
                onClick={handleCancel}
                style={{
                    padding: '14px 48px',
                    fontSize: '16px',
                    fontWeight: 700,
                    background: 'rgba(239, 68, 68, 0.8)',
                    border: '2px solid #ef4444',
                    borderRadius: '8px',
                    color: '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#ef4444';
                    e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.8)';
                    e.currentTarget.style.transform = 'scale(1)';
                }}
            >
                CANCEL
            </button>

            {/* Add keyframe animation */}
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default LobbyQueueing;
