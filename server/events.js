/**
 * Production Engine Event Bus
 * ============================
 * Engines publish structured events. Other engines (and AI summaries) consume them.
 * This is a simple in-process event emitter — no external dependencies.
 *
 * Events published by the Production Engine:
 *   production.batch_created     — a manufacturing batch was started
 *   production.batch_completed   — inventory was produced
 *   production.inventory_consumed — raw materials were used
 *   production.inventory_produced — finished goods were created
 *
 * Events published by the Calculation Engine:
 *   calculation.formula_created  — a new formula was defined
 *   calculation.formula_executed — a formula was run with specific inputs
 *
 * Events published by the Purchasing Engine:
 *   purchasing.supplier_added    — a new supplier was added
 *   purchasing.reorder_recommended — system recommends a purchase
 *   purchasing.po_created        — purchase order generated
 *   purchasing.po_received       — inventory received against PO
 *
 * Events published by other engines (future):
 *   commerce.order_received      — new order from any channel
 *   decision.fulfillment_ok      — order can be fulfilled from stock
 *   decision.production_needed   — order requires manufacturing
 */

const listeners = {};

/**
 * Subscribe to an event type.
 * @param {string} event - e.g. "production.batch_completed"
 * @param {(payload: object) => void} callback
 */
export function on(event, callback) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(callback);
}

/**
 * Publish an event to all subscribers.
 * @param {string} event
 * @param {object} payload
 */
export function emit(event, payload) {
  const subs = listeners[event];
  if (!subs || subs.length === 0) {
    console.log(`[events] ${event} — no subscribers`);
    return;
  }
  console.log(`[events] ${event} — notifying ${subs.length} subscriber(s)`);
  for (const cb of subs) {
    try {
      cb(payload);
    } catch (err) {
      console.error(`[events] ${event} subscriber error:`, err.message);
    }
  }
}

/**
 * Remove a subscription.
 * @param {string} event
 * @param {(payload: object) => void} callback
 */
export function off(event, callback) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter((cb) => cb !== callback);
}

/**
 * Get a structured summary of all production events for AI consumption.
 * This returns the most recent events — useful for Business Bestie integration.
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 * @param {number} [limit=20]
 */
export function getProductionSummary(db, businessId, limit = 20) {
  const batches = db
    .query(
      `SELECT pb.id, pb.status, pb.batch_size, pb.started_at, pb.completed_at,
              b.name as bom_name, b.output_quantity, b.output_unit,
              p.name as output_product_name, p.sku as output_sku
       FROM production_batches pb
       JOIN boms b ON pb.bom_id = b.id
       JOIN products p ON b.output_product_id = p.id
       WHERE pb.business_id = ?
       ORDER BY pb.created_at DESC
       LIMIT ?`
    )
    .all(businessId, limit);

  const pendingBatches = db
    .query(
      `SELECT COUNT(*) as count FROM production_batches
       WHERE business_id = ? AND status = 'draft'`
    )
    .get(businessId);

  return {
    totalPending: pendingBatches.count,
    recentBatches: batches,
    summary: pendingBatches.count > 0
      ? `${pendingBatches.count} batch(es) ready to manufacture`
      : "No pending production batches",
  };
}

/**
 * Get a structured summary of the Calculation Engine for AI consumption.
 * Returns formula catalog, templates, and recent activity.
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 */
export function getCalculationSummary(db, businessId) {
  const totalFormulas = db
    .query("SELECT COUNT(*) as count FROM formulas WHERE business_id = ? AND is_public = 0")
    .get(businessId).count;

  const totalTemplates = db
    .query("SELECT COUNT(*) as count FROM formulas WHERE is_public = 1")
    .get().count;

  const formulas = db
    .query(
      `SELECT id, name, description, category, output_label, output_unit, created_at
       FROM formulas WHERE business_id = ? AND is_public = 0
       ORDER BY created_at DESC LIMIT 10`
    )
    .all(businessId);

  const templates = db
    .query(
      `SELECT id, name, description, category, template_id
       FROM formulas WHERE is_public = 1 ORDER BY category, name`
    )
    .all();

  // Recent executions from audit log
  const recentExecutions = db
    .query(
      `SELECT a.id, a.created_at, a.new_value, f.name as formula_name
       FROM audit_log a
       LEFT JOIN formulas f ON a.entity_id = f.id
       WHERE a.business_id = ? AND a.action_type = 'calculation.executed'
       ORDER BY a.created_at DESC LIMIT 5`
    )
    .all(businessId)
    .map((row) => {
      let parsed = null;
      try { parsed = JSON.parse(row.new_value); } catch {}
      return {
        executedAt: row.created_at,
        formulaName: row.formula_name || (parsed?.formulaName),
        result: parsed?.result,
        outputUnit: parsed?.outputUnit,
      };
    });

  const byCategory = db
    .query(
      `SELECT category, COUNT(*) as count FROM formulas
       WHERE business_id = ? AND is_public = 0 GROUP BY category ORDER BY count DESC`
    )
    .all(businessId);

  return {
    totalFormulas,
    totalTemplates,
    formulas,
    templates,
    recentExecutions,
    byCategory,
    summary: `${totalFormulas} formulas defined, ${totalTemplates} templates available`,
  };
}

