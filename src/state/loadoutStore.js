export const MAX_SLOTS = 5;
export const STORAGE_KEY = 'signal_protocol_loadouts';
export const ACTIVE_SLOT_KEY = 'signal_protocol_active_slot';

export const DEFAULT_LOADOUTS = [
    { name: 'Workhorse', primary: 'g88_workhorse', secondary: 'tungsten', character: null },
    { name: 'Aggro', primary: 'kilometer', secondary: 'smg1', character: null },
    { name: 'Precision', primary: 'sniper', secondary: 'tungsten', character: null },
    { name: 'Burst', primary: 'v3_interval', secondary: 'direct_blaser', character: null },
    { name: 'Shotgunner', primary: 'shotta', secondary: 'tungsten', character: null }
];

const loadoutStore = {
    slots: [],
    activeIndex: 0,
    subscribers: new Set(),

    init() {
        this._load();
    },

    getSlots() {
        return JSON.parse(JSON.stringify(this.slots));
    },

    getSlot(index) {
        if (index < 0 || index >= MAX_SLOTS) return null;
        return JSON.parse(JSON.stringify(this.slots[index]));
    },

    getActiveSlot() {
        return this.getSlot(this.activeIndex);
    },

    getActiveIndex() {
        return this.activeIndex;
    },

    setActiveIndex(index) {
        if (index >= 0 && index < MAX_SLOTS) {
            this.activeIndex = index;
            this._persist();
            this._notify();
        }
    },

    setGun(slotIndex, weaponSlot, gunId) {
        if (slotIndex >= 0 && slotIndex < MAX_SLOTS && (weaponSlot === 'primary' || weaponSlot === 'secondary')) {
            this.slots[slotIndex][weaponSlot] = gunId;
            this._persist();
            this._notify();
        }
    },

    setCharacter(slotIndex, characterId) {
        if (slotIndex >= 0 && slotIndex < MAX_SLOTS) {
            this.slots[slotIndex].character = characterId;
            this._persist();
            this._notify();
        }
    },

    setName(slotIndex, name) {
        if (slotIndex >= 0 && slotIndex < MAX_SLOTS) {
            const cleanName = typeof name === 'string' ? name.substring(0, 20) : '';
            this.slots[slotIndex].name = cleanName;
            this._persist();
            this._notify();
        }
    },

    resetSlot(slotIndex) {
        if (slotIndex >= 0 && slotIndex < MAX_SLOTS) {
            this.slots[slotIndex] = JSON.parse(JSON.stringify(DEFAULT_LOADOUTS[slotIndex]));
            this._persist();
            this._notify();
        }
    },

    resetAll() {
        this.slots = JSON.parse(JSON.stringify(DEFAULT_LOADOUTS));
        this.activeIndex = 0;
        this._persist();
        this._notify();
    },

    _persist() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.slots));
            localStorage.setItem(ACTIVE_SLOT_KEY, this.activeIndex.toString());
        } catch (e) {
            console.warn('Failed to save loadout to localStorage:', e);
        }
    },

    _load() {
        try {
            const storedSlots = localStorage.getItem(STORAGE_KEY);
            const storedIndex = localStorage.getItem(ACTIVE_SLOT_KEY);

            if (storedSlots) {
                const parsed = JSON.parse(storedSlots);
                if (Array.isArray(parsed) && parsed.length === MAX_SLOTS) {
                    // Additional validation could go here if needed
                    this.slots = parsed;
                } else {
                    this.slots = JSON.parse(JSON.stringify(DEFAULT_LOADOUTS));
                }
            } else {
                this.slots = JSON.parse(JSON.stringify(DEFAULT_LOADOUTS));
            }

            if (storedIndex !== null) {
                const index = parseInt(storedIndex, 10);
                this.activeIndex = (index >= 0 && index < MAX_SLOTS) ? index : 0;
            } else {
                this.activeIndex = 0;
            }
        } catch (e) {
            console.warn('Failed to parse loadout from localStorage, using defaults:', e);
            this.slots = JSON.parse(JSON.stringify(DEFAULT_LOADOUTS));
            this.activeIndex = 0;
        }

        // Always persist after load to ensure valid state in localStorage going forward
        this._persist();
    },

    subscribe(fn) {
        if (typeof fn === 'function') {
            this.subscribers.add(fn);
        }

        return () => {
            this.subscribers.delete(fn);
        };
    },

    _notify() {
        const slotsCopy = this.getSlots();
        for (const fn of this.subscribers) {
            fn(slotsCopy, this.activeIndex);
        }
    }
};

// Initialize on import so consumers immediately have access to valid state
loadoutStore.init();

export { loadoutStore };
export default loadoutStore;
