/**
 * Business Health Score Engine
 * =============================
 * Computes a composite 0-100 health score across all engines with
 * explainable breakdowns, trend tracking, and recommendations.
 *
 * Every engine contributes a sub-score. The composite is a weighted average.
 * Snapshots are taken once per day for trend analysis.
 */

import * as store from "./store.js";
import { requireAuth } from "./auth.js";

// ── Engine weights ─────────────────────────────────────────────────────

const WEIGHTS = {
  inventory: 0.20,
  production: 0.15,
  purchasing: 0.15,
  commerce: 0.25,
  operations: 0.15,
  quality: 0.10,
};

// ── Label helpers ──────────────────────────────────────────────────────

function scoreLabel(score) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Doing Well";
  if (score >= 60) return "Good";
  if (score >= 40) return "Needs Attention";
  return "Critical";
}

function scoreColor(score) {
  if (score >= 90) return "green";
  if (score >= 75) return "blue";
  if (score >= 60) return "amber";
  if (score >= 40) return "orange";
  return "red";
}

// ── Engine Calculators ─────────────────────────────────────────────────

function calcInventoryHealth(db, businessId) {
  // Stock accuracy: % products where stock_count > 0 or tracked recently
  const products = db
    .query("SELECT COUNT(*) as total FROM products WHERE business_id = ?")
    .get(businessId);
  const totalProducts = products?.total || 0;

  if (totalProducts === 0) return { score: 0, details: { totalProducts: 0 }, recommendation: null };

  // Empty stock ratio
  const emptyStock = db
    .query("SELECT COUNT(*) as count FROM products WHERE business_id = ? AND stock_count <= 0")
    .get(businessId);
  const emptyRatio = emptyStock?.count / totalProducts;
  const emptyScore = Math.round((1 - emptyRatio) * 100);

  // Low stock ratio (products below threshold)
  const thresholds = db
    .query("SELECT COUNT(*) as count FROM inventory_thresholds WHERE business_id = ?")
    .get(businessId);
  let lowStockScore = 100;
  if (thresholds?.count > 0) {
    const lowStock = db
      .query(
        `SELECT COUNT(*) as count FROM products p
         JOIN inventory_thresholds t ON p.id = t.product_id AND t.business_id = ?
         WHERE p.business_id = ? AND p.stock_count <= t.reorder_point`
      )
      .all(businessId, businessId);
    const lowRatio = (lowStock?.[0]?.count || 0) / totalProducts;
    lowStockScore = Math.round((1 - lowRatio) * 100);
  }

  // Audit accuracy: recent movements with proper tracking
  const recentMoves = db
    .query(
      `SELECT COUNT(*) as count FROM inventory_movements
       WHERE business_id = ? AND created_at >= datetime('now', '-30 days')`
    )
    .get(businessId);
  const activityScore = recentMoves?.count > 0 ? 85 : 50;

  const score = Math.round((emptyScore + lowStockScore + activityScore) / 3);

  let recommendation = null;
  if (emptyRatio > 0.3) {
    recommendation = {
      engine: "inventory",
      text: `${Math.round(emptyRatio * 100)}% of products are out of stock — restock or update inventory counts`,
      impact: "high",
    };
  } else if (score < 60) {
    recommendation = {
      engine: "inventory",
      text: `Inventory accuracy is at ${score}% — consider a full stock count`,
      impact: "medium",
    };
  }

  return {
    score,
    details: {
      totalProducts,
      emptyStockCount: emptyStock?.count || 0,
      emptyRatio: Math.round(emptyRatio * 100),
      lowStockRatio: Math.round(((thresholds?.count > 0 ? (totalProducts - (lowStockScore * totalProducts / 100)) : 0) / Math.max(totalProducts, 1)) * 100),
    },
    recommendation,
  };
}

