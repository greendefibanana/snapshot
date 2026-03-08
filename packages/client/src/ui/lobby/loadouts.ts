export interface WeaponLoadoutOption {
    readonly id: string;
    readonly label: string;
    readonly slot: 'primary' | 'secondary';
    readonly type: string;
    readonly fireMode: string;
    readonly damage: number;
}

export interface CharacterLoadoutOption {
    readonly id: string;
    readonly label: string;
}

export interface LoadoutSlotConfig {
    readonly slotIndex: number;
    readonly name: string;
    readonly characterModelId: string;
    readonly primaryWeaponModelId: string;
    readonly secondaryWeaponModelId: string;
}

export interface PlayerLoadoutState {
    readonly selectedSlotIndex: number;
    readonly slots: readonly LoadoutSlotConfig[];
}

export const CHARACTER_LOADOUT_OPTIONS: readonly CharacterLoadoutOption[] = [
    { id: 'assasin', label: 'Assasin' },
    { id: 'grizzly', label: 'Grizzly' },
    { id: 'kodiak', label: 'Kodiak' },
    { id: 'panda', label: 'Panda' },
];

export const WEAPON_LOADOUT_OPTIONS: readonly WeaponLoadoutOption[] = [
    { id: 'g88_workhorse', label: 'G-88 Workhorse', slot: 'primary', type: 'Assault Rifle', fireMode: 'Auto', damage: 25 },
    { id: 'kilometer', label: 'Kilometer', slot: 'primary', type: 'Auto Shotgun', fireMode: 'Auto', damage: 12 },
    { id: 'shotta', label: 'Shotta', slot: 'primary', type: 'Pump Shotgun', fireMode: 'Pump', damage: 18 },
    { id: 'sniper', label: 'Sniper', slot: 'primary', type: 'Bolt Sniper', fireMode: 'Bolt', damage: 85 },
    { id: 'the_mainline', label: 'The Mainline', slot: 'primary', type: 'Tactical AR', fireMode: 'Auto', damage: 22 },
    { id: 'v3_interval', label: 'V-3 Interval', slot: 'primary', type: 'Burst AR', fireMode: 'Burst', damage: 26 },
    { id: 'tungsten', label: 'Tungsten', slot: 'secondary', type: 'Heavy Pistol', fireMode: 'Semi', damage: 45 },
    { id: 'direct_blaser', label: 'Direct Blaser', slot: 'secondary', type: 'Explosive Pistol', fireMode: 'Semi', damage: 60 },
    { id: 'smg1', label: 'SMG-1', slot: 'secondary', type: 'Machine Pistol', fireMode: 'Auto', damage: 14 },
];

export const PRIMARY_WEAPON_LOADOUT_OPTIONS: readonly WeaponLoadoutOption[] =
    WEAPON_LOADOUT_OPTIONS.filter((weapon) => weapon.slot === 'primary');

export const SECONDARY_WEAPON_LOADOUT_OPTIONS: readonly WeaponLoadoutOption[] =
    WEAPON_LOADOUT_OPTIONS.filter((weapon) => weapon.slot === 'secondary');

const LOADOUT_SLOT_COUNT = 5;

const DEFAULT_SLOTS: readonly LoadoutSlotConfig[] = [
    { slotIndex: 0, name: 'Assault', characterModelId: 'assasin', primaryWeaponModelId: 'g88_workhorse', secondaryWeaponModelId: 'smg1' },
    { slotIndex: 1, name: 'Sniper', characterModelId: 'kodiak', primaryWeaponModelId: 'sniper', secondaryWeaponModelId: 'tungsten' },
    { slotIndex: 2, name: 'Support', characterModelId: 'panda', primaryWeaponModelId: 'the_mainline', secondaryWeaponModelId: 'direct_blaser' },
    { slotIndex: 3, name: 'Skirmish', characterModelId: 'grizzly', primaryWeaponModelId: 'shotta', secondaryWeaponModelId: 'smg1' },
    { slotIndex: 4, name: 'Custom', characterModelId: 'assasin', primaryWeaponModelId: 'v3_interval', secondaryWeaponModelId: 'tungsten' },
];

const STORAGE_PREFIX = 'snapshot-loadouts-v1';

function getStorageKey(walletAddress: string | null): string {
    return `${STORAGE_PREFIX}:${walletAddress ?? 'guest'}`;
}

function clampSlotIndex(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(LOADOUT_SLOT_COUNT - 1, Math.floor(value)));
}

