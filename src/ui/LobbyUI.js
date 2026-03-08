import { GUN_REGISTRY } from '../weapons/gunRegistry.js';
import { loadoutStore, DEFAULT_LOADOUTS } from '../state/loadoutStore.js';

let styleInjected = false;

const INJECT_CSS = `
  .lobby-root {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9999;
    background-color: #0a0a0f;
    background-image: 
      linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    display: flex;
    flex-direction: row;
    color: #ffffff;
    font-family: monospace;
    box-sizing: border-box;
  }
  
  .lobby-root * {
    box-sizing: inherit;
  }

  .panel {
    display: flex;
    flex-direction: column;
    padding: 24px;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    height: 100%;
    overflow-y: auto;
  }
  
  .panel-left {
    width: 250px;
    min-width: 250px;
  }
  
  .panel-center {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
  }
  
  .panel-right {
    width: 350px;
    min-width: 350px;
    border-right: none;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
  }

  h2 {
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
    letter-spacing: 2px;
    margin-top: 0;
    margin-bottom: 20px;
    text-transform: uppercase;
  }

  /* Left Panel: Slot Selector */
  .slot-btn {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #ffffff;
    padding: 12px 16px;
    text-align: left;
    font-family: monospace;
    font-size: 16px;
    cursor: pointer;
    margin-bottom: 8px;
    transition: all 0.15s;
  }
  
  .slot-btn:hover {
    border-color: rgba(255, 255, 255, 0.5);
  }
  
  .slot-btn.active {
    border-color: #00FF88;
    color: #00FF88;
    background: rgba(0, 255, 136, 0.05);
  }

  .rename-input {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #ffffff;
    padding: 8px;
    font-family: monospace;
    font-size: 14px;
    margin-top: 20px;
    width: 100%;
  }

  .rename-input:focus {
    outline: none;
    border-color: #00FF88;
  }

  .reset-btn {
    background: transparent;
    border: 1px solid rgba(255, 68, 68, 0.5);
    color: #FF4444;
    padding: 8px;
    font-family: monospace;
    font-size: 14px;
    cursor: pointer;
    margin-top: 12px;
    width: 100%;
    transition: all 0.15s;
  }
  
  .reset-btn:hover {
    background: rgba(255, 68, 68, 0.1);
  }

  /* Center Panel: Gun Grid */
  .gun-section-title {
    color: rgba(255, 255, 255, 0.8);
    margin: 20px 0 10px 0;
    font-size: 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 8px;
  }

  .gun-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding-bottom: 20px;
  }

  .gun-card {
    background: rgba(255, 255, 255, 0.03);
    border: 2px solid rgba(255, 255, 255, 0.1);
    padding: 16px;
    min-width: 160px;
    flex: 1 1 calc(33.333% - 16px);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    transition: border-color 0.15s, background 0.15s;
    position: relative;
  }
  
  .gun-card:hover {
    border-color: rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.05);
  }
  
  .gun-card.selected {
    border-color: #00FF88;
    background: rgba(0, 255, 136, 0.05);
  }
  
  .gun-name {
    font-size: 18px;
    font-weight: bold;
    margin-bottom: 4px;
  }
  
  .gun-card.selected .gun-name {
    color: #00FF88;
  }

  .gun-type-badge {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 16px;
    text-transform: uppercase;
  }

  .gun-stats {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  .stat-row {
    display: flex;
    align-items: center;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.7);
  }
  
  .stat-label {
    width: 60px;
  }

  .stat-bar-bg {
    flex-grow: 1;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
  }

  .stat-bar-fill {
    height: 100%;
    background: #ffffff;
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  
  .gun-card.selected .stat-bar-fill {
    background: #00FF88;
  }

  .fire-mode-badge {
    position: absolute;
    top: 16px;
    right: 16px;
    font-size: 10px;
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  /* Right Panel: Characters + Summary */
  .character-grid {
    display: flex;
    gap: 12px;
    margin-bottom: 30px;
  }

  .char-card {
    border: 2px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
    width: 90px;
    height: 90px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .char-card:hover {
    border-color: rgba(255, 255, 255, 0.3);
  }

  .char-card.selected {
    border-color: #00FF88;
    color: #00FF88;
    background: rgba(0, 255, 136, 0.05);
  }

  .char-icon {
    font-size: 32px;
    opacity: 0.5;
    margin-bottom: 8px;
  }
  
  .char-card.selected .char-icon {
    opacity: 1;
    color: #00FF88;
  }

  .char-name {
    font-size: 12px;
    text-transform: uppercase;
  }

  .summary-section {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    background: rgba(0, 0, 0, 0.2);
    padding: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    margin-bottom: 20px;
  }

  .summary-title {
    font-size: 20px;
    color: #00FF88;
    margin-bottom: 16px;
    text-transform: uppercase;
  }

  .summary-item {
    margin-bottom: 16px;
  }
  
  .summary-item-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 4px;
    text-transform: uppercase;
  }

  .summary-item-value {
    font-size: 16px;
  }

  .summary-item-sub {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    margin-top: 2px;
  }

  .warning-text {
    color: #FF4444;
    font-weight: bold;
    font-size: 14px;
    margin-bottom: 16px;
  }

  .enter-btn {
    padding: 16px 40px;
    font-size: 20px;
    font-family: monospace;
    font-weight: bold;
    color: #000000;
    background: #00FF88;
    border: none;
    cursor: pointer;
    text-transform: uppercase;
    transition: all 0.15s;
  }
  
  .enter-btn:hover:not(:disabled) {
    background: #33ff99;
    transform: translateY(-2px);
  }
  
  .enter-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .enter-btn:disabled {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.3);
    cursor: not-allowed;
  }
`;

