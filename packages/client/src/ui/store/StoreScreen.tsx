/**
 * StoreScreen - Display purchasable items
 * 
 * Shows store catalog with featured item and grid.
 * Read-only: no wallet logic, no side effects.
 */

import React, { useState } from 'react';
import type { StoreItem, ItemId, ItemType } from '@snapshot/shared';
import { Badge } from '../primitives/Badge.js';
import { Card } from '../primitives/Card.js';
import { Button } from '../primitives/Button.js';

// =============================================================================
// TYPES
// =============================================================================

export interface StoreScreenProps {
    readonly storeItems: readonly StoreItem[];
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

function formatPrice(price: number, currency: string): string {
    return `${price} ${currency.toUpperCase()}`;
}

// =============================================================================
// STORE ITEM CARD
// =============================================================================

interface StoreItemCardProps {
    readonly item: StoreItem;
    readonly isSelected: boolean;
    readonly onSelect: () => void;
}

const StoreItemCard: React.FC<StoreItemCardProps> = ({ item, isSelected, onSelect }) => {
    return (
        <Card
            variant={isSelected ? 'elevated' : 'default'}
            selected={isSelected}
            onClick={onSelect}
        >
            <div data-component="store-item-card" data-type={item.itemType} data-available={item.available}>
                <span data-label="name">{item.name}</span>
                <Badge variant="mode">{getItemTypeLabel(item.itemType)}</Badge>
                <span data-label="price">{formatPrice(item.price, item.currency)}</span>
                {!item.available && <Badge variant="status">SOLD OUT</Badge>}
                {item.limitedQuantity && <Badge variant="wager">LIMITED</Badge>}
            </div>
        </Card>
    );
};

// =============================================================================
// FEATURED ITEM
// =============================================================================

interface FeaturedItemProps {
    readonly item: StoreItem | undefined;
}

const FeaturedItem: React.FC<FeaturedItemProps> = ({ item }) => {
    if (!item) {
        return (
            <div data-component="featured-item" data-empty="true">
                <p>No featured item</p>
            </div>
        );
    }

    const handleBuy = () => {
        console.log('[StoreScreen] Buy clicked (disabled):', item.itemId);
    };

    return (
        <div data-component="featured-item">
            <h3>{item.name}</h3>
            <p data-label="description">{item.description}</p>
            <Badge variant="mode">{getItemTypeLabel(item.itemType)}</Badge>
            <p data-label="price">{formatPrice(item.price, item.currency)}</p>
            {item.limitedQuantity && (
                <p data-label="limited">Limited: {item.limitedQuantity} available</p>
            )}
            <Button variant="primary" onClick={handleBuy} disabled>
                BUY
            </Button>
        </div>
    );
};

// =============================================================================
// STORE SCREEN
// =============================================================================

export const StoreScreen: React.FC<StoreScreenProps> = ({ storeItems }) => {
    const [selectedId, setSelectedId] = useState<ItemId | null>(null);

    const availableItems = storeItems.filter(i => i.available);
    const selectedItem = storeItems.find(i => i.itemId === selectedId);
    const featuredItem = selectedItem ?? availableItems[0];

    const characters = availableItems.filter(i => i.itemType === 'character');
    const weapons = availableItems.filter(i => i.itemType === 'weapon');
    const cosmetics = availableItems.filter(i => i.itemType === 'cosmetic');

    const renderGrid = (items: readonly StoreItem[], label: string) => (
        <div data-component="store-section">
            <h3>{label} ({items.length})</h3>
            <div data-component="store-grid">
                {items.map(item => (
                    <StoreItemCard
                        key={item.itemId}
                        item={item}
                        isSelected={item.itemId === selectedId}
                        onSelect={() => setSelectedId(item.itemId)}
                    />
                ))}
            </div>
        </div>
    );

    return (
        <div data-screen="store">
            <h2>Store</h2>
            <p>{availableItems.length} items available</p>

            <div data-component="store-layout">
                {/* Featured item panel */}
                <FeaturedItem item={featuredItem} />

                {/* Item grids */}
                <div data-component="store-sections">
                    {characters.length > 0 && renderGrid(characters, 'Characters')}
                    {weapons.length > 0 && renderGrid(weapons, 'Weapons')}
                    {cosmetics.length > 0 && renderGrid(cosmetics, 'Cosmetics')}
                </div>
            </div>
        </div>
    );
};

export default StoreScreen;
