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

// ── GraphQL helpers ───────────────────────────────────────────────────────

const PAGE_SIZE = 50;

/**
 * Fetch all products and variants from Shopify using GraphQL cursor pagination.
 * @returns {{ products: object[], shopifyCount: number }}
 */
async function fetchAllProducts(shopDomain, accessToken) {
  const products = [];
  let cursor = null;
  let hasNextPage = true;

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

    const data = await gatewayGraphQL("readonly", shopDomain, accessToken, query);
    const page = data?.products;
    if (!page) break;

    for (const edge of page.edges || []) {
      products.push(edge.node);
    }

    hasNextPage = page.pageInfo?.hasNextPage ?? false;
    cursor = page.pageInfo?.endCursor ?? null;
  }

  return { products, shopifyCount: products.length };
}

/**
 * Fetch all locations from Shopify via GraphQL.
 * @returns {{ locations: object[], shopifyCount: number }}
 */
async function fetchAllLocations(shopDomain, accessToken) {
  const locations = [];
  let cursor = null;
  let hasNextPage = true;

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

    const data = await gatewayGraphQL("readonly", shopDomain, accessToken, query);
    const page = data?.locations;
    if (!page) break;

    for (const edge of page.edges || []) {
      locations.push(edge.node);
    }

    hasNextPage = page.pageInfo?.hasNextPage ?? false;
    cursor = page.pageInfo?.endCursor ?? null;
  }

  return { locations, shopifyCount: locations.length };
}

/**
 * Fetch inventory levels for a list of location GIDs.
 * @param {string[]} locationIds — Shopify GID strings (gid://shopify/Location/...)
 * @returns {{ levels: object[], shopifyCount: number }}
 */
async function fetchAllInventoryLevels(shopDomain, accessToken, locationIds) {
  const levels = [];

  for (const locationGid of locationIds) {
    let cursor = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const afterClause = cursor ? `, after: "${cursor}"` : "";
      const query = `
        query {
          location(id: "${locationGid}") {
            inventoryLevels(first: ${PAGE_SIZE}${afterClause}) {
              pageInfo { hasNextPage endCursor }
              edges {
                node {
                  available
                  item { id }
                }
              }
            }
          }
        }
      `;

      const data = await gatewayGraphQL("readonly", shopDomain, accessToken, query);
      const page = data?.location?.inventoryLevels;
      if (!page) break;

      for (const edge of page.edges || []) {
        levels.push({
          locationGid,
          inventoryItemGid: edge.node.item?.id,
          available: edge.node.available ?? 0,
        });
      }

      hasNextPage = page.pageInfo?.hasNextPage ?? false;
      cursor = page.pageInfo?.endCursor ?? null;
    }
  }

  return { levels, shopifyCount: levels.length };
}

/**
 * Fetch all accessible orders across all statuses via GraphQL cursor pagination.
 * Does NOT add read_all_orders — uses only the approved read_orders scope.
 * @returns {{ orders: object[], shopifyCount: number }}
 */
