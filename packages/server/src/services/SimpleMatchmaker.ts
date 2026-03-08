import { FriendList, type PlayerId, type LobbyState, type GameMode, type Ruleset, type FriendRelation } from '@snapshot/shared';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface MatchmakingRequest {
    playerId: PlayerId;
    mode: GameMode;
    ruleset: Ruleset;
    transport?: 'socket' | 'p2p';
    walletKey?: string;
    wagerAmountSol?: number;
    selectedLoadoutSlot?: number;
}

export interface Match {
    id: string;
    players: string[];
    hostPlayerId?: string;
    mode: GameMode;
    ruleset: Ruleset;
    transport: 'socket' | 'p2p';
    p2pRoomCode?: string;
    wagerAmountSol?: number;
    walletKeys: Record<string, string | undefined>;
    teamA: string[];
    teamB: string[];
    teamByPlayer: Record<string, 1 | 2>;
    targetScore: number;
    startTime: number;
    playerLoadouts: Record<string, PlayerLoadoutProfileSelection>;
}

export interface PlayerLoadoutSlot {
    name: string;
    characterModelId: string;
    weaponModelId: string;
}

export interface PlayerLoadoutProfile {
    selectedSlotIndex: number;
    slots: PlayerLoadoutSlot[];
}

export interface PlayerLoadoutProfileSelection {
    slotIndex: number;
    characterModelId: string;
    weaponModelId: string;
}

export interface PartyInviteView {
    inviteId: string;
    partyId: string;
    fromPlayerId: string;
    fromDisplayName: string;
    expiresAt: number;
}

export interface PartyStateView {
    id: string;
    leaderId: string;
    members: Array<{ playerId: string; displayName: string }>;
    maxSize: number;
    status: 'idle' | 'queueing' | 'in_match';
}

export interface SocialState {
    playerId: string;
    friends: Array<{ playerId: string; displayName: string }>;
    incomingFriendRequests: Array<{ playerId: string; displayName: string }>;
    outgoingFriendRequests: Array<{ playerId: string; displayName: string }>;
    party: PartyStateView | null;
    partyInvites: PartyInviteView[];
}

interface Party {
    id: string;
    leaderId: string;
    members: string[];
    maxSize: number;
    status: 'idle' | 'queueing' | 'in_match';
    createdAt: number;
}

interface PartyInvite {
    inviteId: string;
    partyId: string;
    fromPlayerId: string;
    toPlayerId: string;
    createdAt: number;
    expiresAt: number;
}

interface QueueEntry {
    id: string;
    leaderId: string;
    members: string[];
    mode: GameMode;
    ruleset: Ruleset;
    transport: 'socket' | 'p2p';
    wagerAmountSol?: number;
    walletKeys: Record<string, string | undefined>;
    selectedLoadoutSlotByPlayer: Record<string, number>;
    playerLoadouts: Record<string, PlayerLoadoutProfileSelection>;
    enqueuedAt: number;
}

const PARTY_MAX_SIZE = 2;
const PARTY_INVITE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_TEAM_SIZE = 1;
const DEFAULT_TARGET_SCORE = 10;
const TEAM_SIZE_BY_MODE: Partial<Record<GameMode, number>> = {
    '1v1': DEFAULT_TEAM_SIZE,
};
const TARGET_SCORE_BY_MODE: Partial<Record<GameMode, number>> = {
    '1v1': DEFAULT_TARGET_SCORE,
};
const LOADOUT_SLOT_COUNT = 5;
const VALID_CHARACTER_MODEL_IDS = new Set(['assasin', 'grizzly', 'kodiak', 'panda']);
const VALID_WEAPON_MODEL_IDS = new Set([
    'smg1',
    'sniper',
    'short-gun',
    'g-88-workhorse',
    'kilometer',
    'the-mainline',
    'tungsten',
    'v-3-interval',
]);
const DEFAULT_LOADOUT_SLOTS: PlayerLoadoutSlot[] = [
    { name: 'Assault', characterModelId: 'assasin', weaponModelId: 'smg1' },
    { name: 'Sniper', characterModelId: 'kodiak', weaponModelId: 'sniper' },
    { name: 'Support', characterModelId: 'panda', weaponModelId: 'the-mainline' },
    { name: 'Skirmish', characterModelId: 'grizzly', weaponModelId: 'short-gun' },
    { name: 'Custom', characterModelId: 'assasin', weaponModelId: 'v-3-interval' },
];
const P2P_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface PersistedSocialState {
    version: 1;
    savedAt: number;
    friendRelations: FriendRelation[];
    partyInvites: PartyInvite[];
    nextInviteId: number;
    outgoingFriendRequests: Record<string, string[]>;
    playerLoadoutsByWallet?: Record<string, PlayerLoadoutProfile>;
}

