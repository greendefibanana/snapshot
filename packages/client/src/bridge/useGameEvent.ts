/**
 * useGameEvent Hook
 * 
 * React hook for subscribing to specific game events.
 */

import { useEffect, useRef } from 'react';
import { getGameBridge, type GameToUIEvent } from './GameBridge';

type EventType = GameToUIEvent['type'];
type EventOfType<T extends EventType> = Extract<GameToUIEvent, { type: T }>;

/**
 * Subscribe to a specific game event type.
 */
export function useGameEvent<T extends EventType>(
    eventType: T,
    handler: (event: EventOfType<T>) => void
): void {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        const bridge = getGameBridge();

        return bridge.subscribeToGame((event: GameToUIEvent) => {
            if (event.type === eventType) {
                handlerRef.current(event as EventOfType<T>);
            }
        });
    }, [eventType]);
}

/**
 * Subscribe to multiple event types.
 */
export function useGameEvents<T extends EventType>(
    eventTypes: T[],
    handler: (event: EventOfType<T>) => void
): void {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;
    const typesRef = useRef(eventTypes);

    useEffect(() => {
        const bridge = getGameBridge();
        const types = new Set(typesRef.current);

        return bridge.subscribeToGame((event: GameToUIEvent) => {
            if (types.has(event.type as T)) {
                handlerRef.current(event as EventOfType<T>);
            }
        });
    }, []);
}

/**
 * Pre-built event hooks.
 */
export function useHitMarker(onHit: (critical: boolean) => void): void {
    useGameEvent('hit_marker', (e) => onHit(e.critical));
}

export function useDamageIndicator(
    onDamage: (direction: { x: number; y: number; z: number }, amount: number) => void
): void {
    useGameEvent('damage_indicator', (e) => onDamage(e.direction, e.amount));
}

export function useKillFeedEvent(
    onKill: (entry: {
        killerName: string;
        victimName: string;
        weapon: string
    }) => void
): void {
    useGameEvent('kill_feed', (e) => onKill(e.entry));
}

export function useConnectionStatus(
    onConnect: () => void,
    onDisconnect: () => void
): void {
    useGameEvent('connected', onConnect);
    useGameEvent('disconnected', onDisconnect);
}

export function useMatchEvents(
    onStart: () => void,
    onEnd: (winningTeam: number) => void
): void {
    useGameEvent('match_start', onStart);
    useGameEvent('match_end', (e) => onEnd(e.winningTeam));
}
