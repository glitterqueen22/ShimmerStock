/**
 * Commerce Adapter Registry — P4.2 Commerce Expansion
 *
 * Maps provider slugs to adapter modules. All adapters export:
 *   syncOrders(credentials) → ProviderOrder[]
 *   syncProducts(credentials) → ProviderProduct[]
 *   getOrder(credentials, orderId) → ProviderOrder|null
 *   getStatus() → ProviderStatus
 *
 * Shopify is special: it wraps the existing CommerceProvider from
 * server/providers/ for backward compatibility.
 */

import * as etsy from "./etsy.js";
import * as amazon from "./amazon.js";
import * as tiktokShop from "./tiktok-shop.js";
import * as woocommerce from "./woocommerce.js";
import * as faire from "./faire.js";

// ── Provider metadata ──────────────────────────────────────────────────

export const PROVIDERS = [
  {
    slug: "shopify",
    label: "Shopify",
    icon: "🛍️",
    description: "Online store & POS — real API connection",
    requiresSetup: true,
    isSimulated: false,
    maturityLabel: "Live",
    credentialFields: [
      { key: "storeDomain", label: "Store Domain", type: "text", placeholder: "mystore.myshopify.com" },
      { key: "apiToken", label: "API Token", type: "password", placeholder: "shpat_..." },
    ],
  },
  {
    slug: "etsy",
    label: "Etsy",
    icon: "🧶",
    description: "Handmade & vintage marketplace",
    requiresSetup: false,
    isSimulated: true,
    maturityLabel: "Planned",
    credentialFields: [
      { key: "shopId", label: "Shop ID", type: "text", placeholder: "12345678" },
      { key: "accessToken", label: "Access Token", type: "password", placeholder: "etsy_access_..." },
    ],
  },
  {
    slug: "amazon",
    label: "Amazon",
    icon: "📦",
    description: "FBA/FBM marketplace",
    requiresSetup: false,
    isSimulated: true,
    maturityLabel: "Planned",
    credentialFields: [
      { key: "sellerId", label: "Seller ID", type: "text", placeholder: "A1B2C3D4E5F6G" },
      { key: "accessToken", label: "Access Token", type: "password", placeholder: "Atza|..." },
    ],
  },
  {
    slug: "tiktok-shop",
    label: "TikTok Shop",
    icon: "🎵",
    description: "Social commerce marketplace",
    requiresSetup: false,
    isSimulated: true,
    maturityLabel: "Planned",
    credentialFields: [
      { key: "shopId", label: "Shop ID", type: "text", placeholder: "tt_shop_..." },
      { key: "accessToken", label: "Access Token", type: "password", placeholder: "tt_access_..." },
    ],
  },
  {
    slug: "woocommerce",
    label: "WooCommerce",
    icon: "🛒",
    description: "WordPress-based store",
    requiresSetup: false,
    isSimulated: true,
    maturityLabel: "Planned",
    credentialFields: [
      { key: "storeUrl", label: "Store URL", type: "text", placeholder: "https://mystore.com" },
      { key: "consumerKey", label: "Consumer Key", type: "text", placeholder: "ck_..." },
      { key: "consumerSecret", label: "Consumer Secret", type: "password", placeholder: "cs_..." },
    ],
  },
  {
    slug: "faire",
    label: "Faire",
    icon: "🏪",
    description: "Wholesale marketplace",
    requiresSetup: false,
    isSimulated: true,
    maturityLabel: "Planned",
    credentialFields: [
      { key: "brandId", label: "Brand ID", type: "text", placeholder: "br_..." },
      { key: "accessToken", label: "Access Token", type: "password", placeholder: "faire_token_..." },
    ],
  },
];

// ── Adapter lookup ─────────────────────────────────────────────────────

const ADAPTER_MAP = {
  etsy,
  amazon,
  "tiktok-shop": tiktokShop,
  woocommerce,
  faire,
};

/**
 * Get the adapter module for a given provider slug.
 * Shopify is handled separately via server/providers/registry.js.
 *
 * @param {string} provider
 * @returns {Object|null} adapter module or null if not found
 */
export function getAdapter(provider) {
  return ADAPTER_MAP[provider] || null;
}

/**
 * Get provider metadata by slug.
 *
 * @param {string} slug
 * @returns {Object|null}
 */
export function getProviderMeta(slug) {
  return PROVIDERS.find((p) => p.slug === slug) || null;
}

/**
 * List all available providers.
 *
 * @returns {Array}
 */
export function listProviders() {
  return PROVIDERS;
}

/**
 * Get the status of a simulated provider.
 *
 * @param {string} provider
 * @returns {Object|null}
 */
export function getProviderStatus(provider) {
  const adapter = getAdapter(provider);
  if (!adapter) return null;
  return adapter.getStatus();
}
