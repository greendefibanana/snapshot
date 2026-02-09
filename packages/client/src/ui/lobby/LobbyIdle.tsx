/**
 * LobbyIdle Screen
 * 
 * Shown when lobbyState.phase === "idle"
 * Displays mode cards for match selection.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getGameBridge } from '../../bridge/GameBridge';

// =============================================================================
// TYPES
// =============================================================================

export type GameMode = '1v1' | '4v4' | 'training';
export type Ruleset = 'casual' | 'wager';
export type AccessType = 'public' | 'token' | 'nft' | 'friends';

export interface ModeCardData {
    readonly mode: GameMode;
    readonly label: string;
    readonly description: string;
    readonly ruleset: Ruleset;
    readonly access: AccessType;
    readonly accent?: 'purple' | 'green';
}

export interface LobbyIdleProps {
    readonly modes: readonly ModeCardData[];
    readonly onStartTraining?: () => void;
}

// =============================================================================
// MODE CARD
// =============================================================================

interface ModeCardProps {
    readonly data: ModeCardData;
    readonly onStart?: (data: ModeCardData) => void;
}

const ModeCard: React.FC<ModeCardProps> = ({ data, onStart }) => {
    const bridge = getGameBridge();
    const isComingSoon = data.mode === '4v4';
    const accent = data.accent ?? 'purple';
    const accentBorder = accent === 'green' ? 'rgba(34, 197, 94, 0.45)' : 'rgba(139, 92, 246, 0.3)';
    const accentBorderHover = accent === 'green' ? 'rgba(34, 197, 94, 0.9)' : 'rgba(139, 92, 246, 0.8)';
    const accentShadow = accent === 'green' ? '0 8px 24px rgba(34, 197, 94, 0.3)' : '0 8px 24px rgba(139, 92, 246, 0.3)';
    const accentTitle = accent === 'green' ? '#bbf7d0' : '#e9d5ff';
    const accentDesc = accent === 'green' ? '#86efac' : '#c4b5fd';
    const buttonBase = accent === 'green'
        ? 'linear-gradient(135deg, #22c55e, #16a34a)'
        : 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
    const buttonHover = accent === 'green'
        ? 'linear-gradient(135deg, #16a34a, #15803d)'
        : 'linear-gradient(135deg, #7c3aed, #6d28d9)';

    const handleClick = () => {
        if (isComingSoon) return;
        console.log('[LobbyIdle] Mode selected:', data.mode, data.ruleset);
        if (onStart) {
            onStart(data);
            return;
        }
        // Emit join_queue event to start matchmaking
        bridge.sendToGame({
            type: 'join_queue',
            mode: data.mode,
            ruleset: data.ruleset || 'casual',
        });
    };

    return (
        <div
            style={{
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1))',
                border: `2px solid ${accentBorder}`,
                borderRadius: '12px',
                padding: '24px',
                cursor: isComingSoon ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
                position: 'relative',
                overflow: 'hidden',
                opacity: isComingSoon ? 0.55 : 1,
            }}
            onMouseEnter={(e) => {
                if (isComingSoon) return;
                e.currentTarget.style.borderColor = accentBorderHover;
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = accentShadow;
            }}
            onMouseLeave={(e) => {
                if (isComingSoon) return;
                e.currentTarget.style.borderColor = accentBorder;
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
            }}
        >
            <h3 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: accentTitle }}>
                {data.label}
            </h3>
            <p style={{ color: accentDesc, marginBottom: '20px', fontSize: '14px' }}>
                {data.description}
            </p>

            {/* Badges */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {data.ruleset === 'wager' && (
                    <span style={{
                        background: accent === 'green'
                            ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                            : 'linear-gradient(135deg, #f59e0b, #d97706)',
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#fff',
                    }}>
                        WAGER
                    </span>
                )}
                {isComingSoon && (
                    <span style={{
                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#fff',
                    }}>
                        COMING SOON
                    </span>
                )}
                {data.access !== 'public' && (
                    <span style={{
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#fff',
                    }}>
                        {data.access.toUpperCase()}
                    </span>
                )}
            </div>

            <button
                onClick={handleClick}
                disabled={isComingSoon}
                style={{
                    width: '100%',
                    padding: '14px 24px',
                    fontSize: '16px',
                    fontWeight: 700,
                    background: isComingSoon ? 'rgba(148,163,184,0.3)' : buttonBase,
                    border: 'none',
                    borderRadius: '8px',
                    color: '#ffffff',
                    cursor: isComingSoon ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                }}
                onMouseEnter={(e) => {
                    if (isComingSoon) return;
                    e.currentTarget.style.background = buttonHover;
                    e.currentTarget.style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                    if (isComingSoon) return;
                    e.currentTarget.style.background = buttonBase;
                    e.currentTarget.style.transform = 'scale(1)';
                }}
            >
                {isComingSoon ? 'COMING SOON' : 'START MATCHMAKING'}
            </button>
        </div>
    );
};

// =============================================================================
// LOBBY IDLE SCREEN
// =============================================================================

const DEFAULT_MODES: ModeCardData[] = [
    {
        mode: '1v1',
        label: '1v1 Duel',
        description: 'Face off against one opponent',
        ruleset: 'casual',
        access: 'public',
    },
    {
        mode: '4v4',
        label: '4v4 Team Battle',
        description: 'Team-based combat',
        ruleset: 'casual',
        access: 'public',
    },
    {
        mode: 'training',
        label: 'Training',
        description: 'Practice solo or with bots',
        ruleset: 'casual',
        access: 'public',
    },
    {
        mode: '1v1',
        label: '1v1 Wager Match',
        description: 'Bet SOL to win',
        ruleset: 'wager',
        access: 'public',
        accent: 'green',
    },
];

