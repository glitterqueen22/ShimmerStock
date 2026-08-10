/**
 * Opportunity Center — Proactive Intelligence Engine
 * ===================================================
 * Identifies cross-cutting business opportunities across all engines.
 * Every opportunity is explainable (cites its data) and links to the action.
 */

import * as store from "./store.js";
import { requireAuth } from "./auth.js";

// ── Helpers ──────────────────────────────────────────────────────────

function money(val) {
  if (val == null) return null;
  return `$${Number(val).toFixed(2)}`;
}

// ── Main opportunity detection ───────────────────────────────────────

export function detectOpportunities(db, businessId) {
  const dismissed = new Set(store.getDismissedOpportunities(db, businessId));
  const allOpps = [];

  allOpps.push(...detectBundles(db, businessId, dismissed));
  allOpps.push(...detectPriceOptimizations(db, businessId, dismissed));
  allOpps.push(...detectReorderOpportunities(db, businessId, dismissed));
  allOpps.push(...detectWasteOpportunities(db, businessId, dismissed));
  allOpps.push(...detectSupplierOpportunities(db, businessId, dismissed));
  allOpps.push(...detectProductionOpportunities(db, businessId, dismissed));

  const opportunities = allOpps.filter(o => !dismissed.has(o.id));

  const impactOrder = { high: 0, medium: 1, low: 2 };
  opportunities.sort((a, b) => {
    if (impactOrder[a.impact] !== impactOrder[b.impact])
      return impactOrder[a.impact] - impactOrder[b.impact];
    return (b.confidence || 0) - (a.confidence || 0);
  });

  const highImpact = opportunities.filter(o => o.impact === "high").length;
  const estimatedMonthly = opportunities.reduce((sum, o) => {
    if (o.potentialValue && o.potentialValue.includes("/month")) {
      const num = parseFloat(o.potentialValue.replace(/[^0-9.]/g, ""));
      return sum + (isNaN(num) ? 0 : num);
    }
    return sum;
  }, 0);

  return {
    opportunities,
    summary: {
      total: opportunities.length,
      highImpact,
      estimatedValue: estimatedMonthly > 0 ? `$${estimatedMonthly.toFixed(0)}/month` : "Calculating...",
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 1. BUNDLE OPPORTUNITIES
// ═══════════════════════════════════════════════════════════════════════

function detectBundles(db, businessId, dismissed) {
  const opps = [];
  const pairs = db.query(
    `SELECT oi1.product_id as p1, oi2.product_id as p2, COUNT(DISTINCT oi1.order_id) as co_count
     FROM order_items oi1
     JOIN order_items oi2 ON oi1.order_id = oi2.order_id AND oi1.product_id < oi2.product_id
     JOIN orders o ON oi1.order_id = o.id
     WHERE oi1.product_id IS NOT NULL AND oi2.product_id IS NOT NULL AND o.business_id = ?
     GROUP BY oi1.product_id, oi2.product_id
     HAVING co_count >= 3 ORDER BY co_count DESC LIMIT 10`,
  ).all(businessId);

  for (const pair of pairs) {
    const p1 = store.getProductById(db, pair.p1, businessId);
    const p2 = store.getProductById(db, pair.p2, businessId);
    if (!p1 || !p2) continue;

    const oppId = `opp_bundle_${pair.p1}_${pair.p2}`;
    if (dismissed.has(oppId)) continue;

    const val = Math.min(pair.co_count * 8, 30);
    opps.push({
      id: oppId, type: "bundle", engine: "production", icon: "🎁",
      title: `Bundle ${p1.name} + ${p2.name}`,
      description: `These appear together in ${pair.co_count} order(s). A bundle could increase average order value.`,
      impact: val > 15 ? "high" : "medium", effort: "low",
      potentialValue: `${money(val)}/order`,
      confidence: Math.min(0.95, 0.5 + pair.co_count * 0.05),
      action: "/production?create=bom&type=bundle", actionLabel: "Create Bundle BOM",
      explanation: `Based on ${pair.co_count} orders. Bundle into a single SKU for easier fulfillment and cross-sell revenue.`,
      citedData: { product1: { id: p1.id, name: p1.name, sku: p1.sku }, product2: { id: p2.id, name: p2.name, sku: p2.sku }, coOccurrenceCount: pair.co_count, source: "commerce → production" },
    });
  }
  return opps;
}

// ═══════════════════════════════════════════════════════════════════════
// 2. PRICE OPTIMIZATION
// ═══════════════════════════════════════════════════════════════════════

function detectPriceOptimizations(db, businessId, dismissed) {
  const opps = [];
  const products = store.listProducts(db, businessId);

  for (const p of products) {
    const oppId = `opp_price_${p.id}`;
    if (dismissed.has(oppId)) continue;

    const sold = db.query(
      `SELECT COALESCE(SUM(ABS(quantity)), 0) as total_sold FROM inventory_movements
       WHERE product_id = ? AND business_id = ? AND type IN ('out', 'order')`,
    ).get(p.id, businessId);

    const totalSold = sold.total_sold || 0;
    const totalAvailable = p.stock_count + totalSold;
    if (totalAvailable === 0 || totalSold === 0) continue;

    const sellThrough = totalSold / totalAvailable;

    if (sellThrough > 0.8 && totalSold >= 5) {
      const sp = db.query("SELECT unit_cost FROM supplier_products WHERE product_id = ? AND is_preferred = 1 LIMIT 1").get(p.id);
      opps.push({
        id: oppId, type: "price_raise", engine: "commerce", icon: "💰",
        title: `Consider raising price for ${p.name}`,
        description: `${Math.round(sellThrough * 100)}% sell-through (${totalSold} sold). A modest increase could boost margins.`,
        impact: "high", effort: "low",
        potentialValue: `${money(sp?.unit_cost ? sp.unit_cost * 0.15 : 1.50)}/unit potential`,
        confidence: 0.75, action: "/products", actionLabel: "Review Product",
        explanation: `${totalSold} sold of ${totalAvailable} available (${Math.round(sellThrough * 100)}%). Current stock: ${p.stock_count}. Products above 80% sell-through often have pricing headroom.`,
        citedData: { product: { id: p.id, name: p.name, sku: p.sku }, sellThrough: `${Math.round(sellThrough * 100)}%`, totalSold, totalAvailable, source: "commerce + purchasing" },
      });
    }

    if (sellThrough < 0.3 && totalAvailable > 10 && p.stock_count > 5) {
      opps.push({
        id: `opp_price_lower_${p.id}`, type: "price_lower", engine: "commerce", icon: "🏷️",
        title: `Slow mover: ${p.name} could use promotion`,
        description: `Only ${Math.round(sellThrough * 100)}% sell-through with ${p.stock_count} units in stock. Consider a promotion.`,
        impact: "medium", effort: "low",
        potentialValue: `Clears ${p.stock_count} units`,
        confidence: 0.65, action: "/products", actionLabel: "Review Product",
        explanation: `${totalSold} sold of ${totalAvailable}. ${p.stock_count} units sitting idle — tie up capital and storage.`,
        citedData: { product: { id: p.id, name: p.name, sku: p.sku }, sellThrough: `${Math.round(sellThrough * 100)}%`, stockCount: p.stock_count, source: "commerce + inventory" },
      });
    }
  }
  return opps;
}

// ═══════════════════════════════════════════════════════════════════════
// 3. REORDER OPPORTUNITIES
// ═══════════════════════════════════════════════════════════════════════

function detectReorderOpportunities(db, businessId, dismissed) {
  const opps = [];
  const recs = store.getReorderRecommendations(db, businessId);

  for (const rec of recs.slice(0, 8)) {
    const oppId = `opp_reorder_${rec.product_id}`;
    if (dismissed.has(oppId)) continue;

    const impact = rec.urgency === "now" ? "high" : rec.urgency === "soon" ? "medium" : "low";
    const effort = rec.supplier_id ? "low" : "medium";

    let costIfDelayed = null;
    if (rec.daily_velocity > 0 && rec.unit_cost) {
      costIfDelayed = `~${money(rec.daily_velocity * rec.unit_cost * 1.5)}/day potential lost sales`;
    }

    let cheaperAlt = null;
    if (rec.supplier_id) {
      const alt = db.query(
        `SELECT s.name, sp.unit_cost FROM supplier_products sp JOIN suppliers s ON sp.supplier_id = s.id
         WHERE sp.product_id = ? AND sp.supplier_id != ? AND s.is_active = 1 AND s.business_id = ?
         ORDER BY sp.unit_cost ASC LIMIT 1`,
      ).all(rec.product_id, rec.supplier_id, businessId);
      if (alt.length > 0 && alt[0].unit_cost != null && rec.unit_cost != null && alt[0].unit_cost < rec.unit_cost) {
        cheaperAlt = { supplierName: alt[0].name, unitCost: alt[0].unit_cost, savings: rec.unit_cost - alt[0].unit_cost };
      }
    }

    const parts = [
      `${rec.product_name}: ${rec.current_stock} units`,
      rec.daily_velocity > 0 ? `~${rec.daily_velocity.toFixed(1)}/day` : "no velocity",
      `${rec.days_remaining}d remaining`,
      rec.supplier_name ? `${rec.supplier_name} (${rec.lead_time_days}d lead)` : "no supplier",
      rec.unit_cost ? `cost: ${money(rec.unit_cost)}` : null,
      costIfDelayed,
      cheaperAlt ? `${cheaperAlt.supplierName} at ${money(cheaperAlt.unitCost)} saves ${money(cheaperAlt.savings)}/unit` : null,
    ].filter(Boolean);

    opps.push({
      id: oppId, type: "reorder", engine: "purchasing", icon: "📦",
      title: `Reorder ${rec.product_name}`,
      description: `${rec.current_stock <= 0 ? "OUT OF STOCK" : `Only ${rec.current_stock} units`} — ${rec.days_remaining}d of stock. Reorder ${rec.reorder_qty} ${rec.unit_type || "units"}.`,
      impact, effort,
      potentialValue: costIfDelayed || `${money(rec.unit_cost ? rec.unit_cost * rec.reorder_qty : 0)} order`,
      confidence: 0.9,
      action: rec.supplier_id ? `/purchasing?create=po&supplier=${rec.supplier_id}` : "/purchasing",
      actionLabel: rec.supplier_id ? "Create Purchase Order" : "Link Supplier First",
      explanation: parts.join(". ") + ".",
      citedData: {
        product: { id: rec.product_id, name: rec.product_name, sku: rec.sku },
        currentStock: rec.current_stock, dailyVelocity: rec.daily_velocity,
        daysRemaining: rec.days_remaining, reorderQty: rec.reorder_qty,
        supplier: rec.supplier_name, leadTimeDays: rec.lead_time_days,
        cheaperAlternative: cheaperAlt, source: "purchasing",
      },
    });
  }
  return opps;
}

// ═══════════════════════════════════════════════════════════════════════
// 4. WASTE REDUCTION
// ═══════════════════════════════════════════════════════════════════════

function detectWasteOpportunities(db, businessId, dismissed) {
  const opps = [];

  const slow = db.query(
    `SELECT p.id, p.name, p.sku, p.stock_count, MAX(im.created_at) as last_movement
     FROM products p LEFT JOIN inventory_movements im ON im.product_id = p.id AND im.business_id = ?
     WHERE p.business_id = ? AND p.stock_count > 0
     GROUP BY p.id HAVING last_movement IS NOT NULL AND last_movement < datetime('now', '-30 days')
     ORDER BY p.stock_count DESC LIMIT 10`,
  ).all(businessId, businessId);

  for (const sp of slow) {
    const oppId = `opp_waste_slow_${sp.id}`;
    if (dismissed.has(oppId)) continue;
    const days = sp.last_movement ? Math.round((Date.now() - new Date(sp.last_movement).getTime()) / 86400000) : null;
    if (!days) continue; // skip products that have never had a movement (likely new)

    opps.push({
      id: oppId, type: "waste", engine: "inventory", icon: "🗑️",
      title: `${sp.name} hasn't moved in ${days}d`,
      description: `${sp.stock_count} units idle for ${days}d. Consider promoting or repurposing.`,
      impact: sp.stock_count > 10 ? "high" : "medium", effort: "medium",
      potentialValue: `Frees up ${sp.stock_count} units`,
      confidence: 0.7, action: "/products", actionLabel: "Review Product",
      explanation: `No movement for ${days}d. ${sp.stock_count} units tying up capital. Consider flash sale, bundle inclusion, or repurposing.`,
      citedData: { product: { id: sp.id, name: sp.name, sku: sp.sku }, stockCount: sp.stock_count, daysSinceLastMovement: days, source: "inventory" },
    });
  }

  const batchCancels = db.query(
    `SELECT b.id as bom_id, b.name as bom_name,
            COUNT(CASE WHEN pb.status = 'cancelled' THEN 1 END) as cancelled, COUNT(*) as total
     FROM boms b JOIN production_batches pb ON pb.bom_id = b.id
     WHERE b.business_id = ? GROUP BY b.id
     HAVING total >= 3 AND CAST(COUNT(CASE WHEN pb.status = 'cancelled' THEN 1 END) AS REAL) / COUNT(*) > 0.3 LIMIT 5`,
  ).all(businessId);

  for (const bs of batchCancels) {
    const oppId = `opp_waste_cancel_${bs.bom_id}`;
    if (dismissed.has(oppId)) continue;
    const rate = Math.round((bs.cancelled / bs.total) * 100);
    opps.push({
      id: oppId, type: "waste", engine: "production", icon: "⚠️",
      title: `High cancellation: "${bs.bom_name}"`,
      description: `${bs.cancelled}/${bs.total} batches (${rate}%) cancelled. May indicate BOM design issues.`,
      impact: "medium", effort: "medium",
      potentialValue: "Reduced waste & rework", confidence: 0.6,
      action: `/production?edit=${bs.bom_id}`, actionLabel: "Review BOM",
      explanation: `${rate}% cancellation across ${bs.total} batches. Review BOM quantities and pre-flight stock checks.`,
      citedData: { bomId: bs.bom_id, bomName: bs.bom_name, cancelled: bs.cancelled, total: bs.total, cancelRate: `${rate}%`, source: "production" },
    });
  }
  return opps;
}

// ═══════════════════════════════════════════════════════════════════════
// 5. SUPPLIER NEGOTIATION
// ═══════════════════════════════════════════════════════════════════════

function detectSupplierOpportunities(db, businessId, dismissed) {
  const opps = [];
  const suppliers = store.listSuppliers(db, businessId);

  for (const supplier of suppliers) {
    const oppId = `opp_supplier_lead_${supplier.id}`;

    if (!dismissed.has(oppId)) {
      const leadTimes = db.query(
        `SELECT julianday(received_date) - julianday(order_date) as actual_days
         FROM purchase_orders WHERE supplier_id = ? AND business_id = ? AND status = 'received'
         AND order_date IS NOT NULL AND received_date IS NOT NULL
         ORDER BY received_date DESC LIMIT 5`,
      ).all(supplier.id, businessId);

      if (leadTimes.length >= 3) {
        const avgRecent = leadTimes.reduce((s, lt) => s + lt.actual_days, 0) / leadTimes.length;
        const quotedRow = db.query("SELECT AVG(quoted_lead_time_days) as avg_quoted FROM supplier_products WHERE supplier_id = ?").get(supplier.id);
        const quoted = quotedRow?.avg_quoted || 7;

        if (avgRecent > quoted * 1.2) {
          opps.push({
            id: oppId, type: "supplier", engine: "purchasing", icon: "📞",
            title: `Negotiate with ${supplier.name} — lead times slipping`,
            description: `Actual avg ${Math.round(avgRecent)}d vs ${Math.round(quoted)}d quoted (+${Math.round(((avgRecent - quoted) / quoted) * 100)}%). Renegotiate or find alternatives.`,
            impact: "high", effort: "medium",
            potentialValue: `Reduce from ${Math.round(avgRecent)} to ${Math.round(quoted)}d`, confidence: 0.75,
            action: `/purchasing?supplier=${supplier.id}`, actionLabel: "Review Supplier",
            explanation: `Over ${leadTimes.length} completed orders, avg delivery: ${Math.round(avgRecent)}d vs quoted ${Math.round(quoted)}d. Consider renegotiating or qualifying a backup.`,
            citedData: { supplier: { id: supplier.id, name: supplier.name }, avgActualDays: Math.round(avgRecent), quotedDays: Math.round(quoted), percentIncrease: Math.round(((avgRecent - quoted) / quoted) * 100), recentOrderCount: leadTimes.length, source: "purchasing" },
          });
        }
      }
    }

    const productCount = db.query("SELECT COUNT(*) as count FROM supplier_products WHERE supplier_id = ?").get(supplier.id).count;
    if (productCount >= 3) {
      const oppId2 = `opp_supplier_volume_${supplier.id}`;
      if (!dismissed.has(oppId2)) {
        opps.push({
          id: oppId2, type: "supplier", engine: "purchasing", icon: "📊",
          title: `Volume discount from ${supplier.name}?`,
          description: `You source ${productCount} products from ${supplier.name}. You may qualify for bulk pricing.`,
          impact: "medium", effort: "low",
          potentialValue: "5-15% cost reduction", confidence: 0.55,
          action: `/purchasing?supplier=${supplier.id}`, actionLabel: "Contact Supplier",
          explanation: `${productCount} products from ${supplier.name}. Tiered pricing often starts at 3+ SKUs. A 5-15% discount could reduce COGS significantly.`,
          citedData: { supplier: { id: supplier.id, name: supplier.name }, productCount, source: "purchasing" },
        });
      }
    }
  }

  // Alternative suppliers with better pricing
  const multiSupplier = db.query(
    `SELECT p.id as product_id, p.name as product_name, p.sku, COUNT(DISTINCT sp.supplier_id) as supplier_count
     FROM products p JOIN supplier_products sp ON sp.product_id = p.id
     WHERE p.business_id = ? GROUP BY p.id HAVING supplier_count > 1 LIMIT 10`,
  ).all(businessId);

  for (const pwms of multiSupplier) {
    const oppId = `opp_supplier_alt_${pwms.product_id}`;
    if (dismissed.has(oppId)) continue;

    const allS = db.query(
      `SELECT s.id, s.name, sp.unit_cost, sp.quoted_lead_time_days, sp.is_preferred
       FROM supplier_products sp JOIN suppliers s ON sp.supplier_id = s.id
       WHERE sp.product_id = ? AND s.is_active = 1 AND s.business_id = ? ORDER BY sp.unit_cost ASC`,
    ).all(pwms.product_id, businessId);

    if (allS.length >= 2) {
      const pref = allS.find(s => s.is_preferred);
      const cheapest = allS[0];
      if (pref && cheapest.id !== pref.id && cheapest.unit_cost != null && pref.unit_cost != null && cheapest.unit_cost < pref.unit_cost) {
        const savings = pref.unit_cost - cheapest.unit_cost;
        opps.push({
          id: oppId, type: "supplier", engine: "purchasing", icon: "💸",
          title: `Switch ${pwms.product_name} to ${cheapest.name}`,
          description: `${cheapest.name}: ${money(cheapest.unit_cost)}/unit — save ${money(savings)} vs ${pref.name} (${money(pref.unit_cost)}).`,
          impact: savings > 2 ? "high" : "medium", effort: "low",
          potentialValue: `Save ${money(savings)}/unit`, confidence: 0.8,
          action: `/purchasing?supplier=${cheapest.id}`, actionLabel: "Compare Suppliers",
          explanation: `${cheapest.name}: ${money(cheapest.unit_cost)} vs ${pref.name}: ${money(pref.unit_cost)}. Saving ${Math.round((savings / pref.unit_cost) * 100)}%. Check lead times and MOQs before switching.`,
          citedData: { product: { id: pwms.product_id, name: pwms.product_name, sku: pwms.sku }, currentSupplier: { id: pref.id, name: pref.name, unitCost: pref.unit_cost }, alternativeSupplier: { id: cheapest.id, name: cheapest.name, unitCost: cheapest.unit_cost }, savingsPerUnit: savings, source: "purchasing" },
        });
      }
    }
  }

  return opps;
}

// ═══════════════════════════════════════════════════════════════════════
// 6. PRODUCTION EFFICIENCY
// ═══════════════════════════════════════════════════════════════════════

function detectProductionOpportunities(db, businessId, dismissed) {
  const opps = [];

  const bomCount = db.query("SELECT COUNT(*) as count FROM boms WHERE business_id = ? AND is_active = 1").get(businessId).count;
  const pendingCount = db.query("SELECT COUNT(*) as count FROM production_batches WHERE business_id = ? AND status IN ('draft', 'in_progress')").get(businessId).count;

  if (bomCount > 0 && pendingCount === 0) {
    opps.push({
      id: "opp_prod_idle", type: "production", engine: "production", icon: "🏭",
      title: "Production floor is idle",
      description: `${bomCount} active BOM(s) but no batches in progress. Check what needs manufacturing.`,
      impact: "medium", effort: "low",
      potentialValue: "Keeps production flowing", confidence: 0.7,
      action: "/production", actionLabel: "Start Production",
      explanation: `${bomCount} BOM(s) active but no pending batches. Check low-stock products and create batches.`,
      citedData: { activeBOMs: bomCount, pendingBatches: 0, source: "production" },
    });
  }

  if (bomCount > 0) {
    const unused = db.query(
      `SELECT b.id, b.name, p.name as output_product_name
       FROM boms b JOIN products p ON b.output_product_id = p.id
       LEFT JOIN production_batches pb ON pb.bom_id = b.id
       WHERE b.business_id = ? AND b.is_active = 1 AND pb.id IS NULL
       GROUP BY b.id LIMIT 5`,
    ).all(businessId);

    for (const ub of unused) {
      const oppId = `opp_prod_unused_${ub.id}`;
      if (dismissed.has(oppId)) continue;
      opps.push({
        id: oppId, type: "production", engine: "production", icon: "📋",
        title: `BOM "${ub.name}" never used`,
        description: `This BOM for ${ub.output_product_name} has never been run. Create a batch or archive it.`,
        impact: "low", effort: "low",
        potentialValue: "Clean up or activate", confidence: 0.6,
        action: `/production?bom=${ub.id}`, actionLabel: "Review BOM",
        explanation: `"${ub.name}" created but never used. Either manufacture ${ub.output_product_name} or deactivate to keep workspace clean.`,
        citedData: { bomId: ub.id, bomName: ub.name, outputProduct: ub.output_product_name, source: "production" },
      });
    }
  }

  return opps;
}

// ── Mount routes ─────────────────────────────────────────────────────

export function mountOpportunityRoutes(app, db) {
  // GET /api/opportunities — list opportunities from the unified table
  app.get("/api/opportunities", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const filters = {};
      if (req.query.status) filters.status = req.query.status;
      if (req.query.type && req.query.type !== "all") filters.type = req.query.type;
      if (req.query.impact) filters.impact = req.query.impact;
      if (req.query.engine) filters.engine = req.query.engine;

      const opportunities = store.getOpportunities(db, req.businessId, filters);
      const summary = store.getOpportunitySummary(db, req.businessId);

      res.json({ opportunities, summary });
    } catch (err) {
      console.error("GET /api/opportunities error:", err);
      res.status(500).json({ error: "Failed to list opportunities" });
    }
  });

  // GET /api/opportunities/summary — AI-consumable summary (BEFORE :id)
  app.get("/api/opportunities/summary", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const summary = store.getOpportunitySummary(db, req.businessId);
      const ownerAttention = store.getOwnerAttentionSummary(db, req.businessId);
      const topOpportunities = store.getOpportunities(db, req.businessId, { status: "active", limit: 5 });

      // Compute type breakdown from source_event_type
      const typeBreakdown = {};
      for (const opp of topOpportunities) {
        const t = opp.source_event_type || "other";
        typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
      }

      res.json({
        engine: "opportunities",
        timestamp: new Date().toISOString(),
        summary: {
          total: summary.total || summary.active || 0,
          highImpact: summary.highImpact || 0,
          byStatus: summary.byStatus || {},
        },
        ownerAttention,
        topOpportunities: topOpportunities.map(o => ({
          id: o.id,
          type: o.source_event_type,
          title: o.title,
          impact: o.impact,
          confidence: o.confidence,
          action: o.action_link || null,
        })),
        typeBreakdown,
        totalCount: topOpportunities.length,
      });
    } catch (err) {
      console.error("GET /api/opportunities/summary error:", err);
      res.status(500).json({ error: "Failed to generate summary" });
    }
  });

  // GET /api/opportunities/:id — single opportunity detail
  app.get("/api/opportunities/:id", requireAuth(db, "reports.read"), (req, res) => {
    try {
      if (req.params.id === "summary") return; // handled above
      if (req.params.id === "refresh") return; // handled below: POST /api/opportunities/refresh

      const opp = store.getOpportunity(db, req.params.id);

      if (!opp) {
        return res.status(404).json({ error: "Opportunity not found" });
      }

      res.json(opp);
    } catch (err) {
      console.error("GET /api/opportunities/:id error:", err);
      res.status(500).json({ error: "Failed to fetch opportunity" });
    }
  });

  // POST /api/opportunities/:id/dismiss — dismiss an opportunity
  app.post("/api/opportunities/:id/dismiss", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const opportunityId = req.params.id;
      const result = store.updateOpportunityStatus(db, opportunityId, "dismissed", req.user?.id);

      // Also add to legacy dismissed_opportunities for backward compat
      const opp = store.getOpportunity(db, opportunityId);
      if (opp) {
        try {
          store.dismissOpportunity(db, {
            businessId: opp.business_id,
            opportunityId: `opp_${opp.source_event_type}_${opp.id}`,
            dismissedBy: req.user?.id,
          });
        } catch { /* ignore duplicates */ }
      }

      res.json({ success: true, dismissed: Number(opportunityId), id: result?.id });
    } catch (err) {
      console.error("POST /api/opportunities/:id/dismiss error:", err);
      res.status(500).json({ error: "Failed to dismiss opportunity" });
    }
  });

  // POST /api/opportunities/:id/snooze — snooze an opportunity
  app.post("/api/opportunities/:id/snooze", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const opportunityId = req.params.id;
      const snoozeUntil = req.body?.snooze_until || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const result = store.snoozeOpportunity(db, opportunityId, snoozeUntil);

      res.json({ success: true, id: Number(opportunityId), snoozedUntil: snoozeUntil });
    } catch (err) {
      console.error("POST /api/opportunities/:id/snooze error:", err);
      res.status(500).json({ error: "Failed to snooze opportunity" });
    }
  });

  // POST /api/opportunities/:id/complete — mark an opportunity as completed
  app.post("/api/opportunities/:id/complete", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const opportunityId = req.params.id;
      const result = store.updateOpportunityStatus(db, opportunityId, "completed", req.user?.id);

      res.json({ success: true, id: Number(opportunityId), completedAt: new Date().toISOString() });
    } catch (err) {
      console.error("POST /api/opportunities/:id/complete error:", err);
      res.status(500).json({ error: "Failed to complete opportunity" });
    }
  });

  // POST /api/opportunities/refresh — trigger re-scan via bridge
  // This MUST be defined BEFORE the :id routes to avoid matching "refresh" as an ID
  app.post("/api/opportunities/refresh", requireAuth(db, "reports.read"), async (req, res) => {
    try {
      // Dynamic import to avoid circular dependency
      const bridge = await import("./opportunity-bridge.js");
      const result = await bridge.runAllDetectors(db, req.businessId);

      // Return updated list
      const opportunities = store.getOpportunities(db, req.businessId, { status: "active" });
      const summary = store.getOpportunitySummary(db, req.businessId);

      res.json({
        success: true,
        result: { detectorResults: result },
        opportunities,
        summary,
      });
    } catch (err) {
      console.error("POST /api/opportunities/refresh error:", err);
      res.status(500).json({ error: "Failed to refresh opportunities" });
    }
  });
}
