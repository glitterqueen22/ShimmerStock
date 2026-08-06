/**
 * ShimmerStock Affiliate Attribution API Routes
 * ==============================================
 * Mounted under /api/affiliate-attribution in server/index.js
 *
 * Handles: rules, commission config, attributions, referral links,
 * tracking clicks, Shopify webhooks.
 */

import * as attrStore from "./affiliate-attribution-store.js";
import { requireAuth } from "./auth.js";
import crypto from "crypto";

function bizId(req) {
  return req.businessId || req.user?.business_id || 1;
}

export function mountAffiliateAttributionRoutes(app, db, options = {}) {
  const isPrivateMode = Boolean(options.isPrivateMode);

  // ═══════════════════════════════════════════════════════════════════
  // ATTRIBUTION RULES
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/affiliate-attribution/rules?program_id=
  app.get("/api/affiliate-attribution/rules", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const programId = req.query.program_id ? parseInt(req.query.program_id) : null;
      const rules = attrStore.getAttributionRules(db, bizId(req), programId);
      res.json(rules || null);
    } catch (err) {
      console.error("GET /api/affiliate-attribution/rules error:", err);
      res.status(500).json({ error: "Failed to get attribution rules" });
    }
  });

  // PUT /api/affiliate-attribution/rules
  app.put("/api/affiliate-attribution/rules", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const programId = req.body.program_id ? parseInt(req.body.program_id) : null;
      const rules = attrStore.updateAttributionRules(db, bizId(req), programId, req.body);
      res.json(rules);
    } catch (err) {
      console.error("PUT /api/affiliate-attribution/rules error:", err);
      res.status(500).json({ error: "Failed to update attribution rules" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // COMMISSION CONFIG
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/affiliate-attribution/commission-config?program_id=
  app.get("/api/affiliate-attribution/commission-config", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const programId = req.query.program_id ? parseInt(req.query.program_id) : null;
      const config = attrStore.getCommissionConfig(db, bizId(req), programId);
      res.json(config || null);
    } catch (err) {
      console.error("GET /api/affiliate-attribution/commission-config error:", err);
      res.status(500).json({ error: "Failed to get commission config" });
    }
  });

  // PUT /api/affiliate-attribution/commission-config
  app.put("/api/affiliate-attribution/commission-config", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const programId = req.body.program_id ? parseInt(req.body.program_id) : null;
      const config = attrStore.updateCommissionConfig(db, bizId(req), programId, req.body);
      res.json(config);
    } catch (err) {
      console.error("PUT /api/affiliate-attribution/commission-config error:", err);
      res.status(500).json({ error: "Failed to update commission config" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // ATTRIBUTIONS
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/affiliate-attribution/attributions?affiliate_id=&status=&program_id=&page=&limit=
  app.get("/api/affiliate-attribution/attributions", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const filters = {};
      if (req.query.affiliate_id) filters.affiliate_id = parseInt(req.query.affiliate_id);
      if (req.query.status) filters.status = req.query.status;
      if (req.query.program_id) filters.program_id = parseInt(req.query.program_id);
      filters.limit = parseInt(req.query.limit) || 50;
      filters.offset = parseInt(req.query.offset) || 0;

      const attributions = attrStore.getAffiliateAttributions(db, bizId(req), filters);
      res.json(attributions);
    } catch (err) {
      console.error("GET /api/affiliate-attribution/attributions error:", err);
      res.status(500).json({ error: "Failed to get attributions" });
    }
  });

  // GET /api/affiliate-attribution/my-sales?affiliate_id= — for affiliate-facing view
  app.get("/api/affiliate-attribution/my-sales", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const affiliateId = parseInt(req.query.affiliate_id);
      if (!affiliateId) return res.status(400).json({ error: "affiliate_id required" });

      const attributions = attrStore.getAffiliateAttributions(db, bizId(req), {
        affiliate_id: affiliateId,
        limit: 50,
      });

      // Strip customer PII for affiliate-facing view
      const safe = attributions.map(a => ({
        id: a.id,
        shopify_order_number: a.shopify_order_number,
        created_at: a.created_at,
        eligible_amount_cents: a.eligible_amount_cents,
        commission_cents: a.commission_cents,
        commission_rate: a.commission_rate,
        status: a.status,
        attribution_method: a.attribution_method,
      }));

      res.json(safe);
    } catch (err) {
      console.error("GET /api/affiliate-attribution/my-sales error:", err);
      res.status(500).json({ error: "Failed to get sales" });
    }
  });

  // GET /api/affiliate-attribution/pending
  app.get("/api/affiliate-attribution/pending", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const pending = attrStore.getPendingAttributions(db, bizId(req));
      res.json(pending);
    } catch (err) {
      console.error("GET /api/affiliate-attribution/pending error:", err);
      res.status(500).json({ error: "Failed to get pending attributions" });
    }
  });

  // GET /api/affiliate-attribution/disputed
  app.get("/api/affiliate-attribution/disputed", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const disputed = attrStore.getDisputedAttributions(db, bizId(req));
      res.json(disputed);
    } catch (err) {
      console.error("GET /api/affiliate-attribution/disputed error:", err);
      res.status(500).json({ error: "Failed to get disputed attributions" });
    }
  });

  // POST /api/affiliate-attribution/manual — manual attribution
  app.post("/api/affiliate-attribution/manual", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const { orderId, affiliateId, reason, commissionCents, commissionRate } = req.body;
      if (!orderId || !affiliateId) {
        return res.status(400).json({ error: "orderId and affiliateId are required" });
      }

      const attr = attrStore.manualAttribute(db, bizId(req), {
        orderId: parseInt(orderId),
        affiliateId: parseInt(affiliateId),
        reason,
        commissionCents,
        commissionRate,
      });

      res.status(201).json(attr);
    } catch (err) {
      console.error("POST /api/affiliate-attribution/manual error:", err);
      res.status(500).json({ error: err.message || "Failed to create manual attribution" });
    }
  });

  // POST /api/affiliate-attribution/reverse — reverse attribution
  app.post("/api/affiliate-attribution/reverse", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const { attributionId, reason } = req.body;
      if (!attributionId) {
        return res.status(400).json({ error: "attributionId is required" });
      }

      const attr = attrStore.reverseAttribution(db, bizId(req), parseInt(attributionId), reason);
      res.json(attr);
    } catch (err) {
      console.error("POST /api/affiliate-attribution/reverse error:", err);
      res.status(500).json({ error: err.message || "Failed to reverse attribution" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // REFERRAL LINKS
  // ═══════════════════════════════════════════════════════════════════

  // POST /api/affiliate-attribution/referral-links
  app.post("/api/affiliate-attribution/referral-links", requireAuth(db, "partners.write"), (req, res) => {
    try {
      const { affiliateId, programId, utmSource, utmMedium, utmCampaign } = req.body;
      if (!affiliateId) {
        return res.status(400).json({ error: "affiliateId is required" });
      }

      const link = attrStore.createReferralLink(db, bizId(req), {
        affiliateId: parseInt(affiliateId),
        programId: programId ? parseInt(programId) : null,
        utmSource, utmMedium, utmCampaign,
      });

      res.status(201).json(link);
    } catch (err) {
      console.error("POST /api/affiliate-attribution/referral-links error:", err);
      res.status(500).json({ error: "Failed to create referral link" });
    }
  });

  // GET /api/affiliate-attribution/referral-links?affiliate_id=
  app.get("/api/affiliate-attribution/referral-links", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const affiliateId = parseInt(req.query.affiliate_id);
      if (!affiliateId) return res.status(400).json({ error: "affiliate_id required" });

      const links = attrStore.getReferralLinks(db, bizId(req), affiliateId);
      res.json(links);
    } catch (err) {
      console.error("GET /api/affiliate-attribution/referral-links error:", err);
      res.status(500).json({ error: "Failed to get referral links" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // TRACKING CLICK (public endpoint)
  // ═══════════════════════════════════════════════════════════════════

  // POST /api/affiliate-attribution/track-click
  app.post("/api/affiliate-attribution/track-click", (req, res) => {
    try {
      if (isPrivateMode) {
        return res.status(403).json({ error: "Public submissions are disabled in private staging mode" });
      }

      const { linkCode, visitorId } = req.body;
      if (!linkCode || !visitorId) {
        return res.status(400).json({ error: "linkCode and visitorId are required" });
      }

      const result = attrStore.trackReferralClick(db, linkCode, visitorId);
      if (!result) {
        return res.status(404).json({ error: "Invalid or inactive referral link" });
      }

      res.json({ success: true, ...result });
    } catch (err) {
      console.error("POST /api/affiliate-attribution/track-click error:", err);
      res.status(500).json({ error: "Failed to track click" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // SHOPIFY WEBHOOK RECEIVER (no auth required)
  // ═══════════════════════════════════════════════════════════════════

  // POST /api/affiliate-attribution/webhook/shopify
  app.post("/api/affiliate-attribution/webhook/shopify", (req, res) => {
    try {
      const shopifyTopic = req.headers["x-shopify-topic"] || "";
      const shopifyDomain = req.headers["x-shopify-shop-domain"] || "";

      // Find business by shopify domain
      const creds = db.query(
        "SELECT pc.business_id FROM provider_credentials pc WHERE pc.provider = 'shopify' AND pc.is_active = 1"
      ).all();

      // Respond 200 quickly (Shopify requires fast response)
      res.status(200).json({ received: true });

      // Process asynchronously
      const payload = req.body;
      const businessId = creds.length > 0 ? creds[0].business_id : 1;

      // Process based on topic
      switch (shopifyTopic) {
        case "orders/create":
        case "orders/paid":
          attrStore.processShopifyOrder(db, payload, businessId);
          break;
        case "orders/updated":
          // Could be status change or edit
          if (payload.financial_status === "refunded" || payload.fulfillment_status === "cancelled") {
            attrStore.syncOrderStatus(db, String(payload.id), payload.fulfillment_status === "cancelled" ? "cancelled" : "refunded", businessId, payload);
          } else if (payload.fulfillment_status === "fulfilled") {
            attrStore.syncOrderStatus(db, String(payload.id), "fulfilled", businessId, payload);
          } else {
            attrStore.syncOrderStatus(db, String(payload.id), "updated", businessId, payload);
          }
          break;
        case "orders/cancelled":
          attrStore.syncOrderStatus(db, String(payload.id), "cancelled", businessId, payload);
          break;
        case "orders/fulfilled":
          attrStore.syncOrderStatus(db, String(payload.id), "fulfilled", businessId, payload);
          break;
        case "refunds/create":
          attrStore.syncOrderStatus(db, String(payload.order_id), "refunded", businessId, payload);
          break;
        default:
          // Unknown topic — just acknowledge
          break;
      }
    } catch (err) {
      console.error("POST /api/affiliate-attribution/webhook/shopify error:", err);
      // Response already sent; just log
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // SYNC LOG
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/affiliate-attribution/sync-log
  app.get("/api/affiliate-attribution/sync-log", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const log = attrStore.getSyncLog(db, bizId(req));
      res.json(log);
    } catch (err) {
      console.error("GET /api/affiliate-attribution/sync-log error:", err);
      res.status(500).json({ error: "Failed to get sync log" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // NOVI: VALIDATION & ALERTS
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/affiliate-attribution/novi-validation
  app.get("/api/affiliate-attribution/novi-validation", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const status = attrStore.getAttributionValidationStatus(db, bizId(req));
      res.json(status);
    } catch (err) {
      console.error("GET /api/affiliate-attribution/novi-validation error:", err);
      res.status(500).json({ error: "Failed to get validation status" });
    }
  });

  // GET /api/affiliate-attribution/novi-alerts
  app.get("/api/affiliate-attribution/novi-alerts", requireAuth(db, "partners.read"), (req, res) => {
    try {
      const alerts = attrStore.getAttributionAlerts(db, bizId(req));
      res.json(alerts);
    } catch (err) {
      console.error("GET /api/affiliate-attribution/novi-alerts error:", err);
      res.status(500).json({ error: "Failed to get alerts" });
    }
  });

  console.log("Affiliate Attribution routes mounted");
}