export class SimpleMatchmaker {
    private queueEntries: QueueEntry[] = [];
    private queueByPlayer: Map<string, string> = new Map();

    private matches: Map<string, Match> = new Map();
    private matchByPlayer: Map<string, string> = new Map();

    private parties: Map<string, Party> = new Map();
    private partyByPlayer: Map<string, string> = new Map();

    private partyInvites: Map<string, PartyInvite> = new Map();

    private playerNames: Map<string, string> = new Map();
    private playerWallets: Map<string, string> = new Map();

    private friendList = new FriendList();
    private outgoingFriendRequests: Map<string, Set<string>> = new Map();
    private loadoutsByWallet: Map<string, PlayerLoadoutProfile> = new Map();

    private nextPartyId = 1;
    private nextInviteId = 1;
    private readonly socialStatePath: string;
    private persistTimer: NodeJS.Timeout | null = null;
    private persistInFlight: Promise<void> | null = null;

    constructor() {
        this.socialStatePath = path.resolve(process.cwd(), 'data', 'social-state.json');
    }

    async loadPersistentState(): Promise<void> {
        try {
            const raw = await fs.readFile(this.socialStatePath, 'utf8');
            const parsed = JSON.parse(raw) as Partial<PersistedSocialState>;
            if (!parsed || parsed.version !== 1) return;

            const relations = Array.isArray(parsed.friendRelations) ? parsed.friendRelations : [];
            this.friendList.importRelations(relations);

            this.partyInvites.clear();
            const now = Date.now();
            for (const invite of Array.isArray(parsed.partyInvites) ? parsed.partyInvites : []) {
                if (!invite || typeof invite !== 'object') continue;
                if (typeof invite.inviteId !== 'string') continue;
                if (typeof invite.partyId !== 'string') continue;
                if (typeof invite.fromPlayerId !== 'string') continue;
                if (typeof invite.toPlayerId !== 'string') continue;
                if (typeof invite.expiresAt !== 'number') continue;
                if (invite.expiresAt <= now) continue;
                this.partyInvites.set(invite.inviteId, {
                    inviteId: invite.inviteId,
                    partyId: invite.partyId,
                    fromPlayerId: invite.fromPlayerId,
                    toPlayerId: invite.toPlayerId,
                    createdAt: typeof invite.createdAt === 'number' ? invite.createdAt : now,
                    expiresAt: invite.expiresAt,
                });
            }

            this.nextInviteId = Math.max(1, Number(parsed.nextInviteId ?? 1));

            this.outgoingFriendRequests.clear();
            const outgoing = parsed.outgoingFriendRequests;
            if (outgoing && typeof outgoing === 'object') {
                for (const [playerId, targets] of Object.entries(outgoing)) {
                    if (!Array.isArray(targets)) continue;
                    this.outgoingFriendRequests.set(playerId, new Set(targets.filter((target) => typeof target === 'string')));
                }
            }

            this.loadoutsByWallet.clear();
            if (parsed.playerLoadoutsByWallet && typeof parsed.playerLoadoutsByWallet === 'object') {
                for (const [walletKey, profile] of Object.entries(parsed.playerLoadoutsByWallet)) {
                    if (!walletKey) continue;
                    this.loadoutsByWallet.set(walletKey, this.normalizeLoadoutProfile(profile));
                }
            }
        } catch (error: any) {
            if (error?.code !== 'ENOENT') {
                console.warn('SimpleMatchmaker: failed to load social state', error);
            }
        }
    }

    async flushPersistentState(): Promise<void> {
        if (this.persistTimer) {
            clearTimeout(this.persistTimer);
            this.persistTimer = null;
        }
        if (this.persistInFlight) {
            await this.persistInFlight;
        }
        await this.persistSocialStateNow();
    }

