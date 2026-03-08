import { loadoutStore } from '../state/loadoutStore.js';
import { GUN_REGISTRY } from '../weapons/gunRegistry.js';

let styleInjected = false;

const INJECT_CSS = `
  .loadout-select-root {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 9998;
    background-color: rgba(10, 10, 15, 0.88);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: #ffffff;
    font-family: monospace;
    box-sizing: border-box;
    /* Let clicks pass through the background container if needed */
    pointer-events: none; 
    padding: 40px;
  }
  
  .loadout-select-root * {
    box-sizing: inherit;
  }

  /* Make inner elements interactive */
  .ls-header, .ls-cards-container, .ls-stats-strip, .ls-action-row {
    pointer-events: auto;
  }

  .ls-header {
    text-align: center;
    margin-bottom: 40px;
  }

  .ls-title {
    color: #00FF88;
    font-size: 24px;
    letter-spacing: 4px;
    margin: 0 0 8px 0;
  }
  
  .ls-subtitle {
    color: rgba(255, 255, 255, 0.6);
    font-size: 14px;
    letter-spacing: 2px;
    margin: 0;
  }

  .ls-cards-container {
    display: flex;
    gap: 20px;
    max-width: 100%;
    overflow-x: auto;
    padding: 20px 0;
  }

  .ls-card {
    background: rgba(255, 255, 255, 0.03);
    border: 2px solid rgba(255, 255, 255, 0.1);
    padding: 24px;
    min-width: 240px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    position: relative;
  }
  
  .ls-card:hover {
    border-color: rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.05);
  }
  
  .ls-card.selected {
    border-color: #00FF88;
    background: rgba(0, 255, 136, 0.05);
    transform: scale(1.04);
    box-shadow: 0 0 20px rgba(0, 255, 136, 0.1);
    z-index: 10;
  }

  .ls-card-number {
    position: absolute;
    top: 12px;
    left: 16px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
  }

  .ls-card.selected .ls-card-number {
    color: #00FF88;
  }

  .ls-card-name {
    font-size: 20px;
    font-weight: bold;
    text-align: center;
    margin-top: 16px;
    margin-bottom: 4px;
  }

  .ls-card.selected .ls-card-name {
    color: #00FF88;
  }

  .ls-card-char {
    text-align: center;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 24px;
    text-transform: uppercase;
  }

  .ls-gun-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-top: 1px dashed rgba(255, 255, 255, 0.1);
  }

  .ls-gun-name {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.9);
  }

  .ls-gun-mode {
    font-size: 10px;
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.7);
  }

  .ls-empty-text {
    color: rgba(255, 68, 68, 0.8);
    font-size: 12px;
    text-align: center;
    width: 100%;
    padding: 8px 0;
  }

  .ls-stats-strip {
    display: flex;
    width: 800px;
    max-width: 100%;
    margin-top: 40px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .ls-stat-col {
    flex: 1;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .ls-stat-col:first-child {
    border-right: 1px solid rgba(255, 255, 255, 0.1);
  }

  .ls-stat-header {
    color: #00FF88;
    font-size: 14px;
    letter-spacing: 1px;
    margin-bottom: 8px;
  }

  .ls-stat-row {
    display: flex;
    align-items: center;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
  }
  
  .ls-stat-label {
    width: 60px;
  }

  .ls-stat-bar-bg {
    flex-grow: 1;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
  }

  .ls-stat-bar-fill {
    height: 100%;
    background: #ffffff;
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  
  .ls-stat-col .ls-stat-bar-fill {
    background: #00FF88;
  }

  .ls-action-row {
    display: flex;
    width: 800px;
    max-width: 100%;
    justify-content: space-between;
    align-items: center;
    margin-top: 40px;
  }

  .ls-back-btn {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    font-family: monospace;
    font-size: 16px;
    cursor: pointer;
    padding: 12px 24px;
    transition: color 0.2s;
  }

  .ls-back-btn:hover {
    color: #ffffff;
  }

  .ls-deploy-btn {
    position: relative;
    padding: 16px 48px;
    font-size: 24px;
    font-family: monospace;
    font-weight: bold;
    color: #000000;
    background: #00FF88;
    border: none;
    cursor: pointer;
    text-transform: uppercase;
    transition: all 0.15s;
    box-shadow: 0 0 15px rgba(0, 255, 136, 0.2);
  }

  .ls-deploy-btn:hover:not(:disabled) {
    background: #33ff99;
    transform: translateY(-2px);
    box-shadow: 0 4px 20px rgba(0, 255, 136, 0.4);
  }

  .ls-deploy-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .ls-deploy-btn:disabled {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.3);
    cursor: not-allowed;
    box-shadow: none;
  }

  /* Tooltip logic */
  .ls-deploy-btn:disabled::after {
    content: "LOADOUT INCOMPLETE";
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 12px;
    background: rgba(255, 68, 68, 0.9);
    color: #ffffff;
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 4px;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
  }

  .ls-deploy-btn:disabled:hover::after {
    opacity: 1;
  }
`;

