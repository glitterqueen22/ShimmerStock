/**
 * ShimmerStock Approval Workflows (P4.3)
 * ======================================
 * Simple approval system for CS actions that need manager review.
 */

import { requireAuth } from "./auth.js";
import { auditLog, getDeviceInfo } from "./audit.js";
import { emit } from "./events.js";

function bizId(req) {
  return req.businessId || req.user?.business_id || 1;
}

export function mountApprovalRoutes(app, db) {

  // ═══════════════════════════════════════════════════════════════════
  // APPROVAL CRUD
  // ═══════════════════════════════════════════════════════════════════

  // POST /api/approvals — create approval request
  app.post("/api/approvals", requireAuth(db, "approvals.write"), (req, res) => {
    try {
      const { type, requestData } = req.body;

      if (!type) {
        return res.status(400).json({ error: "type is required" });
      }

      const validTypes = ["refund_override", "large_credit", "replacement_approval", "other"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `Type must be one of: ${validTypes.join(", ")}` });
      }

      const result = db.run(
        `INSERT INTO approvals (business_id, type, request_data, requested_by)
         VALUES (?, ?, ?, ?)`,
        [bizId(req), type, JSON.stringify(requestData || {}), req.user.id]
      );

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "approval.created",
        entityType: "approvals",
        entityId: result.lastInsertRowid,
        newValue: { type, requestData },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      emit("approval.created", {
        id: result.lastInsertRowid,
        businessId: bizId(req),
        type,
        requestedBy: req.user.id,
      });

      const approval = db
        .query(
          `SELECT a.*, u.display_name as requested_by_name
           FROM approvals a
           JOIN users u ON a.requested_by = u.id
           WHERE a.id = ? AND a.business_id = ?`
        )
        .get(result.lastInsertRowid, bizId(req));

      res.status(201).json({ success: true, approval });
    } catch (err) {
      console.error("POST /api/approvals error:", err);
      res.status(500).json({ error: "Failed to create approval request" });
    }
  });

  // GET /api/approvals — list approvals
  app.get("/api/approvals", requireAuth(db, "approvals.read"), (req, res) => {
    try {
      const { status } = req.query;
      const conditions = ["a.business_id = ?"];
      const params = [bizId(req)];

      if (status) {
        conditions.push("a.status = ?");
        params.push(status);
      }

      const where = conditions.join(" AND ");
      const approvals = db
        .query(
          `SELECT a.*, 
                  u1.display_name as requested_by_name,
                  u2.display_name as reviewed_by_name
           FROM approvals a
           JOIN users u1 ON a.requested_by = u1.id
           LEFT JOIN users u2 ON a.reviewed_by = u2.id
           WHERE ${where}
           ORDER BY a.created_at DESC
           LIMIT 100`
        )
        .all(...params);

      // Parse request_data JSON
      const parsed = approvals.map(a => ({
        ...a,
        request_data: safeJsonParse(a.request_data),
      }));

      res.json(parsed);
    } catch (err) {
      console.error("GET /api/approvals error:", err);
      res.status(500).json({ error: "Failed to list approvals" });
    }
  });

  // PUT /api/approvals/:id — approve or deny
  app.put("/api/approvals/:id", requireAuth(db, "approvals.write"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, notes } = req.body;

      if (!status || !["approved", "denied"].includes(status)) {
        return res.status(400).json({ error: "status must be 'approved' or 'denied'" });
      }

      const existing = db
        .query("SELECT * FROM approvals WHERE id = ? AND business_id = ?")
        .get(id, bizId(req));

      if (!existing) {
        return res.status(404).json({ error: "Approval not found" });
      }

      if (existing.status !== "pending") {
        return res.status(400).json({ error: `Cannot ${status} an approval that is already ${existing.status}` });
      }

      // Update existing request_data with review notes
      const requestData = safeJsonParse(existing.request_data);
      if (notes) {
        requestData.review_notes = notes;
      }

      db.run(
        `UPDATE approvals 
         SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), request_data = ?
         WHERE id = ? AND business_id = ?`,
        [status, req.user.id, JSON.stringify(requestData), id, bizId(req)]
      );

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: `approval.${status}`,
        entityType: "approvals",
        entityId: id,
        newValue: { status, notes },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      emit("approval.resolved", {
        id,
        businessId: bizId(req),
        type: existing.type,
        status,
        reviewedBy: req.user.id,
      });

      res.json({ success: true, status });
    } catch (err) {
      console.error("PUT /api/approvals/:id error:", err);
      res.status(500).json({ error: "Failed to update approval" });
    }
  });
}

function safeJsonParse(str) {
  try {
    return typeof str === "string" ? JSON.parse(str) : str;
  } catch {
    return {};
  }
}