function calcProductionHealth(db, businessId) {
  // Batch success rate
  const batchStats = db
    .query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
       FROM production_batches WHERE business_id = ?`
    )
    .get(businessId);

  const totalBatches = batchStats?.total || 0;
  const completedBatches = batchStats?.completed || 0;
  const cancelledBatches = batchStats?.cancelled || 0;
  const finishedBatches = completedBatches + cancelledBatches;

  let batchSuccessScore = 100;
  if (finishedBatches > 0) {
    batchSuccessScore = Math.round((completedBatches / finishedBatches) * 100);
  }

  // Output accuracy: compare planned vs actual in batch_movements
  const outputAccuracy = db
    .query(
      `SELECT
        SUM(ABS(COALESCE(actual_quantity, 0) - COALESCE(planned_quantity, 0))) as total_deviation,
        SUM(COALESCE(planned_quantity, 0)) as total_planned
       FROM batch_movements bm
       JOIN production_batches pb ON bm.batch_id = pb.id
       WHERE pb.business_id = ? AND pb.status = 'completed'`
    )
    .get(businessId);

  let outputAccuracyScore = 100;
  if (outputAccuracy?.total_planned > 0 && outputAccuracy?.total_deviation !== null) {
    const devRatio = outputAccuracy.total_deviation / outputAccuracy.total_planned;
    outputAccuracyScore = Math.max(0, Math.round((1 - Math.min(devRatio, 1)) * 100));
  }

  // BOM coverage
  const productCount = db
    .query("SELECT COUNT(*) as count FROM products WHERE business_id = ?")
    .get(businessId)?.count || 0;
  const bomProductCount = db
    .query(
      `SELECT COUNT(DISTINCT output_product_id) as count FROM boms
       WHERE business_id = ? AND is_active = 1`
    )
    .get(businessId)?.count || 0;
  const bomCoverageScore = productCount > 0 ? Math.round((bomProductCount / productCount) * 100) : 0;

  const score = Math.round((batchSuccessScore + outputAccuracyScore + bomCoverageScore) / 3);

  let recommendation = null;
  if (totalBatches === 0) {
    recommendation = {
      engine: "production",
      text: "No production batches yet — create a BOM to start manufacturing",
      impact: "low",
    };
  } else if (cancelledBatches > completedBatches) {
    recommendation = {
      engine: "production",
      text: `${cancelledBatches} batch(es) cancelled — review production issues`,
      impact: "high",
    };
  }

  return {
    score,
    details: {
      totalBatches,
      completedBatches,
      cancelledBatches,
      batchSuccessRate: batchSuccessScore,
      bomCoverage: bomCoverageScore,
    },
    recommendation,
  };
}

function calcPurchasingHealth(db, businessId) {
  // Reorder threshold coverage
  const productCount = db
    .query("SELECT COUNT(*) as count FROM products WHERE business_id = ?")
    .get(businessId)?.count || 0;
  const thresholdCount = db
    .query("SELECT COUNT(*) as count FROM inventory_thresholds WHERE business_id = ?")
    .get(businessId)?.count || 0;
  const thresholdCoverageScore = productCount > 0 ? Math.round((thresholdCount / productCount) * 100) : 0;

  // Supplier coverage
  const supplierProductCount = db
    .query(
      `SELECT COUNT(DISTINCT product_id) as count FROM supplier_products sp
       JOIN suppliers s ON sp.supplier_id = s.id
       WHERE s.business_id = ?`
    )
    .get(businessId)?.count || 0;
  const supplierCoverageScore = productCount > 0 ? Math.round((supplierProductCount / productCount) * 100) : 0;

  // PO timeliness: % POs received within expected timeframe
  const poStats = db
    .query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) as received,
        SUM(CASE WHEN status = 'received'
              AND expected_delivery IS NOT NULL
              AND date(received_date) <= date(expected_delivery)
            THEN 1 ELSE 0 END) as on_time
       FROM purchase_orders WHERE business_id = ? AND status IN ('received', 'ordered', 'draft')`
    )
    .get(businessId);

  let poTimelinessScore = 100;
  const totalReceived = poStats?.received || 0;
  if (totalReceived > 0) {
    const onTime = poStats?.on_time || 0;
    poTimelinessScore = Math.round((onTime / totalReceived) * 100);
  }

  const score = Math.round((thresholdCoverageScore + supplierCoverageScore + poTimelinessScore) / 3);

  let recommendation = null;
  if (thresholdCoverageScore < 30) {
    recommendation = {
      engine: "purchasing",
      text: `Only ${thresholdCoverageScore}% of products have reorder thresholds — set thresholds to avoid stockouts`,
      impact: "high",
    };
  } else if (supplierCoverageScore < 50) {
    recommendation = {
      engine: "purchasing",
      text: `${supplierCoverageScore}% supplier coverage — link suppliers to products for better ordering`,
      impact: "medium",
    };
  }

  return {
    score,
    details: {
      thresholdCoverage: thresholdCoverageScore,
      supplierCoverage: supplierCoverageScore,
      poOnTimeRate: poTimelinessScore,
      totalReceived,
    },
    recommendation,
  };
}

