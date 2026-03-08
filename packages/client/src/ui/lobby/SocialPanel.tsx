/**
 * SocialPanel — Friends, Requests, Party Tab System
 *
 * Replaces the static "Squad" roster with a functional social hub.
 * Wired to existing socialState + callbacks from LobbyIdle.
 */

import { useState, useCallback } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface SocialPanelProps {
    socialState?: any;
    onSendFriendRequest?: ((toPlayerId: string) => Promise<void>) | undefined;
    onAcceptFriendRequest?: ((fromPlayerId: string) => Promise<void>) | undefined;
    onDeclineFriendRequest?: ((fromPlayerId: string) => Promise<void>) | undefined;
    onCreateParty?: (() => Promise<void>) | undefined;
    onLeaveParty?: (() => Promise<void>) | undefined;
    onSendPartyInvite?: ((toPlayerId: string) => Promise<void>) | undefined;
    onRespondPartyInvite?: ((inviteId: string, accept: boolean) => Promise<void>) | undefined;
}

type SocialTab = 'friends' | 'requests' | 'party';

// =============================================================================
// COMPONENT
// =============================================================================

export function SocialPanel({
    socialState,
    onSendFriendRequest,
    onAcceptFriendRequest,
    onDeclineFriendRequest,
    onCreateParty,
    onLeaveParty,
    onSendPartyInvite,
    onRespondPartyInvite,
}: SocialPanelProps) {
    const [activeTab, setActiveTab] = useState<SocialTab>('friends');
    const [friendIdInput, setFriendIdInput] = useState('');

    const friends: any[] = socialState?.friends ?? [];
    const requests: any[] = socialState?.incomingFriendRequests ?? [];
    const party = socialState?.party ?? null;
    const partyInvites: any[] = socialState?.partyInvites ?? [];
    const playerId = socialState?.playerId ?? '';

    const handleAddFriend = useCallback(async () => {
        if (!friendIdInput.trim() || !onSendFriendRequest) return;
        try {
            await onSendFriendRequest(friendIdInput.trim());
            setFriendIdInput('');
        } catch (err) {
            console.error('Failed to send friend request', err);
        }
    }, [friendIdInput, onSendFriendRequest]);

    const requestCount = requests.length + partyInvites.length;

    return (
        <div className="hud-panel social-panel">
            {/* ── Tab Header ── */}
            <div className="social-tabs">
                <button
                    className={`social-tab ${activeTab === 'friends' ? 'social-tab--active' : ''}`}
                    onClick={() => setActiveTab('friends')}
                >
                    FRIENDS
                    {friends.length > 0 && <span className="social-tab__count">{friends.length}</span>}
                </button>
                <button
                    className={`social-tab ${activeTab === 'requests' ? 'social-tab--active' : ''}`}
                    onClick={() => setActiveTab('requests')}
                >
                    REQUESTS
                    {requestCount > 0 && <span className="social-tab__count social-tab__count--alert">{requestCount}</span>}
                </button>
                <button
                    className={`social-tab ${activeTab === 'party' ? 'social-tab--active' : ''}`}
                    onClick={() => setActiveTab('party')}
                >
                    PARTY
                    {party && <span className="social-tab__count">{party.members?.length ?? 0}</span>}
                </button>
            </div>

            {/* ═══════════════ FRIENDS TAB ═══════════════ */}
            {activeTab === 'friends' && (
                <div className="social-tab-content">
                    {/* Add Friend */}
                    <div className="social-add-row">
                        <input
                            className="social-add-input"
                            value={friendIdInput}
                            onChange={(e) => setFriendIdInput(e.target.value)}
                            placeholder="Enter player ID"
                            onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
                        />
                        <button
                            className="social-add-btn"
                            onClick={handleAddFriend}
                            disabled={!friendIdInput.trim() || !onSendFriendRequest}
                        >
                            ADD
                        </button>
                    </div>

                    {/* Friend List */}
                    <div className="social-list">
                        {friends.length === 0 && (
                            <div className="social-empty">No friends yet. Add someone above.</div>
                        )}
                        {friends.slice(0, 12).map((friend: any) => (
                            <div className="friend-row" key={friend.playerId}>
                                <div className="friend-row__avatar">
                                    {(friend.displayName ?? 'U').charAt(0).toUpperCase()}
                                </div>
                                <div className="friend-row__info">
                                    <div className="friend-row__name">{friend.displayName}</div>
                                    <div className="friend-row__id">{friend.playerId?.slice(0, 10)}…</div>
                                </div>
                                {onSendPartyInvite && party && party.leaderId === playerId && (
                                    <button
                                        className="friend-row__invite-btn"
                                        onClick={() => onSendPartyInvite(friend.playerId).catch(console.error)}
                                        title="Invite to party"
                                    >
                                        +
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══════════════ REQUESTS TAB ═══════════════ */}
            {activeTab === 'requests' && (
                <div className="social-tab-content">
                    {/* Friend Requests */}
                    {requests.length > 0 && (
                        <div className="social-section-mini-label">Friend Requests</div>
                    )}
                    <div className="social-list">
                        {requests.map((req: any) => (
                            <div className="friend-row" key={req.playerId}>
                                <div className="friend-row__avatar friend-row__avatar--request">
                                    {(req.displayName ?? '?').charAt(0).toUpperCase()}
                                </div>
                                <div className="friend-row__info">
                                    <div className="friend-row__name">{req.displayName}</div>
                                    <div className="friend-row__id">Friend request</div>
                                </div>
                                <div className="friend-row__actions">
                                    <button
                                        className="friend-row__accept-btn"
                                        onClick={() => onAcceptFriendRequest?.(req.playerId).catch(console.error)}
                                    >
                                        ✓
                                    </button>
                                    <button
                                        className="friend-row__decline-btn"
                                        onClick={() => onDeclineFriendRequest?.(req.playerId).catch(console.error)}
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        ))}

                        {/* Party Invites */}
                        {partyInvites.length > 0 && (
                            <div className="social-section-mini-label" style={{ marginTop: 10 }}>Party Invites</div>
                        )}
                        {partyInvites.map((invite: any) => (
                            <div className="friend-row" key={invite.inviteId}>
                                <div className="friend-row__avatar friend-row__avatar--party">P</div>
                                <div className="friend-row__info">
                                    <div className="friend-row__name">{invite.fromDisplayName}</div>
                                    <div className="friend-row__id">Party invite</div>
                                </div>
                                <div className="friend-row__actions">
                                    <button
                                        className="friend-row__accept-btn"
                                        onClick={() => onRespondPartyInvite?.(invite.inviteId, true).catch(console.error)}
                                    >
                                        JOIN
                                    </button>
                                    <button
                                        className="friend-row__decline-btn"
                                        onClick={() => onRespondPartyInvite?.(invite.inviteId, false).catch(console.error)}
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        ))}

                        {requests.length === 0 && partyInvites.length === 0 && (
                            <div className="social-empty">No pending requests.</div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══════════════ PARTY TAB ═══════════════ */}
            {activeTab === 'party' && (
                <div className="social-tab-content">
                    {!party ? (
                        <div>
                            <div className="social-empty" style={{ marginBottom: 10 }}>No active party.</div>
                            <button
                                className="social-party-create-btn"
                                onClick={() => onCreateParty?.().catch(console.error)}
                            >
                                CREATE PARTY
                            </button>
                        </div>
                    ) : (
                        <div>
                            <div className="party-header-info">
                                <span className="party-header-count">
                                    {party.members?.length ?? 0}/{party.maxSize ?? 4}
                                </span>
                                <span className="party-header-label">PLAYERS</span>
                            </div>

                            <div className="social-list">
                                {(party.members ?? []).map((member: any) => (
                                    <div className="friend-row" key={member.playerId}>
                                        <div className={`friend-row__avatar ${party.leaderId === member.playerId ? 'friend-row__avatar--leader' : 'friend-row__avatar--member'}`}>
                                            {(member.displayName ?? '?').charAt(0).toUpperCase()}
                                        </div>
                                        <div className="friend-row__info">
                                            <div className="friend-row__name">
                                                {party.leaderId === member.playerId && '★ '}{member.displayName}
                                            </div>
                                            <div className="friend-row__id">
                                                {party.leaderId === member.playerId ? 'Leader' : 'Member'}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Invite friends (leader only) */}
                            {party.leaderId === playerId && friends.length > 0 && (
                                <div style={{ marginTop: 8 }}>
                                    <div className="social-section-mini-label">Invite</div>
                                    {friends
                                        .filter((f: any) => !(party.members ?? []).some((m: any) => m.playerId === f.playerId))
                                        .slice(0, 4)
                                        .map((friend: any) => (
                                            <button
                                                key={friend.playerId}
                                                className="party-invite-btn"
                                                onClick={() => onSendPartyInvite?.(friend.playerId).catch(console.error)}
                                            >
                                                + {friend.displayName}
                                            </button>
                                        ))}
                                </div>
                            )}

                            <button
                                className="social-party-leave-btn"
                                onClick={() => onLeaveParty?.().catch(console.error)}
                            >
                                LEAVE PARTY
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default SocialPanel;
