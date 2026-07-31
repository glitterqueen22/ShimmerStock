/**
 * ShimmerStock Email Routes (P4.3)
 * =================================
 * Email templates, sending, and logging.
 * Prepares architecture for email inbox integration.
 */

import { requireAuth } from "./auth.js";
import { auditLog, getDeviceInfo } from "./audit.js";

function bizId(req) {
  return req.businessId || req.user?.business_id || 1;
}

/**
 * Simple template variable substitution.
 * Replaces {{variable}} tokens in a string with values from the context object.
 */
function mergeTemplate(template, context) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return context[key] !== undefined ? context[key] : match;
  });
}

export function mountEmailRoutes(app, db) {

  // ═══════════════════════════════════════════════════════════════════
  // EMAIL TEMPLATES CRUD
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/email/templates — list templates
  app.get("/api/email/templates", requireAuth(db, "email.read"), (req, res) => {
    try {
      const templates = db
        .query(
          `SELECT id, name, subject, body, created_at
           FROM email_templates
           WHERE business_id = ?
           ORDER BY name`
        )
        .all(bizId(req));
      res.json(templates);
    } catch (err) {
      console.error("GET /api/email/templates error:", err);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // GET /api/email/templates/:id — get single template
  app.get("/api/email/templates/:id", requireAuth(db, "email.read"), (req, res) => {
    try {
      const template = db
        .query(
          "SELECT id, name, subject, body, created_at FROM email_templates WHERE id = ? AND business_id = ?"
        )
        .get(parseInt(req.params.id), bizId(req));

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      // Extract merge fields from the template body
      const mergeFields = (template.body.match(/\{\{(\w+)\}\}/g) || [])
        .map(m => m.replace(/[{}]/g, ''));

      res.json({ ...template, mergeFields: [...new Set(mergeFields)] });
    } catch (err) {
      console.error("GET /api/email/templates/:id error:", err);
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  // POST /api/email/templates — create template
  app.post("/api/email/templates", requireAuth(db, "email.read"), (req, res) => {
    try {
      const { name, subject, body } = req.body;

      if (!name || !subject || !body) {
        return res.status(400).json({ error: "name, subject, and body are required" });
      }

      const result = db.run(
        `INSERT INTO email_templates (business_id, name, subject, body) VALUES (?, ?, ?, ?)`,
        [bizId(req), name.trim(), subject.trim(), body.trim()]
      );

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "email.template_created",
        entityType: "email_templates",
        entityId: result.lastInsertRowid,
        newValue: { name: name.trim(), subject: subject.trim() },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.status(201).json({
        id: result.lastInsertRowid,
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim(),
      });
    } catch (err) {
      console.error("POST /api/email/templates error:", err);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  // PUT /api/email/templates/:id — update template
  app.put("/api/email/templates/:id", requireAuth(db, "email.read"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, subject, body } = req.body;

      const existing = db
        .query("SELECT id FROM email_templates WHERE id = ? AND business_id = ?")
        .get(id, bizId(req));
      if (!existing) {
        return res.status(404).json({ error: "Template not found" });
      }

      const fields = [];
      const params = [];
      if (name !== undefined) { fields.push("name = ?"); params.push(name.trim()); }
      if (subject !== undefined) { fields.push("subject = ?"); params.push(subject.trim()); }
      if (body !== undefined) { fields.push("body = ?"); params.push(body.trim()); }

      if (fields.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      params.push(id);
      db.run(`UPDATE email_templates SET ${fields.join(", ")} WHERE id = ?`, ...params);

      res.json({ success: true });
    } catch (err) {
      console.error("PUT /api/email/templates/:id error:", err);
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  // DELETE /api/email/templates/:id
  app.delete("/api/email/templates/:id", requireAuth(db, "email.read"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      db.run("DELETE FROM email_templates WHERE id = ? AND business_id = ?", [id, bizId(req)]);
      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/email/templates/:id error:", err);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // EMAIL SENDING
  // ═══════════════════════════════════════════════════════════════════

  // POST /api/email/send — queue an email
  app.post("/api/email/send", requireAuth(db, "email.send"), (req, res) => {
    try {
      const { customerEmail, subject, body, templateId, templateContext } = req.body;

      if (!customerEmail || !subject) {
        return res.status(400).json({ error: "customerEmail and subject are required" });
      }

      let finalBody = body;

      // If using a template, load and apply merge
      if (templateId) {
        const template = db
          .query("SELECT body FROM email_templates WHERE id = ? AND business_id = ?")
          .get(templateId, bizId(req));
        if (template) {
          finalBody = templateContext
            ? mergeTemplate(template.body, templateContext)
            : template.body;
        }
      }

      if (!finalBody) {
        return res.status(400).json({ error: "body is required (or template with context)" });
      }

      const result = db.run(
        `INSERT INTO email_log (business_id, customer_email, subject, body, template_id, status)
         VALUES (?, ?, ?, ?, ?, 'queued')`,
        [bizId(req), customerEmail.trim().toLowerCase(), subject.trim(), finalBody, templateId || null]
      );

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "email.queued",
        entityType: "email_log",
        entityId: result.lastInsertRowid,
        newValue: { customerEmail: customerEmail.trim().toLowerCase(), subject: subject.trim() },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      // Simulate sending: mark as sent immediately (will be replaced with real email provider)
      db.run(
        "UPDATE email_log SET status = 'sent', sent_at = datetime('now') WHERE id = ?",
        [result.lastInsertRowid]
      );

      console.log(`[email] Queued email to ${customerEmail}: "${subject}" (id=${result.lastInsertRowid})`);

      res.status(201).json({
        success: true,
        id: result.lastInsertRowid,
        status: "sent",
        message: "Email queued and sent",
      });
    } catch (err) {
      console.error("POST /api/email/send error:", err);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // GET /api/email/log — list sent emails
  app.get("/api/email/log", requireAuth(db, "email.read"), (req, res) => {
    try {
      const { customerEmail, limit } = req.query;
      const conditions = ["el.business_id = ?"];
      const params = [bizId(req)];

      if (customerEmail) {
        conditions.push("el.customer_email = ?");
        params.push(customerEmail.trim().toLowerCase());
      }

      const where = conditions.join(" AND ");
      const logs = db
        .query(
          `SELECT el.*, et.name as template_name
           FROM email_log el
           LEFT JOIN email_templates et ON el.template_id = et.id
           WHERE ${where}
           ORDER BY el.created_at DESC
           LIMIT ?`
        )
        .all(...params, Math.min(parseInt(limit) || 50, 200));

      res.json(logs);
    } catch (err) {
      console.error("GET /api/email/log error:", err);
      res.status(500).json({ error: "Failed to fetch email log" });
    }
  });

  // POST /api/email/preview — preview a template with merge context
  app.post("/api/email/preview", requireAuth(db, "email.read"), (req, res) => {
    try {
      const { templateId, context } = req.body;

      if (!templateId) {
        return res.status(400).json({ error: "templateId is required" });
      }

      const template = db
        .query("SELECT id, name, subject, body FROM email_templates WHERE id = ? AND business_id = ?")
        .get(parseInt(templateId), bizId(req));

      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      const previewSubject = context ? mergeTemplate(template.subject, context) : template.subject;
      const previewBody = context ? mergeTemplate(template.body, context) : template.body;

      res.json({
        template: template.name,
        subject: previewSubject,
        body: previewBody,
      });
    } catch (err) {
      console.error("POST /api/email/preview error:", err);
      res.status(500).json({ error: "Failed to preview" });
    }
  });
}