function injectStyles() {
    if (styleInjected) return;
    const style = document.createElement('style');
    style.id = 'signal-protocol-lobby-style';
    style.textContent = INJECT_CSS;
    document.head.appendChild(style);
    styleInjected = true;
}

const CHARACTERS = [
    { id: 'char_alpha', name: 'Alpha' },
    { id: 'char_bravo', name: 'Bravo' },
    { id: 'char_charlie', name: 'Charlie' }
];

export class LobbyUI {
    constructor(container) {
        this.container = container;
        this.root = null;
        this.activeSlotIndex = loadoutStore.getActiveIndex();
        this.onReady = null;
        this._unsubscribe = null;

        // Normalize stats
        this.maxStats = { damage: 1, fireRate: 1, magSize: 1 };
        Object.values(GUN_REGISTRY).forEach(gun => {
            const damages = gun.mechanics.damage * (gun.mechanics.pellets || 1); // Approximate shotgun potential
            if (damages > this.maxStats.damage) this.maxStats.damage = damages;
            if (gun.mechanics.fireRate > this.maxStats.fireRate) this.maxStats.fireRate = gun.mechanics.fireRate;
            if (gun.mechanics.magSize > this.maxStats.magSize) this.maxStats.magSize = gun.mechanics.magSize;
        });
    }

