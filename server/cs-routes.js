/**
 * ShimmerStock Customer Service API Routes (V3.5)
 * ================================================
 * Mounted in server/index.js
 */

import * as csStore from "./cs-store.js";
import { requireAuth } from "./auth.js";
import { emit } from "./events.js";
import { auditLog, getDeviceInfo } from "./audit.js";

/**
 * Helper: get business ID from req (set by requireAuth middleware).
 */
function bizId(req) {
  return req.businessId || req.user?.business_id || 1;
}

export function mountCsRoutes(app, db) {

  // ═══════════════════════════════════════════════════════════════════
  // RETURNS & REFUNDS
  // ═══════════════════════════════════════════════════════════════════

  // POST /api/cs/returns — Create return/refund/replacement request
  app.post("/api/cs/returns", requireAuth(db, "orders.write"), (req, res) => {
    try {
      const { orderId, orderItemId, type, amount, reason, notes } = req.body;

      if (!orderId || !type) {
        return res.status(400).json({ error: "orderId and type are required" });
      }

      const validTypes = ["refund", "replacement", "store_credit"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `Type must be one of: ${validTypes.join(", ")}` });
      }

      const rrId = csStore.createReturnRefund(db, {
        businessId: bizId(req),
        orderId: parseInt(orderId),
        orderItemId: orderItemId ? parseInt(orderItemId) : null,
        type,
        amount: amount ? parseFloat(amount) : null,
        reason: reason || null,
        notes: notes || null,
      });

      // Update order cs_status
      db.run("UPDATE orders SET cs_status = 'inquiry' WHERE id = ? AND business_id = ? AND cs_status = 'none'",
        [orderId, bizId(req)]);

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "cs.return_created",
        entityType: "returns_refunds",
        entityId: rrId,
        newValue: { orderId, type, amount, reason },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      emit("cs.return_created", {
        returnId: rrId,
        businessId: bizId(req),
        orderId,
        type,
        amount,
      });

      const rr = csStore.getReturnRefund(db, rrId, bizId(req));
      res.status(201).json({ success: true, return: rr });
    } catch (err) {
      console.error("POST /api/cs/returns error:", err);
      res.status(500).json({ error: "Failed to create return/refund" });
    }
  });

  // GET /api/cs/returns — List returns/refunds
  app.get("/api/cs/returns", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const { status, type } = req.query;
      const returns = csStore.getReturnsRefunds(db, bizId(req), { status, type, limit: 100 });
      res.json(returns);
    } catch (err) {
      console.error("GET /api/cs/returns error:", err);
      res.status(500).json({ error: "Failed to list returns/refunds" });
    }
  });

  // PUT /api/cs/returns/:id/approve — Approve
  app.put("/api/cs/returns/:id/approve", requireAuth(db, "orders.write"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = csStore.approveReturnRefund(db, {
        id,
        approvedBy: req.user.id,
        businessId: bizId(req),
      });

      if (!success) {
        return res.status(404).json({ error: "Return/refund not found or not in pending status" });
      }

      // Update order cs_status
      const rr = csStore.getReturnRefund(db, id, bizId(req));
      if (rr) {
        db.run("UPDATE orders SET cs_status = 'dispute' WHERE id = ? AND business_id = ?",
          [rr.order_id, bizId(req)]);
      }

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "cs.return_approved",
        entityType: "returns_refunds",
        entityId: id,
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.json({ success: true, status: "approved" });
    } catch (err) {
      console.error("PUT /api/cs/returns/:id/approve error:", err);
      res.status(500).json({ error: "Failed to approve" });
    }
  });

  // PUT /api/cs/returns/:id/process — Process (execute)
  app.put("/api/cs/returns/:id/process", requireAuth(db, "orders.write"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const rr = csStore.getReturnRefund(db, id, bizId(req));

      if (!rr) {
        return res.status(404).json({ error: "Return/refund not found" });
      }

      if (rr.status !== "approved") {
        return res.status(400).json({ error: "Return/refund must be approved before processing" });
      }

      let replacementOrderData = null;

      // If replacement type, create the replacement order
      if (rr.type === "replacement") {
        const originalItems = db
          .query(
            `SELECT oi.product_id, oi.variant_id, oi.sku, oi.variant_title, oi.quantity, oi.unit_price
             FROM order_items oi WHERE oi.order_id = ?`
          )
          .all(rr.order_id);

        // Get items for this specific item or all items
        const items = rr.order_item_id
          ? originalItems.filter(i => i.product_id === rr.order_item_id || i.variant_id === rr.order_item_id)
          : originalItems;

        if (items.length === 0) {
          // Fallback to all items
          items.push(...originalItems.slice(0, 1));
        }

        const itemList = items.map(i => ({
          productId: i.product_id,
          variantId: i.variant_id,
          sku: i.sku,
          variantTitle: i.variant_title,
          quantity: i.quantity,
          unitPrice: 0, // replacements are free
        }));

        replacementOrderData = csStore.createReplacementOrder(db, {
          originalOrderId: rr.order_id,
          items: itemList,
          businessId: bizId(req),
          userId: req.user.id,
        });

        emit("cs.replacement_created", {
          returnId: id,
          businessId: bizId(req),
          originalOrderId: rr.order_id,
          newOrderId: replacementOrderData.orderId,
          newOrderNumber: replacementOrderData.orderNumber,
        });
      }

      // Process the return/refund
      const success = csStore.processReturnRefund(db, {
        id,
        processedBy: req.user.id,
        businessId: bizId(req),
        replacementOrderId: replacementOrderData?.orderId,
        storeCreditCode: rr.type === "store_credit"
          ? `SC-${Date.now().toString(36).toUpperCase()}`
          : null,
      });

      if (!success) {
        return res.status(400).json({ error: "Failed to process return/refund" });
      }

      // Restock inventory for refunds and store_credit (not replacements — those ship new items)
      let restockedQuantity = 0;
      if (rr.type === "refund" || rr.type === "store_credit") {
        try {
          restockedQuantity = csStore.restockReturnedItems(db, {
            returnId: id,
            orderId: rr.order_id,
            orderItemId: rr.order_item_id,
            businessId: bizId(req),
          });

          emit("inventory.restocked_from_return", {
            returnId: id,
            businessId: bizId(req),
            orderId: rr.order_id,
            restockedQuantity,
          });

          console.log(`[cs] Restocked ${restockedQuantity} units from return #${id}`);
        } catch (restockErr) {
          console.error(`[cs] Restock failed for return #${id}:`, restockErr.message);
          // Don't fail the process request — the return is still processed
        }
      }

      // If store_credit type, create the store credit record
      let storeCreditCreated = null;
      if (rr.type === "store_credit") {
        try {
          const creditCode = `SC-${Date.now().toString(36).toUpperCase()}`;
          const creditAmount = rr.store_credit_amount || rr.amount || 0;

          // Get customer email from the order
          const order = db
            .query("SELECT customer_email FROM orders WHERE id = ?")
            .get(rr.order_id);
          const customerEmail = order?.customer_email || rr.customer_email;

          if (customerEmail && creditAmount > 0) {
            db.run(
              `INSERT INTO customer_store_credit (business_id, customer_email, return_refund_id, store_credit_code, amount_issued, amount_remaining)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [bizId(req), customerEmail, id, creditCode, creditAmount, creditAmount]
            );

            // Also update the returns_refunds record with the credit code
            db.run(
              "UPDATE returns_refunds SET store_credit_code = ?, store_credit_amount = ? WHERE id = ?",
              [creditCode, creditAmount, id]
            );

            storeCreditCreated = { code: creditCode, amount: creditAmount, customerEmail };
            console.log(`[cs] Store credit ${creditCode} (${creditAmount.toFixed(2)}) created for ${customerEmail}`);

            emit("cs.store_credit_created", {
              returnId: id,
              businessId: bizId(req),
              orderId: rr.order_id,
              creditCode,
              amount: creditAmount,
              customerEmail,
            });
          }
        } catch (creditErr) {
          console.error(`[cs] Store credit creation failed for return #${id}:`, creditErr.message);
          // Don't fail the process request — the return is still processed
        }
      }

      // Update order cs_status to resolved
      db.run("UPDATE orders SET cs_status = 'resolved' WHERE id = ? AND business_id = ?",
        [rr.order_id, bizId(req)]);

      // Emit events
      if (rr.type === "refund") {
        emit("cs.refund_processed", {
          returnId: id,
          businessId: bizId(req),
          orderId: rr.order_id,
          amount: rr.amount,
          restockedQuantity,
        });
      }

      emit("cs.customer_satisfaction", {
        returnId: id,
        businessId: bizId(req),
        orderId: rr.order_id,
        type: rr.type,
        resolved: true,
      });

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "cs.return_processed",
        entityType: "returns_refunds",
        entityId: id,
        newValue: { type: rr.type, replacementOrderId: replacementOrderData?.orderId },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.json({
        success: true,
        status: "processed",
        replacement: replacementOrderData,
        storeCredit: storeCreditCreated,
      });
    } catch (err) {
      console.error("PUT /api/cs/returns/:id/process error:", err);
      res.status(500).json({ error: "Failed to process return/refund" });
    }
  });

  // PUT /api/cs/returns/:id/reject — Reject
  app.put("/api/cs/returns/:id/reject", requireAuth(db, "orders.write"), (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { reason } = req.body;

      const success = csStore.rejectReturnRefund(db, {
        id,
        approvedBy: req.user.id,
        businessId: bizId(req),
        reason: reason || null,
      });

      if (!success) {
        return res.status(404).json({ error: "Return/refund not found or not in pending status" });
      }

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "cs.return_rejected",
        entityType: "returns_refunds",
        entityId: id,
        newValue: { reason },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.json({ success: true, status: "rejected" });
    } catch (err) {
      console.error("PUT /api/cs/returns/:id/reject error:", err);
      res.status(500).json({ error: "Failed to reject" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // CUSTOMER NOTES
  // ═══════════════════════════════════════════════════════════════════

  // POST /api/cs/notes — Add customer note
  app.post("/api/cs/notes", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const { customerEmail, orderId, note, noteType } = req.body;

      if (!customerEmail || !note) {
        return res.status(400).json({ error: "customerEmail and note are required" });
      }

      const noteId = csStore.addCustomerNote(db, {
        customerEmail: customerEmail.trim().toLowerCase(),
        orderId: orderId ? parseInt(orderId) : null,
        note: note.trim(),
        noteType: noteType || "general",
        createdBy: req.user.id,
        businessId: bizId(req),
      });

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "cs.note_added",
        entityType: "customer_notes",
        entityId: noteId,
        newValue: { customerEmail: customerEmail.trim().toLowerCase(), noteType: noteType || "general" },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.status(201).json({ success: true, id: noteId });
    } catch (err) {
      console.error("POST /api/cs/notes error:", err);
      res.status(500).json({ error: "Failed to add note" });
    }
  });

  // GET /api/cs/customers/:email/notes — Customer notes
  app.get("/api/cs/customers/:email/notes", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const { email } = req.params;
      const notes = csStore.getCustomerNotes(db, {
        customerEmail: decodeURIComponent(email),
        businessId: bizId(req),
      });
      res.json(notes);
    } catch (err) {
      console.error("GET /api/cs/customers/:email/notes error:", err);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // CUSTOMER HISTORY
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/cs/customers/:email — Customer history
  app.get("/api/cs/customers/:email", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const { email } = req.params;
      const history = csStore.getCustomerHistory(db, decodeURIComponent(email), bizId(req));
      res.json(history);
    } catch (err) {
      console.error("GET /api/cs/customers/:email error:", err);
      res.status(500).json({ error: "Failed to fetch customer history" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // ORDER TIMELINE
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/cs/orders/:id/timeline — Full order timeline
  app.get("/api/cs/orders/:id/timeline", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const timeline = csStore.getOrderTimeline(db, parseInt(req.params.id), bizId(req));

      if (!timeline) {
        return res.status(404).json({ error: "Order not found" });
      }

      res.json(timeline);
    } catch (err) {
      console.error("GET /api/cs/orders/:id/timeline error:", err);
      res.status(500).json({ error: "Failed to fetch order timeline" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // PACKING PROOF
  // ═══════════════════════════════════════════════════════════════════

  // POST /api/cs/orders/:id/packing-proof — Add packing proof
  app.post("/api/cs/orders/:id/packing-proof", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const { proofType, data } = req.body;

      const proofId = csStore.addPackingProof(db, {
        orderId,
        proofType: proofType || "photo",
        data: data || {},
        createdBy: req.user.id,
        businessId: bizId(req),
      });

      auditLog(db, {
        businessId: bizId(req),
        userId: req.user.id,
        actionType: "cs.packing_proof_added",
        entityType: "packing_proof",
        entityId: proofId,
        newValue: { orderId, proofType: proofType || "photo" },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.status(201).json({ success: true, id: proofId });
    } catch (err) {
      console.error("POST /api/cs/orders/:id/packing-proof error:", err);
      res.status(500).json({ error: "Failed to add packing proof" });
    }
  });

  // GET /api/cs/orders/:id/packing-proof — Get packing proof
  app.get("/api/cs/orders/:id/packing-proof", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const proofs = csStore.getPackingProof(db, parseInt(req.params.id), bizId(req));
      res.json(proofs);
    } catch (err) {
      console.error("GET /api/cs/orders/:id/packing-proof error:", err);
      res.status(500).json({ error: "Failed to fetch packing proof" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // AI-ASSISTED RESPONSE DRAFTING (P4.3)
  // ═══════════════════════════════════════════════════════════════════

  // POST /api/cs/draft-response — Draft a CS response in Novi's voice
  app.post("/api/cs/draft-response", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const { customerId, orderId, context } = req.body;

      // Gather customer info
      let customerName = "Valued Customer";
      let customerEmail = customerId || null;
      let orderInfo = null;
      let recentReturns = [];

      if (orderId) {
        const order = db
          .query(
            `SELECT o.id, o.order_number, o.customer_name, o.customer_email, o.source,
                    o.status, o.total_amount, o.created_at
             FROM orders o
             WHERE o.id = ? AND o.business_id = ?`
          )
          .get(orderId, bizId(req));

        if (order) {
          orderInfo = order;
          customerName = order.customer_name;
          customerEmail = order.customer_email;
        }
      }

      if (customerEmail) {
        // Get recent returns for this customer
        recentReturns = db
          .query(
            `SELECT rr.type, rr.status, rr.reason, rr.created_at
             FROM returns_refunds rr
             JOIN orders o ON rr.order_id = o.id
             WHERE o.customer_email = ? AND rr.business_id = ?
             ORDER BY rr.created_at DESC
             LIMIT 5`
          )
          .all(customerEmail, bizId(req));
      }

      // Build the draft response using Novi's voice
      const draft = generateCSDraft({
        customerName,
        customerEmail,
        orderInfo,
        context: context || "general",
        recentReturns,
        businessName: "Glitzy Glitter Express", // Could be from business settings
      });

      res.json({
        success: true,
        draft,
        context: {
          customerName,
          customerEmail,
          orderInfo,
          recentReturnsCount: recentReturns.length,
        },
      });
    } catch (err) {
      console.error("POST /api/cs/draft-response error:", err);
      res.status(500).json({ error: "Failed to draft response" });
    }
  });


  // ═══════════════════════════════════════════════════════════════════
  // CONVERSATIONS — Unified Inbox (V4.0 Phase 1)
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/cs/conversations — list conversations for business
  app.get("/api/cs/conversations", requireAuth(db, "cs.inbox_read"), (req, res) => {
    try {
      const { status, assigned_to, priority, search } = req.query;
      const conditions = ["cc.business_id = ?"];
      const params = [bizId(req)];

      if (status) {
        conditions.push("cc.status = ?");
        params.push(status);
      }
      if (assigned_to === "me") {
        conditions.push("cc.assigned_to = ?");
        params.push(req.user.id);
      } else if (assigned_to === "unassigned") {
        conditions.push("cc.assigned_to IS NULL");
      }
      if (priority) {
        conditions.push("cc.priority = ?");
        params.push(priority);
      }
      if (search) {
        conditions.push("(cc.customer_email LIKE ? OR cc.subject LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
      }

      const where = conditions.join(" AND ");

      const conversations = db
        .query(
          `SELECT cc.*,
                  u.display_name as assignee_name,
                  (SELECT COUNT(*) FROM customer_messages cm
                   WHERE cm.conversation_id = cc.id AND cm.is_read = 0 AND cm.direction = 'inbound') as unread_count,
                  (SELECT cm2.body FROM customer_messages cm2
                   WHERE cm2.conversation_id = cc.id
                   ORDER BY cm2.created_at DESC LIMIT 1) as last_message_preview,
                  (SELECT cm2.created_at FROM customer_messages cm2
                   WHERE cm2.conversation_id = cc.id
                   ORDER BY cm2.created_at DESC LIMIT 1) as last_message_time
           FROM customer_conversations cc
           LEFT JOIN users u ON cc.assigned_to = u.id
           WHERE ${where}
           ORDER BY cc.last_message_at DESC NULLS LAST, cc.created_at DESC
           LIMIT 100`
        )
        .all(...params);

      res.json(conversations);
    } catch (err) {
      console.error("GET /api/cs/conversations error:", err);
      res.status(500).json({ error: "Failed to list conversations" });
    }
  });

  // GET /api/cs/conversations/:id — single conversation with messages
  app.get("/api/cs/conversations/:id", requireAuth(db, "cs.inbox_read"), (req, res) => {
    try {
      const convId = parseInt(req.params.id);
      const conversation = db
        .query(
          `SELECT cc.*, u.display_name as assignee_name
           FROM customer_conversations cc
           LEFT JOIN users u ON cc.assigned_to = u.id
           WHERE cc.id = ? AND cc.business_id = ?`
        )
        .get(convId, bizId(req));

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const messages = db
        .query(
          `SELECT cm.* FROM customer_messages cm
           WHERE cm.conversation_id = ?
           ORDER BY cm.created_at ASC`
        )
        .all(convId);

      // Mark messages as read
      db.run(
        "UPDATE customer_messages SET is_read = 1 WHERE conversation_id = ? AND is_read = 0 AND direction = 'inbound'",
        [convId]
      );

      res.json({ conversation, messages });
    } catch (err) {
      console.error("GET /api/cs/conversations/:id error:", err);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // POST /api/cs/conversations — create new conversation
  app.post("/api/cs/conversations", requireAuth(db, "cs.inbox_write"), (req, res) => {
    try {
      const { customer_email, subject, source, priority, tags } = req.body;

      if (!customer_email) {
        return res.status(400).json({ error: "customer_email is required" });
      }

      const result = db.run(
        `INSERT INTO customer_conversations (business_id, customer_email, subject, source, priority, tags)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          bizId(req),
          customer_email.trim().toLowerCase(),
          subject || null,
          source || "email",
          priority || "normal",
          JSON.stringify(tags || []),
        ]
      );

      emit("cs.conversation_created", {
        conversationId: result.lastInsertRowid,
        businessId: bizId(req),
        customerEmail: customer_email.trim().toLowerCase(),
      });

      res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
      console.error("POST /api/cs/conversations error:", err);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // PUT /api/cs/conversations/:id — update status, priority, assigned_to, tags
  app.put("/api/cs/conversations/:id", requireAuth(db, "cs.inbox_write"), (req, res) => {
    try {
      const convId = parseInt(req.params.id);
      const { status, priority, assigned_to, tags } = req.body;

      const conversation = db
        .query("SELECT * FROM customer_conversations WHERE id = ? AND business_id = ?")
        .get(convId, bizId(req));

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const updates = [];
      const params = [];

      if (status !== undefined) {
        updates.push("status = ?");
        params.push(status);
        if (status === "resolved") {
          updates.push("resolved_at = datetime('now')");
        }
      }
      if (priority !== undefined) {
        updates.push("priority = ?");
        params.push(priority);
      }
      if (assigned_to !== undefined) {
        updates.push("assigned_to = ?");
        params.push(assigned_to === null ? null : parseInt(assigned_to));
      }
      if (tags !== undefined) {
        updates.push("tags = ?");
        params.push(JSON.stringify(tags));
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      params.push(convId, bizId(req));
      db.run(`UPDATE customer_conversations SET ${updates.join(", ")} WHERE id = ? AND business_id = ?`, ...params);

      if (status === "resolved") {
        emit("cs.resolved", {
          conversationId: convId,
          businessId: bizId(req),
          customerEmail: conversation.customer_email,
        });
      }

      res.json({ success: true });
    } catch (err) {
      console.error("PUT /api/cs/conversations/:id error:", err);
      res.status(500).json({ error: "Failed to update conversation" });
    }
  });

  // POST /api/cs/conversations/:id/messages — add a message
  app.post("/api/cs/conversations/:id/messages", requireAuth(db, "cs.inbox_write"), (req, res) => {
    try {
      const convId = parseInt(req.params.id);
      const { body, direction, drafted_by_novi, novi_draft_context, sender_name } = req.body;

      if (!body) {
        return res.status(400).json({ error: "body is required" });
      }

      const directionVal = direction || "outbound";
      const senderType = directionVal === "internal_note" ? "employee" : "employee";

      const result = db.run(
        `INSERT INTO customer_messages (conversation_id, business_id, direction, sender_type, sender_name, body, drafted_by_novi, novi_draft_context)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          convId,
          bizId(req),
          directionVal,
          senderType,
          sender_name || req.user.display_name || "Team Member",
          body,
          drafted_by_novi ? 1 : 0,
          novi_draft_context ? JSON.stringify(novi_draft_context) : null,
        ]
      );

      // Update conversation's last_message_at
      db.run("UPDATE customer_conversations SET last_message_at = datetime('now') WHERE id = ?", [convId]);

      // If outbound, set to waiting_on_customer
      if (directionVal === "outbound") {
        db.run(
          "UPDATE customer_conversations SET status = 'waiting_on_customer' WHERE id = ? AND status = 'open'",
          [convId]
        );
      }

      // Auto-create customer_note for outbound messages
      if (directionVal === "outbound") {
        try {
          const conv = db.query("SELECT customer_email FROM customer_conversations WHERE id = ?").get(convId);
          if (conv) {
            db.run(
              `INSERT INTO customer_notes (business_id, customer_email, note, note_type, created_by)
               VALUES (?, ?, ?, ?, ?)`,
              [bizId(req), conv.customer_email, body.substring(0, 500), "email_response", req.user.id]
            );
          }
        } catch (noteErr) {
          console.error("Failed to auto-create customer_note:", noteErr.message);
        }
      }

      emit("cs.message_added", {
        conversationId: convId,
        messageId: result.lastInsertRowid,
        businessId: bizId(req),
        direction: directionVal,
      });

      res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
      console.error("POST /api/cs/conversations/:id/messages error:", err);
      res.status(500).json({ error: "Failed to add message" });
    }
  });

  // POST /api/cs/conversations/:id/novi-draft — generate Novi draft reply
  app.post("/api/cs/conversations/:id/novi-draft", requireAuth(db, "cs.inbox_read"), (req, res) => {
    try {
      const convId = parseInt(req.params.id);
      const conversation = db
        .query("SELECT * FROM customer_conversations WHERE id = ? AND business_id = ?")
        .get(convId, bizId(req));

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const recentMessages = db
        .query(
          `SELECT body, direction, sender_type FROM customer_messages
           WHERE conversation_id = ?
           ORDER BY created_at DESC LIMIT 5`
        )
        .all(convId);

      // Build a simple context-based draft using Novi's voice patterns
      const customerName = conversation.customer_email.split("@")[0].replace(/[._]/g, " ");
      const hasComplaint = recentMessages.some(m =>
        m.body.toLowerCase().includes("refund") || m.body.toLowerCase().includes("return") ||
        m.body.toLowerCase().includes("broken") || m.body.toLowerCase().includes("wrong") ||
        m.body.toLowerCase().includes("damaged") || m.body.toLowerCase().includes("bad")
      );
      const hasQuestion = recentMessages.some(m =>
        m.body.includes("?") || m.body.toLowerCase().includes("how") || m.body.toLowerCase().includes("when")
      );

      let draft, suggestedAction, confidence;

      if (hasComplaint) {
        draft = `Hi ${customerName},

Thank you so much for reaching out — I'm really sorry to hear about the issue you've experienced. That's not the kind of experience we want anyone to have, and I want to make this right for you.

I'm looking into this right now. Could you let me know if you'd prefer a replacement or a refund? Either way, I'll get it sorted for you quickly.

You're important to us, and I appreciate your patience while I get this resolved.

Warmly,
The ShimmerStock Team`;
        suggestedAction = "offer_replacement_or_refund";
        confidence = 0.87;
      } else if (hasQuestion) {
        draft = `Hi ${customerName},

Great question! Let me look into that for you right now.

I'll get back to you shortly with a clear answer. Thanks for your patience — we're on it!

Warmly,
The ShimmerStock Team`;
        suggestedAction = "research_and_reply";
        confidence = 0.82;
      } else {
        draft = `Hi ${customerName},

Thank you for reaching out! I've received your message and am reviewing it now.

I'll follow up with you shortly. In the meantime, if you have any additional details to share, feel free to reply here.

Warmly,
The ShimmerStock Team`;
        suggestedAction = "acknowledge_and_follow_up";
        confidence = 0.78;
      }

      res.json({
        draft,
        confidence,
        suggested_action: suggestedAction,
      });
    } catch (err) {
      console.error("POST /api/cs/conversations/:id/novi-draft error:", err);
      res.status(500).json({ error: "Failed to generate draft" });
    }
  });

  // GET /api/cs/inbox-stats — quick counts
  app.get("/api/cs/inbox-stats", requireAuth(db, "cs.inbox_read"), (req, res) => {
    try {
      const bid = bizId(req);
      const open = db.query("SELECT COUNT(*) as count FROM customer_conversations WHERE business_id = ? AND status = 'open'").get(bid).count;
      const waiting_on_customer = db.query("SELECT COUNT(*) as count FROM customer_conversations WHERE business_id = ? AND status = 'waiting_on_customer'").get(bid).count;
      const waiting_on_team = db.query("SELECT COUNT(*) as count FROM customer_conversations WHERE business_id = ? AND status = 'open'").get(bid).count;
      const high_priority = db.query("SELECT COUNT(*) as count FROM customer_conversations WHERE business_id = ? AND priority IN ('high', 'urgent') AND status != 'resolved'").get(bid).count;
      const unassigned = db.query("SELECT COUNT(*) as count FROM customer_conversations WHERE business_id = ? AND assigned_to IS NULL AND status != 'resolved'").get(bid).count;

      res.json({
        open,
        waiting_on_customer,
        waiting_on_team,
        high_priority,
        unassigned,
      });
    } catch (err) {
      console.error("GET /api/cs/inbox-stats error:", err);
      res.status(500).json({ error: "Failed to get inbox stats" });
    }
  });

  // GET /api/cs/unread-count — unread message count for badge
  app.get("/api/cs/unread-count", requireAuth(db, "cs.inbox_read"), (req, res) => {
    try {
      const result = db
        .query(
          `SELECT COUNT(*) as total FROM customer_messages cm
           JOIN customer_conversations cc ON cm.conversation_id = cc.id
           WHERE cc.business_id = ? AND cm.is_read = 0 AND cm.direction = 'inbound'`
        )
        .get(bizId(req));

      res.json({ total: result.total });
    } catch (err) {
      console.error("GET /api/cs/unread-count error:", err);
      res.status(500).json({ error: "Failed to get unread count" });
    }
  });
}

// ── Novi CS Response Drafting ────────────────────────────────────────

function generateCSDraft({ customerName, customerEmail, orderInfo, context, recentReturns, businessName }) {
  const brand = businessName || "our store";

  // Templates per context type
  const templates = {
    refund: {
      subject: `Refund confirmation for Order #${orderInfo?.order_number || "your recent order"}`,
      body: `Hi ${customerName},

Thank you so much for reaching out to us — I'm sorry to hear that your order didn't meet expectations. That's not the experience we want for anyone shopping with ${brand}, and I want to make this right for you.

I've gone ahead and processed your refund${orderInfo ? ` for Order #${orderInfo.order_number}` : ""}.${orderInfo?.total_amount ? ` You should see ${orderInfo.total_amount.toFixed(2)} back on your payment method within 3–5 business days.` : " The amount should appear on your statement within 3–5 business days."}

If there's anything else I can do for you, please don't hesitate to reply — I'm here to help.

Warmly,
${brand} Team`,
    },

    replacement: {
      subject: `Replacement order for Order #${orderInfo?.order_number || "your recent order"}`,
      body: `Hi ${customerName},

Thank you for letting us know about the issue with your order — I really appreciate you giving us the chance to make things right.

I've set up a replacement${orderInfo ? ` for Order #${orderInfo.order_number}` : ""}, and it'll be heading your way shortly. You'll receive a separate confirmation with tracking details as soon as it ships.

We take quality seriously, so I've also shared your feedback with our team to help prevent this from happening again.

Thanks for your patience, and please reach out anytime.

Warmly,
${brand} Team`,
    },

    complaint: {
      subject: `Regarding your recent experience with ${brand}`,
      body: `Hi ${customerName},

I wanted to personally follow up on the concern you shared with us. First, I'm truly sorry — that's absolutely not the standard we hold ourselves to, and I want you to know that your feedback matters deeply to us.

I'm looking into what happened and will work with our team to make sure we address this properly. In the meantime, I want to make sure we take care of you — please let me know what resolution would feel fair and helpful.

You can reply directly to this message, and I'll personally see it through.

With gratitude,
${brand} Team`,
    },

    general: {
      subject: `A note from ${brand}`,
      body: `Hi ${customerName},

Thank you for being a valued customer of ${brand}!${orderInfo ? ` I'm following up regarding Order #${orderInfo.order_number}.` : ""}

We truly appreciate your business and are committed to making sure you have a great experience. If you have any questions or if there's anything we can help with, simply reply to this message — we're here for you.

Have a wonderful day!

Warmly,
${brand} Team`,
    },

    follow_up: {
      subject: `Checking in — ${brand}`,
      body: `Hi ${customerName},

Just wanted to check in and make sure everything's going well with your recent order${orderInfo ? ` (Order #${orderInfo.order_number})` : ""}. 

We want you to be completely happy with your purchase. If anything isn't right or if you have questions, please let me know — I'm here to help.

Thanks for choosing ${brand}!

Warmly,
${brand} Team`,
    },
  };

  // Pick template
  let tmpl;
  if (context === "return_request" || context === "refund") {
    tmpl = templates.refund;
  } else if (context === "replacement") {
    tmpl = templates.replacement;
  } else if (context === "complaint") {
    tmpl = templates.complaint;
  } else if (context === "follow_up" || context === "question") {
    tmpl = templates.follow_up;
  } else {
    tmpl = templates.general;
  }

  return {
    subject: tmpl.subject,
    body: tmpl.body,
  };
}
