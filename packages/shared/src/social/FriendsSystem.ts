/**
 * Friends and Invite System
 * 
 * Friend list, lobby invites, and abuse prevention.
 * 
 * SCOPE: Server-side logic only. No UI, no blockchain.
 */

// =============================================================================
// TYPES
// =============================================================================

export type PlayerId = string;
export type LobbyId = string;
export type InviteId = string;

/** Friend relationship status */
export type FriendStatus = 'pending' | 'accepted' | 'blocked';

/** Invite status */
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'expired';

/** Friend relationship */
export interface FriendRelation {
    readonly playerId: PlayerId;
    readonly friendId: PlayerId;
    readonly status: FriendStatus;
    readonly createdAt: number;
    readonly updatedAt: number;
}

/** Lobby invite */
export interface LobbyInvite {
    readonly inviteId: InviteId;
    readonly lobbyId: LobbyId;
    readonly fromPlayerId: PlayerId;
    readonly toPlayerId: PlayerId;
    readonly status: InviteStatus;
    readonly createdAt: number;
    readonly expiresAt: number;
}

/** Invite result */
export interface InviteResult {
    readonly success: boolean;
    readonly invite?: LobbyInvite;
    readonly error?: string;
}

/** Friend request result */
export interface FriendRequestResult {
    readonly success: boolean;
    readonly relation?: FriendRelation;
    readonly error?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Invite expiry (5 minutes) */
const INVITE_TTL_MS = 5 * 60 * 1000;

/** Rate limits */
const RATE_LIMITS = {
    invitesPerMinute: 5,
    friendRequestsPerHour: 10,
} as const;

// =============================================================================
// FRIEND LIST
// =============================================================================

/**
 * Manages friend relationships.
 */
export class FriendList {
    /** Map of playerId -> Map of friendId -> relation */
    private relations = new Map<PlayerId, Map<PlayerId, FriendRelation>>();

    /** Rate limit tracking: playerId -> timestamps of recent requests */
    private requestTimestamps = new Map<PlayerId, number[]>();

    // =========================================================================
    // FRIEND MANAGEMENT
    // =========================================================================

    /** Send a friend request */
    sendRequest(fromId: PlayerId, toId: PlayerId): FriendRequestResult {
        // Self-request check
        if (fromId === toId) {
            return { success: false, error: 'Cannot friend yourself' };
        }

        // Rate limit check
        if (!this.checkRequestRateLimit(fromId)) {
            return { success: false, error: 'Too many friend requests' };
        }

        // Block check
        if (this.isBlocked(toId, fromId)) {
            return { success: false, error: 'Cannot send request to this player' };
        }

        // Already friends check
        if (this.isFriend(fromId, toId)) {
            return { success: false, error: 'Already friends' };
        }

        const now = Date.now();
        const relation: FriendRelation = {
            playerId: fromId,
            friendId: toId,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
        };

        this.setRelation(fromId, toId, relation);
        this.trackRequestTimestamp(fromId);

        return { success: true, relation };
    }

    /** Accept a friend request */
    acceptRequest(playerId: PlayerId, fromId: PlayerId): FriendRequestResult {
        const pending = this.getRelation(fromId, playerId);
        if (!pending || pending.status !== 'pending') {
            return { success: false, error: 'No pending request' };
        }

        const now = Date.now();

        // Update both directions
        const relation1: FriendRelation = {
            ...pending,
            status: 'accepted',
            updatedAt: now,
        };
        const relation2: FriendRelation = {
            playerId: playerId,
            friendId: fromId,
            status: 'accepted',
            createdAt: now,
            updatedAt: now,
        };

        this.setRelation(fromId, playerId, relation1);
        this.setRelation(playerId, fromId, relation2);

        return { success: true, relation: relation1 };
    }

    /** Decline a friend request */
    declineRequest(playerId: PlayerId, fromId: PlayerId): boolean {
        return this.removeRelation(fromId, playerId);
    }

    /** Remove a friend */
    removeFriend(playerId: PlayerId, friendId: PlayerId): boolean {
        const removed1 = this.removeRelation(playerId, friendId);
        const removed2 = this.removeRelation(friendId, playerId);
        return removed1 || removed2;
    }