export const LobbyIdle: React.FC<LobbyIdleProps> = ({ modes = DEFAULT_MODES, onStartTraining }) => {
    const bridge = getGameBridge();
    const { connection } = useConnection();
    const { publicKey, connected } = useWallet();
    const { setVisible } = useWalletModal();
    const [wagerOpen, setWagerOpen] = useState(false);
    const [wagerAmount, setWagerAmount] = useState(1);
    const [balanceSol, setBalanceSol] = useState<number | null>(null);
    const [wagerError, setWagerError] = useState<string | null>(null);
    const [wagerLoading, setWagerLoading] = useState(false);

    const refreshBalance = useCallback(async () => {
        if (!publicKey) {
            setBalanceSol(null);
            return;
        }
        const lamports = await connection.getBalance(publicKey, 'confirmed');
        setBalanceSol(lamports / LAMPORTS_PER_SOL);
    }, [connection, publicKey]);

    const openWagerModal = useCallback(() => {
        if (!connected) {
            setVisible(true);
            return;
        }
        setWagerError(null);
        setWagerOpen(true);
        void refreshBalance();
    }, [connected, refreshBalance, setVisible]);

    const handleConfirmWager = useCallback(async () => {
        if (!publicKey || !connected) {
            setVisible(true);
            return;
        }
        if (balanceSol !== null && balanceSol < wagerAmount) {
            setWagerError('Insufficient SOL balance.');
            return;
        }
        setWagerError(null);
        setWagerLoading(true);
        try {
            bridge.sendToGame({
                type: 'join_queue',
                mode: '1v1',
                ruleset: 'wager',
                wagerAmountSol: wagerAmount,
            });
            setWagerOpen(false);
        } catch (error: any) {
            console.error('Wager transfer failed', error);
            setWagerError(error?.message ?? 'Transaction failed.');
        } finally {
            setWagerLoading(false);
        }
    }, [publicKey, connected, wagerAmount, balanceSol, bridge, setVisible]);

    const modeCards = useMemo(() => modes, [modes]);

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
            padding: '40px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
        }}>
            <h2 style={{
                fontSize: '48px',
                fontWeight: 800,
                marginBottom: '40px',
                background: 'linear-gradient(135deg, #a78bfa, #e9d5ff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                letterSpacing: '1px',
            }}>
                SELECT MODE
            </h2>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '24px',
                maxWidth: '1200px',
                width: '100%',
            }}>
                {modeCards.map((mode) => (
                    <ModeCard
                        key={`${mode.mode}-${mode.ruleset}`}
                        data={mode}
                        onStart={(data) => {
                            if (data.mode === 'training') {
                                onStartTraining?.();
                                return;
                            }
                            if (data.ruleset === 'wager') {
                                openWagerModal();
                                return;
                            }
                            bridge.sendToGame({
                                type: 'join_queue',
                                mode: data.mode,
                                ruleset: data.ruleset || 'casual',
                            });
                        }}
                    />
                ))}
            </div>

            {wagerOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 200,
                    padding: '20px',
                }}>
                    <div style={{
                        width: 'min(520px, 95vw)',
                        background: '#0b1120',
                        border: '1px solid rgba(34,197,94,0.4)',
                        borderRadius: '16px',
                        padding: '28px',
                        color: 'white',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                    }}>
                        <h3 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: '#bbf7d0' }}>
                            Choose Wager Amount
                        </h3>
                        <p style={{ color: '#86efac', marginBottom: '20px' }}>
                            Bet SOL to win. Wagers are locked in escrow.
                        </p>

                        <div style={{ marginBottom: '16px', color: '#e2e8f0' }}>
                            Balance: {balanceSol !== null ? `${balanceSol.toFixed(3)} SOL` : '—'}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                            {[0.1, 0.5, 1, 3, 5].map((amount) => {
                                const active = wagerAmount === amount;
                                return (
                                    <button
                                        key={amount}
                                        onClick={() => setWagerAmount(amount)}
                                        style={{
                                            padding: '12px',
                                            borderRadius: '10px',
                                            border: active ? '2px solid #22c55e' : '1px solid rgba(148,163,184,0.3)',
                                            background: active ? 'rgba(34,197,94,0.2)' : 'rgba(15,23,42,0.6)',
                                            color: 'white',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {amount} SOL
                                    </button>
                                );
                            })}
                        </div>

                        {wagerError && (
                            <div style={{ color: '#f87171', marginBottom: '12px' }}>
                                {wagerError}
                            </div>
                        )}

                        <button
                            onClick={handleConfirmWager}
                            disabled={wagerLoading}
                            style={{
                                width: '100%',
                                padding: '14px 24px',
                                fontSize: '16px',
                                fontWeight: 700,
                                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                border: 'none',
                                borderRadius: '10px',
                                color: '#ffffff',
                                cursor: wagerLoading ? 'not-allowed' : 'pointer',
                                opacity: wagerLoading ? 0.7 : 1,
                                letterSpacing: '0.5px',
                                textTransform: 'uppercase',
                            }}
                        >
                            {wagerLoading ? 'Confirming...' : 'Confirm & Lock Wager'}
                        </button>

                        <button
                            onClick={() => setWagerOpen(false)}
                            disabled={wagerLoading}
                            style={{
                                marginTop: '12px',
                                width: '100%',
                                padding: '10px 24px',
                                fontSize: '14px',
                                fontWeight: 600,
                                background: 'transparent',
                                border: '1px solid rgba(148,163,184,0.3)',
                                borderRadius: '10px',
                                color: '#cbd5f5',
                                cursor: wagerLoading ? 'not-allowed' : 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LobbyIdle;
