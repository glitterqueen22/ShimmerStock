/**
 * Novi Message Center — Backend Infrastructure
 * ==============================================
 * Message inbox for Novi-generated notifications, alerts, and celebrations.
 * Detection engines publish messages; users view/snooze/dismiss them.
 *
 * All routes require auth (reports.read minimum).
 */

import * as store from "./store.js";
import { requireAuth } from "./auth.js";
import { runAllChecks } from "./novi-detection.js";

// ── GET /api/novi/messages — list messages for business ─────────────

export function mountNoviMessageRoutes(app, db) {

  app.get("/api/novi/messages", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const { status, severity, limit, offset } = req.query;
      const filters = {};
      if (status) filters.status = status;
      if (severity) filters.severity = severity;
      if (limit) filters.limit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
      if (offset) filters.offset = Math.max(parseInt(offset) || 0, 0);

      const messages = store.getNoviMessages(db, req.businessId, filters);
      const unreadCount = store.getNoviMessageCounts(db, req.businessId).unread;

      res.json({ messages, unread_count: unreadCount });
    } catch (err) {
      console.error("GET /api/novi/messages error:", err);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // ── POST /api/novi/messages — create a message ─────────────────────

  app.post("/api/novi/messages", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const { event_type, title, description, action_type, action_label, action_link, action_route, severity, context_data } = req.body;

      if (!event_type || !title || !description) {
        return res.status(400).json({ error: "event_type, title, and description are required" });
      }

      const validSeverities = ["info", "warning", "opportunity", "celebration", "urgent"];
      const sev = validSeverities.includes(severity) ? severity : "info";

      const id = store.createNoviMessage(db, {
        businessId: req.businessId,
        userId: req.user.id,
        eventType: event_type,
        title,
        description,
        actionType: action_type || null,
        actionLabel: action_label || null,
        actionLink: action_link || null,
        actionRoute: action_route || action_link || null,
        severity: sev,
        contextData: context_data ? JSON.stringify(context_data) : null,
      });

      res.status(201).json({ id, event_type, title, severity: sev, status: "new" });
    } catch (err) {
      console.error("POST /api/novi/messages error:", err);
      res.status(500).json({ error: "Failed to create message" });
    }
  });

  // ── PATCH /api/novi/messages/:id — update message status ──────────

  app.patch("/api/novi/messages/:id", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const { status } = req.body;
      const validStatuses = ["viewed", "snoozed", "completed", "dismissed"];

      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
      }

      const updated = store.updateNoviMessageStatus(db, req.params.id, req.businessId, status);

      if (!updated) {
        return res.status(404).json({ error: "Message not found" });
      }

      res.json({ success: true, id: parseInt(req.params.id), status });
    } catch (err) {
      console.error("PATCH /api/novi/messages/:id error:", err);
      res.status(500).json({ error: "Failed to update message" });
    }
  });

  // ── POST /api/novi/messages/batch — batch create ───────────────────

  app.post("/api/novi/messages/batch", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array is required" });
      }

      const created = [];
      for (const msg of messages) {
        if (!msg.event_type || !msg.title || !msg.description) continue;

        const validSeverities = ["info", "warning", "opportunity", "celebration", "urgent"];
        const sev = validSeverities.includes(msg.severity) ? msg.severity : "info";

        const id = store.createNoviMessage(db, {
          businessId: req.businessId,
          userId: req.user.id,
          eventType: msg.event_type,
          title: msg.title,
          description: msg.description,
          actionType: msg.action_type || null,
          actionLabel: msg.action_label || null,
          actionLink: msg.action_link || null,
          actionRoute: msg.action_route || msg.action_link || null,
          severity: sev,
          contextData: msg.context_data ? JSON.stringify(msg.context_data) : null,
        });

        created.push({ id, event_type: msg.event_type, title: msg.title, severity: sev });
      }

      res.status(201).json({ created: created.length, messages: created });
    } catch (err) {
      console.error("POST /api/novi/messages/batch error:", err);
      res.status(500).json({ error: "Failed to create messages" });
    }
  });

  // ── GET /api/novi/settings — get Novi settings ─────────────────────

  app.get("/api/novi/settings", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const settings = store.getNoviSettings(db, req.businessId, req.user.id);

      res.json({
        frequency: settings?.frequency || "balanced",
        sound_enabled: settings ? !!settings.sound_enabled : true,
        popup_enabled: settings ? !!settings.popup_enabled : true,
        email_enabled: settings ? !!settings.email_enabled : false,
        push_enabled: settings ? !!settings.push_enabled : false,
      });
    } catch (err) {
      console.error("GET /api/novi/settings error:", err);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // ── PUT /api/novi/settings — update settings ───────────────────────

  app.put("/api/novi/settings", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const { frequency, sound_enabled, popup_enabled, email_enabled, push_enabled } = req.body;

      const data = {};
      const validFrequencies = ["proactive", "balanced", "minimal", "quiet"];
      if (frequency !== undefined) {
        if (!validFrequencies.includes(frequency)) {
          return res.status(400).json({ error: `frequency must be one of: ${validFrequencies.join(", ")}` });
        }
        data.frequency = frequency;
      }
      if (sound_enabled !== undefined) data.soundEnabled = sound_enabled ? 1 : 0;
      if (popup_enabled !== undefined) data.popupEnabled = popup_enabled ? 1 : 0;
      if (email_enabled !== undefined) data.emailEnabled = email_enabled ? 1 : 0;
      if (push_enabled !== undefined) data.pushEnabled = push_enabled ? 1 : 0;

      store.upsertNoviSettings(db, req.businessId, req.user.id, data);

      const settings = store.getNoviSettings(db, req.businessId, req.user.id);
      res.json({
        frequency: settings.frequency,
        sound_enabled: !!settings.sound_enabled,
        popup_enabled: !!settings.popup_enabled,
        email_enabled: !!settings.email_enabled,
        push_enabled: !!settings.push_enabled,
      });
    } catch (err) {
      console.error("PUT /api/novi/settings error:", err);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // ── GET /api/novi/messages/summary — message center summary ─────────

  app.get("/api/novi/messages/summary", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const counts = store.getNoviMessageCounts(db, req.businessId);
      const latestMessage = store.getNoviLatestMessage(db, req.businessId);

      res.json({
        unread_count: counts.unread,
        urgent_count: counts.urgent,
        celebration_count: counts.celebration,
        latest_message: latestMessage || null,
      });
    } catch (err) {
      console.error("GET /api/novi/messages/summary error:", err);
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  });

  // ── POST /api/novi/scan — manually trigger detection scan ─────────

  app.post("/api/novi/scan", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const results = runAllChecks(db, req.businessId);
      const totalMessages = results.reduce((sum, r) => sum + r.created, 0);

      res.json({ success: true, results, totalMessages });
    } catch (err) {
      console.error("POST /api/novi/scan error:", err);
      res.status(500).json({ error: "Failed to run detection scan" });
    }
  });

  // ── GET /api/novi/context/:page — contextual guidance for a page ───

  app.get("/api/novi/context/:page", requireAuth(db, "reports.read"), (req, res) => {
    try {
      const { page } = req.params;
      const businessId = req.businessId;
      const suggestions = [];

      switch (page) {
        case "dashboard": {
          // Setup status
          const productCount = db.query("SELECT COUNT(*) as count FROM products WHERE business_id = ?").get(businessId).count;
          const commerceConnected = db.query("SELECT COUNT(*) as count FROM provider_credentials WHERE business_id = ?").get(businessId).count > 0;

          if (!commerceConnected) {
            suggestions.push({
              icon: "🔌",
              title: "Connect your store",
              description: "Link Shopify to import products and orders automatically.",
              action: { label: "Connect Shopify", route: "/commerce", type: "navigate" },
            });
          } else {
            // Recent activity
            const recentOrders = db.query("SELECT COUNT(*) as count FROM orders WHERE business_id = ? AND created_at >= datetime('now', '-7 days')").get(businessId).count;
            if (recentOrders > 0) {
              suggestions.push({
                icon: "📊",
                title: `${recentOrders} new orders this week`,
                description: "Head to orders to process recent activity.",
                action: { label: "View Orders", route: "/orders", type: "navigate" },
              });
            } else {
              suggestions.push({
                icon: "🚀",
                title: "Ready for your first order",
                description: productCount > 0 ? "Your products are set up. Let's grow!" : "Add your first product to get started.",
                action: { label: productCount > 0 ? "View Products" : "Add Product", route: "/products", type: "navigate" },
              });
            }
          }

          // Check low stock
          const lowStockCount = db.query(
            `SELECT COUNT(*) as count FROM products p
             LEFT JOIN inventory_thresholds t ON t.product_id = p.id AND t.business_id = p.business_id
             WHERE p.business_id = ? AND p.stock_count > 0 AND p.stock_count <= COALESCE(t.reorder_point, 5)`
          ).get(businessId).count;
          if (lowStockCount > 0) {
            suggestions.push({
              icon: "⚠️",
              title: `${lowStockCount} product(s) low on stock`,
              description: "Reorder soon to avoid stockouts.",
              action: { label: "Check Inventory", route: "/products", type: "navigate" },
            });
          }
          break;
        }

        case "inventory": {
          // Low stock count
          const lowStockCount = db.query(
            `SELECT COUNT(*) as count FROM products p
             LEFT JOIN inventory_thresholds t ON t.product_id = p.id AND t.business_id = p.business_id
             WHERE p.business_id = ? AND p.stock_count > 0 AND p.stock_count <= COALESCE(t.reorder_point, 5)`
          ).get(businessId).count;

          if (lowStockCount > 0) {
            suggestions.push({
              icon: "⚠️",
              title: `${lowStockCount} item(s) need reordering`,
              description: "Low stock products should be restocked soon.",
              action: { label: "Create Purchase Orders", route: "/purchasing", type: "navigate" },
            });
          }

          // Out of stock
          const outOfStockCount = db.query("SELECT COUNT(*) as count FROM products WHERE business_id = ? AND stock_count <= 0").get(businessId).count;
          if (outOfStockCount > 0) {
            suggestions.push({
              icon: "🔴",
              title: `${outOfStockCount} product(s) out of stock`,
              description: "These products are unavailable for orders.",
              action: { label: "Reorder Now", route: "/purchasing", type: "navigate" },
            });
          }

          // Missing SKUs
          const missingSkuCount = db.query("SELECT COUNT(*) as count FROM products WHERE business_id = ? AND (sku IS NULL OR sku = '')").get(businessId).count;
          if (missingSkuCount > 0) {
            suggestions.push({
              icon: "🏷️",
              title: `${missingSkuCount} product(s) missing SKUs`,
              description: "Add SKUs for better inventory tracking.",
              action: { label: "Generate SKUs", route: "/products?filter=missing-sku", type: "navigate" },
            });
          }

          // If everything is fine
          if (lowStockCount === 0 && outOfStockCount === 0 && missingSkuCount === 0) {
            suggestions.push({
              icon: "✅",
              title: "Inventory looks good!",
              description: "All products are stocked and tracked.",
              action: null,
            });
          }
          break;
        }

        case "orders": {
          // Pending orders
          const pendingCount = db.query("SELECT COUNT(*) as count FROM orders WHERE business_id = ? AND status IN ('processing','pending','confirmed')").get(businessId).count;
          if (pendingCount > 0) {
            suggestions.push({
              icon: "📋",
              title: `${pendingCount} order(s) need processing`,
              description: "Head to fulfillment to get these shipped.",
              action: { label: "Go to Fulfillment", route: "/fulfillment", type: "navigate" },
            });
          }

          // Delayed orders
          const delayedCount = db.query("SELECT COUNT(*) as count FROM orders WHERE business_id = ? AND status IN ('processing','pending') AND created_at < datetime('now', '-48 hours')").get(businessId).count;
          if (delayedCount > 0) {
            suggestions.push({
              icon: "⏰",
              title: `${delayedCount} order(s) are delayed`,
              description: "These have been pending over 48 hours.",
              action: { label: "Review Delayed", route: "/orders?status=pending", type: "navigate" },
            });
          }

          // Returns
          let returnCount = 0;
          try {
            returnCount = db.query("SELECT COUNT(*) as count FROM orders WHERE business_id = ? AND (status = 'returned' OR status = 'return_pending')").get(businessId).count;
          } catch {}
          if (returnCount > 0) {
            suggestions.push({
              icon: "↩️",
              title: `${returnCount} return(s) waiting`,
              description: "Process returns to keep customers happy.",
              action: { label: "Process Returns", route: "/orders?status=returned", type: "navigate" },
            });
          }

          if (pendingCount === 0 && delayedCount === 0 && returnCount === 0) {
            suggestions.push({
              icon: "✅",
              title: "All orders are caught up",
              description: "Nothing needs attention right now.",
              action: null,
            });
          }
          break;
        }

        case "fulfillment": {
          // Orders ready to pack
          const readyToPack = db.query("SELECT COUNT(*) as count FROM orders WHERE business_id = ? AND status = 'confirmed'").get(businessId).count;
          if (readyToPack > 0) {
            suggestions.push({
              icon: "📦",
              title: `${readyToPack} order(s) ready to pack`,
              description: "These are confirmed and waiting to ship.",
              action: { label: "Start Packing", route: "/fulfillment", type: "navigate" },
            });
          }

          // Deadlines approaching
          const deadlineOrders = db.query("SELECT COUNT(*) as count FROM orders WHERE business_id = ? AND status IN ('processing','pending') AND created_at < datetime('now', '-24 hours')").get(businessId).count;
          if (deadlineOrders > 0) {
            suggestions.push({
              icon: "⏰",
              title: `${deadlineOrders} order(s) approaching deadline`,
              description: "Ship these soon to meet expectations.",
              action: { label: "Prioritize These", route: "/fulfillment", type: "navigate" },
            });
          }

          if (readyToPack === 0 && deadlineOrders === 0) {
            suggestions.push({
              icon: "✅",
              title: "Fulfillment is up to date",
              description: "No orders waiting to be shipped.",
              action: null,
            });
          }
          break;
        }

        case "partners": {
          // Pending applications
          let pendingApps = [];
          try {
            pendingApps = db.query(
              `SELECT pa.id, pa.applicant_name, pp.name as program_name
               FROM partner_applications pa
               JOIN partner_programs pp ON pa.program_id = pp.id
               WHERE pa.business_id = ? AND pa.status = 'pending'`
            ).all(businessId);
          } catch {}

          if (pendingApps.length > 0) {
            suggestions.push({
              icon: "👥",
              title: `${pendingApps.length} application(s) to review`,
              description: "New applicants are waiting for your decision.",
              action: { label: "Review Applications", route: "/partners?tab=applications", type: "navigate" },
            });
          } else {
            suggestions.push({
              icon: "💼",
              title: "Create a partner program",
              description: "Set up affiliate or wholesale programs to grow your business.",
              action: { label: "Create Program", route: "/partners", type: "navigate" },
            });
          }
          break;
        }

        case "commerce": {
          // Connection status
          const commerceCount = db.query("SELECT COUNT(*) as count FROM provider_credentials WHERE business_id = ?").get(businessId).count;
          if (commerceCount === 0) {
            suggestions.push({
              icon: "🔌",
              title: "No store connected",
              description: "Connect Shopify to sync products and orders.",
              action: { label: "Connect Shopify", route: "/commerce?connect=1", type: "navigate" },
            });
          } else {
            // Check last sync
            let lastSync = null;
            try {
              lastSync = db.query(
                "SELECT status, created_at FROM sync_log WHERE business_id = ? ORDER BY created_at DESC LIMIT 1"
              ).get(businessId);
            } catch {}
            if (lastSync) {
              const syncTime = new Date(lastSync.created_at + 'Z');
              const hoursAgo = Math.floor((Date.now() - syncTime.getTime()) / (1000 * 60 * 60));
              suggestions.push({
                icon: lastSync.status === 'success' ? "✅" : "⚠️",
                title: `Last sync: ${hoursAgo}h ago`,
                description: `Status: ${lastSync.status}. Keep your data fresh.`,
                action: { label: "Sync Now", route: "/commerce", type: "navigate" },
              });
            } else {
              suggestions.push({
                icon: "🔄",
                title: "Store is connected",
                description: "Run a sync to pull latest products and orders.",
                action: { label: "Sync Now", route: "/commerce", type: "navigate" },
              });
            }
          }
          break;
        }

        default:
          suggestions.push({
            icon: "💜",
            title: "How can I help?",
            description: "Ask me anything about your business — I'm here to help!",
            action: null,
          });
          break;
      }

      res.json({ page, suggestions });
    } catch (err) {
      console.error("GET /api/novi/context/:page error:", err);
      res.status(500).json({ error: "Failed to get page context" });
    }
  });

  console.log("Novi Message Center routes mounted");
}
