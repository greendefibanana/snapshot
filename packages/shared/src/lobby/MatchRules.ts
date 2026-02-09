/**
 * Match Rules Module
 * 
 * Pure rule evaluation for team sizes, match modes, and lobby validation.
 * 
 * SCOPE: Rule definitions and validation only. No matchmaking, no state.
 */

// =============================================================================
// TYPES
// =============================================================================

/** Supported team configurations */
export type TeamSize = '1v1' | '4v4';

/** Match mode types */
export type MatchMode = 'casual' | 'training';

/** Mode-specific configuration */
export interface ModeConfig {
    /** Allow teams to have different player counts */
    readonly allowUnbalancedTeams: boolean;
    /** Allow AI bots to fill empty slots */
    readonly allowBots: boolean;
    /** Require all players to be ready before starting */
    readonly requireAllReady: boolean;
}

/** Complete match rule configuration */
export interface MatchRules {
    readonly teamSize: TeamSize;
    readonly mode: MatchMode;
    readonly playersPerTeam: number;
    readonly totalPlayers: number;
    readonly minPlayersToStart: number;
    readonly modeConfig: ModeConfig;
}

/** Validation result */
export interface ValidationResult {
    readonly valid: boolean;
    readonly errors: readonly string[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Mode configurations */
const MODE_CONFIGS: Record<MatchMode, ModeConfig> = {
    casual: {
        allowUnbalancedTeams: false,
        allowBots: false,
        requireAllReady: true,
    },
    training: {
        allowUnbalancedTeams: true,
        allowBots: true,
        requireAllReady: false,
    },
};

/** Team size to player count mapping */
const TEAM_SIZE_MAP: Record<TeamSize, number> = {
    '1v1': 1,
    '4v4': 4,
};

/** Minimum players to start by mode */
const MIN_PLAYERS_BY_MODE: Record<MatchMode, Record<TeamSize, number>> = {
    casual: {
        '1v1': 2,  // Both players required
        '4v4': 2,  // At least 1v1 for testing (TODO: change to 8 for prod)
    },
    training: {
        '1v1': 1,  // Solo practice allowed
        '4v4': 1,  // Solo practice allowed
    },
};

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a match rules configuration.
 */
export function createMatchRules(teamSize: TeamSize, mode: MatchMode): MatchRules {
    const playersPerTeam = TEAM_SIZE_MAP[teamSize];

    return {
        teamSize,
        mode,
        playersPerTeam,
        totalPlayers: playersPerTeam * 2,
        minPlayersToStart: MIN_PLAYERS_BY_MODE[mode][teamSize],
        modeConfig: MODE_CONFIGS[mode],
    };
}

/**
 * Get default match rules (4v4 casual).
 */
export function getDefaultMatchRules(): MatchRules {
    return createMatchRules('4v4', 'casual');
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate if a match can start.
 */
export function validateCanStart(
    rules: MatchRules,
    playerCount: number,
    team1Count: number,
    team2Count: number
): ValidationResult {
    const errors: string[] = [];

    // Check minimum players
    if (playerCount < rules.minPlayersToStart) {
        errors.push(`Need at least ${rules.minPlayersToStart} players to start (have ${playerCount})`);
    }

    // Check team balance for casual mode
    if (!rules.modeConfig.allowUnbalancedTeams) {
        const diff = Math.abs(team1Count - team2Count);
        if (diff > 1) {
            errors.push(`Teams are unbalanced: ${team1Count} vs ${team2Count}`);
        }

        // Both teams need at least one player
        if (team1Count === 0 || team2Count === 0) {
            errors.push('Both teams must have at least one player');
        }
    }

    // Check max team size
    if (team1Count > rules.playersPerTeam) {
        errors.push(`Team 1 exceeds max size: ${team1Count}/${rules.playersPerTeam}`);
    }
    if (team2Count > rules.playersPerTeam) {
        errors.push(`Team 2 exceeds max size: ${team2Count}/${rules.playersPerTeam}`);
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Validate if a player can join the room.
 */
export function validateCanJoin(
    rules: MatchRules,
    currentPlayerCount: number
): ValidationResult {
    const errors: string[] = [];

    if (currentPlayerCount >= rules.totalPlayers) {
        errors.push(`Room is full (${currentPlayerCount}/${rules.totalPlayers})`);
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Validate if a player can switch to a team.
 */
export function validateTeamSwitch(
    rules: MatchRules,
    targetTeamCount: number
): ValidationResult {
    const errors: string[] = [];

    if (targetTeamCount >= rules.playersPerTeam) {
        errors.push(`Team is full (${targetTeamCount}/${rules.playersPerTeam})`);
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get all available team sizes.
 */
export function getAvailableTeamSizes(): readonly TeamSize[] {
    return ['1v1', '4v4'] as const;
}

/**
 * Get all available match modes.
 */
export function getAvailableMatchModes(): readonly MatchMode[] {
    return ['casual', 'training'] as const;
}

/**
 * Check if rules allow bots.
 */
export function canUseBots(rules: MatchRules): boolean {
    return rules.modeConfig.allowBots;
}

/**
 * Check if all players must be ready to start.
 */
export function requiresAllReady(rules: MatchRules): boolean {
    return rules.modeConfig.requireAllReady;
}
