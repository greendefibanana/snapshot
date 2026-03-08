/**
 * LobbyIdle Screen
 * 
 * Shown when lobbyState.phase === "idle"
 * Displays mode cards for match selection.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getGameBridge } from '../../bridge/GameBridge';
import {
    CHARACTER_LOADOUT_OPTIONS,
    PRIMARY_WEAPON_LOADOUT_OPTIONS,
    SECONDARY_WEAPON_LOADOUT_OPTIONS,
    type PlayerLoadoutState,
} from './loadouts';

// =============================================================================
// TYPES
// =============================================================================

export type GameMode = '1v1' | 'training';
export type Ruleset = 'casual' | 'wager';
export type AccessType = 'public' | 'token' | 'nft' | 'friends';
export type CustomRoomMode = '1v1' | '1v1_magicblock';

export interface ModeCardData {
    readonly mode: GameMode;
    readonly label: string;
    readonly description: string;
    readonly ruleset: Ruleset;
    readonly access: AccessType;
    readonly transport?: 'socket' | 'p2p';
    readonly accent?: 'purple' | 'green' | 'orange';
    readonly p2pTag?: string;
    readonly p2pRoomMode?: CustomRoomMode;
    readonly comingSoon?: boolean;
    readonly optimizingForProduction?: boolean;
}

export interface LobbyIdleProps {
    readonly modes: readonly ModeCardData[];
    readonly socialState?: any;
    readonly onStartTraining?: () => void;
    readonly onCreateP2PRoom?: (mode?: CustomRoomMode) => Promise<string>;
    readonly onJoinP2PRoom?: (code: string, mode?: CustomRoomMode) => Promise<void>;
    readonly onFallbackServer1v1?: () => void;
    readonly onSendFriendRequest?: (toPlayerId: string) => Promise<void>;
    readonly onAcceptFriendRequest?: (fromPlayerId: string) => Promise<void>;
    readonly onDeclineFriendRequest?: (fromPlayerId: string) => Promise<void>;
    readonly onCreateParty?: () => Promise<void>;
    readonly onLeaveParty?: () => Promise<void>;
    readonly onSendPartyInvite?: (toPlayerId: string) => Promise<void>;
    readonly onRespondPartyInvite?: (inviteId: string, accept: boolean) => Promise<void>;
    readonly p2pStatus?: {
        phase: 'idle' | 'hosting' | 'connecting' | 'connected' | 'failed';
        code?: string;
        error?: string;
    };
    readonly loadoutState?: PlayerLoadoutState;
    readonly onSelectLoadoutSlot?: (slotIndex: number) => void;
    readonly onUpdateLoadoutSlot?: (
        slotIndex: number,
        patch: Partial<{
            name: string;
            characterModelId: string;
            primaryWeaponModelId: string;
            secondaryWeaponModelId: string;
        }>
    ) => void;
}

// =============================================================================
// MODE CARD
// =============================================================================

interface ModeCardProps {
    readonly data: ModeCardData;
    readonly onStart?: (data: ModeCardData) => void;
}

const ModeCard: React.FC<ModeCardProps> = ({ data, onStart }) => {
    const bridge = getGameBridge();
    const isUnavailable = data.comingSoon === true || data.optimizingForProduction === true;
    const accent = data.accent ?? 'purple';
    const accentBorder = accent === 'green'
        ? 'rgba(34, 197, 94, 0.45)'
        : accent === 'orange'
            ? 'rgba(249, 115, 22, 0.45)'
            : 'rgba(139, 92, 246, 0.3)';
    const accentBorderHover = accent === 'green'
        ? 'rgba(34, 197, 94, 0.9)'
        : accent === 'orange'
            ? 'rgba(249, 115, 22, 0.95)'
            : 'rgba(139, 92, 246, 0.8)';
    const accentShadow = accent === 'green'
        ? '0 8px 24px rgba(34, 197, 94, 0.3)'
        : accent === 'orange'
            ? '0 8px 24px rgba(249, 115, 22, 0.35)'
            : '0 8px 24px rgba(139, 92, 246, 0.3)';
    const accentTitle = accent === 'green' ? '#bbf7d0' : accent === 'orange' ? '#fed7aa' : '#e9d5ff';
    const accentDesc = accent === 'green' ? '#86efac' : accent === 'orange' ? '#fdba74' : '#c4b5fd';
    const buttonBase = accent === 'green'
        ? 'linear-gradient(135deg, #22c55e, #16a34a)'
        : accent === 'orange'
            ? 'linear-gradient(135deg, #fb923c, #ea580c)'
            : 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
    const buttonHover = accent === 'green'
        ? 'linear-gradient(135deg, #16a34a, #15803d)'
        : accent === 'orange'
            ? 'linear-gradient(135deg, #f97316, #c2410c)'
            : 'linear-gradient(135deg, #7c3aed, #6d28d9)';

    const handleClick = () => {
        if (isUnavailable) return;
        console.log('[LobbyIdle] Mode selected:', data.mode, data.ruleset);
        if (onStart) {
            onStart(data);
            return;
        }
        // Emit join_queue event to start matchmaking
        bridge.sendToGame({
            type: 'join_queue',
            mode: data.mode,
            ruleset: data.ruleset || 'casual',
            ...(data.transport ? { transport: data.transport } : {}),
        });
    };

    return (
        <div
            style={{
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1))',
                border: `2px solid ${accentBorder}`,
                borderRadius: '12px',
                padding: '24px',
                cursor: isUnavailable ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
                position: 'relative',
                overflow: 'hidden',
                opacity: isUnavailable ? 0.55 : 1,
            }}
            onMouseEnter={(e) => {
                if (isUnavailable) return;
                e.currentTarget.style.borderColor = accentBorderHover;
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = accentShadow;
            }}
            onMouseLeave={(e) => {
                if (isUnavailable) return;
                e.currentTarget.style.borderColor = accentBorder;
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
            }}
        >
            <h3 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: accentTitle }}>
                {data.label}
                {data.p2pTag && (
                    <span style={{
                        marginLeft: 10,
                        padding: '3px 8px',
                        borderRadius: 999,
                        border: '1px solid rgba(251,146,60,0.55)',
                        color: '#fdba74',
                        fontSize: 11,
                        verticalAlign: 'middle',
                    }}>
                        {data.p2pTag}
                    </span>
                )}
            </h3>
            <p style={{ color: accentDesc, marginBottom: '20px', fontSize: '14px' }}>
                {data.description}
            </p>

            {/* Badges */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {data.ruleset === 'wager' && (
                    <span style={{
                        background: accent === 'green'
                            ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                            : 'linear-gradient(135deg, #f59e0b, #d97706)',
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#fff',
                    }}>
                        WAGER
                    </span>
                )}
                {data.optimizingForProduction && (
                    <span style={{
                        background: 'linear-gradient(135deg, #0ea5e9, #0369a1)',
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#fff',
                    }}>
                        OPTIMIZING FOR PRODUCTION
                    </span>
                )}
                {(isUnavailable || data.comingSoon) && (
                    <span style={{
                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#fff',
                    }}>
                        COMING SOON
                    </span>
                )}
                {data.access !== 'public' && (
                    <span style={{
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        padding: '4px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#fff',
                    }}>
                        {data.access.toUpperCase()}
                    </span>
                )}
            </div>

            <button
                onClick={handleClick}
                disabled={isUnavailable}
                style={{
                    width: '100%',
                    padding: '14px 24px',
                    fontSize: '16px',
                    fontWeight: 700,
                    background: isUnavailable ? 'rgba(148,163,184,0.3)' : buttonBase,
                    border: 'none',
                    borderRadius: '8px',
                    color: '#ffffff',
                    cursor: isUnavailable ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                }}
                onMouseEnter={(e) => {
                    if (isUnavailable) return;
                    e.currentTarget.style.background = buttonHover;
                    e.currentTarget.style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                    if (isUnavailable) return;
                    e.currentTarget.style.background = buttonBase;
                    e.currentTarget.style.transform = 'scale(1)';
                }}
            >
                {isUnavailable ? 'COMING SOON' : data.p2pTag ? 'OPEN CUSTOM ROOM' : 'FIND MATCH'}
            </button>
        </div>
    );
};

