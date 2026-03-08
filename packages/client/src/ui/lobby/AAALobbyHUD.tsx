/**
 * AAALobbyHUD — Apex/Borderlands-Style Lobby Overlay
 *
 * Full-screen HUD with:
 *   - Three.js character viewport (via LobbyViewport)
 *   - Player card with stats and loadout preview
 *   - Mode selector (top center, clickable)
 *   - Social panel with friends/requests/party tabs
 *   - Character carousel + READY/PLAY button
 *   - Loadout editor overlay
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { CHARACTERS } from '@snapshot/shared';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { LobbyViewport, LOBBY_CHARACTER_IDS } from './LobbyViewport';
import { ModeSelector, type CustomRoomMode, type ModeCardData } from './ModeSelector';
import { LoadoutPanel } from './LoadoutPanel';
import { SocialPanel } from './SocialPanel';
import type { PlayerLoadoutState, LoadoutSlotConfig } from './loadouts';
import { getUsernameForPublicKey } from '../../wallet/username';
import './AAALobbyHUD.css';

// =============================================================================
// TYPES
// =============================================================================

export interface LobbyPlayerProfile {
    displayName: string;
    level: number;
    xp: { current: number; max: number };
    rank: string;
    currency: { snapshot: number; credits: number };
    stats: { wins: number; losses: number; kills: number; deaths: number };
}

export interface AAALobbyHUDProps {
    playerProfile: LobbyPlayerProfile;
    selectedCharacter: string;
    selectedWeapon: string;
    isReady: boolean;
    gameMode: string;
    mapName: string;
    playerCount: number;
    onReady: () => void;
    onSelectCharacter: (characterId: string) => void;

    // Mode selection
    onStartMode?: ((mode: ModeCardData) => void) | undefined;
    onCreateP2PRoom?: ((mode?: CustomRoomMode) => Promise<string>) | undefined;
    onJoinP2PRoom?: ((code: string, mode?: CustomRoomMode) => Promise<void>) | undefined;
    onFallbackServer1v1?: (() => void) | undefined;
    p2pStatus?: {
        phase: 'idle' | 'hosting' | 'connecting' | 'connected' | 'failed';
        code?: string | undefined;
        error?: string | undefined;
    } | undefined;

    // Loadout
    loadoutState?: PlayerLoadoutState | undefined;
    onSelectLoadoutSlot?: ((slotIndex: number) => void) | undefined;
    onUpdateLoadoutSlot?: ((
        slotIndex: number,
        patch: Partial<{
            name: string;
            characterModelId: string;
            primaryWeaponModelId: string;
            secondaryWeaponModelId: string;
        }>
    ) => void) | undefined;

    // Social
    socialState?: any;
    onSendFriendRequest?: ((toPlayerId: string) => Promise<void>) | undefined;
    onAcceptFriendRequest?: ((fromPlayerId: string) => Promise<void>) | undefined;
    onDeclineFriendRequest?: ((fromPlayerId: string) => Promise<void>) | undefined;
    onCreateParty?: (() => Promise<void>) | undefined;
    onLeaveParty?: (() => Promise<void>) | undefined;
    onSendPartyInvite?: ((toPlayerId: string) => Promise<void>) | undefined;
    onRespondPartyInvite?: ((inviteId: string, accept: boolean) => Promise<void>) | undefined;
}

// =============================================================================
// HELPERS
// =============================================================================

const characterLabelMap = new Map(
    Object.entries(CHARACTERS ?? {}).map(([id, data]: [string, any]) => [id, data?.name ?? id])
);

function getCharacterLabel(id: string): string {
    return characterLabelMap.get(id) ?? id.charAt(0).toUpperCase() + id.slice(1);
}

function formatWalletPreview(address: string): string {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AAALobbyHUD({
    playerProfile,
    selectedCharacter,
    selectedWeapon,
    gameMode,
    mapName,
    playerCount,
    onSelectCharacter,
    onStartMode,
    onCreateP2PRoom,
    onJoinP2PRoom,
    onFallbackServer1v1,
    p2pStatus,
    loadoutState,
    onSelectLoadoutSlot,
    onUpdateLoadoutSlot,
    socialState,
    onSendFriendRequest,
    onAcceptFriendRequest,
    onDeclineFriendRequest,
    onCreateParty,
    onLeaveParty,
    onSendPartyInvite,
    onRespondPartyInvite,
}: AAALobbyHUDProps) {
    const { publicKey, connected, connecting, disconnecting, disconnect } = useWallet();
    const { setVisible } = useWalletModal();

    // ── Three.js Viewport ──
    const viewportRef = useRef<HTMLDivElement>(null);
    const lobbyViewportRef = useRef<LobbyViewport | null>(null);

    // ── UI State ──
    const [characterIndex, setCharacterIndex] = useState(
        LOBBY_CHARACTER_IDS.indexOf(selectedCharacter.toLowerCase())
    );
    const [modePickerOpen, setModePickerOpen] = useState(false);
    const [loadoutOpen, setLoadoutOpen] = useState(false);
    const [selectedMode, setSelectedMode] = useState<ModeCardData | null>(null);

    // ── Derived Data ──
    const xpPercent = Math.round((playerProfile.xp.current / playerProfile.xp.max) * 100);
    const kd = playerProfile.stats.deaths > 0
        ? (playerProfile.stats.kills / playerProfile.stats.deaths).toFixed(2)
        : playerProfile.stats.kills.toFixed(0);
    const winRate = (playerProfile.stats.wins + playerProfile.stats.losses) > 0
        ? Math.round((playerProfile.stats.wins / (playerProfile.stats.wins + playerProfile.stats.losses)) * 100)
        : 0;

    // Get current loadout info
    const currentSlot: LoadoutSlotConfig | undefined = loadoutState?.slots[loadoutState.selectedSlotIndex];
    const walletAddress = publicKey?.toBase58() ?? null;
    const walletUsername = useMemo(() => getUsernameForPublicKey(walletAddress), [walletAddress]);
    const walletPreview = walletAddress ? formatWalletPreview(walletAddress) : null;
    const walletLabel = walletUsername ?? walletPreview ?? 'No wallet connected';
    const walletStatus = connecting
        ? 'Connecting'
        : disconnecting
            ? 'Disconnecting'
            : connected
                ? 'Connected'
                : 'Solana Wallet';

    // ── Setup/Teardown Viewport ──
    useEffect(() => {
        if (!viewportRef.current) return;
        if (lobbyViewportRef.current) return; // already initialized

        const vp = new LobbyViewport(viewportRef.current);
        lobbyViewportRef.current = vp;
        vp.setCharacter(selectedCharacter);

        return () => {
            vp.dispose();
            lobbyViewportRef.current = null;
        };
    }, []);

    // ── Sync character to viewport ──
    useEffect(() => {
        lobbyViewportRef.current?.setCharacter(selectedCharacter);
    }, [selectedCharacter]);

    // ── Character Carousel ──
    const handlePrev = useCallback(() => {
        const newIndex = (characterIndex - 1 + LOBBY_CHARACTER_IDS.length) % LOBBY_CHARACTER_IDS.length;
        setCharacterIndex(newIndex);
        onSelectCharacter(LOBBY_CHARACTER_IDS[newIndex]!);
    }, [characterIndex, onSelectCharacter]);

    const handleNext = useCallback(() => {
        const newIndex = (characterIndex + 1) % LOBBY_CHARACTER_IDS.length;
        setCharacterIndex(newIndex);
        onSelectCharacter(LOBBY_CHARACTER_IDS[newIndex]!);
    }, [characterIndex, onSelectCharacter]);

    // ── Mode Selection ──
    const handleSelectMode = useCallback((mode: ModeCardData) => {
        setSelectedMode(mode);
    }, []);

    const handleStartMode = useCallback((mode: ModeCardData) => {
        setSelectedMode(mode);
        onStartMode?.(mode);
    }, [onStartMode]);

    // ── Display mode label ──
    const displayMode = selectedMode?.label ?? gameMode;
    const displayMap = selectedMode ? getModeMap(selectedMode) : mapName;

    return (
        <div className="lobby-root">
            {/* ── Three.js Viewport ── */}
            <div className="lobby-viewport-container" ref={viewportRef} />

            {/* ── Overlays ── */}
            <div className="overlay-scanlines" />
            <div className="overlay-noise" />
            <div className="overlay-vignette" />

            {/* ── HUD Grid ── */}
            <div className="hud-container">

                {/* ═══════════════ LEFT — PLAYER CARD ═══════════════ */}
                <div className="hud-panel player-card">
                    <div className="player-card__header">
                        <div className="player-card__avatar">
                            {playerProfile.displayName.charAt(0)}
                        </div>
                        <div className="player-card__info">
                            <div className="player-card__name">{playerProfile.displayName}</div>
                            <div className="player-card__rank">{playerProfile.rank}</div>
                        </div>
                    </div>

                    <div className="xp-bar">
                        <div className="xp-bar__label">
                            <span>LVL {playerProfile.level}</span>
                            <span>{playerProfile.xp.current.toLocaleString()} / {playerProfile.xp.max.toLocaleString()} XP</span>
                        </div>
                        <div className="xp-bar__track">
                            <div className="xp-bar__fill" style={{ width: `${xpPercent}%` }} />
                        </div>
                    </div>

                    <div className="stat-grid">
                        <div className="stat-item">
                            <div className="stat-item__label">K/D</div>
                            <div className="stat-item__value">{kd}</div>
                        </div>
                        <div className="stat-item">
                            <div className="stat-item__label">Win Rate</div>
                            <div className="stat-item__value">{winRate}%</div>
                        </div>
                        <div className="stat-item">
                            <div className="stat-item__label">Wins</div>
                            <div className="stat-item__value">{playerProfile.stats.wins.toLocaleString()}</div>
                        </div>
                        <div className="stat-item">
                            <div className="stat-item__label">Kills</div>
                            <div className="stat-item__value">{playerProfile.stats.kills.toLocaleString()}</div>
                        </div>
                    </div>

                    <div className="loadout-section">
                        <div className="loadout-section__title">Equipped</div>
                        <div
                            className="loadout-item"
                            onClick={() => setLoadoutOpen(true)}
                        >
                            <div className="loadout-item__icon">⬡</div>
                            <div>
                                <div className="loadout-item__name">
                                    {currentSlot ? currentSlot.name : getCharacterLabel(selectedCharacter)}
                                </div>
                                <div className="loadout-item__sub">
                                    {currentSlot ? getCharacterLabel(currentSlot.characterModelId) : 'CHARACTER'}
                                </div>
                            </div>
                        </div>
                        <div className="loadout-item">
                            <div className="loadout-item__icon">⚔</div>
                            <div>
                                <div className="loadout-item__name">{selectedWeapon.toUpperCase()}</div>
                                <div className="loadout-item__sub">Primary Weapon</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ═══════════════ TOP CENTER — MODE BAR (Clickable) ═══════════════ */}
                <div
                    className="hud-panel match-bar match-bar--clickable"
                    onClick={() => setModePickerOpen(true)}
                >
                    <div className="match-bar__mode">
                        {displayMode}
                        <span className="match-bar__dropdown-icon"> ▼</span>
                    </div>
                    <div className="match-bar__divider" />
                    <div className="match-bar__meta">{displayMap}</div>
                    <div className="match-bar__divider" />
                    <div className="match-bar__meta">
                        <span>{playerCount}</span> ONLINE
                    </div>
                </div>

                {/* ═══════════════ TOP RIGHT — CURRENCY ═══════════════ */}
                <div className="hud-panel currency-display">
                    <div className="wallet-preview">
                        <span className="currency-item__icon currency-item__icon--snapshot">◆</span>
                        <span className="wallet-preview__status">{walletStatus}</span>
                        <span className="wallet-preview__value">{walletLabel}</span>
                    </div>
                    <button
                        type="button"
                        className={`wallet-action-btn ${connected ? 'wallet-action-btn--connected' : ''}`}
                        disabled={connecting || disconnecting}
                        onClick={() => {
                            if (connected) {
                                void disconnect();
                                return;
                            }
                            setVisible(true);
                        }}
                    >
                        <span className="currency-item__icon currency-item__icon--credits">◈</span>
                        {connecting
                            ? 'CONNECTING...'
                            : disconnecting
                                ? 'DISCONNECTING...'
                                : connected
                                    ? 'DISCONNECT'
                                    : 'CONNECT WALLET'}
                    </button>
                </div>

                {/* ═══════════════ RIGHT — SOCIAL PANEL ═══════════════ */}
                <SocialPanel
                    socialState={socialState}
                    onSendFriendRequest={onSendFriendRequest}
                    onAcceptFriendRequest={onAcceptFriendRequest}
                    onDeclineFriendRequest={onDeclineFriendRequest}
                    onCreateParty={onCreateParty}
                    onLeaveParty={onLeaveParty}
                    onSendPartyInvite={onSendPartyInvite}
                    onRespondPartyInvite={onRespondPartyInvite}
                />

                {/* ═══════════════ BOTTOM — ACTION ROW ═══════════════ */}
                <div className="action-row">
                    <button
                        className="loadout-btn"
                        onClick={() => setLoadoutOpen(true)}
                    >
                        ⚙ LOADOUT
                    </button>

                    <div className="character-carousel">
                        <button className="carousel-arrow" onClick={handlePrev}>◀</button>
                        <div>
                            <div className="carousel-character-name">
                                {getCharacterLabel(LOBBY_CHARACTER_IDS[characterIndex] ?? selectedCharacter)}
                            </div>
                            <div className="carousel-character-meta">
                                {characterIndex + 1} / {LOBBY_CHARACTER_IDS.length}
                            </div>
                        </div>
                        <button className="carousel-arrow" onClick={handleNext}>▶</button>
                    </div>

                    <button
                        className={`ready-btn ${selectedMode ? 'ready-btn--active' : ''}`}
                        onClick={() => {
                            if (selectedMode) {
                                // Have a mode selected — start it
                                onStartMode?.(selectedMode);
                            } else {
                                // No mode selected yet — open mode picker
                                setModePickerOpen(true);
                            }
                        }}
                    >
                        {selectedMode ? '▶ PLAY' : 'SELECT MODE'}
                    </button>
                </div>
            </div>

            {/* ═══════════════ MODE SELECTOR OVERLAY ═══════════════ */}
            <ModeSelector
                isOpen={modePickerOpen}
                onClose={() => setModePickerOpen(false)}
                selectedMode={selectedMode}
                onSelectMode={handleSelectMode}
                onStartMode={handleStartMode}
                onCreateP2PRoom={onCreateP2PRoom}
                onJoinP2PRoom={onJoinP2PRoom}
                onFallbackServer1v1={onFallbackServer1v1}
                p2pStatus={p2pStatus}
            />

            {/* ═══════════════ LOADOUT EDITOR OVERLAY ═══════════════ */}
            {loadoutState && onSelectLoadoutSlot && onUpdateLoadoutSlot && (
                <LoadoutPanel
                    isOpen={loadoutOpen}
                    onClose={() => setLoadoutOpen(false)}
                    loadoutState={loadoutState}
                    onSelectSlot={onSelectLoadoutSlot}
                    onUpdateSlot={onUpdateLoadoutSlot}
                />
            )}
        </div>
    );
}

// =============================================================================
// HELPERS
// =============================================================================

function getModeMap(mode: ModeCardData): string {
    return mode.mode === 'training' ? 'TRAINING GROUNDS' : 'SPACE ARENA';
}

export default AAALobbyHUD;
