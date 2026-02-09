/**
 * Lobby Module Exports
 */

export {
    // Types
    type PreMatchPhase,
    type PreMatchTeam,
    type PreMatchConfig,
    type PreMatchClientMessage,
    type PreMatchServerMessage,
    // Constants
    DEFAULT_PREMATCH_CONFIG,
    // Schemas
    PreMatchPlayer,
    PreMatchRoomState,
} from './LobbySchema.js';

export {
    // Types
    type TeamSize,
    type MatchMode,
    type ModeConfig,
    type MatchRules,
    type ValidationResult,
    // Factory
    createMatchRules,
    getDefaultMatchRules,
    // Validation
    validateCanStart,
    validateCanJoin,
    validateTeamSwitch,
    // Helpers
    getAvailableTeamSizes,
    getAvailableMatchModes,
    canUseBots,
    requiresAllReady,
} from './MatchRules.js';

export {
    // Types
    type WagerPolicyType,
    type CurrencyId,
    type WagerPolicyBase,
    type NoWagerPolicy,
    type FixedWagerPolicy,
    type OrderBookWagerPolicy,
    type WagerPolicy,
    type PlayerWager,
    type WagerValidation,
    type LockResult,
    type SettleResult,
    type RefundResult,
    type WagerSettlementHooks,
    // Factory
    createNoWagerPolicy,
    createFixedWagerPolicy,
    createOrderBookWagerPolicy,
    // Validation
    validateWager,
    validateAllWagers,
    calculateTotalPot,
    calculateWinnerPayout,
    // Placeholder
    placeholderSettlement,
} from './WagerPolicy.js';

export {
    // Types
    type AccessPolicyType,
    type AdmissionFailure,
    type AdmissionResult,
    type AccessPolicyBase,
    type PublicPolicy,
    type FriendsPolicy,
    type TokenGatePolicy,
    type NftGatePolicy,
    type AccessPolicy,
    type FriendListProvider,
    type TokenBalanceProvider,
    type NftOwnershipProvider,
    type AdmissionProviders,
    // Factory
    createPublicPolicy,
    createFriendsPolicy,
    createTokenGatePolicy,
    createNftGatePolicy,
    // Admission
    checkAdmission,
    // Placeholders
    placeholderFriendProvider,
    placeholderTokenProvider,
    placeholderNftProvider,
    placeholderProviders,
} from './AccessPolicy.js';

