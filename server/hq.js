/**
 * HQ Summary Engine
 * =================
 * Aggregates all engine summaries into one HQ endpoint that answers
 * the four core questions an owner asks when opening the app.
 *
 * Design principle: Every recommendation cites which engine produced it
 * and why. Empty states are first-class — "everything looks good" is
 * better than blank cards.
 */

import * as store from "./store.js";

/**
 * GET /api/hq/summary
 * Aggregates data from all engines into a single HQ view.
 * @param {import("bun:sqlite").Database} db
 * @param {number} businessId
 */
export function getHQSummary(db, businessId) {
  // ── 1. WHAT HAPPENED ────────────────────────────────────────────
  const recentActivity = buildRecentActivity(db, businessId);
  const todayStats = buildTodayStats(db, businessId);

  // ── 2. WHAT NEEDS ATTENTION ─────────────────────────────────────
  const lowStock = store.getLowStockProducts(db, businessId);
  const pendingBatches = store.getPendingBatches(db, businessId);
  const overduePOs = getOverduePOs(db, businessId);
  const unfulfilledOrders = getUnfulfilledOrders(db, businessId);

  // ── 3. WHAT TO DO NEXT ──────────────────────────────────────────
  const whatToDoNext = buildRecommendations(db, businessId, {
    lowStock,
    pendingBatches,
    overduePOs,
    unfulfilledOrders,
  });

  // ── 4. OPPORTUNITIES ────────────────────────────────────────────
  const opportunities = buildOpportunities(db, businessId, {
    lowStock,
    pendingBatches,
    unfulfilledOrders,
  });

  return {
    whatHappened: {
      recentActivity,
      todayStats,
    },
    needsAttention: {
      lowStock,
      pendingBatches,
      overduePOs,
      unfulfilledOrders,
    },
    whatToDoNext,
    opportunities,
  };
}

// ── 1. What Happened ─────────────────────────────────────────────────

function buildRecentActivity(db, businessId) {
  const entries = store.getAuditLog(db, businessId, { limit: 10, offset: 0 });

  return entries.map((entry) => {
    const engine = classifyAuditEngine(entry.action_type);
    const description = formatAuditDescription(entry);
    return {
      id: entry.id,
      engine,
      description,
      timeAgo: entry.created_at,
      actionType: entry.action_type,
    };
  });
}

function classifyAuditEngine(actionType) {
  if (!actionType) return { name: "system", icon: "🔧", label: "System", color: "slate" };
  if (actionType.startsWith("production.")) return { name: "production", icon: "🏭", label: "Production", color: "amber" };
  if (actionType.startsWith("purchasing.")) return { name: "purchasing", icon: "📦", label: "Purchasing", color: "blue" };
  if (actionType.startsWith("calculation.")) return { name: "calculation", icon: "🧮", label: "Calculation", color: "purple" };
  if (actionType.startsWith("orders.") || actionType.startsWith("order.")) return { name: "orders", icon: "📋", label: "Orders", color: "green" };
  if (actionType.startsWith("scan.") || actionType.startsWith("inventory.")) return { name: "scan", icon: "📷", label: "Scan", color: "pink" };
  if (actionType.startsWith("auth.")) return { name: "system", icon: "🔧", label: "System", color: "slate" };
  if (actionType.startsWith("supplier.")) return { name: "purchasing", icon: "📦", label: "Purchasing", color: "blue" };
  return { name: "system", icon: "🔧", label: "System", color: "slate" };
}

