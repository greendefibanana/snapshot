/**
 * Store Catalog
 * 
 * Manages store items and purchase flow.
 * 
 * SCOPE: Catalog and hooks only. No blockchain execution.
 */

import type { PlayerId, ItemId, ItemType } from './PlayerInventory.js';
import { PlayerInventory } from './PlayerInventory.js';

// =============================================================================
// TYPES
// =============================================================================

export type CurrencyId = string;
export type StoreItemId = string;

/** Store item definition */
export interface StoreItem {
    readonly itemId: ItemId;
    readonly itemType: ItemType;
    readonly price: number;
    readonly currency: CurrencyId;
    readonly available: boolean;
    readonly limitedQuantity?: number;
    readonly expiresAt?: number;
}

/** Purchase result */
export interface PurchaseResult {
    readonly success: boolean;
    readonly itemId?: ItemId;
    readonly error?: string;
}

/** Purchase hooks for external integration */
export interface PurchaseHooks {
    /** Check if player has sufficient balance */
    checkBalance(playerId: PlayerId, amount: number, currency: CurrencyId): Promise<boolean>;

    /** Deduct balance from player */
    deductBalance(playerId: PlayerId, amount: number, currency: CurrencyId): Promise<boolean>;

    /** Called after successful purchase */
    onPurchaseComplete(playerId: PlayerId, itemId: ItemId, price: number, currency: CurrencyId): Promise<void>;
}

// =============================================================================
// STORE CATALOG
// =============================================================================

/**
 * Manages store items and purchases.
 */
export class StoreCatalog {
    private items = new Map<ItemId, StoreItem>();
    private purchaseCounts = new Map<ItemId, number>();

    constructor(
        private inventory: PlayerInventory,
        private hooks: PurchaseHooks
    ) { }

    // =========================================================================
    // CATALOG MANAGEMENT
    // =========================================================================

    /** Register a store item */
    registerItem(item: StoreItem): void {
        this.items.set(item.itemId, item);
    }

    /** Register multiple items */
    registerItems(items: StoreItem[]): void {
        for (const item of items) {
            this.registerItem(item);
        }
    }

    /** Remove an item from store */
    removeItem(itemId: ItemId): boolean {
        return this.items.delete(itemId);
    }

    /** Update item availability */
    setAvailable(itemId: ItemId, available: boolean): void {
        const item = this.items.get(itemId);
        if (item) {
            this.items.set(itemId, { ...item, available });
        }
    }

    // =========================================================================
    // QUERIES
    // =========================================================================

    /** Get a store item */
    getItem(itemId: ItemId): StoreItem | undefined {
        return this.items.get(itemId);
    }

    /** List all items */
    listItems(): StoreItem[] {
        return Array.from(this.items.values());
    }

    /** List available items */
    listAvailable(): StoreItem[] {
        const now = Date.now();
        return this.listItems().filter(item =>
            item.available &&
            (!item.expiresAt || item.expiresAt > now) &&
            (!item.limitedQuantity || (this.purchaseCounts.get(item.itemId) ?? 0) < item.limitedQuantity)
        );
    }

    /** List items by type */
    listByType(itemType: ItemType): StoreItem[] {
        return this.listAvailable().filter(item => item.itemType === itemType);
    }

    /** Check if player can purchase item */
    async canPurchase(playerId: PlayerId, itemId: ItemId): Promise<{
        canPurchase: boolean;
        reason?: string;
    }> {
        const item = this.items.get(itemId);

        if (!item) {
            return { canPurchase: false, reason: 'Item not found' };
        }

        if (!item.available) {
            return { canPurchase: false, reason: 'Item not available' };
        }

        if (item.expiresAt && Date.now() > item.expiresAt) {
            return { canPurchase: false, reason: 'Item expired' };
        }

        if (item.limitedQuantity) {
            const purchased = this.purchaseCounts.get(itemId) ?? 0;
            if (purchased >= item.limitedQuantity) {
                return { canPurchase: false, reason: 'Sold out' };
            }
        }

        if (this.inventory.owns(playerId, itemId)) {
            return { canPurchase: false, reason: 'Already owned' };
        }

        const hasBalance = await this.hooks.checkBalance(playerId, item.price, item.currency);
        if (!hasBalance) {
            return { canPurchase: false, reason: 'Insufficient balance' };
        }

        return { canPurchase: true };
    }

    // =========================================================================
    // PURCHASE FLOW
    // =========================================================================

    /** Purchase an item */
    async purchase(playerId: PlayerId, itemId: ItemId): Promise<PurchaseResult> {
        // Validate purchase
        const canPurchase = await this.canPurchase(playerId, itemId);
        if (!canPurchase.canPurchase) {
            return { success: false, error: canPurchase.reason };
        }

        const item = this.items.get(itemId)!;

        // Deduct balance
        const deducted = await this.hooks.deductBalance(playerId, item.price, item.currency);
        if (!deducted) {
            return { success: false, error: 'Failed to deduct balance' };
        }

        // Grant item
        this.inventory.grant(playerId, itemId, item.itemType, 'purchase');

        // Track purchase count
        const currentCount = this.purchaseCounts.get(itemId) ?? 0;
        this.purchaseCounts.set(itemId, currentCount + 1);

        // Notify hooks
        await this.hooks.onPurchaseComplete(playerId, itemId, item.price, item.currency);

        return { success: true, itemId };
    }
}

// =============================================================================
// PLACEHOLDER HOOKS
// =============================================================================

/** Placeholder hooks for testing */
export const placeholderPurchaseHooks: PurchaseHooks = {
    async checkBalance(_playerId, _amount, _currency) {
        console.log('[Store] Placeholder: checking balance');
        return true;
    },

    async deductBalance(_playerId, _amount, _currency) {
        console.log('[Store] Placeholder: deducting balance');
        return true;
    },

    async onPurchaseComplete(playerId, itemId, price, currency) {
        console.log(`[Store] Purchase complete: ${playerId} bought ${itemId} for ${price} ${currency}`);
    },
};
