/**
 * Party Service
 * 
 * Manages party creation, invites, and member synchronization.
 */

import type { PlayerId } from '@snapshot/shared';

// =============================================================================
// TYPES
// =============================================================================

export interface Party {
    id: string;
    leaderId: PlayerId;
    members: PlayerId[];
    maxSize: number;
    inviteCode: string;
    createdAt: number;
    status: 'idle' | 'queuing' | 'in_match';
}

export interface PartyInvite {
    partyId: string;
    inviterId: PlayerId;
    inviteeId: PlayerId;
    createdAt: number;
    expiresAt: number;
}

type PartyUpdateCallback = (party: Party) => void;

// =============================================================================
// CONSTANTS
// =============================================================================

const PARTY = {
    MAX_SIZE: 4,
    INVITE_EXPIRY: 60000, // 1 minute
    CODE_LENGTH: 6,
} as const;

// =============================================================================
// PARTY SERVICE
// =============================================================================

export class PartyService {
    private parties: Map<string, Party> = new Map();
    private playerParties: Map<PlayerId, string> = new Map();
    private invites: Map<string, PartyInvite> = new Map();
    private partyByCode: Map<string, string> = new Map();
    private updateCallbacks: Map<string, PartyUpdateCallback[]> = new Map();
    private nextPartyId = 1;

    /**
     * Create a new party.
     */
    createParty(leaderId: PlayerId): Party {
        // Leave current party if in one
        this.leaveParty(leaderId);

        const party: Party = {
            id: `party_${this.nextPartyId++}`,
            leaderId,
            members: [leaderId],
            maxSize: PARTY.MAX_SIZE,
            inviteCode: this.generateCode(),
            createdAt: Date.now(),
            status: 'idle',
        };

        this.parties.set(party.id, party);
        this.playerParties.set(leaderId, party.id);
        this.partyByCode.set(party.inviteCode, party.id);

        console.log(`[Party] Created: ${party.id} by ${leaderId}`);
        return party;
    }

    /**
     * Join a party by invite code.
     */
    joinByCode(playerId: PlayerId, code: string): Party | null {
        const partyId = this.partyByCode.get(code.toUpperCase());
        if (!partyId) {
            console.log(`[Party] Invalid code: ${code}`);
            return null;
        }

        return this.joinParty(playerId, partyId);
    }

    /**
     * Join a specific party.
     */
    joinParty(playerId: PlayerId, partyId: string): Party | null {
        const party = this.parties.get(partyId);
        if (!party) return null;

        // Check if full
        if (party.members.length >= party.maxSize) {
            console.log(`[Party] ${partyId} is full`);
            return null;
        }

        // Check if already queuing
        if (party.status === 'queuing' || party.status === 'in_match') {
            console.log(`[Party] ${partyId} is busy`);
            return null;
        }

        // Leave current party
        this.leaveParty(playerId);

        // Join new party
        party.members.push(playerId);
        this.playerParties.set(playerId, partyId);

        console.log(`[Party] ${playerId} joined ${partyId}`);
        this.notifyUpdate(party);
        return party;
    }

    /**
     * Leave current party.
     */
    leaveParty(playerId: PlayerId): void {
        const partyId = this.playerParties.get(playerId);
        if (!partyId) return;

        const party = this.parties.get(partyId);
        if (!party) {
            this.playerParties.delete(playerId);
            return;
        }

        // Remove from members
        party.members = party.members.filter(id => id !== playerId);
        this.playerParties.delete(playerId);

        console.log(`[Party] ${playerId} left ${partyId}`);

        // If party is empty, destroy it
        if (party.members.length === 0) {
            this.destroyParty(partyId);
            return;
        }

        // If leader left, promote next member
        if (party.leaderId === playerId) {
            party.leaderId = party.members[0]!;
            console.log(`[Party] New leader: ${party.leaderId}`);
        }

        this.notifyUpdate(party);
    }

    /**
     * Destroy a party.
     */
    destroyParty(partyId: string): void {
        const party = this.parties.get(partyId);
        if (!party) return;

        // Remove all members
        for (const memberId of party.members) {
            this.playerParties.delete(memberId);
        }

        // Cleanup
        this.partyByCode.delete(party.inviteCode);
        this.parties.delete(partyId);
        this.updateCallbacks.delete(partyId);

        console.log(`[Party] Destroyed: ${partyId}`);
    }

    /**
     * Get player's party.
     */
    getPlayerParty(playerId: PlayerId): Party | undefined {
        const partyId = this.playerParties.get(playerId);
        return partyId ? this.parties.get(partyId) : undefined;
    }

    /**
     * Get party by ID.
     */
    getParty(partyId: string): Party | undefined {
        return this.parties.get(partyId);
    }

    /**
     * Update party status.
     */
    setStatus(partyId: string, status: Party['status']): void {
        const party = this.parties.get(partyId);
        if (!party) return;

        party.status = status;
        this.notifyUpdate(party);
    }

    /**
     * Check if player is party leader.
     */
    isLeader(playerId: PlayerId): boolean {
        const party = this.getPlayerParty(playerId);
        return party?.leaderId === playerId;
    }

    /**
     * Transfer leadership.
     */
    transferLeadership(currentLeader: PlayerId, newLeader: PlayerId): boolean {
        const party = this.getPlayerParty(currentLeader);
        if (!party || party.leaderId !== currentLeader) return false;
        if (!party.members.includes(newLeader)) return false;

        party.leaderId = newLeader;
        this.notifyUpdate(party);
        console.log(`[Party] Leadership transferred to ${newLeader}`);
        return true;
    }

    /**
     * Subscribe to party updates.
     */
    onUpdate(partyId: string, callback: PartyUpdateCallback): () => void {
        const callbacks = this.updateCallbacks.get(partyId) ?? [];
        callbacks.push(callback);
        this.updateCallbacks.set(partyId, callbacks);

        // Return unsubscribe function
        return () => {
            const current = this.updateCallbacks.get(partyId);
            if (current) {
                this.updateCallbacks.set(partyId, current.filter(c => c !== callback));
            }
        };
    }

    /**
     * Get all party member IDs.
     */
    getPartyMembers(playerId: PlayerId): PlayerId[] {
        const party = this.getPlayerParty(playerId);
        return party?.members ?? [playerId];
    }

    // =========================================================================
    // PRIVATE
    // =========================================================================

    private generateCode(): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < PARTY.CODE_LENGTH; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }

        // Ensure unique
        if (this.partyByCode.has(code)) {
            return this.generateCode();
        }

        return code;
    }

    private notifyUpdate(party: Party): void {
        const callbacks = this.updateCallbacks.get(party.id);
        if (callbacks) {
            for (const callback of callbacks) {
                callback(party);
            }
        }
    }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createPartyService(): PartyService {
    return new PartyService();
}
