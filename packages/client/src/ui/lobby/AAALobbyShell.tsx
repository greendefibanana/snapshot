/**
 * AAA Lobby Shell - Main Layout Component
 * 
 * Fortnite/Splatoon-inspired design with:
 * - Vibrant color palette (Acid Lime, Electric Violet, Cyan)
 * - Bold typography with skew transforms
 * - Glass morphism panels
 * - Animated background effects
 * - 3D character showcase area
 * - Social sidebar integration
 */

import React, { useState, useEffect } from 'react';
import type { LobbyState, PlayerId } from '@snapshot/shared';
import './AAALobby.css';

// =============================================================================
// TYPES
// =============================================================================

export interface AAALobbyShellProps {
  readonly lobbyState: LobbyState;
  readonly playerProfile: PlayerProfile;
  readonly friends: Friend[];
  readonly party?: Party | undefined;
  readonly onSelectMode: (mode: GameMode, ruleset: Ruleset) => void;
  readonly onJoinQueue: () => void;
  readonly onLeaveQueue: () => void;
  readonly onCreateParty: () => void;
  readonly onJoinParty: (code: string) => void;
  readonly onInviteFriend: (friendId: PlayerId) => void;
  readonly onOpenInventory: () => void;
  readonly onOpenStore: () => void;
  readonly onOpenSettings: () => void;
}

export interface PlayerProfile {
  readonly id: PlayerId;
  readonly displayName: string;
  readonly level: number;
  readonly xp: { current: number; max: number };
  readonly currency: { snapshot: number; credits: number };
  readonly rank?: { tier: string; division: number };
  readonly equippedCharacter: {
    readonly id: string;
    readonly name: string;
    readonly species: string;
    readonly skin?: string;
  };
}

export interface Friend {
  readonly id: PlayerId;
  readonly displayName: string;
  readonly status: 'online' | 'offline' | 'in_queue' | 'in_match';
  readonly level: number;
  readonly isFavorite?: boolean;
}

export interface Party {
  readonly id: string;
  readonly inviteCode: string;
  readonly leaderId: PlayerId;
  readonly members: PartyMember[];
  readonly maxSize: number;
}

export interface PartyMember {
  readonly id: PlayerId;
  readonly displayName: string;
  readonly isReady: boolean;
  readonly isLeader: boolean;
}

export type GameMode = '1v1' | '4v4' | 'training';
export type Ruleset = 'casual' | 'wager' | 'ranked';

// =============================================================================
// NAVIGATION ITEMS
// =============================================================================

