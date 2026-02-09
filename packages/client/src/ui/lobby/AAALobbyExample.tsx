/**
 * AAA Lobby Example - Integration Guide
 * 
 * This file demonstrates how to integrate the new AAA Lobby into your app.
 * Copy this pattern into your main App or Lobby container component.
 */

import React, { useState, useCallback } from 'react';
import type { LobbyState, PlayerId } from '@snapshot/shared';
import { AAALobbyWrapper } from './AAALobbyWrapper.js';
import type { PlayerProfile, Friend, Party } from './AAALobbyShell.js';

// =============================================================================
// EXAMPLE: Main Lobby Container
// =============================================================================

export const LobbyContainer: React.FC = () => {
  // Your existing lobby state from Colyseus/Redux/Context
  const [lobbyState, setLobbyState] = useState<LobbyState>({
    lobbyId: 'lobby_123',
    phase: 'idle',
    players: [],
    localPlayerId: 'player_1' as unknown as PlayerId,
    mode: '4v4',
    ruleset: 'casual',
    access: 'public',
    maxPlayers: 8,
    minPlayers: 2,
    countdownSec: 0,
  });

  // Player profile (normally from auth/context)
  const playerProfile: PlayerProfile = {
    id: 'player_1' as unknown as PlayerId,
    displayName: 'InkMaster99',
    level: 42,
    xp: { current: 3450, max: 5000 },
    currency: {
      snapshot: 12500,
      credits: 850,
    },
    rank: { tier: 'S+', division: 2 },
    equippedCharacter: {
      id: 'kodiak_01',
      name: 'Kodiak',
      species: 'Urshari',
      skin: 'Cyber',
    },
  };

  // Friends list (normally from API)
  const friends: Friend[] = [
    { id: 'friend_1' as unknown as PlayerId, displayName: 'NeonSniper', status: 'online', level: 38 },
    { id: 'friend_2' as unknown as PlayerId, displayName: 'TentacleTim', status: 'in_queue', level: 15 },
    { id: 'friend_3' as unknown as PlayerId, displayName: 'BlobLobber', status: 'in_match', level: 50 },
    { id: 'friend_4' as unknown as PlayerId, displayName: 'ShadowRat', status: 'offline', level: 27 },
  ];

  // Party state (normally from PartyService)
  const [party, setParty] = useState<Party | undefined>(undefined);

  // =============================================================================
  // HANDLERS
  // =============================================================================

  const handleSelectMode = useCallback((mode: '1v1' | '4v4' | 'training', ruleset: 'casual' | 'wager' | 'ranked') => {
    console.log('[Lobby] Mode selected:', mode, ruleset);
    setLobbyState(prev => ({
      ...prev,
      mode,
      ruleset: ruleset as 'casual' | 'wager',
    }));
    // Send to server...
  }, []);

  const handleJoinQueue = useCallback(() => {
    console.log('[Lobby] Joining queue...');
    setLobbyState(prev => ({
      ...prev,
      phase: 'queueing',
      queue: {
        waitTimeSec: 0,
        mode: prev.mode,
        ruleset: prev.ruleset,
        playersInQueue: 42,
      },
    }));
    // Connect to matchmaking service...
  }, []);

  const handleLeaveQueue = useCallback(() => {
    console.log('[Lobby] Leaving queue...');
    setLobbyState(prev => {
      const { queue: _, ...rest } = prev;
      return {
        ...rest,
        phase: 'idle',
      };
    });
    // Disconnect from matchmaking...
  }, []);

  const handleCreateParty = useCallback(() => {
    console.log('[Lobby] Creating party...');
    const newParty: Party = {
      id: 'party_123',
      inviteCode: 'ABC123',
      leaderId: playerProfile.id,
      members: [{
        id: playerProfile.id,
        displayName: playerProfile.displayName,
        isReady: false,
        isLeader: true,
      }],
      maxSize: 4,
    };
    setParty(newParty);
  }, [playerProfile.id, playerProfile.displayName]);

  const handleJoinParty = useCallback((code: string) => {
    console.log('[Lobby] Joining party:', code);
    // Join party via PartyService...
  }, []);

  const handleInviteFriend = useCallback((friendId: PlayerId) => {
    console.log('[Lobby] Inviting friend:', friendId);
    // Send invite via FriendsSystem...
  }, []);

  const handleOpenInventory = useCallback(() => {
    console.log('[Lobby] Opening inventory...');
    // Navigate to inventory screen...
  }, []);

  const handleOpenStore = useCallback(() => {
    console.log('[Lobby] Opening store...');
    // Navigate to store screen...
  }, []);

  const handleOpenSettings = useCallback(() => {
    console.log('[Lobby] Opening settings...');
    // Open settings modal...
  }, []);

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <AAALobbyWrapper
      lobbyState={lobbyState}
      playerProfile={playerProfile}
      friends={friends}
      party={party}
      onSelectMode={handleSelectMode}
      onJoinQueue={handleJoinQueue}
      onLeaveQueue={handleLeaveQueue}
      onCreateParty={handleCreateParty}
      onJoinParty={handleJoinParty}
      onInviteFriend={handleInviteFriend}

      onOpenInventory={handleOpenInventory}
      onOpenStore={handleOpenStore}
      onOpenSettings={handleOpenSettings}
    />
  );
};

export default LobbyContainer;

// =============================================================================
// USAGE INSTRUCTIONS
// =============================================================================

/*

1. IMPORT THE NEW LOBBY:
   
   import { AAALobbyWrapper } from './ui/lobby/AAALobbyWrapper.js';


2. REPLACE YOUR EXISTING LOBBY RENDER:
   
   // OLD WAY:
   <LobbyScreen lobbyState={lobbyState} />
   
   // NEW WAY:
   <AAALobbyWrapper
     lobbyState={lobbyState}
     playerProfile={playerProfile}
     friends={friends}
     party={party}
     onSelectMode={handleSelectMode}
     onJoinQueue={handleJoinQueue}
     onLeaveQueue={handleLeaveQueue}
     onCreateParty={handleCreateParty}
     onJoinParty={handleJoinParty}
     onInviteFriend={handleInviteFriend}
     onToggleReady={handleToggleReady}
     onOpenInventory={handleOpenInventory}
     onOpenStore={handleOpenStore}
     onOpenSettings={handleOpenSettings}
   />


3. ADD THE CSS IMPORT (in your main entry file):
   
   import './ui/lobby/AAALobby.css';


4. DATA REQUIREMENTS:
   
   - lobbyState: Your existing LobbyState from server
   - playerProfile: Player profile with level, currency, equipped character
   - friends: Array of friends with online status
   - party: Optional party state


5. OPTIONAL: Customize the theme by editing CSS variables in AAALobby.css
   
   :root {
     --ink-primary: #CCFF00;      // Change primary accent
     --ink-secondary: #7000FF;    // Change secondary accent
     --ink-accent: #00FFFF;       // Change tertiary accent
     // ...etc
   }

*/
