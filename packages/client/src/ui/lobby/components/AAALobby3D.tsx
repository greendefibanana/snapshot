/**
 * AAA 3D Lobby - Fortnite/Apex style
 * 
 * 3D character showcase with 2D UI overlay
 * Background stays persistent, UI changes based on tab
 */

import React, { useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows, Float, PresentationControls } from '@react-three/drei';
import type { LobbyState, PlayerId } from '@snapshot/shared';
import type { PlayerProfile, Friend, Party } from '../AAALobbyShell.js';
import '../AAALobby3D.css';

// =============================================================================
// TYPES
// =============================================================================

type NavTab = 'play' | 'locker' | 'shop' | 'battlepass' | 'social';
type LockerTab = 'characters' | 'weapons' | 'skins' | 'emotes';
type ShopTab = 'featured' | 'characters' | 'weapons' | 'skins';

interface AAALobby3DProps {
  readonly lobbyState: LobbyState;
  readonly playerProfile: PlayerProfile;
  readonly friends: Friend[];
  readonly party?: Party | undefined;
  readonly onSelectMode: (mode: '1v1' | '4v4' | 'training', ruleset: 'casual' | 'wager' | 'ranked') => void;
  readonly onJoinQueue: () => void;
  readonly onLeaveQueue: () => void;
  readonly onCreateParty: () => void;
  readonly onJoinParty: (code: string) => void;
  readonly onInviteFriend: (friendId: PlayerId) => void;
  readonly onOpenSettings: () => void;
}

// =============================================================================
// MOCK DATA
// =============================================================================

const CHARACTERS = [
  { id: 'kodiak', name: 'Kodiak', species: 'Urshari', rarity: 'legendary', owned: true, equipped: true },
  { id: 'nyx', name: 'Nyx', species: 'Shadow', rarity: 'epic', owned: true, equipped: false },
  { id: 'blaze', name: 'Blaze', species: 'Infernal', rarity: 'rare', owned: false, equipped: false },
  { id: 'frost', name: 'Frost', species: 'Cryo', rarity: 'epic', owned: true, equipped: false },
];

const WEAPONS = [
  { id: 'ar1', name: 'Pulse Rifle', type: 'Assault Rifle', rarity: 'common', owned: true, equipped: true },
  { id: 'sr1', name: 'Void Sniper', type: 'Sniper Rifle', rarity: 'legendary', owned: true, equipped: false },
  { id: 'sg1', name: 'Nova Shotgun', type: 'Shotgun', rarity: 'rare', owned: false, equipped: false },
  { id: 'smg1', name: 'Stinger SMG', type: 'SMG', rarity: 'epic', owned: true, equipped: false },
];

const SKINS = [
  { id: 'skin1', name: 'Cyber Kodiak', character: 'Kodiak', rarity: 'legendary', price: 2000, owned: false },
  { id: 'skin2', name: 'Gold Kodiak', character: 'Kodiak', rarity: 'epic', price: 1000, owned: true },
  { id: 'skin3', name: 'Shadow Nyx', character: 'Nyx', rarity: 'rare', price: 800, owned: false },
];

const SHOP_ITEMS = [
  { id: 'shop1', name: 'Neon Striker', type: 'character', rarity: 'legendary', price: 2500, currency: 'credits', image: 'neon' },
  { id: 'shop2', name: 'Plasma Rifle', type: 'weapon', rarity: 'epic', price: 1500, currency: 'credits', image: 'plasma' },
  { id: 'shop3', name: 'Cyber Pack', type: 'bundle', rarity: 'legendary', price: 500, currency: 'snapshot', image: 'cyber' },
  { id: 'shop4', name: 'Daily Drop', type: 'skin', rarity: 'rare', price: 800, currency: 'credits', image: 'daily' },
];

const BATTLE_PASS_TIERS = Array.from({ length: 10 }, (_, i) => ({
  tier: i + 40,
  rewards: [
    i % 2 === 0 ? { type: 'skin', name: `Tier ${i + 40} Skin`, rarity: i % 5 === 0 ? 'legendary' : 'rare' } : null,
    { type: 'currency', amount: 100 + (i * 10) },
  ].filter(Boolean),
  claimed: i < 3,
  current: i === 3,
}));

// =============================================================================
// 3D CHARACTER COMPONENT
// =============================================================================