function calcCommerceHealth(db, businessId) {
  // Order fulfillment rate
  const orderStats = db
    .query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN o.status IN ('fulfilled', 'completed', 'shipped') THEN 1 ELSE 0 END) as fulfilled
       FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE oi.product_id IN (SELECT id FROM products WHERE business_id = ?)`
    )
    .get(businessId);

  const totalOrders = orderStats?.total || 0;
  const fulfilledOrders = orderStats?.fulfilled || 0;
  let fulfillmentScore = 100;
  if (totalOrders > 0) {
    fulfillmentScore = Math.round((fulfilledOrders / totalOrders) * 100);
  }

  // Channel diversity: based on shopify_sync_log providers
  const channels = db
    .query(
      `SELECT COUNT(DISTINCT provider) as count FROM shopify_sync_log
       WHERE business_id = ?`
    )
    .get(businessId);
  const channelCount = channels?.count || 0;
  const channelScore = channelCount >= 2 ? 100 : channelCount === 1 ? 70 : 50;

  // Sales velocity: orders last 14 days vs previous 14 days
  const recentOrders = db
    .query(
      `SELECT COUNT(*) as count FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE oi.product_id IN (SELECT id FROM products WHERE business_id = ?)
       AND o.created_at >= datetime('now', '-14 days')`
    )
    .get(businessId)?.count || 0;

  const priorOrders = db
    .query(
      `SELECT COUNT(*) as count FROM orders o
       JOIN order_items oi ON o.id = oi.order_id
       WHERE oi.product_id IN (SELECT id FROM products WHERE business_id = ?)
       AND o.created_at >= datetime('now', '-28 days')
       AND o.created_at < datetime('now', '-14 days')`
    )
    .get(businessId)?.count || 0;

  let velocityScore = 70; // neutral
  if (priorOrders > 0 && recentOrders > 0) {
    const ratio = recentOrders / priorOrders;
    if (ratio >= 1.2) velocityScore = 100; // growing
    else if (ratio >= 0.9) velocityScore = 80; // stable
    else if (ratio >= 0.7) velocityScore = 60; // slowing
    else velocityScore = 40; // declining
  } else if (recentOrders > 0) {
    velocityScore = 85; // new activity
  }

  const score = Math.round((fulfillmentScore + channelScore + velocityScore) / 3);

  let recommendation = null;
  if (totalOrders > 0 && fulfillmentScore < 70) {
    recommendation = {
      engine: "commerce",
      text: `${Math.round((totalOrders - fulfilledOrders))} orders pending fulfillment — ship orders to improve score`,
      impact: "high",
    };
  }

  return {
    score,
    details: {
      totalOrders,
      fulfilledOrders,
      fulfillmentRate: fulfillmentScore,
      channelCount,
      recentOrders14d: recentOrders,
      priorOrders14d: priorOrders,
      velocityScore,
    },
    recommendation,
  };
}

function calcOperationsHealth(db, businessId) {
  // Audit coverage: check ratio of data-changing actions to audit entries
  const auditCount = db
    .query("SELECT COUNT(*) as count FROM audit_log WHERE business_id = ? AND created_at >= datetime('now', '-30 days')")
    .get(businessId)?.count || 0;

  const inventoryMoves = db
    .query("SELECT COUNT(*) as count FROM inventory_movements WHERE business_id = ? AND created_at >= datetime('now', '-30 days')")
    .get(businessId)?.count || 0;

  // If there's activity, audit entries should exist
  let auditScore = 100;
  if (inventoryMoves > 0) {
    auditScore = Math.min(100, Math.round((auditCount / Math.max(inventoryMoves, 1)) * 100));
  }

  // Sync health: % successful syncs
  const syncStats = db
    .query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful
       FROM shopify_sync_log WHERE business_id = ?`
    )
    .get(businessId);
  const totalSyncs = syncStats?.total || 0;
  let syncScore = 100;
  if (totalSyncs > 0) {
    syncScore = Math.round(((syncStats?.successful || 0) / totalSyncs) * 100);
  }

  // User activity: days since last activity
  const lastActivity = db
    .query(
      `SELECT MAX(created_at) as last_date FROM audit_log WHERE business_id = ?`
    )
    .get(businessId);
  let activityScore = 50; // unknown
  if (lastActivity?.last_date) {
    const daysSince = (Date.now() - new Date(lastActivity.last_date + 'Z').getTime()) / 86400000;
    if (daysSince <= 1) activityScore = 100;
    else if (daysSince <= 3) activityScore = 90;
    else if (daysSince <= 7) activityScore = 75;
    else if (daysSince <= 14) activityScore = 60;
    else activityScore = 30;
  }

  const score = Math.round((auditScore + syncScore + activityScore) / 3);

  let recommendation = null;
  if (syncScore < 80 && totalSyncs > 5) {
    recommendation = {
      engine: "operations",
      text: `${Math.round(100 - syncScore)}% of syncs failed — check Shopify connection`,
      impact: "medium",
    };
  }

  return {
    score,
    details: {
      auditEntries: auditCount,
      recentMovements: inventoryMoves,
      syncSuccessRate: syncScore,
      totalSyncs,
      lastActivity: lastActivity?.last_date || null,
    },
    recommendation,
  };
}

