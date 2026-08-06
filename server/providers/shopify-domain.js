/**
 * Canonical Shopify shop-domain helpers.
 *
 * Rules:
 *  - Normalize with trim + lowercase
 *  - Accept only canonical "<shop>.myshopify.com" hostnames
 *  - Reject URLs, paths, query strings, ports, credentials, lookalike suffixes
 */

/**
 * Normalize a shop domain string.
 * @param {unknown} shop
 * @returns {string}
 */
export function canonicalizeShopDomain(shop) {
  if (typeof shop !== "string") return "";
  return shop.trim().toLowerCase();
}

/**
 * Validate canonical Shopify hostname format.
 * @param {unknown} shop
 * @returns {boolean}
 */
export function isCanonicalShopDomain(shop) {
  const normalized = canonicalizeShopDomain(shop);
  if (!normalized) return false;
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/.test(normalized);
}
