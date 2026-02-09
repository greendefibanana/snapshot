/**
 * MockLobbyApp - Dev-only lobby state switcher
 * 
 * Manually switch between lobby phases to preview screens.
 * No external libs, simple local state.
 */

import React, { useState } from 'react';
import './lobby-animations.css';

// =============================================================================
// TYPES (inline to avoid import issues)
// =============================================================================

type LobbyPhase = 'idle' | 'queueing' | 'assembling' | 'ready_check' | 'countdown' | 'error';
type GameMode = '1v1' | '4v4' | 'training';
type Ruleset = 'casual' | 'wager';

interface PlayerSlot {
    playerId: string;
    displayName: string;
    team: 0 | 1 | 2;
    slot: number;
    isReady: boolean;
    isHost: boolean;
}

// =============================================================================
// MOCK DATA
// =============================================================================

const PHASES: LobbyPhase[] = ['idle', 'queueing', 'assembling', 'ready_check', 'countdown', 'error'];

const MOCK_PLAYERS: PlayerSlot[] = [
    { playerId: 'p1', displayName: 'Player1', team: 1, isReady: true, slot: 0, isHost: true },
    { playerId: 'p2', displayName: 'Player2', team: 1, isReady: true, slot: 1, isHost: false },
    { playerId: 'p3', displayName: 'Player3', team: 2, isReady: false, slot: 2, isHost: false },
    { playerId: 'p4', displayName: 'Player4', team: 2, isReady: true, slot: 3, isHost: false },
];

// =============================================================================
// STYLES
// =============================================================================

