/**
 * Shopify Initial Import Pipeline — Read-Only Pilot
 *
 * Implements an explicit one-shot import of:
 *   - products and variants (GraphQL with cursor pagination)
 *   - locations (GraphQL)
 *   - inventory levels by location (GraphQL)
 *   - orders across all accessible statuses (GraphQL with cursor pagination)
 *   - order line items
 *
 * All reads use the Shopify Admin GraphQL API (2026-07) via the centralized
 * gateway. No Shopify write operations are performed.
 *
 * Import state machine:
 *   DISCONNECTED → CONNECTED → IMPORT_PENDING → IMPORTING
 *     → SYNCED (success)
 *     → IMPORT_FAILED (error)
 *   Any state → RECONCILIATION_REQUIRED (discrepancy detected)
 *   Any state → TOKEN_REVOKED (401 from Shopify)
 *   Any state → CONNECTION_ERROR (network/config error)
 *
 * Business isolation: the credential's business_id MUST match the importing
 * business_id. Any mismatch is rejected before any Shopify call is made.
 *
 * Writing imported records into ShimmerStock's own database is allowed and
 * required. No request modifies Shopify.
 */

import { gatewayGraphQL } from "./providers/shopify-gateway.js";
import { decryptToken } from "./crypto-utils.js";
import { recordCatalogAudit } from "./sku-label-studio.js";

// ── Import state constants ────────────────────────────────────────────────

export const IMPORT_STATES = {
  DISCONNECTED: "DISCONNECTED",
  CONNECTED: "CONNECTED",
  IMPORT_PENDING: "IMPORT_PENDING",
  IMPORTING: "IMPORTING",
  RECONCILIATION_REQUIRED: "RECONCILIATION_REQUIRED",
  SYNCED: "SYNCED",
  IMPORT_FAILED: "IMPORT_FAILED",
  TOKEN_REVOKED: "TOKEN_REVOKED",
  CONNECTION_ERROR: "CONNECTION_ERROR",
};

// ── Business/credential mismatch guard ───────────────────────────────────

/**
 * Load and validate Shopify credentials for a business.
 * Returns null (and logs an error) if no active credential exists or if the
 * credential's business_id does not match the requesting businessId.
 *
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @returns {{ shopDomain: string; accessToken: string; credentialBusinessId: number } | null}
 */
export function loadAndValidateCredentials(db, businessId) {
  const creds = db
    .query(
      `SELECT id, business_id, shop_domain, access_token_encrypted
       FROM provider_credentials
       WHERE provider = 'shopify' AND is_active = 1 AND business_id = ?`
    )
    .get(businessId);

  if (!creds) {
    return null;
  }

  // The credential must belong to the requesting business (belt-and-suspenders —
  // the WHERE clause already enforces this, but we double-check to be explicit).
  if (Number(creds.business_id) !== Number(businessId)) {
    console.error(
      `[shopify-import] SECURITY: credential business_id ${creds.business_id} ` +
        `does not match requesting businessId ${businessId} — import blocked`
    );
    return null;
  }

  let accessToken;
  try {
    accessToken = decryptToken(creds.access_token_encrypted);
  } catch (err) {
    console.error(`[shopify-import] Failed to decrypt token for business ${businessId}:`, err.message);
    return null;
  }

  return {
    shopDomain: creds.shop_domain,
    accessToken,
    credentialBusinessId: Number(creds.business_id),
  };
}

// ── Import session management ─────────────────────────────────────────────

/**
 * Get the most recent import session for a business.
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 */
export function getLatestImportSession(db, businessId) {
  return db
    .query(
      `SELECT * FROM shopify_import_sessions WHERE business_id = ? ORDER BY id DESC LIMIT 1`
    )
    .get(businessId);
}

/**
 * Create a new import session in IMPORT_PENDING state.
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @returns {number} session id
 */
export function createImportSession(db, businessId) {
  const res = db
    .query(
      `INSERT INTO shopify_import_sessions (business_id, state, created_at, updated_at)
       VALUES (?, 'IMPORT_PENDING', datetime('now'), datetime('now'))`
    )
    .run(businessId);
  return Number(res.lastInsertRowid);
}

/**
 * Update import session state.
 * @param {import("bun:sqlite").Database} db
 * @param {number} sessionId
 * @param {string} state
 * @param {object} [extra] additional fields to update
 */
export function updateImportSession(db, sessionId, state, extra = {}) {
  // Allowlist of column names that may be updated — prevents SQL injection
  // through key names if `extra` ever comes from an untrusted source.
  const ALLOWED_COLUMNS = new Set([
    "import_started_at",
    "import_completed_at",
    "last_successful_import_at",
    "shopify_products_count",
    "shopify_variants_count",
    "shopify_orders_count",
    "shopify_locations_count",
    "shopify_inventory_levels_count",
    "persisted_products_count",
    "persisted_variants_count",
    "persisted_orders_count",
    "persisted_locations_count",
    "persisted_inventory_levels_count",
    "shopify_product_ids",
    "shopify_variant_ids",
    "shopify_order_ids",
    "shopify_location_ids",
    "shopify_inventory_pairs",
    "discrepancies",
    "errors",
    "reconciliation_status",
  ]);

  const setClauses = ["state = ?"];
  const values = [state];

  for (const [key, val] of Object.entries(extra)) {
    if (!ALLOWED_COLUMNS.has(key)) {
      console.warn(`[shopify-import] updateImportSession: ignoring unknown column '${key}'`);
      continue;
    }
    setClauses.push(`${key} = ?`);
    values.push(val);
  }

  setClauses.push(`updated_at = datetime('now')`);
  values.push(sessionId);

  db.run(
    `UPDATE shopify_import_sessions SET ${setClauses.join(", ")} WHERE id = ?`,
    values
  );
}

/**
 * Compute and return the effective import state for a business.
 * Uses the provider_credentials sync_status and the latest import session.
 *
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @returns {string} one of IMPORT_STATES values
 */
export function getEffectiveImportState(db, businessId) {
  const creds = db
    .query(
      `SELECT is_active, sync_status FROM provider_credentials
       WHERE business_id = ? AND provider = 'shopify'`
    )
    .get(businessId);

  if (!creds || !creds.is_active) return IMPORT_STATES.DISCONNECTED;

  const session = getLatestImportSession(db, businessId);
  if (!session) return IMPORT_STATES.CONNECTED;

  return session.state;
}

