/**
 * Remote Config
 * 
 * Live balance patches and configuration that can be
 * updated without client patches.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface RemoteConfig {
    /** Config version */
    version: number;

    /** When this config was published */
    timestamp: number;

    /** Balance overrides */
    balance: BalanceConfig;

    /** Feature toggles */
    features: FeatureFlags;

    /** Emergency disables */
    disables: DisableList;

    /** Live events */
    events: LiveEvent[];

    /** Previous version for rollback */
    previousVersion?: number;
}

// =============================================================================
// BALANCE CONFIG
// =============================================================================

export interface BalanceConfig {
    /** Weapon stat overrides */
    weapons: Record<string, WeaponOverride>;

    /** Ability stat overrides */
    abilities: Record<string, AbilityOverride>;

    /** Character stat overrides */
    characters: Record<string, CharacterOverride>;
}

export interface WeaponOverride {
    damage?: number;
    fireRate?: number;
    magazineSize?: number;
    reloadTime?: number;
    range?: number;
    spreadMultiplier?: number;
}

export interface AbilityOverride {
    cooldown?: number;
    damage?: number;
    duration?: number;
    range?: number;
    chargeRate?: number;
}

export interface CharacterOverride {
    health?: number;
    shield?: number;
    moveSpeed?: number;
}

// =============================================================================
// FEATURE FLAGS
// =============================================================================

export interface FeatureFlags {
    /** Is ranked mode enabled */
    rankedEnabled: boolean;

    /** Is voice chat enabled */
    voiceChatEnabled: boolean;

    /** Is cross-play enabled */
    crossPlayEnabled: boolean;

    /** Per-character toggles */
    characterEnabled: Record<string, boolean>;

    /** Per-mode toggles */
    modeEnabled: Record<string, boolean>;

    /** A/B experiments */
    experiments: Record<string, ExperimentConfig>;
}

export interface ExperimentConfig {
    /** Is experiment active */
    enabled: boolean;

    /** Rollout percentage (0-100) */
    rolloutPercent: number;

    /** User cohorts included */
    cohorts: string[];
}

// =============================================================================
// DISABLE LIST
// =============================================================================

export interface DisableList {
    /** Disabled character IDs */
    characters: string[];

    /** Disabled weapon IDs */
    weapons: string[];

    /** Disabled ability IDs */
    abilities: string[];

    /** Disabled map IDs */
    maps: string[];

    /** Disabled mode IDs */
    modes: string[];

    /** Global maintenance mode */
    maintenance: boolean;

    /** Maintenance message */
    maintenanceMessage?: string;
}

// =============================================================================
// LIVE EVENTS
// =============================================================================

export interface LiveEvent {
    /** Event ID */
    id: string;

    /** Event name */
    name: string;

    /** Start time (ISO string) */
    startTime: string;

    /** End time (ISO string) */
    endTime: string;

    /** Event type */
    type: 'double_xp' | 'special_mode' | 'limited_time' | 'seasonal';

    /** Event-specific config */
    config: Record<string, unknown>;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

export const DEFAULT_REMOTE_CONFIG: RemoteConfig = {
    version: 1,
    timestamp: Date.now(),
    balance: {
        weapons: {},
        abilities: {},
        characters: {},
    },
    features: {
        rankedEnabled: true,
        voiceChatEnabled: true,
        crossPlayEnabled: true,
        characterEnabled: {},
        modeEnabled: {},
        experiments: {},
    },
    disables: {
        characters: [],
        weapons: [],
        abilities: [],
        maps: [],
        modes: [],
        maintenance: false,
    },
    events: [],
};

// =============================================================================
// CONFIG SERVICE
// =============================================================================

type ConfigUpdateCallback = (config: RemoteConfig) => void;

export class RemoteConfigService {
    private config: RemoteConfig = DEFAULT_REMOTE_CONFIG;
    private history: RemoteConfig[] = [];
    private listeners: Set<ConfigUpdateCallback> = new Set();
    private fetchInterval: NodeJS.Timeout | null = null;

    /**
     * Start periodic config fetching.
     */
    start(configUrl: string, intervalMs: number = 60000): void {
        this.fetchConfig(configUrl);
        this.fetchInterval = setInterval(() => {
            this.fetchConfig(configUrl);
        }, intervalMs);
    }

    /**
     * Stop fetching.
     */
    stop(): void {
        if (this.fetchInterval) {
            clearInterval(this.fetchInterval);
            this.fetchInterval = null;
        }
    }

    /**
     * Get current config.
     */
    getConfig(): RemoteConfig {
        return this.config;
    }

    /**
     * Subscribe to config updates.
     */
    subscribe(callback: ConfigUpdateCallback): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Apply new config.
     */
    applyConfig(config: RemoteConfig): void {
        // Store history
        this.history.push(this.config);
        if (this.history.length > 10) {
            this.history.shift();
        }

        this.config = config;
        this.notifyListeners();
        console.log(`[RemoteConfig] Applied version ${config.version}`);
    }

    /**
     * Rollback to previous version.
     */
    rollback(): boolean {
        const previous = this.history.pop();
        if (!previous) return false;

        this.config = previous;
        this.notifyListeners();
        console.log(`[RemoteConfig] Rolled back to version ${previous.version}`);
        return true;
    }

    /**
     * Check if item is disabled.
     */
    isDisabled(type: 'character' | 'weapon' | 'ability' | 'map' | 'mode', id: string): boolean {
        const list = this.config.disables;
        switch (type) {
            case 'character': return list.characters.includes(id);
            case 'weapon': return list.weapons.includes(id);
            case 'ability': return list.abilities.includes(id);
            case 'map': return list.maps.includes(id);
            case 'mode': return list.modes.includes(id);
            default: return false;
        }
    }

    /**
     * Get balance override for weapon.
     */
    getWeaponOverride(weaponId: string): WeaponOverride | undefined {
        return this.config.balance.weapons[weaponId];
    }

    /**
     * Get balance override for ability.
     */
    getAbilityOverride(abilityId: string): AbilityOverride | undefined {
        return this.config.balance.abilities[abilityId];
    }

    /**
     * Check if feature is enabled.
     */
    isFeatureEnabled(feature: keyof FeatureFlags): boolean {
        return !!this.config.features[feature];
    }

    /**
     * Check if user is in experiment.
     */
    isInExperiment(experimentId: string, userId: string): boolean {
        const exp = this.config.features.experiments[experimentId];
        if (!exp || !exp.enabled) return false;

        // Simple hash-based rollout
        const hash = this.hashString(userId + experimentId);
        return (hash % 100) < exp.rolloutPercent;
    }

    // =========================================================================
    // PRIVATE
    // =========================================================================

    private async fetchConfig(url: string): Promise<void> {
        try {
            const response = await fetch(url);
            const config = await response.json() as RemoteConfig;

            if (config.version > this.config.version) {
                this.applyConfig(config);
            }
        } catch (e) {
            console.error('[RemoteConfig] Fetch failed:', e);
        }
    }

    private notifyListeners(): void {
        for (const listener of this.listeners) {
            try {
                listener(this.config);
            } catch (e) {
                console.error('[RemoteConfig] Listener error:', e);
            }
        }
    }

    private hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }
}

// =============================================================================
// FACTORY
// =============================================================================

let instance: RemoteConfigService | null = null;

export function getRemoteConfig(): RemoteConfigService {
    if (!instance) {
        instance = new RemoteConfigService();
    }
    return instance;
}

export function createRemoteConfigService(): RemoteConfigService {
    return new RemoteConfigService();
}