function calcQualityHealth(db, businessId) {
  // Error rate from sync log
  const syncStats = db
    .query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'error' OR status = 'failed' THEN 1 ELSE 0 END) as errors
       FROM shopify_sync_log WHERE business_id = ?`
    )
    .get(businessId);
  const totalSyncs = syncStats?.total || 0;
  const errors = syncStats?.errors || 0;
  let errorScore = 100;
  if (totalSyncs > 0) {
    errorScore = Math.round(((totalSyncs - errors) / totalSyncs) * 100);
  }

  // Data completeness: % products with name, sku
  const totalProducts = db
    .query("SELECT COUNT(*) as count FROM products WHERE business_id = ?")
    .get(businessId)?.count || 0;
  const completeProducts = db
    .query(
      `SELECT COUNT(*) as count FROM products
       WHERE business_id = ? AND name IS NOT NULL AND name != '' AND sku IS NOT NULL AND sku != ''`
    )
    .get(businessId)?.count || 0;
  const completenessScore = totalProducts > 0 ? Math.round((completeProducts / totalProducts) * 100) : 0;

  const score = Math.round((errorScore + completenessScore) / 2);

  let recommendation = null;
  if (completenessScore < 80 && totalProducts > 0) {
    recommendation = {
      engine: "quality",
      text: `${totalProducts - completeProducts} product(s) missing name or SKU — complete product data for better tracking`,
      impact: "low",
    };
  }

  return {
    score,
    details: {
      totalSyncs,
      errors,
      errorRate: errorScore,
      totalProducts,
      completeProducts,
      completenessRate: completenessScore,
    },
    recommendation,
  };
}

// ── Core: getHealthScore ──────────────────────────────────────────────

/**
 * Compute the full health score for a business.
 * Returns { score, label, breakdown, recommendations, trend, lastUpdated }
 */
export function getHealthScore(db, businessId) {
  // Check if business has any data at all
  const productCount = db
    .query("SELECT COUNT(*) as count FROM products WHERE business_id = ?")
    .get(businessId)?.count || 0;

  if (productCount === 0) {
    return {
      score: 0,
      label: "Just Getting Started",
      breakdown: {
        inventory: { score: 0, label: "Just Getting Started", weight: WEIGHTS.inventory },
        production: { score: 0, label: "Just Getting Started", weight: WEIGHTS.production },
        purchasing: { score: 0, label: "Just Getting Started", weight: WEIGHTS.purchasing },
        commerce: { score: 0, label: "Just Getting Started", weight: WEIGHTS.commerce },
        operations: { score: 0, label: "Just Getting Started", weight: WEIGHTS.operations },
        quality: { score: 0, label: "Just Getting Started", weight: WEIGHTS.quality },
      },
      recommendations: [{
        engine: "general",
        text: "Add your first product to start tracking business health",
        impact: "high",
      }],
      trend: "stable",
      lastUpdated: new Date().toISOString(),
    };
  }

  const inventory = calcInventoryHealth(db, businessId);
  const production = calcProductionHealth(db, businessId);
  const purchasing = calcPurchasingHealth(db, businessId);
  const commerce = calcCommerceHealth(db, businessId);
  const operations = calcOperationsHealth(db, businessId);
  const quality = calcQualityHealth(db, businessId);

  const engines = { inventory, production, purchasing, commerce, operations, quality };

  // Calculate weighted score
  let compositeScore = 0;
  for (const [key, engine] of Object.entries(engines)) {
    compositeScore += engine.score * WEIGHTS[key];
  }
  compositeScore = Math.round(compositeScore);

  // Build breakdown
  const breakdown = {};
  for (const [key, engine] of Object.entries(engines)) {
    breakdown[key] = {
      score: engine.score,
      label: scoreLabel(engine.score),
      weight: WEIGHTS[key],
    };
  }

  // Collect recommendations (high/medium impact, top 3)
  const recommendations = Object.values(engines)
    .filter((e) => e.recommendation)
    .map((e) => e.recommendation)
    .filter((r) => r.impact === "high" || r.impact === "medium")
    .slice(0, 4);

  // Trend: compare to yesterday's snapshot
  let trend = "stable";
  try {
    const yesterday = db
      .query(
        `SELECT score FROM health_snapshots
         WHERE business_id = ?
         AND date(created_at) < date('now')
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(businessId);
    if (yesterday) {
      if (compositeScore > yesterday.score + 3) trend = "up";
      else if (compositeScore < yesterday.score - 3) trend = "down";
    }
  } catch {
    // Table might not exist yet; safe to ignore
  }

  // Take daily snapshot (only if not already taken today)
  try {
    const todaySnapshot = db
      .query(
        `SELECT id FROM health_snapshots
         WHERE business_id = ? AND date(created_at) = date('now')`
      )
      .get(businessId);
    if (!todaySnapshot) {
      db.run(
        `INSERT INTO health_snapshots (business_id, score, breakdown, created_at)
         VALUES (?, ?, ?, datetime('now'))`,
        [businessId, compositeScore, JSON.stringify(breakdown)]
      );
    }
  } catch {
    // If table doesn't exist yet, skip snapshot
  }

  return {
    score: compositeScore,
    label: scoreLabel(compositeScore),
    breakdown,
    recommendations,
    trend,
    lastUpdated: new Date().toISOString(),
  };
}

