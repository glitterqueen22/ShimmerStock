/**
 * Fulfillment HQ Routes
 * =====================
 * "How do I get products to customers quickly, accurately, and cost-effectively?"
 */

import { requireAuth } from "./auth.js";
import { auditLog, getDeviceInfo } from "./audit.js";
import { emit } from "./events.js";
import * as store from "./store.js";

export function mountFulfillmentRoutes(app, db) {

  // ═══════════════════════════════════════════════════════════════════
  // Packing Recipes (Fulfillment 1.2)
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/fulfillment/packing-recipes — list all (optional ?product_id, ?order_type filters)
  app.get("/api/fulfillment/packing-recipes", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const productId = req.query.product_id ? parseInt(req.query.product_id, 10) : undefined;
      const orderType = req.query.order_type || undefined;
      const recipes = store.getPackingRecipes(db, req.businessId, { productId, orderType });
      res.json(recipes);
    } catch (err) {
      console.error("GET /api/fulfillment/packing-recipes error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/fulfillment/packing-recipes — create
  app.post("/api/fulfillment/packing-recipes", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const { name, productId, orderType, boxSize, packingMaterials, inserts, labels, specialInstructions, priority, isActive } = req.body;
      if (!name) return res.status(400).json({ error: "name is required" });
      const id = store.createPackingRecipe(db, {
        businessId: req.businessId, name,
        productId: productId ?? null,
        orderType: orderType || 'any',
        boxSize: boxSize || null,
        packingMaterials: packingMaterials || [],
        inserts: inserts || [],
        labels: labels || null,
        specialInstructions: specialInstructions || null,
        priority: priority ?? 1,
        isActive: isActive !== false,
      });
      res.status(201).json({ id, message: "Packing recipe created" });
    } catch (err) {
      console.error("POST /api/fulfillment/packing-recipes error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/fulfillment/packing-recipes/:id — update
  app.put("/api/fulfillment/packing-recipes/:id", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const existing = store.getPackingRecipeById(db, id, req.businessId);
      if (!existing) return res.status(404).json({ error: "Packing recipe not found" });
      store.updatePackingRecipe(db, id, req.businessId, req.body);
      res.json({ message: "Packing recipe updated" });
    } catch (err) {
      console.error("PUT /api/fulfillment/packing-recipes/:id error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/fulfillment/packing-recipes/:id — delete
  app.delete("/api/fulfillment/packing-recipes/:id", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const deleted = store.deletePackingRecipe(db, id, req.businessId);
      if (!deleted) return res.status(404).json({ error: "Packing recipe not found" });
      res.json({ message: "Packing recipe deleted" });
    } catch (err) {
      console.error("DELETE /api/fulfillment/packing-recipes/:id error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/fulfillment/packing-recipes/for-order/:orderId — get matching recipes for an order
  app.get("/api/fulfillment/packing-recipes/for-order/:orderId", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const orderId = parseInt(req.params.orderId, 10);
      const recipes = store.getPackingRecipeForOrder(db, orderId, req.businessId);
      res.json(recipes);
    } catch (err) {
      console.error("GET /api/fulfillment/packing-recipes/for-order/:orderId error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // Template Designer Routes
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/fulfillment/templates — list all templates
  app.get("/api/fulfillment/templates", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const typeFilter = req.query.type || null;
      const templates = store.getFulfillmentTemplates(db, req.businessId, typeFilter);
      const parsed = templates.map(t => ({
        ...t,
        config: JSON.parse(t.config || '{}'),
      }));
      res.json(parsed);
    } catch (err) {
      console.error("GET /api/fulfillment/templates error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/fulfillment/templates
  app.post("/api/fulfillment/templates", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const { type, name, config, isDefault } = req.body;
      if (!type || !name) return res.status(400).json({ error: "type and name are required" });
      const id = store.createFulfillmentTemplate(db, { businessId: req.businessId, type, name, config, isDefault: !!isDefault });
      res.status(201).json({ id, message: "Template created" });
    } catch (err) {
      console.error("POST /api/fulfillment/templates error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/fulfillment/templates/:id
  app.put("/api/fulfillment/templates/:id", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const existing = store.getFulfillmentTemplateById(db, id, req.businessId);
      if (!existing) return res.status(404).json({ error: "Template not found" });
      store.updateFulfillmentTemplate(db, id, req.businessId, req.body);
      res.json({ message: "Template updated" });
    } catch (err) {
      console.error("PUT /api/fulfillment/templates/:id error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/fulfillment/templates/:id
  app.delete("/api/fulfillment/templates/:id", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      store.deleteFulfillmentTemplate(db, id, req.businessId);
      res.json({ message: "Template deleted" });
    } catch (err) {
      console.error("DELETE /api/fulfillment/templates/:id error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/fulfillment/templates/:id/duplicate
  app.post("/api/fulfillment/templates/:id/duplicate", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const newId = store.duplicateFulfillmentTemplate(db, id, req.businessId);
      if (!newId) return res.status(404).json({ error: "Template not found" });
      res.status(201).json({ id: newId, message: "Template duplicated" });
    } catch (err) {
      console.error("POST /api/fulfillment/templates/:id/duplicate error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/fulfillment/templates/:id/render
  app.get("/api/fulfillment/templates/:id/render", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const template = store.getFulfillmentTemplateById(db, id, req.businessId);
      if (!template) return res.status(404).json({ error: "Template not found" });
      const config = JSON.parse(template.config || '{}');
      const orderId = req.query.orderId ? parseInt(req.query.orderId, 10) : null;
      let orderData = null;
      if (orderId) {
        const order = store.getOrderById(db, orderId, req.businessId);
        if (order) {
          const items = store.getOrderItemsForPackaging(db, orderId);
          orderData = { ...order, items };
        }
      }
      res.json({ template: { id: template.id, type: template.type, name: template.name, config }, order: orderData });
    } catch (err) {
      console.error("GET /api/fulfillment/templates/:id/render error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // Unboxing Engine Routes
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/fulfillment/unboxing-rules
  app.get("/api/fulfillment/unboxing-rules", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const rules = store.getUnboxingRules(db, req.businessId);
      res.json(rules.map(r => ({ ...r, action_config: JSON.parse(r.action_config || '{}') })));
    } catch (err) {
      console.error("GET /api/fulfillment/unboxing-rules error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/fulfillment/unboxing-rules
  app.post("/api/fulfillment/unboxing-rules", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const { name, conditionType, conditionValue, actionType, actionConfig, isActive, priority } = req.body;
      if (!name || !conditionType || !conditionValue || !actionType) {
        return res.status(400).json({ error: "name, conditionType, conditionValue, actionType are required" });
      }
      const id = store.createUnboxingRule(db, { businessId: req.businessId, name, conditionType, conditionValue, actionType, actionConfig, isActive, priority });
      res.status(201).json({ id, message: "Unboxing rule created" });
    } catch (err) {
      console.error("POST /api/fulfillment/unboxing-rules error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/fulfillment/unboxing-rules/:id
  app.put("/api/fulfillment/unboxing-rules/:id", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const existing = store.getUnboxingRuleById(db, id, req.businessId);
      if (!existing) return res.status(404).json({ error: "Unboxing rule not found" });
      store.updateUnboxingRule(db, id, req.businessId, req.body);
      res.json({ message: "Unboxing rule updated" });
    } catch (err) {
      console.error("PUT /api/fulfillment/unboxing-rules/:id error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/fulfillment/unboxing-rules/:id
  app.delete("/api/fulfillment/unboxing-rules/:id", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      store.deleteUnboxingRule(db, id, req.businessId);
      res.json({ message: "Unboxing rule deleted" });
    } catch (err) {
      console.error("DELETE /api/fulfillment/unboxing-rules/:id error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/fulfillment/unboxing-suggestions/:orderId
  app.get("/api/fulfillment/unboxing-suggestions/:orderId", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const orderId = parseInt(req.params.orderId, 10);
      const suggestions = store.getUnboxingSuggestions(db, orderId, req.businessId);
      res.json(suggestions);
    } catch (err) {
      console.error("GET /api/fulfillment/unboxing-suggestions/:orderId error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/fulfillment/pending — Orders ready to ship ──────────────
  app.get("/api/fulfillment/pending", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const orders = store.getPendingOrders(db, req.businessId);
      res.json(orders);
    } catch (err) {
      console.error("GET /api/fulfillment/pending error:", err);
      res.status(500).json({ error: "Failed to fetch pending orders" });
    }
  });

  // ── GET /api/fulfillment/in-transit — Active shipments ──────────────
  app.get("/api/fulfillment/in-transit", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const shipments = store.getActiveShipments(db, req.businessId);
      res.json(shipments);
    } catch (err) {
      console.error("GET /api/fulfillment/in-transit error:", err);
      res.status(500).json({ error: "Failed to fetch active shipments" });
    }
  });

  // ── POST /api/fulfillment/ship — Mark order as shipped ──────────────
  app.post("/api/fulfillment/ship", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const { orderId, carrier, trackingNumber, packageType, weightOz, cost } = req.body;
      if (!orderId || !carrier) {
        return res.status(400).json({ error: "orderId and carrier are required" });
      }

      // Verify all order items have been picked (scanned_quantity >= quantity)
      const remaining = db.query(
        "SELECT COUNT(*) as remaining FROM order_items WHERE order_id = ? AND scanned_quantity < quantity"
      ).get(orderId);
      if (remaining && remaining.remaining > 0) {
        return res.status(400).json({
          error: `Cannot ship: ${remaining.remaining} items still need to be picked`,
          remainingItems: remaining.remaining,
        });
      }

      const shipmentId = store.createShipment(db, {
        orderId,
        carrier,
        trackingNumber,
        packageType,
        weightOz,
        cost,
        businessId: req.businessId,
      });

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "fulfillment.ship",
        entityType: "fulfillment_shipment",
        entityId: shipmentId,
        newValue: { orderId, carrier, trackingNumber },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      emit("fulfillment.shipment_created", {
        shipmentId,
        orderId,
        carrier,
        businessId: req.businessId,
      });

      res.status(201).json({ id: shipmentId, message: "Order shipped" });
    } catch (err) {
      console.error("POST /api/fulfillment/ship error:", err);
      res.status(500).json({ error: "Failed to create shipment" });
    }
  });

  // ── GET /api/fulfillment/packaging/:orderId — Packaging suggestions ─
  app.get("/api/fulfillment/packaging/:orderId", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const orderId = parseInt(req.params.orderId, 10);
      const order = store.getOrderById(db, orderId, req.businessId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      const items = store.getOrderItemsForPackaging(db, orderId);

      // Simple box size suggestion based on total weight
      let totalWeight = 0;
      let totalVolume = 0;
      for (const item of items) {
        totalWeight += (item.weight_oz || 4) * item.quantity;
        totalVolume += (item.weight_oz || 4) * item.quantity * 1.3; // rough volume estimate
      }

      let boxSuggestion = "Small Box (8x6x4\")";
      if (totalWeight > 32) boxSuggestion = "Large Box (18x12x12\")";
      else if (totalWeight > 16) boxSuggestion = "Medium Box (14x10x8\")";

      const packagingInstructions = [];
      for (const item of items) {
        if (item.weight_oz && item.weight_oz < 2) {
          packagingInstructions.push(`${item.product_name || item.sku}: bubble wrap recommended (fragile/light)`);
        }
      }

      // Check previous verifications
      const verifications = store.getPackVerifications(db, orderId);

      res.json({
        orderId,
        orderNumber: order.order_number,
        customerName: order.customer_name,
        items,
        boxSuggestion,
        totalWeightOz: Math.round(totalWeight * 100) / 100,
        estimatedVolume: Math.round(totalVolume * 100) / 100,
        packagingInstructions,
        verifications,
      });
    } catch (err) {
      console.error("GET /api/fulfillment/packaging/:orderId error:", err);
      res.status(500).json({ error: "Failed to fetch packaging info" });
    }
  });

  // ── GET /api/fulfillment/combine — Suggest order combinations ───────
  app.get("/api/fulfillment/combine", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const candidates = store.getCombinedOrderCandidates(db, req.businessId);
      // For each candidate, calculate estimated savings
      const results = candidates.map(c => {
        const orderIds = c.order_ids.split(",").map(Number);
        // Estimate: individual shipping ~$7 each, combined ~$10
        const individualCost = c.order_count * 7;
        const combinedCost = 10 + (c.order_count - 1) * 3;
        const savings = individualCost - combinedCost;
        return {
          address: c.shipping_address,
          customerName: c.customer_name,
          orderIds,
          orderNumbers: c.order_numbers.split(",").map(Number),
          orderCount: c.order_count,
          combinedTotal: c.combined_total,
          estimatedIndividualShipping: individualCost,
          estimatedCombinedShipping: combinedCost,
          estimatedSavings: Math.max(0, savings),
          savingsPercent: individualCost > 0 ? Math.round((savings / individualCost) * 100) : 0,
        };
      });

      res.json(results);
    } catch (err) {
      console.error("GET /api/fulfillment/combine error:", err);
      res.status(500).json({ error: "Failed to fetch combination suggestions" });
    }
  });

  // ── GET /api/fulfillment/combine-suggestions — Novi-detected same-customer orders ──
  app.get("/api/fulfillment/combine-suggestions", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const suggestions = store.getCombineSuggestionsByEmail(db, req.businessId);
      res.json({ suggestions });
    } catch (err) {
      console.error("GET /api/fulfillment/combine-suggestions error:", err);
      res.status(500).json({ error: "Failed to fetch combine suggestions" });
    }
  });

  // ── POST /api/fulfillment/combine-shipments — Combine orders ──────────
  app.post("/api/fulfillment/combine-shipments", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const { orderIds, savingsEstimate } = req.body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length < 2) {
        return res.status(400).json({ error: "orderIds array with at least 2 IDs is required" });
      }

      const result = store.combineOrders(db, req.businessId, req.user.id, orderIds, savingsEstimate);

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "order.combined_shipments",
        entityType: "combined_shipments",
        entityId: result.combinedShipmentId,
        newValue: { targetOrderId: result.targetOrderId, sourceOrderIds: result.sourceOrderIds, savings: savingsEstimate },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      emit("order.combined_shipments", {
        combinedShipmentId: result.combinedShipmentId,
        targetOrderId: result.targetOrderId,
        sourceOrderIds: result.sourceOrderIds,
        savings: savingsEstimate,
        businessId: req.businessId,
      });

      res.status(201).json({
        success: true,
        targetOrderId: result.targetOrderId,
        combinedItemCount: result.combinedItemCount,
        savingsEstimate: result.savingsEstimate,
        message: `Combined ${result.sourceOrderIds.length} orders into #${result.targetOrderNumber}`,
      });
    } catch (err) {
      console.error("POST /api/fulfillment/combine-shipments error:", err);
      const status = err.statusCode || 500;
      res.status(status).json({ error: err.message });
    }
  });


  // ── GET /api/fulfillment/analytics — Fulfillment KPIs ───────────────
  app.get("/api/fulfillment/analytics", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const analytics = store.getFulfillmentAnalytics(db, req.businessId);
      res.json(analytics);
    } catch (err) {
      console.error("GET /api/fulfillment/analytics error:", err);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // ── POST /api/fulfillment/pack-verify — Log pack verification ───────
  app.post("/api/fulfillment/pack-verify", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const { orderId, photoUrl, itemsChecked, notes } = req.body;
      if (!orderId) {
        return res.status(400).json({ error: "orderId is required" });
      }
      const id = store.createPackVerification(db, {
        orderId,
        photoUrl,
        verifiedBy: req.user.id,
        itemsChecked,
        notes,
        businessId: req.businessId,
      });

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "fulfillment.pack_verify",
        entityType: "fulfillment_pack_verification",
        entityId: id,
        newValue: { orderId, itemsChecked },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.status(201).json({ id, message: "Pack verification logged" });
    } catch (err) {
      console.error("POST /api/fulfillment/pack-verify error:", err);
      res.status(500).json({ error: "Failed to log verification" });
    }
  });

  // ── GET /api/fulfillment/summary — Novi-friendly summary ────────────
  app.get("/api/fulfillment/summary", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const pending = store.getPendingOrders(db, req.businessId);
      const active = store.getActiveShipments(db, req.businessId);
      const combined = store.getCombinedOrderCandidates(db, req.businessId);
      const analytics = store.getFulfillmentAnalytics(db, req.businessId);

      let oldestPending = null;
      if (pending.length > 0) {
        oldestPending = pending[0];
        const ageMs = Date.now() - new Date(oldestPending.created_at + "Z").getTime();
        oldestPending.ageDays = Math.round(ageMs / (1000 * 60 * 60 * 24));
      }

      const totalSavings = combined.reduce((acc, c) => {
        const orderCount = c.order_ids.split(",").length;
        return acc + Math.max(0, (orderCount * 7) - (10 + (orderCount - 1) * 3));
      }, 0);

      res.json({
        pendingCount: pending.length,
        activeShipments: active.length,
        oldestPending,
        combinationOpportunities: combined.length,
        potentialSavings: totalSavings,
        analytics: {
          avgDaysToShip: analytics.avgDaysToShip,
          onTimeRate: analytics.onTimeRate,
          avgCost: analytics.avgCost,
        },
      });
    } catch (err) {
      console.error("GET /api/fulfillment/summary error:", err);
      res.status(500).json({ error: "Failed to fetch summary" });
    }
  });

  // ── GET /api/fulfillment/shipments/:id/print — Print label/slip data ─
  app.get("/api/fulfillment/shipments/:id/print", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const shipmentId = parseInt(req.params.id, 10);
      const printType = req.query.type || "shipping_label";

      // Get shipment
      const shipment = db.query(
        "SELECT * FROM fulfillment_shipments WHERE id = ? AND business_id = ?"
      ).get(shipmentId, req.businessId);
      if (!shipment) return res.status(404).json({ error: "Shipment not found" });

      // Get full order with items
      const order = store.getOrderByIdFull(db, shipment.order_id, req.businessId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      // Get business name for "From" address
      const biz = store.getBusinessName(db, req.businessId);

      // Get matching template for this type
      const templates = store.getFulfillmentTemplates(db, req.businessId, printType);
      let templateConfig = null;
      if (templates.length > 0) {
        const def = templates.find(t => t.is_default === 1) || templates[0];
        templateConfig = JSON.parse(def.config || '{}');
      }

      res.json({
        shipment: {
          id: shipment.id,
          carrier: shipment.carrier,
          trackingNumber: shipment.tracking_number,
          status: shipment.status,
          shippedAt: shipment.shipped_at,
          estimatedDelivery: shipment.estimated_delivery,
        },
        order: {
          id: order.id,
          orderNumber: order.order_number,
          customerName: order.customer_name,
          customerEmail: order.customer_email,
          shippingAddress: order.shipping_address,
          totalAmount: order.total_amount,
          createdAt: order.created_at,
          items: (order.items || []).map(item => ({
            id: item.id,
            sku: item.sku,
            productName: item.product_name,
            variantTitle: item.variant_title,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            lineTotal: item.line_total,
          })),
        },
        fromAddress: {
          businessName: biz?.name || "Your Business",
          addressLine1: "",
        },
        template: templateConfig,
        printType,
      });
    } catch (err) {
      console.error("GET /api/fulfillment/shipments/:id/print error:", err);
      res.status(500).json({ error: "Failed to fetch print data" });
    }
  });

  // ── POST /api/fulfillment/bulk-ship — Ship multiple orders at once ──
  app.post("/api/fulfillment/bulk-ship", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const { orderIds, carrier, trackingNumbers } = req.body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: "orderIds array is required" });
      }
      if (!carrier) {
        return res.status(400).json({ error: "carrier is required" });
      }

      const results = [];
      for (let i = 0; i < orderIds.length; i++) {
        const trackingNumber = trackingNumbers?.[i] || null;
        const shipmentId = store.createShipment(db, {
          orderId: orderIds[i],
          carrier,
          trackingNumber,
          businessId: req.businessId,
        });
        results.push({ orderId: orderIds[i], shipmentId, trackingNumber });

        auditLog(db, {
          businessId: req.businessId,
          userId: req.user.id,
          actionType: "fulfillment.bulk_ship",
          entityType: "fulfillment_shipment",
          entityId: shipmentId,
          newValue: { orderId: orderIds[i], carrier, trackingNumber },
          source: "manual",
          deviceInfo: getDeviceInfo(req),
        });
      }

      res.status(201).json({ shipments: results, message: `${results.length} orders shipped` });
    } catch (err) {
      console.error("POST /api/fulfillment/bulk-ship error:", err);
      res.status(500).json({ error: "Failed to bulk ship" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // Split Shipment Routes
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/fulfillment/orders/:id/split-suggestion — Novi proactive check
  app.get("/api/fulfillment/orders/:id/split-suggestion", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);
      const suggestion = store.getSplitSuggestion(db, orderId);
      res.json(suggestion);
    } catch (err) {
      console.error("GET /api/fulfillment/orders/:id/split-suggestion error:", err);
      res.status(500).json({ error: "Failed to get split suggestion" });
    }
  });

  // GET /api/fulfillment/orders/:id/shipments — get all shipments for an order
  app.get("/api/fulfillment/orders/:id/shipments", requireAuth(db, "orders.read"), (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);
      const shipments = store.getOrderShipments(db, orderId);
      res.json(shipments);
    } catch (err) {
      console.error("GET /api/fulfillment/orders/:id/shipments error:", err);
      res.status(500).json({ error: "Failed to get order shipments" });
    }
  });

  // POST /api/fulfillment/split-shipment — create split shipments
  app.post("/api/fulfillment/split-shipment", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const { orderId, shipments, handleRemaining } = req.body;

      if (!orderId) return res.status(400).json({ error: "orderId is required" });
      if (!shipments || !Array.isArray(shipments) || shipments.length === 0) {
        return res.status(400).json({ error: "shipments array is required" });
      }

      const order = store.getOrderById(db, orderId, req.businessId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      // Get existing shipment count to number properly
      const existingCount = db.query(
        "SELECT MAX(shipment_number) as maxNum FROM order_shipments WHERE order_id = ?"
      ).get(orderId);
      let nextShipNum = (existingCount?.maxNum || 0);

      const createdShipments = [];

      store.transaction(db, () => {
        for (const shipment of shipments) {
          nextShipNum++;
          const shipmentId = store.createOrderShipment(db, {
            orderId,
            shipmentNumber: nextShipNum,
            status: 'picking',
          });

          for (const item of (shipment.items || [])) {
            store.addShipmentItem(db, {
              shipmentId,
              orderItemId: item.orderItemId,
              quantity: item.quantity,
            });
          }

          createdShipments.push(shipmentId);
        }

        // Handle remaining items
        if (handleRemaining === 'refund') {
          // Find remaining item values and create returns_refunds
          const allShipmentItemIds = new Set();
          for (const s of shipments) {
            for (const item of (s.items || [])) {
              allShipmentItemIds.add(item.orderItemId);
            }
          }
          const orderItems = store.getOrderItemsByOrderId(db, orderId);
          for (const oi of orderItems) {
            if (!allShipmentItemIds.has(oi.id)) {
              const refundAmount = (oi.unit_price || 0) * oi.quantity;
              db.run(
                `INSERT INTO returns_refunds (business_id, order_id, order_item_id, type, status, amount, reason, notes)
                 VALUES (?, ?, ?, 'refund', 'pending', ?, 'Split shipment — item unavailable', ?)`,
                [req.businessId, orderId, oi.id, refundAmount, null]
              );
            }
          }
        } else if (handleRemaining === 'store_credit') {
          const allShipmentItemIds = new Set();
          for (const s of shipments) {
            for (const item of (s.items || [])) {
              allShipmentItemIds.add(item.orderItemId);
            }
          }
          const orderItems = store.getOrderItemsByOrderId(db, orderId);
          const customerEmail = order.customer_email || '';
          for (const oi of orderItems) {
            if (!allShipmentItemIds.has(oi.id)) {
              const creditAmount = (oi.unit_price || 0) * oi.quantity;
              const creditCode = 'SC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
              const rrResult = db.run(
                `INSERT INTO returns_refunds (business_id, order_id, order_item_id, type, status, amount, reason, store_credit_code, notes)
                 VALUES (?, ?, ?, 'store_credit', 'approved', ?, 'Split shipment — item unavailable', ?, ?)`,
                [req.businessId, orderId, oi.id, creditAmount, creditCode, null]
              );
              const rrId = rrResult.lastInsertRowid;
              if (customerEmail) {
                db.run(
                  `INSERT INTO customer_store_credit (business_id, customer_email, return_refund_id, store_credit_code, amount_issued, amount_remaining, is_active)
                   VALUES (?, ?, ?, ?, ?, ?, 1)`,
                  [req.businessId, customerEmail.trim().toLowerCase(), rrId, creditCode, creditAmount, creditAmount]
                );
              }
            }
          }
        }

        // Update order status
        const totalPending = db.query(
          "SELECT COUNT(*) as cnt FROM order_shipments WHERE order_id = ? AND status = 'picking'"
        ).get(orderId);
        if (totalPending && totalPending.cnt === createdShipments.length && createdShipments.length > 0) {
          db.run("UPDATE orders SET status = 'partial' WHERE id = ?", [orderId]);
        }
      });

      emit("order.split_shipment", {
        orderId,
        shipmentIds: createdShipments,
        handleRemaining,
        businessId: req.businessId,
      });

      // Return full shipment data
      const result = store.getOrderShipments(db, orderId);
      res.status(201).json({ shipments: result, message: `${createdShipments.length} shipment(s) created` });
    } catch (err) {
      console.error("POST /api/fulfillment/split-shipment error:", err);
      res.status(500).json({ error: "Failed to create split shipment" });
    }
  });

  // POST /api/fulfillment/shipments/:id/ship — ship a specific order_shipment
  app.post("/api/fulfillment/shipments/:id/ship", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const shipmentId = parseInt(req.params.id, 10);
      const { carrier, trackingNumber } = req.body;

      if (!carrier) return res.status(400).json({ error: "carrier is required" });

      const shipment = store.getOrderShipmentById(db, shipmentId);
      if (!shipment) return res.status(404).json({ error: "Shipment not found" });

      const fsId = store.shipOrderShipment(db, {
        shipmentId,
        carrier,
        trackingNumber: trackingNumber || null,
        orderId: shipment.order_id,
        businessId: req.businessId,
      });

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "fulfillment.ship_split_shipment",
        entityType: "order_shipment",
        entityId: shipmentId,
        newValue: { carrier, trackingNumber, fulfillmentShipmentId: fsId },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      emit("fulfillment.split_shipment_shipped", {
        shipmentId,
        orderId: shipment.order_id,
        carrier,
        businessId: req.businessId,
      });

      res.json({ id: fsId, shipmentId, message: "Shipment shipped" });
    } catch (err) {
      console.error("POST /api/fulfillment/shipments/:id/ship error:", err);
      res.status(500).json({ error: "Failed to ship" });
    }
  });

// ═══════════════════════════════════════════════════════════════════════
// Operations Center Routes (V2)
// ═══════════════════════════════════════════════════════════════════════

// GET /api/fulfillment/orders/:id/operations — list available operations for an order
app.get("/api/fulfillment/orders/:id/operations", requireAuth(db, "orders.read"), (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const operations = store.getOrderOperations(db, orderId, req.businessId);
    if (!operations) return res.status(404).json({ error: "Order not found" });
    res.json(operations);
  } catch (err) {
    console.error("GET /api/fulfillment/orders/:id/operations error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fulfillment/orders/:id/items — get items for an order
app.get("/api/fulfillment/orders/:id/items", requireAuth(db, "orders.read"), (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const items = store.getOrderItemsByOrderId(db, orderId);
    res.json(items);
  } catch (err) {
    console.error("GET /api/fulfillment/orders/:id/items error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fulfillment/orders/:id/hold — place order on hold
app.post("/api/fulfillment/orders/:id/hold", requireAuth(db, "orders.fulfill"), (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { reason } = req.body;
    const result = store.holdOrder(db, orderId, req.businessId, reason || null, req.user?.id);
    if (!result.success) return res.status(400).json({ error: result.error });

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "operations.hold",
      entityType: "order",
      entityId: orderId,
      newValue: { status: 'held', reason, previousStatus: result.previousStatus },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    emit("operations.order_held", { orderId, reason, previousStatus: result.previousStatus, businessId: req.businessId });
    res.json({ message: "Order placed on hold", previousStatus: result.previousStatus });
  } catch (err) {
    console.error("POST /api/fulfillment/orders/:id/hold error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fulfillment/orders/:id/release-hold — release a held order
app.post("/api/fulfillment/orders/:id/release-hold", requireAuth(db, "orders.fulfill"), (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const result = store.releaseHold(db, orderId, req.businessId, req.user?.id);
    if (!result.success) return res.status(400).json({ error: result.error });

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "operations.release_hold",
      entityType: "order",
      entityId: orderId,
      newValue: { status: result.restoredStatus },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    emit("operations.order_released", { orderId, restoredStatus: result.restoredStatus, businessId: req.businessId });
    res.json({ message: "Hold released", restoredStatus: result.restoredStatus });
  } catch (err) {
    console.error("POST /api/fulfillment/orders/:id/release-hold error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fulfillment/orders/:id/cancel-item — cancel a specific order item
app.post("/api/fulfillment/orders/:id/cancel-item", requireAuth(db, "orders.fulfill"), (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { orderItemId, reason, action } = req.body;
    if (!orderItemId) return res.status(400).json({ error: "orderItemId is required" });

    const result = store.cancelOrderItem(db, orderId, orderItemId, req.businessId, reason || null, action || 'no_action');
    if (!result.success) return res.status(400).json({ error: result.error });

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "operations.cancel_item",
      entityType: "order_item",
      entityId: orderItemId,
      newValue: { reason, refundAction: action, itemTotal: result.itemTotal },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    emit("operations.item_cancelled", { orderId, orderItemId, refundAction: action, itemTotal: result.itemTotal, businessId: req.businessId });
    res.json({ message: "Item cancelled", refundId: result.refundId, creditId: result.creditId, itemTotal: result.itemTotal });
  } catch (err) {
    console.error("POST /api/fulfillment/orders/:id/cancel-item error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fulfillment/orders/:id/backorder-item — mark item as backordered
app.post("/api/fulfillment/orders/:id/backorder-item", requireAuth(db, "orders.fulfill"), (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { orderItemId } = req.body;
    if (!orderItemId) return res.status(400).json({ error: "orderItemId is required" });

    const result = store.backorderOrderItem(db, orderId, orderItemId, req.businessId);
    if (!result.success) return res.status(400).json({ error: result.error });

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "operations.backorder_item",
      entityType: "order_item",
      entityId: orderItemId,
      newValue: { status: 'backordered' },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    emit("operations.item_backordered", { orderId, orderItemId, businessId: req.businessId });
    res.json({ message: "Item marked as backordered" });
  } catch (err) {
    console.error("POST /api/fulfillment/orders/:id/backorder-item error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fulfillment/orders/:id/substitute-item — substitute an item
app.post("/api/fulfillment/orders/:id/substitute-item", requireAuth(db, "orders.fulfill"), (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { orderItemId, replacementProductId, replacementVariantId, reason } = req.body;
    if (!orderItemId) return res.status(400).json({ error: "orderItemId is required" });
    if (!replacementProductId) return res.status(400).json({ error: "replacementProductId is required" });

    const result = store.substituteOrderItem(db, orderId, orderItemId, replacementProductId, replacementVariantId || null, req.businessId);
    if (!result.success) return res.status(400).json({ error: result.error });

    auditLog(db, {
      businessId: req.businessId,
      userId: req.user.id,
      actionType: "operations.substitute_item",
      entityType: "order_item",
      entityId: orderItemId,
      newValue: { replacementProductId, replacementVariantId: replacementVariantId || null, newItemId: result.newItemId, priceDiff: result.priceDiff, reason },
      source: "manual",
      deviceInfo: getDeviceInfo(req),
    });

    emit("operations.item_substituted", { orderId, orderItemId, replacementProductId, newItemId: result.newItemId, priceDiff: result.priceDiff, businessId: req.businessId });
    res.json({ message: "Item substituted", newItemId: result.newItemId, priceDiff: result.priceDiff });
  } catch (err) {
    console.error("POST /api/fulfillment/orders/:id/substitute-item error:", err);
    res.status(500).json({ error: err.message });
  }
});

}
