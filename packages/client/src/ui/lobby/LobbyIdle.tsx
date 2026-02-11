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
    readonly accent?: 'purple' | 'green' | 'orange';
    readonly p2pTag?: string;
    readonly comingSoon?: boolean;
    readonly optimizingForProduction?: boolean;
}

export interface LobbyIdleProps {
    readonly modes: readonly ModeCardData[];
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
// MODE CARD
// =============================================================================

interface ModeCardProps {
    readonly data: ModeCardData;
    readonly onStart?: (data: ModeCardData) => void;
}

const ModeCard: React.FC<ModeCardProps> = ({ data, onStart }) => {
    const bridge = getGameBridge();
    const isUnavailable = data.mode === '4v4' || data.comingSoon === true || data.optimizingForProduction === true;
    const accent = data.accent ?? 'purple';
    const accentBorder = accent === 'green'
        ? 'rgba(34, 197, 94, 0.45)'
        : accent === 'orange'
            ? 'rgba(249, 115, 22, 0.45)'
            : 'rgba(139, 92, 246, 0.3)';
    const accentBorderHover = accent === 'green'
        ? 'rgba(34, 197, 94, 0.9)'
        : accent === 'orange'
            ? 'rgba(249, 115, 22, 0.95)'
            : 'rgba(139, 92, 246, 0.8)';
    const accentShadow = accent === 'green'
        ? '0 8px 24px rgba(34, 197, 94, 0.3)'
        : accent === 'orange'
            ? '0 8px 24px rgba(249, 115, 22, 0.35)'
            : '0 8px 24px rgba(139, 92, 246, 0.3)';
    const accentTitle = accent === 'green' ? '#bbf7d0' : accent === 'orange' ? '#fed7aa' : '#e9d5ff';
    const accentDesc = accent === 'green' ? '#86efac' : accent === 'orange' ? '#fdba74' : '#c4b5fd';
    const buttonBase = accent === 'green'
        ? 'linear-gradient(135deg, #22c55e, #16a34a)'
        : accent === 'orange'
            ? 'linear-gradient(135deg, #fb923c, #ea580c)'
            : 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
    const buttonHover = accent === 'green'
        ? 'linear-gradient(135deg, #16a34a, #15803d)'
        : accent === 'orange'
            ? 'linear-gradient(135deg, #f97316, #c2410c)'
            : 'linear-gradient(135deg, #7c3aed, #6d28d9)';

    const handleClick = () => {
        if (isUnavailable) return;
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
                cursor: isUnavailable ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
                position: 'relative',
                overflow: 'hidden',
                opacity: isUnavailable ? 0.55 : 1,
            }}
            onMouseEnter={(e) => {
                if (isUnavailable) return;
                e.currentTarget.style.borderColor = accentBorderHover;
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = accentShadow;
            }}
            onMouseLeave={(e) => {
                if (isUnavailable) return;
                e.currentTarget.style.borderColor = accentBorder;
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
            }}
        >
            <h3 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: accentTitle }}>
                {data.label}
                {data.p2pTag && (
                    <span style={{
                        marginLeft: 10,
                        padding: '3px 8px',
                        borderRadius: 999,
                        border: '1px solid rgba(251,146,60,0.55)',
                        color: '#fdba74',
                        fontSize: 11,
                        verticalAlign: 'middle',
                    }}>
                        {data.p2pTag}
                    </span>
                )}
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
                {data.optimizingForProduction && (
                    <span style={{
                        background: 'linear-gradient(135deg, #0ea5e9, #0369a1)',
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#fff',
                    }}>
                        OPTIMIZING FOR PRODUCTION
                    </span>
                )}
                {(isUnavailable || data.comingSoon) && (
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
                disabled={isUnavailable}
                style={{
                    width: '100%',
                    padding: '14px 24px',
                    fontSize: '16px',
                    fontWeight: 700,
                    background: isUnavailable ? 'rgba(148,163,184,0.3)' : buttonBase,
                    border: 'none',
                    borderRadius: '8px',
                    color: '#ffffff',
                    cursor: isUnavailable ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                }}
                onMouseEnter={(e) => {
                    if (isUnavailable) return;
                    e.currentTarget.style.background = buttonHover;
                    e.currentTarget.style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                    if (isUnavailable) return;
                    e.currentTarget.style.background = buttonBase;
                    e.currentTarget.style.transform = 'scale(1)';
                }}
            >
                {isUnavailable ? 'COMING SOON' : 'START MATCHMAKING'}
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
        label: '1v1 P2P',
        description: 'Direct peer-to-peer duel (host-authoritative listen server)',
        ruleset: 'casual',
        access: 'public',
        accent: 'orange',
        p2pTag: 'P2P multiplayer',
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

export const LobbyIdle: React.FC<LobbyIdleProps> = ({
    modes = DEFAULT_MODES,
    onStartTraining,
    onCreateP2PRoom,
    onJoinP2PRoom,
    onFallbackServer1v1,
    p2pStatus,
}) => {
    const bridge = getGameBridge();
    const { connection } = useConnection();
    const { publicKey, connected } = useWallet();
    const { setVisible } = useWalletModal();
    const [wagerOpen, setWagerOpen] = useState(false);
    const [wagerAmount, setWagerAmount] = useState(1);
    const [balanceSol, setBalanceSol] = useState<number | null>(null);
    const [wagerError, setWagerError] = useState<string | null>(null);
    const [wagerLoading, setWagerLoading] = useState(false);
    const [p2pOpen, setP2POpen] = useState(false);
    const [p2pMode, setP2PMode] = useState<'host' | 'join'>('host');
    const [p2pCode, setP2PCode] = useState('');
    const [p2pJoinCode, setP2PJoinCode] = useState('');
    const [p2pError, setP2PError] = useState<string | null>(null);
    const [p2pLoading, setP2PLoading] = useState(false);

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

    React.useEffect(() => {
        if (p2pStatus?.phase === 'failed') {
            setP2PError(p2pStatus.error ?? 'P2P connection failed within 10 seconds.');
            setP2PLoading(false);
            setP2PCode(p2pStatus.code ?? '');
            setP2POpen(true);
        }
    }, [p2pStatus]);

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
                        key={`${mode.mode}-${mode.ruleset}-${mode.label}`}
                        data={mode}
                        onStart={(data) => {
                            if (data.mode === 'training') {
                                onStartTraining?.();
                                return;
                            }
                            if (data.p2pTag) {
                                setP2POpen(true);
                                setP2PError(null);
                                setP2PCode('');
                                setP2PJoinCode('');
                                setP2PMode('host');
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

            {p2pOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.72)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 210,
                    padding: '20px',
                }}>
                    <div style={{
                        width: 'min(560px, 96vw)',
                        background: '#140f0a',
                        border: '1px solid rgba(251,146,60,0.55)',
                        borderRadius: '16px',
                        padding: '24px',
                        color: 'white',
                    }}>
                        <h3 style={{ fontSize: '24px', marginBottom: '8px', color: '#fdba74' }}>1v1 P2P</h3>
                        <p style={{ color: '#fed7aa', marginBottom: '14px' }}>Host creates a join code. Joiner enters code to connect.</p>

                        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                            <button
                                onClick={() => setP2PMode('host')}
                                style={{
                                    flex: 1,
                                    padding: '10px 14px',
                                    borderRadius: 10,
                                    border: p2pMode === 'host' ? '2px solid #fb923c' : '1px solid rgba(251,146,60,0.4)',
                                    background: p2pMode === 'host' ? 'rgba(251,146,60,0.2)' : 'rgba(0,0,0,0.25)',
                                    color: 'white',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                Host Room
                            </button>
                            <button
                                onClick={() => setP2PMode('join')}
                                style={{
                                    flex: 1,
                                    padding: '10px 14px',
                                    borderRadius: 10,
                                    border: p2pMode === 'join' ? '2px solid #fb923c' : '1px solid rgba(251,146,60,0.4)',
                                    background: p2pMode === 'join' ? 'rgba(251,146,60,0.2)' : 'rgba(0,0,0,0.25)',
                                    color: 'white',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                Join Room
                            </button>
                        </div>

                        {p2pMode === 'host' ? (
                            <div>
                                {p2pCode ? (
                                    <div style={{ marginBottom: 14 }}>
                                        <div style={{ color: '#fdba74', marginBottom: 8, fontSize: 13 }}>Share this join code:</div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <input
                                                readOnly
                                                value={p2pCode}
                                                style={{
                                                    flex: 1,
                                                    height: 46,
                                                    borderRadius: 10,
                                                    border: '1px solid rgba(251,146,60,0.5)',
                                                    background: '#1f1408',
                                                    color: '#ffedd5',
                                                    fontSize: 24,
                                                    letterSpacing: '3px',
                                                    textAlign: 'center',
                                                }}
                                            />
                                            <button
                                                onClick={() => navigator.clipboard.writeText(p2pCode)}
                                                style={{
                                                    padding: '0 14px',
                                                    borderRadius: 10,
                                                    border: '1px solid rgba(251,146,60,0.5)',
                                                    background: 'rgba(251,146,60,0.2)',
                                                    color: '#ffedd5',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Copy
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={async () => {
                                            if (!onCreateP2PRoom) return;
                                            setP2PLoading(true);
                                            setP2PError(null);
                                            try {
                                                const code = await onCreateP2PRoom();
                                                setP2PCode(code);
                                            } catch (error: any) {
                                                setP2PError(error?.message ?? 'Failed to create P2P room.');
                                            } finally {
                                                setP2PLoading(false);
                                            }
                                        }}
                                        disabled={p2pLoading}
                                        style={{
                                            width: '100%',
                                            height: 46,
                                            borderRadius: 10,
                                            border: 'none',
                                            background: 'linear-gradient(135deg,#fb923c,#ea580c)',
                                            color: 'white',
                                            fontWeight: 800,
                                            cursor: p2pLoading ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        {p2pLoading ? 'Creating...' : 'Create Room'}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: 10 }}>
                                <input
                                    value={p2pJoinCode}
                                    onChange={(e) => setP2PJoinCode(e.target.value.toUpperCase())}
                                    placeholder="Enter join code"
                                    style={{
                                        height: 46,
                                        borderRadius: 10,
                                        border: '1px solid rgba(251,146,60,0.5)',
                                        background: '#1f1408',
                                        color: '#ffedd5',
                                        padding: '0 12px',
                                        letterSpacing: '2px',
                                    }}
                                />
                                <button
                                    onClick={async () => {
                                        if (!onJoinP2PRoom) return;
                                        setP2PLoading(true);
                                        setP2PError(null);
                                        try {
                                            await onJoinP2PRoom(p2pJoinCode);
                                        } catch (error: any) {
                                            setP2PError(error?.message ?? 'Failed to join P2P room.');
                                        } finally {
                                            setP2PLoading(false);
                                        }
                                    }}
                                    disabled={p2pLoading || !p2pJoinCode.trim()}
                                    style={{
                                        width: '100%',
                                        height: 46,
                                        borderRadius: 10,
                                        border: 'none',
                                        background: 'linear-gradient(135deg,#fb923c,#ea580c)',
                                        color: 'white',
                                        fontWeight: 800,
                                        cursor: p2pLoading ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {p2pLoading ? 'Connecting...' : 'Connect'}
                                </button>
                            </div>
                        )}

                        {p2pError && (
                            <div style={{ marginTop: 12, color: '#fca5a5', fontSize: 14 }}>{p2pError}</div>
                        )}

                        {p2pError && (
                            <button
                                onClick={() => {
                                    setP2POpen(false);
                                    onFallbackServer1v1?.();
                                }}
                                style={{
                                    marginTop: 10,
                                    width: '100%',
                                    height: 42,
                                    borderRadius: 10,
                                    border: '1px solid rgba(148,163,184,0.4)',
                                    background: 'rgba(255,255,255,0.07)',
                                    color: '#e2e8f0',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                }}
                            >
                                Play Server 1v1 instead
                            </button>
                        )}

                        <button
                            onClick={() => setP2POpen(false)}
                            style={{
                                marginTop: 10,
                                width: '100%',
                                height: 40,
                                borderRadius: 10,
                                border: '1px solid rgba(251,146,60,0.3)',
                                background: 'transparent',
                                color: '#fdba74',
                                cursor: 'pointer',
                            }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

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