const NAV_ITEMS = [
  { id: 'play', label: 'PLAY', icon: '▶', color: '#CCFF00' },
  { id: 'inventory', label: 'LOCKER', icon: '🎒', color: '#00FFFF' },
  { id: 'store', label: 'SHOP', icon: '🛒', color: '#7000FF' },
  { id: 'battlepass', label: 'BATTLE PASS', icon: '👑', color: '#FF0055' },
] as const;

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const AAALobbyShell: React.FC<AAALobbyShellProps> = ({
  lobbyState,
  playerProfile,
  friends,
  party,
  onSelectMode,
  onJoinQueue,
  onLeaveQueue,
  onCreateParty,

  onInviteFriend,
  onOpenInventory,
  onOpenStore,
}) => {
  const [activeTab, setActiveTab] = useState<'play' | 'inventory' | 'store' | 'battlepass'>('play');
  const [selectedMode, setSelectedMode] = useState<{ mode: GameMode; ruleset: Ruleset } | null>(null);
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [animateEntry, setAnimateEntry] = useState(true);

  // Disable entry animation after initial load
  useEffect(() => {
    const timer = setTimeout(() => setAnimateEntry(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  const isInQueue = lobbyState.phase === 'queueing';

  return (
    <div className={`aaa-lobby ${animateEntry ? 'aaa-lobby--entry' : ''}`}>
      {/* Animated Background */}
      <div className="aaa-lobby__bg">
        <div className="aaa-lobby__bg-gradient" />
        <div className="aaa-lobby__bg-grid" />
        <div className="aaa-lobby__bg-ink aaa-lobby__bg-ink--1" />
        <div className="aaa-lobby__bg-ink aaa-lobby__bg-ink--2" />
        <div className="aaa-lobby__bg-ink aaa-lobby__bg-ink--3" />
      </div>

      {/* Top Navigation Bar */}
      <header className="aaa-lobby__header">
        {/* Logo */}
        <div className="aaa-lobby__logo">
          <span className="aaa-lobby__logo-text">SNAP</span>
          <span className="aaa-lobby__logo-accent">SHOT</span>
          <div className="aaa-lobby__logo-splat" />
        </div>

        {/* Main Navigation */}
        <nav className="aaa-lobby__nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`aaa-lobby__nav-item ${activeTab === item.id ? 'aaa-lobby__nav-item--active' : ''}`}
              style={{ '--nav-color': item.color } as React.CSSProperties}
              onClick={() => {
                setActiveTab(item.id as typeof activeTab);
                if (item.id === 'inventory') onOpenInventory();
                if (item.id === 'store') onOpenStore();
              }}
            >
              <span className="aaa-lobby__nav-icon">{item.icon}</span>
              <span className="aaa-lobby__nav-label">{item.label}</span>
              {activeTab === item.id && <div className="aaa-lobby__nav-underline" />}
            </button>
          ))}
        </nav>

        {/* Player Stats */}
        <div className="aaa-lobby__stats">
          {/* Currency */}
          <div className="aaa-lobby__currency">
            <div className="aaa-lobby__currency-item aaa-lobby__currency--snapshot">
              <div className="aaa-lobby__currency-icon">◈</div>
              <span className="aaa-lobby__currency-value">
                {playerProfile.currency.snapshot.toLocaleString()}
              </span>
            </div>
            <div className="aaa-lobby__currency-item aaa-lobby__currency--credits">
              <div className="aaa-lobby__currency-icon">◉</div>
              <span className="aaa-lobby__currency-value">
                {playerProfile.currency.credits.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Level Badge */}
          <div className="aaa-lobby__level">
            <div className="aaa-lobby__level-badge">
              <span className="aaa-lobby__level-number">{playerProfile.level}</span>
            </div>
            <div className="aaa-lobby__level-bar">
              <div 
                className="aaa-lobby__level-fill"
                style={{ width: `${(playerProfile.xp.current / playerProfile.xp.max) * 100}%` }}
              />
            </div>
          </div>

          {/* Profile Avatar */}
          <button className="aaa-lobby__avatar">
            <div className="aaa-lobby__avatar-image">
              {playerProfile.displayName.charAt(0).toUpperCase()}
            </div>
            {playerProfile.rank && (
              <div className="aaa-lobby__avatar-rank">
                {playerProfile.rank.tier}
              </div>
            )}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="aaa-lobby__main">
        {/* Left: Mode Selection & Play Area */}
        <section className="aaa-lobby__play-area">
          {/* Mode Selector */}
          <div className="aaa-lobby__modes">
            <h2 className="aaa-lobby__section-title">
              <span className="aaa-lobby__section-title-accent">SELECT</span> MODE
            </h2>
            
            <div className="aaa-lobby__mode-grid">
              <ModeCard
                mode="4v4"
                label="TEAM BATTLE"
                description="4v4 Team Combat"
                icon="⚔️"
                color="#CCFF00"
                gradient="linear-gradient(135deg, #CCFF00 0%, #7FFF00 100%)"
                selected={selectedMode?.mode === '4v4'}
                onClick={() => setSelectedMode({ mode: '4v4', ruleset: 'casual' })}
              />
              <ModeCard
                mode="1v1"
                label="DUEL"
                description="1v1 Competitive"
                icon="🎯"
                color="#00FFFF"
                gradient="linear-gradient(135deg, #00FFFF 0%, #00BFFF 100%)"
                selected={selectedMode?.mode === '1v1'}
                onClick={() => setSelectedMode({ mode: '1v1', ruleset: 'casual' })}
              />
              <ModeCard
                mode="training"
                label="TRAINING"
                description="Practice & Warmup"
                icon="🎮"
                color="#7000FF"
                gradient="linear-gradient(135deg, #7000FF 0%, #9400D3 100%)"
                selected={selectedMode?.mode === 'training'}
                onClick={() => setSelectedMode({ mode: 'training', ruleset: 'casual' })}
              />
            </div>

            {/* Ruleset Toggle */}
            {selectedMode && selectedMode.mode !== 'training' && (
              <div className="aaa-lobby__ruleset">
                <span className="aaa-lobby__ruleset-label">RULESET:</span>
                <div className="aaa-lobby__ruleset-options">
                  <button
                    className={`aaa-lobby__ruleset-btn ${selectedMode.ruleset === 'casual' ? 'aaa-lobby__ruleset-btn--active' : ''}`}
                    onClick={() => setSelectedMode({ ...selectedMode, ruleset: 'casual' })}
                  >
                    CASUAL
                  </button>
                  <button
                    className={`aaa-lobby__ruleset-btn ${selectedMode.ruleset === 'ranked' ? 'aaa-lobby__ruleset-btn--active' : ''}`}
                    onClick={() => setSelectedMode({ ...selectedMode, ruleset: 'ranked' })}
                  >
                    RANKED
                  </button>
                  <button
                    className={`aaa-lobby__ruleset-btn ${selectedMode.ruleset === 'wager' ? 'aaa-lobby__ruleset-btn--active' : ''}`}
                    onClick={() => setSelectedMode({ ...selectedMode, ruleset: 'wager' })}
                  >
                    WAGER
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Character Showcase */}
          <div className="aaa-lobby__showcase">
            <div className="aaa-lobby__showcase-character">
              <div className="aaa-lobby__character-name">
                <span className="aaa-lobby__character-species">{playerProfile.equippedCharacter.species}</span>
                <h1 className="aaa-lobby__character-title">{playerProfile.equippedCharacter.name}</h1>
              </div>
              <div className="aaa-lobby__character-model">
                {/* 3D Character would render here */}
                <div className="aaa-lobby__character-placeholder">
                  <div className="aaa-lobby__character-silhouette" />
                  <div className="aaa-lobby__character-glow" />
                </div>
              </div>
            </div>
          </div>

          {/* Play Button */}
          <div className="aaa-lobby__action">
            {!isInQueue ? (
              <button
                className={`aaa-lobby__play-btn ${!selectedMode ? 'aaa-lobby__play-btn--disabled' : ''}`}
                disabled={!selectedMode}
                onClick={() => {
                  if (selectedMode) {
                    onSelectMode(selectedMode.mode, selectedMode.ruleset);
                    onJoinQueue();
                  }
                }}
              >
                <span className="aaa-lobby__play-btn-text">PLAY NOW</span>
                <span className="aaa-lobby__play-btn-shine" />
              </button>
            ) : (
              <div className="aaa-lobby__queue-status">
                <div className="aaa-lobby__queue-spinner">
                  <div className="aaa-lobby__queue-spinner-ring" />
                  <div className="aaa-lobby__queue-spinner-ring" />
                  <div className="aaa-lobby__queue-spinner-ring" />
                </div>
                <div className="aaa-lobby__queue-info">
                  <span className="aaa-lobby__queue-label">FINDING MATCH</span>
                  <span className="aaa-lobby__queue-timer">
                    {formatTime(lobbyState.queue?.waitTimeSec || 0)}
                  </span>
                </div>
                <button className="aaa-lobby__queue-cancel" onClick={onLeaveQueue}>
                  ✕
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Right: Social Sidebar */}
        <aside className="aaa-lobby__sidebar">
          {/* Party Section */}
          <div className="aaa-lobby__panel">
            <div className="aaa-lobby__panel-header">
              <h3 className="aaa-lobby__panel-title">🎮 PARTY</h3>
              {!party && (
                <button 
                  className="aaa-lobby__panel-action"
                  onClick={() => setShowPartyModal(true)}
                >
                  + CREATE
                </button>
              )}
            </div>
            
            {party ? (
              <div className="aaa-lobby__party">
                <div className="aaa-lobby__party-code">
                  <span className="aaa-lobby__party-code-label">CODE:</span>
                  <span className="aaa-lobby__party-code-value">{party.inviteCode}</span>
                </div>
                <div className="aaa-lobby__party-members">
                  {party.members.map((member) => (
                    <div 
                      key={member.id} 
                      className={`aaa-lobby__party-member ${member.isLeader ? 'aaa-lobby__party-member--leader' : ''}`}
                    >
                      <div className={`aaa-lobby__party-avatar ${member.isReady ? 'aaa-lobby__party-avatar--ready' : ''}`}>
                        {member.displayName.charAt(0)}
                      </div>
                      <span className="aaa-lobby__party-name">{member.displayName}</span>
                      {member.isLeader && <span className="aaa-lobby__party-crown">👑</span>}
                    </div>
                  ))}
                  {/* Empty slots */}
                  {Array.from({ length: party.maxSize - party.members.length }).map((_, i) => (
                    <div key={`empty-${i}`} className="aaa-lobby__party-slot aaa-lobby__party-slot--empty">
                      <span>+</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="aaa-lobby__party-empty">
                <p>Play solo or create a party</p>
                <button 
                  className="aaa-lobby__party-create"
                  onClick={() => setShowPartyModal(true)}
                >
                  CREATE PARTY
                </button>
              </div>
            )}
          </div>

          {/* Friends Section */}
          <div className="aaa-lobby__panel aaa-lobby__panel--friends">
            <div className="aaa-lobby__panel-header">
              <h3 className="aaa-lobby__panel-title">👥 FRIENDS</h3>
              <span className="aaa-lobby__panel-badge">
                {friends.filter(f => f.status === 'online').length}/{friends.length}
              </span>
            </div>
            
            <div className="aaa-lobby__friends-list">
              {friends
                .sort((a) => (a.status === 'online' ? -1 : 1))
                .map((friend) => (
                <div key={friend.id} className="aaa-lobby__friend">
                  <div className={`aaa-lobby__friend-avatar aaa-lobby__friend-avatar--${friend.status}`}>
                    {friend.displayName.charAt(0)}
                    <span className={`aaa-lobby__friend-status aaa-lobby__friend-status--${friend.status}`} />
                  </div>
                  <div className="aaa-lobby__friend-info">
                    <span className="aaa-lobby__friend-name">{friend.displayName}</span>
                    <span className="aaa-lobby__friend-meta">Lv.{friend.level}</span>
                  </div>
                  <button 
                    className="aaa-lobby__friend-invite"
                    disabled={friend.status !== 'online'}
                    onClick={() => onInviteFriend(friend.id)}
                  >
                    INVITE
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* News/Events Section */}
          <div className="aaa-lobby__panel aaa-lobby__panel--news">
            <div className="aaa-lobby__panel-header">
              <h3 className="aaa-lobby__panel-title">📰 NEWS</h3>
            </div>
            <div className="aaa-lobby__news-item">
              <div className="aaa-lobby__news-image" style={{ background: 'linear-gradient(135deg, #FF0055, #7000FF)' }} />
              <div className="aaa-lobby__news-content">
                <span className="aaa-lobby__news-tag">EVENT</span>
                <p className="aaa-lobby__news-title">Season 1: The Proving Grounds</p>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* Party Modal */}
      {showPartyModal && (
        <div className="aaa-lobby__modal-overlay" onClick={() => setShowPartyModal(false)}>
          <div className="aaa-lobby__modal" onClick={e => e.stopPropagation()}>
            <h3 className="aaa-lobby__modal-title">CREATE PARTY</h3>
            <div className="aaa-lobby__modal-options">
              <button 
                className="aaa-lobby__modal-btn aaa-lobby__modal-btn--primary"
                onClick={() => {
                  onCreateParty();
                  setShowPartyModal(false);
                }}
              >
                🎮 CREATE NEW PARTY
              </button>
              <div className="aaa-lobby__modal-divider">
                <span>OR</span>
              </div>
              <div className="aaa-lobby__modal-join">
                <input 
                  type="text" 
                  placeholder="ENTER CODE"
                  maxLength={6}
                  className="aaa-lobby__modal-input"
                />
                <button 
                  className="aaa-lobby__modal-btn aaa-lobby__modal-btn--secondary"
                  onClick={() => setShowPartyModal(false)}
                >
                  JOIN
                </button>
              </div>
            </div>
            <button 
              className="aaa-lobby__modal-close"
              onClick={() => setShowPartyModal(false)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Queueing Overlay */}
      {isInQueue && (
        <div className="aaa-lobby__queue-overlay">
          <div className="aaa-lobby__queue-card">
            <div className="aaa-lobby__queue-anim">
              <div className="aaa-lobby__queue-ripple" />
              <div className="aaa-lobby__queue-ripple" />
              <div className="aaa-lobby__queue-ripple" />
            </div>
            <h2 className="aaa-lobby__queue-title">FINDING MATCH</h2>
            <p className="aaa-lobby__queue-mode">
              {lobbyState.mode?.toUpperCase()} • {lobbyState.ruleset?.toUpperCase()}
            </p>
            <div className="aaa-lobby__queue-timer-large">
              {formatTime(lobbyState.queue?.waitTimeSec || 0)}
            </div>
            <button className="aaa-lobby__queue-cancel-btn" onClick={onLeaveQueue}>
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface ModeCardProps {
  readonly mode: GameMode;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly color: string;
  readonly gradient: string;
  readonly selected: boolean;
  readonly onClick: () => void;
}

const ModeCard: React.FC<ModeCardProps> = ({
  label,
  description,
  icon,
  color,
  gradient,
  selected,
  onClick,
}) => {
  return (
    <button
      className={`aaa-mode-card ${selected ? 'aaa-mode-card--selected' : ''}`}
      style={{ '--mode-color': color } as React.CSSProperties}
      onClick={onClick}
    >
      <div className="aaa-mode-card__bg" style={{ background: gradient }} />
      <div className="aaa-mode-card__content">
        <span className="aaa-mode-card__icon">{icon}</span>
        <h3 className="aaa-mode-card__label">{label}</h3>
        <p className="aaa-mode-card__desc">{description}</p>
      </div>
      {selected && (
        <div className="aaa-mode-card__selected">
          <span>✓</span>
        </div>
      )}
    </button>
  );
};

// =============================================================================
// HELPERS
// =============================================================================

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default AAALobbyShell;
