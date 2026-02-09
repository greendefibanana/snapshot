/**
 * InventoryScreen - Display owned items
 * 
 * Shows item grid with equipped indicators and selection panel.
 * Read-only: no purchasing, no stats, no drag/drop.
 */

import React, { useState } from 'react';
import type { InventoryItem, ItemId, ItemType } from '@snapshot/shared';
import { Badge } from '../primitives/Badge.js';
import { Card } from '../primitives/Card.js';

// =============================================================================
// TYPES
// =============================================================================

export type EquipSlot = 'character' | 'primaryWeapon' | 'secondaryWeapon';

export interface InventoryScreenProps {
    readonly inventory: readonly InventoryItem[];
    readonly equipped: Partial<Record<EquipSlot, ItemId>>;
}

// =============================================================================
// HELPERS
// =============================================================================

function getItemTypeLabel(itemType: ItemType): string {
    switch (itemType) {
        case 'character': return 'Character';
        case 'weapon': return 'Weapon';
        case 'cosmetic': return 'Cosmetic';
    }
}

function isEquipped(itemId: ItemId, equipped: Partial<Record<EquipSlot, ItemId>>): boolean {
    return Object.values(equipped).includes(itemId);
}

// =============================================================================
// ITEM CARD
// =============================================================================

interface ItemCardProps {
    readonly item: InventoryItem;
    readonly isEquipped: boolean;
    readonly isSelected: boolean;
    readonly onSelect: () => void;
}

const ItemCard: React.FC<ItemCardProps> = ({ item, isEquipped, isSelected, onSelect }) => {
    return (
        <Card
            variant={isSelected ? 'elevated' : 'default'}
            selected={isSelected}
            onClick={onSelect}
        >
            <div data-component="item-card" data-type={item.itemType}>
                <span data-label="id">{item.itemId}</span>
                <Badge variant="mode">{getItemTypeLabel(item.itemType)}</Badge>
                {isEquipped && <Badge variant="status">EQUIPPED</Badge>}
            </div>
        </Card>
    );
};

// =============================================================================
// SELECTED ITEM PANEL
// =============================================================================

interface SelectedItemPanelProps {
    readonly item: InventoryItem | undefined;
    readonly isEquipped: boolean;
}

const SelectedItemPanel: React.FC<SelectedItemPanelProps> = ({ item, isEquipped }) => {
    if (!item) {
        return (
            <div data-component="selected-item-panel" data-empty="true">
                <p>Select an item to view details</p>
            </div>
        );
    }

    return (
        <div data-component="selected-item-panel">
            <h3>{item.itemId}</h3>
            <p data-label="type">{getItemTypeLabel(item.itemType)}</p>
            <p data-label="source">Acquired: {item.source}</p>
            <p data-label="date">Owned since: {new Date(item.ownedAt).toLocaleDateString()}</p>
            {isEquipped && <Badge variant="status">CURRENTLY EQUIPPED</Badge>}
        </div>
    );
};

// =============================================================================
// INVENTORY SCREEN
// =============================================================================

export const InventoryScreen: React.FC<InventoryScreenProps> = ({ inventory, equipped }) => {
    const [selectedId, setSelectedId] = useState<ItemId | null>(null);
    const selectedItem = inventory.find(i => i.itemId === selectedId);

    const characters = inventory.filter(i => i.itemType === 'character');
    const weapons = inventory.filter(i => i.itemType === 'weapon');
    const cosmetics = inventory.filter(i => i.itemType === 'cosmetic');

    const renderGrid = (items: readonly InventoryItem[], label: string) => (
        <div data-component="item-section">
            <h3>{label} ({items.length})</h3>
            <div data-component="item-grid">
                {items.map(item => (
                    <ItemCard
                        key={item.itemId}
                        item={item}
                        isEquipped={isEquipped(item.itemId, equipped)}
                        isSelected={item.itemId === selectedId}
                        onSelect={() => setSelectedId(item.itemId)}
                    />
                ))}
            </div>
        </div>
    );

    return (
        <div data-screen="inventory">
            <h2>Inventory</h2>
            <p>Total items: {inventory.length}</p>

            <div data-component="inventory-layout">
                {/* Item grids */}
                <div data-component="item-sections">
                    {characters.length > 0 && renderGrid(characters, 'Characters')}
                    {weapons.length > 0 && renderGrid(weapons, 'Weapons')}
                    {cosmetics.length > 0 && renderGrid(cosmetics, 'Cosmetics')}
                </div>

                {/* Selected item panel */}
                <SelectedItemPanel
                    item={selectedItem}
                    isEquipped={selectedItem ? isEquipped(selectedItem.itemId, equipped) : false}
                />
            </div>
        </div>
    );
};

export default InventoryScreen;