function formatAuditDescription(entry) {
  const user = entry.user_display_name || "System";
  const type = entry.action_type || "";

  // Try to parse new_value for context
  let context = "";
  try {
    if (entry.new_value) {
      const nv = typeof entry.new_value === "string" ? JSON.parse(entry.new_value) : entry.new_value;
      if (nv.name || nv.product_name || nv.sku) {
        context = nv.name || nv.product_name || nv.sku;
      } else if (nv.username) {
        context = nv.username;
      } else if (nv.formulaName) {
        context = nv.formulaName;
      } else if (nv.batch_size && nv.bom_name) {
        context = `${nv.bom_name} (×${nv.batch_size})`;
      }
    }
  } catch {}

  // Build readable descriptions from action types
  if (type === "production.batch_created") return `${user} created batch${context ? ` "${context}"` : ""}`;
  if (type === "production.batch_completed") return `${user} completed batch${context ? ` "${context}"` : ""}`;
  if (type === "calculation.formula_created") return `${user} created formula${context ? ` "${context}"` : ""}`;
  if (type === "calculation.formula_executed") return `${user} ran calculation${context ? ` "${context}"` : ""}`;
  if (type === "purchasing.supplier_added") return `${user} added supplier${context ? ` ${context}` : ""}`;
  if (type === "purchasing.po_created") return `${user} created purchase order${context ? ` ${context}` : ""}`;
  if (type === "purchasing.po_received") return `${user} received purchase order${context ? ` ${context}` : ""}`;
  if (type === "auth.login") return `${user} logged in`;
  if (type === "scan.in") return `${user} scanned in${context ? ` ${context}` : ""}`;
  if (type === "scan.out") return `${user} scanned out${context ? ` ${context}` : ""}`;
  if (entry.entity_type === "order") return `${user} ${entry.action_type} order${context ? ` #${context}` : ""}`;
  if (entry.entity_type === "product") return `${user} ${entry.action_type} product${context ? ` ${context}` : ""}`;

  return `${user} — ${type}${context ? ` (${context})` : ""}`;
}

function buildTodayStats(db, businessId) {
  const orders = store.countTodayMovements(db, businessId, "order");
  const scans = store.countTodayMovements(db, businessId, "in") + store.countTodayMovements(db, businessId, "out");

  // Count today's production batches
  const production = db
    .query(
      `SELECT COUNT(*) as count FROM production_batches
       WHERE business_id = ? AND date(created_at) = date('now')`
    )
    .get(businessId).count;

  // Count today's purchase orders
  const purchases = db
    .query(
      `SELECT COUNT(*) as count FROM purchase_orders
       WHERE business_id = ? AND date(created_at) = date('now')`
    )
    .get(businessId).count;

  return { orders, production, scans, purchases };
}

// ── 2. What Needs Attention ─────────────────────────────────────────

function getOverduePOs(db, businessId) {
  return db
    .query(
      `SELECT po.id, po.status, po.order_date, po.expected_delivery, po.notes,
              s.name as supplier_name,
              COUNT(pi.id) as item_count
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       LEFT JOIN po_items pi ON pi.po_id = po.id
       WHERE po.business_id = ? AND po.status = 'ordered'
         AND po.expected_delivery IS NOT NULL
         AND date(po.expected_delivery) < date('now')
       GROUP BY po.id
       ORDER BY po.expected_delivery ASC
       LIMIT 10`
    )
    .all(businessId);
}

function getUnfulfilledOrders(db, businessId) {
  return db
    .query(
      `SELECT o.id, o.order_number, o.customer_name, o.status, o.created_at,
              COUNT(oi.id) as item_count,
              SUM(oi.quantity) as total_qty,
              SUM(CASE WHEN oi.scanned_quantity >= oi.quantity THEN 1 ELSE 0 END) as scanned_items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.business_id = ? AND o.status = 'pending'
       GROUP BY o.id
       ORDER BY o.created_at ASC
       LIMIT 10`
    )
    .all(businessId);
}

// ── 3. What To Do Next ──────────────────────────────────────────────

