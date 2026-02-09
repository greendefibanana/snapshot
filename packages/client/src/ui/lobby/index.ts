/**
 * Lobby UI Exports
 * 
 * AAA-quality lobby components for SNAPSHOT
 * Fortnite/Splatoon-inspired design system
 */

// Main Shell
export { AAALobbyShell, type AAALobbyShellProps } from './AAALobbyShell.js';

// Wrapper (Recommended - use this!)
export { AAALobbyWrapper, type AAALobbyWrapperProps } from './AAALobbyWrapper.js';

// Phase Screens (Legacy - kept for compatibility)
export { LobbyScreen, type LobbyScreenProps } from './LobbyScreen.js';
export { LobbyIdle, type LobbyIdleProps } from './LobbyIdle.js';
export { LobbyQueueing, type LobbyQueueingProps } from './LobbyQueueing.js';
export { LobbyAssembling, type LobbyAssemblingProps } from './LobbyAssembling.js';
export { LobbyReadyCheck, type LobbyReadyCheckProps } from './LobbyReadyCheck.js';
export { LobbyCountdown, type LobbyCountdownProps } from './LobbyCountdown.js';
export { LobbyError, type LobbyErrorProps } from './LobbyError.js';

// Legacy UI (kept for compatibility)
export { LobbyUI } from './LobbyUI.js';

// Types
export type { 
  PlayerProfile, 
  Friend, 
  Party, 
  PartyMember,
  GameMode, 
  Ruleset 
} from './AAALobbyShell.js';

// CSS imports (for bundler)
import './AAALobby.css';
import './LobbyUI.css';
import './lobby-animations.css';
