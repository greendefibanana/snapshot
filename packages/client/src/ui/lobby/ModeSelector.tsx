/**
 * ModeSelector — Game Mode Selection Overlay
 * 
 * Dropdown/overlay for selecting the supported duel flows from the match bar.
 * Handles: public matchmaking, direct P2P duel rooms, MagicBlock ER rooms,
 * and wager duels.
 */

import { useState, useCallback } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export type GameMode = '1v1' | 'training';
export type Ruleset = 'casual' | 'wager';
export type AccessType = 'public' | 'friends';
export type CustomRoomMode = '1v1' | '1v1_magicblock';

export interface ModeCardData {
    readonly mode: GameMode;
    readonly label: string;
    readonly description: string;
    readonly ruleset: Ruleset;
    readonly access: AccessType;
    readonly transport?: 'socket' | 'p2p';
    readonly accent?: 'purple' | 'green' | 'orange';
    readonly p2pTag?: string;
    readonly p2pRoomMode?: CustomRoomMode;
    readonly comingSoon?: boolean;
    readonly optimizingForProduction?: boolean;
}

export interface ModeSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    selectedMode: ModeCardData | null;
    onSelectMode: (mode: ModeCardData) => void;
    onStartMode: (mode: ModeCardData) => void;

    // P2P callbacks
    onCreateP2PRoom?: ((mode?: CustomRoomMode) => Promise<string>) | undefined;
    onJoinP2PRoom?: ((code: string, mode?: CustomRoomMode) => Promise<void>) | undefined;
    onFallbackServer1v1?: (() => void) | undefined;

    // P2P status
    p2pStatus?: {
        phase: 'idle' | 'hosting' | 'connecting' | 'connected' | 'failed';
        code?: string | undefined;
        error?: string | undefined;
    } | undefined;
}

// =============================================================================
// MODE LIST
// =============================================================================

export const ALL_MODES: ModeCardData[] = [
    { mode: '1v1', label: '1v1 Duel', description: 'Public matchmaking duel with automatic room assignment', ruleset: 'casual', access: 'public' },
    { mode: 'training', label: 'Training', description: 'Instant local duel sandbox for offline judging and controls testing', ruleset: 'casual', access: 'public', accent: 'orange' },
    { mode: '1v1', label: 'Private 1v1 Room', description: 'Direct join-code duel', ruleset: 'casual', access: 'friends', accent: 'orange', p2pTag: 'P2P', p2pRoomMode: '1v1' },
    { mode: '1v1', label: 'Private 1v1 Room (MagicBlock ER)', description: 'Direct join-code duel with Solana score authority mirrored through MagicBlock', ruleset: 'casual', access: 'friends', accent: 'green', p2pTag: 'ER', p2pRoomMode: '1v1_magicblock' },
    { mode: '1v1', label: '1v1 Wager', description: 'Bet SOL to win', ruleset: 'wager', access: 'public', accent: 'green', comingSoon: true },
];

// =============================================================================
// ACCENT COLOR MAP
// =============================================================================

