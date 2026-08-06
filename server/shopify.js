/**
 * Backward-compatible re-export from the new CommerceProvider abstraction.
 *
 * All Shopify logic now lives in server/providers/shopify.js — the adapter
 * implements the CommerceProvider contract.  This file exists for backward
 * compatibility; prefer `getProvider()` from server/providers/registry.js for
 * new code.
 *
 * Legacy direct API calls here are routed through the centralized gateway
 * (server/providers/shopify-gateway.js) to enforce read-only mode.
 *
 * @deprecated Use `getProvider(businessId)` from "./providers/registry.js" instead.
 */

import ShopifyProvider from "./providers/shopify.js";
import { gatewayFetch } from "./providers/shopify-gateway.js";
import { isCanonicalShopDomain } from "./providers/shopify-domain.js";

const _provider = new ShopifyProvider();
const _status = _provider.getStatus();

/** @deprecated */
export const isConfigured = _status.configured;

/** @deprecated */
export const canWrite = _status.canWrite;

/** @deprecated */
export function getSyncMode() {
  return _provider.getStatus().mode;
}

/**
 * @deprecated Returns provider-standardised shapes (camelCase fields).
 *            If you need the old snake_case shapes, update your code.
 */
export async function fetchOrders() {
  return _provider.fetchOrders();
}

/** @deprecated */
export async function fetchProducts() {
  return _provider.fetchProducts();
}

/**
 * @deprecated Use provider.pushInventory() instead.
 */
export async function getInventoryInfo(variantId) {
  // All calls routed through the centralized gateway — read-only mode enforced.
  const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || "";
  const API_TOKEN = process.env.SHOPIFY_API_TOKEN || "";
  const mode = _provider.getStatus().mode;

  if (!API_TOKEN || !isCanonicalShopDomain(STORE_DOMAIN)) return null;

  try {
    const variant = await gatewayFetch(mode, STORE_DOMAIN, API_TOKEN, "GET", `/variants/${variantId}.json`);
    const inventoryItemId = variant.variant?.inventory_item_id;
    if (!inventoryItemId) return null;

    const locations = await gatewayFetch(mode, STORE_DOMAIN, API_TOKEN, "GET", "/locations.json");
    const firstLocation = locations.locations?.[0];
    if (!firstLocation) return null;

    return { inventory_item_id: inventoryItemId, location_id: firstLocation.id };
  } catch {
    return null;
  }
}

/**
 * @deprecated Use provider.pushInventory() instead.
 */
export async function updateInventory(inventoryItemId, locationId, quantity) {
  const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || "";
  const API_TOKEN = process.env.SHOPIFY_API_TOKEN || "";
  const mode = _provider.getStatus().mode;

  if (!API_TOKEN || !isCanonicalShopDomain(STORE_DOMAIN)) {
    console.log(`[shopify] Skipping inventory update (not configured): item=${inventoryItemId}, qty=${quantity}`);
    return;
  }

  // All write calls routed through the centralized gateway — blocked in read-only mode.
  // Deprecated helper must fail closed without throwing to callers.
  try {
    await gatewayFetch(mode, STORE_DOMAIN, API_TOKEN, "POST", "/inventory_levels/set.json", {
      location_id: locationId,
      inventory_item_id: inventoryItemId,
      available: quantity,
    });
  } catch (err) {
    console.warn(`[shopify] Inventory update skipped: ${err?.message || "request blocked"}`);
  }
}