function injectStyles() {
    if (styleInjected) return;
    const style = document.createElement('style');
    style.id = 'signal-protocol-loadout-select-style';
    style.textContent = INJECT_CSS;
    document.head.appendChild(style);
    styleInjected = true;
}

// Minimal dummy map of chars just for the name display since it's hardcoded in LobbyUI too
const CHARACTERS = {
    'char_alpha': 'Alpha',
    'char_bravo': 'Bravo',
    'char_charlie': 'Charlie'
};

export class LoadoutSelectScreen {
    constructor(container) {
        this.container = container;
        this.root = null;
        this.selectedIndex = loadoutStore.getActiveIndex();
        this.onDeploy = null;
        this.onBackToLobby = null;

        // Normalize stats specific to this screen
        this.maxStats = { damage: 1, fireRate: 1, magSize: 1 };
        Object.values(GUN_REGISTRY).forEach(gun => {
            const damages = gun.mechanics.damage * (gun.mechanics.pellets || 1);
            if (damages > this.maxStats.damage) this.maxStats.damage = damages;
            if (gun.mechanics.fireRate > this.maxStats.fireRate) this.maxStats.fireRate = gun.mechanics.fireRate;
            if (gun.mechanics.magSize > this.maxStats.magSize) this.maxStats.magSize = gun.mechanics.magSize;
        });
    }

    show() {
        loadoutStore.init();
        this.selectedIndex = loadoutStore.getActiveIndex();
        injectStyles();

        this.root = document.createElement('div');
        this.root.className = 'loadout-select-root';

        // Header
        const header = document.createElement('div');
        header.className = 'ls-header';
        const title = document.createElement('h1');
        title.className = 'ls-title';
        title.textContent = 'SIGNAL PROTOCOL — SOLO';
        const subtitle = document.createElement('h2');
        subtitle.className = 'ls-subtitle';
        subtitle.textContent = 'SELECT DEPLOYMENT LOADOUT';
        header.appendChild(title);
        header.appendChild(subtitle);
        this.root.appendChild(header);

        // Cards Container
        this.cardsContainer = document.createElement('div');
        this.cardsContainer.className = 'ls-cards-container';
        this.root.appendChild(this.cardsContainer);

        // Stats Strip Container
        this.statsStrip = document.createElement('div');
        this.statsStrip.className = 'ls-stats-strip';
        this.root.appendChild(this.statsStrip);

        // Action Row
        this.actionRow = document.createElement('div');
        this.actionRow.className = 'ls-action-row';

        const backBtn = document.createElement('button');
        backBtn.className = 'ls-back-btn';
        backBtn.textContent = '← BACK TO LOBBY';
        backBtn.onclick = () => {
            if (this.onBackToLobby) this.onBackToLobby();
        };

        this.deployBtn = document.createElement('button');
        this.deployBtn.className = 'ls-deploy-btn';
        this.deployBtn.textContent = 'DEPLOY →';
        this.deployBtn.onclick = () => {
            if (this.onDeploy) {
                // Automatically save the selection before deploying
                loadoutStore.setActiveIndex(this.selectedIndex);
                this.onDeploy(loadoutStore.getSlot(this.selectedIndex));
            }
        };

        this.actionRow.appendChild(backBtn);
        this.actionRow.appendChild(this.deployBtn);
        this.root.appendChild(this.actionRow);

        this.container.appendChild(this.root);

        this._renderAll();
    }

    hide() {
        if (this.root) {
            this.root.remove();
            this.root = null;
        }
    }

    _renderAll() {
        this._renderCards();
        this._renderStatsStrip();
    }

    _renderCards() {
        this.cardsContainer.innerHTML = '';
        const slots = loadoutStore.getSlots();

        slots.forEach((slot, index) => {
            const isSelected = index === this.selectedIndex;

            const card = document.createElement('div');
            card.className = `ls-card ${isSelected ? 'selected' : ''}`;
            card.onclick = () => {
                this.selectedIndex = index;
                loadoutStore.setActiveIndex(index);
                this._renderAll();
            };

            const numberMarker = document.createElement('div');
            numberMarker.className = 'ls-card-number';
            numberMarker.textContent = `0${index + 1}`;
            card.appendChild(numberMarker);

            const nameSlot = document.createElement('div');
            nameSlot.className = 'ls-card-name';
            nameSlot.textContent = slot.name || `LOADOUT ${index + 1}`;
            card.appendChild(nameSlot);

            const charName = document.createElement('div');
            charName.className = 'ls-card-char';
            charName.textContent = slot.character ? CHARACTERS[slot.character] || 'UNKNOWN' : 'NO OPERATOR';
            card.appendChild(charName);

            card.appendChild(this._createGunRow(slot.primary, 'PRIMARY'));
            card.appendChild(this._createGunRow(slot.secondary, 'SECONDARY'));

            this.cardsContainer.appendChild(card);
        });
    }

