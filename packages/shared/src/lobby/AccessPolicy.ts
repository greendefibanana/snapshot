/**
 * Access Control Policies
 * 
 * Admission checks for lobby entry.
 * 
 * SCOPE: Admission logic only. No settlement, no gameplay.
 */

// =============================================================================
// TYPES
// =============================================================================

/** Access policy types */
export type AccessPolicyType = 'public' | 'friends' | 'token' | 'nft';

/** Admission failure reasons */
export type AdmissionFailure =
    | 'NOT_FRIEND'
    | 'INSUFFICIENT_BALANCE'
    | 'NFT_NOT_OWNED'
    | 'ROOM_FULL'
    | 'BANNED'
    | 'POLICY_CHECK_FAILED';

/** Admission check result */
export interface AdmissionResult {
    readonly admitted: boolean;
    readonly reason?: AdmissionFailure;
    readonly message?: string;
}

// =============================================================================
// POLICY INTERFACES
// =============================================================================

/** Base policy */
export interface AccessPolicyBase {
    readonly type: AccessPolicyType;
}

/** Public - anyone can join */
export interface PublicPolicy extends AccessPolicyBase {
    readonly type: 'public';
}

/** Friends-only - friends of host */
export interface FriendsPolicy extends AccessPolicyBase {
    readonly type: 'friends';
    readonly hostId: string;
}

/** Token-gated - minimum token balance */
export interface TokenGatePolicy extends AccessPolicyBase {
    readonly type: 'token';
    readonly tokenId: string;
    readonly minBalance: number;
}

/** NFT-gated - must hold specific NFT */
export interface NftGatePolicy extends AccessPolicyBase {
    readonly type: 'nft';
    readonly collectionId: string;
    readonly allowedTokenIds?: readonly string[];  // if empty, any from collection
}

/** Union of all policies */
export type AccessPolicy = PublicPolicy | FriendsPolicy | TokenGatePolicy | NftGatePolicy;

// =============================================================================
// PROVIDER INTERFACES (Abstract)
// =============================================================================

/**
 * Friend list provider.
 * Implement to integrate with your social system.
 */
export interface FriendListProvider {
    isFriend(hostId: string, playerId: string): Promise<boolean>;
}

/**
 * Token balance provider.
 * Implement to integrate with your token/wallet system.
 */
export interface TokenBalanceProvider {
    getBalance(playerId: string, tokenId: string): Promise<number>;
}

/**
 * NFT ownership provider.
 * Implement to integrate with your NFT system.
 */
export interface NftOwnershipProvider {
    ownsNft(
        playerId: string,
        collectionId: string,
        tokenIds?: readonly string[]
    ): Promise<boolean>;
}

/**
 * Combined providers for admission checks.
 */
export interface AdmissionProviders {
    friends?: FriendListProvider;
    tokens?: TokenBalanceProvider;
    nfts?: NftOwnershipProvider;
}

// =============================================================================
// FACTORY
// =============================================================================

/** Create public policy */
export function createPublicPolicy(): PublicPolicy {
    return { type: 'public' };
}

/** Create friends-only policy */
export function createFriendsPolicy(hostId: string): FriendsPolicy {
    return { type: 'friends', hostId };
}

/** Create token-gated policy */
export function createTokenGatePolicy(
    tokenId: string,
    minBalance: number
): TokenGatePolicy {
    return { type: 'token', tokenId, minBalance };
}

/** Create NFT-gated policy */
export function createNftGatePolicy(
    collectionId: string,
    allowedTokenIds?: string[]
): NftGatePolicy {
    const policy: NftGatePolicy = { type: 'nft', collectionId };
    if (allowedTokenIds !== undefined) {
        return { ...policy, allowedTokenIds };
    }
    return policy;
}

// =============================================================================
// ADMISSION CHECK
// =============================================================================

/**
 * Check if a player can be admitted to a lobby.
 */
export async function checkAdmission(
    policy: AccessPolicy,
    playerId: string,
    providers: AdmissionProviders
): Promise<AdmissionResult> {
    switch (policy.type) {
        case 'public':
            return admit();

        case 'friends':
            return checkFriendsPolicy(policy, playerId, providers.friends);

        case 'token':
            return checkTokenPolicy(policy, playerId, providers.tokens);

        case 'nft':
            return checkNftPolicy(policy, playerId, providers.nfts);

        default:
            return deny('POLICY_CHECK_FAILED', 'Unknown policy type');
    }
}

// =============================================================================
// POLICY CHECKS
// =============================================================================

async function checkFriendsPolicy(
    policy: FriendsPolicy,
    playerId: string,
    provider?: FriendListProvider
): Promise<AdmissionResult> {
    if (!provider) {
        return deny('POLICY_CHECK_FAILED', 'Friend list provider not configured');
    }

    // Host can always join their own lobby
    if (playerId === policy.hostId) {
        return admit();
    }

    const isFriend = await provider.isFriend(policy.hostId, playerId);
    if (!isFriend) {
        return deny('NOT_FRIEND', 'Only friends of the host can join');
    }

    return admit();
}

async function checkTokenPolicy(
    policy: TokenGatePolicy,
    playerId: string,
    provider?: TokenBalanceProvider
): Promise<AdmissionResult> {
    if (!provider) {
        return deny('POLICY_CHECK_FAILED', 'Token balance provider not configured');
    }

    const balance = await provider.getBalance(playerId, policy.tokenId);
    if (balance < policy.minBalance) {
        return deny(
            'INSUFFICIENT_BALANCE',
            `Need ${policy.minBalance} tokens, have ${balance}`
        );
    }

    return admit();
}

async function checkNftPolicy(
    policy: NftGatePolicy,
    playerId: string,
    provider?: NftOwnershipProvider
): Promise<AdmissionResult> {
    if (!provider) {
        return deny('POLICY_CHECK_FAILED', 'NFT ownership provider not configured');
    }

    const owns = await provider.ownsNft(
        playerId,
        policy.collectionId,
        policy.allowedTokenIds
    );

    if (!owns) {
        return deny(
            'NFT_NOT_OWNED',
            `Must own NFT from collection ${policy.collectionId}`
        );
    }

    return admit();
}

// =============================================================================
// HELPERS
// =============================================================================

function admit(): AdmissionResult {
    return { admitted: true };
}

function deny(reason: AdmissionFailure, message: string): AdmissionResult {
    return { admitted: false, reason, message };
}

// =============================================================================
// PLACEHOLDER PROVIDERS
// =============================================================================

/** Placeholder that allows everyone */
export const placeholderFriendProvider: FriendListProvider = {
    async isFriend(_hostId, _playerId) {
        console.log('[Access] Placeholder: allowing friend check');
        return true;
    },
};

/** Placeholder that returns max balance */
export const placeholderTokenProvider: TokenBalanceProvider = {
    async getBalance(_playerId, _tokenId) {
        console.log('[Access] Placeholder: returning max balance');
        return Number.MAX_SAFE_INTEGER;
    },
};

/** Placeholder that returns ownership */
export const placeholderNftProvider: NftOwnershipProvider = {
    async ownsNft(_playerId, _collectionId, _tokenIds) {
        console.log('[Access] Placeholder: returning NFT ownership');
        return true;
    },
};

/** All placeholder providers */
export const placeholderProviders: AdmissionProviders = {
    friends: placeholderFriendProvider,
    tokens: placeholderTokenProvider,
    nfts: placeholderNftProvider,
};