// =============================================================================
// LOBBY IDLE SCREEN
// =============================================================================

const DEFAULT_MODES: ModeCardData[] = [
    {
        mode: '1v1',
        label: '1v1 Duel',
        description: 'Face off against one opponent',
        ruleset: 'casual',
        access: 'public',
    },
    {
        mode: 'training',
        label: 'Training',
        description: 'Instant local duel sandbox for offline judging and controls testing',
        ruleset: 'casual',
        access: 'public',
        accent: 'orange',
    },
    {
        mode: '1v1',
        label: 'Private 1v1 Room',
        description: 'Custom join-code duel for direct testing',
        ruleset: 'casual',
        access: 'friends',
        accent: 'orange',
        p2pTag: 'Custom room',
        p2pRoomMode: '1v1',
    },
    {
        mode: '1v1',
        label: 'Private 1v1 Room (MagicBlock ER)',
        description: 'Custom join-code duel with MagicBlock-backed Solana score authority',
        ruleset: 'casual',
        access: 'friends',
        accent: 'green',
        p2pTag: 'MagicBlock',
        p2pRoomMode: '1v1_magicblock',
    },
    {
        mode: '1v1',
        label: '1v1 Wager Match',
        description: 'Bet SOL to win',
        ruleset: 'wager',
        access: 'public',
        accent: 'green',
    },
];