function accentColor(accent?: string): string {
    switch (accent) {
        case 'green': return '#00e676';
        case 'orange': return '#ff6b1a';
        case 'purple': return '#a78bfa';
        default: return '#00f0ff';
    }
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ModeSelector({
    isOpen,
    onClose,
    selectedMode,
    onSelectMode,
    onCreateP2PRoom,
    onJoinP2PRoom,
    onFallbackServer1v1,
}: ModeSelectorProps) {
    // P2P state
    const [p2pOpen, setP2POpen] = useState(false);
    const [p2pMode, setP2PMode] = useState<'host' | 'join'>('host');
    const [p2pCode, setP2PCode] = useState('');
    const [p2pJoinCode, setP2PJoinCode] = useState('');
    const [p2pLoading, setP2PLoading] = useState(false);
    const [p2pError, setP2PError] = useState<string | null>(null);
    const [p2pRoomMode, setP2PRoomMode] = useState<CustomRoomMode>('1v1');

    const handleSelectMode = useCallback((mode: ModeCardData) => {
        if (mode.comingSoon) return;

        if (mode.p2pTag) {
            // Open P2P modal
            setP2PRoomMode(mode.p2pRoomMode ?? '1v1');
            setP2POpen(true);
            setP2PError(null);
            setP2PCode('');
            setP2PJoinCode('');
            setP2PMode('host');
            return;
        }

        onSelectMode(mode);
        onClose();
    }, [onSelectMode, onClose]);

    const handleCreateRoom = useCallback(async () => {
        if (!onCreateP2PRoom) return;
        setP2PLoading(true);
        setP2PError(null);
        try {
            const code = await onCreateP2PRoom(p2pRoomMode);
            setP2PCode(code);
        } catch (error: any) {
            setP2PError(error?.message ?? 'Failed to create room.');
        } finally {
            setP2PLoading(false);
        }
    }, [onCreateP2PRoom, p2pRoomMode]);

    const handleJoinRoom = useCallback(async () => {
        if (!onJoinP2PRoom || !p2pJoinCode.trim()) return;
        setP2PLoading(true);
        setP2PError(null);
        try {
            await onJoinP2PRoom(p2pJoinCode, p2pRoomMode);
            setP2POpen(false);
            onClose();
        } catch (error: any) {
            setP2PError(error?.message ?? 'Failed to join room.');
        } finally {
            setP2PLoading(false);
        }
    }, [onJoinP2PRoom, p2pJoinCode, p2pRoomMode, onClose]);

    if (!isOpen) return null;

    return (
        <div className="mode-selector-overlay">
            {/* Background click to close */}
            <div className="mode-selector-backdrop" onClick={onClose} />

            <div className="mode-selector-content">
                {/* Header */}
                <div className="mode-selector-header">
                    <h2 className="mode-selector-title">SELECT MODE</h2>
                    <button className="mode-selector-close" onClick={onClose}>✕</button>
                </div>

                {/* Mode Grid */}
                <div className="mode-grid">
                    {ALL_MODES.map((mode, idx) => (
                        <button
                            key={`${mode.mode}-${mode.label}-${idx}`}
                            className={`mode-card ${mode.comingSoon ? 'mode-card--disabled' : ''} ${selectedMode?.label === mode.label ? 'mode-card--selected' : ''}`}
                            onClick={() => handleSelectMode(mode)}
                            style={{ '--mode-accent': accentColor(mode.accent) } as React.CSSProperties}
                        >
                            <div className="mode-card__header">
                                <span className="mode-card__label">{mode.label}</span>
                                {mode.p2pTag && <span className="mode-card__tag mode-card__tag--p2p">{mode.p2pTag}</span>}
                                {mode.comingSoon && <span className="mode-card__tag mode-card__tag--soon">SOON</span>}
                                {mode.ruleset === 'wager' && <span className="mode-card__tag mode-card__tag--wager">WAGER</span>}
                            </div>
                            <div className="mode-card__desc">{mode.description}</div>
                            <div className="mode-card__footer">
                                <span className="mode-card__access">{mode.access === 'public' ? '🌐 Public' : '🔒 Friends'}</span>
                                <span className="mode-card__mode-type">{mode.mode.toUpperCase()}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* P2P Room Modal */}
            {p2pOpen && (
                <div className="p2p-modal-overlay">
                    <div className="hud-panel p2p-modal">
                        <div className="p2p-modal__header">
                            <h3 className="p2p-modal__title">
                                {p2pRoomMode === '1v1_magicblock'
                                    ? '1v1 MagicBlock ER'
                                    : '1v1 P2P'} Room
                            </h3>
                            <button className="mode-selector-close" onClick={() => setP2POpen(false)}>✕</button>
                        </div>

                        {/* Host / Join tabs */}
                        <div className="p2p-modal__tabs">
                            <button
                                className={`p2p-tab ${p2pMode === 'host' ? 'p2p-tab--active' : ''}`}
                                onClick={() => setP2PMode('host')}
                            >
                                Host Room
                            </button>
                            <button
                                className={`p2p-tab ${p2pMode === 'join' ? 'p2p-tab--active' : ''}`}
                                onClick={() => setP2PMode('join')}
                            >
                                Join Room
                            </button>
                        </div>

                        {p2pMode === 'host' ? (
                            <div className="p2p-modal__body">
                                {p2pCode ? (
                                    <div>
                                        <div className="p2p-modal__sublabel">Share this join code:</div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <input
                                                readOnly
                                                value={p2pCode}
                                                className="p2p-code-display"
                                            />
                                            <button
                                                className="loadout-btn"
                                                onClick={() => navigator.clipboard.writeText(p2pCode)}
                                            >
                                                COPY
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        className="ready-btn"
                                        onClick={handleCreateRoom}
                                        disabled={p2pLoading}
                                        style={{ width: '100%' }}
                                    >
                                        {p2pLoading ? 'CREATING...' : 'CREATE ROOM'}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="p2p-modal__body">
                                <input
                                    value={p2pJoinCode}
                                    onChange={(e) => setP2PJoinCode(e.target.value.toUpperCase())}
                                    placeholder="Enter join code"
                                    className="p2p-code-input"
                                />
                                <button
                                    className="ready-btn"
                                    onClick={handleJoinRoom}
                                    disabled={p2pLoading || !p2pJoinCode.trim()}
                                    style={{ width: '100%', marginTop: 10 }}
                                >
                                    {p2pLoading ? 'CONNECTING...' : 'CONNECT'}
                                </button>
                            </div>
                        )}

                        {p2pError && (
                            <div className="p2p-modal__error">{p2pError}</div>
                        )}

                        {p2pError && onFallbackServer1v1 && (
                            <button
                                className="loadout-btn"
                                onClick={() => {
                                    setP2POpen(false);
                                    onClose();
                                    onFallbackServer1v1();
                                }}
                                style={{ width: '100%', marginTop: 8 }}
                            >
                                PLAY SERVER 1V1 INSTEAD
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default ModeSelector;
