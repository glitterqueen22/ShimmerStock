/**
 * Ambient type declarations for Bun's cache-busting query-param import syntax.
 * Bun allows `import('module.js?cache-key')` to force fresh module evaluation.
 * TypeScript does not natively understand the `?param` suffix, so we declare
 * the known patterns here.
 */

// ShopifyProvider with query params (cache-busting for test isolation)
declare module '../server/providers/shopify.js?*' {
  import ShopifyProvider from '../server/providers/shopify.js';
  export { ShopifyProvider as default };
}

// Shopify gateway with query params (cache-busting for test isolation)
declare module '../server/providers/shopify-gateway.js?*' {
  export { gatewayFetch, gatewayGraphQL, GatewayReadOnlyError } from '../server/providers/shopify-gateway.js';
}

// Registry with query params
declare module '../server/providers/registry.js?*' {
  export { initRegistry, getProvider } from '../server/providers/registry.js';
}

// Shopify OAuth routes with query params (cache-busting for test isolation)
declare module '../server/shopify-oauth-routes.js?*' {
  export { verifyGrantedScopes, canonicalizeShopDomain, mountShopifyOauthRoutes } from '../server/shopify-oauth-routes.js';
}

// Shopify core module with query params (cache-busting for test isolation)
declare module '../server/shopify.js?*' {
  export { isConfigured, canWrite, getSyncMode, fetchOrders, fetchProducts, getInventoryInfo, updateInventory } from '../server/shopify.js';
}

declare module '*.css';