async function fetchAllOrders(shopDomain, accessToken) {
  const orders = [];
  let cursor = null;
  let hasNextPage = true;

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

    const data = await gatewayGraphQL("readonly", shopDomain, accessToken, query);
    const page = data?.orders;
    if (!page) break;

    for (const edge of page.edges || []) {
      orders.push(edge.node);
    }

    hasNextPage = page.pageInfo?.hasNextPage ?? false;
    cursor = page.pageInfo?.endCursor ?? null;
  }

  return { orders, shopifyCount: orders.length };
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
function upsertVariant(db, businessId, shimmerProductId, shopifyVariant) {
  const shopifyVariantId = gidToId(shopifyVariant.id);
  const shopifyInventoryItemId = gidToId(shopifyVariant.inventoryItem?.id);
  const sku = shopifyVariant.sku || "";
  const barcode = shopifyVariant.barcode || null;
  const title = shopifyVariant.title || "Default Title";

  const existing = db
    .query(`SELECT id FROM product_variants WHERE shopify_variant_id = ? AND business_id = ?`)
    .get(shopifyVariantId, businessId);

  if (existing) {
    db.run(
      `UPDATE product_variants
       SET sku = ?, barcode = ?, variant_value = ?, shopify_inventory_item_id = ?,
           stock_count = ?, updated_at = datetime('now')
       WHERE id = ? AND business_id = ?`,
      [
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

  try {
    const res = db
      .query(
        `INSERT INTO product_variants
           (product_id, business_id, sku, barcode, variant_type, variant_value,
            stock_count, shopify_variant_id, shopify_inventory_item_id,
            is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'shopify', ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
      )
      .run(
        shimmerProductId,
        businessId,
        sku,
        barcode,
        title,
        shopifyVariant.inventoryQuantity || 0,
        shopifyVariantId,
        shopifyInventoryItemId
      );
    return Number(res.lastInsertRowid);
  } catch (err) {
    if (String(err.message).includes("UNIQUE constraint failed")) {
      // SKU collision within this business — update the existing row
      const existingBySku = db
        .query(`SELECT id FROM product_variants WHERE business_id = ? AND sku = ?`)
        .get(businessId, sku);
      if (existingBySku) {
        db.run(
          `UPDATE product_variants SET shopify_variant_id = ?, shopify_inventory_item_id = ?,
           barcode = ?, variant_value = ?, stock_count = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [shopifyVariantId, shopifyInventoryItemId, barcode, title, shopifyVariant.inventoryQuantity || 0, existingBySku.id]
        );
        return existingBySku.id;
      }
    }
    throw err;
  }
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
  if (!locationId || !inventoryItemId) return;

  db.run(
    `INSERT INTO shopify_inventory_levels
       (business_id, shopify_inventory_item_id, shopify_location_id, available, imported_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(business_id, shopify_inventory_item_id, shopify_location_id) DO UPDATE SET
       available = excluded.available,
       updated_at = datetime('now')`,
    [businessId, inventoryItemId, locationId, level.available]
  );
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
 * @returns {Promise<{ success: boolean; sessionId: number; summary: object; error?: string }>}
 */
export async function runInitialImport(db, businessId) {
  // Validate credentials and business match
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
    products: { shopify: 0, persisted: 0 },
    variants: { shopify: 0, persisted: 0 },
    locations: { shopify: 0, persisted: 0 },
    inventoryLevels: { shopify: 0, persisted: 0 },
    orders: { shopify: 0, persisted: 0 },
    errors: [],
  };

  try {
    // ── 1. Products and variants ─────────────────────────────────────
    const { products, shopifyCount: prodCount } = await fetchAllProducts(shopDomain, accessToken);
    summary.products.shopify = prodCount;

    let variantShopifyCount = 0;
    let variantPersistedCount = 0;

    for (const shopifyProduct of products) {
      try {
        const shimmerProductId = upsertProduct(db, businessId, shopifyProduct);
        summary.products.persisted++;

        for (const varEdge of shopifyProduct.variants?.edges || []) {
          variantShopifyCount++;
          upsertVariant(db, businessId, shimmerProductId, varEdge.node);
          variantPersistedCount++;
        }
      } catch (err) {
        summary.errors.push(`product ${shopifyProduct.id}: ${err.message}`);
      }
    }

    summary.variants.shopify = variantShopifyCount;
    summary.variants.persisted = variantPersistedCount;

    // ── 2. Locations ─────────────────────────────────────────────────
    const { locations, shopifyCount: locCount } = await fetchAllLocations(shopDomain, accessToken);
    summary.locations.shopify = locCount;

    for (const loc of locations) {
      try {
        upsertLocation(db, businessId, loc);
        summary.locations.persisted++;
      } catch (err) {
        summary.errors.push(`location ${loc.id}: ${err.message}`);
      }
    }

    // ── 3. Inventory levels ──────────────────────────────────────────
    const locationGids = locations.map(l => l.id);
    const { levels, shopifyCount: levelsCount } = await fetchAllInventoryLevels(
      shopDomain,
      accessToken,
      locationGids
    );
    summary.inventoryLevels.shopify = levelsCount;

    for (const level of levels) {
      try {
        upsertInventoryLevel(db, businessId, level);
        summary.inventoryLevels.persisted++;
      } catch (err) {
        summary.errors.push(`inventory level: ${err.message}`);
      }
    }

    // ── 4. Orders ────────────────────────────────────────────────────
    const { orders, shopifyCount: ordersCount } = await fetchAllOrders(shopDomain, accessToken);
    summary.orders.shopify = ordersCount;

    for (const order of orders) {
      try {
        const orderId = upsertOrder(db, businessId, order);
        if (orderId) summary.orders.persisted++;
      } catch (err) {
        summary.errors.push(`order ${order.id}: ${err.message}`);
      }
    }

    // ── Determine final state ────────────────────────────────────────
    const hasDiscrepancies =
      summary.products.shopify !== summary.products.persisted ||
      summary.variants.shopify !== summary.variants.persisted ||
      summary.locations.shopify !== summary.locations.persisted ||
      summary.orders.shopify !== summary.orders.persisted ||
      summary.errors.length > 0;

    const finalState = hasDiscrepancies
      ? IMPORT_STATES.RECONCILIATION_REQUIRED
      : IMPORT_STATES.SYNCED;

    updateImportSession(db, sessionId, finalState, {
      import_completed_at: new Date().toISOString(),
      last_successful_import_at: new Date().toISOString(),
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
      discrepancies: JSON.stringify(summary.errors),
      reconciliation_status: hasDiscrepancies ? "NEEDS_REVIEW" : "RECONCILED",
    });

    // Update provider_credentials sync_status
    const newSyncStatus = finalState === IMPORT_STATES.SYNCED ? "synced" : "reconciliation_required";
    db.run(
      `UPDATE provider_credentials
       SET sync_status = ?, last_synced_at = datetime('now'), updated_at = datetime('now')
       WHERE business_id = ? AND provider = 'shopify'`,
      [newSyncStatus, businessId]
    );

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
 * @returns {object} reconciliation report
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

  // Duplicate Shopify IDs in ShimmerStock (indicates import corruption)
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

  // Variants with empty SKUs
  const missingSkuVariants = db
    .query(
      `SELECT COUNT(*) as c FROM product_variants
       WHERE business_id = ? AND shopify_variant_id IS NOT NULL AND (sku = '' OR sku IS NULL)`
    )
    .get(businessId)?.c ?? 0;

  const discrepancyErrors = session.discrepancies ? JSON.parse(session.discrepancies) : [];

  const productsMismatch =
    (session.shopify_products_count || 0) !== (session.persisted_products_count || 0);
  const variantsMismatch =
    (session.shopify_variants_count || 0) !== (session.persisted_variants_count || 0);
  const ordersMismatch =
    (session.shopify_orders_count || 0) !== (session.persisted_orders_count || 0);

  const overallStatus =
    dupProducts.length > 0 ||
    dupVariants.length > 0 ||
    dupOrders.length > 0 ||
    productsMismatch ||
    variantsMismatch ||
    ordersMismatch ||
    discrepancyErrors.length > 0
      ? "MISMATCH"
      : "RECONCILED";

  return {
    status: overallStatus,
    importState: session.state,
    importStartedAt: session.import_started_at,
    importCompletedAt: session.import_completed_at,
    lastSuccessfulImportAt: session.last_successful_import_at,
    products: {
      shopifyCount: session.shopify_products_count,
      shimmerCount: shimmerProductCount,
      duplicateIds: dupProducts.map(d => d.shopify_product_id),
      mismatch: productsMismatch,
      status: productsMismatch || dupProducts.length > 0 ? "MISMATCH" : "RECONCILED",
    },
    variants: {
      shopifyCount: session.shopify_variants_count,
      shimmerCount: shimmerVariantCount,
      duplicateIds: dupVariants.map(d => d.shopify_variant_id),
      missingSkuCount: missingSkuVariants,
      mismatch: variantsMismatch,
      status: variantsMismatch || dupVariants.length > 0 || missingSkuVariants > 0 ? "NEEDS_REVIEW" : "RECONCILED",
    },
    orders: {
      shopifyCount: session.shopify_orders_count,
      shimmerCount: shimmerOrderCount,
      duplicateIds: dupOrders.map(d => d.shopify_order_id),
      mismatch: ordersMismatch,
      status: ordersMismatch || dupOrders.length > 0 ? "MISMATCH" : "RECONCILED",
    },
    locations: {
      shopifyCount: session.shopify_locations_count,
      shimmerCount: shimmerLocationCount,
      status: session.shopify_locations_count !== shimmerLocationCount ? "MISMATCH" : "RECONCILED",
    },
    inventoryLevels: {
      shopifyCount: session.shopify_inventory_levels_count,
      shimmerCount: shimmerInventoryCount,
      status:
        session.shopify_inventory_levels_count !== shimmerInventoryCount ? "MISMATCH" : "RECONCILED",
    },
    errors: discrepancyErrors,
  };
}