function normalizeCharacterModelId(value: string): string {
    if (CHARACTER_LOADOUT_OPTIONS.some((option) => option.id === value)) {
        return value;
    }
    return DEFAULT_SLOTS[0]!.characterModelId;
}

function normalizePrimaryWeaponModelId(value: string): string {
    if (PRIMARY_WEAPON_LOADOUT_OPTIONS.some((option) => option.id === value)) {
        return value;
    }
    return DEFAULT_SLOTS[0]!.primaryWeaponModelId;
}

function normalizeSecondaryWeaponModelId(value: string): string {
    if (SECONDARY_WEAPON_LOADOUT_OPTIONS.some((option) => option.id === value)) {
        return value;
    }
    return DEFAULT_SLOTS[0]!.secondaryWeaponModelId;
}

function normalizeState(raw: unknown): PlayerLoadoutState {
    if (!raw || typeof raw !== 'object') {
        return {
            selectedSlotIndex: 0,
            slots: DEFAULT_SLOTS,
        };
    }

    const maybe = raw as {
        selectedSlotIndex?: number;
        slots?: Array<
            Partial<LoadoutSlotConfig> &
            Partial<{ weaponModelId: string }>
        >;
    };

    const slots: LoadoutSlotConfig[] = [];
    for (let i = 0; i < LOADOUT_SLOT_COUNT; i++) {
        const base = DEFAULT_SLOTS[i]!;
        const candidate = maybe.slots?.[i];
        slots.push({
            slotIndex: i,
            name: typeof candidate?.name === 'string' && candidate.name.trim() ? candidate.name.trim().slice(0, 24) : base.name,
            characterModelId: normalizeCharacterModelId(String(candidate?.characterModelId ?? base.characterModelId)),
            primaryWeaponModelId: normalizePrimaryWeaponModelId(String(candidate?.primaryWeaponModelId ?? candidate?.weaponModelId ?? base.primaryWeaponModelId)),
            secondaryWeaponModelId: normalizeSecondaryWeaponModelId(String(candidate?.secondaryWeaponModelId ?? base.secondaryWeaponModelId)),
        });
    }

    return {
        selectedSlotIndex: clampSlotIndex(maybe.selectedSlotIndex ?? 0),
        slots,
    };
}

export function createDefaultLoadoutState(): PlayerLoadoutState {
    return normalizeState({});
}

export function coercePlayerLoadoutState(raw: unknown): PlayerLoadoutState {
    return normalizeState(raw);
}

export function loadPlayerLoadoutState(walletAddress: string | null): PlayerLoadoutState {
    try {
        const raw = window.localStorage.getItem(getStorageKey(walletAddress));
        if (!raw) return createDefaultLoadoutState();
        return normalizeState(JSON.parse(raw));
    } catch {
        return createDefaultLoadoutState();
    }
}

export function savePlayerLoadoutState(walletAddress: string | null, state: PlayerLoadoutState): void {
    const normalized = normalizeState(state);
    window.localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(normalized));
}

export function updateLoadoutSlot(
    state: PlayerLoadoutState,
    slotIndex: number,
    patch: Partial<Omit<LoadoutSlotConfig, 'slotIndex'> & { weaponModelId: string }>
): PlayerLoadoutState {
    const safeSlotIndex = clampSlotIndex(slotIndex);
    const nextSlots = state.slots.map((slot, index) => {
        if (index !== safeSlotIndex) return slot;
        return {
            slotIndex: safeSlotIndex,
            name: typeof patch.name === 'string' && patch.name.trim()
                ? patch.name.trim().slice(0, 24)
                : slot.name,
            characterModelId: patch.characterModelId
                ? normalizeCharacterModelId(patch.characterModelId)
                : slot.characterModelId,
            primaryWeaponModelId: patch.primaryWeaponModelId
                ? normalizePrimaryWeaponModelId(patch.primaryWeaponModelId)
                : patch.weaponModelId
                    ? normalizePrimaryWeaponModelId(patch.weaponModelId)
                    : slot.primaryWeaponModelId,
            secondaryWeaponModelId: patch.secondaryWeaponModelId
                ? normalizeSecondaryWeaponModelId(patch.secondaryWeaponModelId)
                : slot.secondaryWeaponModelId,
        };
    });
    return {
        selectedSlotIndex: state.selectedSlotIndex,
        slots: nextSlots,
    };
}

export function selectLoadoutSlot(state: PlayerLoadoutState, slotIndex: number): PlayerLoadoutState {
    return {
        selectedSlotIndex: clampSlotIndex(slotIndex),
        slots: state.slots,
    };
}
