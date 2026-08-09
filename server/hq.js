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
import { listVariantSkuTruth } from "./sku-truth.js";

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
  const identifierExceptions = getIdentifierExceptions(db, businessId);
  const commandCenter = buildCommandCenter(db, businessId, {
    lowStock, pendingBatches, unfulfilledOrders, identifierExceptions,
  });

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
      identifierExceptions,
    },
    commandCenter,
    whatToDoNext,
    opportunities,
  };
}

function getIdentifierExceptions(db, businessId) {
  const barcodeStates = new Map(db.query(`
    SELECT id, barcode_sync_state FROM product_variants
    WHERE business_id = ? AND is_active = 1
  `).all(businessId).map(row => [row.id, row.barcode_sync_state]));
  return listVariantSkuTruth(db, businessId)
    .map(variant => ({ ...variant, barcode_sync_state: barcodeStates.get(variant.id) }))
    .filter(variant => variant.skuTruth.needsReview || variant.sku_sync_state === "MISSING"
      || ["MISSING", "REVIEW_REQUIRED", "SHOPIFY_UPDATE_FAILED"].includes(variant.barcode_sync_state))
    .slice(0, 25);
}

function buildCommandCenter(db, businessId, { lowStock, pendingBatches, unfulfilledOrders, identifierExceptions }) {
  const ordersToday = db.query(
    "SELECT COUNT(*) AS count FROM orders WHERE business_id = ? AND date(created_at) = date('now')"
  ).get(businessId).count;
  const readyToPack = db.query(
    "SELECT COUNT(*) AS count FROM orders WHERE business_id = ? AND status = 'confirmed'"
  ).get(businessId).count;
  const oldestWaiting = unfulfilledOrders[0];
  const waitingHours = oldestWaiting
    ? Math.max(0, Math.floor((Date.now() - new Date(`${oldestWaiting.created_at}Z`).getTime()) / 3600000))
    : 0;
  const exceptions = [];
  if (identifierExceptions.length) exceptions.push({
    key: "identifiers", count: identifierExceptions.length,
    title: `${identifierExceptions.length} product variant${identifierExceptions.length === 1 ? "" : "s"} need identifier review`,
    detail: "Novi prepared the catalog exceptions without changing Shopify.", link: "/products/sku-label-studio", tone: "pink",
  });
  if (pendingBatches.length) exceptions.push({
    key: "production", count: pendingBatches.length,
    title: `${pendingBatches.length} production batch${pendingBatches.length === 1 ? "" : "es"} waiting`,
    detail: "Review materials and approve production before anything is consumed.", link: "/production", tone: "purple",
  });
  if (readyToPack) exceptions.push({
    key: "packing", count: readyToPack,
    title: `${readyToPack} order${readyToPack === 1 ? " is" : "s are"} ready to pack`,
    detail: "Open fulfillment to verify items and packing steps.", link: "/fulfillment", tone: "green",
  });
  if (lowStock.length) exceptions.push({
    key: "stock", count: lowStock.length,
    title: `${lowStock.length} tracked product${lowStock.length === 1 ? " is" : "s are"} low on stock`,
    detail: "Inventory uses the same location-aware totals shown across ShimmerStock.", link: "/purchasing", tone: "amber",
  });
  if (oldestWaiting && waitingHours >= 1) exceptions.push({
    key: "customer", count: 1,
    title: `One customer has been waiting ${waitingHours} hour${waitingHours === 1 ? "" : "s"}`,
    detail: `Order #${oldestWaiting.order_number || oldestWaiting.id} is the oldest pending order.`, link: "/orders", tone: "red",
  });
  const preferences = db.query(
    "SELECT preferred_workflow, production_priority, packing_preference, updated_at FROM novi_business_preferences WHERE business_id = ?"
  ).get(businessId) || { preferred_workflow: null, production_priority: "oldest_orders_first", packing_preference: null, updated_at: null };
  return {
    brief: {
      ordersToday, readyToPack, productionWaiting: pendingBatches.length,
      lowStock: lowStock.length, oldestCustomerWaitHours: waitingHours,
      message: exceptions.length
        ? `Good morning. ${ordersToday} order${ordersToday === 1 ? " came" : "s came"} in today. I found ${exceptions.length} operational exception${exceptions.length === 1 ? "" : "s"} and sorted them by urgency.`
        : `Good morning. ${ordersToday} order${ordersToday === 1 ? " came" : "s came"} in today. You're caught up. Go do literally anything more fun than inventory.`,
    },
    exceptions,
    missions: [
      { id: "ship-today", title: "Get today's orders out", detail: "Review fulfillment queues and verify every packed item.", link: "/fulfillment" },
      { id: "restock", title: "Restock my best sellers", detail: "Review low stock and purchasing recommendations before ordering.", link: "/purchasing" },
      { id: "new-products", title: "Set up my new Shopify products", detail: "Review Novi's SKU, barcode, and label recommendations.", link: "/products/sku-label-studio" },
      { id: "launch", title: "Prepare for a launch", detail: "Coordinate production, inventory, and launch assets.", link: "/studio" },
      { id: "inventory", title: "Clean up my inventory", detail: "Review identifiers, stock truth, bins, and exceptions.", link: "/products" },
      { id: "catch-up", title: "Catch me up after vacation", detail: "Start with the real exceptions and recent activity already sorted here.", link: "/timeline" },
    ],
    preferences,
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
  if (actionType.startsWith("novi.")) return { name: "novi", icon: "✦", label: "Novi", color: "purple" };
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
  if (type === "novi.preferences_updated") return `${user} updated what Novi remembers for this business`;
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
