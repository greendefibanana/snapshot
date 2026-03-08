/**
 * LoadoutPanel — Full Loadout Customizer Overlay
 *
 * AAA-styled loadout editor with slot tabs, character grid,
 * primary/secondary weapon grids with stat bars.
 * Uses existing loadouts.ts data system.
 */


import {
    type PlayerLoadoutState,
    type LoadoutSlotConfig,
    CHARACTER_LOADOUT_OPTIONS,
    PRIMARY_WEAPON_LOADOUT_OPTIONS,
    SECONDARY_WEAPON_LOADOUT_OPTIONS,
} from './loadouts';

// =============================================================================
// PROPS
// =============================================================================

export interface LoadoutPanelProps {
    isOpen: boolean;
    onClose: () => void;
    loadoutState: PlayerLoadoutState;
    onSelectSlot: (slotIndex: number) => void;
    onUpdateSlot: (
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
// HELPERS
// =============================================================================

const charLabel = new Map(CHARACTER_LOADOUT_OPTIONS.map(c => [c.id, c.label]));

function damageBar(damage: number, max = 100): string {
    return `${Math.min(100, Math.round((damage / max) * 100))}%`;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function LoadoutPanel({
    isOpen,
    onClose,
    loadoutState,
    onSelectSlot,
    onUpdateSlot,
}: LoadoutPanelProps) {
    const selectedSlot: LoadoutSlotConfig | undefined = loadoutState.slots[loadoutState.selectedSlotIndex];

    if (!isOpen || !selectedSlot) return null;

    return (
        <div className="loadout-overlay">
            <div className="loadout-panel">
                {/* ── Header ── */}
                <div className="loadout-panel__header">
                    <div>
                        <h2 className="loadout-panel__title">LOADOUT EDITOR</h2>
                        <div className="loadout-panel__subtitle">
                            Select a slot, then customize character &amp; weapons
                        </div>
                    </div>
                    <button className="mode-selector-close" onClick={onClose}>✕</button>
                </div>

                {/* ── Slot Tabs ── */}
                <div className="loadout-slots">
                    {loadoutState.slots.map((slot, idx) => (
                        <button
                            key={`slot-${idx}`}
                            className={`loadout-slot-tab ${idx === loadoutState.selectedSlotIndex ? 'loadout-slot-tab--active' : ''}`}
                            onClick={() => onSelectSlot(idx)}
                        >
                            <div className="loadout-slot-tab__index">SLOT {idx + 1}</div>
                            <div className="loadout-slot-tab__name">{slot.name}</div>
                            <div className="loadout-slot-tab__char">{charLabel.get(slot.characterModelId) ?? slot.characterModelId}</div>
                        </button>
                    ))}
                </div>

                {/* ── Slot Name ── */}
                <div className="loadout-section-block">
                    <div className="loadout-section-label">LOADOUT NAME</div>
                    <input
                        className="loadout-name-input"
                        value={selectedSlot.name}
                        onChange={(e) => onUpdateSlot(loadoutState.selectedSlotIndex, { name: e.target.value })}
                        maxLength={24}
                        placeholder="Loadout name"
                    />
                </div>

                {/* ── Characters ── */}
                <div className="loadout-section-block">
                    <div className="loadout-section-label">CHARACTER</div>
                    <div className="loadout-grid loadout-grid--characters">
                        {CHARACTER_LOADOUT_OPTIONS.map((char) => {
                            const active = char.id === selectedSlot.characterModelId;
                            return (
                                <button
                                    key={`char-${char.id}`}
                                    className={`weapon-card character-card ${active ? 'weapon-card--active' : ''}`}
                                    onClick={() => onUpdateSlot(loadoutState.selectedSlotIndex, { characterModelId: char.id })}
                                >
                                    <div className="weapon-card__name">{char.label}</div>
                                    <div className="weapon-card__type">{char.id}</div>
                                    {active && <div className="weapon-card__equipped">EQUIPPED</div>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Primary Weapons ── */}
                <div className="loadout-section-block">
                    <div className="loadout-section-label">PRIMARY WEAPON</div>
                    <div className="loadout-grid loadout-grid--weapons">
                        {PRIMARY_WEAPON_LOADOUT_OPTIONS.map((weapon) => {
                            const active = weapon.id === selectedSlot.primaryWeaponModelId;
                            return (
                                <button
                                    key={`pri-${weapon.id}`}
                                    className={`weapon-card ${active ? 'weapon-card--active weapon-card--primary' : ''}`}
                                    onClick={() => onUpdateSlot(loadoutState.selectedSlotIndex, { primaryWeaponModelId: weapon.id })}
                                >
                                    <div className="weapon-card__name">{weapon.label}</div>
                                    <div className="weapon-card__type">{weapon.type} · {weapon.fireMode}</div>
                                    <div className="weapon-card__stat">
                                        <span className="weapon-card__stat-label">DMG</span>
                                        <div className="weapon-card__stat-bar">
                                            <div
                                                className="weapon-card__stat-fill weapon-card__stat-fill--primary"
                                                style={{ width: damageBar(weapon.damage) }}
                                            />
                                        </div>
                                        <span className="weapon-card__stat-value">{weapon.damage}</span>
                                    </div>
                                    {active && <div className="weapon-card__equipped">EQUIPPED</div>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Secondary Weapons ── */}
                <div className="loadout-section-block">
                    <div className="loadout-section-label">SECONDARY WEAPON</div>
                    <div className="loadout-grid loadout-grid--weapons">
                        {SECONDARY_WEAPON_LOADOUT_OPTIONS.map((weapon) => {
                            const active = weapon.id === selectedSlot.secondaryWeaponModelId;
                            return (
                                <button
                                    key={`sec-${weapon.id}`}
                                    className={`weapon-card ${active ? 'weapon-card--active weapon-card--secondary' : ''}`}
                                    onClick={() => onUpdateSlot(loadoutState.selectedSlotIndex, { secondaryWeaponModelId: weapon.id })}
                                >
                                    <div className="weapon-card__name">{weapon.label}</div>
                                    <div className="weapon-card__type">{weapon.type} · {weapon.fireMode}</div>
                                    <div className="weapon-card__stat">
                                        <span className="weapon-card__stat-label">DMG</span>
                                        <div className="weapon-card__stat-bar">
                                            <div
                                                className="weapon-card__stat-fill weapon-card__stat-fill--secondary"
                                                style={{ width: damageBar(weapon.damage) }}
                                            />
                                        </div>
                                        <span className="weapon-card__stat-value">{weapon.damage}</span>
                                    </div>
                                    {active && <div className="weapon-card__equipped">EQUIPPED</div>}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default LoadoutPanel;