// ── Stale-session recovery ────────────────────────────────────────────────

/**
 * Maximum number of minutes an import session may remain in IMPORTING state
 * before it is considered stale (e.g. after a Railway restart or process kill).
 * Owners may retry safely after this threshold.
 */
export const STALE_IMPORT_THRESHOLD_MINUTES = 30;

/**
 * Mark any IMPORTING sessions for a business that have been running longer
 * than STALE_IMPORT_THRESHOLD_MINUTES as IMPORT_FAILED with a clear reason.
 *
 * Safe to call before starting a new import. Does not affect completed sessions.
 *
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @returns {number} number of stale sessions recovered
 */
export function recoverStaleSessions(db, businessId) {
  const staleRows = db
    .query(
      `SELECT id, import_started_at FROM shopify_import_sessions
       WHERE business_id = ? AND state = 'IMPORTING'
         AND (
           import_started_at IS NULL
           OR (
             (julianday('now') - julianday(import_started_at)) * 1440
             > ?
           )
         )`
    )
    .all(businessId, STALE_IMPORT_THRESHOLD_MINUTES);

  for (const row of staleRows) {
    updateImportSession(db, row.id, IMPORT_STATES.IMPORT_FAILED, {
      import_completed_at: new Date().toISOString(),
      errors: JSON.stringify([
        `Import session stale: exceeded ${STALE_IMPORT_THRESHOLD_MINUTES}-minute threshold ` +
        `(started: ${row.import_started_at ?? "unknown"}). ` +
        "Likely caused by a process restart or timeout. Safe to retry."
      ]),
    });
    console.warn(
      `[shopify-import] Recovered stale session id=${row.id} for business ${businessId}`
    );
  }

  return staleRows.length;
}

/**
 * Check whether an active (IMPORTING) session already exists for a business.
 * Returns the session row if one is found, otherwise null.
 *
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @returns {object|null}
 */
export function getActiveImportSession(db, businessId) {
  return db
    .query(
      `SELECT id, import_started_at FROM shopify_import_sessions
       WHERE business_id = ? AND state = 'IMPORTING'
       ORDER BY id DESC LIMIT 1`
    )
    .get(businessId) ?? null;
}

// ── GraphQL helpers ───────────────────────────────────────────────────────

const PAGE_SIZE = 50;

/**
 * Maximum number of consecutive THROTTLED retries per paginated request.
 * After this many consecutive throttle responses on a single page, the fetch
 * is aborted and a descriptive error is pushed to graphqlErrors so the import
 * surfaces as IMPORT_FAILED / RECONCILIATION_REQUIRED rather than looping
 * indefinitely.
 */
export const MAX_THROTTLE_RETRIES = 5;

/**
 * Maximum backoff delay (ms) for a single throttle sleep.
 * Actual delay is capped at this value regardless of retry count.
 */
export const MAX_THROTTLE_BACKOFF_MS = 16000;

/**
 * Safe delay helper for throttle backoff.
 * @param {number} ms
 */
let sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Override the sleep implementation — for tests only.
 * Pass a no-op to eliminate real delays in unit tests.
 * @param {(ms: number) => Promise<void>} fn
 */
export function _setThrottleSleepFn(fn) {
  sleep = fn;
}

/**
 * Extract GraphQL error messages from a raw gateway response.
 * Returns [] when the response has no errors.
 * Detects THROTTLED errors and returns a sentinel.
 *
 * @param {any} rawResponse — result of gatewayGraphQL (may be { data, errors })
 * @returns {{ isThrottled: boolean; messages: string[] }}
 */
export function extractGraphQLErrors(rawResponse) {
  const errors = rawResponse?.errors;
  if (!Array.isArray(errors) || errors.length === 0) {
    return { isThrottled: false, messages: [] };
  }
  const isThrottled = errors.some(
    e => e?.extensions?.code === "THROTTLED" || String(e?.message).includes("Throttled")
  );
  const messages = errors.map(e =>
    e?.message ? String(e.message) : "Unknown GraphQL error"
  );
  return { isThrottled, messages };
}

/**
 * Fetch all products and variants from Shopify using GraphQL cursor pagination.
 * @returns {{ products: object[], shopifyCount: number, graphqlErrors: string[] }}
 */
async function fetchAllProducts(shopDomain, accessToken) {
  const products = [];
  const graphqlErrors = [];
  let cursor = null;
  let hasNextPage = true;
  let throttleRetries = 0;

  while (hasNextPage) {
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    const query = `
      query {
        products(first: ${PAGE_SIZE}${afterClause}) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              status
              variants(first: 100) {
                edges {
                  node {
                    id
                    sku
                    barcode
                    title
                    inventoryItem { id }
                    inventoryQuantity
                  }
                }
              }
            }
          }
        }
      }
    `;

    let raw;
    try {
      raw = await gatewayGraphQL("readonly", shopDomain, accessToken, query);
    } catch (err) {
      graphqlErrors.push(`products fetch error: ${err.message}`);
      break;
    }

    const { isThrottled, messages } = extractGraphQLErrors(raw);
    if (isThrottled) {
      throttleRetries++;
      if (throttleRetries > MAX_THROTTLE_RETRIES) {
        graphqlErrors.push(
          `products: THROTTLED — exceeded ${MAX_THROTTLE_RETRIES} consecutive retries, aborting`
        );
        break;
      }
      const delay = Math.min(2000 * throttleRetries, MAX_THROTTLE_BACKOFF_MS);
      console.warn(`[shopify-import] Products fetch THROTTLED (retry ${throttleRetries}/${MAX_THROTTLE_RETRIES}) — waiting ${delay}ms`);
      await sleep(delay);
      continue; // retry same cursor
    }
    throttleRetries = 0;
    if (messages.length > 0) {
      graphqlErrors.push(...messages.map(m => `products: ${m}`));
      break;
    }

    const data = raw?.data ?? raw; // gateway returns { data: {...} } or may unwrap
    const page = data?.products;
    if (!page) break;

    for (const edge of page.edges || []) {
      products.push(edge.node);
    }

    hasNextPage = page.pageInfo?.hasNextPage ?? false;
    cursor = page.pageInfo?.endCursor ?? null;
  }

  return { products, shopifyCount: products.length, graphqlErrors };
}

