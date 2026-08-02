/**
 * Shopify adapter implementing the CommerceProvider contract.
 *
 * Wraps Shopify Admin REST API (2024-01) behind a standardised interface so
 * route code never touches Shopify-specific shapes — only ProviderOrder,
 * ProviderProduct, etc.
 *
 * Supports two modes:
 *   - Singleton (legacy): reads from env vars (SHOPIFY_STORE_DOMAIN, SHOPIFY_API_TOKEN)
 *   - Multi-tenant: accepts per-business credentials (shopDomain, accessToken)
 *
 * Environment variables (fallback when no business credentials):
 *   SHOPIFY_STORE_DOMAIN — default "glitzyglitterexpress.com"
 *   SHOPIFY_API_TOKEN    — the access token (absent → not configured)
 *   SHOPIFY_SYNC_MODE    — "readonly" (default) or "full"
 */

import CommerceProvider from "./interface.js";
import { decryptToken } from "../crypto-utils.js";

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || "glitzyglitterexpress.com";
const API_TOKEN = process.env.SHOPIFY_API_TOKEN || "";
const API_VERSION = "2024-01";

// ── Low-level Shopify HTTP helpers ─────────────────────────────────────────

function makeBaseUrl(shopDomain) {
  return `https://${shopDomain}/admin/api/${API_VERSION}`;
}

function makeHeaders(accessToken) {
  return {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type": "application/json",
  };
}