    /** Block a player */
    blockPlayer(playerId: PlayerId, blockId: PlayerId): void {
        // Remove existing friendship
        this.removeFriend(playerId, blockId);

        const now = Date.now();
        const relation: FriendRelation = {
            playerId: playerId,
            friendId: blockId,
            status: 'blocked',
            createdAt: now,
            updatedAt: now,
        };

        this.setRelation(playerId, blockId, relation);
    }

    /** Unblock a player */
    unblockPlayer(playerId: PlayerId, blockId: PlayerId): boolean {
        const relation = this.getRelation(playerId, blockId);
        if (relation?.status === 'blocked') {
            return this.removeRelation(playerId, blockId);
        }
        return false;
    }

    // =========================================================================
    // QUERIES
    // =========================================================================

    /** Check if two players are friends */
    isFriend(playerId: PlayerId, friendId: PlayerId): boolean {
        const relation = this.getRelation(playerId, friendId);
        return relation?.status === 'accepted';
    }

    /** Check if player is blocked by another */
    isBlocked(blockerId: PlayerId, blockedId: PlayerId): boolean {
        const relation = this.getRelation(blockerId, blockedId);
        return relation?.status === 'blocked';
    }

    /** Get all friends of a player */
    getFriends(playerId: PlayerId): PlayerId[] {
        const relations = this.relations.get(playerId);
        if (!relations) return [];

        return Array.from(relations.values())
            .filter(r => r.status === 'accepted')
            .map(r => r.friendId);
    }

    /** Get pending requests for a player */
    getPendingRequests(playerId: PlayerId): FriendRelation[] {
        const pending: FriendRelation[] = [];

        for (const [, relations] of this.relations) {
            for (const relation of relations.values()) {
                if (relation.friendId === playerId && relation.status === 'pending') {
                    pending.push(relation);
                }
            }
        }

        return pending;
    }

    // =========================================================================
    // INTERNAL
    // =========================================================================

    private getRelation(playerId: PlayerId, friendId: PlayerId): FriendRelation | undefined {
        return this.relations.get(playerId)?.get(friendId);
    }

    private setRelation(playerId: PlayerId, friendId: PlayerId, relation: FriendRelation): void {
        if (!this.relations.has(playerId)) {
            this.relations.set(playerId, new Map());
        }
        this.relations.get(playerId)!.set(friendId, relation);
    }

    private removeRelation(playerId: PlayerId, friendId: PlayerId): boolean {
        return this.relations.get(playerId)?.delete(friendId) ?? false;
    }

    private checkRequestRateLimit(playerId: PlayerId): boolean {
        const now = Date.now();
        const hourAgo = now - 60 * 60 * 1000;
        const timestamps = this.requestTimestamps.get(playerId) ?? [];
        const recent = timestamps.filter(t => t > hourAgo);
        return recent.length < RATE_LIMITS.friendRequestsPerHour;
    }

    private trackRequestTimestamp(playerId: PlayerId): void {
        if (!this.requestTimestamps.has(playerId)) {
            this.requestTimestamps.set(playerId, []);
        }
        this.requestTimestamps.get(playerId)!.push(Date.now());
    }
}

// =============================================================================
// INVITE MANAGER
// =============================================================================

/**
 * Manages lobby invites.
 */
export class InviteManager {
    private invites = new Map<InviteId, LobbyInvite>();

    /** Rate limit tracking: playerId -> timestamps of recent invites */
    private inviteTimestamps = new Map<PlayerId, number[]>();

    private inviteCounter = 0;

    constructor(private friendList: FriendList) { }

    // =========================================================================
    // INVITE MANAGEMENT
    // =========================================================================

    /** Create an invite */
    createInvite(
        lobbyId: LobbyId,
        fromId: PlayerId,
        toId: PlayerId
    ): InviteResult {
        // Self-invite check
        if (fromId === toId) {
            return { success: false, error: 'Cannot invite yourself' };
        }

        // Block check
        if (this.friendList.isBlocked(toId, fromId)) {
            return { success: false, error: 'Cannot invite this player' };
        }

        // Rate limit check
        if (!this.checkInviteRateLimit(fromId)) {
            return { success: false, error: 'Too many invites' };
        }

        // Check for existing pending invite
        const existing = this.getPendingInvite(lobbyId, toId);
        if (existing) {
            return { success: false, error: 'Player already has pending invite' };
        }

        const now = Date.now();
        const invite: LobbyInvite = {
            inviteId: this.generateInviteId(),
            lobbyId,
            fromPlayerId: fromId,
            toPlayerId: toId,
            status: 'pending',
            createdAt: now,
            expiresAt: now + INVITE_TTL_MS,
        };

        this.invites.set(invite.inviteId, invite);
        this.trackInviteTimestamp(fromId);

        return { success: true, invite };
    }

