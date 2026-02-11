/**
 * useGameState Hook
 * 
 * React hook for subscribing to game state with selectors.
 * Only triggers re-renders when selected values change.
 */

import { useState, useEffect, useRef } from 'react';
import { getGameBridge, type UIGameState, type GameToUIEvent } from './GameBridge';

/**
 * Subscribe to game state with a selector.
 * Component only re-renders when selected value changes.
 */
export function useGameState<T>(selector: (state: UIGameState) => T): T {
    const bridge = getGameBridge();
    const [value, setValue] = useState(() => selector(bridge.getState()));
    const selectorRef = useRef(selector);
    selectorRef.current = selector;

    useEffect(() => {
        // Initial sync
        setValue(selectorRef.current(bridge.getState()));

        // Subscribe to updates
        return bridge.subscribeToGame((event: GameToUIEvent) => {
            if (event.type === 'state_update') {
                const newValue = selectorRef.current(bridge.getState());
                setValue(prev => {
                    // Shallow equality check for objects
                    if (typeof newValue === 'object' && typeof prev === 'object') {
                        const keys = Object.keys(newValue as object);
                        const prevKeys = Object.keys(prev as object);
                        if (keys.length === prevKeys.length) {
                            const changed = keys.some(
                                k => (newValue as any)[k] !== (prev as any)[k]
                            );
                            if (!changed) return prev;
                        }
                    }
                    return newValue;
                });
            }
        });
    }, [bridge]);

    return value;
}

/**
 * Get full game state (less efficient, prefer selectors).
 */
export function useFullGameState(): UIGameState {
    return useGameState(state => state);
}

/**
 * Common selectors for convenience.
 */
export const GameStateSelectors = {
    health: (s: UIGameState) => ({ health: s.health, maxHealth: s.maxHealth }),
    shield: (s: UIGameState) => ({ shield: s.shield, maxShield: s.maxShield }),
    ammo: (s: UIGameState) => ({ ammo: s.ammo, maxAmmo: s.maxAmmo, isReloading: s.isReloading }),
    abilities: (s: UIGameState) => ({
        tacticalCooldown: s.tacticalCooldown,
        ultimateCharge: s.ultimateCharge,
        ultimateReady: s.ultimateReady,
    }),
    stats: (s: UIGameState) => ({ kills: s.kills, deaths: s.deaths, assists: s.assists }),
    match: (s: UIGameState) => ({ teamScores: s.teamScores, matchTimeRemaining: s.matchTimeRemaining }),
    connection: (s: UIGameState) => ({ isConnected: s.isConnected, isRunning: s.isRunning }),
    performance: (s: UIGameState) => ({ fps: s.fps, frameTimeMs: s.frameTimeMs, ping: s.ping }),
} as const;

/**
 * Pre-built hooks for common state slices.
 */
export const useHealth = () => useGameState(GameStateSelectors.health);
export const useShield = () => useGameState(GameStateSelectors.shield);
export const useAmmo = () => useGameState(GameStateSelectors.ammo);
export const useAbilities = () => useGameState(GameStateSelectors.abilities);
export const useStats = () => useGameState(GameStateSelectors.stats);
export const useMatchState = () => useGameState(GameStateSelectors.match);
export const useConnection = () => useGameState(GameStateSelectors.connection);
export const usePerformance = () => useGameState(GameStateSelectors.performance);
export const useKillFeed = () => useGameState(s => s.killFeed);