/**
 * Fetch all locations from Shopify via GraphQL.
 * @returns {{ locations: object[], shopifyCount: number, graphqlErrors: string[] }}
 */
async function fetchAllLocations(shopDomain, accessToken) {
  const locations = [];
  const graphqlErrors = [];
  let cursor = null;
  let hasNextPage = true;
  let throttleRetries = 0;

  while (hasNextPage) {
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    const query = `
      query {
        locations(first: ${PAGE_SIZE}${afterClause}) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              name
              isActive
              address { formatted }
            }
          }
        }
      }
    `;

    let raw;
    try {
      raw = await gatewayGraphQL("readonly", shopDomain, accessToken, query);
    } catch (err) {
      graphqlErrors.push(`locations fetch error: ${err.message}`);
      break;
    }

    const { isThrottled, messages } = extractGraphQLErrors(raw);
    if (isThrottled) {
      throttleRetries++;
      if (throttleRetries > MAX_THROTTLE_RETRIES) {
        graphqlErrors.push(
          `locations: THROTTLED — exceeded ${MAX_THROTTLE_RETRIES} consecutive retries, aborting`
        );
        break;
      }
      const delay = Math.min(2000 * throttleRetries, MAX_THROTTLE_BACKOFF_MS);
      console.warn(`[shopify-import] Locations fetch THROTTLED (retry ${throttleRetries}/${MAX_THROTTLE_RETRIES}) — waiting ${delay}ms`);
      await sleep(delay);
      continue;
    }
    throttleRetries = 0;
    if (messages.length > 0) {
      graphqlErrors.push(...messages.map(m => `locations: ${m}`));
      break;
    }

    const data = raw?.data ?? raw;
    const page = data?.locations;
    if (!page) break;

    for (const edge of page.edges || []) {
      locations.push(edge.node);
    }

    hasNextPage = page.pageInfo?.hasNextPage ?? false;
    cursor = page.pageInfo?.endCursor ?? null;
  }

  return { locations, shopifyCount: locations.length, graphqlErrors };
}

/**
 * Fetch inventory levels for a list of location GIDs.
 * @param {string[]} locationIds — Shopify GID strings (gid://shopify/Location/...)
 * @returns {{ levels: object[], shopifyCount: number, graphqlErrors: string[] }}
 */
async function fetchAllInventoryLevels(shopDomain, accessToken, locationIds) {
  const levels = [];
  const graphqlErrors = [];

  for (const locationGid of locationIds) {
    let cursor = null;
    let hasNextPage = true;
    let throttleRetries = 0;

    while (hasNextPage) {
      const afterClause = cursor ? `, after: "${cursor}"` : "";
      const query = `
        query {
          location(id: "${locationGid}") {
            inventoryLevels(first: ${PAGE_SIZE}${afterClause}) {
              pageInfo { hasNextPage endCursor }
              edges {
                node {
                  quantities(names: ["available"]) {
                    name
                    quantity
                  }
                  item { id }
                }
              }
            }
          }
        }
      `;

      let raw;
      try {
        raw = await gatewayGraphQL("readonly", shopDomain, accessToken, query);
      } catch (err) {
        graphqlErrors.push(`inventory fetch error: ${err.message}`);
        hasNextPage = false;
        break;
      }

      const { isThrottled, messages } = extractGraphQLErrors(raw);
      if (isThrottled) {
        throttleRetries++;
        if (throttleRetries > MAX_THROTTLE_RETRIES) {
          graphqlErrors.push(
            `inventory: THROTTLED — exceeded ${MAX_THROTTLE_RETRIES} consecutive retries, aborting`
          );
          hasNextPage = false;
          break;
        }
        const delay = Math.min(2000 * throttleRetries, MAX_THROTTLE_BACKOFF_MS);
        console.warn(`[shopify-import] Inventory fetch THROTTLED (retry ${throttleRetries}/${MAX_THROTTLE_RETRIES}) — waiting ${delay}ms`);
        await sleep(delay);
        continue;
      }
      throttleRetries = 0;
      if (messages.length > 0) {
        graphqlErrors.push(...messages.map(m => `inventory: ${m}`));
        hasNextPage = false;
        break;
      }

      const data = raw?.data ?? raw;
      const page = data?.location?.inventoryLevels;
      if (!page) { hasNextPage = false; break; }

      for (const edge of page.edges || []) {
        const availableQuantity = edge.node.quantities?.find(
          quantity => quantity?.name === "available"
        );
        levels.push({
          locationGid,
          locationId: locationGid,
          inventoryItemGid: edge.node.item?.id,
          inventoryItemId: edge.node.item?.id,
          available: availableQuantity?.quantity ?? 0,
        });
      }

      hasNextPage = page.pageInfo?.hasNextPage ?? false;
      cursor = page.pageInfo?.endCursor ?? null;
    }
  }

  return { levels, shopifyCount: levels.length, graphqlErrors };
}

/**
 * Fetch all accessible orders across all statuses via GraphQL cursor pagination.
 * Does NOT add read_all_orders — uses only the approved read_orders scope.
 * @returns {{ orders: object[], shopifyCount: number, graphqlErrors: string[] }}
 */
