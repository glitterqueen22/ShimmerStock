/**
 * ShimmerStock Customer Hub API Routes (P4.3)
 * ===========================================
 * Customer search, HQ view, and tag management.
 */

import * as cs from "./customer-store.js";
import { requireAuth } from "./auth.js";
import { auditLog, getDeviceInfo } from "./audit.js";

function bizId(req) {
  return req.businessId || req.user?.business_id || 1;
}

export function mountCustomerRoutes(app, db) {

  // ═══════════════════════════════════════════════════════════════════
  // CUSTOMER SEARCH
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/customers — searchable customer directory
  app.get("/api/customers", requireAuth(db, "customers.read"), (req, res) => {
    try {
      const { search, minOrders, tag, limit } = req.query;
      const results = cs.searchCustomers(db, bizId(req), {
        search: search || null,
        minOrders: minOrders ? parseInt(minOrders) : null,
        tag: tag || null,
        limit: Math.min(Math.max(parseInt(limit) || 50, 1), 200),
      });
      res.json(results);
    } catch (err) {
      console.error("GET /api/customers error:", err);
      res.status(500).json({ error: "Failed to search customers" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // CUSTOMER HQ
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/customers/:email/hq — full customer HQ
  app.get("/api/customers/:email/hq", requireAuth(db, "customers.read"), (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const hq = cs.getCustomerHQ(db, email, bizId(req));

      if (!hq) {
        return res.status(404).json({ error: "Customer not found" });
      }

      res.json(hq);
    } catch (err) {
      console.error("GET /api/customers/:email/hq error:", err);
      res.status(500).json({ error: "Failed to fetch customer HQ" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // CUSTOMER TAGS
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/customers/:email/tags
  app.get("/api/customers/:email/tags", requireAuth(db, "customers.read"), (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const tags = cs.getCustomerTags(db, email, bizId(req));
      res.json(tags);
    } catch (err) {
      console.error("GET /api/customers/:email/tags error:", err);
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  // POST /api/customers/:email/tags — add a tag
  app.post("/api/customers/:email/tags", requireAuth(db, "customers.read"), (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const { tag } = req.body;

      if (!tag || !tag.trim()) {
        return res.status(400).json({ error: "tag is required" });
      }

      cs.addCustomerTag(db, {
        customerEmail: email,
        tag: tag.trim(),
        businessId: bizId(req),
      });

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "customer.tag_added",
        entityType: "customer_tags",
        entityId: null,
        newValue: { customerEmail: email, tag: tag.trim() },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.status(201).json({ success: true, tag: tag.trim() });
    } catch (err) {
      console.error("POST /api/customers/:email/tags error:", err);
      res.status(500).json({ error: "Failed to add tag" });
    }
  });

  // DELETE /api/customers/:email/tags/:tag — remove a tag
  app.delete("/api/customers/:email/tags/:tag", requireAuth(db, "customers.read"), (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email);
      const tag = decodeURIComponent(req.params.tag);

      cs.removeCustomerTag(db, {
        customerEmail: email,
        tag,
        businessId: bizId(req),
      });

      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/customers/:email/tags/:tag error:", err);
      res.status(500).json({ error: "Failed to remove tag" });
    }
  });
}