function CharacterModel() {
  return (
    <group>
      {/* Character body */}
      <mesh castShadow receiveShadow>
        <capsuleGeometry args={[0.3, 1.5, 4, 8]} />
        <meshStandardMaterial color="#CCFF00" metalness={0.3} roughness={0.4} />
      </mesh>
      {/* Head */}
      <mesh castShadow position={[0, 1.1, 0]}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshStandardMaterial color="#FF0055" metalness={0.3} roughness={0.4} />
      </mesh>
      {/* Visor */}
      <mesh position={[0, 1.15, 0.25]}>
        <boxGeometry args={[0.4, 0.15, 0.1]} />
        <meshStandardMaterial color="#00FFFF" emissive="#00FFFF" emissiveIntensity={0.5} />
      </mesh>
      {/* Weapon on back */}
      <mesh position={[-0.4, 0.3, -0.3]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.15, 1.2, 0.3]} />
        <meshStandardMaterial color="#7000FF" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

// =============================================================================
// 3D SCENE
// =============================================================================

function Lobby3DScene() {
  return (
    <>
      <ambientLight intensity={0.3} />
      <spotLight position={[5, 10, 5]} angle={0.3} penumbra={0.5} intensity={200} castShadow shadow-mapSize={2048} />
      <spotLight position={[-5, 5, -5]} angle={0.5} penumbra={1} intensity={100} color="#7000FF" />
      <spotLight position={[5, 2, -5]} angle={0.5} penumbra={1} intensity={50} color="#CCFF00" />
      <Environment preset="city" />
      
      {/* Ground platform */}
      <mesh receiveShadow position={[0, -0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3, 64]} />
        <meshStandardMaterial color="#0A0A10" metalness={0.8} roughness={0.2} />
      </mesh>
      
      {/* Neon ring */}
      <mesh position={[0, -0.79, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.8, 2, 64]} />
        <meshBasicMaterial color="#CCFF00" transparent opacity={0.5} />
      </mesh>
      
      {/* Character */}
      <PresentationControls global rotation={[0.1, 0, 0]} polar={[-0.2, 0.2]} azimuth={[-0.5, 0.5]} config={{ mass: 2, tension: 400 }} snap={{ mass: 4, tension: 400 }}>
        <Float speed={1.5} rotationIntensity={0.1} floatIntensity={0.2} floatingRange={[-0.05, 0.05]}>
          <CharacterModel />
        </Float>
      </PresentationControls>
      
      <ContactShadows position={[0, -0.8, 0]} opacity={0.6} scale={10} blur={2} far={4} />
    </>
  );
}

// =============================================================================
// UI COMPONENTS
// =============================================================================

const NavButton: React.FC<{ id: NavTab; label: string; active: boolean; onClick: () => void }> = ({ id, label, active, onClick }) => (
  <button className={`lobby3d-nav-btn ${active ? 'lobby3d-nav-btn--active' : ''}`} onClick={onClick} data-tab={id}>
    <span className="lobby3d-nav-label">{label}</span>
    {active && <div className="lobby3d-nav-underline" />}
  </button>
);

const RarityBadge: React.FC<{ rarity: string }> = ({ rarity }) => {
  const colors: Record<string, string> = {
    common: '#B0B0B0',
    rare: '#00BFFF',
    epic: '#9400D3',
    legendary: '#FF8C00',
  };
  return <span className="lobby3d-rarity" style={{ background: colors[rarity] || colors.common }}>{rarity.toUpperCase()}</span>;
};

const CurrencyDisplay: React.FC<{ amount: number; icon: string; color: string }> = ({ amount, icon, color }) => (
  <div className="lobby3d-currency" style={{ '--currency-color': color } as React.CSSProperties}>
    <span className="lobby3d-currency-icon">{icon}</span>
    <span className="lobby3d-currency-value">{amount.toLocaleString()}</span>
  </div>
);

// =============================================================================
// MAIN LOBBY COMPONENT
// =============================================================================

export const AAALobby3D: React.FC<AAALobby3DProps> = ({
  lobbyState,
  playerProfile,
  friends,
  party,
  onSelectMode,
  onJoinQueue,
  onLeaveQueue,
  onCreateParty,
  onJoinParty,
  onInviteFriend,
  onOpenSettings,
}) => {
  const [activeTab, setActiveTab] = useState<NavTab>('play');
  const [lockerTab, setLockerTab] = useState<LockerTab>('characters');
  const [shopTab, setShopTab] = useState<ShopTab>('featured');
  const [selectedMode, setSelectedMode] = useState<{ mode: '1v1' | '4v4' | 'training'; ruleset: 'casual' | 'wager' | 'ranked' } | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState(CHARACTERS.find(c => c.equipped)?.id || 'kodiak');
  const [selectedWeapon, setSelectedWeapon] = useState(WEAPONS.find(w => w.equipped)?.id || 'ar1');
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [partyCode, setPartyCode] = useState('');

  const isInQueue = lobbyState.phase === 'queueing';

  const handleModeSelect = useCallback((mode: '1v1' | '4v4' | 'training') => {
    const ruleset = selectedMode?.ruleset || 'casual';
    setSelectedMode({ mode, ruleset });
    onSelectMode(mode, ruleset);
  }, [selectedMode, onSelectMode]);

  const handleRulesetChange = useCallback((ruleset: 'casual' | 'wager' | 'ranked') => {
    if (selectedMode) {
      setSelectedMode({ ...selectedMode, ruleset });
      onSelectMode(selectedMode.mode, ruleset);
    }
  }, [selectedMode, onSelectMode]);

  return (
    <div className="lobby3d-container">
      {/* 3D Background */}
      <div className="lobby3d-scene">
        <Canvas shadows camera={{ position: [0, 1.5, 4], fov: 45 }} dpr={[1, 2]}>
          <Lobby3DScene />
        </Canvas>
      </div>

      {/* UI Overlay */}
      <div className="lobby3d-overlay">
        {/* Header */}
        <header className="lobby3d-header">
          <div className="lobby3d-logo">
            <span className="lobby3d-logo-snap">SNAP</span>
            <span className="lobby3d-logo-shot">SHOT</span>
          </div>

          <nav className="lobby3d-nav">
            <NavButton id="play" label="PLAY" active={activeTab === 'play'} onClick={() => setActiveTab('play')} />
            <NavButton id="locker" label="LOCKER" active={activeTab === 'locker'} onClick={() => setActiveTab('locker')} />
            <NavButton id="shop" label="SHOP" active={activeTab === 'shop'} onClick={() => setActiveTab('shop')} />
            <NavButton id="battlepass" label="BATTLE PASS" active={activeTab === 'battlepass'} onClick={() => setActiveTab('battlepass')} />
            <NavButton id="social" label="SOCIAL" active={activeTab === 'social'} onClick={() => setActiveTab('social')} />
          </nav>

          <div className="lobby3d-stats">
            <CurrencyDisplay amount={playerProfile.currency.snapshot} icon="◈" color="#CCFF00" />
            <CurrencyDisplay amount={playerProfile.currency.credits} icon="◉" color="#00FFFF" />
            <button className="lobby3d-settings-btn" onClick={onOpenSettings}>⚙</button>
            <div className="lobby3d-level">
              <span className="lobby3d-level-num">{playerProfile.level}</span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="lobby3d-main">
          {/* PLAY TAB */}
          {activeTab === 'play' && (
            <div className="lobby3d-panel lobby3d-panel--left">
              <h2 className="lobby3d-panel-title">SELECT MODE</h2>
              <div className="lobby3d-modes">
                {[
                  { mode: '4v4' as const, label: 'TEAM BATTLE', desc: '4v4 Team Combat', color: '#CCFF00' },
                  { mode: '1v1' as const, label: 'DUEL', desc: '1v1 Competitive', color: '#00FFFF' },
                  { mode: 'training' as const, label: 'TRAINING', desc: 'Practice & Warmup', color: '#7000FF' },
                ].map(m => (
                  <button
                    key={m.mode}
                    className={`lobby3d-mode-card ${selectedMode?.mode === m.mode ? 'lobby3d-mode-card--selected' : ''}`}
                    onClick={() => handleModeSelect(m.mode)}
                    style={{ '--mode-color': m.color } as React.CSSProperties}
                  >
                    <div className="lobby3d-mode-glow" />
                    <div className="lobby3d-mode-content">
                      <h3 className="lobby3d-mode-title">{m.label}</h3>
                      <p className="lobby3d-mode-desc">{m.desc}</p>
                    </div>
                    {selectedMode?.mode === m.mode && <div className="lobby3d-mode-check">✓</div>}
                  </button>
                ))}
              </div>

              {selectedMode && selectedMode.mode !== 'training' && (
                <div className="lobby3d-ruleset">
                  <span className="lobby3d-ruleset-label">RULESET</span>
                  <div className="lobby3d-ruleset-options">
                    {(['casual', 'ranked', 'wager'] as const).map(r => (
                      <button
                        key={r}
                        className={`lobby3d-ruleset-btn ${selectedMode.ruleset === r ? 'lobby3d-ruleset-btn--active' : ''}`}
                        onClick={() => handleRulesetChange(r)}
                      >
                        {r.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                className={`lobby3d-play-btn ${!selectedMode ? 'lobby3d-play-btn--disabled' : ''} ${isInQueue ? 'lobby3d-play-btn--queueing' : ''}`}
                disabled={!selectedMode}
                onClick={isInQueue ? onLeaveQueue : onJoinQueue}
              >
                {isInQueue ? <><span className="lobby3d-play-spinner" /><span>FINDING MATCH...</span></> : <span>PLAY NOW</span>}
              </button>
            </div>
          )}

          {/* LOCKER TAB - FULL LOADOUT */}
          {activeTab === 'locker' && (
            <div className="lobby3d-panel lobby3d-panel--wide">
              <h2 className="lobby3d-panel-title">LOCKER / LOADOUT</h2>
              
              <div className="lobby3d-locker-tabs">
                {(['characters', 'weapons', 'skins', 'emotes'] as const).map(t => (
                  <button key={t} className={`lobby3d-locker-tab ${lockerTab === t ? 'lobby3d-locker-tab--active' : ''}`} onClick={() => setLockerTab(t)}>
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Characters Grid */}
              {lockerTab === 'characters' && (
                <div className="lobby3d-grid">
                  {CHARACTERS.map(char => (
                    <div key={char.id} className={`lobby3d-item-card ${selectedCharacter === char.id ? 'lobby3d-item-card--selected' : ''} ${!char.owned ? 'lobby3d-item-card--locked' : ''}`} onClick={() => char.owned && setSelectedCharacter(char.id)}>
                      <div className="lobby3d-item-image" style={{ background: `linear-gradient(135deg, ${char.rarity === 'legendary' ? '#FF8C00' : char.rarity === 'epic' ? '#9400D3' : '#00BFFF'}, #0A0A10)` }} />
                      <div className="lobby3d-item-info">
                        <h4>{char.name}</h4>
                        <span className="lobby3d-item-subtitle">{char.species}</span>
                        <RarityBadge rarity={char.rarity} />
                      </div>
                      {char.equipped && <span className="lobby3d-equipped">EQUIPPED</span>}
                      {!char.owned && <span className="lobby3d-locked">🔒</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Weapons Grid */}
              {lockerTab === 'weapons' && (
                <div className="lobby3d-grid">
                  {WEAPONS.map(weapon => (
                    <div key={weapon.id} className={`lobby3d-item-card ${selectedWeapon === weapon.id ? 'lobby3d-item-card--selected' : ''} ${!weapon.owned ? 'lobby3d-item-card--locked' : ''}`} onClick={() => weapon.owned && setSelectedWeapon(weapon.id)}>
                      <div className="lobby3d-item-image" style={{ background: `linear-gradient(135deg, ${weapon.rarity === 'legendary' ? '#FF8C00' : weapon.rarity === 'epic' ? '#9400D3' : '#00BFFF'}, #0A0A10)` }} />
                      <div className="lobby3d-item-info">
                        <h4>{weapon.name}</h4>
                        <span className="lobby3d-item-subtitle">{weapon.type}</span>
                        <RarityBadge rarity={weapon.rarity} />
                      </div>
                      {weapon.equipped && <span className="lobby3d-equipped">EQUIPPED</span>}
                      {!weapon.owned && <span className="lobby3d-locked">🔒</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Skins Grid */}
              {lockerTab === 'skins' && (
                <div className="lobby3d-grid">
                  {SKINS.map(skin => (
                    <div key={skin.id} className={`lobby3d-item-card ${!skin.owned ? 'lobby3d-item-card--locked' : ''}`}>
                      <div className="lobby3d-item-image" style={{ background: `linear-gradient(135deg, ${skin.rarity === 'legendary' ? '#FF8C00' : '#00BFFF'}, #0A0A10)` }} />
                      <div className="lobby3d-item-info">
                        <h4>{skin.name}</h4>
                        <span className="lobby3d-item-subtitle">{skin.character}</span>
                        <RarityBadge rarity={skin.rarity} />
                      </div>
                      {!skin.owned && <span className="lobby3d-price">{skin.price} ◉</span>}
                    </div>
                  ))}
                </div>
              )}

              {lockerTab === 'emotes' && (
                <div className="lobby3d-empty-state">
                  <p>Emotes coming soon...</p>
                </div>
              )}
            </div>
          )}

          {/* SHOP TAB - FULL SHOP */}
          {activeTab === 'shop' && (
            <div className="lobby3d-panel lobby3d-panel--wide">
              <h2 className="lobby3d-panel-title">ITEM SHOP</h2>
              
              <div className="lobby3d-shop-tabs">
                {(['featured', 'characters', 'weapons', 'skins'] as const).map(t => (
                  <button key={t} className={`lobby3d-shop-tab ${shopTab === t ? 'lobby3d-shop-tab--active' : ''}`} onClick={() => setShopTab(t)}>
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="lobby3d-shop-grid">
                {SHOP_ITEMS.map(item => (
                  <div key={item.id} className="lobby3d-shop-card">
                    <div className="lobby3d-shop-image" style={{ background: `linear-gradient(135deg, ${item.rarity === 'legendary' ? '#FF8C00' : item.rarity === 'epic' ? '#9400D3' : '#00BFFF'}, #0A0A10)` }}>
                      <RarityBadge rarity={item.rarity} />
                    </div>
                    <div className="lobby3d-shop-info">
                      <h4>{item.name}</h4>
                      <span className="lobby3d-shop-type">{item.type.toUpperCase()}</span>
                      <div className="lobby3d-shop-price">
                        <span className={item.currency === 'snapshot' ? 'lobby3d-price-snapshot' : 'lobby3d-price-credits'}>
                          {item.currency === 'snapshot' ? '◈' : '◉'} {item.price.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <button className="lobby3d-buy-btn">BUY</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BATTLE PASS TAB - FULL BP */}
          {activeTab === 'battlepass' && (
            <div className="lobby3d-panel lobby3d-panel--wide">
              <div className="lobby3d-bp-header">
                <div>
                  <h2 className="lobby3d-panel-title">BATTLE PASS</h2>
                  <p className="lobby3d-bp-season">SEASON 1: PROVING GROUNDS</p>
                </div>
                <div className="lobby3d-bp-tier-large">
                  <span className="lobby3d-bp-tier-label">TIER</span>
                  <span className="lobby3d-bp-tier-num">42</span>
                </div>
              </div>

              <div className="lobby3d-bp-progress">
                <div className="lobby3d-bp-bar-large">
                  <div className="lobby3d-bp-fill-large" style={{ width: '65%' }} />
                </div>
                <span className="lobby3d-bp-xp">3,450 / 5,000 XP</span>
              </div>

              <div className="lobby3d-bp-tiers">
                {BATTLE_PASS_TIERS.map(tier => (
                  <div key={tier.tier} className={`lobby3d-bp-tier-item ${tier.current ? 'lobby3d-bp-tier-item--current' : ''} ${tier.claimed ? 'lobby3d-bp-tier-item--claimed' : ''}`}>
                    <span className="lobby3d-bp-tier-number">{tier.tier}</span>
                    <div className="lobby3d-bp-rewards">
                      {tier.rewards.map((reward, i) => (
                        <div key={i} className={`lobby3d-bp-reward lobby3d-bp-reward--${(reward as {type: string}).type}`}>
                          {(reward as {type: string}).type === 'currency' ? `+${(reward as {amount: number}).amount}` : (reward as {name: string}).name}
                        </div>
                      ))}
                    </div>
                    {tier.claimed && <span className="lobby3d-bp-claimed">✓</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SOCIAL TAB */}
          {activeTab === 'social' && (
            <div className="lobby3d-panel lobby3d-panel--left">
              <h2 className="lobby3d-panel-title">SOCIAL</h2>
              
              {/* Party Section */}
              <div className="lobby3d-social-section">
                <div className="lobby3d-social-header">
                  <h3>PARTY</h3>
                  {!party && <button className="lobby3d-btn-small" onClick={() => setShowPartyModal(true)}>+ CREATE</button>}
                </div>
                {party ? (
                  <div className="lobby3d-party">
                    <div className="lobby3d-party-code">CODE: {party.inviteCode}</div>
                    <div className="lobby3d-party-list">
                      {party.members.map(m => (
                        <div key={String(m.id)} className={`lobby3d-party-member ${m.isLeader ? 'lobby3d-party-member--leader' : ''}`}>
                          <span>{m.displayName}</span>
                          {m.isLeader && <span className="lobby3d-crown">👑</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="lobby3d-empty">Play solo or create a party</p>
                )}
              </div>

              {/* Friends Section */}
              <div className="lobby3d-social-section">
                <div className="lobby3d-social-header">
                  <h3>FRIENDS</h3>
                  <span className="lobby3d-friend-count">{friends.filter(f => f.status === 'online').length}/{friends.length}</span>
                </div>
                <div className="lobby3d-friends-list">
                  {friends.sort((a) => (a.status === 'online' ? -1 : 1)).map(friend => (
                    <div key={String(friend.id)} className="lobby3d-friend">
                      <div className={`lobby3d-friend-avatar lobby3d-friend-avatar--${friend.status}`}>{friend.displayName[0]}</div>
                      <div className="lobby3d-friend-info">
                        <span className="lobby3d-friend-name">{friend.displayName}</span>
                        <span className="lobby3d-friend-status">Lv.{friend.level} • {friend.status}</span>
                      </div>
                      <button className="lobby3d-btn-invite" disabled={friend.status !== 'online'} onClick={() => onInviteFriend(friend.id)}>INVITE</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Right Panel - Character Info */}
          <div className="lobby3d-panel lobby3d-panel--right">
            <div className="lobby3d-character-card">
              <div className="lobby3d-character-details">
                <span className="lobby3d-character-type">{playerProfile.equippedCharacter.species}</span>
                <h2 className="lobby3d-character-title">{playerProfile.equippedCharacter.name}</h2>
                {playerProfile.rank && (
                  <div className="lobby3d-rank">
                    <span className="lobby3d-rank-tier">{playerProfile.rank.tier}</span>
                    <span className="lobby3d-rank-division">DIV {playerProfile.rank.division}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Equipped Loadout Preview */}
            <div className="lobby3d-loadout-preview">
              <h3 className="lobby3d-loadout-title">EQUIPPED</h3>
              <div className="lobby3d-loadout-item">
                <span className="lobby3d-loadout-slot">CHARACTER</span>
                <span className="lobby3d-loadout-value">{CHARACTERS.find(c => c.id === selectedCharacter)?.name}</span>
              </div>
              <div className="lobby3d-loadout-item">
                <span className="lobby3d-loadout-slot">PRIMARY</span>
                <span className="lobby3d-loadout-value">{WEAPONS.find(w => w.id === selectedWeapon)?.name}</span>
              </div>
              <div className="lobby3d-loadout-item">
                <span className="lobby3d-loadout-slot">SKIN</span>
                <span className="lobby3d-loadout-value">{SKINS.find(s => s.owned)?.name || 'Default'}</span>
              </div>
            </div>

            {/* News */}
            <div className="lobby3d-news">
              <h3 className="lobby3d-news-title">📰 NEWS</h3>
              <div className="lobby3d-news-item">
                <div className="lobby3d-news-image" />
                <span className="lobby3d-news-tag">EVENT</span>
                <p>Season 1: The Proving Grounds is now live!</p>
              </div>
            </div>
          </div>
        </main>

        {/* Queue Overlay */}
        {isInQueue && (
          <div className="lobby3d-queue-overlay">
            <div className="lobby3d-queue-card">
              <div className="lobby3d-queue-spinner" />
              <h2>FINDING MATCH</h2>
              <p className="lobby3d-queue-mode">{lobbyState.mode?.toUpperCase()} • {lobbyState.ruleset?.toUpperCase()}</p>
              <p className="lobby3d-queue-timer">{Math.floor((lobbyState.queue?.waitTimeSec || 0) / 60)}:{((lobbyState.queue?.waitTimeSec || 0) % 60).toString().padStart(2, '0')}</p>
              <button className="lobby3d-queue-cancel" onClick={onLeaveQueue}>CANCEL</button>
            </div>
          </div>
        )}

        {/* Party Modal */}
        {showPartyModal && (
          <div className="lobby3d-modal-overlay" onClick={() => setShowPartyModal(false)}>
            <div className="lobby3d-modal" onClick={e => e.stopPropagation()}>
              <h3>PARTY</h3>
              <button className="lobby3d-btn-primary" onClick={() => { onCreateParty(); setShowPartyModal(false); }}>CREATE PARTY</button>
              <div className="lobby3d-divider"><span>OR JOIN</span></div>
              <input type="text" placeholder="ENTER CODE" maxLength={6} className="lobby3d-input" value={partyCode} onChange={e => setPartyCode(e.target.value.toUpperCase())} />
              <button className="lobby3d-btn-secondary" onClick={() => { if (partyCode.length === 6) { onJoinParty(partyCode); setShowPartyModal(false); } }}>JOIN</button>
              <button className="lobby3d-modal-close" onClick={() => setShowPartyModal(false)}>✕</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AAALobby3D;