const styles = {
    container: {
        minHeight: '100vh',
        background: '#0a0a14',
        color: '#fff',
        fontFamily: "'Inter', sans-serif",
        padding: 40,
    },
    controls: {
        marginBottom: 30,
        padding: 20,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
    },
    phaseButtons: {
        display: 'flex',
        gap: 10,
        marginTop: 10,
    },
    phaseButton: {
        padding: '10px 20px',
        background: 'rgba(255,255,255,0.1)',
        border: 'none',
        borderRadius: 6,
        color: '#fff',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    activePhase: {
        background: 'linear-gradient(135deg, #3498db, #2980b9)',
        boxShadow: '0 4px 15px rgba(52, 152, 219, 0.4)',
    },
    screen: {
        padding: 30,
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.1)',
    },
    badge: {
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        background: 'rgba(255,255,255,0.15)',
        marginRight: 8,
    },
    wagerBadge: {
        background: 'linear-gradient(135deg, #f39c12, #e74c3c)',
    },
    modeCard: {
        padding: 20,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        marginBottom: 15,
        cursor: 'pointer',
        transition: 'all 0.2s',
        border: '1px solid rgba(255,255,255,0.1)',
    },
    playerSlot: {
        padding: 15,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 8,
        marginBottom: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 15,
        transition: 'all 0.2s',
    },
    emptySlot: {
        opacity: 0.4,
        borderStyle: 'dashed',
    },
    localPlayer: {
        border: '2px solid #3498db',
        boxShadow: '0 0 20px rgba(52, 152, 219, 0.3)',
    },
    countdown: {
        fontSize: 120,
        fontWeight: 800,
        textAlign: 'center' as const,
        background: 'linear-gradient(135deg, #3498db, #9b59b6)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    },
    button: {
        padding: '12px 24px',
        background: 'linear-gradient(135deg, #3498db, #2980b9)',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontWeight: 600,
        cursor: 'pointer',
        marginTop: 20,
    },
};

// =============================================================================
// SCREEN COMPONENTS
// =============================================================================

const IdleScreen: React.FC<{ mode: GameMode; ruleset: Ruleset }> = ({ mode, ruleset }) => (
    <div data-screen="lobby-idle" style={styles.screen}>
        <h2>Select Mode</h2>
        <div>
            {['1v1', '4v4', 'training'].map(m => (
                <div
                    key={m}
                    data-component="mode-card"
                    style={{ ...styles.modeCard, ...(m === mode ? styles.localPlayer : {}) }}
                    onClick={() => console.log('Mode selected:', m)}
                >
                    <h3>{m === '1v1' ? '1v1 Duel' : m === '4v4' ? '4v4 Team Battle' : 'Training'}</h3>
                    <p style={{ opacity: 0.7 }}>Click to select</p>
                    {ruleset === 'wager' && <span style={{ ...styles.badge, ...styles.wagerBadge }}>WAGER</span>}
                </div>
            ))}
        </div>
    </div>
);

const QueueingScreen: React.FC<{ waitTime: number }> = ({ waitTime }) => (
    <div data-screen="lobby-queueing" style={styles.screen}>
        <h2>Searching for Match...</h2>
        <div data-component="wait-timer" style={{ fontSize: 48, marginTop: 20 }}>
            {Math.floor(waitTime / 60)}:{(waitTime % 60).toString().padStart(2, '0')}
        </div>
        <button style={styles.button} onClick={() => console.log('Cancel')}>CANCEL</button>
    </div>
);

const AssemblingScreen: React.FC<{ players: PlayerSlot[] }> = ({ players }) => {
    const slots = Array(8).fill(null).map((_, i) => players.find(p => p.slot === i));
    return (
        <div data-screen="lobby-assembling" style={styles.screen}>
            <h2>Assembling Teams</h2>
            <p style={{ opacity: 0.7 }}>{players.length}/8 players</p>
            <div style={{ marginTop: 20 }}>
                {slots.map((player, i) => (
                    <div
                        key={i}
                        data-component="player-slot"
                        style={{
                            ...styles.playerSlot,
                            ...(player ? {} : styles.emptySlot),
                            ...(player?.playerId === 'p1' ? styles.localPlayer : {}),
                        }}
                    >
                        {player ? (
                            <>
                                <span>{player.displayName}</span>
                                {player.isHost && <span style={styles.badge}>HOST</span>}
                                {player.playerId === 'p1' && <span style={{ ...styles.badge, ...styles.wagerBadge }}>YOU</span>}
                            </>
                        ) : (
                            <span>Empty Slot</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

const ReadyCheckScreen: React.FC<{ players: PlayerSlot[] }> = ({ players }) => (
    <div data-screen="lobby-ready-check" style={styles.screen}>
        <h2>Ready Check</h2>
        <p style={{ opacity: 0.7 }}>{players.filter(p => p.isReady).length}/{players.length} ready</p>
        <div style={{ marginTop: 20 }}>
            {players.map(player => (
                <div
                    key={player.playerId}
                    data-component="player-slot"
                    style={{
                        ...styles.playerSlot,
                        ...(player.playerId === 'p1' ? styles.localPlayer : {}),
                    }}
                >
                    <span>{player.displayName}</span>
                    <span style={styles.badge}>{player.isReady ? '✓ READY' : '○ WAITING'}</span>
                </div>
            ))}
        </div>
        <button style={styles.button} onClick={() => console.log('Confirm ready')}>CONFIRM READY</button>
    </div>
);

const CountdownScreen: React.FC<{ seconds: number }> = ({ seconds }) => (
    <div data-screen="lobby-countdown" style={styles.screen}>
        <h2>Match Starting!</h2>
        <div data-countdown style={styles.countdown}>{seconds}</div>
    </div>
);

const ErrorScreen: React.FC = () => (
    <div data-screen="lobby-error" style={styles.screen}>
        <h2 style={{ color: '#e74c3c' }}>Error</h2>
        <p>TEST_ERROR: This is a test error</p>
        <button style={styles.button} onClick={() => console.log('Retry')}>RETRY</button>
    </div>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const MockLobbyApp: React.FC = () => {
    const [phase, setPhase] = useState<LobbyPhase>('idle');
    const [countdown, setCountdown] = useState(3);
    const [waitTime, setWaitTime] = useState(45);

    return (
        <div style={styles.container}>
            <h1>Lobby UI Demo</h1>

            {/* Controls */}
            <div style={styles.controls}>
                <label>Phase: </label>
                <div style={styles.phaseButtons}>
                    {PHASES.map(p => (
                        <button
                            key={p}
                            style={{ ...styles.phaseButton, ...(p === phase ? styles.activePhase : {}) }}
                            onClick={() => setPhase(p)}
                        >
                            {p}
                        </button>
                    ))}
                </div>
                {phase === 'countdown' && (
                    <div style={{ marginTop: 15 }}>
                        <label>Countdown: </label>
                        <input
                            type="range"
                            min={1}
                            max={10}
                            value={countdown}
                            onChange={e => setCountdown(Number(e.target.value))}
                        />
                        <span style={{ marginLeft: 10 }}>{countdown}s</span>
                    </div>
                )}
                {phase === 'queueing' && (
                    <div style={{ marginTop: 15 }}>
                        <label>Wait Time: </label>
                        <input
                            type="range"
                            min={0}
                            max={300}
                            value={waitTime}
                            onChange={e => setWaitTime(Number(e.target.value))}
                        />
                        <span style={{ marginLeft: 10 }}>{waitTime}s</span>
                    </div>
                )}
            </div>

            {/* Screen Preview */}
            {phase === 'idle' && <IdleScreen mode="4v4" ruleset="wager" />}
            {phase === 'queueing' && <QueueingScreen waitTime={waitTime} />}
            {phase === 'assembling' && <AssemblingScreen players={MOCK_PLAYERS} />}
            {phase === 'ready_check' && <ReadyCheckScreen players={MOCK_PLAYERS} />}
            {phase === 'countdown' && <CountdownScreen seconds={countdown} />}
            {phase === 'error' && <ErrorScreen />}
        </div>
    );
};

export default MockLobbyApp;