// ── History ────────────────────────────────────────────────────────────

export function getHealthHistory(db, businessId, days = 30) {
  try {
    const snapshots = db
      .query(
        `SELECT id, score, breakdown, created_at
         FROM health_snapshots
         WHERE business_id = ?
         AND created_at >= datetime('now', ?)
         ORDER BY created_at ASC`
      )
      .all(businessId, `-${days} days`);

    return snapshots.map((s) => ({
      date: s.created_at,
      score: s.score,
      breakdown: safelyParseJson(s.breakdown, {}),
    }));
  } catch {
    return [];
  }
}

// ── Summary ────────────────────────────────────────────────────────────

export function getHealthSummary(db, businessId) {
  const health = getHealthScore(db, businessId);

  return {
    engine: "health",
    timestamp: new Date().toISOString(),
    score: health.score,
    label: health.label,
    breakdown: health.breakdown,
    trend: health.trend,
    recommendations: health.recommendations,
    summary: `Business health: ${health.score}/100 (${health.label}). ${
      Object.entries(health.breakdown)
        .filter(([, v]) => v.score < 60)
        .map(([k]) => k)
        .join(", ") || "All engines healthy"
    }${health.recommendations.length > 0 ? `. ${health.recommendations.length} recommendation(s).` : ""}`,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function safelyParseJson(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

// ── Express Routes ─────────────────────────────────────────────────────

export function mountHealthRoutes(app, db) {
  // GET /api/health — Full health score with breakdown
  app.get("/api/health", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const health = getHealthScore(db, req.businessId);
      res.json(health);
    } catch (err) {
      console.error("GET /api/health error:", err);
      res.status(500).json({ error: "Failed to calculate health score" });
    }
  });

  // GET /api/health/history — Last 30 days of snapshots
  app.get("/api/health/history", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const days = parseInt(req.query.days) || 30;
      const snapshots = getHealthHistory(db, req.businessId, Math.min(days, 90));
      res.json({ snapshots });
    } catch (err) {
      console.error("GET /api/health/history error:", err);
      res.status(500).json({ error: "Failed to retrieve health history" });
    }
  });

  // GET /api/health/summary — AI-consumable summary
  app.get("/api/health/summary", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const summary = getHealthSummary(db, req.businessId);
      res.json(summary);
    } catch (err) {
      console.error("GET /api/health/summary error:", err);
      res.status(500).json({ error: "Failed to generate health summary" });
    }
  });
}
