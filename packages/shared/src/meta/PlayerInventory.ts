/**
 * Player Inventory
 * 
 * Tracks ownership of characters and weapons.
 * 
 * SCOPE: Ownership only. No stats, no rendering.
 */

// =============================================================================
// TYPES
// =============================================================================

export type PlayerId = string;
export type ItemId = string;

/** Item types that can be owned */
export type ItemType = 'character' | 'weapon';

/** How the item was acquired */
export type AcquisitionSource = 'purchase' | 'reward' | 'default' | 'gift';

/** Owned item record */
export interface OwnedItem {
    readonly itemId: ItemId;
    readonly itemType: ItemType;
    readonly ownedAt: number;
    readonly source: AcquisitionSource;
}

/** Inventory state for a player */
export interface InventoryState {
    readonly playerId: PlayerId;
    readonly items: ReadonlyMap<ItemId, OwnedItem>;
}

// =============================================================================
// PLAYER INVENTORY
// =============================================================================

/**
 * Manages item ownership for players.
 */
export class PlayerInventory {
    /** Map of playerId -> Map of itemId -> OwnedItem */
    private inventories = new Map<PlayerId, Map<ItemId, OwnedItem>>();

    // =========================================================================
    // OWNERSHIP
    // =========================================================================

    /** Check if player owns an item */
    owns(playerId: PlayerId, itemId: ItemId): boolean {
        return this.inventories.get(playerId)?.has(itemId) ?? false;
    }

    /** Check if player owns all items */
    ownsAll(playerId: PlayerId, itemIds: ItemId[]): boolean {
        return itemIds.every(id => this.owns(playerId, id));
    }

    /** Grant an item to a player */
    grant(
        playerId: PlayerId,
        itemId: ItemId,
        itemType: ItemType,
        source: AcquisitionSource
    ): OwnedItem {
        if (!this.inventories.has(playerId)) {
            this.inventories.set(playerId, new Map());
        }

        const item: OwnedItem = {
            itemId,
            itemType,
            ownedAt: Date.now(),
            source,
        };

        this.inventories.get(playerId)!.set(itemId, item);
        return item;
    }

    /** Revoke an item from a player */
    revoke(playerId: PlayerId, itemId: ItemId): boolean {
        return this.inventories.get(playerId)?.delete(itemId) ?? false;
    }

    // =========================================================================
    // QUERIES
    // =========================================================================

    /** Get all owned items for a player */
    getOwned(playerId: PlayerId): OwnedItem[] {
        const inventory = this.inventories.get(playerId);
        if (!inventory) return [];
        return Array.from(inventory.values());
    }

    /** Get owned items by type */
    getOwnedByType(playerId: PlayerId, itemType: ItemType): OwnedItem[] {
        return this.getOwned(playerId).filter(item => item.itemType === itemType);
    }

    /** Get owned characters */
    getOwnedCharacters(playerId: PlayerId): ItemId[] {
        return this.getOwnedByType(playerId, 'character').map(i => i.itemId);
    }

    /** Get owned weapons */
    getOwnedWeapons(playerId: PlayerId): ItemId[] {
        return this.getOwnedByType(playerId, 'weapon').map(i => i.itemId);
    }

    /** Get inventory state snapshot */
    getState(playerId: PlayerId): InventoryState {
        return {
            playerId,
            items: new Map(this.inventories.get(playerId) ?? []),
        };
    }

    // =========================================================================
    // BULK OPERATIONS
    // =========================================================================

    /** Grant default items to a new player */
    grantDefaults(playerId: PlayerId, defaults: { itemId: ItemId; itemType: ItemType }[]): void {
        for (const { itemId, itemType } of defaults) {
            if (!this.owns(playerId, itemId)) {
                this.grant(playerId, itemId, itemType, 'default');
            }
        }
    }

    /** Clear all items for a player */
    clear(playerId: PlayerId): void {
        this.inventories.delete(playerId);
    }
}
