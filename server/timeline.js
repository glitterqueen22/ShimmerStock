/**
 * V3.8: Daily Business Replay™ — Chronological Operating Loop Timeline
 * =====================================================================
 * Queries ALL event sources for a given date and returns a unified
 * chronological timeline proving the Operating Loop™ closes.
 *
 * GET /api/timeline?date=YYYY-MM-DD
 */

import { requireAuth } from "./auth.js";

// ── Department config ──────────────────────────────────────────────────

const DEPARTMENTS = {
  commerce:      { icon: "🛒", label: "Commerce",      color: "emerald" },
  production:    { icon: "🏭", label: "Production",    color: "amber" },
  warehouse:     { icon: "🏗️", label: "Warehouse",    color: "blue" },
  shipping:      { icon: "🚚", label: "Shipping",      color: "indigo" },
  customer_service: { icon: "💬", label: "Customer Service", color: "pink" },
  marketing:     { icon: "📢", label: "Marketing",     color: "purple" },
  purchasing:    { icon: "📦", label: "Purchasing",    color: "teal" },
  novi:          { icon: "✨", label: "Novi",           color: "fuchsia" },
  system:        { icon: "🔧", label: "System",        color: "gray" },
};

// ── Helpers ────────────────────────────────────────────────────────────

function classifyDepartment(source) {
  const map = {
    order: "commerce",
    production: "production",
    inventory: "warehouse",
    warehouse: "warehouse",
    receiving: "warehouse",
    purchase: "purchasing",
    supplier: "purchasing",
    customer: "customer_service",
    return: "customer_service",
    refund: "customer_service",
    affiliate: "marketing",
    shipment: "shipping",
    scan: "warehouse",
    product: "warehouse",
    audit: "system",
    auth: "system",
  };
  for (const [key, dept] of Object.entries(map)) {
    if (source.includes(key)) return dept;
  }
  return "system";
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

// ── Query all sources for a date ───────────────────────────────────────

function queryAllSources(db, businessId, date) {
  const dateStart = `${date}T00:00:00`;
  const dateEnd = `${date}T23:59:59`;
  const entries = [];

  // 1. Orders created
  const orders = db.query(`
    SELECT o.id, o.order_number, o.customer_name, o.source, o.status, o.created_at
    FROM orders o
    WHERE o.business_id = ? AND o.created_at >= ? AND o.created_at <= ?
    ORDER BY o.created_at ASC
  `).all(businessId, dateStart, dateEnd);

  for (const o of orders) {
    const dept = o.source === "shopify" ? "commerce" : "commerce";
    const label = o.source === "shopify" ? "Shopify" : o.source.charAt(0).toUpperCase() + o.source.slice(1);
    entries.push({
      timestamp: o.created_at,
      department: dept,
      icon: DEPARTMENTS[dept].icon,
      title: `Order #${o.order_number} received`,
      detail: `${label} order from ${o.customer_name} — Status: ${o.status}`,
      event_type: "order.created",
      source_table: "orders",
      source_id: o.id,
      links_to: null, // populated later
    });
  }

  // 2. Production batches (started, completed)
  const batches = db.query(`
    SELECT pb.id, pb.bom_id, pb.batch_size, pb.status, pb.started_at, pb.completed_at, pb.created_at,
           b.name as bom_name, p.name as output_name
    FROM production_batches pb
    JOIN boms b ON pb.bom_id = b.id
    LEFT JOIN products p ON b.output_product_id = p.id
    WHERE pb.business_id = ?
      AND ((pb.started_at >= ? AND pb.started_at <= ?)
        OR (pb.completed_at >= ? AND pb.completed_at <= ?)
        OR (pb.created_at >= ? AND pb.created_at <= ?))
    ORDER BY pb.created_at ASC
  `).all(businessId, dateStart, dateEnd, dateStart, dateEnd, dateStart, dateEnd);

  for (const b of batches) {
    if (b.started_at && b.started_at >= dateStart && b.started_at <= dateEnd) {
      entries.push({
        timestamp: b.started_at,
        department: "production",
        icon: DEPARTMENTS.production.icon,
        title: `Production started: ${b.bom_name}`,
        detail: `Batch size: ${b.batch_size}, output: ${b.output_name || "—"}`,
        event_type: "production.batch_started",
        source_table: "production_batches",
        source_id: b.id,
        links_to: null,
      });
    }
    if (b.completed_at && b.completed_at >= dateStart && b.completed_at <= dateEnd) {
      entries.push({
        timestamp: b.completed_at,
        department: "production",
        icon: DEPARTMENTS.production.icon,
        title: `Production completed: ${b.bom_name}`,
        detail: `Batch complete — ${b.output_name || "goods"} produced`,
        event_type: "production.batch_completed",
        source_table: "production_batches",
        source_id: b.id,
        links_to: null,
      });
    }
  }

  // 3. Inventory movements
  const movements = db.query(`
    SELECT im.id, im.product_id, im.type, im.quantity, im.created_at,
           p.name as product_name, p.sku
    FROM inventory_movements im
    JOIN products p ON im.product_id = p.id
    WHERE p.business_id = ? AND im.created_at >= ? AND im.created_at <= ?
    ORDER BY im.created_at ASC
  `).all(businessId, dateStart, dateEnd);

  for (const m of movements) {
    const direction = m.type === "in" ? "Added" : m.type === "out" ? "Removed" : "Order fulfillment";
    entries.push({
      timestamp: m.created_at,
      department: "warehouse",
      icon: DEPARTMENTS.warehouse.icon,
      title: `Inventory ${m.type}: ${m.product_name}`,
      detail: `${direction} ${m.quantity} × ${m.sku || m.product_name}`,
      event_type: `inventory.${m.type}`,
      source_table: "inventory_movements",
      source_id: m.id,
      links_to: null,
    });
  }

  // 4. Purchase orders
  const pos = db.query(`
    SELECT po.id, po.supplier_id, po.status, po.order_date, po.received_date, po.created_at,
           s.name as supplier_name
    FROM purchase_orders po
    JOIN suppliers s ON po.supplier_id = s.id
    WHERE po.business_id = ?
      AND ((po.created_at >= ? AND po.created_at <= ?)
        OR (po.received_date >= ? AND po.received_date <= ?))
    ORDER BY po.created_at ASC
  `).all(businessId, dateStart, dateEnd, dateStart, dateEnd);

  for (const po of pos) {
    entries.push({
      timestamp: po.created_at,
      department: "purchasing",
      icon: DEPARTMENTS.purchasing.icon,
      title: `PO created: ${po.supplier_name}`,
      detail: `Status: ${po.status}`,
      event_type: "purchasing.po_created",
      source_table: "purchase_orders",
      source_id: po.id,
      links_to: null,
    });
    if (po.received_date && po.received_date >= dateStart && po.received_date <= dateEnd) {
      entries.push({
        timestamp: po.received_date,
        department: "purchasing",
        icon: DEPARTMENTS.purchasing.icon,
        title: `PO received: ${po.supplier_name}`,
        detail: `Receipt completed`,
        event_type: "purchasing.po_received",
        source_table: "purchase_orders",
        source_id: po.id,
        links_to: null,
      });
    }
  }

  // 5. Receiving events (V3.2)
  const receiving = db.query(`
    SELECT re.id, re.po_id, re.quantity_received, re.quantity_damaged, re.quantity_backordered,
           re.bin_location, re.notes, re.created_at,
           p.name as product_name
    FROM receiving_events re
    LEFT JOIN products p ON re.product_id = p.id
    WHERE re.business_id = ? AND re.created_at >= ? AND re.created_at <= ?
    ORDER BY re.created_at ASC
  `).all(businessId, dateStart, dateEnd);

  for (const r of receiving) {
    const parts = [];
    if (r.quantity_received > 0) parts.push(`${r.quantity_received} received`);
    if (r.quantity_damaged > 0) parts.push(`${r.quantity_damaged} damaged`);
    if (r.quantity_backordered > 0) parts.push(`${r.quantity_backordered} backordered`);
    entries.push({
      timestamp: r.created_at,
      department: "warehouse",
      icon: DEPARTMENTS.warehouse.icon,
      title: `Receiving: ${r.product_name || "Items"}`,
      detail: `${parts.join(", ")}${r.bin_location ? ` → ${r.bin_location}` : ""}${r.notes ? ` (${r.notes})` : ""}`,
      event_type: "purchasing.received",
      source_table: "receiving_events",
      source_id: r.id,
      links_to: null,
    });
  }

  // 6. Returns & refunds (V3.5)
  const returns = db.query(`
    SELECT rr.id, rr.order_id, rr.type, rr.status, rr.amount, rr.reason, rr.created_at
    FROM returns_refunds rr
    WHERE rr.business_id = ? AND rr.created_at >= ? AND rr.created_at <= ?
    ORDER BY rr.created_at ASC
  `).all(businessId, dateStart, dateEnd);

  for (const rr of returns) {
    const typeLabel = rr.type === "return" ? "Return" : "Refund";
    entries.push({
      timestamp: rr.created_at,
      department: "customer_service",
      icon: DEPARTMENTS.customer_service.icon,
      title: `${typeLabel} for Order #${rr.order_id}`,
      detail: `Status: ${rr.status}${rr.amount ? ` — $${rr.amount.toFixed(2)}` : ""}${rr.reason ? ` (${rr.reason})` : ""}`,
      event_type: rr.type === "return" ? "customer.return" : "customer.refund",
      source_table: "returns_refunds",
      source_id: rr.id,
      links_to: null,
    });
  }

  // 7. Affiliate referrals (V3.6)
  const referrals = db.query(`
    SELECT ar.id, ar.affiliate_id, ar.order_id, ar.discount_amount, ar.commission_earned,
           ar.store_credit_issued, ar.status, ar.created_at,
           a.name as affiliate_name
    FROM affiliate_referrals ar
    JOIN affiliates a ON ar.affiliate_id = a.id
    WHERE ar.business_id = ? AND ar.created_at >= ? AND ar.created_at <= ?
    ORDER BY ar.created_at ASC
  `).all(businessId, dateStart, dateEnd);

  for (const ar of referrals) {
    entries.push({
      timestamp: ar.created_at,
      department: "marketing",
      icon: DEPARTMENTS.marketing.icon,
      title: `Affiliate sale: ${ar.affiliate_name}`,
      detail: `Order #${ar.order_id} — ${ar.status}${
        ar.discount_amount ? `, discount: $${ar.discount_amount.toFixed(2)}` : ""
      }${
        ar.commission_earned ? `, commission: $${ar.commission_earned.toFixed(2)}` : ""
      }`,
      event_type: "affiliate.referral",
      source_table: "affiliate_referrals",
      source_id: ar.id,
      links_to: null,
    });
  }

  // 8. Customer notes (V3.5)
  const notes = db.query(`
    SELECT cn.id, cn.customer_email, cn.order_id, cn.note, cn.note_type, cn.created_at
    FROM customer_notes cn
    WHERE cn.business_id = ? AND cn.created_at >= ? AND cn.created_at <= ?
    ORDER BY cn.created_at ASC
  `).all(businessId, dateStart, dateEnd);

  for (const n of notes) {
    entries.push({
      timestamp: n.created_at,
      department: "customer_service",
      icon: DEPARTMENTS.customer_service.icon,
      title: `Customer note: ${n.customer_email}`,
      detail: `${n.note_type}: ${n.note}${n.order_id ? ` (Order #${n.order_id})` : ""}`,
      event_type: "customer.note",
      source_table: "customer_notes",
      source_id: n.id,
      links_to: null,
    });
  }

  // 9. Warehouse transfers (V3.4)
  const transfers = db.query(`
    SELECT wt.id, wt.from_bin_id, wt.to_bin_id, wt.quantity, wt.transfer_type,
           wt.reference_type, wt.reference_id, wt.notes, wt.created_at,
           p.name as product_name,
           fb.name as from_bin_name, tb.name as to_bin_name
    FROM warehouse_transfers wt
    LEFT JOIN products p ON wt.product_id = p.id
    LEFT JOIN warehouse_bins fb ON wt.from_bin_id = fb.id
    LEFT JOIN warehouse_bins tb ON wt.to_bin_id = tb.id
    WHERE wt.business_id = ? AND wt.created_at >= ? AND wt.created_at <= ?
    ORDER BY wt.created_at ASC
  `).all(businessId, dateStart, dateEnd);

  for (const wt of transfers) {
    const fromStr = wt.from_bin_name || "—";
    const toStr = wt.to_bin_name || "—";
    entries.push({
      timestamp: wt.created_at,
      department: "warehouse",
      icon: DEPARTMENTS.warehouse.icon,
      title: `Transfer: ${wt.product_name || "Items"}`,
      detail: `${fromStr} → ${toStr} (${wt.quantity} units, ${wt.transfer_type})${wt.notes ? ` — ${wt.notes}` : ""}`,
      event_type: "warehouse.transfer",
      source_table: "warehouse_transfers",
      source_id: wt.id,
      links_to: null,
    });
  }

  // 10. Order scans (picking activity)
  const scans = db.query(`
    SELECT os.id, os.order_id, os.barcode, os.created_at,
           o.order_number, o.customer_name
    FROM order_scans os
    JOIN orders o ON os.order_id = o.id
    WHERE os.business_id = ? AND os.created_at >= ? AND os.created_at <= ?
    ORDER BY os.created_at ASC
  `).all(businessId, dateStart, dateEnd);

  for (const s of scans) {
    entries.push({
      timestamp: s.created_at,
      department: "warehouse",
      icon: DEPARTMENTS.warehouse.icon,
      title: `Item picked for Order #${s.order_number}`,
      detail: `Barcode: ${s.barcode} — ${s.customer_name}`,
      event_type: "order.picked",
      source_table: "order_scans",
      source_id: s.id,
      links_to: null,
    });
  }

  // ── Sort chronologically ────────────────────────────────────────────
  entries.sort((a, b) => {
    if (a.timestamp < b.timestamp) return -1;
    if (a.timestamp > b.timestamp) return 1;
    return 0;
  });

  // ── Build links_to (Operating Loop handoffs) ────────────────────────
  buildLinks(entries);

  return entries;
}

// ── Link builder: detect department-to-department handoffs ─────────────

function buildLinks(entries) {
  // Strategy: link events in chronological order where they form a chain
  // across departments. An order leads to production leads to inventory
  // leads to picking leads to shipping.

  const orderIds = new Map();   // order_id → last entry index
  const batchIds = new Map();   // batch_id → entry index

  // First pass: index entries by their source IDs
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.source_table === "orders") orderIds.set(e.source_id, i);
    if (e.source_table === "production_batches" && e.event_type === "production.batch_completed") {
      batchIds.set(e.source_id, i);
    }
  }

  // Second pass: connect the loop
  // Order → next production/inventory event
  // Production completed → next inventory movement
  // Inventory movement → next pick scan
  // Pick scan → next shipment/customer event

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    
    // Link orders to the next event in a different department
    if (e.department === "commerce" && i + 1 < entries.length) {
      // Link to next event (likely production or warehouse)
      e.links_to = i + 1;
    }

    // Link production completed to next inventory movement
    if (e.event_type === "production.batch_completed" && i + 1 < entries.length) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[j].source_table === "inventory_movements" && entries[j].event_type === "inventory.in") {
          e.links_to = j;
          break;
        }
      }
    }

    // Link inventory movements to pick scans
    if (e.source_table === "inventory_movements" && e.event_type === "inventory.order" && i + 1 < entries.length) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[j].source_table === "order_scans") {
          e.links_to = j;
          break;
        }
      }
    }

    // Link pick scans to customer notes (shipping/CS)
    if (e.source_table === "order_scans" && i + 1 < entries.length) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[j].department === "customer_service") {
          e.links_to = j;
          break;
        }
      }
    }
  }
}

// ── Route mount ───────────────────────────────────────────────────────

export function mountTimelineRoutes(app, db) {
  app.get("/api/timeline", requireAuth(db), (req, res) => {
    try {
      const date = req.query.date || new Date().toISOString().split("T")[0];

      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
      }

      const entries = queryAllSources(db, req.businessId, date);

      // Compute summary stats
      const departmentsActive = new Set(entries.map(e => e.department));
      const linkedCount = entries.filter(e => e.links_to !== null).length;
      const loopCompletion = entries.length > 0
        ? Math.round((linkedCount / entries.length) * 100)
        : 0;

      res.json({
        date,
        events: entries.map(e => ({
          ...e,
          time: formatTime(e.timestamp),
        })),
        total: entries.length,
        departments_active: departmentsActive.size,
        departments: [...departmentsActive],
        loop_completion_pct: loopCompletion,
      });
    } catch (err) {
      console.error("GET /api/timeline error:", err);
      res.status(500).json({ error: "Failed to fetch timeline" });
    }
  });
}
