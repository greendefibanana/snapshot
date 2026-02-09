/**
 * LobbyCountdown Screen
 * 
 * Shown when lobbyState.phase === "countdown" or "starting"
 * Displays countdown timer before match start.
 */

import React from 'react';

// =============================================================================
// TYPES
// =============================================================================

export type GameMode = '1v1' | '4v4' | 'training';

export interface LobbyPlayer {
    readonly playerId: string;
    readonly displayName: string;
    readonly team: 0 | 1 | 2;
}

export interface LobbyCountdownProps {
    readonly countdownSec: number;
    readonly players: readonly LobbyPlayer[];
    readonly mode: GameMode;
}

// =============================================================================
// HELPERS
// =============================================================================

function getModeLabel(mode: GameMode): string {
    switch (mode) {
        case '1v1': return '1v1 Duel';
        case '4v4': return '4v4 Team Battle';
        case 'training': return 'Training';
    }
}

// =============================================================================
// LOBBY COUNTDOWN SCREEN
// =============================================================================

export const LobbyCountdown: React.FC<LobbyCountdownProps> = ({
    countdownSec,
    players,
    mode,
}) => {
    const team1 = players.filter(p => p.team === 1);
    const team2 = players.filter(p => p.team === 2);

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Animated background pulse */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '400px',
                height: '400px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(139, 92, 246, 0.2), transparent)',
                animation: 'pulse 2s ease-in-out infinite',
            }} />

            {/* Mode badge */}
            <div style={{
                background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                padding: '8px 24px',
                borderRadius: '24px',
                fontSize: '14px',
                fontWeight: 700,
                color: '#fff',
                marginBottom: '32px',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                zIndex: 1,
            }}>
                {getModeLabel(mode)}
            </div>

            {/* Countdown number */}
            <div style={{
                fontSize: '180px',
                fontWeight: 900,
                background: 'linear-gradient(135deg, #a78bfa, #e9d5ff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                marginBottom: '24px',
                animation: 'scaleIn 0.5s ease-out',
                zIndex: 1,
                lineHeight: 1,
            }}>
                {countdownSec}
            </div>

            {/* Match starting text */}
            <h2 style={{
                fontSize: '48px',
                fontWeight: 800,
                background: 'linear-gradient(135deg, #a78bfa, #e9d5ff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                marginBottom: '48px',
                letterSpacing: '2px',
                zIndex: 1,
            }}>
                MATCH STARTING!
            </h2>

            {/* Teams display */}
            <div style={{
                display: 'flex',
                gap: '48px',
                alignItems: 'center',
                zIndex: 1,
            }}>
                {/* Team 1 */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '16px',
                }}>
                    <h3 style={{
                        fontSize: '24px',
                        fontWeight: 700,
                        color: '#60a5fa',
                        marginBottom: '8px',
                    }}>
                        Team 1
                    </h3>
                    {team1.map(p => (
                        <div key={p.playerId} style={{
                            padding: '12px 24px',
                            background: 'rgba(96, 165, 250, 0.1)',
                            border: '2px solid rgba(96, 165, 250, 0.3)',
                            borderRadius: '8px',
                            color: '#93c5fd',
                            fontSize: '16px',
                            fontWeight: 600,
                            minWidth: '200px',
                            textAlign: 'center',
                        }}>
                            {p.displayName}
                        </div>
                    ))}
                </div>

                {/* VS */}
                <div style={{
                    fontSize: '48px',
                    fontWeight: 900,
                    color: '#a78bfa',
                    textShadow: '0 0 20px rgba(167, 139, 250, 0.5)',
                }}>
                    VS
                </div>

                {/* Team 2 */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '16px',
                }}>
                    <h3 style={{
                        fontSize: '24px',
                        fontWeight: 700,
                        color: '#f87171',
                        marginBottom: '8px',
                    }}>
                        Team 2
                    </h3>
                    {team2.map(p => (
                        <div key={p.playerId} style={{
                            padding: '12px 24px',
                            background: 'rgba(248, 113, 113, 0.1)',
                            border: '2px solid rgba(248, 113, 113, 0.3)',
                            borderRadius: '8px',
                            color: '#fca5a5',
                            fontSize: '16px',
                            fontWeight: 600,
                            minWidth: '200px',
                            textAlign: 'center',
                        }}>
                            {p.displayName}
                        </div>
                    ))}
                </div>
            </div>

            {/* Animations */}
            <style>{`
                @keyframes pulse {
                    0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.3; }
                    50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.1; }
                }
                @keyframes scaleIn {
                    from { transform: scale(0.5); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default LobbyCountdown;