function buildRecommendations(db, businessId, { lowStock, pendingBatches, overduePOs, unfulfilledOrders }) {
  const recommendations = [];

  // Priority 1: Urgent reorders from purchasing engine
  const purchasingSummary = store.getPurchasingSummary(db, businessId);
  if (purchasingSummary.urgentRecommendations && purchasingSummary.urgentRecommendations.length > 0) {
    const rec = purchasingSummary.urgentRecommendations[0];
    recommendations.push({
      action: `Reorder ${rec.product_name}`,
      reason: rec.reason || rec.daysUntilStockout
        ? `Only ${rec.daysUntilStockout} day(s) of stock remaining — ${rec.stock_count} units left, reorder point is ${rec.reorderPoint}`
        : `${rec.stock_count} units remaining — below reorder point`,
      engine: "purchasing",
      link: "/purchasing",
      source: "purchasing",
    });
  }

  // Priority 2: Draft production batches
  if (pendingBatches && pendingBatches.length > 0) {
    const batch = pendingBatches[0];
    recommendations.push({
      action: `Run "${batch.bom_name}" batch`,
      reason: `${pendingBatches.length} batch(es) ready to manufacture — "${batch.bom_name}" produces ${batch.output_quantity} ${batch.output_unit || "units"} per run`,
      engine: "production",
      link: "/production",
      source: "production",
    });
  }

  // Priority 3: Unfulfilled orders from commerce
  if (unfulfilledOrders && unfulfilledOrders.length > 0) {
    const order = unfulfilledOrders[0];
    recommendations.push({
      action: `Fulfill Order #${order.order_number || order.id}`,
      reason: `${unfulfilledOrders.length} order(s) pending fulfillment — order #${order.order_number || order.id} for ${order.customer_name || "customer"} has ${order.item_count} items waiting`,
      engine: "orders",
      link: "/orders",
      source: "orders",
    });
  }

  // Priority 4: Low stock items (only if no urgent purchasing recommendation above)
  if ((!purchasingSummary.urgentRecommendations || purchasingSummary.urgentRecommendations.length === 0) && lowStock && lowStock.length > 0) {
    const product = lowStock[0];
    recommendations.push({
      action: `Check stock for ${product.name}`,
      reason: `${product.stock_count} units remaining for ${product.sku} — consider setting reorder thresholds`,
      engine: "purchasing",
      link: "/purchasing",
      source: "inventory",
    });
  }

  // Priority 5: Overdue POs
  if (overduePOs && overduePOs.length > 0 && recommendations.length < 3) {
    const po = overduePOs[0];
    recommendations.push({
      action: `Follow up on PO #${po.id} with ${po.supplier_name}`,
      reason: `Expected delivery was ${po.expected_delivery} — ${po.item_count} item(s) overdue`,
      engine: "purchasing",
      link: "/purchasing",
      source: "purchasing",
    });
  }

  // If we have fewer than 3 recommendations, add general ones
  if (recommendations.length < 3) {
    const formulaCount = db
      .query("SELECT COUNT(*) as count FROM formulas WHERE business_id = ? AND is_public = 0")
      .get(businessId).count;
    const productCount = store.countProducts(db, businessId);
    const supplierCount = db
      .query("SELECT COUNT(*) as count FROM suppliers WHERE business_id = ? AND is_active = 1")
      .get(businessId).count;

    if (formulaCount === 0 && recommendations.length < 3) {
      recommendations.push({
        action: "Create your first formula",
        reason: "Formulas help calculate pour weights, costs, and batch sizes automatically",
        engine: "calculation",
        link: "/calc",
        source: "calculation",
      });
    }

    if (supplierCount === 0 && productCount > 0 && recommendations.length < 3) {
      recommendations.push({
        action: "Add a supplier",
        reason: "Suppliers enable purchase orders, lead time tracking, and smart reorder recommendations",
        engine: "purchasing",
        link: "/purchasing",
        source: "purchasing",
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        action: "Add your first product",
        reason: "Start tracking inventory by adding products to your catalog",
        engine: "inventory",
        link: "/products",
        source: "inventory",
      });
      recommendations.push({
        action: "Scan a barcode",
        reason: "Begin tracking stock movements by scanning product barcodes",
        engine: "scan",
        link: "/scan",
        source: "scan",
      });
    }
  }

  return recommendations;
}

// ── 4. Opportunities ─────────────────────────────────────────────────

function buildOpportunities(db, businessId, { lowStock, pendingBatches, unfulfilledOrders }) {
  // Read top 3 active opportunities from the unified opportunities table
  try {
    const activeOpps = db.query(
      `SELECT id, title, impact, explanation, engine, icon, action_link, action_label, confidence
       FROM opportunities
       WHERE business_id = ? AND status = 'active'
       ORDER BY
         CASE impact WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         confidence DESC,
         created_at DESC
       LIMIT 3`
    ).all(businessId);

    if (activeOpps.length > 0) {
      return activeOpps.map(o => ({
        title: o.title,
        impact: o.impact === 'high' ? 'High priority' : o.impact === 'medium' ? 'Moderate' : 'Worth reviewing',
        explanation: o.explanation || o.description || '',
        engine: o.engine || 'system',
        icon: o.icon,
        actionLabel: o.action_label,
        actionLink: o.action_link,
        opportunityId: o.id,
      }));
    }
  } catch (err) {
    console.error("[hq] Failed to read opportunities table:", err.message);
  }

  // Fallback: if no opportunities in table, return a default growth message
  const productCount = db.query(
    "SELECT COUNT(*) as count FROM products WHERE business_id = ?"
  ).get(businessId).count;

  if (productCount === 0) {
    return [{
      title: "Start building your product catalog",
      impact: "Foundation for growth",
      explanation: "Add products to unlock purchasing recommendations, production tracking, and order fulfillment",
      engine: "inventory",
    }];
  }

  return [];
}
