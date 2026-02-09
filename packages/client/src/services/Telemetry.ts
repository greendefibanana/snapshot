/**
 * Telemetry Service
 * 
 * Client-side event tracking for analytics, balance decisions,
 * and crash reporting.
 */

// =============================================================================
// TYPES
// =============================================================================

export type TelemetryEventType =
    | 'session_start' | 'session_end'
    | 'match_start' | 'match_end'
    | 'player_kill' | 'player_death'
    | 'ability_used' | 'weapon_fired'
    | 'objective_captured' | 'objective_lost'
    | 'error' | 'crash'
    | 'performance'
    | 'ui_interaction'
    | 'purchase';

export interface TelemetryEvent {
    /** Event type */
    eventType: TelemetryEventType;

    /** Unix timestamp */
    timestamp: number;

    /** Client session ID */
    sessionId: string;

    /** Player ID */
    playerId: string;

    /** Match ID (if in match) */
    matchId?: string | undefined;

    /** Event-specific data */
    data: Record<string, unknown>;
}

export interface TelemetryConfig {
    /** Endpoint URL */
    endpoint: string;

    /** Batch size before flush */
    batchSize: number;

    /** Flush interval (ms) */
    flushInterval: number;

    /** Enable debug logging */
    debug: boolean;

    /** Sample rate (0-1) for performance events */
    performanceSampleRate: number;
}

// =============================================================================
// TELEMETRY SERVICE
// =============================================================================

export class TelemetryService {
    private config: TelemetryConfig;
    private queue: TelemetryEvent[] = [];
    private sessionId: string;
    private playerId: string = '';
    private matchId: string | null = null;
    private flushTimer: NodeJS.Timeout | null = null;

    constructor(config: Partial<TelemetryConfig> = {}) {
        this.config = {
            endpoint: '/api/telemetry',
            batchSize: 20,
            flushInterval: 30000, // 30 seconds
            debug: false,
            performanceSampleRate: 0.1, // 10%
            ...config,
        };

        this.sessionId = this.generateId();
    }

    /**
     * Start the telemetry service.
     */
    start(playerId: string): void {
        this.playerId = playerId;

        this.flushTimer = setInterval(() => {
            this.flush();
        }, this.config.flushInterval);

        this.track('session_start', {});

        // Flush on page unload
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => this.flush());
        }

        if (this.config.debug) {
            console.log('[Telemetry] Started for', playerId);
        }
    }

    /**
     * Stop the service.
     */
    stop(): void {
        this.track('session_end', {});
        this.flush();

        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
    }

    /**
     * Set current match ID.
     */
    setMatchId(matchId: string | null): void {
        this.matchId = matchId;
    }

    /**
     * Track an event.
     */
    track(eventType: TelemetryEventType, data: Record<string, unknown>): void {
        // Sample performance events
        if (eventType === 'performance' && Math.random() > this.config.performanceSampleRate) {
            return;
        }

        const event: TelemetryEvent = {
            eventType,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            playerId: this.playerId,
            matchId: this.matchId ?? undefined,
            data,
        };

        this.queue.push(event);

        if (this.config.debug) {
            console.log('[Telemetry]', eventType, data);
        }

        // Auto-flush if batch size reached
        if (this.queue.length >= this.config.batchSize) {
            this.flush();
        }
    }

    // =========================================================================
    // CONVENIENCE METHODS
    // =========================================================================

    trackKill(data: {
        victimId: string;
        weaponId: string;
        distance: number;
        headshot: boolean;
    }): void {
        this.track('player_kill', data);
    }

    trackDeath(data: {
        killerId: string;
        weaponId: string;
        respawnTime: number;
    }): void {
        this.track('player_death', data);
    }

    trackAbility(data: {
        characterId: string;
        abilityId: string;
        hitCount: number;
        damageDealt: number;
    }): void {
        this.track('ability_used', data);
    }

    trackWeaponFired(data: {
        weaponId: string;
        hitTarget: boolean;
        distance?: number;
        headshot?: boolean;
    }): void {
        this.track('weapon_fired', data);
    }

    trackPerformance(data: {
        fps: number;
        ping: number;
        frameDrops: number;
        memoryUsage?: number;
    }): void {
        this.track('performance', data);
    }

    trackError(error: Error, context?: Record<string, unknown>): void {
        this.track('error', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            ...context,
        });
    }

    trackMatchEnd(data: {
        duration: number;
        winningTeam: number;
        scores: Record<number, number>;
        personalStats: {
            kills: number;
            deaths: number;
            assists: number;
            damageDealt: number;
        };
    }): void {
        this.track('match_end', data);
    }

    // =========================================================================
    // FLUSH
    // =========================================================================

    /**
     * Flush queued events to server.
     */
    async flush(): Promise<void> {
        if (this.queue.length === 0) return;

        const events = [...this.queue];
        this.queue = [];

        try {
            await fetch(this.config.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events }),
            });

            if (this.config.debug) {
                console.log(`[Telemetry] Flushed ${events.length} events`);
            }
        } catch (e) {
            // Re-queue on failure
            this.queue = [...events, ...this.queue];
            console.error('[Telemetry] Flush failed:', e);
        }
    }

    // =========================================================================
    // PRIVATE
    // =========================================================================

    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

// =============================================================================
// FACTORY
// =============================================================================

let instance: TelemetryService | null = null;

export function getTelemetry(): TelemetryService {
    if (!instance) {
        instance = new TelemetryService();
    }
    return instance;
}

export function createTelemetryService(config?: Partial<TelemetryConfig>): TelemetryService {
    return new TelemetryService(config);
}