    show() {
        loadoutStore.init();
        injectStyles();

        this.root = document.createElement('div');
        this.root.className = 'lobby-root';

        // Build Left Panel
        this.leftPanel = document.createElement('div');
        this.leftPanel.className = 'panel panel-left';
        const leftTitle = document.createElement('h2');
        leftTitle.textContent = 'LOADOUTS';
        this.leftPanel.appendChild(leftTitle);

        this.slotButtonsContainer = document.createElement('div');
        this.leftPanel.appendChild(this.slotButtonsContainer);

        const renameInput = document.createElement('input');
        renameInput.className = 'rename-input';
        renameInput.placeholder = 'Rename loadout...';
        renameInput.oninput = (e) => {
            loadoutStore.setName(this.activeSlotIndex, e.target.value);
        };
        this.renameInput = renameInput;

        const resetBtn = document.createElement('button');
        resetBtn.className = 'reset-btn';
        resetBtn.textContent = 'RESET SLOT';
        resetBtn.onclick = () => {
            loadoutStore.resetSlot(this.activeSlotIndex);
        };

        this.leftPanel.appendChild(renameInput);
        this.leftPanel.appendChild(resetBtn);

        // Build Center Panel
        this.centerPanel = document.createElement('div');
        this.centerPanel.className = 'panel panel-center';

        const primaryTitle = document.createElement('div');
        primaryTitle.className = 'gun-section-title';
        primaryTitle.textContent = 'PRIMARY WEAPON';

        this.primaryGrid = document.createElement('div');
        this.primaryGrid.className = 'gun-grid';

        const secondaryTitle = document.createElement('div');
        secondaryTitle.className = 'gun-section-title';
        secondaryTitle.textContent = 'SECONDARY WEAPON';
        secondaryTitle.style.marginTop = '40px';

        this.secondaryGrid = document.createElement('div');
        this.secondaryGrid.className = 'gun-grid';

        this.centerPanel.appendChild(primaryTitle);
        this.centerPanel.appendChild(this.primaryGrid);
        this.centerPanel.appendChild(secondaryTitle);
        this.centerPanel.appendChild(this.secondaryGrid);

        // Build Right Panel
        this.rightPanel = document.createElement('div');
        this.rightPanel.className = 'panel panel-right';

        const charTitle = document.createElement('h2');
        charTitle.textContent = 'OPERATOR';

        this.charGrid = document.createElement('div');
        this.charGrid.className = 'character-grid';

        this.summarySection = document.createElement('div');
        this.summarySection.className = 'summary-section';

        this.enterBtn = document.createElement('button');
        this.enterBtn.className = 'enter-btn';
        this.enterBtn.textContent = 'ENTER GAME';
        this.enterBtn.onclick = () => {
            const slot = loadoutStore.getActiveSlot();
            if (this.onReady) this.onReady(slot);
        };

        this.rightPanel.appendChild(charTitle);
        this.rightPanel.appendChild(this.charGrid);
        this.rightPanel.appendChild(this.summarySection);
        this.rightPanel.appendChild(this.enterBtn);

        this.root.appendChild(this.leftPanel);
        this.root.appendChild(this.centerPanel);
        this.root.appendChild(this.rightPanel);
        this.container.appendChild(this.root);

        this._unsubscribe = loadoutStore.subscribe((slots, activeIndex) => {
            this.activeSlotIndex = activeIndex;
            this._renderAll();
        });

        this._renderAll();
    }

    hide() {
        if (this.root) {
            this.root.remove();
            this.root = null;
        }
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
    }

    _renderAll() {
        this._renderSlotButtons();
        this._renderGunGrid('primary');
        this._renderGunGrid('secondary');
        this._renderCharacterPanel();
        this._renderSummary();

        const activeSlot = loadoutStore.getActiveSlot();
        if (this.renameInput && activeSlot) {
            if (document.activeElement !== this.renameInput) {
                this.renameInput.value = activeSlot.name;
            }
        }
    }

    _renderSlotButtons() {
        this.slotButtonsContainer.innerHTML = '';
        const slots = loadoutStore.getSlots();

        slots.forEach((slot, index) => {
            const btn = document.createElement('button');
            btn.className = `slot-btn ${index === this.activeSlotIndex ? 'active' : ''}`;
            btn.textContent = `${index + 1}. ${slot.name}`;
            btn.onclick = () => {
                loadoutStore.setActiveIndex(index);
            };
            this.slotButtonsContainer.appendChild(btn);
        });
    }

    _renderGunGrid(slotType) {
        const grid = slotType === 'primary' ? this.primaryGrid : this.secondaryGrid;
        grid.innerHTML = '';

        const activeSlot = loadoutStore.getActiveSlot();
        const selectedGunId = activeSlot[slotType];

        const guns = Object.values(GUN_REGISTRY).filter(g => g.slot === slotType);

        guns.forEach(gun => {
            const isSelected = selectedGunId === gun.id;
            const card = document.createElement('div');
            card.className = `gun-card ${isSelected ? 'selected' : ''}`;
            card.onclick = () => {
                loadoutStore.setGun(this.activeSlotIndex, slotType, gun.id);
            };

            const nameEl = document.createElement('div');
            nameEl.className = 'gun-name';
            nameEl.textContent = gun.name;

            const typeBadge = document.createElement('div');
            typeBadge.className = 'gun-type-badge';
            typeBadge.textContent = gun.type || 'WEAPON';

            const fireModeBadge = document.createElement('div');
            fireModeBadge.className = 'fire-mode-badge';
            fireModeBadge.textContent = gun.mechanics.fireMode;

            const statsContainer = document.createElement('div');
            statsContainer.className = 'gun-stats';

            // Damage Stat
            const totalDamage = gun.mechanics.damage * (gun.mechanics.pellets || 1);
            statsContainer.appendChild(this._createStatRow('DMG', totalDamage, this.maxStats.damage));

            // Fire Rate Stat
            statsContainer.appendChild(this._createStatRow('RPM', gun.mechanics.fireRate, this.maxStats.fireRate));

            // Mag Stat
            statsContainer.appendChild(this._createStatRow('MAG', gun.mechanics.magSize, this.maxStats.magSize));

            // Range Stat
            const rangeVal = gun.mechanics.range === Infinity ? 200 : gun.mechanics.range;
            statsContainer.appendChild(this._createStatRow('RNG', rangeVal, 200));

            card.appendChild(nameEl);
            card.appendChild(typeBadge);
            card.appendChild(statsContainer);
            card.appendChild(fireModeBadge);

            grid.appendChild(card);
        });
    }

