/**
 * ShimmerStock Customer Store Credit API Routes
 * ==============================================
 * Balance tracking, redemption, and lookup for store credit.
 * Mounted in server/index.js
 */

import { requireAuth } from "./auth.js";
import { auditLog, getDeviceInfo } from "./audit.js";
import { emit } from "./events.js";

function bizId(req) {
  return req.businessId || req.user?.business_id || 1;
}

export function mountStoreCreditRoutes(app, db) {

  // ═══════════════════════════════════════════════════════════════════
  // GET /api/customers/credit — list active credits + total balance
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/customers/credit", requireAuth(db, "customers.read"), (req, res) => {
    try {
      const { email } = req.query;

      if (!email) {
        return res.status(400).json({ error: "email query param is required" });
      }

      const credits = db
        .query(
          `SELECT csc.*, o.order_number
           FROM customer_store_credit csc
           LEFT JOIN returns_refunds rr ON csc.return_refund_id = rr.id
           LEFT JOIN orders o ON rr.order_id = o.id
           WHERE csc.customer_email = ? AND csc.business_id = ? AND csc.is_active = 1 AND csc.amount_remaining > 0
           ORDER BY csc.issued_at DESC`
        )
        .all(email.trim().toLowerCase(), bizId(req));

      const totalBalance = credits.reduce((sum, c) => sum + c.amount_remaining, 0);

      // Also get redemption history for this customer
      const redemptions = db
        .query(
          `SELECT cscr.*, csc.store_credit_code, o.order_number
           FROM customer_store_credit_redemptions cscr
           JOIN customer_store_credit csc ON cscr.credit_id = csc.id
           JOIN orders o ON cscr.order_id = o.id
           WHERE csc.customer_email = ? AND csc.business_id = ?
           ORDER BY cscr.created_at DESC`
        )
        .all(email.trim().toLowerCase(), bizId(req));

      res.json({
        credits,
        totalBalance: Math.round(totalBalance * 100) / 100,
        redemptions,
      });
    } catch (err) {
      console.error("GET /api/customers/credit error:", err);
      res.status(500).json({ error: "Failed to fetch store credit" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // POST /api/orders/apply-credit — apply store credit to an order
  // ═══════════════════════════════════════════════════════════════════

  app.post("/api/orders/apply-credit", requireAuth(db, "orders.write"), (req, res) => {
    try {
      const { orderId, creditCode, amount } = req.body;

      if (!orderId) {
        return res.status(400).json({ error: "orderId is required" });
      }

      // Look up the order
      const order = db
        .query("SELECT id, customer_email, total_amount FROM orders WHERE id = ? AND business_id = ?")
        .get(orderId, bizId(req));

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Find the credit — by code if provided, or find first active credit for the customer
      let credit;
      if (creditCode) {
        credit = db
          .query(
            `SELECT * FROM customer_store_credit
             WHERE store_credit_code = ? AND business_id = ? AND is_active = 1 AND amount_remaining > 0`
          )
          .get(creditCode, bizId(req));
      } else if (order.customer_email) {
        // Find all active credits for this customer, use oldest first (FIFO)
        credit = db
          .query(
            `SELECT * FROM customer_store_credit
             WHERE customer_email = ? AND business_id = ? AND is_active = 1 AND amount_remaining > 0
             ORDER BY issued_at ASC LIMIT 1`
          )
          .get(order.customer_email.trim().toLowerCase(), bizId(req));
      }

      if (!credit) {
        return res.status(404).json({
          error: creditCode
            ? "Store credit code not found or has no remaining balance"
            : "No active store credit found for this customer",
        });
      }

      // Validate customer_email matches
      const creditEmail = credit.customer_email.trim().toLowerCase();
      const orderEmail = (order.customer_email || "").trim().toLowerCase();
      if (creditEmail !== orderEmail) {
        return res.status(400).json({
          error: "Store credit does not belong to this order's customer",
        });
      }

      // Determine amount to apply
      const applyAmount = amount
        ? Math.min(parseFloat(amount), credit.amount_remaining)
        : credit.amount_remaining;

      if (applyAmount <= 0) {
        return res.status(400).json({ error: "Amount to apply must be greater than 0" });
      }

      // Deduct from credit
      const newRemaining = Math.round((credit.amount_remaining - applyAmount) * 100) / 100;
      db.run(
        "UPDATE customer_store_credit SET amount_remaining = ?, is_active = ? WHERE id = ?",
        [newRemaining, newRemaining <= 0 ? 0 : 1, credit.id]
      );

      // Record redemption
      const redemptionResult = db.run(
        `INSERT INTO customer_store_credit_redemptions (credit_id, order_id, amount_applied)
         VALUES (?, ?, ?)`,
        [credit.id, orderId, applyAmount]
      );

      // Audit log
      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "store_credit.applied",
        entityType: "customer_store_credit",
        entityId: credit.id,
        newValue: {
          orderId,
          creditCode: credit.store_credit_code,
          amountApplied: applyAmount,
          amountRemaining: newRemaining,
        },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      emit("store_credit.redeemed", {
        creditId: credit.id,
        businessId: bizId(req),
        orderId,
        creditCode: credit.store_credit_code,
        amountApplied: applyAmount,
        newBalance: newRemaining,
      });

      console.log(
        `[store-credit] Applied $${applyAmount.toFixed(2)} from ${credit.store_credit_code} to Order #${orderId}. Remaining: $${newRemaining.toFixed(2)}`
      );

      res.json({
        applied: applyAmount,
        remaining: newRemaining,
        code: credit.store_credit_code,
      });
    } catch (err) {
      console.error("POST /api/orders/apply-credit error:", err);
      res.status(500).json({ error: "Failed to apply store credit" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // GET /api/store-credit/:code — look up a specific credit code
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/store-credit/:code", requireAuth(db, "customers.read"), (req, res) => {
    try {
      const { code } = req.params;

      const credit = db
        .query(
          `SELECT csc.*, o.order_number
           FROM customer_store_credit csc
           LEFT JOIN returns_refunds rr ON csc.return_refund_id = rr.id
           LEFT JOIN orders o ON rr.order_id = o.id
           WHERE csc.store_credit_code = ? AND csc.business_id = ?`
        )
        .get(code, bizId(req));

      if (!credit) {
        return res.status(404).json({ error: "Store credit code not found" });
      }

      const redemptions = db
        .query(
          `SELECT cscr.*, o.order_number
           FROM customer_store_credit_redemptions cscr
           JOIN orders o ON cscr.order_id = o.id
           WHERE cscr.credit_id = ?
           ORDER BY cscr.created_at DESC`
        )
        .all(credit.id);

      res.json({ credit, redemptions });
    } catch (err) {
      console.error("GET /api/store-credit/:code error:", err);
      res.status(500).json({ error: "Failed to look up store credit" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // GET /api/orders/:id/store-credit — applied credit for an order
  // ═══════════════════════════════════════════════════════════════════

  app.get("/api/orders/:id/store-credit", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const orderId = parseInt(req.params.id);

      const redemptions = db
        .query(
          `SELECT cscr.id, cscr.amount_applied, cscr.created_at,
                  csc.store_credit_code, csc.amount_remaining, csc.customer_email
           FROM customer_store_credit_redemptions cscr
           JOIN customer_store_credit csc ON cscr.credit_id = csc.id
           WHERE cscr.order_id = ? AND csc.business_id = ?
           ORDER BY cscr.created_at DESC`
        )
        .all(orderId, bizId(req));

      const totalApplied = redemptions.reduce((sum, r) => sum + r.amount_applied, 0);

      res.json({
        redemptions,
        totalApplied: Math.round(totalApplied * 100) / 100,
      });
    } catch (err) {
      console.error("GET /api/orders/:id/store-credit error:", err);
      res.status(500).json({ error: "Failed to fetch store credit for order" });
    }
  });
}