    /** Accept an invite */
    acceptInvite(inviteId: InviteId, playerId: PlayerId): InviteResult {
        const invite = this.invites.get(inviteId);

        if (!invite) {
            return { success: false, error: 'Invite not found' };
        }

        if (invite.toPlayerId !== playerId) {
            return { success: false, error: 'Not your invite' };
        }

        if (invite.status !== 'pending') {
            return { success: false, error: `Invite already ${invite.status}` };
        }

        if (Date.now() > invite.expiresAt) {
            this.updateInviteStatus(inviteId, 'expired');
            return { success: false, error: 'Invite expired' };
        }

        const updated = this.updateInviteStatus(inviteId, 'accepted');
        return { success: true, invite: updated };
    }

    /** Decline an invite */
    declineInvite(inviteId: InviteId, playerId: PlayerId): InviteResult {
        const invite = this.invites.get(inviteId);

        if (!invite) {
            return { success: false, error: 'Invite not found' };
        }

        if (invite.toPlayerId !== playerId) {
            return { success: false, error: 'Not your invite' };
        }

        const updated = this.updateInviteStatus(inviteId, 'declined');
        return { success: true, invite: updated };
    }

    /** Get pending invites for a player */
    getPendingInvites(playerId: PlayerId): LobbyInvite[] {
        const now = Date.now();
        const pending: LobbyInvite[] = [];

        for (const invite of this.invites.values()) {
            if (invite.toPlayerId === playerId && invite.status === 'pending') {
                if (now <= invite.expiresAt) {
                    pending.push(invite);
                } else {
                    this.updateInviteStatus(invite.inviteId, 'expired');
                }
            }
        }

        return pending;
    }

    /** Cleanup expired invites */
    pruneExpired(): number {
        const now = Date.now();
        let pruned = 0;

        for (const [id, invite] of this.invites) {
            if (invite.status === 'pending' && now > invite.expiresAt) {
                this.updateInviteStatus(id, 'expired');
                pruned++;
            }
        }

        return pruned;
    }

    // =========================================================================
    // INTERNAL
    // =========================================================================

    private getPendingInvite(lobbyId: LobbyId, playerId: PlayerId): LobbyInvite | undefined {
        for (const invite of this.invites.values()) {
            if (
                invite.lobbyId === lobbyId &&
                invite.toPlayerId === playerId &&
                invite.status === 'pending' &&
                Date.now() <= invite.expiresAt
            ) {
                return invite;
            }
        }
        return undefined;
    }

    private updateInviteStatus(inviteId: InviteId, status: InviteStatus): LobbyInvite {
        const invite = this.invites.get(inviteId)!;
        const updated: LobbyInvite = { ...invite, status };
        this.invites.set(inviteId, updated);
        return updated;
    }

    private checkInviteRateLimit(playerId: PlayerId): boolean {
        const now = Date.now();
        const minuteAgo = now - 60 * 1000;
        const timestamps = this.inviteTimestamps.get(playerId) ?? [];
        const recent = timestamps.filter(t => t > minuteAgo);
        return recent.length < RATE_LIMITS.invitesPerMinute;
    }

    private trackInviteTimestamp(playerId: PlayerId): void {
        if (!this.inviteTimestamps.has(playerId)) {
            this.inviteTimestamps.set(playerId, []);
        }
        this.inviteTimestamps.get(playerId)!.push(Date.now());
    }

    private generateInviteId(): InviteId {
        return `invite_${Date.now()}_${++this.inviteCounter}`;
    }
}

// =============================================================================
// FRIEND LIST PROVIDER (for AccessPolicy integration)
// =============================================================================

/**
 * Adapter for FriendList to work with AccessPolicy.
 */
export function createFriendListProvider(friendList: FriendList) {
    return {
        async isFriend(hostId: string, playerId: string): Promise<boolean> {
            return friendList.isFriend(hostId, playerId);
        },
    };
}