async function shopifyGet(shopDomain, accessToken, path) {
  const url = `${makeBaseUrl(shopDomain)}${path}`;
  console.log(`[shopify] GET ${url}`);
  const res = await fetch(url, { headers: makeHeaders(accessToken) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify GET ${path} failed (${res.status}): ${body}`);
  }
  return res.json();
}

async function shopifyPost(shopDomain, accessToken, path, body) {
  const url = `${makeBaseUrl(shopDomain)}${path}`;
  console.log(`[shopify] POST ${url}`);
  const res = await fetch(url, {
    method: "POST",
    headers: makeHeaders(accessToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify POST ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ── Shopify adapter class ──────────────────────────────────────────────────

export default class ShopifyProvider extends CommerceProvider {
  /**
   * @param {Object} [options]
   * @param {string} [options.shopDomain] — per-business shop domain (e.g. "mystore.myshopify.com")
   * @param {string} [options.accessToken] — per-business decrypted access token
   * @param {string} [options.syncMode] — "readonly" or "full"
   */
  constructor(options = {}) {
    super();
    this._shopDomain = options.shopDomain || STORE_DOMAIN;
    this._accessToken = options.accessToken || API_TOKEN;

    // _isMultiTenant must be set before _configured uses it.
    this._isMultiTenant = Boolean(options.shopDomain && options.accessToken);

    // Reject tokens that are clearly not Shopify Admin API tokens.
    // Shopify Admin API tokens start with "shpat_" or "shpca_".
    // "atkn_" tokens are NOT Admin API tokens — they're short-lived checkout tokens or similar.
    const token = this._accessToken || "";
    const looksValid = Boolean(token && (token.startsWith("shpat_") || token.startsWith("shpca_")));
    this._configured = Boolean(this._isMultiTenant ? this._accessToken : looksValid);

    // SHOPIFY_READ_ONLY=true permanently locks the provider to read-only regardless
    // of any other setting.  Fix precedence: wrap the ternary so that a falsy
    // options.syncMode (e.g. undefined) doesn't short-circuit incorrectly.
    const readOnlyLocked = process.env.SHOPIFY_READ_ONLY === "true";
    const envMode = (!readOnlyLocked && process.env.SHOPIFY_SYNC_MODE === "full") ? "full" : "readonly";
    this._mode = readOnlyLocked ? "readonly" : (options.syncMode || envMode);
  }

  // ── Status ────────────────────────────────────────────────────────────

  /** @returns {import("./interface.js").ProviderStatus} */
  getStatus() {
    return {
      configured: this._configured,
      mode: this._mode,
      canWrite: this._configured && this._mode === "full",
      ...(this._isMultiTenant && {
        shopDomain: this._shopDomain,
      }),
    };
  }

  /** @param {"readonly"|"full"} mode */
  async setMode(mode) {
    // SHOPIFY_READ_ONLY=true is an immutable server-level override — never elevate to "full".
    if (process.env.SHOPIFY_READ_ONLY === "true" && mode === "full") {
      console.warn("[shopify] setMode('full') rejected — SHOPIFY_READ_ONLY is set");
      return;
    }
    this._mode = mode;
    // Do NOT mutate process.env.SHOPIFY_SYNC_MODE here: that is a shared global that
    // would leak one tenant's mode change into every other ShopifyProvider instance.
    console.log(`[shopify] Sync mode set to: ${mode}`);
  }

  // ── fetchOrders ───────────────────────────────────────────────────────

  /** @returns {Promise<import("./interface.js").ProviderOrder[]>} */
  async fetchOrders() {
    if (!this._configured) {
      throw new Error("Shopify is not configured — connect via OAuth or set SHOPIFY_API_TOKEN");
    }

    const data = await shopifyGet(this._shopDomain, this._accessToken, "/orders.json?status=open&limit=250");
    const orders = data.orders || [];

    return orders.map((order) => ({
      orderId: String(order.id),
      orderNumber: order.order_number || order.id,
      customerName: order.customer
        ? `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim() || order.customer.email
        : "Unknown",
      lineItems: (order.line_items || []).map((item) => ({
        variantId: item.variant_id,
        sku: item.sku || "",
        title: item.title || "",
        variantTitle: item.variant_title || "",
        quantity: item.quantity || 0,
        fulfillableQuantity: item.fulfillable_quantity ?? item.quantity,
      })),
    }));
  }

  // ── fetchProducts ─────────────────────────────────────────────────────

  /** @returns {Promise<import("./interface.js").ProviderProduct[]>} */
  async fetchProducts() {
    if (!this._configured) {
      throw new Error("Shopify is not configured — connect via OAuth or set SHOPIFY_API_TOKEN");
    }

    const data = await shopifyGet(this._shopDomain, this._accessToken, "/products.json?limit=250");
    const products = data.products || [];

    return products.map((p) => ({
      productId: String(p.id),
      title: p.title || "",
      variants: (p.variants || []).map((v) => ({
        variantId: v.id,
        sku: v.sku || "",
        barcode: v.barcode || "",
        title: v.title || "",
        inventoryItemId: v.inventory_item_id,
        inventoryQuantity: v.inventory_quantity || 0,
      })),
    }));
  }

  // ── pushInventory ─────────────────────────────────────────────────────

  async pushInventory(sku, variantId, newStock) {
    if (!this._configured) {
      console.log(
        `[shopify] Skipping inventory push (not configured): sku=${sku}, variant=${variantId}, qty=${newStock}`
      );
      return { success: false, error: "Shopify not configured" };
    }

    // Block all write mutations in read-only mode — before any network call.
    if (this._mode !== "full") {
      console.log(
        `[shopify] Read-only mode — inventory push blocked: sku=${sku}, variant=${variantId}, qty=${newStock}`
      );
      return { success: false, error: "Shopify is in read-only mode — inventory push blocked" };
    }

    try {
      const variant = await shopifyGet(this._shopDomain, this._accessToken, `/variants/${variantId}.json`);
      const inventoryItemId = variant.variant?.inventory_item_id;
      if (!inventoryItemId) {
        console.warn(`[shopify] No inventory_item_id for variant ${variantId}`);
        return { success: false, error: `No inventory_item_id for variant ${variantId}` };
      }

      const locations = await shopifyGet(this._shopDomain, this._accessToken, "/locations.json");
      const firstLocation = locations.locations?.[0];
      if (!firstLocation) {
        console.warn("[shopify] No locations found");
        return { success: false, error: "No locations found" };
      }

      await shopifyPost(this._shopDomain, this._accessToken, "/inventory_levels/set.json", {
        location_id: firstLocation.id,
        inventory_item_id: inventoryItemId,
        available: newStock,
      });

      return { success: true };
    } catch (err) {
      console.error(`[shopify] pushInventory failed for variant ${variantId}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // ── Static factory: create from DB credentials ─────────────────────────

  /**
   * Create a ShopifyProvider from per-business credentials stored in the database.
   *
   * @param {import("bun:sqlite").Database} db
   * @param {number} businessId
   * @returns {ShopifyProvider|null} — null if no credentials found
   */
  static fromBusinessId(db, businessId) {
    const creds = db
      .query(
        `SELECT shop_domain, access_token_encrypted, sync_status, sync_mode
         FROM provider_credentials
         WHERE business_id = ? AND provider = 'shopify' AND is_active = 1`
      )
      .get(businessId);

    if (!creds || !creds.access_token_encrypted) return null;

    let accessToken;
    try {
      accessToken = decryptToken(creds.access_token_encrypted);
    } catch (err) {
      console.error(`[shopify] Failed to decrypt token for business ${businessId}:`, err.message);
      return null;
    }

    // Use DB-stored sync_mode if available, otherwise fall back to env var
    const syncMode = creds.sync_mode || (process.env.SHOPIFY_SYNC_MODE === "full" ? "full" : "readonly");

    return new ShopifyProvider({
      shopDomain: creds.shop_domain,
      accessToken,
      syncMode,
    });
  }
}