async function fetchAllOrders(shopDomain, accessToken) {
  const orders = [];
  const graphqlErrors = [];
  let cursor = null;
  let hasNextPage = true;
  let throttleRetries = 0;

  while (hasNextPage) {
    const afterClause = cursor ? `, after: "${cursor}"` : "";
    // No status filter — import all accessible orders within the allowed window.
    // The read_orders scope provides access to orders within Shopify's default window.
    const query = `
      query {
        orders(first: ${PAGE_SIZE}${afterClause}) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              name
              displayFinancialStatus
              displayFulfillmentStatus
              createdAt
              customer { firstName lastName email }
              lineItems(first: 100) {
                edges {
                  node {
                    title
                    quantity
                    sku
                    variant {
                      id
                      title
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    let raw;
    try {
      raw = await gatewayGraphQL("readonly", shopDomain, accessToken, query);
    } catch (err) {
      graphqlErrors.push(`orders fetch error: ${err.message}`);
      break;
    }

    const { isThrottled, messages } = extractGraphQLErrors(raw);
    if (isThrottled) {
      throttleRetries++;
      if (throttleRetries > MAX_THROTTLE_RETRIES) {
        graphqlErrors.push(
          `orders: THROTTLED — exceeded ${MAX_THROTTLE_RETRIES} consecutive retries, aborting`
        );
        break;
      }
      const delay = Math.min(2000 * throttleRetries, MAX_THROTTLE_BACKOFF_MS);
      console.warn(`[shopify-import] Orders fetch THROTTLED (retry ${throttleRetries}/${MAX_THROTTLE_RETRIES}) — waiting ${delay}ms`);
      await sleep(delay);
      continue;
    }
    throttleRetries = 0;
    if (messages.length > 0) {
      graphqlErrors.push(...messages.map(m => `orders: ${m}`));
      break;
    }

    const data = raw?.data ?? raw;
    const page = data?.orders;
    if (!page) break;

    for (const edge of page.edges || []) {
      orders.push(edge.node);
    }

    hasNextPage = page.pageInfo?.hasNextPage ?? false;
    cursor = page.pageInfo?.endCursor ?? null;
  }

  return { orders, shopifyCount: orders.length, graphqlErrors };
}

// ── Persistence helpers ───────────────────────────────────────────────────

/** Extract numeric ID from a Shopify GID string (gid://shopify/Type/123) */
function gidToId(gid) {
  if (!gid) return null;
  const parts = String(gid).split("/");
  return parts[parts.length - 1] || null;
}

/**
 * Upsert a Shopify product into ShimmerStock products table.
 * Idempotent on shopify_product_id + business_id.
 *
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @param {object} shopifyProduct — node from GraphQL response
 * @returns {number} ShimmerStock product id
 */
function upsertProduct(db, businessId, shopifyProduct) {
  const shopifyProductId = gidToId(shopifyProduct.id);
  const title = shopifyProduct.title || "";
  const status = (shopifyProduct.status || "").toLowerCase();

  // Check if exists
  const existing = db
    .query(`SELECT id FROM products WHERE shopify_product_id = ? AND business_id = ?`)
    .get(shopifyProductId, businessId);

  if (existing) {
    db.run(
      `UPDATE products SET name = ?, shopify_status = ?, shopify_imported_at = datetime('now'),
       updated_at = datetime('now') WHERE id = ? AND business_id = ?`,
      [title, status, existing.id, businessId]
    );
    return existing.id;
  }

  // Generate a unique SKU for the product header row (not a variant SKU)
  const sku = `SHOPIFY-${shopifyProductId}`;

  // Insert — SKU collision is handled by catching and retrying with suffix
  try {
    const res = db
      .query(
        `INSERT INTO products
           (name, sku, stock_count, shopify_product_id, business_id, shopify_status, shopify_imported_at, created_at, updated_at)
         VALUES (?, ?, 0, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`
      )
      .run(title, sku, shopifyProductId, businessId, status);
    return Number(res.lastInsertRowid);
  } catch (err) {
    if (String(err.message).includes("UNIQUE constraint failed")) {
      // SKU already taken — use a more specific one
      const res2 = db
        .query(
          `INSERT INTO products
             (name, sku, stock_count, shopify_product_id, business_id, shopify_status, shopify_imported_at, created_at, updated_at)
           VALUES (?, ?, 0, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))`
        )
        .run(title, `SHOPIFY-${shopifyProductId}-${businessId}`, shopifyProductId, businessId, status);
      return Number(res2.lastInsertRowid);
    }
    throw err;
  }
}

/**
 * Upsert a Shopify variant into ShimmerStock product_variants table.
 * Idempotent on shopify_variant_id + business_id.
 *
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @param {number} shimmerProductId
 * @param {object} shopifyVariant — node from GraphQL response
 * @returns {number} ShimmerStock variant id
 */
export function upsertVariant(db, businessId, shimmerProductId, shopifyVariant) {
  const shopifyVariantId = gidToId(shopifyVariant.id);
  const shopifyInventoryItemId = gidToId(shopifyVariant.inventoryItem?.id);
  const sku = shopifyVariant.sku ?? null;
  const barcode = shopifyVariant.barcode || null;
  const title = shopifyVariant.title || "Default Title";

  const existing = db
    .query(`SELECT id FROM product_variants WHERE shopify_variant_id = ? AND business_id = ?`)
    .get(shopifyVariantId, businessId);

  if (existing) {
    db.run(
      `UPDATE product_variants
         SET sku = CASE WHEN sku IS shopify_sku THEN ? ELSE sku END,
           barcode = CASE WHEN barcode IS shopify_barcode THEN ? ELSE barcode END,
           shopify_sku = ?, shopify_barcode = ?,
           variant_value = ?, shopify_inventory_item_id = ?,
           stock_count = ?, updated_at = datetime('now')
       WHERE id = ? AND business_id = ?`,
      [
        sku,
        barcode,
        sku,
        barcode,
        title,
        shopifyInventoryItemId,
        shopifyVariant.inventoryQuantity || 0,
        existing.id,
        businessId,
      ]
    );
    return existing.id;
  }

  const res = db
    .query(
      `INSERT INTO product_variants
         (product_id, business_id, sku, barcode, variant_type, variant_value,
         stock_count, shopify_variant_id, shopify_inventory_item_id, shopify_sku, shopify_barcode,
          is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'shopify', ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
    )
    .run(
      shimmerProductId,
      businessId,
      sku,
      barcode,
      title,
      shopifyVariant.inventoryQuantity || 0,
      shopifyVariantId,
      shopifyInventoryItemId,
      sku,
      barcode
    );
  return Number(res.lastInsertRowid);
}

/**
 * Upsert a Shopify location.
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @param {object} shopifyLocation — node from GraphQL response
 */
function upsertLocation(db, businessId, shopifyLocation) {
  const shopifyLocationId = gidToId(shopifyLocation.id);
  const name = shopifyLocation.name || "";
  const isActive = shopifyLocation.isActive ? 1 : 0;
  const address = shopifyLocation.address?.formatted?.join(", ") || null;

  db.run(
    `INSERT INTO shopify_locations (business_id, shopify_location_id, name, is_active, address, imported_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(business_id, shopify_location_id) DO UPDATE SET
       name = excluded.name,
       is_active = excluded.is_active,
       address = excluded.address,
       updated_at = datetime('now')`,
    [businessId, shopifyLocationId, name, isActive, address]
  );
}

/**
 * Upsert an inventory level.
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @param {object} level — { locationGid, inventoryItemGid, available }
 */
function upsertInventoryLevel(db, businessId, level) {
  const locationId = gidToId(level.locationGid);
  const inventoryItemId = gidToId(level.inventoryItemGid);
  if (!locationId || !inventoryItemId) return false;

  db.run(
    `INSERT INTO shopify_inventory_levels
       (business_id, shopify_inventory_item_id, shopify_location_id, available, imported_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(business_id, shopify_inventory_item_id, shopify_location_id) DO UPDATE SET
       available = excluded.available,
       updated_at = datetime('now')`,
    [businessId, inventoryItemId, locationId, level.available]
  );
  return true;
}

/**
 * Upsert a Shopify order into ShimmerStock orders table.
 * Idempotent on shopify_order_id + business_id.
 *
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @param {object} shopifyOrder — node from GraphQL response
 * @returns {number|null} ShimmerStock order id (null if skipped)
 */
function upsertOrder(db, businessId, shopifyOrder) {
  const shopifyOrderId = gidToId(shopifyOrder.id);
  const orderNumber = shopifyOrder.name || shopifyOrderId;
  const customer = shopifyOrder.customer;
  const customerName = customer
    ? `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || customer.email || "Unknown"
    : "Unknown";
  const customerEmail = customer?.email || null;
  const financialStatus = shopifyOrder.displayFinancialStatus || null;
  const fulfillmentStatus = shopifyOrder.displayFulfillmentStatus || null;
  const createdAt = shopifyOrder.createdAt || null;

  const existing = db
    .query(`SELECT id FROM orders WHERE shopify_order_id = ? AND business_id = ?`)
    .get(shopifyOrderId, businessId);

  if (existing) {
    db.run(
      `UPDATE orders SET financial_status = ?, fulfillment_status = ?, shopify_created_at = ?,
       customer_name = ?, customer_email = ?
       WHERE id = ? AND business_id = ?`,
      [financialStatus, fulfillmentStatus, createdAt, customerName, customerEmail, existing.id, businessId]
    );
    return existing.id;
  }

  const res = db
    .query(
      `INSERT INTO orders
         (shopify_order_id, order_number, customer_name, customer_email,
          source, status, business_id, financial_status, fulfillment_status,
          shopify_created_at, imported_at, created_at)
       VALUES (?, ?, ?, ?, 'shopify', 'imported', ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(
      shopifyOrderId,
      orderNumber,
      customerName,
      customerEmail,
      businessId,
      financialStatus,
      fulfillmentStatus,
      createdAt
    );

  const orderId = Number(res.lastInsertRowid);

  // Persist line items
  for (const edge of shopifyOrder.lineItems?.edges || []) {
    const item = edge.node;
    const sku = item.sku || "";
    const variantTitle = item.variant?.title || item.title || "";
    const quantity = item.quantity || 0;
    try {
      db.run(
        `INSERT INTO order_items (order_id, sku, variant_title, quantity, business_id)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, sku, variantTitle, quantity, businessId]
      );
    } catch {
      // Skip duplicate line items
    }
  }

  return orderId;
}

// ── Main import function ──────────────────────────────────────────────────

/**
 * Run the full initial import pipeline for a business.
 *
 * Safety guarantees:
 *   - The credential's business_id MUST match businessId (checked in loadAndValidateCredentials)
 *   - All reads go through gatewayGraphQL in "readonly" mode
 *   - No Shopify writes are made
 *   - Idempotent: safe to run multiple times (upserts)
 *
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @returns {Promise<{ success: boolean; sessionId: number; summary: object; error?: string; state?: string }>}
 */
export async function runInitialImport(db, businessId) {
  // ── Step 0: Recover stale sessions ──────────────────────────────────────
  recoverStaleSessions(db, businessId);

  // ── Step 1: Concurrency guard ────────────────────────────────────────────
  // Only one active import may run per business. Reject concurrent requests.
  const activeSession = getActiveImportSession(db, businessId);
  if (activeSession) {
    return {
      success: false,
      sessionId: activeSession.id,
      summary: {},
      error:
        `An import is already in progress for this business (session id=${activeSession.id}, ` +
        `started: ${activeSession.import_started_at ?? "unknown"}). ` +
        "Wait for it to complete or retry after the stale threshold.",
      state: IMPORT_STATES.IMPORTING,
    };
  }

  // ── Step 2: Validate credentials ─────────────────────────────────────────
  const creds = loadAndValidateCredentials(db, businessId);
  if (!creds) {
    return {
      success: false,
      sessionId: 0,
      summary: {},
      error: "No active Shopify credentials found for this business, or credential/business mismatch",
    };
  }

  const { shopDomain, accessToken } = creds;

  // Create import session
  const sessionId = createImportSession(db, businessId);

  // Transition to IMPORTING
  updateImportSession(db, sessionId, IMPORT_STATES.IMPORTING, {
    import_started_at: new Date().toISOString(),
  });

  // Update provider_credentials sync_status
  db.run(
    `UPDATE provider_credentials SET sync_status = 'importing', updated_at = datetime('now')
     WHERE business_id = ? AND provider = 'shopify'`,
    [businessId]
  );

  const summary = {
    products: { shopify: 0, persisted: 0, ids: [] },
    variants: { shopify: 0, persisted: 0, ids: [] },
    locations: { shopify: 0, persisted: 0, ids: [] },
    inventoryLevels: { shopify: 0, persisted: 0, pairs: [] },
    orders: { shopify: 0, persisted: 0, ids: [] },
    graphqlErrors: [],
    errors: [],
  };

  try {
    // ── 1. Products and variants ─────────────────────────────────────
    const { products, shopifyCount: prodCount, graphqlErrors: prodErrors } =
      await fetchAllProducts(shopDomain, accessToken);
    summary.products.shopify = prodCount;
    if (prodErrors?.length) summary.graphqlErrors.push(...prodErrors);

    const persistedProductIds = new Set();
    const persistedVariantIds = new Set();

    for (const shopifyProduct of products) {
      summary.products.ids.push(gidToId(shopifyProduct.id));
      try {
        const shimmerProductId = upsertProduct(db, businessId, shopifyProduct);
        persistedProductIds.add(gidToId(shopifyProduct.id));

        for (const varEdge of shopifyProduct.variants?.edges || []) {
          const variantId = gidToId(varEdge.node.id);
          summary.variants.ids.push(variantId);
          try {
            upsertVariant(db, businessId, shimmerProductId, varEdge.node);
            persistedVariantIds.add(variantId);
          } catch (err) {
            summary.errors.push(`variant ${varEdge.node.id}: ${err.message}`);
          }
        }
      } catch (err) {
        summary.errors.push(`product ${shopifyProduct.id}: ${err.message}`);
      }
    }

    summary.products.persisted = persistedProductIds.size;
    summary.variants.shopify = summary.variants.ids.length;
    summary.variants.persisted = persistedVariantIds.size;

    // ── 2. Locations ─────────────────────────────────────────────────
    const { locations, shopifyCount: locCount, graphqlErrors: locErrors } =
      await fetchAllLocations(shopDomain, accessToken);
    summary.locations.shopify = locCount;
    if (locErrors?.length) summary.graphqlErrors.push(...locErrors);

    const persistedLocationIds = new Set();
    for (const loc of locations) {
      summary.locations.ids.push(gidToId(loc.id));
      try {
        upsertLocation(db, businessId, loc);
        persistedLocationIds.add(gidToId(loc.id));
      } catch (err) {
        summary.errors.push(`location ${loc.id}: ${err.message}`);
      }
    }
    summary.locations.persisted = persistedLocationIds.size;

    // ── 3. Inventory levels ──────────────────────────────────────────
    const locationGids = locations.map(l => l.id);
    const { levels, shopifyCount: levelsCount, graphqlErrors: invErrors } =
      await fetchAllInventoryLevels(shopDomain, accessToken, locationGids);
    summary.inventoryLevels.shopify = levelsCount;
    if (invErrors?.length) summary.graphqlErrors.push(...invErrors);

    const persistedInventoryPairs = new Set();
    for (const level of levels) {
      const pair = {
        item: gidToId(level.inventoryItemId),
        loc: gidToId(level.locationId),
      };
      summary.inventoryLevels.pairs.push(pair);
      try {
        if (upsertInventoryLevel(db, businessId, level)) {
          persistedInventoryPairs.add(`${pair.item}:${pair.loc}`);
        }
      } catch (err) {
        summary.errors.push(`inventory level: ${err.message}`);
      }
    }
    summary.inventoryLevels.persisted = persistedInventoryPairs.size;

    // ── 4. Orders ────────────────────────────────────────────────────
    const { orders, shopifyCount: ordersCount, graphqlErrors: orderErrors } =
      await fetchAllOrders(shopDomain, accessToken);
    summary.orders.shopify = ordersCount;
    if (orderErrors?.length) summary.graphqlErrors.push(...orderErrors);

    const persistedOrderIds = new Set();
    for (const order of orders) {
      summary.orders.ids.push(gidToId(order.id));
      try {
        const orderId = upsertOrder(db, businessId, order);
        if (orderId) persistedOrderIds.add(gidToId(order.id));
      } catch (err) {
        summary.errors.push(`order ${order.id}: ${err.message}`);
      }
    }
    summary.orders.persisted = persistedOrderIds.size;

    // Persist the imported ID sets before reconciliation so the report can
    // compare tenant-scoped Shopify IDs against tenant-scoped database IDs.
    const hasImportErrors =
      summary.products.shopify !== summary.products.persisted ||
      summary.variants.shopify !== summary.variants.persisted ||
      summary.locations.shopify !== summary.locations.persisted ||
      summary.inventoryLevels.shopify !== summary.inventoryLevels.persisted ||
      summary.orders.shopify !== summary.orders.persisted ||
      summary.errors.length > 0 ||
      summary.graphqlErrors.length > 0;

    const completedAt = new Date().toISOString();
    updateImportSession(db, sessionId, IMPORT_STATES.RECONCILIATION_REQUIRED, {
      import_completed_at: completedAt,
      shopify_products_count: summary.products.shopify,
      shopify_variants_count: summary.variants.shopify,
      shopify_orders_count: summary.orders.shopify,
      shopify_locations_count: summary.locations.shopify,
      shopify_inventory_levels_count: summary.inventoryLevels.shopify,
      persisted_products_count: summary.products.persisted,
      persisted_variants_count: summary.variants.persisted,
      persisted_orders_count: summary.orders.persisted,
      persisted_locations_count: summary.locations.persisted,
      persisted_inventory_levels_count: summary.inventoryLevels.persisted,
      shopify_product_ids: JSON.stringify(summary.products.ids),
      shopify_variant_ids: JSON.stringify(summary.variants.ids),
      shopify_order_ids: JSON.stringify(summary.orders.ids),
      shopify_location_ids: JSON.stringify(summary.locations.ids),
      shopify_inventory_pairs: JSON.stringify(summary.inventoryLevels.pairs),
      discrepancies: JSON.stringify([...summary.errors, ...summary.graphqlErrors]),
      reconciliation_status: "PENDING",
    });

    const reconciliation = getReconciliationReport(db, businessId);
    const reconciled = !hasImportErrors && reconciliation.status === "RECONCILED";
    const finalState = reconciled
      ? IMPORT_STATES.SYNCED
      : IMPORT_STATES.RECONCILIATION_REQUIRED;

    updateImportSession(db, sessionId, finalState, {
      ...(reconciled ? { last_successful_import_at: completedAt } : {}),
      reconciliation_status: reconciled ? "RECONCILED" : "NEEDS_REVIEW",
    });

    if (finalState === IMPORT_STATES.SYNCED) {
      db.run(
        `UPDATE provider_credentials
         SET sync_status = 'synced', sync_error = NULL,
             last_synced_at = datetime('now'), updated_at = datetime('now')
         WHERE business_id = ? AND provider = 'shopify'`,
        [businessId]
      );
      recordCatalogAudit(db, businessId, sessionId);
    } else {
      db.run(
        `UPDATE provider_credentials
         SET sync_status = 'reconciliation_required', last_synced_at = NULL,
             updated_at = datetime('now')
         WHERE business_id = ? AND provider = 'shopify'`,
        [businessId]
      );
    }

    return { success: true, sessionId, summary, state: finalState };
  } catch (err) {
    const isRevoked =
      String(err.message).includes("401") || String(err.message).includes("Unauthorized");
    const finalState = isRevoked ? IMPORT_STATES.TOKEN_REVOKED : IMPORT_STATES.IMPORT_FAILED;

    updateImportSession(db, sessionId, finalState, {
      import_completed_at: new Date().toISOString(),
      errors: JSON.stringify([err.message]),
    });

    db.run(
      `UPDATE provider_credentials SET sync_status = 'failed', sync_error = ?, updated_at = datetime('now')
       WHERE business_id = ? AND provider = 'shopify'`,
      [err.message, businessId]
    );

    return { success: false, sessionId, summary, error: err.message, state: finalState };
  }
}

// ── Reconciliation report ─────────────────────────────────────────────────

/**
 * Generate a reconciliation report from the most recent import session.
 *
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @returns {any} reconciliation report
 */
export function getReconciliationReport(db, businessId) {
  const session = getLatestImportSession(db, businessId);

  if (!session) {
    return {
      status: "NO_IMPORT",
      message: "No import has been run yet. Trigger an import first.",
      products: null,
      variants: null,
      orders: null,
      locations: null,
      inventoryLevels: null,
    };
  }

  // ── Current DB counts ─────────────────────────────────────────────────
  const shimmerProductCount = db
    .query(`SELECT COUNT(*) as c FROM products WHERE business_id = ? AND shopify_product_id IS NOT NULL`)
    .get(businessId)?.c ?? 0;

  const shimmerVariantCount = db
    .query(`SELECT COUNT(*) as c FROM product_variants WHERE business_id = ? AND shopify_variant_id IS NOT NULL`)
    .get(businessId)?.c ?? 0;

  const shimmerOrderCount = db
    .query(`SELECT COUNT(*) as c FROM orders WHERE business_id = ? AND shopify_order_id IS NOT NULL`)
    .get(businessId)?.c ?? 0;

  const shimmerLocationCount = db
    .query(`SELECT COUNT(*) as c FROM shopify_locations WHERE business_id = ?`)
    .get(businessId)?.c ?? 0;

  const shimmerInventoryCount = db
    .query(`SELECT COUNT(*) as c FROM shopify_inventory_levels WHERE business_id = ?`)
    .get(businessId)?.c ?? 0;

  // ── Current DB ID sets (tenant-scoped) ────────────────────────────────
  const dbProductIds = new Set(
    db.query(`SELECT shopify_product_id FROM products WHERE business_id = ? AND shopify_product_id IS NOT NULL`)
      .all(businessId).map(r => r.shopify_product_id)
  );
  const dbVariantIds = new Set(
    db.query(`SELECT shopify_variant_id FROM product_variants WHERE business_id = ? AND shopify_variant_id IS NOT NULL`)
      .all(businessId).map(r => r.shopify_variant_id)
  );
  const dbOrderIds = new Set(
    db.query(`SELECT shopify_order_id FROM orders WHERE business_id = ? AND shopify_order_id IS NOT NULL`)
      .all(businessId).map(r => r.shopify_order_id)
  );
  const dbLocationIds = new Set(
    db.query(`SELECT shopify_location_id FROM shopify_locations WHERE business_id = ?`)
      .all(businessId).map(r => r.shopify_location_id)
  );
  const dbInventoryPairs = new Set(
    db.query(`SELECT shopify_inventory_item_id, shopify_location_id FROM shopify_inventory_levels WHERE business_id = ?`)
      .all(businessId).map(r => `${r.shopify_inventory_item_id}:${r.shopify_location_id}`)
  );

  // ── Stored Shopify ID sets from the import session ────────────────────
  // Populated by runInitialImport for sessions created after this version.
  // If absent, fall back to count-only comparison with NEEDS_REVIEW state.
  const sessionProductIds = session.shopify_product_ids
    ? new Set(JSON.parse(session.shopify_product_ids))
    : null;
  const sessionVariantIds = session.shopify_variant_ids
    ? new Set(JSON.parse(session.shopify_variant_ids))
    : null;
  const sessionOrderIds = session.shopify_order_ids
    ? new Set(JSON.parse(session.shopify_order_ids))
    : null;
  const sessionLocationIds = session.shopify_location_ids
    ? new Set(JSON.parse(session.shopify_location_ids))
    : null;
  const sessionInventoryPairs = session.shopify_inventory_pairs
    ? new Set(
        (JSON.parse(session.shopify_inventory_pairs) || []).map(
          p => `${p.item ?? p.inventoryItemId}:${p.loc ?? p.locationId}`
        )
      )
    : null;

  // ── ID-set difference helpers ─────────────────────────────────────────
  /** IDs in `setA` but not in `setB`. */
  function setDiff(setA, setB) {
    if (!setA || !setB) return [];
    return [...setA].filter(id => !setB.has(id));
  }

  // ── ID-set comparisons ────────────────────────────────────────────────
  // missingFromDb: Shopify reported these IDs but they're not in ShimmerStock
  // unexpectedInDb: In ShimmerStock but not in the Shopify import set
  const productsMissingFromDb = setDiff(sessionProductIds, dbProductIds);
  const productsUnexpectedInDb = setDiff(dbProductIds, sessionProductIds);

  const variantsMissingFromDb = setDiff(sessionVariantIds, dbVariantIds);
  const variantsUnexpectedInDb = setDiff(dbVariantIds, sessionVariantIds);

  const ordersMissingFromDb = setDiff(sessionOrderIds, dbOrderIds);
  const ordersUnexpectedInDb = setDiff(dbOrderIds, sessionOrderIds);

  const locationsMissingFromDb = setDiff(sessionLocationIds, dbLocationIds);
  const locationsUnexpectedInDb = setDiff(dbLocationIds, sessionLocationIds);

  const inventoryMissingFromDb = setDiff(sessionInventoryPairs, dbInventoryPairs);
  const inventoryUnexpectedInDb = setDiff(dbInventoryPairs, sessionInventoryPairs);

  // ── Duplicate Shopify IDs in ShimmerStock (import corruption) ─────────
  const dupProducts = db
    .query(
      `SELECT shopify_product_id, COUNT(*) as cnt FROM products
       WHERE business_id = ? AND shopify_product_id IS NOT NULL
       GROUP BY shopify_product_id HAVING cnt > 1`
    )
    .all(businessId);

  const dupVariants = db
    .query(
      `SELECT shopify_variant_id, COUNT(*) as cnt FROM product_variants
       WHERE business_id = ? AND shopify_variant_id IS NOT NULL
       GROUP BY shopify_variant_id HAVING cnt > 1`
    )
    .all(businessId);

  const dupOrders = db
    .query(
      `SELECT shopify_order_id, COUNT(*) as cnt FROM orders
       WHERE business_id = ? AND shopify_order_id IS NOT NULL
       GROUP BY shopify_order_id HAVING cnt > 1`
    )
    .all(businessId);

  // ── Variants with empty SKUs ──────────────────────────────────────────
  const missingSkuVariants = db
    .query(
      `SELECT COUNT(*) as c FROM product_variants
       WHERE business_id = ? AND shopify_variant_id IS NOT NULL AND (sku = '' OR sku IS NULL)`
    )
    .get(businessId)?.c ?? 0;

  const discrepancyErrors = session.discrepancies ? JSON.parse(session.discrepancies) : [];

  // ── Count-based mismatches (still useful as summaries) ────────────────
  const productsMismatch =
    (session.shopify_products_count || 0) !== (session.persisted_products_count || 0);
  const variantsMismatch =
    (session.shopify_variants_count || 0) !== (session.persisted_variants_count || 0);
  const ordersMismatch =
    (session.shopify_orders_count || 0) !== (session.persisted_orders_count || 0);
  const locationsMismatch =
    (session.shopify_locations_count ?? -1) !== shimmerLocationCount;
  const inventoryMismatch =
    (session.shopify_inventory_levels_count ?? -1) !== shimmerInventoryCount;

  // ── Determine per-entity and overall status ───────────────────────────
  // A RECONCILED entity requires:
  //   - No count mismatch
  //   - No duplicate IDs in ShimmerStock
  //   - No missing IDs (Shopify IDs not found in ShimmerStock)
  //   - No unexpected IDs (ShimmerStock IDs not in Shopify import set)
  //   - If no session ID sets available: mark NEEDS_REVIEW (cannot verify)

  const hasIdSets = sessionProductIds !== null;

  const productsIdMismatch =
    productsMissingFromDb.length > 0 || productsUnexpectedInDb.length > 0;
  const variantsIdMismatch =
    variantsMissingFromDb.length > 0 || variantsUnexpectedInDb.length > 0;
  const ordersIdMismatch =
    ordersMissingFromDb.length > 0 || ordersUnexpectedInDb.length > 0;
  const locationsIdMismatch =
    locationsMissingFromDb.length > 0 || locationsUnexpectedInDb.length > 0;
  const inventoryIdMismatch =
    inventoryMissingFromDb.length > 0 || inventoryUnexpectedInDb.length > 0;

  function entityStatus(countMismatch, idMismatch, dups, hasReview = false) {
    if (dups.length > 0 || countMismatch || idMismatch) return "MISMATCH";
    if (!hasIdSets || hasReview) return "NEEDS_REVIEW";
    return "RECONCILED";
  }

  const productsStatus = entityStatus(
    productsMismatch, productsIdMismatch, dupProducts
  );
  const variantsStatus = entityStatus(
    variantsMismatch, variantsIdMismatch, dupVariants
  );
  const ordersStatus = entityStatus(ordersMismatch, ordersIdMismatch, dupOrders);
  const locationsStatus = entityStatus(locationsMismatch, locationsIdMismatch, []);
  const inventoryStatus = entityStatus(inventoryMismatch, inventoryIdMismatch, []);

  const anyMismatch =
    productsStatus === "MISMATCH" ||
    variantsStatus === "MISMATCH" ||
    ordersStatus === "MISMATCH" ||
    locationsStatus === "MISMATCH" ||
    inventoryStatus === "MISMATCH" ||
    discrepancyErrors.length > 0;

  const anyNeedsReview =
    productsStatus === "NEEDS_REVIEW" ||
    variantsStatus === "NEEDS_REVIEW" ||
    ordersStatus === "NEEDS_REVIEW" ||
    locationsStatus === "NEEDS_REVIEW" ||
    inventoryStatus === "NEEDS_REVIEW";

  // SYNCED requires all entities RECONCILED with no errors.
  const overallStatus = anyMismatch
    ? "MISMATCH"
    : anyNeedsReview
    ? "NEEDS_REVIEW"
    : "RECONCILED";

  return {
    status: overallStatus,
    importState: session.state,
    importStartedAt: session.import_started_at,
    importCompletedAt: session.import_completed_at,
    lastSuccessfulImportAt: session.last_successful_import_at,
    hasIdSets,
    products: {
      shopifyCount: session.shopify_products_count,
      shimmerCount: shimmerProductCount,
      duplicateIds: dupProducts.map(d => d.shopify_product_id),
      missingFromDb: productsMissingFromDb,
      unexpectedInDb: productsUnexpectedInDb,
      mismatch: productsMismatch || productsIdMismatch,
      status: productsStatus,
    },
    variants: {
      shopifyCount: session.shopify_variants_count,
      shimmerCount: shimmerVariantCount,
      duplicateIds: dupVariants.map(d => d.shopify_variant_id),
      missingFromDb: variantsMissingFromDb,
      unexpectedInDb: variantsUnexpectedInDb,
      missingSkuCount: missingSkuVariants,
      mismatch: variantsMismatch || variantsIdMismatch,
      status: variantsStatus,
    },
    orders: {
      shopifyCount: session.shopify_orders_count,
      shimmerCount: shimmerOrderCount,
      duplicateIds: dupOrders.map(d => d.shopify_order_id),
      missingFromDb: ordersMissingFromDb,
      unexpectedInDb: ordersUnexpectedInDb,
      mismatch: ordersMismatch || ordersIdMismatch,
      status: ordersStatus,
    },
    locations: {
      shopifyCount: session.shopify_locations_count,
      shimmerCount: shimmerLocationCount,
      missingFromDb: locationsMissingFromDb,
      unexpectedInDb: locationsUnexpectedInDb,
      status: locationsStatus,
    },
    inventoryLevels: {
      shopifyCount: session.shopify_inventory_levels_count,
      shimmerCount: shimmerInventoryCount,
      missingFromDb: inventoryMissingFromDb,
      unexpectedInDb: inventoryUnexpectedInDb,
      status: inventoryStatus,
    },
    errors: discrepancyErrors,
  };
}