    _createStatRow(label, value, maxVal) {
        const row = document.createElement('div');
        row.className = 'stat-row';

        const labelEl = document.createElement('div');
        labelEl.className = 'stat-label';
        labelEl.textContent = label;

        const bgEl = document.createElement('div');
        bgEl.className = 'stat-bar-bg';

        const fillEl = document.createElement('div');
        fillEl.className = 'stat-bar-fill';
        const percent = Math.min(100, Math.max(0, (value / maxVal) * 100));
        fillEl.style.width = `${percent}%`;

        bgEl.appendChild(fillEl);
        row.appendChild(labelEl);
        row.appendChild(bgEl);
        return row;
    }

    _renderCharacterPanel() {
        this.charGrid.innerHTML = '';
        const activeSlot = loadoutStore.getActiveSlot();
        const selectedCharId = activeSlot.character;

        CHARACTERS.forEach(char => {
            const isSelected = selectedCharId === char.id;
            const card = document.createElement('div');
            card.className = `char-card ${isSelected ? 'selected' : ''}`;
            card.onclick = () => {
                loadoutStore.setCharacter(this.activeSlotIndex, char.id);
            };

            const icon = document.createElement('div');
            icon.className = 'char-icon';
            icon.textContent = '👤'; // Placeholder silhouette icon

            const name = document.createElement('div');
            name.className = 'char-name';
            name.textContent = char.name;

            card.appendChild(icon);
            card.appendChild(name);
            this.charGrid.appendChild(card);
        });
    }

    _renderSummary() {
        this.summarySection.innerHTML = '';
        const activeSlot = loadoutStore.getActiveSlot();

        const title = document.createElement('div');
        title.className = 'summary-title';
        title.textContent = activeSlot.name;
        this.summarySection.appendChild(title);

        let warnings = [];

        // Primary
        if (activeSlot.primary && GUN_REGISTRY[activeSlot.primary]) {
            const gun = GUN_REGISTRY[activeSlot.primary];
            this._appendSummaryItem('PRIMARY', gun.name, `${gun.type} | ${gun.mechanics.damage} DMG`);
        } else {
            warnings.push('SELECT A PRIMARY');
        }

        // Secondary
        if (activeSlot.secondary && GUN_REGISTRY[activeSlot.secondary]) {
            const gun = GUN_REGISTRY[activeSlot.secondary];
            this._appendSummaryItem('SECONDARY', gun.name, `${gun.type} | ${gun.mechanics.damage} DMG`);
        } else {
            warnings.push('SELECT A SECONDARY');
        }

        // Character
        if (activeSlot.character) {
            const char = CHARACTERS.find(c => c.id === activeSlot.character);
            this._appendSummaryItem('OPERATOR', char ? char.name : 'Unknown', '');
        } else {
            warnings.push('SELECT AN OPERATOR');
        }

        // Warnings
        if (warnings.length > 0) {
            warnings.forEach(w => {
                const warnEl = document.createElement('div');
                warnEl.className = 'warning-text';
                warnEl.textContent = w;
                this.summarySection.appendChild(warnEl);
            });
            this.enterBtn.disabled = true;
        } else {
            this.enterBtn.disabled = false;
        }
    }

    _appendSummaryItem(label, value, subValue) {
        const container = document.createElement('div');
        container.className = 'summary-item';

        const labelEl = document.createElement('div');
        labelEl.className = 'summary-item-label';
        labelEl.textContent = label;

        const valEl = document.createElement('div');
        valEl.className = 'summary-item-value';
        valEl.textContent = value;

        container.appendChild(labelEl);
        container.appendChild(valEl);

        if (subValue) {
            const subEl = document.createElement('div');
            subEl.className = 'summary-item-sub';
            subEl.textContent = subValue;
            container.appendChild(subEl);
        }

        this.summarySection.appendChild(container);
    }
}
