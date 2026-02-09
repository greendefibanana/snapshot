/**
 * AAA Lobby Wrapper
 * 
 * Bridges the new AAA Lobby Shell with the existing phase-based state system.
 * Use this component to replace your current lobby implementation.
 */

import React, { useCallback } from 'react';
import type { LobbyState, PlayerId } from '@snapshot/shared';
import {
  AAALobbyShell,
  type PlayerProfile,
  type Friend,
  type Party,
} from './AAALobbyShell.js';
import { LobbyAssembling } from './LobbyAssembling.js';
import { LobbyReadyCheck } from './LobbyReadyCheck.js';
import { LobbyCountdown } from './LobbyCountdown.js';
import { LobbyError } from './LobbyError.js';

// =============================================================================
// PROPS
// =============================================================================

export interface AAALobbyWrapperProps {
  // Core lobby state from server
  readonly lobbyState: LobbyState;

  // Player data
  readonly playerProfile: PlayerProfile;
  readonly friends: Friend[];
  readonly party?: Party | undefined;

  // Callbacks
  readonly onSelectMode: (mode: '1v1' | '4v4' | 'training', ruleset: 'casual' | 'wager' | 'ranked') => void;
  readonly onJoinQueue: () => void;
  readonly onLeaveQueue: () => void;
  readonly onCreateParty: () => void;
  readonly onJoinParty: (code: string) => void;
  readonly onInviteFriend: (friendId: PlayerId) => void;

  readonly onOpenInventory: () => void;
  readonly onOpenStore: () => void;
  readonly onOpenSettings: () => void;
}

// =============================================================================
// WRAPPER COMPONENT
// =============================================================================

export const AAALobbyWrapper: React.FC<AAALobbyWrapperProps> = ({
  lobbyState,
  playerProfile,
  friends,
  party,
  onSelectMode,
  onJoinQueue,
  onLeaveQueue,
  onCreateParty,
  onJoinParty,
  onInviteFriend,
  onOpenInventory,
  onOpenStore,
  onOpenSettings,
}) => {
  // Track if we're in a special phase that needs the old UI
  const needsPhaseUI = ['assembling', 'ready_check', 'countdown', 'starting', 'error'].includes(lobbyState.phase);

  // Handle queue from AAA shell
  const handleJoinQueue = useCallback(() => {
    if (lobbyState.phase === 'idle') {
      onJoinQueue();
    }
  }, [lobbyState.phase, onJoinQueue]);

  // Render phase-specific screens
  if (needsPhaseUI) {
    return (
      <div className="aaa-lobby">
        {/* Keep the same background */}
        <div className="aaa-lobby__bg">
          <div className="aaa-lobby__bg-gradient" />
          <div className="aaa-lobby__bg-grid" />
          <div className="aaa-lobby__bg-ink aaa-lobby__bg-ink--1" />
          <div className="aaa-lobby__bg-ink aaa-lobby__bg-ink--2" />
          <div className="aaa-lobby__bg-ink aaa-lobby__bg-ink--3" />
        </div>

        {/* Render phase screen with AAA styling wrapper */}
        <div className="aaa-phase-screen">
          {lobbyState.phase === 'assembling' && (
            <LobbyAssembling
              players={lobbyState.players}
              localPlayerId={lobbyState.localPlayerId as PlayerId}
              mode={lobbyState.mode}
              maxPlayers={lobbyState.maxPlayers}
            />
          )}

          {lobbyState.phase === 'ready_check' && (
            <LobbyReadyCheck
              players={lobbyState.players}
              localPlayerId={lobbyState.localPlayerId}
            />
          )}

          {(lobbyState.phase === 'countdown' || lobbyState.phase === 'starting') && (
            <LobbyCountdown
              countdownSec={lobbyState.countdownSec}
              players={lobbyState.players}
              mode={lobbyState.mode}
            />
          )}

          {lobbyState.phase === 'error' && (
            <LobbyError error={lobbyState.error?.message} />
          )}
        </div>

        {/* Minimal header during phases */}
        <header className="aaa-lobby__header aaa-lobby__header--minimal">
          <div className="aaa-lobby__logo">
            <span className="aaa-lobby__logo-text">SNAP</span>
            <span className="aaa-lobby__logo-accent">SHOT</span>
          </div>
          <div className="aaa-lobby__phase-indicator">
            {lobbyState.phase.replace('_', ' ').toUpperCase()}
          </div>
        </header>
      </div>
    );
  }

  // Use the full AAA lobby for idle/queueing phases
  return (
    <AAALobbyShell
      lobbyState={lobbyState}
      playerProfile={playerProfile}
      friends={friends}
      party={party}
      onSelectMode={onSelectMode}
      onJoinQueue={handleJoinQueue}
      onLeaveQueue={onLeaveQueue}
      onCreateParty={onCreateParty}
      onJoinParty={onJoinParty}
      onInviteFriend={onInviteFriend}
      onOpenInventory={onOpenInventory}
      onOpenStore={onOpenStore}
      onOpenSettings={onOpenSettings}
    />
  );
};

export default AAALobbyWrapper;
