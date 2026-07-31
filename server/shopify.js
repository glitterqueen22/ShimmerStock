/**
 * Backward-compatible re-export from the new CommerceProvider abstraction.
 *
 * All Shopify logic now lives in server/providers/shopify.js — the adapter
 * implements the CommerceProvider contract.  This file exists for backward
 * compatibility; prefer `getProvider()` from server/providers/registry.js for
 * new code.
 *
 * @deprecated Use `getProvider(businessId)` from "./providers/registry.js" instead.
 */

import ShopifyProvider from "./providers/shopify.js";

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
  // This is now handled internally by pushInventory.
  // For backward compat, we make the same API calls the old code did.
  const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || "glitzyglitterexpress.com";
  const API_TOKEN = process.env.SHOPIFY_API_TOKEN || "";
  const API_VERSION = "2024-01";

  if (!API_TOKEN) return null;

  const baseUrl = `https://${STORE_DOMAIN}/admin/api/${API_VERSION}`;
  const headers = {
    "X-Shopify-Access-Token": API_TOKEN,
    "Content-Type": "application/json",
  };

  try {
    const variantRes = await fetch(`${baseUrl}/variants/${variantId}.json`, { headers });
    const variant = await variantRes.json();
    const inventoryItemId = variant.variant?.inventory_item_id;
    if (!inventoryItemId) return null;

    const locRes = await fetch(`${baseUrl}/locations.json`, { headers });
    const locations = await locRes.json();
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
  const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || "glitzyglitterexpress.com";
  const API_TOKEN = process.env.SHOPIFY_API_TOKEN || "";
  const API_VERSION = "2024-01";

  if (!API_TOKEN) {
    console.log(`[shopify] Skipping inventory update (not configured): item=${inventoryItemId}, qty=${quantity}`);
    return;
  }

  if (process.env.SHOPIFY_READ_ONLY === "true") {
    console.log(`[shopify] Read-only mode — skipping inventory push: item=${inventoryItemId}, qty=${quantity}`);
    return;
  }

  const url = `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/inventory_levels/set.json`;
  const headers = {
    "X-Shopify-Access-Token": API_TOKEN,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      location_id: locationId,
      inventory_item_id: inventoryItemId,
      available: quantity,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify POST /inventory_levels/set.json failed (${res.status}): ${text}`);
  }

  return res.json();
}
