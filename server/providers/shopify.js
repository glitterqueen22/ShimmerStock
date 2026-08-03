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
 *   SHOPIFY_STORE_DOMAIN       — default "glitzyglitterexpress.com"
 *   SHOPIFY_API_TOKEN          — the access token (absent → not configured)
 *   SHOPIFY_SYNC_MODE          — "readonly" (default) or "full"
 *   SHOPIFY_READ_ONLY          — "true" to permanently lock to read-only
 *   SHOPIFY_ALLOW_WRITE_MODE   — must be "true" to permit "full" mode; absent/false → always readonly
 */

import CommerceProvider from "./interface.js";
import { decryptToken } from "../crypto-utils.js";
import { gatewayFetch } from "./shopify-gateway.js";
import { canonicalizeShopDomain, isCanonicalShopDomain } from "./shopify-domain.js";

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN || "glitzyglitterexpress.com";
const API_TOKEN = process.env.SHOPIFY_API_TOKEN || "";

// ── Mode parsing ───────────────────────────────────────────────────────────

/**
 * Parse a raw mode value strictly.
 *
 * Rules (in priority order):
 *  1. If SHOPIFY_READ_ONLY=true  → always "readonly"
 *  2. If SHOPIFY_ALLOW_WRITE_MODE is not "true" → always "readonly"
 *  3. If rawMode is the exact string "full" → "full"
 *  4. All other values (undefined, null, "", "FULL", "  full", invalid strings) → "readonly"
 *
 * This means:
 *  - Missing / malformed / conflicting / unapproved values → "readonly"
 *  - For P0, SHOPIFY_ALLOW_WRITE_MODE is never set to "true", so full mode
 *    is structurally impossible regardless of other settings.
 *
 * @param {string|undefined} rawMode
 * @returns {"readonly"|"full"}
 */
function parseMode(rawMode) {
  if (process.env.SHOPIFY_READ_ONLY === "true") return "readonly";
  if (process.env.SHOPIFY_ALLOW_WRITE_MODE !== "true") return "readonly";
  return rawMode === "full" ? "full" : "readonly";
}

function hasOwnOption(options, key) {
  return Object.prototype.hasOwnProperty.call(options, key);
}

// ── Shopify helpers (routed through centralized gateway) ──────────────────

async function shopifyGet(mode, shopDomain, accessToken, path) {
  return gatewayFetch(mode, shopDomain, accessToken, "GET", path);
}

async function shopifyPost(mode, shopDomain, accessToken, path, body) {
  return gatewayFetch(mode, shopDomain, accessToken, "POST", path, body);
}

// ── Shopify adapter class ──────────────────────────────────────────────────

export default class ShopifyProvider extends CommerceProvider {
  /**
   * @param {Object} [options]
   * @param {string} [options.shopDomain] — per-business shop domain (e.g. "mystore.myshopify.com")
   * @param {string} [options.accessToken] — per-business decrypted access token
   * @param {string} [options.syncMode] — "readonly" or "full" (strict; anything else → "readonly")
   */
  constructor(options = {}) {
    super();
    this._shopDomain = canonicalizeShopDomain(
      hasOwnOption(options, "shopDomain")
      ? (options.shopDomain ?? "")
      : STORE_DOMAIN
    );
    this._accessToken = hasOwnOption(options, "accessToken")
      ? (options.accessToken ?? "")
      : API_TOKEN;

    // _isMultiTenant must be set before _configured uses it.
    this._isMultiTenant = hasOwnOption(options, "shopDomain") || hasOwnOption(options, "accessToken");

    // Reject tokens that are clearly not Shopify Admin API tokens.
    // Shopify Admin API tokens start with "shpat_" or "shpca_".
    // "atkn_" tokens are NOT Admin API tokens — they're short-lived checkout tokens or similar.
    const token = this._accessToken || "";
    const looksValid = Boolean(token && (token.startsWith("shpat_") || token.startsWith("shpca_")));
    const hasValidShopDomain = isCanonicalShopDomain(this._shopDomain);
    this._configured = Boolean(hasValidShopDomain && looksValid);

    // Strict mode parsing — parseMode enforces all safety rules including
    // SHOPIFY_READ_ONLY and SHOPIFY_ALLOW_WRITE_MODE.
    const requestedMode = hasOwnOption(options, "syncMode")
      ? options.syncMode
      : process.env.SHOPIFY_SYNC_MODE;
    this._mode = parseMode(requestedMode);
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
    // Validate input strictly — only exact "readonly" or "full" accepted.
    const validated = parseMode(mode);
    if (validated !== mode) {
      console.warn(
        `[shopify] setMode('${mode}') rejected — invalid or disallowed mode (SHOPIFY_READ_ONLY=${process.env.SHOPIFY_READ_ONLY}, SHOPIFY_ALLOW_WRITE_MODE=${process.env.SHOPIFY_ALLOW_WRITE_MODE})`
      );
      return;
    }
    this._mode = validated;
    // Do NOT mutate process.env.SHOPIFY_SYNC_MODE here: that is a shared global that
    // would leak one tenant's mode change into every other ShopifyProvider instance.
    console.log(`[shopify] Sync mode set to: ${validated}`);
  }

  // ── fetchOrders ───────────────────────────────────────────────────────

  /** @returns {Promise<import("./interface.js").ProviderOrder[]>} */
  async fetchOrders() {
    if (!this._configured) {
      throw new Error("Shopify is not configured — connect via OAuth or set SHOPIFY_API_TOKEN");
    }

    const data = await shopifyGet(this._mode, this._shopDomain, this._accessToken, "/orders.json?status=open&limit=250");
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

    const data = await shopifyGet(this._mode, this._shopDomain, this._accessToken, "/products.json?limit=250");
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
      const variant = await shopifyGet(this._mode, this._shopDomain, this._accessToken, `/variants/${variantId}.json`);
      const inventoryItemId = variant.variant?.inventory_item_id;
      if (!inventoryItemId) {
        console.warn(`[shopify] No inventory_item_id for variant ${variantId}`);
        return { success: false, error: `No inventory_item_id for variant ${variantId}` };
      }

      const locations = await shopifyGet(this._mode, this._shopDomain, this._accessToken, "/locations.json");
      const firstLocation = locations.locations?.[0];
      if (!firstLocation) {
        console.warn("[shopify] No locations found");
        return { success: false, error: "No locations found" };
      }

      await shopifyPost(this._mode, this._shopDomain, this._accessToken, "/inventory_levels/set.json", {
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

    // Use DB-stored sync_mode if available.
    // parseMode will enforce SHOPIFY_READ_ONLY and SHOPIFY_ALLOW_WRITE_MODE rules.
    const syncMode = creds.sync_mode || process.env.SHOPIFY_SYNC_MODE;

    return new ShopifyProvider({
      shopDomain: creds.shop_domain,
      accessToken,
      syncMode,
    });
  }
}
