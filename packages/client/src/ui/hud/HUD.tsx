/**
 * HUD Component
 * 
 * In-game heads-up display showing health, ammo, abilities, etc.
 * Designed for minimal, efficient updates.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { getGameBridge, type UIGameState, type GameToUIEvent } from '../../bridge/GameBridge';
// KillFeedEntry type is available via GameToUIEvent

interface HUDProps {
    matchMode?: string | null;
    matchRuleset?: string | null;
}

// =============================================================================
// STYLES
// =============================================================================

const styles = {
    container: {
        position: 'fixed' as const,
        inset: 0,
        pointerEvents: 'none' as const,
        fontFamily: "'Inter', 'Roboto', sans-serif",
        color: '#ffffff',
        userSelect: 'none' as const,
    },
    toast: {
        position: 'absolute' as const,
        top: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 20px',
        borderRadius: 10,
        fontWeight: 700,
        fontSize: 16,
        letterSpacing: '0.3px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        textTransform: 'uppercase' as const,
        background: 'rgba(15,23,42,0.9)',
    },
    toastSuccess: {
        border: '1px solid rgba(34,197,94,0.6)',
        color: '#bbf7d0',
    },
    toastError: {
        border: '1px solid rgba(239,68,68,0.6)',
        color: '#fecaca',
    },
    toastWarning: {
        border: '1px solid rgba(245,158,11,0.6)',
        color: '#fde68a',
    },
    toastInfo: {
        border: '1px solid rgba(139,92,246,0.6)',
        color: '#e9d5ff',
    },
    preRoundOverlay: {
        position: 'absolute' as const,
        top: 76,
        left: '50%',
        transform: 'translateX(-50%)',
        minWidth: 420,
        maxWidth: '90vw',
        borderRadius: 12,
        padding: '14px 16px',
        background: 'rgba(8,12,22,0.9)',
        border: '1px solid rgba(255,255,255,0.18)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        pointerEvents: 'auto' as const,
    },
    preRoundTitle: {
        fontSize: 13,
        fontWeight: 800,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.6px',
        color: '#e2e8f0',
        marginBottom: 8,
    },
    preRoundCountdown: {
        fontSize: 22,
        fontWeight: 900,
        color: '#fde68a',
        marginBottom: 10,
    },
    characterRow: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 8,
    },
    characterBtn: {
        height: 38,
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.24)',
        background: 'rgba(255,255,255,0.06)',
        color: '#e5e7eb',
        fontSize: 12,
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.4px',
        cursor: 'pointer',
    },
    characterBtnSelected: {
        border: '1px solid rgba(250,204,21,0.8)',
        background: 'rgba(250,204,21,0.16)',
        color: '#fef9c3',
    },

    // Bottom left - Health/Shield
    healthContainer: {
        position: 'absolute' as const,
        bottom: 40,
        left: 40,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 8,
    },
    movementHints: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 4,
        padding: '8px 10px',
        width: 300,
        borderRadius: 6,
        background: 'rgba(0, 0, 0, 0.55)',
        border: '1px solid rgba(255, 255, 255, 0.16)',
        fontSize: 11,
        lineHeight: 1.2,
        letterSpacing: '0.2px',
        color: 'rgba(255, 255, 255, 0.92)',
    },
    movementTitle: {
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.8px',
        textTransform: 'uppercase' as const,
        opacity: 0.8,
    },
    movementLine: {
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap' as const,
    },
    movementKey: {
        display: 'inline-block',
        minWidth: 22,
        padding: '2px 6px',
        borderRadius: 4,
        background: 'rgba(255, 255, 255, 0.12)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        fontSize: 10,
        fontWeight: 700,
        textAlign: 'center' as const,
    },
    healthBar: {
        width: 300,
        height: 24,
        background: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 4,
        overflow: 'hidden' as const,
        border: '1px solid rgba(255, 255, 255, 0.2)',
    },
    healthFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #27ae60, #2ecc71)',
        transition: 'width 0.1s ease-out',
    },
    shieldFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #2980b9, #3498db)',
        transition: 'width 0.1s ease-out',
    },
    healthText: {
        position: 'absolute' as const,
        left: 10,
        top: '50%',
        transform: 'translateY(-50%)',
        fontSize: 14,
        fontWeight: 600,
        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
    },

    // Bottom right - Ammo/Weapon
    ammoContainer: {
        position: 'absolute' as const,
        bottom: 40,
        right: 40,
        textAlign: 'right' as const,
    },
    ammoCount: {
        fontSize: 48,
        fontWeight: 700,
        letterSpacing: -2,
        textShadow: '0 2px 4px rgba(0,0,0,0.8)',
    },
    ammoMax: {
        fontSize: 20,
        opacity: 0.7,
        marginLeft: 4,
    },
    weaponName: {
        fontSize: 14,
        opacity: 0.7,
        marginTop: 4,
    },
    reloadIndicator: {
        fontSize: 16,
        color: '#f39c12',
        animation: 'pulse 0.5s infinite',
    },

    // Right side - Abilities
    abilitiesContainer: {
        position: 'absolute' as const,
        right: 40,
        bottom: 120,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 12,
    },
    abilityBox: {
        width: 60,
        height: 60,
        background: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 8,
        border: '2px solid rgba(255, 255, 255, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        fontWeight: 700,
        position: 'relative' as const,
    },
    abilityReady: {
        borderColor: '#2ecc71',
        boxShadow: '0 0 10px rgba(46, 204, 113, 0.5)',
    },
    abilityCooldownOverlay: {
        position: 'absolute' as const,
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
    },
    ultimateCharge: {
        position: 'absolute' as const,
        bottom: -8,
        left: 0,
        right: 0,
        height: 4,
        background: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 2,
        overflow: 'hidden' as const,
    },
    ultimateChargeFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #9b59b6, #8e44ad)',
        transition: 'width 0.2s ease-out',
    },

    // Top center - Match info
    matchInfoContainer: {
        position: 'absolute' as const,
        top: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 30,
        background: 'rgba(0, 0, 0, 0.6)',
        padding: '10px 30px',
        borderRadius: 8,
    },
    teamScore: {
        fontSize: 32,
        fontWeight: 700,
    },
    timer: {
        fontSize: 24,
        fontWeight: 500,
        fontFamily: 'monospace',
    },

    // Top right - Stats
    statsContainer: {
        position: 'absolute' as const,
        top: 20,
        right: 20,
        textAlign: 'right' as const,
        fontSize: 14,
        opacity: 0.7,
    },

    // Top left - Kill feed
    killFeedContainer: {
        position: 'absolute' as const,
        top: 80,
        left: 20,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 4,
        maxWidth: 350,
    },
    killFeedEntry: {
        padding: '6px 12px',
        background: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 4,
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        animation: 'slideIn 0.2s ease-out',
    },

    // Center - Crosshair
    // Center - Crosshair Container
    crosshairContainer: {
        position: 'absolute' as const,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 30,
        height: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        pointerEvents: 'none' as const,
    },
    // Horizontal line
    crosshairH: {
        position: 'absolute' as const,
        width: 24,
        height: 2,
        background: '#FFFF00', // Bright Yellow
        boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
    },
    // Vertical line
    crosshairV: {
        position: 'absolute' as const,
        width: 2,
        height: 24,
        background: '#FFFF00', // Bright Yellow
        boxShadow: '1px 0 2px rgba(0,0,0,0.5)',
    },
    // Hit Marker (Red X)
    hitMarker: {
        position: 'absolute' as const,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%) rotate(45deg)',
        width: 20,
        height: 20,
    },
    hitMarkerLine1: {
        position: 'absolute' as const,
        width: 20,
        height: 2,
        background: '#e74c3c', // Red
        top: 9,
        left: 0,
    },
    hitMarkerLine2: {
        position: 'absolute' as const,
        width: 2,
        height: 20,
        background: '#e74c3c', // Red
        top: 0,
        left: 9,
    },
    // Optional center dot
    crosshairDot: {
        position: 'absolute' as const,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 4,
        height: 4,
        background: '#ffffff',
        borderRadius: '50%',
    },
    crosshairHit: {
        background: '#e74c3c',
        transform: 'translate(-50%, -50%) scale(1.5)',
        transition: 'transform 0.1s ease-out, background 0.1s ease-out',
    },
} as const;

// =============================================================================
// HUD COMPONENT
// =============================================================================

export const HUD: React.FC<HUDProps> = ({ matchMode, matchRuleset }) => {
    const bridge = getGameBridge();
    const [state, setState] = useState<UIGameState>(bridge.getState());
    const [showHitMarker, setShowHitMarker] = useState(false);
    const [endCountdown, setEndCountdown] = useState<number | null>(null);
    const [toast, setToast] = useState<{ message: string; severity: 'info' | 'error' | 'success' | 'warning' } | null>(null);
    const localPlayerId = bridge.getLocalPlayerId?.();
    const characterLabel = (id: string): string => {
        if (!id) return 'Unknown';
        return id.charAt(0).toUpperCase() + id.slice(1);
    };

    // Subscribe to game state updates
    useEffect(() => {
        const unsubscribe = bridge.subscribeToGame((event: GameToUIEvent) => {
            if (event.type === 'state_update') {
                setState(prev => ({ ...prev, ...event.state }));
            } else if (event.type === 'hit_marker') {
                setShowHitMarker(true);
                setTimeout(() => setShowHitMarker(false), 100);
            } else if (event.type === 'kill_feed') {
                const entry = event.entry;
                setState(prev => ({
                    ...prev,
                    killFeed: [entry, ...prev.killFeed.slice(0, 4)],
                }));
                window.setTimeout(() => {
                    setState(prev => ({
                        ...prev,
                        killFeed: prev.killFeed.filter(e => e.id !== entry.id),
                    }));
                }, 7000);
            } else if (event.type === 'game_message') {
                setToast({ message: event.message, severity: event.severity ?? 'info' });
                window.setTimeout(() => setToast(null), 5000);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [bridge]);

    useEffect(() => {
        if (!state.isGameOver) {
            setEndCountdown(null);
            return;
        }
        setEndCountdown(5);
        const interval = window.setInterval(() => {
            setEndCountdown(prev => {
                if (prev === null) return null;
                return prev > 0 ? prev - 1 : 0;
            });
        }, 1000);
        return () => window.clearInterval(interval);
    }, [state.isGameOver]);

    useEffect(() => {
        if (!state.preRoundActive) return;
        setToast({ message: 'Select your character', severity: 'info' });
        const timeout = window.setTimeout(() => setToast(null), 3000);
        return () => window.clearTimeout(timeout);
    }, [state.preRoundActive]);

    // Format time
    const formatTime = useCallback((seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }, []);

    const normalizedMode = (matchMode ?? '').toLowerCase();
    const normalizedRuleset = (matchRuleset ?? '').toLowerCase();
    const showMovementHints =
        normalizedMode === 'training' ||
        normalizedMode === '1v1' ||
        normalizedRuleset === 'wager';

    return (
        <div style={styles.container}>
            {state.preRoundActive && (
                <div style={styles.preRoundOverlay}>
                    <div style={styles.preRoundTitle}>Character Select</div>
                    <div style={styles.preRoundCountdown}>
                        {state.preRoundRemainingSec}s until round start
                    </div>
                    <div style={styles.characterRow}>
                        {state.availableCharacterModelIds.map((modelId) => (
                            <button
                                key={modelId}
                                style={{
                                    ...styles.characterBtn,
                                    ...(state.selectedCharacterModelId === modelId ? styles.characterBtnSelected : {}),
                                }}
                                onClick={() => bridge.sendToGame({ type: 'select_character', characterModelId: modelId })}
                            >
                                {characterLabel(modelId)}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {toast && (
                <div
                    style={{
                        ...styles.toast,
                        ...(toast.severity === 'success'
                            ? styles.toastSuccess
                            : toast.severity === 'error'
                                ? styles.toastError
                                : toast.severity === 'warning'
                                    ? styles.toastWarning
                                    : styles.toastInfo),
                    }}
                >
                    {toast.message}
                </div>
            )}
            {/* Crosshair - Always visible */}
            <div
                style={{
                    ...styles.crosshairContainer,
                    display: 'flex',
                }}
            >
                {/* Crosshair Lines */}
                <div style={styles.crosshairH} />
                <div style={styles.crosshairV} />

                {/* Hit Marker (Overlay on center) */}
                {showHitMarker && (
                    <div style={styles.hitMarker}>
                        <div style={styles.hitMarkerLine1} />
                        <div style={styles.hitMarkerLine2} />
                    </div>
                )}
            </div>

            {/* Health (Local Only) */}
            <div style={styles.healthContainer}>
                {/* Health bar */}
                <div style={styles.healthBar}>
                    <div
                        style={{
                            ...styles.healthFill,
                            width: `${(state.health / state.maxHealth) * 100}%`,
                        }}
                    />
                    <span style={styles.healthText}>
                        {Math.ceil(state.health)}
                    </span>
                </div>
                {showMovementHints && (
                    <div style={styles.movementHints}>
                        <div style={styles.movementTitle}>Movement</div>
                        <div style={styles.movementLine}>
                            <span style={styles.movementKey}>WASD</span>
                            <span>Move</span>
                            <span style={styles.movementKey}>Space</span>
                            <span>Jump</span>
                        </div>
                        <div style={styles.movementLine}>
                            <span style={styles.movementKey}>Shift</span>
                            <span>Sprint</span>
                            <span style={styles.movementKey}>C</span>
                            <span>Slide</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Ammo */}
            <div style={styles.ammoContainer}>
                {state.isReloading ? (
                    <div style={styles.reloadIndicator}>RELOADING...</div>
                ) : (
                    <>
                        <span style={styles.ammoCount}>
                            {state.ammo}
                            <span style={styles.ammoMax}>/ {state.maxAmmo}</span>
                        </span>
                    </>
                )}
            </div>

            {/* Abilities */}
            <div style={styles.abilitiesContainer}>
                {/* Ultimate */}
                <div
                    style={{
                        ...styles.abilityBox,
                        ...(state.ultimateReady ? styles.abilityReady : {}),
                    }}
                >
                    Q
                    {!state.ultimateReady && (
                        <>
                            <div style={styles.abilityCooldownOverlay}>
                                {Math.ceil(state.ultimateCharge)}%
                            </div>
                            <div style={styles.ultimateCharge}>
                                <div
                                    style={{
                                        ...styles.ultimateChargeFill,
                                        width: `${state.ultimateCharge}%`,
                                    }}
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Tactical */}
                <div
                    style={{
                        ...styles.abilityBox,
                        ...(state.tacticalCooldown <= 0 ? styles.abilityReady : {}),
                    }}
                >
                    E
                    {state.tacticalCooldown > 0 && (
                        <div style={styles.abilityCooldownOverlay}>
                            {Math.ceil(state.tacticalCooldown)}
                        </div>
                    )}
                </div>
            </div>

            {/* Match Info */}
            <div style={styles.matchInfoContainer}>
                <span style={{ ...styles.teamScore, color: '#3498db' }}>
                    {state.teamScores[1] ?? 0}
                </span>
                <span style={styles.timer}>
                    {formatTime(state.matchTimeRemaining)}
                </span>
                <span style={{ ...styles.teamScore, color: '#e74c3c' }}>
                    {state.teamScores[2] ?? 0}
                </span>
            </div>

            {/* Stats */}
            <div style={styles.statsContainer}>
                <div>FPS: {Math.max(0, Math.round(state.fps))}</div>
                <div>Frame: {Math.max(0, state.frameTimeMs).toFixed(1)}ms</div>
                <div>Ping: {state.ping}ms</div>
                <div>K/D/A: {state.kills}/{state.deaths}/{state.assists}</div>
            </div>

            {/* Kill Feed */}
            <div style={styles.killFeedContainer}>
                {state.killFeed.map((entry) => {
                    const localId = localPlayerId ?? null;
                    let killerColor = entry.killerTeam === 1 ? '#3498db' : '#e74c3c';
                    let victimColor = entry.victimTeam === 1 ? '#3498db' : '#e74c3c';
                    if (localId && entry.victimId === localId) {
                        killerColor = '#e74c3c';
                        victimColor = '#3498db';
                    } else if (localId && entry.killerId === localId) {
                        killerColor = '#3498db';
                        victimColor = '#e74c3c';
                    }
                    return (
                        <div key={entry.id} style={styles.killFeedEntry}>
                            <span style={{ color: killerColor }}>
                                {entry.killerName}
                            </span>
                            <span style={{ opacity: 0.6 }}>{entry.weapon}</span>
                            <span style={{ color: victimColor }}>
                                {entry.victimName}
                            </span>
                        </div>
                    );
                })}
            </div>

            {state.isGameOver && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        background: 'rgba(0,0,0,0.6)',
                        pointerEvents: 'none',
                        gap: 12,
                    }}
                >
                    <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: 2 }}>
                        {state.winnerName && localPlayerId && state.winnerName === localPlayerId ? 'YOU WIN' : 'YOU LOSE'}
                    </div>
                    {endCountdown !== null && (
                        <div style={{ fontSize: 18, opacity: 0.8 }}>
                            Returning to lobby in {endCountdown}s
                        </div>
                    )}
                </div>
            )}

            {/* CSS Animation */}
            <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes slideIn {
          from { transform: translateX(-20px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
        </div>
    );
};

export default HUD;
