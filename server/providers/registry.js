/**
 * CommerceProvider registry.
 *
 * Supports both singleton (legacy env-var-based) and multi-tenant (per-business
 * DB credentials) Shopify providers.
 *
 * Routes call `getProvider(businessId, db)` for a fast, cached lookup.
 * When business credentials exist in the DB, a dedicated ShopifyProvider is
 * created; otherwise the singleton fallback (env vars) is used.
 */

import ShopifyProvider from "./shopify.js";

/** @type {import("./interface.js").default|null} */
let _singletonProvider = null;

/** @type {Map<number, import("./interface.js").default>} */
const _businessCache = new Map();

/**
 * Initialise the registry. Call once at server startup.
 */
export function initRegistry() {
  _singletonProvider = new ShopifyProvider();
  console.log("[registry] Singleton Shopify provider initialised");
}

/**
 * Return the CommerceProvider for a given business.
 *
 * If the business has OAuth credentials in provider_credentials, a dedicated
 * ShopifyProvider is created and cached. Otherwise the singleton (env-var-based)
 * provider is returned.
 *
 * @param {number} [businessId] — the business ID (required for multi-tenant)
 * @param {import("bun:sqlite").Database} [db] — database instance (required for multi-tenant)
 * @returns {import("./interface.js").default}
 */
export function getProvider(businessId, db) {
  // If no DB or businessId, return singleton
  if (!db || !businessId) {
    if (!_singletonProvider) {
      throw new Error(
        "Provider registry not initialised — call initRegistry() at startup"
      );
    }
    return _singletonProvider;
  }

  // Check cache first
  const cached = _businessCache.get(businessId);
  if (cached) return cached;

  // Try to create a multi-tenant provider from DB credentials
  const multiTenantProvider = ShopifyProvider.fromBusinessId(db, businessId);
  if (multiTenantProvider) {
    _businessCache.set(businessId, multiTenantProvider);
    console.log(`[registry] Multi-tenant Shopify provider initialised for business ${businessId}`);
    return multiTenantProvider;
  }

  // No credentials found for this business.
  // Do NOT fall back to the singleton — it may hold another tenant's or a global live credential.
  // Return an unconfigured provider so callers receive a clean "not connected" status.
  console.log(`[registry] No credentials for business ${businessId} — returning unconfigured provider`);
  return new ShopifyProvider({ shopDomain: "none", accessToken: "" });
}

/**
 * Invalidate the cached provider for a specific business.
 * Call this after credentials change (connect/disconnect).
 *
 * @param {number} businessId
 */
export function invalidateProviderCache(businessId) {
  _businessCache.delete(businessId);
  console.log(`[registry] Cache invalidated for business ${businessId}`);
}