    enqueue(request: MatchmakingRequest): void {
        if (request.mode !== '1v1') {
            return;
        }

        const members = this.resolveQueueMembers(request.playerId);
        if (members.length === 0) {
            return;
        }

        if (request.walletKey) {
            this.playerWallets.set(request.playerId, request.walletKey);
        }

        for (const memberId of members) {
            this.removeFromQueue(memberId as PlayerId);
        }

        const walletKeys: Record<string, string | undefined> = {};
        for (const memberId of members) {
            walletKeys[memberId] = memberId === request.playerId
                ? request.walletKey
                : this.playerWallets.get(memberId);
        }

        const entry: QueueEntry = {
            id: `queue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            leaderId: request.playerId,
            members,
            mode: '1v1',
            ruleset: request.ruleset,
            transport: request.transport === 'p2p' ? 'p2p' : 'socket',
            walletKeys,
            selectedLoadoutSlotByPlayer: {},
            playerLoadouts: {},
            enqueuedAt: Date.now(),
            ...(typeof request.wagerAmountSol === 'number' ? { wagerAmountSol: request.wagerAmountSol } : {}),
        };

        for (const memberId of members) {
            const selectedSlotIndex = memberId === request.playerId
                ? this.normalizeSlotIndex(request.selectedLoadoutSlot ?? this.getPersistedLoadoutsForPlayer(memberId as any).selectedSlotIndex)
                : this.getPersistedLoadoutsForPlayer(memberId as any).selectedSlotIndex;
            entry.selectedLoadoutSlotByPlayer[memberId] = selectedSlotIndex;
            entry.playerLoadouts[memberId] = this.resolvePlayerLoadoutSelection(memberId as any, selectedSlotIndex);
        }

        this.queueEntries.push(entry);
        for (const memberId of members) {
            this.queueByPlayer.set(memberId, entry.id);
        }

        const party = this.getPartyByPlayer(request.playerId);
        if (party) {
            party.status = 'queueing';
        }

        this.checkQueue();
    }

    removeFromQueue(playerId: PlayerId): void {
        const queueId = this.queueByPlayer.get(playerId);
        if (!queueId) return;

        const entry = this.queueEntries.find((q) => q.id === queueId);
        if (!entry) {
            this.queueByPlayer.delete(playerId);
            return;
        }

        this.queueEntries = this.queueEntries.filter((q) => q.id !== queueId);
        for (const memberId of entry.members) {
            this.queueByPlayer.delete(memberId);
            const party = this.getPartyByPlayer(memberId);
            if (party && party.status === 'queueing') {
                party.status = 'idle';
            }
        }
    }

    setPlayerName(playerId: PlayerId, displayName?: string | null): void {
        if (!displayName) return;
        this.playerNames.set(playerId, displayName);
    }

    setPlayerWallet(playerId: PlayerId, walletKey?: string | null): void {
        if (!walletKey) return;
        this.playerWallets.set(playerId, walletKey);
    }

    getPlayerWallet(playerId: PlayerId): string | undefined {
        return this.playerWallets.get(playerId);
    }

    getPersistedLoadoutsForPlayer(playerId: PlayerId): PlayerLoadoutProfile {
        const walletKey = this.playerWallets.get(playerId);
        if (!walletKey) {
            return this.normalizeLoadoutProfile(null);
        }
        const existing = this.loadoutsByWallet.get(walletKey);
        if (existing) {
            return this.normalizeLoadoutProfile(existing);
        }
        const fallback = this.normalizeLoadoutProfile(null);
        this.loadoutsByWallet.set(walletKey, fallback);
        this.markSocialDirty();
        return fallback;
    }

    savePersistedLoadoutsForPlayer(playerId: PlayerId, profile: unknown): { ok: boolean; error?: string; loadouts?: PlayerLoadoutProfile } {
        const walletKey = this.playerWallets.get(playerId);
        if (!walletKey) {
            return { ok: false, error: 'Wallet not authenticated.' };
        }
        const normalized = this.normalizeLoadoutProfile(profile);
        this.loadoutsByWallet.set(walletKey, normalized);
        this.markSocialDirty();
        return { ok: true, loadouts: normalized };
    }

    updateMatchLoadoutSelection(
        playerId: PlayerId,
        selection: Partial<{ slotIndex: number; characterModelId: string; weaponModelId: string }>
    ): PlayerLoadoutProfileSelection | null {
        const match = this.getMatchForPlayer(playerId);
        if (!match) return null;
        const current = match.playerLoadouts[playerId] ?? this.resolvePlayerLoadoutSelection(playerId, 0);
        const next: PlayerLoadoutProfileSelection = {
            slotIndex: typeof selection.slotIndex === 'number' ? this.normalizeSlotIndex(selection.slotIndex) : current.slotIndex,
            characterModelId: typeof selection.characterModelId === 'string' && VALID_CHARACTER_MODEL_IDS.has(selection.characterModelId)
                ? selection.characterModelId
                : current.characterModelId,
            weaponModelId: typeof selection.weaponModelId === 'string' && VALID_WEAPON_MODEL_IDS.has(selection.weaponModelId)
                ? selection.weaponModelId
                : current.weaponModelId,
        };
        match.playerLoadouts[playerId] = next;
        return next;
    }

    handlePlayerDisconnect(playerId: PlayerId): Match | undefined {
        this.removeFromQueue(playerId);
        this.leaveParty(playerId);
        this.pruneInvitesForPlayer(playerId);

        const disbanded = this.getMatchForPlayer(playerId);
        if (!disbanded) {
            return undefined;
        }

        this.matches.delete(disbanded.id);
        for (const id of disbanded.players) {
            this.matchByPlayer.delete(id);
            const party = this.getPartyByPlayer(id);
            if (party && party.status === 'in_match') {
                party.status = 'idle';
            }
        }
        return disbanded;
    }

    sendFriendRequest(fromPlayerId: PlayerId, toPlayerId: PlayerId): { ok: boolean; error?: string } {
        const result = this.friendList.sendRequest(fromPlayerId, toPlayerId);
        if (!result.success) {
            return { ok: false, error: result.error ?? 'Unable to send request' };
        }

        if (!this.outgoingFriendRequests.has(fromPlayerId)) {
            this.outgoingFriendRequests.set(fromPlayerId, new Set());
        }
        this.outgoingFriendRequests.get(fromPlayerId)!.add(toPlayerId);
        this.markSocialDirty();
        return { ok: true };
    }

    acceptFriendRequest(playerId: PlayerId, fromPlayerId: PlayerId): { ok: boolean; error?: string } {
        const result = this.friendList.acceptRequest(playerId, fromPlayerId);
        if (!result.success) {
            return { ok: false, error: result.error ?? 'Unable to accept request' };
        }

        this.outgoingFriendRequests.get(fromPlayerId)?.delete(playerId);
        this.markSocialDirty();
        return { ok: true };
    }

    declineFriendRequest(playerId: PlayerId, fromPlayerId: PlayerId): { ok: boolean; error?: string } {
        const removed = this.friendList.declineRequest(playerId, fromPlayerId);
        if (!removed) {
            return { ok: false, error: 'No pending request found' };
        }

        this.outgoingFriendRequests.get(fromPlayerId)?.delete(playerId);
        this.markSocialDirty();
        return { ok: true };
    }

    removeFriend(playerId: PlayerId, friendId: PlayerId): { ok: boolean; error?: string } {
        const removed = this.friendList.removeFriend(playerId, friendId);
        if (removed) this.markSocialDirty();
        return removed ? { ok: true } : { ok: false, error: 'Players are not friends' };
    }

    createParty(leaderId: PlayerId): PartyStateView {
        this.leaveParty(leaderId);

        const party: Party = {
            id: `party_${this.nextPartyId++}`,
            leaderId,
            members: [leaderId],
            maxSize: PARTY_MAX_SIZE,
            status: 'idle',
            createdAt: Date.now(),
        };

        this.parties.set(party.id, party);
        this.partyByPlayer.set(leaderId, party.id);

        return this.toPartyStateView(party);
    }

    leaveParty(playerId: PlayerId): void {
        const party = this.getPartyByPlayer(playerId);
        if (!party) {
            return;
        }

        if (party.status === 'queueing') {
            this.removeFromQueue(playerId);
        }

        party.members = party.members.filter((id) => id !== playerId);
        this.partyByPlayer.delete(playerId);

        if (party.members.length === 0) {
            this.parties.delete(party.id);
            this.pruneInvitesForParty(party.id);
            this.markSocialDirty();
            return;
        }

        if (party.leaderId === playerId) {
            party.leaderId = party.members[0]!;
        }

        party.status = 'idle';
        this.markSocialDirty();
    }

    inviteToParty(inviterId: PlayerId, inviteeId: PlayerId): { ok: boolean; error?: string; invite?: PartyInviteView } {
        const party = this.getPartyByPlayer(inviterId);
        if (!party) {
            return { ok: false, error: 'Create a party first' };
        }
        if (party.leaderId !== inviterId) {
            return { ok: false, error: 'Only party leader can invite players' };
        }
        if (party.members.length >= party.maxSize) {
            return { ok: false, error: 'Party is full' };
        }
        if (this.partyByPlayer.has(inviteeId)) {
            return { ok: false, error: 'Player is already in a party' };
        }
        if (!this.friendList.isFriend(inviterId, inviteeId)) {
            return { ok: false, error: 'You can only invite friends' };
        }

        const now = Date.now();
        this.pruneExpiredPartyInvites(now);

        for (const invite of this.partyInvites.values()) {
            if (invite.partyId === party.id && invite.toPlayerId === inviteeId) {
                return { ok: false, error: 'Invite already pending' };
            }
        }

        const invite: PartyInvite = {
            inviteId: `party_inv_${this.nextInviteId++}`,
            partyId: party.id,
            fromPlayerId: inviterId,
            toPlayerId: inviteeId,
            createdAt: now,
            expiresAt: now + PARTY_INVITE_TTL_MS,
        };
        this.partyInvites.set(invite.inviteId, invite);
        this.markSocialDirty();

        return {
            ok: true,
            invite: {
                inviteId: invite.inviteId,
                partyId: invite.partyId,
                fromPlayerId: invite.fromPlayerId,
                fromDisplayName: this.getPlayerDisplayName(invite.fromPlayerId),
                expiresAt: invite.expiresAt,
            },
        };
    }

    respondToPartyInvite(playerId: PlayerId, inviteId: string, accept: boolean): { ok: boolean; error?: string } {
        const invite = this.partyInvites.get(inviteId);
        if (!invite || invite.toPlayerId !== playerId) {
            return { ok: false, error: 'Invite not found' };
        }

        this.partyInvites.delete(inviteId);

        if (!accept) {
            this.markSocialDirty();
            return { ok: true };
        }

        if (Date.now() > invite.expiresAt) {
            return { ok: false, error: 'Invite expired' };
        }

        const party = this.parties.get(invite.partyId);
        if (!party) {
            return { ok: false, error: 'Party no longer exists' };
        }
        if (party.status !== 'idle') {
            return { ok: false, error: 'Party is currently busy' };
        }
        if (party.members.length >= party.maxSize) {
            return { ok: false, error: 'Party is full' };
        }

        this.leaveParty(playerId);
        party.members.push(playerId);
        this.partyByPlayer.set(playerId, party.id);
        this.markSocialDirty();

        return { ok: true };
    }

    getSocialState(playerId: PlayerId): SocialState {
        this.pruneExpiredPartyInvites(Date.now());

        const friends = this.friendList.getFriends(playerId).map((id) => ({
            playerId: id,
            displayName: this.getPlayerDisplayName(id),
        }));

        const incomingFriendRequests = this.friendList.getPendingRequests(playerId).map((relation) => ({
            playerId: relation.playerId,
            displayName: this.getPlayerDisplayName(relation.playerId),
        }));

        const outgoing = Array.from(this.outgoingFriendRequests.get(playerId) ?? []);
        const outgoingFriendRequests = outgoing.map((id) => ({
            playerId: id,
            displayName: this.getPlayerDisplayName(id),
        }));

        const party = this.getPartyByPlayer(playerId);
        const partyInvites = Array.from(this.partyInvites.values())
            .filter((invite) => invite.toPlayerId === playerId)
            .map((invite) => ({
                inviteId: invite.inviteId,
                partyId: invite.partyId,
                fromPlayerId: invite.fromPlayerId,
                fromDisplayName: this.getPlayerDisplayName(invite.fromPlayerId),
                expiresAt: invite.expiresAt,
            }));

        return {
            playerId,
            friends,
            incomingFriendRequests,
            outgoingFriendRequests,
            party: party ? this.toPartyStateView(party) : null,
            partyInvites,
        };
    }

    getMatchForPlayer(playerId: PlayerId): Match | undefined {
        const matchId = this.matchByPlayer.get(playerId);
        if (!matchId) return undefined;
        return this.matches.get(matchId);
    }

    getMatchById(matchId: string): Match | undefined {
        return this.matches.get(matchId);
    }

    removeMatch(matchId: string): void {
        const match = this.matches.get(matchId);
        if (!match) {
            return;
        }

        this.matches.delete(matchId);
        for (const playerId of match.players) {
            this.matchByPlayer.delete(playerId);
            const party = this.getPartyByPlayer(playerId);
            if (party && party.status === 'in_match') {
                party.status = 'idle';
            }
        }
    }

    getLobbyState(playerId: PlayerId): LobbyState {
        const match = this.getMatchForPlayer(playerId);
        if (match) {
            const players = match.players.map((id, index) => ({
                playerId: id,
                displayName: this.getPlayerDisplayName(id),
                team: match.teamByPlayer[id] ?? 0,
                slot: index,
                isReady: true,
                isHost: id === match.players[0],
            }));

            return {
                lobbyId: match.id,
                phase: 'starting',
                mode: match.mode,
                players,
                maxPlayers: (TEAM_SIZE_BY_MODE[match.mode] ?? DEFAULT_TEAM_SIZE) * 2,
                minPlayers: 2,
                countdownSec: 3,
                ruleset: match.ruleset,
                access: 'friends',
                localPlayerId: playerId,
            } as LobbyState;
        }

        const queueId = this.queueByPlayer.get(playerId);
        if (queueId) {
            const entry = this.queueEntries.find((q) => q.id === queueId);
            if (entry) {
                const waitTimeSec = Math.max(0, Math.floor((Date.now() - entry.enqueuedAt) / 1000));
                const playersInQueue = this.queueEntries.reduce((sum, q) => sum + q.members.length, 0);
                return {
                    lobbyId: queueId,
                    phase: 'queueing',
                    mode: entry.mode,
                    players: entry.members.map((id, index) => ({
                        playerId: id,
                        displayName: this.getPlayerDisplayName(id),
                        team: 0,
                        slot: index,
                        isReady: true,
                        isHost: id === entry.leaderId,
                    })),
                    localPlayerId: playerId,
                    ruleset: entry.ruleset,
                    access: 'friends',
                    maxPlayers: (TEAM_SIZE_BY_MODE[entry.mode] ?? DEFAULT_TEAM_SIZE) * 2,
                    minPlayers: 2,
                    countdownSec: 0,
                    queue: {
                        waitTimeSec,
                        mode: entry.mode,
                        ruleset: entry.ruleset,
                        playersInQueue,
                        wagerAmountSol: entry.wagerAmountSol,
                        totalPotSol: entry.wagerAmountSol ? entry.wagerAmountSol * 2 : undefined,
                    },
                } as LobbyState;
            }
        }

        const party = this.getPartyByPlayer(playerId);
        if (party) {
            return {
                lobbyId: party.id,
                phase: 'idle',
                mode: '1v1',
                players: party.members.map((id, index) => ({
                    playerId: id,
                    displayName: this.getPlayerDisplayName(id),
                    team: 0,
                    slot: index,
                    isReady: true,
                    isHost: id === party.leaderId,
                })),
                localPlayerId: playerId,
                ruleset: 'casual',
                access: 'friends',
                maxPlayers: PARTY_MAX_SIZE,
                minPlayers: 1,
                countdownSec: 0,
            } as LobbyState;
        }

        return {
            lobbyId: 'main_menu',
            phase: 'idle',
            mode: '1v1',
            players: [],
            localPlayerId: playerId,
            ruleset: 'casual',
            access: 'friends',
            maxPlayers: 2,
            minPlayers: 2,
            countdownSec: 0,
        } as LobbyState;
    }

    private checkQueue(): void {
        // Continue to produce matches while enough compatible groups exist.
        let created = true;
        while (created) {
            created = false;
            const grouped = new Map<string, QueueEntry[]>();
            for (const entry of this.queueEntries) {
                const key = `${entry.mode}:${entry.ruleset}:${entry.transport}:${entry.wagerAmountSol ?? 0}`;
                const bucket = grouped.get(key);
                if (bucket) {
                    bucket.push(entry);
                } else {
                    grouped.set(key, [entry]);
                }
            }

            for (const group of grouped.values()) {
                const mode = group[0]?.mode;
                if (!mode) continue;
                const teamSize = TEAM_SIZE_BY_MODE[mode] ?? DEFAULT_TEAM_SIZE;
                const targetPlayers = teamSize * 2;
                const exact = this.findMatchableSubset(group, targetPlayers, teamSize);
                if (!exact) continue;
                const match = this.createMatch(exact);
                if (!match) continue;
                created = true;
                break;
            }
        }
    }

    private createMatch(entries: QueueEntry[]): Match | null {
        const mode = entries[0]!.mode;
        const ruleset = entries[0]!.ruleset;
        const teamSize = TEAM_SIZE_BY_MODE[mode] ?? DEFAULT_TEAM_SIZE;

        const teams = this.assignTeams(entries, teamSize);
        if (!teams) {
            return null;
        }

        const players = [...teams.teamA, ...teams.teamB];
        const hostEntry = [...entries].sort((a, b) => a.enqueuedAt - b.enqueuedAt)[0]!;
        const hostPlayerId = hostEntry.leaderId;
        const walletKeys: Record<string, string | undefined> = {};
        for (const entry of entries) {
            for (const playerId of entry.members) {
                walletKeys[playerId] = entry.walletKeys[playerId] ?? this.playerWallets.get(playerId);
            }
        }

        const teamByPlayer: Record<string, 1 | 2> = {};
        for (const id of teams.teamA) teamByPlayer[id] = 1;
        for (const id of teams.teamB) teamByPlayer[id] = 2;

        const matchId = `match_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const playerLoadouts: Record<string, PlayerLoadoutProfileSelection> = {};
        for (const playerId of players) {
            const selection = entries
                .map((entry) => entry.playerLoadouts[playerId])
                .find((value) => value !== undefined)
                ?? this.resolvePlayerLoadoutSelection(playerId as any, 0);
            playerLoadouts[playerId] = selection;
        }
        const match: Match = {
            id: matchId,
            players,
            hostPlayerId,
            mode,
            ruleset,
            transport: entries[0]!.transport,
            walletKeys,
            teamA: teams.teamA,
            teamB: teams.teamB,
            teamByPlayer,
            targetScore: TARGET_SCORE_BY_MODE[mode] ?? DEFAULT_TARGET_SCORE,
            startTime: Date.now(),
            playerLoadouts,
            ...(entries[0]!.transport === 'p2p' ? { p2pRoomCode: this.generateP2PRoomCode() } : {}),
            ...(typeof entries[0]!.wagerAmountSol === 'number' ? { wagerAmountSol: entries[0]!.wagerAmountSol } : {}),
        };

        this.matches.set(match.id, match);
        for (const playerId of match.players) {
            this.matchByPlayer.set(playerId, match.id);
        }

        const consumed = new Set(entries.map((entry) => entry.id));
        this.queueEntries = this.queueEntries.filter((entry) => !consumed.has(entry.id));
        for (const entry of entries) {
            for (const memberId of entry.members) {
                this.queueByPlayer.delete(memberId);
                const party = this.getPartyByPlayer(memberId);
                if (party) {
                    party.status = 'in_match';
                }
            }
        }

        return match;
    }

    private assignTeams(entries: QueueEntry[], teamSize: number): { teamA: string[]; teamB: string[] } | null {
        const sorted = [...entries]
            .sort((a, b) => (b.members.length - a.members.length) || (a.enqueuedAt - b.enqueuedAt));

        const teamA: string[] = [];
        const teamB: string[] = [];

        for (const entry of sorted) {
            const size = entry.members.length;
            const canA = teamA.length + size <= teamSize;
            const canB = teamB.length + size <= teamSize;
            if (!canA && !canB) {
                return null;
            }

            if (canA && canB) {
                if (teamA.length <= teamB.length) {
                    teamA.push(...entry.members);
                } else {
                    teamB.push(...entry.members);
                }
                continue;
            }

            if (canA) {
                teamA.push(...entry.members);
            } else {
                teamB.push(...entry.members);
            }
        }

        if (teamA.length !== teamSize || teamB.length !== teamSize) {
            return null;
        }

        return { teamA, teamB };
    }

    private findMatchableSubset(entries: QueueEntry[], targetPlayers: number, teamSize: number): QueueEntry[] | null {
        const sorted = [...entries].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
        const maxScan = Math.min(sorted.length, 14);
        const pool = sorted.slice(0, maxScan);
        const chosen: QueueEntry[] = [];

        const dfs = (index: number, total: number): boolean => {
            if (total === targetPlayers) {
                return this.assignTeams(chosen, teamSize) !== null;
            }
            if (total > targetPlayers || index >= pool.length) {
                return false;
            }

            for (let i = index; i < pool.length; i++) {
                const next = pool[i]!;
                chosen.push(next);
                if (dfs(i + 1, total + next.members.length)) {
                    return true;
                }
                chosen.pop();
            }
            return false;
        };

        return dfs(0, 0) ? [...chosen] : null;
    }

    private resolveQueueMembers(playerId: string): string[] {
        const party = this.getPartyByPlayer(playerId);
        if (!party) {
            return [playerId];
        }

        // Queueing is party-leader authoritative so a full party stays in sync.
        if (party.leaderId !== playerId) {
            return [];
        }

        if (party.status === 'in_match') {
            return [];
        }

        return [...party.members];
    }

    private generateP2PRoomCode(length: number = 8): string {
        let out = '';
        for (let i = 0; i < length; i++) {
            out += P2P_CODE_CHARS[Math.floor(Math.random() * P2P_CODE_CHARS.length)]!;
        }
        return out;
    }

    private getPartyByPlayer(playerId: string): Party | undefined {
        const partyId = this.partyByPlayer.get(playerId);
        if (!partyId) return undefined;
        return this.parties.get(partyId);
    }

    private toPartyStateView(party: Party): PartyStateView {
        return {
            id: party.id,
            leaderId: party.leaderId,
            members: party.members.map((id) => ({
                playerId: id,
                displayName: this.getPlayerDisplayName(id),
            })),
            maxSize: party.maxSize,
            status: party.status,
        };
    }

    private getPlayerDisplayName(playerId: string): string {
        return this.playerNames.get(playerId) ?? `Player ${playerId.slice(0, 4)}`;
    }

    private pruneExpiredPartyInvites(now: number): void {
        let mutated = false;
        for (const [inviteId, invite] of this.partyInvites.entries()) {
            if (invite.expiresAt <= now) {
                this.partyInvites.delete(inviteId);
                mutated = true;
            }
        }
        if (mutated) this.markSocialDirty();
    }

    private pruneInvitesForParty(partyId: string): void {
        let mutated = false;
        for (const [inviteId, invite] of this.partyInvites.entries()) {
            if (invite.partyId === partyId) {
                this.partyInvites.delete(inviteId);
                mutated = true;
            }
        }
        if (mutated) this.markSocialDirty();
    }

    private pruneInvitesForPlayer(playerId: string): void {
        let mutated = false;
        for (const [inviteId, invite] of this.partyInvites.entries()) {
            if (invite.fromPlayerId === playerId || invite.toPlayerId === playerId) {
                this.partyInvites.delete(inviteId);
                mutated = true;
            }
        }
        if (mutated) this.markSocialDirty();
    }

    private normalizeLoadoutProfile(raw: unknown): PlayerLoadoutProfile {
        const value = raw as Partial<PlayerLoadoutProfile> | null;
        const slots: PlayerLoadoutSlot[] = [];
        for (let i = 0; i < LOADOUT_SLOT_COUNT; i++) {
            const fallback = DEFAULT_LOADOUT_SLOTS[i]!;
            const candidate = value?.slots?.[i] as Partial<PlayerLoadoutSlot> | undefined;
            const name = typeof candidate?.name === 'string' && candidate.name.trim()
                ? candidate.name.trim().slice(0, 24)
                : fallback.name;
            const characterModelId = typeof candidate?.characterModelId === 'string' && VALID_CHARACTER_MODEL_IDS.has(candidate.characterModelId)
                ? candidate.characterModelId
                : fallback.characterModelId;
            const weaponModelId = typeof candidate?.weaponModelId === 'string' && VALID_WEAPON_MODEL_IDS.has(candidate.weaponModelId)
                ? candidate.weaponModelId
                : fallback.weaponModelId;
            slots.push({ name, characterModelId, weaponModelId });
        }

        return {
            selectedSlotIndex: this.normalizeSlotIndex(value?.selectedSlotIndex ?? 0),
            slots,
        };
    }

    private normalizeSlotIndex(slotIndex: number): number {
        if (!Number.isFinite(slotIndex)) return 0;
        return Math.max(0, Math.min(LOADOUT_SLOT_COUNT - 1, Math.floor(slotIndex)));
    }

    private resolvePlayerLoadoutSelection(playerId: PlayerId, slotIndex: number): PlayerLoadoutProfileSelection {
        const profile = this.getPersistedLoadoutsForPlayer(playerId);
        const safeIndex = this.normalizeSlotIndex(slotIndex);
        const slot = profile.slots[safeIndex] ?? profile.slots[0] ?? DEFAULT_LOADOUT_SLOTS[0]!;
        return {
            slotIndex: safeIndex,
            characterModelId: slot.characterModelId,
            weaponModelId: slot.weaponModelId,
        };
    }

    private markSocialDirty(): void {
        if (this.persistTimer) return;
        this.persistTimer = setTimeout(() => {
            this.persistTimer = null;
            void this.persistSocialStateNow();
        }, 500);
    }

    private async persistSocialStateNow(): Promise<void> {
        if (this.persistInFlight) return this.persistInFlight;
        this.persistInFlight = (async () => {
            try {
                await fs.mkdir(path.dirname(this.socialStatePath), { recursive: true });
                const payload: PersistedSocialState = {
                    version: 1,
                    savedAt: Date.now(),
                    friendRelations: this.friendList.exportRelations(),
                    partyInvites: Array.from(this.partyInvites.values()),
                    nextInviteId: this.nextInviteId,
                    outgoingFriendRequests: Object.fromEntries(
                        Array.from(this.outgoingFriendRequests.entries()).map(([playerId, set]) => [playerId, Array.from(set.values())])
                    ),
                    playerLoadoutsByWallet: Object.fromEntries(this.loadoutsByWallet.entries()),
                };
                const tempPath = `${this.socialStatePath}.tmp`;
                await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), 'utf8');
                await fs.rename(tempPath, this.socialStatePath);
            } catch (error) {
                console.warn('SimpleMatchmaker: failed to persist social state', error);
            } finally {
                this.persistInFlight = null;
            }
        })();
        return this.persistInFlight;
    }
}
