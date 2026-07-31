/**
 * Business Timeline Routes
 * ========================
 * GET /api/timeline — unified timeline with engine classification, search, date filters.
 * Consumes the audit_log table and enriches entries with engine metadata.
 */

import * as store from "./store.js";
import { requireAuth } from "./auth.js";

// ── Engine classification ─────────────────────────────────────────────

function classifyTimelineEngine(actionType) {
  if (!actionType) return "system";
  if (actionType.startsWith("production.")) return "production";
  if (actionType.startsWith("purchasing.") || actionType.startsWith("supplier.")) return "purchasing";
  if (actionType.startsWith("order.") || actionType.startsWith("scan.")) return "orders";
  if (actionType.startsWith("product.") || actionType.startsWith("inventory.")) return "inventory";
  if (actionType.startsWith("calculation.")) return "calculation";
  if (actionType.startsWith("auth.") || actionType.startsWith("user.") || actionType.startsWith("settings.")) return "system";
  return "system";
}

const ENGINE_META = {
  production:  { name: "production",  icon: "🏭", label: "Production",  color: "amber" },
  purchasing:  { name: "purchasing",  icon: "📦", label: "Purchasing",  color: "blue" },
  orders:      { name: "orders",      icon: "📋", label: "Orders",      color: "green" },
  inventory:   { name: "inventory",   icon: "📦", label: "Inventory",   color: "slate" },
  calculation: { name: "calculation", icon: "🧮", label: "Calculator",  color: "purple" },
  system:      { name: "system",      icon: "🔧", label: "System",      color: "gray" },
};

// ── Event enrichment ──────────────────────────────────────────────────

function formatTimelineDescription(entry) {
  const user = entry.user_display_name || "System";
  const type = entry.action_type || "";

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
      } else if (nv.supplierName || nv.supplier_name) {
        context = nv.supplierName || nv.supplier_name;
      }
    }
  } catch {}

  if (type === "production.batch_created") return `${user} created production batch${context ? ` "${context}"` : ""}`;
  if (type === "production.batch_completed") return `${user} completed production batch${context ? ` "${context}"` : ""}`;
  if (type === "production.batch_cancelled") return `${user} cancelled production batch${context ? ` "${context}"` : ""}`;
  if (type === "production.bom_created") return `${user} created BOM${context ? ` "${context}"` : ""}`;
  if (type === "calculation.formula_created") return `${user} created formula${context ? ` "${context}"` : ""}`;
  if (type === "calculation.formula_executed") return `${user} ran calculation${context ? ` "${context}"` : ""}`;
  if (type === "purchasing.supplier_added") return `${user} added supplier${context ? ` ${context}` : ""}`;
  if (type === "purchasing.po_created") return `${user} created purchase order${context ? ` ${context}` : ""}`;
  if (type === "purchasing.po_received") return `${user} received purchase order${context ? ` ${context}` : ""}`;
  if (type === "purchasing.po_ordered") return `${user} sent purchase order${context ? ` ${context}` : ""}`;
  if (type === "auth.login") return `${user} logged in`;
  if (type === "scan.in") return `${user} scanned in${context ? ` ${context}` : ""}`;
  if (type === "scan.out") return `${user} scanned out${context ? ` ${context}` : ""}`;
  if (entry.entity_type === "order") return `${user} processed order${context ? ` #${context}` : ""}`;
  if (entry.entity_type === "product") return `${user} ${entry.action_type.replace("product.", "")} product${context ? ` ${context}` : ""}`;
  return `${user} — ${type}${context ? ` (${context})` : ""}`;
}

function getTimelineLink(entry) {
  const type = entry.action_type || "";
  const eid = entry.entity_id;
  if (type.startsWith("production.")) return eid ? `/production?batch=${eid}` : "/production";
  if (type.startsWith("purchasing.") || type.startsWith("supplier.")) return eid ? `/purchasing?po=${eid}` : "/purchasing";
  if (type.startsWith("order.") || type.startsWith("scan.")) return eid ? `/orders?order=${eid}` : "/orders";
  if (type.startsWith("product.") || type.startsWith("inventory.")) return eid ? `/products?id=${eid}` : "/products";
  if (type.startsWith("calculation.")) return eid ? `/calc?formula=${eid}` : "/calc";
  return null;
}

function enrichTimelineEvent(entry) {
  const engineName = classifyTimelineEngine(entry.action_type);
  const engine = ENGINE_META[engineName] || ENGINE_META.system;
  const description = formatTimelineDescription(entry);
  const actor = entry.user_display_name || "System";
  const link = getTimelineLink(entry);

  let icon = engine.icon;
  const at = entry.action_type || "";
  if (at === "auth.login") icon = "🔑";
  else if (at.startsWith("production.batch_completed")) icon = "✅";
  else if (at.startsWith("production.batch_cancelled")) icon = "❌";
  else if (at.startsWith("purchasing.po_created")) icon = "📝";
  else if (at.startsWith("purchasing.po_received")) icon = "📥";
  else if (at.startsWith("scan.in")) icon = "⬇️";
  else if (at.startsWith("scan.out")) icon = "⬆️";
  else if (at.startsWith("calculation.formula_created")) icon = "📐";
  else if (at.startsWith("calculation.formula_executed")) icon = "🔢";

  return {
    id: entry.id,
    engine,
    icon,
    description,
    actor,
    timeAgo: entry.created_at,
    actionType: entry.action_type,
    entityType: entry.entity_type,
    link,
    source: entry.source,
  };
}

// ── Route mount ───────────────────────────────────────────────────────

export function mountTimelineRoutes(app, db) {
  // GET /api/timeline — unified timeline (audit.read permission)
  app.get("/api/timeline", requireAuth(db, "audit.read"), (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);
      const engine = req.query.engine || null;
      const search = req.query.q || null;
      const datePreset = req.query.date || "all";

      // Compute date range from preset
      let dateFrom = null;
      let dateTo = null;
      const now = new Date();
      if (datePreset === "today") {
        dateFrom = now.toISOString().slice(0, 10) + "T00:00:00";
        dateTo = now.toISOString().slice(0, 10) + "T23:59:59";
      } else if (datePreset === "week") {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        dateFrom = startOfWeek.toISOString().slice(0, 10) + "T00:00:00";
        dateTo = now.toISOString().slice(0, 10) + "T23:59:59";
      } else if (datePreset === "month") {
        dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10) + "T00:00:00";
        dateTo = now.toISOString().slice(0, 10) + "T23:59:59";
      }

      const entries = store.getTimelineEntries(db, req.businessId, {
        limit, offset, engine: null, search, dateFrom, dateTo,
      });

      // Enrich all entries
      const enriched = entries.map((entry) => enrichTimelineEvent(entry));

      // Apply engine filter in JS (classification is computed, not in DB)
      const filtered = engine ? enriched.filter((e) => e.engine.name === engine) : enriched;

      // For accurate engine-filtered total, fetch all matching entries and count
      let total;
      if (engine) {
        const allEntries = store.getTimelineEntries(db, req.businessId, {
          limit: 10000, offset: 0, engine: null, search, dateFrom, dateTo,
        });
        total = allEntries.filter((e) => classifyTimelineEngine(e.action_type) === engine).length;
      } else {
        total = store.countTimelineEntries(db, req.businessId, {
          engine: null, search, dateFrom, dateTo,
        });
      }

      res.json({ events: filtered, total, limit, offset });
    } catch (err) {
      console.error("GET /api/timeline error:", err);
      res.status(500).json({ error: "Failed to fetch timeline" });
    }
  });
}