export const LobbyIdle: React.FC<LobbyIdleProps> = ({
    modes = DEFAULT_MODES,
    socialState,
    onStartTraining,
    onCreateP2PRoom,
    onJoinP2PRoom,
    onFallbackServer1v1,
    onSendFriendRequest,
    onAcceptFriendRequest,
    onDeclineFriendRequest,
    onCreateParty,
    onLeaveParty,
    onSendPartyInvite,
    onRespondPartyInvite,
    p2pStatus,
    loadoutState,
    onSelectLoadoutSlot,
    onUpdateLoadoutSlot,
}) => {
    const bridge = getGameBridge();
    const { connection } = useConnection();
    const { publicKey, connected } = useWallet();
    const { setVisible } = useWalletModal();
    const [wagerOpen, setWagerOpen] = useState(false);
    const [wagerAmount, setWagerAmount] = useState(1);
    const [balanceSol, setBalanceSol] = useState<number | null>(null);
    const [wagerError, setWagerError] = useState<string | null>(null);
    const [wagerLoading, setWagerLoading] = useState(false);
    const [p2pOpen, setP2POpen] = useState(false);
    const [p2pMode, setP2PMode] = useState<'host' | 'join'>('host');
    const [p2pCode, setP2PCode] = useState('');
    const [p2pJoinCode, setP2PJoinCode] = useState('');
    const [p2pError, setP2PError] = useState<string | null>(null);
    const [p2pLoading, setP2PLoading] = useState(false);
    const [p2pRoomMode, setP2PRoomMode] = useState<CustomRoomMode>('1v1');
    const [loadoutEditorOpen, setLoadoutEditorOpen] = useState(false);
    const [friendIdInput, setFriendIdInput] = useState('');
    const selectedLoadout = loadoutState?.slots[loadoutState.selectedSlotIndex];
    const characterById = useMemo(() => new Map(CHARACTER_LOADOUT_OPTIONS.map((item) => [item.id, item.label])), []);
    const primaryWeaponById = useMemo(() => new Map(PRIMARY_WEAPON_LOADOUT_OPTIONS.map((item) => [item.id, item.label])), []);
    const secondaryWeaponById = useMemo(() => new Map(SECONDARY_WEAPON_LOADOUT_OPTIONS.map((item) => [item.id, item.label])), []);

    const refreshBalance = useCallback(async () => {
        if (!publicKey) {
            setBalanceSol(null);
            return;
        }
        const lamports = await connection.getBalance(publicKey, 'confirmed');
        setBalanceSol(lamports / LAMPORTS_PER_SOL);
    }, [connection, publicKey]);

    const openWagerModal = useCallback(() => {
        if (!connected) {
            setVisible(true);
            return;
        }
        setWagerError(null);
        setWagerOpen(true);
        void refreshBalance();
    }, [connected, refreshBalance, setVisible]);

    const handleConfirmWager = useCallback(async () => {
        if (!publicKey || !connected) {
            setVisible(true);
            return;
        }
        if (balanceSol !== null && balanceSol < wagerAmount) {
            setWagerError('Insufficient SOL balance.');
            return;
        }
        setWagerError(null);
        setWagerLoading(true);
        try {
            bridge.sendToGame({
                type: 'join_queue',
                mode: '1v1',
                ruleset: 'wager',
                wagerAmountSol: wagerAmount,
            });
            setWagerOpen(false);
        } catch (error: any) {
            console.error('Wager transfer failed', error);
            setWagerError(error?.message ?? 'Transaction failed.');
        } finally {
            setWagerLoading(false);
        }
    }, [publicKey, connected, wagerAmount, balanceSol, bridge, setVisible]);

    const modeCards = useMemo(() => modes, [modes]);

    React.useEffect(() => {
        if (p2pStatus?.phase === 'failed') {
            setP2PError(p2pStatus.error ?? 'P2P connection failed within 10 seconds.');
            setP2PLoading(false);
            setP2PCode(p2pStatus.code ?? '');
            setP2POpen(true);
        }
    }, [p2pStatus]);

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
            padding: '40px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
        }}>
            <h2 style={{
                fontSize: '48px',
                fontWeight: 800,
                marginBottom: '40px',
                background: 'linear-gradient(135deg, #a78bfa, #e9d5ff)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                letterSpacing: '1px',
            }}>
                SELECT MODE
            </h2>

            {loadoutState && selectedLoadout && (
                <section style={{
                    width: 'min(1200px, 100%)',
                    marginBottom: 20,
                    background: 'rgba(10,14,40,0.72)',
                    border: '1px solid rgba(167,139,250,0.35)',
                    borderRadius: 14,
                    padding: 16,
                    display: 'grid',
                    gap: 12,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ color: '#ddd6fe', fontSize: 13, letterSpacing: 0.5, fontWeight: 700 }}>
                            ACTIVE LOADOUT
                        </div>
                        <button
                            onClick={() => setLoadoutEditorOpen(true)}
                            style={{
                                height: 38,
                                padding: '0 14px',
                                borderRadius: 10,
                                border: '1px solid rgba(167,139,250,0.5)',
                                background: 'linear-gradient(135deg, rgba(167,139,250,0.22), rgba(79,70,229,0.2))',
                                color: '#ede9fe',
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 700,
                                letterSpacing: 0.5,
                            }}
                        >
                            EDIT LOADOUTS
                        </button>
                    </div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: 10,
                    }}>
                        <div style={{ border: '1px solid rgba(167,139,250,0.35)', borderRadius: 10, padding: 10, background: 'rgba(17,24,39,0.7)', color: '#e9d5ff' }}>
                            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>SLOT</div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{`#${loadoutState.selectedSlotIndex + 1} ${selectedLoadout.name}`}</div>
                        </div>
                        <div style={{ border: '1px solid rgba(167,139,250,0.35)', borderRadius: 10, padding: 10, background: 'rgba(17,24,39,0.7)', color: '#e9d5ff' }}>
                            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>CHARACTER</div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{characterById.get(selectedLoadout.characterModelId) ?? selectedLoadout.characterModelId}</div>
                        </div>
                        <div style={{ border: '1px solid rgba(167,139,250,0.35)', borderRadius: 10, padding: 10, background: 'rgba(17,24,39,0.7)', color: '#e9d5ff' }}>
                            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>PRIMARY</div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{primaryWeaponById.get(selectedLoadout.primaryWeaponModelId) ?? selectedLoadout.primaryWeaponModelId}</div>
                        </div>
                        <div style={{ border: '1px solid rgba(167,139,250,0.35)', borderRadius: 10, padding: 10, background: 'rgba(17,24,39,0.7)', color: '#e9d5ff' }}>
                            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>SECONDARY</div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{secondaryWeaponById.get(selectedLoadout.secondaryWeaponModelId) ?? selectedLoadout.secondaryWeaponModelId}</div>
                        </div>
                    </div>
                </section>
            )}

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '24px',
                maxWidth: '1200px',
                width: '100%',
            }}>
                {modeCards.map((mode) => (
                    <ModeCard
                        key={`${mode.mode}-${mode.ruleset}-${mode.label}`}
                        data={mode}
                        onStart={(data) => {
                            if (data.mode === 'training') {
                                onStartTraining?.();
                                return;
                            }
                            if (data.p2pTag) {
                                setP2POpen(true);
                                setP2PError(null);
                                setP2PCode('');
                                setP2PJoinCode('');
                                setP2PMode('host');
                                setP2PRoomMode(data.p2pRoomMode ?? '1v1');
                                return;
                            }
                            if (data.ruleset === 'wager') {
                                openWagerModal();
                                return;
                            }
                            bridge.sendToGame({
                                type: 'join_queue',
                                mode: data.mode,
                                ruleset: data.ruleset || 'casual',
                                ...(data.transport ? { transport: data.transport } : {}),
                            });
                        }}
                    />
                ))}
            </div>

            {loadoutEditorOpen && loadoutState && selectedLoadout && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.78)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 230,
                    padding: '20px',
                }}>
                    <div style={{
                        width: 'min(1240px, 98vw)',
                        maxHeight: '92vh',
                        overflowY: 'auto',
                        background: 'linear-gradient(135deg, rgba(8,47,73,0.96), rgba(30,27,75,0.96))',
                        border: '1px solid rgba(167,139,250,0.45)',
                        borderRadius: 16,
                        padding: 20,
                        color: '#f5f3ff',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 1 }}>LOADOUT EDITOR</div>
                                <div style={{ color: '#c4b5fd', fontSize: 13 }}>
                                    Pick a slot, then set character, primary, and secondary.
                                </div>
                            </div>
                            <button
                                onClick={() => setLoadoutEditorOpen(false)}
                                style={{
                                    height: 38,
                                    padding: '0 14px',
                                    borderRadius: 10,
                                    border: '1px solid rgba(196,181,253,0.45)',
                                    background: 'rgba(30,41,59,0.75)',
                                    color: '#ede9fe',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                }}
                            >
                                DONE
                            </button>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <div style={{ color: '#ddd6fe', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>SLOTS</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                                {loadoutState.slots.map((slot, index) => {
                                    const active = index === loadoutState.selectedSlotIndex;
                                    return (
                                        <button
                                            key={`slot-editor-${index}`}
                                            onClick={() => onSelectLoadoutSlot?.(index)}
                                            style={{
                                                borderRadius: 12,
                                                border: active ? '2px solid #a78bfa' : '1px solid rgba(167,139,250,0.35)',
                                                background: active ? 'rgba(109,40,217,0.35)' : 'rgba(15,23,42,0.7)',
                                                color: '#ede9fe',
                                                textAlign: 'left',
                                                padding: 12,
                                                cursor: 'pointer',
                                                display: 'grid',
                                                gap: 4,
                                            }}
                                        >
                                            <div style={{ fontSize: 11, opacity: 0.7 }}>{`SLOT ${index + 1}`}</div>
                                            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{slot.name}</div>
                                            <div style={{ fontSize: 11, opacity: 0.8 }}>
                                                {characterById.get(slot.characterModelId) ?? slot.characterModelId}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <div style={{ color: '#ddd6fe', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>LOADOUT NAME</div>
                            <input
                                value={selectedLoadout.name}
                                onChange={(e) => onUpdateLoadoutSlot?.(loadoutState.selectedSlotIndex, { name: e.target.value })}
                                maxLength={24}
                                placeholder="Loadout name"
                                style={{
                                    width: 'min(400px, 100%)',
                                    height: 42,
                                    borderRadius: 10,
                                    border: '1px solid rgba(167,139,250,0.4)',
                                    background: 'rgba(15,23,42,0.75)',
                                    color: '#f5f3ff',
                                    padding: '0 12px',
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <div style={{ color: '#ddd6fe', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>CHARACTERS</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                                {CHARACTER_LOADOUT_OPTIONS.map((character) => {
                                    const active = character.id === selectedLoadout.characterModelId;
                                    return (
                                        <button
                                            key={`char-${character.id}`}
                                            onClick={() => onUpdateLoadoutSlot?.(loadoutState.selectedSlotIndex, { characterModelId: character.id })}
                                            style={{
                                                borderRadius: 12,
                                                border: active ? '2px solid #22d3ee' : '1px solid rgba(34,211,238,0.35)',
                                                background: active ? 'rgba(8,145,178,0.25)' : 'rgba(15,23,42,0.65)',
                                                color: '#ecfeff',
                                                padding: 12,
                                                textAlign: 'left',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <div style={{ fontSize: 11, opacity: 0.75 }}>CHARACTER</div>
                                            <div style={{ fontSize: 14, fontWeight: 700 }}>{character.label}</div>
                                            <div style={{ fontSize: 11, opacity: 0.75 }}>{character.id}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <div style={{ color: '#ddd6fe', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>PRIMARY WEAPONS</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                                {PRIMARY_WEAPON_LOADOUT_OPTIONS.map((weapon) => {
                                    const active = weapon.id === selectedLoadout.primaryWeaponModelId;
                                    return (
                                        <button
                                            key={`primary-${weapon.id}`}
                                            onClick={() => onUpdateLoadoutSlot?.(loadoutState.selectedSlotIndex, { primaryWeaponModelId: weapon.id })}
                                            style={{
                                                borderRadius: 12,
                                                border: active ? '2px solid #34d399' : '1px solid rgba(52,211,153,0.35)',
                                                background: active ? 'rgba(5,150,105,0.23)' : 'rgba(15,23,42,0.65)',
                                                color: '#ecfdf5',
                                                padding: 12,
                                                textAlign: 'left',
                                                cursor: 'pointer',
                                                display: 'grid',
                                                gap: 3,
                                            }}
                                        >
                                            <div style={{ fontSize: 14, fontWeight: 700 }}>{weapon.label}</div>
                                            <div style={{ fontSize: 11, opacity: 0.8 }}>{`${weapon.type} | ${weapon.fireMode}`}</div>
                                            <div style={{ fontSize: 11, opacity: 0.8 }}>{`Damage: ${weapon.damage}`}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <div style={{ color: '#ddd6fe', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>SECONDARY WEAPONS</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                                {SECONDARY_WEAPON_LOADOUT_OPTIONS.map((weapon) => {
                                    const active = weapon.id === selectedLoadout.secondaryWeaponModelId;
                                    return (
                                        <button
                                            key={`secondary-${weapon.id}`}
                                            onClick={() => onUpdateLoadoutSlot?.(loadoutState.selectedSlotIndex, { secondaryWeaponModelId: weapon.id })}
                                            style={{
                                                borderRadius: 12,
                                                border: active ? '2px solid #f59e0b' : '1px solid rgba(245,158,11,0.35)',
                                                background: active ? 'rgba(217,119,6,0.22)' : 'rgba(15,23,42,0.65)',
                                                color: '#fffbeb',
                                                padding: 12,
                                                textAlign: 'left',
                                                cursor: 'pointer',
                                                display: 'grid',
                                                gap: 3,
                                            }}
                                        >
                                            <div style={{ fontSize: 14, fontWeight: 700 }}>{weapon.label}</div>
                                            <div style={{ fontSize: 11, opacity: 0.8 }}>{`${weapon.type} | ${weapon.fireMode}`}</div>
                                            <div style={{ fontSize: 11, opacity: 0.8 }}>{`Damage: ${weapon.damage}`}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <section style={{
                marginTop: 28,
                width: 'min(1200px, 100%)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: 18,
            }}>
                <div style={{ background: 'rgba(15,23,42,0.75)', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 12, padding: 16 }}>
                    <h3 style={{ color: '#bfdbfe', marginBottom: 10 }}>Friends</h3>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <input
                            value={friendIdInput}
                            onChange={(e) => setFriendIdInput(e.target.value)}
                            placeholder='Enter player id'
                            style={{ flex: 1, height: 36, borderRadius: 8, border: '1px solid rgba(148,163,184,0.35)', background: '#111827', color: '#e5e7eb', padding: '0 10px' }}
                        />
                        <button
                            onClick={() => onSendFriendRequest?.(friendIdInput.trim()).then(() => setFriendIdInput('')).catch(console.error)}
                            disabled={!friendIdInput.trim() || !onSendFriendRequest}
                            style={{ height: 36, padding: '0 10px', borderRadius: 8, border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer' }}
                        >
                            Add
                        </button>
                    </div>
                    <div style={{ display: 'grid', gap: 8 }}>
                        {(socialState?.friends ?? []).slice(0, 8).map((friend: any) => (
                            <div key={friend.playerId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', color: '#e2e8f0', fontSize: 13 }}>
                                <span>{friend.displayName}</span>
                                <span style={{ opacity: 0.7, fontFamily: 'monospace' }}>{friend.playerId.slice(0, 8)}</span>
                            </div>
                        ))}
                        {(!socialState?.friends || socialState.friends.length === 0) && (
                            <div style={{ color: '#94a3b8', fontSize: 13 }}>No friends yet.</div>
                        )}
                    </div>
                </div>

                <div style={{ background: 'rgba(15,23,42,0.75)', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 12, padding: 16 }}>
                    <h3 style={{ color: '#fde68a', marginBottom: 10 }}>Friend Requests</h3>
                    <div style={{ display: 'grid', gap: 8 }}>
                        {(socialState?.incomingFriendRequests ?? []).map((request: any) => (
                            <div key={request.playerId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', color: '#e2e8f0', fontSize: 13 }}>
                                <span>{request.displayName}</span>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button
                                        onClick={() => onAcceptFriendRequest?.(request.playerId).catch(console.error)}
                                        style={{ height: 30, borderRadius: 8, border: 'none', background: '#16a34a', color: 'white', padding: '0 10px', cursor: 'pointer' }}
                                    >
                                        Accept
                                    </button>
                                    <button
                                        onClick={() => onDeclineFriendRequest?.(request.playerId).catch(console.error)}
                                        style={{ height: 30, borderRadius: 8, border: 'none', background: '#b91c1c', color: 'white', padding: '0 10px', cursor: 'pointer' }}
                                    >
                                        Decline
                                    </button>
                                </div>
                            </div>
                        ))}
                        {(socialState?.incomingFriendRequests ?? []).length === 0 && (
                            <div style={{ color: '#94a3b8', fontSize: 13 }}>No pending requests.</div>
                        )}
                    </div>
                </div>

                <div style={{ background: 'rgba(15,23,42,0.75)', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 12, padding: 16 }}>
                    <h3 style={{ color: '#86efac', marginBottom: 10 }}>Party</h3>
                    {!socialState?.party ? (
                        <button
                            onClick={() => onCreateParty?.().catch(console.error)}
                            style={{ height: 36, borderRadius: 8, border: 'none', background: '#16a34a', color: 'white', padding: '0 14px', cursor: 'pointer' }}
                        >
                            Create Party
                        </button>
                    ) : (
                        <div style={{ display: 'grid', gap: 8 }}>
                            <div style={{ color: '#d1fae5', fontSize: 13 }}>
                                {socialState.party.members.length}/{socialState.party.maxSize} players
                            </div>
                            {socialState.party.members.map((member: any) => (
                                <div key={member.playerId} style={{ display: 'flex', justifyContent: 'space-between', color: '#e2e8f0', fontSize: 13 }}>
                                    <span>{member.displayName}</span>
                                    {socialState.party.leaderId === member.playerId && <span style={{ color: '#facc15' }}>Leader</span>}
                                </div>
                            ))}
                            <button
                                onClick={() => onLeaveParty?.().catch(console.error)}
                                style={{ height: 34, borderRadius: 8, border: '1px solid rgba(248,113,113,0.5)', background: 'rgba(185,28,28,0.35)', color: '#fecaca', cursor: 'pointer' }}
                            >
                                Leave Party
                            </button>
                            {socialState.party.leaderId === socialState.playerId && (
                                <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                                    {(socialState.friends ?? [])
                                        .filter((friend: any) => !socialState.party.members.some((member: any) => member.playerId === friend.playerId))
                                        .slice(0, 6)
                                        .map((friend: any) => (
                                            <button
                                                key={friend.playerId}
                                                onClick={() => onSendPartyInvite?.(friend.playerId).catch(console.error)}
                                                style={{ height: 32, borderRadius: 8, border: '1px solid rgba(96,165,250,0.45)', background: 'rgba(37,99,235,0.25)', color: '#bfdbfe', cursor: 'pointer', textAlign: 'left', padding: '0 10px' }}
                                            >
                                                Invite {friend.displayName}
                                            </button>
                                        ))}
                                </div>
                            )}
                        </div>
                    )}
                    {(socialState?.partyInvites ?? []).length > 0 && (
                        <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
                            {(socialState.partyInvites ?? []).map((invite: any) => (
                                <div key={invite.inviteId} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                                    <span style={{ color: '#fde68a', fontSize: 13 }}>{invite.fromDisplayName} invited you</span>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={() => onRespondPartyInvite?.(invite.inviteId, true).catch(console.error)} style={{ height: 28, borderRadius: 8, border: 'none', background: '#16a34a', color: 'white', padding: '0 8px', cursor: 'pointer' }}>Join</button>
                                        <button onClick={() => onRespondPartyInvite?.(invite.inviteId, false).catch(console.error)} style={{ height: 28, borderRadius: 8, border: 'none', background: '#b91c1c', color: 'white', padding: '0 8px', cursor: 'pointer' }}>Decline</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {p2pOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.72)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 210,
                    padding: '20px',
                }}>
                    <div style={{
                        width: 'min(560px, 96vw)',
                        background: '#140f0a',
                        border: '1px solid rgba(251,146,60,0.55)',
                        borderRadius: '16px',
                        padding: '24px',
                        color: 'white',
                    }}>
                        <h3 style={{ fontSize: '24px', marginBottom: '8px', color: '#fdba74' }}>
                            {p2pRoomMode === '1v1_magicblock'
                                ? '1v1 MagicBlock ER'
                                : '1v1 P2P'}
                        </h3>
                        <p style={{ color: '#fed7aa', marginBottom: '14px' }}>
                            {p2pRoomMode === '1v1_magicblock'
                                ? 'Host creates a join code and mirrors duel score and finalization to Solana through MagicBlock.'
                                : 'Host creates a join code. Joiner enters code to connect.'}
                        </p>

                        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                            <button
                                onClick={() => setP2PMode('host')}
                                style={{
                                    flex: 1,
                                    padding: '10px 14px',
                                    borderRadius: 10,
                                    border: p2pMode === 'host' ? '2px solid #fb923c' : '1px solid rgba(251,146,60,0.4)',
                                    background: p2pMode === 'host' ? 'rgba(251,146,60,0.2)' : 'rgba(0,0,0,0.25)',
                                    color: 'white',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                Host Room
                            </button>
                            <button
                                onClick={() => setP2PMode('join')}
                                style={{
                                    flex: 1,
                                    padding: '10px 14px',
                                    borderRadius: 10,
                                    border: p2pMode === 'join' ? '2px solid #fb923c' : '1px solid rgba(251,146,60,0.4)',
                                    background: p2pMode === 'join' ? 'rgba(251,146,60,0.2)' : 'rgba(0,0,0,0.25)',
                                    color: 'white',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                Join Room
                            </button>
                        </div>

                        {p2pMode === 'host' ? (
                            <div>
                                {p2pCode ? (
                                    <div style={{ marginBottom: 14 }}>
                                        <div style={{ color: '#fdba74', marginBottom: 8, fontSize: 13 }}>Share this join code:</div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <input
                                                readOnly
                                                value={p2pCode}
                                                style={{
                                                    flex: 1,
                                                    height: 46,
                                                    borderRadius: 10,
                                                    border: '1px solid rgba(251,146,60,0.5)',
                                                    background: '#1f1408',
                                                    color: '#ffedd5',
                                                    fontSize: 24,
                                                    letterSpacing: '3px',
                                                    textAlign: 'center',
                                                }}
                                            />
                                            <button
                                                onClick={() => navigator.clipboard.writeText(p2pCode)}
                                                style={{
                                                    padding: '0 14px',
                                                    borderRadius: 10,
                                                    border: '1px solid rgba(251,146,60,0.5)',
                                                    background: 'rgba(251,146,60,0.2)',
                                                    color: '#ffedd5',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Copy
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={async () => {
                                            if (!onCreateP2PRoom) return;
                                            setP2PLoading(true);
                                            setP2PError(null);
                                            try {
                                                const code = await onCreateP2PRoom(p2pRoomMode);
                                                setP2PCode(code);
                                            } catch (error: any) {
                                                setP2PError(error?.message ?? 'Failed to create P2P room.');
                                            } finally {
                                                setP2PLoading(false);
                                            }
                                        }}
                                        disabled={p2pLoading}
                                        style={{
                                            width: '100%',
                                            height: 46,
                                            borderRadius: 10,
                                            border: 'none',
                                            background: 'linear-gradient(135deg,#fb923c,#ea580c)',
                                            color: 'white',
                                            fontWeight: 800,
                                            cursor: p2pLoading ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        {p2pLoading ? 'Creating...' : 'Create Room'}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: 10 }}>
                                <input
                                    value={p2pJoinCode}
                                    onChange={(e) => setP2PJoinCode(e.target.value.toUpperCase())}
                                    placeholder="Enter join code"
                                    style={{
                                        height: 46,
                                        borderRadius: 10,
                                        border: '1px solid rgba(251,146,60,0.5)',
                                        background: '#1f1408',
                                        color: '#ffedd5',
                                        padding: '0 12px',
                                        letterSpacing: '2px',
                                    }}
                                />
                                <button
                                    onClick={async () => {
                                        if (!onJoinP2PRoom) return;
                                        setP2PLoading(true);
                                        setP2PError(null);
                                        try {
                                            await onJoinP2PRoom(p2pJoinCode, p2pRoomMode);
                                        } catch (error: any) {
                                            setP2PError(error?.message ?? 'Failed to join P2P room.');
                                        } finally {
                                            setP2PLoading(false);
                                        }
                                    }}
                                    disabled={p2pLoading || !p2pJoinCode.trim()}
                                    style={{
                                        width: '100%',
                                        height: 46,
                                        borderRadius: 10,
                                        border: 'none',
                                        background: 'linear-gradient(135deg,#fb923c,#ea580c)',
                                        color: 'white',
                                        fontWeight: 800,
                                        cursor: p2pLoading ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {p2pLoading ? 'Connecting...' : 'Connect'}
                                </button>
                            </div>
                        )}

                        {p2pError && (
                            <div style={{ marginTop: 12, color: '#fca5a5', fontSize: 14 }}>{p2pError}</div>
                        )}

                        {p2pError && (
                            <button
                                onClick={() => {
                                    setP2POpen(false);
                                    onFallbackServer1v1?.();
                                }}
                                style={{
                                    marginTop: 10,
                                    width: '100%',
                                    height: 42,
                                    borderRadius: 10,
                                    border: '1px solid rgba(148,163,184,0.4)',
                                    background: 'rgba(255,255,255,0.07)',
                                    color: '#e2e8f0',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                }}
                            >
                                Play Server 1v1 instead
                            </button>
                        )}

                        <button
                            onClick={() => setP2POpen(false)}
                            style={{
                                marginTop: 10,
                                width: '100%',
                                height: 40,
                                borderRadius: 10,
                                border: '1px solid rgba(251,146,60,0.3)',
                                background: 'transparent',
                                color: '#fdba74',
                                cursor: 'pointer',
                            }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {wagerOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 200,
                    padding: '20px',
                }}>
                    <div style={{
                        width: 'min(520px, 95vw)',
                        background: '#0b1120',
                        border: '1px solid rgba(34,197,94,0.4)',
                        borderRadius: '16px',
                        padding: '28px',
                        color: 'white',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                    }}>
                        <h3 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: '#bbf7d0' }}>
                            Choose Wager Amount
                        </h3>
                        <p style={{ color: '#86efac', marginBottom: '20px' }}>
                            Bet SOL to win. Wagers are locked in escrow.
                        </p>

                        <div style={{ marginBottom: '16px', color: '#e2e8f0' }}>
                            Balance: {balanceSol !== null ? `${balanceSol.toFixed(3)} SOL` : '—'}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                            {[0.1, 0.5, 1, 3, 5].map((amount) => {
                                const active = wagerAmount === amount;
                                return (
                                    <button
                                        key={amount}
                                        onClick={() => setWagerAmount(amount)}
                                        style={{
                                            padding: '12px',
                                            borderRadius: '10px',
                                            border: active ? '2px solid #22c55e' : '1px solid rgba(148,163,184,0.3)',
                                            background: active ? 'rgba(34,197,94,0.2)' : 'rgba(15,23,42,0.6)',
                                            color: 'white',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {amount} SOL
                                    </button>
                                );
                            })}
                        </div>

                        {wagerError && (
                            <div style={{ color: '#f87171', marginBottom: '12px' }}>
                                {wagerError}
                            </div>
                        )}

                        <button
                            onClick={handleConfirmWager}
                            disabled={wagerLoading}
                            style={{
                                width: '100%',
                                padding: '14px 24px',
                                fontSize: '16px',
                                fontWeight: 700,
                                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                border: 'none',
                                borderRadius: '10px',
                                color: '#ffffff',
                                cursor: wagerLoading ? 'not-allowed' : 'pointer',
                                opacity: wagerLoading ? 0.7 : 1,
                                letterSpacing: '0.5px',
                                textTransform: 'uppercase',
                            }}
                        >
                            {wagerLoading ? 'Confirming...' : 'Confirm & Lock Wager'}
                        </button>

                        <button
                            onClick={() => setWagerOpen(false)}
                            disabled={wagerLoading}
                            style={{
                                marginTop: '12px',
                                width: '100%',
                                padding: '10px 24px',
                                fontSize: '14px',
                                fontWeight: 600,
                                background: 'transparent',
                                border: '1px solid rgba(148,163,184,0.3)',
                                borderRadius: '10px',
                                color: '#cbd5f5',
                                cursor: wagerLoading ? 'not-allowed' : 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LobbyIdle;
