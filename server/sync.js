import * as store from "./store.js";

/**
 * Shopify sync log and idempotency helpers.
 *
 * Ensures the same Shopify order/product can never be imported twice,
 * and every inventory push attempt is logged.
 */

/**
 * Generate an idempotency key for a sync action.
 * For imports (order/product): no date — truly idempotent (same entity never twice).
 * For inventory pushes: includes timestamp since they happen repeatedly.
 *
 * @param {string} action - e.g. "import_order", "import_product", "push_inventory"
 * @param {string} shopifyId - Shopify order/product/variant ID
 * @param {Object} [opts]
 * @param {string} [opts.suffix] - Extra discriminator (e.g. location_id for inventory pushes)
 */
export function idempotencyKey(action, shopifyId, opts = {}) {
  const base = `${action}_${shopifyId}`;
  if (opts.suffix) {
    return `${base}_${opts.suffix}`;
  }
  // For inventory pushes, include timestamp so repeated pushes each get logged
  if (action === "push_inventory") {
    return `${base}_${Date.now()}`;
  }
  return base;
}

/**
 * Check if a sync action with this key was already successfully completed.
 *
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @param {string} key - idempotency key
 * @returns {boolean} true if a successful sync already exists for this key
 */
export function isDuplicate(db, businessId, key) {
  return store.isDuplicate(db, businessId, key);
}

/**
 * Check if a sync action was already dry-run (for readonly mode reporting).
 *
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @param {string} key
 * @returns {boolean}
 */
export function wasDryRun(db, businessId, key) {
  return store.wasDryRun(db, businessId, key);
}

/**
 * Check if a sync action was already attempted (any status except pending).
 * Used to skip entities that have already been processed in any mode.
 *
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @param {string} key
 * @returns {boolean}
 */
export function wasAttempted(db, businessId, key) {
  return store.wasAttempted(db, businessId, key);
}

/**
 * Insert a sync log entry.
 *
 * @param {import("bun:sqlite").Database} db
 * @param {Object} params
 * @param {number} params.businessId
 * @param {string} params.idempotencyKey
 * @param {string} params.action - e.g. "import_order", "import_product", "push_inventory"
 * @param {string} [params.shopifyOrderId]
 * @param {string} [params.shopifyProductId]
 * @param {string} [params.provider] - commerce platform name (default: "shopify")
 * @param {string} [params.externalId] - generic external identifier (order ID, product ID, etc.)
 * @param {string} [params.entityType]
 * @param {number} [params.entityId]
 * @param {string} params.status - "pending", "success", "skipped", "failed", "dry_run"
 * @param {Object} [params.details]
 * @param {string} [params.errorMessage]
 * @returns {number} lastInsertRowid
 */
export function logSync(
  db,
  {
    businessId,
    idempotencyKey,
    action,
    shopifyOrderId = null,
    shopifyProductId = null,
    provider = "shopify",
    externalId = null,
    entityType = null,
    entityId = null,
    status,
    details = null,
    errorMessage = null,
  }
) {
  return store.logSyncEntry(db, {
    businessId,
    idempotencyKey,
    action,
    shopifyOrderId,
    shopifyProductId,
    provider,
    externalId,
    entityType,
    entityId,
    status,
    details,
    errorMessage,
  });
}

/**
 * Update an existing sync log entry's status (e.g. for retry).
 *
 * @param {import("bun:sqlite").Database} db
 * @param {number} id - sync log entry ID
 * @param {string} status - new status
 * @param {string} [errorMessage]
 */
export function updateSyncLog(db, id, status, errorMessage = null) {
  store.updateSyncLogStatus(db, id, status, errorMessage);
}
