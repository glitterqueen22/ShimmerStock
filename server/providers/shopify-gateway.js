/**
 * Centralized Shopify Admin API gateway.
 *
 * Every Shopify Admin REST and GraphQL request from ShimmerStock must pass
 * through this module.  In read-only mode the gateway blocks write operations
 * BEFORE any network call is made:
 *
 *   REST:
 *     GET / HEAD  — allowed (reads)
 *     POST / PUT / PATCH / DELETE — blocked
 *
 *   GraphQL:
 *     query       — allowed
 *     mutation    — blocked (in read-only mode)
 *     subscription — always blocked (in all modes, pending separate milestone)
 *     ambiguous / unclassified — blocked (fail closed)
 *
 * Logs never include the access token or authorization header values.
 *
 * Usage:
 *   import { gatewayFetch } from "./shopify-gateway.js";
 *
 *   // GET — allowed in read-only mode
 *   const data = await gatewayFetch(mode, shopDomain, accessToken, "GET", "/products.json");
 *
 *   // POST — blocked in read-only mode
 *   const data = await gatewayFetch(mode, shopDomain, accessToken, "POST", "/inventory_levels/set.json", body);
 *
 *   // GraphQL
 *   const data = await gatewayGraphQL(mode, shopDomain, accessToken, `query { shop { name } }`);
 */

import { canonicalizeShopDomain, isCanonicalShopDomain } from "./shopify-domain.js";

/** Canonical Shopify Admin API version for all requests from this application. */
export const SHOPIFY_API_VERSION = "2026-07";

// Internal alias kept private — all call sites below use the exported constant.
const API_VERSION = SHOPIFY_API_VERSION;

// ── Write-method classification ────────────────────────────────────────────

const REST_WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Classify a GraphQL document string.
 *
 * Returns "query", "mutation", "subscription", or "unknown".
 * Leading whitespace and block comments are stripped before classification.
 * An unrecognised or ambiguous document is classified as "unknown".
 *
 * @param {string} document
 * @returns {"query"|"mutation"|"subscription"|"unknown"}
 */
export function classifyGraphQLDocument(document) {
  if (typeof document !== "string" || !document.trim()) return "unknown";

  // Strip leading block comments (/* ... */) and line comments (# ...)
  const stripped = document
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/#[^\n]*/g, "")
    .trim();

  // A document starting with "{" is a shorthand query
  if (stripped.startsWith("{")) return "query";

  // Named operation: extract the first keyword
  const match = stripped.match(/^(query|mutation|subscription)\b/i);
  if (!match) return "unknown";
  return match[1].toLowerCase();
}

// ── Core gateway ──────────────────────────────────────────────────────────

/**
 * Make a Shopify Admin REST API call through the read-only gateway.
 *
 * @param {"readonly"|"full"} mode — current provider mode
 * @param {string} shopDomain
 * @param {string} accessToken
 * @param {string} method — "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"
 * @param {string} path — relative path, e.g. "/products.json"
 * @param {object} [body] — request body for write methods (ignored in read-only mode)
 * @returns {Promise<any>}
 */
export async function gatewayFetch(mode, shopDomain, accessToken, method, path, body) {
  const upperMethod = (method || "GET").toUpperCase();
  const normalizedShopDomain = canonicalizeShopDomain(shopDomain);

  // Defense-in-depth: validate shopDomain at the gateway boundary before any URL construction.
  // Callers are responsible for validating credentials, but the gateway enforces this redundantly.
  if (!isCanonicalShopDomain(normalizedShopDomain)) {
    throw new Error(`[shopify-gateway] Rejected request with invalid shop domain`);
  }

  // Block write methods in read-only mode — before any network call
  if (mode !== "full" && REST_WRITE_METHODS.has(upperMethod)) {
    const msg = `[shopify-gateway] BLOCKED ${upperMethod} ${path} — provider is in read-only mode`;
    console.warn(msg);
    throw new GatewayReadOnlyError(msg);
  }

  const url = `https://${normalizedShopDomain}/admin/api/${API_VERSION}${path}`;
  // Log without the access token
  console.log(`[shopify-gateway] ${upperMethod} ${normalizedShopDomain}${path}`);

  const options = {
    method: upperMethod,
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  };

  if (body !== undefined && REST_WRITE_METHODS.has(upperMethod)) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);

  if (!res.ok) {
    console.warn(`[shopify-gateway] ${upperMethod} ${normalizedShopDomain}${path} failed (${res.status})`);
    throw new Error(`Shopify ${upperMethod} ${path} failed (${res.status})`);
  }

  // HEAD responses and no-content responses (204, 205) have no body — do not call res.json().
  if (upperMethod === "HEAD" || res.status === 204 || res.status === 205) {
    return null;
  }

  return res.json();
}

/**
 * Make a Shopify Admin GraphQL API call through the read-only gateway.
 *
 * @param {"readonly"|"full"} mode — current provider mode
 * @param {string} shopDomain
 * @param {string} accessToken
 * @param {string} document — GraphQL document string
 * @param {object} [variables]
 * @returns {Promise<any>}
 */