    _createGunRow(gunId, fallbackType) {
        const row = document.createElement('div');
        row.className = 'ls-gun-row';

        if (!gunId || !GUN_REGISTRY[gunId]) {
            const empty = document.createElement('div');
            empty.className = 'ls-empty-text';
            empty.textContent = '— EMPTY SLOT —';
            row.appendChild(empty);
            return row;
        }

        const gun = GUN_REGISTRY[gunId];

        const nameStr = document.createElement('div');
        nameStr.className = 'ls-gun-name';
        nameStr.textContent = gun.name;

        const modeBgd = document.createElement('div');
        modeBgd.className = 'ls-gun-mode';
        modeBgd.textContent = gun.mechanics.fireMode;

        row.appendChild(nameStr);
        row.appendChild(modeBgd);

        return row;
    }

    _renderStatsStrip() {
        this.statsStrip.innerHTML = '';
        const slot = loadoutStore.getSlot(this.selectedIndex);

        const isReady = slot && slot.primary && slot.secondary && slot.character;
        this.deployBtn.disabled = !isReady;

        if (!slot) return;

        // Primary Col
        const primaryCol = document.createElement('div');
        primaryCol.className = 'ls-stat-col';
        if (slot.primary && GUN_REGISTRY[slot.primary]) {
            const g = GUN_REGISTRY[slot.primary];

            const header = document.createElement('div');
            header.className = 'ls-stat-header';
            header.textContent = `PRIMARY: ${g.name}`;
            primaryCol.appendChild(header);

            const totalDmg = g.mechanics.damage * (g.mechanics.pellets || 1);
            primaryCol.appendChild(this._createStatRow('DMG', totalDmg, this.maxStats.damage));
            primaryCol.appendChild(this._createStatRow('RPM', g.mechanics.fireRate, this.maxStats.fireRate));
            primaryCol.appendChild(this._createStatRow('MAG', g.mechanics.magSize, this.maxStats.magSize));

            const rangeVal = g.mechanics.range === Infinity ? 200 : g.mechanics.range;
            primaryCol.appendChild(this._createStatRow('RNG', rangeVal, 200));
        } else {
            const header = document.createElement('div');
            header.className = 'ls-stat-header';
            header.style.color = '#FF4444';
            header.textContent = 'PRIMARY: NONE';
            primaryCol.appendChild(header);
        }
        this.statsStrip.appendChild(primaryCol);

        // Secondary Col
        const secondaryCol = document.createElement('div');
        secondaryCol.className = 'ls-stat-col';
        if (slot.secondary && GUN_REGISTRY[slot.secondary]) {
            const g = GUN_REGISTRY[slot.secondary];

            const header = document.createElement('div');
            header.className = 'ls-stat-header';
            header.textContent = `SECONDARY: ${g.name}`;
            secondaryCol.appendChild(header);

            const totalDmg = g.mechanics.damage * (g.mechanics.pellets || 1);
            secondaryCol.appendChild(this._createStatRow('DMG', totalDmg, this.maxStats.damage));
            secondaryCol.appendChild(this._createStatRow('RPM', g.mechanics.fireRate, this.maxStats.fireRate));
            secondaryCol.appendChild(this._createStatRow('MAG', g.mechanics.magSize, this.maxStats.magSize));

            const rangeVal = g.mechanics.range === Infinity ? 200 : g.mechanics.range;
            secondaryCol.appendChild(this._createStatRow('RNG', rangeVal, 200));
        } else {
            const header = document.createElement('div');
            header.className = 'ls-stat-header';
            header.style.color = '#FF4444';
            header.textContent = 'SECONDARY: NONE';
            secondaryCol.appendChild(header);
        }
        this.statsStrip.appendChild(secondaryCol);
    }

    _createStatRow(label, value, maxVal) {
        const row = document.createElement('div');
        row.className = 'ls-stat-row';

        const labelEl = document.createElement('div');
        labelEl.className = 'ls-stat-label';
        labelEl.textContent = label;

        const bgEl = document.createElement('div');
        bgEl.className = 'ls-stat-bar-bg';

        const fillEl = document.createElement('div');
        fillEl.className = 'ls-stat-bar-fill';
        const percent = Math.min(100, Math.max(0, (value / maxVal) * 100));
        fillEl.style.width = `${percent}%`;

        bgEl.appendChild(fillEl);
        row.appendChild(labelEl);
        row.appendChild(bgEl);
        return row;
    }
}
