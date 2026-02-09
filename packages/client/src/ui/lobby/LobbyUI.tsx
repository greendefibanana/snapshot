/**
 * Lobby UI - Splatoon-Inspired
 * 
 * Main lobby interface with mode selection, party management,
 * and matchmaking status.
 */

import React, { useState, useEffect } from 'react';
import './LobbyUI.css';

// =============================================================================
// TYPES
// =============================================================================

interface LobbyUIProps {
    playerName: string;
    playerLevel: number;
    playerCurrency: number;
    playerXP: { current: number; max: number };
    onJoinQueue: (mode: GameMode) => void;
    onLeaveQueue: () => void;
    onCreateParty: () => void;
    onJoinParty: (code: string) => void;
    onLeaveParty: () => void;
}

type GameMode = 'regular' | 'ranked' | 'private';

interface PartyMember {
    id: string;
    name: string;
    level: number;
    isLeader: boolean;
    isReady: boolean;
}

interface StageInfo {
    name: string;
    imageUrl: string;
}

// =============================================================================
// LOBBY UI COMPONENT
// =============================================================================

export const LobbyUI: React.FC<LobbyUIProps> = ({
    playerName,
    playerLevel,
    playerCurrency,
    playerXP,
    onJoinQueue,
    onLeaveQueue,
    onCreateParty,
    onJoinParty,
    // TODO: Implement onLeaveParty functionality
    // onLeaveParty,
}) => {
    const [selectedMode, setSelectedMode] = useState<GameMode>('regular');
    const [isQueuing, setIsQueuing] = useState(false);
    const [queueTime, setQueueTime] = useState(0);
    const [partyMode, setPartyMode] = useState<'solo' | 'friends'>('solo');
    const [partyMembers] = useState<PartyMember[]>([]);
    const [inviteCode, setInviteCode] = useState('');
    const [showInviteModal, setShowInviteModal] = useState(false);

    // Current stage rotation (would come from server)
    const stages: StageInfo[] = [
        { name: 'Hammerhead Bridge', imageUrl: '/stages/hammerhead.jpg' },
        { name: 'Wahoo World', imageUrl: '/stages/wahoo.jpg' },
    ];

    // Queue timer
    useEffect(() => {
        if (!isQueuing) {
            setQueueTime(0);
            return;
        }

        const interval = setInterval(() => {
            setQueueTime(t => t + 1);
        }, 1000);

        return () => clearInterval(interval);
    }, [isQueuing]);

    const handleJoinQueue = () => {
        setIsQueuing(true);
        onJoinQueue(selectedMode);
    };

    const handleLeaveQueue = () => {
        setIsQueuing(false);
        onLeaveQueue();
    };

    const formatQueueTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="lobby-container">
            {/* Background with animated pattern */}
            <div className="lobby-background" />

            {/* Top bar - Player stats */}
            <header className="lobby-header">
                <div className="player-stats">
                    <span className="level-badge">Level {playerLevel}</span>
                    <div className="xp-bar">
                        <div
                            className="xp-fill"
                            style={{ width: `${(playerXP.current / playerXP.max) * 100}%` }}
                        />
                        <span className="xp-text">{playerXP.current}/{playerXP.max}</span>
                    </div>
                </div>
                <div className="currency">
                    <span className="currency-icon">💰</span>
                    <span className="currency-value">{playerCurrency.toLocaleString()}</span>
                </div>
            </header>

            {/* Main content */}
            <main className="lobby-main">
                {/* Mode selector */}
                <div className="mode-selector">
                    <div className="mode-tabs">
                        <button
                            className={`mode-tab ${selectedMode === 'regular' ? 'active' : ''}`}
                            onClick={() => setSelectedMode('regular')}
                        >
                            ⚔️ Regular Battle
                        </button>
                        <button
                            className={`mode-tab ${selectedMode === 'ranked' ? 'active' : ''}`}
                            onClick={() => setSelectedMode('ranked')}
                        >
                            🏆 Ranked
                        </button>
                        <button
                            className={`mode-tab ${selectedMode === 'private' ? 'active' : ''}`}
                            onClick={() => setSelectedMode('private')}
                        >
                            🔒 Private Battle
                        </button>
                    </div>

                    <div className="mode-card">
                        <div className="mode-icon">
                            {selectedMode === 'regular' && '⚔️'}
                            {selectedMode === 'ranked' && '🏆'}
                            {selectedMode === 'private' && '🔒'}
                        </div>
                        <div className="mode-info">
                            <h2 className="mode-title">
                                {selectedMode === 'regular' && 'Regular Battle'}
                                {selectedMode === 'ranked' && 'Ranked Battle'}
                                {selectedMode === 'private' && 'Private Battle'}
                            </h2>
                            <p className="mode-description">
                                {selectedMode === 'regular' && 'Hop into a Turf War battle.'}
                                {selectedMode === 'ranked' && 'Compete for ranking points.'}
                                {selectedMode === 'private' && 'Play with friends only.'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Stage rotation */}
                <aside className="stage-panel">
                    <h3 className="stage-header">Current Stages</h3>
                    <div className="stage-list">
                        {stages.map((stage, i) => (
                            <div key={i} className="stage-item">
                                <div className="stage-image" style={{ backgroundImage: `url(${stage.imageUrl})` }} />
                                <span className="stage-name">{stage.name}</span>
                            </div>
                        ))}
                    </div>
                </aside>

                {/* Character display area (3D would go here) */}
                <div className="character-display">
                    <div className="character-placeholder">
                        {/* 3D character would render here */}
                        <span className="character-name">{playerName}</span>
                    </div>
                </div>
            </main>

            {/* Bottom bar - Party and queue */}
            <footer className="lobby-footer">
                <div className="party-toggle">
                    <button
                        className={`party-btn ${partyMode === 'solo' ? 'active' : ''}`}
                        onClick={() => setPartyMode('solo')}
                    >
                        Solo
                    </button>
                    <button
                        className={`party-btn ${partyMode === 'friends' ? 'active' : ''}`}
                        onClick={() => {
                            setPartyMode('friends');
                            setShowInviteModal(true);
                        }}
                    >
                        With Friends
                    </button>
                </div>

                {/* Queue button */}
                {!isQueuing ? (
                    <button className="queue-button" onClick={handleJoinQueue}>
                        Join Battle
                    </button>
                ) : (
                    <div className="queue-status">
                        <div className="queue-spinner" />
                        <span className="queue-text">Searching... {formatQueueTime(queueTime)}</span>
                        <button className="queue-cancel" onClick={handleLeaveQueue}>
                            Cancel
                        </button>
                    </div>
                )}

                {/* Party members */}
                {partyMembers.length > 0 && (
                    <div className="party-display">
                        {partyMembers.map(member => (
                            <div key={member.id} className="party-member">
                                <span className="member-name">{member.name}</span>
                                {member.isLeader && <span className="leader-crown">👑</span>}
                            </div>
                        ))}
                    </div>
                )}
            </footer>

            {/* Invite modal */}
            {showInviteModal && (
                <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
                    <div className="invite-modal" onClick={e => e.stopPropagation()}>
                        <h3>Join or Create Party</h3>
                        <div className="invite-options">
                            <button className="create-party-btn" onClick={() => {
                                onCreateParty();
                                setShowInviteModal(false);
                            }}>
                                Create Party
                            </button>
                            <div className="invite-code-input">
                                <input
                                    type="text"
                                    placeholder="Enter invite code"
                                    value={inviteCode}
                                    onChange={e => setInviteCode(e.target.value.toUpperCase())}
                                    maxLength={6}
                                />
                                <button onClick={() => {
                                    if (inviteCode.length === 6) {
                                        onJoinParty(inviteCode);
                                        setShowInviteModal(false);
                                    }
                                }}>
                                    Join
                                </button>
                            </div>
                        </div>
                        <button className="modal-close" onClick={() => setShowInviteModal(false)}>
                            ✕
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LobbyUI;