export async function gatewayGraphQL(mode, shopDomain, accessToken, document, variables) {
  const normalizedShopDomain = canonicalizeShopDomain(shopDomain);
  // Defense-in-depth: validate shopDomain at the gateway boundary before any URL construction.
  if (!isCanonicalShopDomain(normalizedShopDomain)) {
    throw new Error(`[shopify-gateway] Rejected GraphQL request with invalid shop domain`);
  }

  const docType = classifyGraphQLDocument(document);

  // Block subscription operations in ALL modes — subscriptions are not supported
  // until a separate milestone explicitly enables them.
  if (docType === "subscription") {
    const msg = "[shopify-gateway] BLOCKED GraphQL subscription — subscriptions are not supported";
    console.warn(msg);
    throw new GatewayReadOnlyError(msg);
  }

  // In read-only mode, only "query" documents are allowed.
  // mutation and unknown all fail closed.
  if (mode !== "full" && docType !== "query") {
    const msg = `[shopify-gateway] BLOCKED GraphQL ${docType} — provider is in read-only mode`;
    console.warn(msg);
    throw new GatewayReadOnlyError(msg);
  }

  // Always block unknown/ambiguous documents regardless of mode
  if (docType === "unknown") {
    const msg = "[shopify-gateway] BLOCKED unclassified GraphQL document — failing closed";
    console.warn(msg);
    throw new GatewayReadOnlyError(msg);
  }

  const url = `https://${normalizedShopDomain}/admin/api/${API_VERSION}/graphql.json`;
  console.log(`[shopify-gateway] GraphQL ${docType} ${normalizedShopDomain}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: document, variables }),
  });

  if (!res.ok) {
    console.warn(`[shopify-gateway] GraphQL ${normalizedShopDomain} failed (${res.status})`);
    throw new Error(`Shopify GraphQL failed (${res.status})`);
  }

  return res.json();
}

const PRODUCT_VARIANTS_BULK_UPDATE = `
  mutation NoviSkuBarcodeUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: false) {
      productVariants { id barcode inventoryItem { id sku } }
      userErrors { field message code }
    }
  }
`;

const PRODUCT_VARIANTS_VERIFY = `
  query NoviSkuBarcodeVerify($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant { id barcode inventoryItem { id sku } }
    }
  }
`;

function requireShopifyGid(value, type) {
  const normalized = String(value || "");
  if (!new RegExp(`^gid://shopify/${type}/[0-9]+$`).test(normalized)) {
    throw new Error(`[shopify-gateway] Invalid ${type} identifier`);
  }
  return normalized;
}

/**
 * The only Shopify mutation allowed by SKU & Label Studio. Callers provide
 * structured identifiers and attributes, never a GraphQL document.
 */
export async function gatewayProductVariantsBulkUpdate(shopDomain, accessToken, productId, variants) {
  const normalizedShopDomain = canonicalizeShopDomain(shopDomain);
  if (!isCanonicalShopDomain(normalizedShopDomain)) throw new Error("[shopify-gateway] Invalid shop domain");
  const safeProductId = requireShopifyGid(productId, "Product");
  if (!Array.isArray(variants) || variants.length === 0 || variants.length > 100) {
    throw new Error("[shopify-gateway] Variant update batch must contain 1-100 variants");
  }
  const safeVariants = variants.map((variant) => {
    const input = { id: requireShopifyGid(variant.id, "ProductVariant") };
    if (variant.barcode !== undefined) input.barcode = variant.barcode === null ? null : String(variant.barcode);
    if (variant.sku !== undefined) input.inventoryItem = { sku: variant.sku === null ? "" : String(variant.sku) };
    if (input.barcode === undefined && input.inventoryItem === undefined) {
      throw new Error("[shopify-gateway] SKU or barcode update required");
    }
    return input;
  });
  const url = `https://${normalizedShopDomain}/admin/api/${API_VERSION}/graphql.json`;
  console.log(`[shopify-gateway] GraphQL approved productVariantsBulkUpdate ${normalizedShopDomain}`);
  const response = await fetch(url, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ query: PRODUCT_VARIANTS_BULK_UPDATE, variables: { productId: safeProductId, variants: safeVariants } }),
  });
  if (!response.ok) {
    console.warn(`[shopify-gateway] Approved variant update failed (${response.status})`);
    throw new Error(`Shopify variant update failed (${response.status})`);
  }
  return response.json();
}

export async function gatewayProductVariantsByIds(shopDomain, accessToken, variantIds) {
  if (!Array.isArray(variantIds) || variantIds.length === 0 || variantIds.length > 100) {
    throw new Error("[shopify-gateway] Variant verification batch must contain 1-100 variants");
  }
  const ids = variantIds.map(id => requireShopifyGid(id, "ProductVariant"));
  return gatewayGraphQL("readonly", shopDomain, accessToken, PRODUCT_VARIANTS_VERIFY, { ids });
}

// ── Error type ────────────────────────────────────────────────────────────

/**
 * Thrown when the gateway blocks an operation due to read-only mode.
 */
export class GatewayReadOnlyError extends Error {
  constructor(message) {
    super(message);
    this.name = "GatewayReadOnlyError";
  }
}
