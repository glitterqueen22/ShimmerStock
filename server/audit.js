import * as store from "./store.js";

/**
 * Unified audit logging helper.
 * Every inventory-changing or data-changing action must produce an audit record.
 *
 * Usage:
 *   import { auditLog } from "./audit.js";
 *   auditLog(db, { businessId, userId, actionType, entityType, entityId,
 *                   previousValue, newValue, source, deviceInfo, reason });
 */

/**
 * Insert a single audit log entry.
 *
 * @param {import("bun:sqlite").Database} db
 * @param {Object} params
 * @param {number} params.businessId
 * @param {number|null} params.userId
 * @param {string} params.actionType   - e.g. "product.created", "scan.in"
 * @param {string} params.entityType    - e.g. "product", "inventory", "order"
 * @param {number|null} params.entityId
 * @param {Object|Array|null} params.previousValue
 * @param {Object|Array|null} params.newValue
 * @param {string} [params.source]      - "manual", "scanner", "shopify", "system"
 * @param {string} [params.deviceInfo]
 * @param {string} [params.reason]
 */
export function auditLog(
  db,
  {
    businessId,
    userId,
    actionType,
    entityType,
    entityId = null,
    previousValue = null,
    newValue = null,
    source = "manual",
    deviceInfo = null,
    reason = null,
  }
) {
  return store.logAuditEntry(db, {
    businessId,
    userId,
    actionType,
    entityType,
    entityId,
    previousValue,
    newValue,
    source,
    deviceInfo,
    reason,
  });
}

/**
 * Helper to extract a simplified device info string from request headers.
 */
export function getDeviceInfo(req) {
  const ua = req?.headers?.["user-agent"];
  if (!ua) return null;
  // Truncate to a reasonable length for DB storage
  return ua.length > 255 ? ua.slice(0, 252) + "..." : ua;
}
