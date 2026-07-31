/**
 * ShimmerStock Affiliate API Routes (V4.4v2 — Affiliate HQ 2.0)
 * ==============================================================
 * Mounted in server/index.js
 * Best-in-class advocate growth platform: wallets, earnings, coupons,
 * reward settings, commission rules, fraud detection, goals, toolkit.
 */

import * as affStore from "./affiliate-store.js";
import { requireAuth } from "./auth.js";
import { emit } from "./events.js";
import { auditLog, getDeviceInfo } from "./audit.js";

function bizId(req) {
  return req.businessId || req.user?.business_id || 1;
}

export function mountAffiliateRoutes(app, db) {

  // ═══════════════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/affiliates/dashboard", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const data = affStore.getEnhancedDashboard(db, bizId(req));
      res.json(data);
    } catch (err) {
      console.error("GET /api/affiliates/dashboard error:", err);
      res.status(500).json({ error: "Failed to load dashboard" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // WALLET SYSTEM
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/affiliates/:id/wallet — wallet balance + transactions
  app.get("/api/affiliates/:id/wallet", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const wallet = affStore.getWallet(db, id);
      res.json(wallet);
    } catch (err) {
      console.error("GET /api/affiliates/:id/wallet error:", err);
      res.status(500).json({ error: "Failed to get wallet" });
    }
  });

  // POST /api/affiliates/:id/redeem — redeem from wallet
  app.post("/api/affiliates/:id/redeem", requireAuth(db, "affiliates.write"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { amountCents, description } = req.body;
      if (!amountCents || amountCents <= 0) {
        return res.status(400).json({ error: "amountCents must be positive" });
      }
      const wallet = affStore.redeemWallet(db, {
        affiliateId: id,
        amountCents: parseInt(amountCents),
        description: description || "Manual redemption",
      });
      res.json({ success: true, wallet });
    } catch (err) {
      console.error("POST /api/affiliates/:id/redeem error:", err);
      res.status(400).json({ error: err.message || "Failed to redeem" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // EARNINGS TIMELINE
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/affiliates/:id/earnings", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const earnings = affStore.getEarningsTimeline(db, id, bizId(req));
      res.json(earnings);
    } catch (err) {
      console.error("GET /api/affiliates/:id/earnings error:", err);
      res.status(500).json({ error: "Failed to get earnings" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // COUPONS
  // ═══════════════════════════════════════════════════════════════════

  // POST /api/affiliates/:id/coupons — generate a coupon from balance
  app.post("/api/affiliates/:id/coupons", requireAuth(db, "affiliates.write"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { amountDollars } = req.body;
      if (!amountDollars || amountDollars < 5) {
        return res.status(400).json({ error: "Minimum coupon amount is $5" });
      }
      const amountCents = Math.round(amountDollars * 100);
      const coupon = affStore.generateCoupon(db, {
        affiliateId: id,
        amountCents,
        businessId: bizId(req),
      });

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "affiliate.coupon_generated",
        entityType: "affiliate_coupons",
        entityId: coupon.id,
        newValue: { code: coupon.code, amountDollars },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.status(201).json({ success: true, coupon });
    } catch (err) {
      console.error("POST /api/affiliates/:id/coupons error:", err);
      res.status(400).json({ error: err.message || "Failed to generate coupon" });
    }
  });

  app.get("/api/affiliates/:id/coupons", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const coupons = affStore.listCoupons(db, id);
      res.json(coupons);
    } catch (err) {
      console.error("GET /api/affiliates/:id/coupons error:", err);
      res.status(500).json({ error: "Failed to list coupons" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // REWARD SETTINGS
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/affiliates/reward-settings", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const settings = affStore.getRewardSettings(db, bizId(req));
      res.json(settings);
    } catch (err) {
      console.error("GET /api/affiliates/reward-settings error:", err);
      res.status(500).json({ error: "Failed to get reward settings" });
    }
  });

  app.put("/api/affiliates/reward-settings", requireAuth(db, "affiliates.write"), (req, res) => {
    try {
      const { rewardType, config } = req.body;
      if (!rewardType) {
        return res.status(400).json({ error: "rewardType is required" });
      }
      const settings = affStore.updateRewardSettings(db, bizId(req), { rewardType, config });

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "affiliate.reward_settings_updated",
        entityType: "affiliate_reward_settings",
        entityId: bizId(req),
        newValue: { rewardType, config },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.json({ success: true, settings });
    } catch (err) {
      console.error("PUT /api/affiliates/reward-settings error:", err);
      res.status(500).json({ error: "Failed to update reward settings" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // COMMISSION RULES
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/affiliates/commission-rules", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const rules = affStore.getCommissionRules(db, bizId(req));
      res.json(rules);
    } catch (err) {
      console.error("GET /api/affiliates/commission-rules error:", err);
      res.status(500).json({ error: "Failed to get commission rules" });
    }
  });

  app.put("/api/affiliates/commission-rules", requireAuth(db, "affiliates.write"), (req, res) => {
    try {
      const { commissionType, rate, options } = req.body;
      if (!commissionType || rate === undefined) {
        return res.status(400).json({ error: "commissionType and rate are required" });
      }
      const rules = affStore.updateCommissionRules(db, bizId(req), {
        commissionType,
        rate: parseFloat(rate),
        options,
      });

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "affiliate.commission_rules_updated",
        entityType: "affiliate_commission_rules",
        entityId: bizId(req),
        newValue: { commissionType, rate, options },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.json({ success: true, rules });
    } catch (err) {
      console.error("PUT /api/affiliates/commission-rules error:", err);
      res.status(500).json({ error: "Failed to update commission rules" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // FRAUD DETECTION
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/affiliates/fraud-check", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const flags = affStore.runFraudCheck(db, bizId(req));
      res.json(flags);
    } catch (err) {
      console.error("GET /api/affiliates/fraud-check error:", err);
      res.status(500).json({ error: "Failed to run fraud check" });
    }
  });

  app.post("/api/affiliates/fraud-flags/:id/review", requireAuth(db, "affiliates.write"), (req, res) => {
    try {
      const flagId = parseInt(req.params.id);
      const { status } = req.body;
      if (!status || !["dismissed", "confirmed"].includes(status)) {
        return res.status(400).json({ error: "status must be 'dismissed' or 'confirmed'" });
      }
      const flag = affStore.reviewFraudFlag(db, flagId, status, req.user.id);

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "affiliate.fraud_flag_reviewed",
        entityType: "affiliate_fraud_flags",
        entityId: flagId,
        newValue: { status },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.json({ success: true, flag });
    } catch (err) {
      console.error("POST /api/affiliates/fraud-flags/:id/review error:", err);
      res.status(500).json({ error: "Failed to review fraud flag" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // GOALS
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/affiliates/:id/goals", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const goals = affStore.getGoals(db, id);
      res.json(goals);
    } catch (err) {
      console.error("GET /api/affiliates/:id/goals error:", err);
      res.status(500).json({ error: "Failed to get goals" });
    }
  });

  app.post("/api/affiliates/:id/goals", requireAuth(db, "affiliates.write"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { title, target, reward } = req.body;
      if (!title || !target) {
        return res.status(400).json({ error: "title and target are required" });
      }
      const goal = affStore.createGoal(db, {
        affiliateId: id,
        businessId: bizId(req),
        title,
        target: parseInt(target),
        reward: reward || null,
      });
      res.status(201).json({ success: true, goal });
    } catch (err) {
      console.error("POST /api/affiliates/:id/goals error:", err);
      res.status(500).json({ error: "Failed to create goal" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // TOOLKIT
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/affiliates/:id/toolkit", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const toolkit = affStore.getToolkit(db, id, bizId(req));
      if (!toolkit) return res.status(404).json({ error: "Affiliate not found" });
      res.json(toolkit);
    } catch (err) {
      console.error("GET /api/affiliates/:id/toolkit error:", err);
      res.status(500).json({ error: "Failed to get toolkit" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // EXISTING ROUTES (P4.4) — kept for backward compatibility
  // ═══════════════════════════════════════════════════════════════════

  // POST /api/affiliates — Create affiliate
  app.post("/api/affiliates", requireAuth(db, "affiliates.write"), (req, res) => {
    try {
      const { name, email, discountCode, discountType, discountValue, commissionRate, notes } = req.body;

      if (!name || !discountCode) {
        return res.status(400).json({ error: "name and discountCode are required" });
      }

      const existing = db
        .query("SELECT id FROM affiliates WHERE discount_code = ? AND business_id = ?")
        .get(discountCode, bizId(req));
      if (existing) {
        return res.status(409).json({ error: "Discount code already in use" });
      }

      const affId = affStore.createAffiliate(db, {
        businessId: bizId(req),
        name: name.trim(),
        email: email?.trim() || null,
        discountCode: discountCode.trim().toUpperCase(),
        discountType: discountType || "percentage",
        discountValue: parseFloat(discountValue) || 10,
        commissionRate: parseFloat(commissionRate) || 0,
        notes: notes?.trim() || null,
      });

      // Auto-create wallet
      affStore.ensureWallet(db, affId);

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "affiliate.created",
        entityType: "affiliates",
        entityId: affId,
        newValue: { name, discountCode },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      emit("affiliate.created", {
        affiliateId: affId,
        businessId: bizId(req),
        name,
        discountCode,
      });

      const affiliate = affStore.getAffiliate(db, affId, bizId(req));
      res.status(201).json({ success: true, affiliate });
    } catch (err) {
      console.error("POST /api/affiliates error:", err);
      res.status(500).json({ error: "Failed to create affiliate" });
    }
  });

  // GET /api/affiliates — List all affiliates
  app.get("/api/affiliates", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const affiliates = affStore.listAffiliates(db, bizId(req));
      // Enrich with wallet data
      const enriched = affiliates.map(a => {
        const wallet = db.query("SELECT balance_cents FROM affiliate_wallets WHERE affiliate_id = ?").get(a.id);
        return { ...a, wallet_balance_cents: wallet?.balance_cents || 0 };
      });
      res.json(enriched);
    } catch (err) {
      console.error("GET /api/affiliates error:", err);
      res.status(500).json({ error: "Failed to list affiliates" });
    }
  });

  // GET /api/affiliates/leaderboard
  app.get("/api/affiliates/leaderboard", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const { period } = req.query;
      const leaderboard = affStore.getLeaderboard(db, bizId(req), period || "month");
      res.json(leaderboard);
    } catch (err) {
      console.error("GET /api/affiliates/leaderboard error:", err);
      res.status(500).json({ error: "Failed to get leaderboard" });
    }
  });

  // GET /api/affiliates/referrals
  app.get("/api/affiliates/referrals", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const { affiliateId, status } = req.query;
      const referrals = affStore.listReferrals(db, bizId(req), {
        affiliateId: affiliateId ? parseInt(affiliateId) : undefined,
        status,
      });
      res.json(referrals);
    } catch (err) {
      console.error("GET /api/affiliates/referrals error:", err);
      res.status(500).json({ error: "Failed to list referrals" });
    }
  });

  // POST /api/affiliates/referrals — Record a referral (with auto wallet credit)
  app.post("/api/affiliates/referrals", requireAuth(db, "affiliates.write"), (req, res) => {
    try {
      const { orderId, discountCode } = req.body;

      if (!orderId || !discountCode) {
        return res.status(400).json({ error: "orderId and discountCode are required" });
      }

      const affiliate = affStore.findAffiliateByCode(db, discountCode.trim().toUpperCase(), bizId(req));
      if (!affiliate) {
        return res.status(404).json({ error: "No active affiliate found with this discount code" });
      }

      const order = db
        .query("SELECT id, total_amount, order_number FROM orders WHERE id = ? AND business_id = ?")
        .get(parseInt(orderId), bizId(req));
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const existing = db
        .query("SELECT id FROM affiliate_referrals WHERE order_id = ? AND affiliate_id = ? AND business_id = ?")
        .get(parseInt(orderId), affiliate.id, bizId(req));
      if (existing) {
        return res.status(409).json({ error: "Referral already recorded for this order and affiliate" });
      }

      // Use commission rules if available
      const rules = affStore.getCommissionRules(db, bizId(req));
      let commissionRate = affiliate.commission_rate || rules.rate || 5;
      let commissionEarned = order.total_amount * (commissionRate / 100);

      // Apply rule options
      if (rules.options) {
        const opts = rules.options;
        if (opts.exclude_discounts) {
          // Simplified: use total_amount as-is
        }
        if (!opts.include_shipping) {
          // Simplified: no shipping field to subtract
        }
        if (!opts.include_tax) {
          // Simplified: no tax field to subtract
        }
      }

      const discountAmount = affiliate.discount_type === "fixed_amount"
        ? Math.min(affiliate.discount_value, order.total_amount)
        : (order.total_amount * (affiliate.discount_value / 100));

      const storeCreditIssued = commissionEarned;

      const refId = affStore.recordReferral(db, {
        affiliateId: affiliate.id,
        orderId: parseInt(orderId),
        discountAmount: Math.round(discountAmount * 100) / 100,
        commissionEarned: Math.round(commissionEarned * 100) / 100,
        storeCreditIssued: Math.round(storeCreditIssued * 100) / 100,
        businessId: bizId(req),
      });

      // Auto-credit wallet
      affStore.creditWallet(db, {
        affiliateId: affiliate.id,
        amountCents: Math.round(storeCreditIssued * 100),
        orderId: parseInt(orderId),
        description: `Commission for order #${order.order_number}`,
      });

      // Update toolkit stats
      db.run(
        "UPDATE affiliate_toolkit_stats SET conversions = conversions + 1, revenue_generated_cents = revenue_generated_cents + ? WHERE affiliate_id = ?",
        [Math.round(order.total_amount * 100), affiliate.id]
      );

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "affiliate.referral_created",
        entityType: "affiliate_referrals",
        entityId: refId,
        newValue: { affiliateId: affiliate.id, orderId, discountCode },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      emit("affiliate.referral_created", {
        referralId: refId,
        affiliateId: affiliate.id,
        affiliateName: affiliate.name,
        businessId: bizId(req),
        orderId,
        orderNumber: order.order_number,
        discountAmount,
        commissionEarned,
      });

      const referral = db
        .query(
          `SELECT ar.*, a.name as affiliate_name, a.discount_code,
                  o.order_number, o.customer_name, o.total_amount as order_total
           FROM affiliate_referrals ar
           JOIN affiliates a ON ar.affiliate_id = a.id
           JOIN orders o ON ar.order_id = o.id
           WHERE ar.id = ?`
        )
        .get(refId);

      res.status(201).json({ success: true, referral });
    } catch (err) {
      console.error("POST /api/affiliates/referrals error:", err);
      res.status(500).json({ error: "Failed to record referral" });
    }
  });

  // GET /api/affiliates/stats
  app.get("/api/affiliates/stats", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const stats = affStore.getDashboardStats(db, bizId(req));
      res.json(stats);
    } catch (err) {
      console.error("GET /api/affiliates/stats error:", err);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  // Payouts
  app.get("/api/affiliates/payouts/summary", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const summary = affStore.getPayoutSummary(db, bizId(req));
      const allPayouts = affStore.getAllPayouts(db, bizId(req));
      res.json({ ...summary, allPayouts });
    } catch (err) {
      console.error("GET /api/affiliates/payouts/summary error:", err);
      res.status(500).json({ error: "Failed to get payout summary" });
    }
  });

  // Challenges
  app.post("/api/affiliates/challenges", requireAuth(db, "affiliates.write"), (req, res) => {
    try {
      const { title, description, targetType, targetValue, rewardType, rewardAmount, startsAt, endsAt } = req.body;
      if (!title || !targetValue || !startsAt || !endsAt) {
        return res.status(400).json({ error: "title, targetValue, startsAt, and endsAt are required" });
      }
      const challengeId = affStore.createChallenge(db, {
        businessId: bizId(req),
        title: title.trim(),
        description: description?.trim() || null,
        targetType: targetType || "referrals",
        targetValue: parseFloat(targetValue),
        rewardType: rewardType || "store_credit",
        rewardAmount: parseFloat(rewardAmount) || 0,
        startsAt,
        endsAt,
      });
      emit("affiliate.challenge_created", { challengeId, businessId: bizId(req), title, targetType, targetValue });
      res.status(201).json({ success: true, challengeId });
    } catch (err) {
      console.error("POST /api/affiliates/challenges error:", err);
      res.status(500).json({ error: "Failed to create challenge" });
    }
  });

  app.get("/api/affiliates/challenges", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const challenges = affStore.listChallenges(db, bizId(req));
      res.json(challenges);
    } catch (err) {
      console.error("GET /api/affiliates/challenges error:", err);
      res.status(500).json({ error: "Failed to list challenges" });
    }
  });

  app.get("/api/affiliates/challenges/:id/leaderboard", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const leaderboard = affStore.getChallengeLeaderboard(db, id);
      res.json(leaderboard);
    } catch (err) {
      console.error("GET /api/affiliates/challenges/:id/leaderboard error:", err);
      res.status(500).json({ error: "Failed to get challenge leaderboard" });
    }
  });

  // Assets
  app.get("/api/affiliates/assets", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const assets = affStore.listAssets(db, bizId(req));
      res.json(assets);
    } catch (err) {
      console.error("GET /api/affiliates/assets error:", err);
      res.status(500).json({ error: "Failed to list assets" });
    }
  });

  app.post("/api/affiliates/assets", requireAuth(db, "affiliates.write"), (req, res) => {
    try {
      const { title, type, url } = req.body;
      if (!title || !url) {
        return res.status(400).json({ error: "title and url are required" });
      }
      const assetId = affStore.createAsset(db, {
        businessId: bizId(req),
        title: title.trim(),
        type: type || "banner",
        url: url.trim(),
      });
      res.status(201).json({ success: true, assetId });
    } catch (err) {
      console.error("POST /api/affiliates/assets error:", err);
      res.status(500).json({ error: "Failed to create asset" });
    }
  });

  app.post("/api/affiliates/assets/:id/download", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      affStore.recordAssetDownload(db, id);
      res.json({ success: true });
    } catch (err) {
      console.error("POST /api/affiliates/assets/:id/download error:", err);
      res.status(500).json({ error: "Failed to record download" });
    }
  });

  // Training
  app.get("/api/affiliates/training", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const modules = affStore.listTrainingModules(db, bizId(req));
      res.json(modules);
    } catch (err) {
      console.error("GET /api/affiliates/training error:", err);
      res.status(500).json({ error: "Failed to list training modules" });
    }
  });

  app.post("/api/affiliates/training", requireAuth(db, "affiliates.write"), (req, res) => {
    try {
      const { title, content, orderIndex } = req.body;
      if (!title || !content) {
        return res.status(400).json({ error: "title and content are required" });
      }
      const moduleId = affStore.createTrainingModule(db, {
        businessId: bizId(req),
        title: title.trim(),
        content,
        orderIndex: orderIndex || 0,
      });
      res.status(201).json({ success: true, moduleId });
    } catch (err) {
      console.error("POST /api/affiliates/training error:", err);
      res.status(500).json({ error: "Failed to create training module" });
    }
  });

  // GET /api/affiliates/:id — Get affiliate detail
  app.get("/api/affiliates/:id", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const affiliate = affStore.getAffiliate(db, id, bizId(req));
      if (!affiliate) {
        return res.status(404).json({ error: "Affiliate not found" });
      }
      res.json(affiliate);
    } catch (err) {
      console.error("GET /api/affiliates/:id error:", err);
      res.status(500).json({ error: "Failed to get affiliate" });
    }
  });

  // PUT /api/affiliates/:id — Update affiliate
  app.put("/api/affiliates/:id", requireAuth(db, "affiliates.write"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = affStore.updateAffiliate(db, id, {
        name: req.body.name,
        email: req.body.email,
        discount_code: req.body.discountCode?.trim()?.toUpperCase(),
        discount_type: req.body.discountType,
        discount_value: req.body.discountValue !== undefined ? parseFloat(req.body.discountValue) : undefined,
        commission_rate: req.body.commissionRate !== undefined ? parseFloat(req.body.commissionRate) : undefined,
        is_active: req.body.isActive !== undefined ? (req.body.isActive ? 1 : 0) : undefined,
        notes: req.body.notes,
      });

      if (!updated) {
        return res.status(404).json({ error: "Affiliate not found or no changes" });
      }

      const affiliate = affStore.getAffiliate(db, id, bizId(req));
      res.json({ success: true, affiliate });
    } catch (err) {
      console.error("PUT /api/affiliates/:id error:", err);
      res.status(500).json({ error: "Failed to update affiliate" });
    }
  });

  // POST /api/affiliates/:id/store-credit
  app.post("/api/affiliates/:id/store-credit", requireAuth(db, "affiliates.write"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { amount } = req.body;
      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "amount must be a positive number" });
      }
      const amt = parseFloat(amount);
      const amountCents = Math.round(amt * 100);

      const affiliate = affStore.getAffiliate(db, id, bizId(req));
      if (!affiliate) {
        return res.status(404).json({ error: "Affiliate not found" });
      }

      affStore.creditWallet(db, {
        affiliateId: id,
        amountCents,
        description: "Manual store credit issued",
      });

      // Legacy compatibility
      affStore.issueStoreCredit(db, {
        affiliateId: id,
        amount: amt,
        businessId: bizId(req),
      });

      const wallet = affStore.getWallet(db, id);
      res.json({ success: true, storeCreditBalance: wallet.balanceDollars });
    } catch (err) {
      console.error("POST /api/affiliates/:id/store-credit error:", err);
      res.status(500).json({ error: "Failed to issue store credit" });
    }
  });

  // POST /api/affiliates/:id/payout
  app.post("/api/affiliates/:id/payout", requireAuth(db, "affiliates.write"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { amount, method, status, notes } = req.body;
      if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: "amount must be a positive number" });
      }
      const affiliate = affStore.getAffiliate(db, id, bizId(req));
      if (!affiliate) {
        return res.status(404).json({ error: "Affiliate not found" });
      }

      const payoutId = affStore.recordPayout(db, {
        affiliateId: id,
        amount: parseFloat(amount),
        method: method || "store_credit",
        status: status || "pending",
        notes: notes || null,
      });

      // Record as wallet transaction if it's a paid payout
      if (status === "paid") {
        const amountCents = Math.round(parseFloat(amount) * 100);
        affStore.redeemWallet(db, {
          affiliateId: id,
          amountCents,
          description: `Payout: ${notes || "Manual payout"}`,
        });
      }

      const updated = affStore.getAffiliate(db, id, bizId(req));
      res.status(201).json({ success: true, payout: { id: payoutId, amount: parseFloat(amount), method, status }, storeCreditBalance: updated.store_credit_balance });
    } catch (err) {
      console.error("POST /api/affiliates/:id/payout error:", err);
      res.status(500).json({ error: "Failed to issue payout" });
    }
  });

  // GET /api/affiliates/:id/payouts
  app.get("/api/affiliates/:id/payouts", requireAuth(db, "affiliates.read"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const history = affStore.getPayoutHistory(db, id);
      res.json(history);
    } catch (err) {
      console.error("GET /api/affiliates/:id/payouts error:", err);
      res.status(500).json({ error: "Failed to get payout history" });
    }
  });

}
