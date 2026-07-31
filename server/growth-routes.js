/**
 * Growth Intelligence — Forecasting & Recommendations
 * ====================================================
 * P4.6: Intelligence layer for business decision-making.
 * Everything is explainable — every recommendation cites its data.
 */

import { requireAuth } from "./auth.js";
import * as store from "./store.js";

// ── Helpers ──────────────────────────────────────────────────────────

function money(val) {
  if (val == null) return null;
  return `$${Number(val).toFixed(2)}`;
}

function isoWeek(dateStr) {
  const d = new Date(dateStr);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function simpleMovingAverage(values, window) {
  if (values.length === 0) return 0;
  const slice = values.slice(-window);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function linearTrend(values) {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return slope;
}

/** Group order items by product + week for the last N days */
function getProductWeeklyDemand(db, businessId, days = 90) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const rows = db.query(`
    SELECT oi.product_id, p.name as product_name, p.sku, p.stock_count,
           oi.quantity, o.created_at, o.status
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    WHERE oi.business_id = ?
      AND o.created_at >= ?
      AND o.status != 'cancelled'
      AND oi.product_id IS NOT NULL
    ORDER BY o.created_at
  `).all(businessId, cutoff);

  // Group by product -> weeks -> total quantity
  const map = {};
  for (const row of rows) {
    if (!map[row.product_id]) {
      map[row.product_id] = {
        productId: row.product_id,
        productName: row.product_name,
        sku: row.sku,
        currentStock: row.stock_count,
        weeks: {},
        totalSold: 0,
      };
    }
    const week = isoWeek(row.created_at);
    if (!map[row.product_id].weeks[week]) map[row.product_id].weeks[week] = 0;
    map[row.product_id].weeks[week] += row.quantity;
    map[row.product_id].totalSold += row.quantity;
  }
  return Object.values(map);
}

export function mountGrowthRoutes(app, db) {

  // ═══════════════════════════════════════════════════════════════════
  // FORECAST: Demand
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/growth/forecast/demand", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const businessId = req.businessId || 1;
      const products = getProductWeeklyDemand(db, businessId, 90);

      const forecast = products.map((p) => {
        const weeks = Object.keys(p.weeks).sort();
        const values = weeks.map((w) => p.weeks[w]);

        if (values.length === 0) {
          return {
            productId: p.productId,
            productName: p.productName,
            sku: p.sku,
            currentStock: p.currentStock,
            weeklyDemandHistory: [],
            projection30: 0,
            projection60: 0,
            projection90: 0,
            confidence: "low",
            trend: "flat",
            basis: "Insufficient order history for prediction",
          };
        }

        const avgWeekly = simpleMovingAverage(values, Math.min(4, values.length));
        const trend = linearTrend(values);
        const weeksInPeriod = { 30: 4, 60: 9, 90: 13 };

        const projections = {};
        for (const [day, wk] of Object.entries(weeksInPeriod)) {
          let proj = 0;
          for (let i = 0; i < wk; i++) {
            proj += Math.max(0, avgWeekly + trend * (values.length + i));
          }
          projections[`projection${day}`] = Math.round(proj);
        }

        // Confidence based on weeks of data
        let confidence = "low";
        if (values.length >= 8) confidence = "high";
        else if (values.length >= 4) confidence = "medium";

        // Trend direction
        let trendDir = "flat";
        if (trend > 0.5) trendDir = "up";
        else if (trend < -0.5) trendDir = "down";

        return {
          productId: p.productId,
          productName: p.productName,
          sku: p.sku,
          currentStock: p.currentStock,
          weeklyDemandHistory: weeks.map((w, i) => ({ week: w, quantity: values[i] })),
          ...projections,
          avgWeeklyDemand: Math.round(avgWeekly * 10) / 10,
          confidence,
          trend: trendDir,
          basis: `Based on ${p.totalSold} units sold over ${values.length} weeks (${Math.round(avgWeekly * 10) / 10}/wk avg)`,
        };
      });

      forecast.sort((a, b) => b.avgWeeklyDemand - a.avgWeeklyDemand);

      res.json({
        forecast,
        total: forecast.length,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("GET /api/growth/forecast/demand error:", err);
      res.status(500).json({ error: "Failed to generate demand forecast" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // FORECAST: Inventory (stockout risk)
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/growth/forecast/inventory", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const businessId = req.businessId || 1;
      const products = getProductWeeklyDemand(db, businessId, 90);

      const alerts = [];
      for (const p of products) {
        const weeks = Object.keys(p.weeks).sort();
        const values = weeks.map((w) => p.weeks[w]);

        if (values.length < 2) continue;

        const avgWeekly = simpleMovingAverage(values, Math.min(4, values.length));
        const trend = linearTrend(values);

        if (avgWeekly <= 0) continue;

        // Project weeks until depletion
        let depletionWeek = null;
        let cumulativeDemand = 0;
        for (let i = 0; i < 52; i++) {
          cumulativeDemand += Math.max(0, avgWeekly + trend * (values.length + i));
          if (cumulativeDemand >= p.currentStock && depletionWeek === null) {
            depletionWeek = i + 1;
            break;
          }
        }

        if (depletionWeek !== null && depletionWeek <= 4) {
          // Get supplier lead time for this product
          const spRow = db.query(`
            SELECT s.name as supplier_name, s.id as supplier_id, sp.quoted_lead_time_days
            FROM supplier_products sp
            JOIN suppliers s ON sp.supplier_id = s.id
            WHERE sp.product_id = ? AND s.business_id = ?
            LIMIT 1
          `).get(p.productId, businessId);

          const leadTimeDays = spRow?.quoted_lead_time_days || 7;
          const recommendedQty = Math.round(avgWeekly * Math.ceil(leadTimeDays / 7) * 2);

          const depletionDate = new Date();
          depletionDate.setDate(depletionDate.getDate() + depletionWeek * 7);

          alerts.push({
            productId: p.productId,
            productName: p.productName,
            sku: p.sku,
            currentStock: p.currentStock,
            avgWeeklyDemand: Math.round(avgWeekly * 10) / 10,
            depletionDate: depletionDate.toISOString().split("T")[0],
            weeksUntilDepletion: depletionWeek,
            supplierName: spRow?.supplier_name || "Unknown",
            supplierId: spRow?.supplier_id || null,
            leadTimeDays,
            recommendedOrderQty: recommendedQty,
            urgency: depletionWeek <= 2 ? "critical" : "warning",
            basis: `${p.currentStock} in stock, selling ${Math.round(avgWeekly * 10) / 10}/wk — will deplete in ~${depletionWeek} week(s)`,
          });
        }
      }

      alerts.sort((a, b) => a.weeksUntilDepletion - b.weeksUntilDepletion);

      res.json({
        alerts,
        total: alerts.length,
        critical: alerts.filter(a => a.urgency === "critical").length,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("GET /api/growth/forecast/inventory error:", err);
      res.status(500).json({ error: "Failed to generate inventory forecast" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // FORECAST: Production
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/growth/forecast/production", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const businessId = req.businessId || 1;
      const products = getProductWeeklyDemand(db, businessId, 90);

      // Get products that have BOMs
      const bomProducts = db.query(`
        SELECT DISTINCT b.output_product_id as product_id, p.name, p.sku, p.stock_count, b.id as bom_id,
               b.output_quantity as batch_size
        FROM boms b
        JOIN products p ON b.output_product_id = p.id
        WHERE b.business_id = ? AND b.is_active = 1
      `).all(businessId);

      if (bomProducts.length === 0) {
        return res.json({ suggestions: [], total: 0, message: "No products with BOMs configured" });
      }

      const suggestions = [];
      for (const bp of bomProducts) {
        const prod = products.find(p => p.productId === bp.product_id);
        if (!prod) continue;

        const weeks = Object.keys(prod.weeks).sort();
        const values = weeks.map(w => prod.weeks[w]);

        if (values.length < 2) continue;

        const avgWeekly = simpleMovingAverage(values, Math.min(4, values.length));
        const trend = linearTrend(values);
        const proj30 = Math.round(Math.max(0, avgWeekly + trend * values.length) * 4);
        const proj60 = Math.round(Math.max(0, avgWeekly + trend * (values.length + 4)) * 9);

        const suggestedBatches = Math.max(0, Math.ceil((proj30 - bp.stock_count) / bp.batch_size));

        if (suggestedBatches > 0) {
          suggestions.push({
            productId: bp.product_id,
            productName: bp.name,
            sku: bp.sku,
            currentStock: bp.stock_count,
            projectedDemand30: proj30,
            projectedDemand60: proj60,
            batchSize: bp.batch_size,
            bomId: bp.bom_id,
            suggestedBatches,
            basis: `${proj30} projected demand (30d) vs ${bp.stock_count} in stock — need ${proj30 - bp.stock_count} more units (${suggestedBatches} batch(es) of ${bp.batch_size})`,
          });
        }
      }

      suggestions.sort((a, b) => b.suggestedBatches - a.suggestedBatches);

      res.json({
        suggestions,
        total: suggestions.length,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("GET /api/growth/forecast/production error:", err);
      res.status(500).json({ error: "Failed to generate production forecast" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // SEASONALITY
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/growth/seasonality", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const businessId = req.businessId || 1;
      const oneYearAgo = new Date(Date.now() - 365 * 86400000).toISOString();

      const rows = db.query(`
        SELECT oi.product_id, p.name as product_name, p.sku,
               oi.quantity, o.created_at
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN products p ON oi.product_id = p.id
        WHERE oi.business_id = ?
          AND o.created_at >= ?
          AND o.status != 'cancelled'
          AND oi.product_id IS NOT NULL
        ORDER BY o.created_at
      `).all(businessId, oneYearAgo);

      // Group by product -> month -> total
      const map = {};
      for (const row of rows) {
        if (!map[row.product_id]) {
          map[row.product_id] = {
            productId: row.product_id,
            productName: row.product_name,
            sku: row.sku,
            months: {},
            totalSold: 0,
          };
        }
        const month = row.created_at.substring(0, 7);
        if (!map[row.product_id].months[month]) map[row.product_id].months[month] = 0;
        map[row.product_id].months[month] += row.quantity;
        map[row.product_id].totalSold += row.quantity;
      }

      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      const seasonality = Object.values(map).map((p) => {
        const months = Object.keys(p.months).sort();
        if (months.length < 3) return null;

        const values = months.map(m => p.months[m]);
        const avgMonthly = p.totalSold / months.length;

        // Monthly index per calendar month
        const monthlyIndex = {};
        for (const m of months) {
          const idx = Math.round((p.months[m] / avgMonthly) * 100) / 100;
          if (idx > 0) monthlyIndex[m] = idx;
        }

        // Find peak and slow months
        let peakMonth = months[0], slowMonth = months[0];
        let peakVal = p.months[peakMonth], slowVal = p.months[slowMonth];
        for (const m of months) {
          if (p.months[m] > peakVal) { peakVal = p.months[m]; peakMonth = m; }
          if (p.months[m] < slowVal) { slowVal = p.months[m]; slowMonth = m; }
        }

        return {
          productId: p.productId,
          productName: p.productName,
          sku: p.sku,
          peakMonth: { month: peakMonth, label: monthNames[parseInt(peakMonth.split("-")[1]) - 1], quantity: peakVal },
          slowMonth: { month: slowMonth, label: monthNames[parseInt(slowMonth.split("-")[1]) - 1], quantity: slowVal },
          seasonalIndex: monthlyIndex,
          avgMonthlySales: Math.round(avgMonthly * 10) / 10,
          monthsOfData: months.length,
          basis: `Analyzed ${p.totalSold} units across ${months.length} months — ${Math.round(avgMonthly * 10) / 10}/mo avg`,
        };
      }).filter(Boolean);

      seasonality.sort((a, b) => b.monthsOfData - a.monthsOfData);

      res.json({
        seasonality,
        total: seasonality.length,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("GET /api/growth/seasonality error:", err);
      res.status(500).json({ error: "Failed to analyze seasonality" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // RECOMMENDATIONS: Suppliers
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/growth/recommendations/suppliers", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const businessId = req.businessId || 1;

      // Get suppliers with their order history and lead times
      const suppliers = db.query(`
        SELECT s.id, s.name, s.email,
               COUNT(po.id) as order_count,
               AVG(sp.quoted_lead_time_days) as avg_lead_time,
               MAX(po.created_at) as last_order_date
        FROM suppliers s
        LEFT JOIN purchase_orders po ON po.supplier_id = s.id AND po.business_id = s.business_id
        LEFT JOIN supplier_products sp ON sp.supplier_id = s.id
        WHERE s.business_id = ?
          AND s.is_active = 1
        GROUP BY s.id
      `).all(businessId);

      const recommendations = [];
      const now = new Date();

      for (const s of suppliers) {
        // Check lead time trend
        const leadTimeRows = db.query(`
          SELECT sp.quoted_lead_time_days, sp.last_order_date, sp.product_id, p.name as product_name
          FROM supplier_products sp
          JOIN products p ON sp.product_id = p.id
          WHERE sp.supplier_id = ? AND sp.quoted_lead_time_days IS NOT NULL
        `).all(s.id);

        const longLeadItems = leadTimeRows.filter(r => r.quoted_lead_time_days > 14);
        if (longLeadItems.length > 0) {
          recommendations.push({
            id: `supplier-lead-${s.id}`,
            type: "supplier",
            icon: "⏱️",
            what: `Long lead times from ${s.name}`,
            why: `${longLeadItems.length} product(s) have lead times > 14 days (${longLeadItems.map(r => r.product_name).join(", ")})`,
            action: `Consider finding backup suppliers or increasing safety stock for these items`,
            impact: "medium",
            relatedIds: [s.id],
          });
        }

        // Suggest reorder timing
        if (s.last_order_date) {
          const daysSinceLast = Math.floor((now - new Date(s.last_order_date)) / 86400000);
          if (s.order_count > 0 && daysSinceLast > 30) {
            recommendations.push({
              id: `supplier-reorder-${s.id}`,
              type: "supplier",
              icon: "📦",
              what: `Time to reorder from ${s.name}`,
              why: `Last order was ${daysSinceLast} days ago (avg lead time: ${Math.round(s.avg_lead_time || 7)} days)`,
              action: `Review ${s.name}'s products and place a purchase order`,
              impact: "high",
              relatedIds: [s.id],
            });
          }
        }

        // Increasing lead time detection
        const recentPOs = db.query(`
          SELECT po.expected_delivery, po.created_at, po.actual_delivery_date
          FROM purchase_orders po
          WHERE po.supplier_id = ? AND po.status = 'received'
          ORDER BY po.created_at DESC LIMIT 5
        `).all(s.id);

        if (recentPOs.length >= 3) {
          let increasingCount = 0;
          for (let i = 0; i < recentPOs.length - 1; i++) {
            const curr = recentPOs[i];
            const prev = recentPOs[i + 1];
            if (curr.actual_delivery_date && curr.created_at && prev.actual_delivery_date && prev.created_at) {
              const currDays = Math.floor((new Date(curr.actual_delivery_date) - new Date(curr.created_at)) / 86400000);
              const prevDays = Math.floor((new Date(prev.actual_delivery_date) - new Date(prev.created_at)) / 86400000);
              if (currDays > prevDays) increasingCount++;
            }
          }
          if (increasingCount >= 2) {
            recommendations.push({
              id: `supplier-slipping-${s.id}`,
              type: "supplier",
              icon: "⚠️",
              what: `${s.name} delivery times are slipping`,
              why: `Delivery times have increased over the last ${recentPOs.length} orders`,
              action: `Schedule a check-in with ${s.name} or explore alternative suppliers`,
              impact: "high",
              relatedIds: [s.id],
            });
          }
        }
      }

      res.json({
        recommendations,
        total: recommendations.length,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("GET /api/growth/recommendations/suppliers error:", err);
      res.status(500).json({ error: "Failed to generate supplier recommendations" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // RECOMMENDATIONS: Bundles
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/growth/recommendations/bundles", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const businessId = req.businessId || 1;

      // Find products frequently ordered together (same order)
      const orderProducts = db.query(`
        SELECT oi.order_id, oi.product_id, p.name as product_name, p.sku
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN products p ON oi.product_id = p.id
        WHERE oi.business_id = ?
          AND o.status != 'cancelled'
          AND oi.product_id IS NOT NULL
        ORDER BY oi.order_id
      `).all(businessId);

      // Group orders -> product set
      const orderMap = {};
      for (const row of orderProducts) {
        if (!orderMap[row.order_id]) orderMap[row.order_id] = new Set();
        orderMap[row.order_id].add(`${row.product_id}|${row.product_name}|${row.sku}`);
      }

      // Count co-occurrences
      const cooccur = {};
      for (const products of Object.values(orderMap)) {
        const arr = [...products];
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            const key = [arr[i], arr[j]].sort().join(":::");
            cooccur[key] = (cooccur[key] || 0) + 1;
          }
        }
      }

      // Filter to meaningful bundles (3+ co-occurrences)
      const bundles = Object.entries(cooccur)
        .filter(([, count]) => count >= 3)
        .map(([key, count]) => {
          const [p1, p2] = key.split(":::");
          const [id1, name1, sku1] = p1.split("|");
          const [id2, name2, sku2] = p2.split("|");

          // Get prices
          const p1Row = db.query("SELECT price FROM product_variants WHERE product_id = ? LIMIT 1")
            .get(parseInt(id1));
          const p2Row = db.query("SELECT price FROM product_variants WHERE product_id = ? LIMIT 1")
            .get(parseInt(id2));

          const price1 = p1Row?.price || 0;
          const price2 = p2Row?.price || 0;
          const combinedPrice = price1 + price2;
          const bundlePrice = Math.round(combinedPrice * 0.9 * 100) / 100; // 10% bundle discount

          return {
            id: `bundle-${id1}-${id2}`,
            type: "bundle",
            icon: "🎁",
            product1: { id: parseInt(id1), name: name1, sku: sku1, price: price1 },
            product2: { id: parseInt(id2), name: name2, sku: sku2, price: price2 },
            cooccurrence: count,
            combinedPrice: Math.round(combinedPrice * 100) / 100,
            suggestedBundlePrice: bundlePrice,
            what: `Bundle "${name1}" + "${name2}"`,
            why: `Ordered together in ${count} order(s) — combined value ${money(combinedPrice)}`,
            action: `Create a "${name1} + ${name2}" bundle at ${money(bundlePrice)} (10% bundle savings)`,
            impact: count >= 5 ? "high" : "medium",
          };
        })
        .sort((a, b) => b.cooccurrence - a.cooccurrence)
        .slice(0, 10);

      res.json({
        recommendations: bundles,
        total: bundles.length,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("GET /api/growth/recommendations/bundles error:", err);
      res.status(500).json({ error: "Failed to generate bundle recommendations" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // RECOMMENDATIONS: Marketing
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/growth/recommendations/marketing", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const businessId = req.businessId || 1;
      const recommendations = [];

      // Get all products with sales data over last 60 days vs prior 60 days
      const recent = new Date(Date.now() - 60 * 86400000).toISOString();
      const prior = new Date(Date.now() - 120 * 86400000).toISOString();

      // Products with sales in each period
      const recentSales = db.query(`
        SELECT oi.product_id, p.name, p.sku, p.stock_count,
               SUM(oi.quantity) as qty, AVG(oi.unit_price) as avg_price
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        JOIN products p ON oi.product_id = p.id
        WHERE oi.business_id = ?
          AND o.created_at >= ?
          AND o.status != 'cancelled'
          AND oi.product_id IS NOT NULL
        GROUP BY oi.product_id
      `).all(businessId, recent);

      const priorSales = db.query(`
        SELECT oi.product_id, SUM(oi.quantity) as qty
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE oi.business_id = ?
          AND o.created_at >= ? AND o.created_at < ?
          AND o.status != 'cancelled'
          AND oi.product_id IS NOT NULL
        GROUP BY oi.product_id
      `).all(businessId, prior, recent);

      const priorMap = {};
      for (const row of priorSales) priorMap[row.product_id] = row.qty;

      // Detecting declining products
      for (const row of recentSales) {
        const priorQty = priorMap[row.product_id] || 0;
        if (priorQty > 0) {
          const decline = ((priorQty - row.qty) / priorQty) * 100;
          if (decline > 20) {
            recommendations.push({
              id: `mkt-decline-${row.product_id}`,
              type: "marketing",
              icon: "📉",
              what: `Promote "${row.name}"`,
              why: `Sales declined ${Math.round(decline)}% — ${priorQty} units (prior 60d) → ${row.qty} units (recent 60d)`,
              action: `Run a promotion or feature "${row.name}" in marketing campaigns`,
              impact: decline > 40 ? "high" : "medium",
              relatedIds: [row.product_id],
            });
          }
        }

        // High margin opportunities (products with price data)
        if (row.avg_price) {
          const variant = db.query(
            "SELECT price, cost FROM product_variants WHERE product_id = ? LIMIT 1"
          ).get(row.product_id);
          if (variant?.price && variant?.cost) {
            const margin = ((variant.price - variant.cost) / variant.price) * 100;
            if (margin > 50) {
              recommendations.push({
                id: `mkt-margin-${row.product_id}`,
                type: "marketing",
                icon: "💰",
                what: `Feature "${row.name}" — high margin`,
                why: `${Math.round(margin)}% profit margin (cost: ${money(variant.cost)}, price: ${money(variant.price)})`,
                action: `Highlight "${row.name}" in ads, homepage, or email campaigns to maximize profit`,
                impact: margin > 70 ? "high" : "medium",
                relatedIds: [row.product_id],
              });
            }
          }
        }
      }

      // Seasonal promotion: products peaking next month
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextMonthStr = nextMonth.toISOString().substring(0, 7);

      // Check seasonality for current month
      const seasonRows = getProductMonthlyDemand(db, businessId);
      for (const [productId, data] of Object.entries(seasonRows)) {
        const months = Object.keys(data.months).sort();
        const values = months.map(m => data.months[m]);
        if (values.length < 6) continue;

        const avgMonthly = values.reduce((a, b) => a + b, 0) / values.length;
        // Check if next month has historically high sales
        for (const m of months) {
          const monthIdx = parseInt(m.split("-")[1]);
          const targetMonth = nextMonth.getMonth() + 1;
          if (monthIdx === targetMonth) {
            const idx = data.months[m] / avgMonthly;
            if (idx > 1.3) {
              recommendations.push({
                id: `mkt-season-${productId}`,
                type: "marketing",
                icon: "📅",
                what: `Prepare ${data.productName} for seasonal peak`,
                why: `${data.productName} sales typically spike ${Math.round((idx - 1) * 100)}% above average in ${nextMonthStr}`,
                action: `Stock up and prepare marketing materials for ${data.productName} before the seasonal rush`,
                impact: "high",
                relatedIds: [parseInt(productId)],
              });
            }
            break;
          }
        }
      }

      // Deduplicate (keep highest impact per product)
      const seen = new Set();
      const deduped = [];
      for (const r of recommendations) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        deduped.push(r);
      }
      deduped.sort((a, b) => {
        const impactOrder = { high: 0, medium: 1, low: 2 };
        return impactOrder[a.impact] - impactOrder[b.impact];
      });

      res.json({
        recommendations: deduped,
        total: deduped.length,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("GET /api/growth/recommendations/marketing error:", err);
      res.status(500).json({ error: "Failed to generate marketing recommendations" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // Growth Summary (for Novi integration / dashboard overview)
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/growth/summary", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const businessId = req.businessId || 1;

      // Quick stats
      const orderCount = db.query(
        "SELECT COUNT(*) as cnt FROM orders WHERE business_id = ? AND status != 'cancelled'"
      ).get(businessId)?.cnt || 0;

      const productCount = db.query(
        "SELECT COUNT(*) as cnt FROM products WHERE id IN (SELECT product_id FROM order_items WHERE business_id = ?)"
      ).get(businessId)?.cnt || 0;

      const totalRevenue = db.query(
        "SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE business_id = ? AND status != 'cancelled' AND created_at >= ?"
      ).get(businessId, new Date(Date.now() - 30 * 86400000).toISOString())?.total || 0;

      // Supply risk count
      const supplyRiskCount = db.query(`
        SELECT COUNT(*) as cnt FROM products p
        WHERE p.stock_count = 0
          AND p.id IN (SELECT DISTINCT product_id FROM order_items WHERE business_id = ?)
      `).get(businessId)?.cnt || 0;

      res.json({
        totalOrders: orderCount,
        activeProducts: productCount,
        revenue30d: totalRevenue,
        supplyRiskCount,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("GET /api/growth/summary error:", err);
      res.status(500).json({ error: "Failed to generate growth summary" });
    }
  });
}

// ── Helper: monthly demand ──────────────────────────────────────────

function getProductMonthlyDemand(db, businessId) {
  const oneYearAgo = new Date(Date.now() - 365 * 86400000).toISOString();
  const rows = db.query(`
    SELECT oi.product_id, p.name as product_name,
           oi.quantity, o.created_at
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    WHERE oi.business_id = ?
      AND o.created_at >= ?
      AND o.status != 'cancelled'
      AND oi.product_id IS NOT NULL
  `).all(businessId, oneYearAgo);

  const map = {};
  for (const row of rows) {
    if (!map[row.product_id]) {
      map[row.product_id] = {
        productName: row.product_name,
        months: {},
      };
    }
    const month = row.created_at.substring(0, 7);
    if (!map[row.product_id].months[month]) map[row.product_id].months[month] = 0;
    map[row.product_id].months[month] += row.quantity;
  }
  return map;
}
