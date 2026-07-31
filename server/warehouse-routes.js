/**
 * Warehouse Engine Routes
 * =======================
 * Bins, receiving, moving, picking, cycle counting, shipping.
 */

import { requireAuth } from "./auth.js";
import { auditLog, getDeviceInfo } from "./audit.js";
import { emit } from "./events.js";
import * as wh from "./warehouse-store.js";

export function mountWarehouseRoutes(app, db) {

  // ── Bins ──────────────────────────────────────────────────────────

  // GET /api/warehouse/bins — List all bins
  app.get("/api/warehouse/bins", requireAuth(db, "inventory.read"), (req, res) => {
    try {
      const bins = wh.listBins(db, req.businessId);
      res.json(bins);
    } catch (err) {
      console.error("GET /api/warehouse/bins error:", err);
      res.status(500).json({ error: "Failed to fetch bins" });
    }
  });

  // POST /api/warehouse/bins — Create bin
  app.post("/api/warehouse/bins", requireAuth(db, "inventory.write"), (req, res) => {
    try {
      const { name, zone } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Bin name is required" });
      }
      const binId = wh.createBin(db, { businessId: req.businessId, name: name.trim(), zone: zone || null });

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "warehouse.bin_created",
        entityType: "warehouse_bin",
        entityId: binId,
        newValue: { name: name.trim(), zone },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.status(201).json({ id: binId, name: name.trim(), zone: zone || null });
    } catch (err) {
      if (err.message && err.message.includes("UNIQUE")) {
        return res.status(409).json({ error: "A bin with that name already exists" });
      }
      console.error("POST /api/warehouse/bins error:", err);
      res.status(500).json({ error: "Failed to create bin" });
    }
  });

  // GET /api/warehouse/bins/:id — Bin contents
  app.get("/api/warehouse/bins/:id", requireAuth(db, "inventory.read"), (req, res) => {
    try {
      const bin = wh.getBin(db, parseInt(req.params.id), req.businessId);
      if (!bin) return res.status(404).json({ error: "Bin not found" });
      const contents = wh.getBinContents(db, parseInt(req.params.id), req.businessId);
      res.json({ ...bin, contents });
    } catch (err) {
      console.error("GET /api/warehouse/bins/:id error:", err);
      res.status(500).json({ error: "Failed to fetch bin" });
    }
  });

  // ── Receive ───────────────────────────────────────────────────────

  // POST /api/warehouse/receive — Receive items into bin
  app.post("/api/warehouse/receive", requireAuth(db, "inventory.write"), (req, res) => {
    try {
      const { binId, productId, variantId, quantity, referenceType, referenceId, notes } = req.body;

      if (!binId || !productId || !quantity) {
        return res.status(400).json({ error: "binId, productId, and quantity are required" });
      }

      const result = wh.receiveIntoBin(db, {
        binId: parseInt(binId),
        productId: parseInt(productId),
        variantId: variantId ? parseInt(variantId) : null,
        quantity: parseFloat(quantity),
        referenceType: referenceType || null,
        referenceId: referenceId ? parseInt(referenceId) : null,
        notes: notes || null,
        businessId: req.businessId,
        userId: req.user.id,
      });

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "warehouse.items_received",
        entityType: "bin_content",
        entityId: binId,
        newValue: { productId, quantity, referenceType, referenceId },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      emit("warehouse.items_received", {
        businessId: req.businessId,
        binId: parseInt(binId),
        productId: parseInt(productId),
        quantity: parseFloat(quantity),
      });

      res.json({ success: true, ...result });
    } catch (err) {
      console.error("POST /api/warehouse/receive error:", err);
      res.status(500).json({ error: err.message || "Failed to receive items" });
    }
  });

  // ── Move ──────────────────────────────────────────────────────────

  // POST /api/warehouse/move — Move between bins
  app.post("/api/warehouse/move", requireAuth(db, "inventory.write"), (req, res) => {
    try {
      const { fromBinId, toBinId, productId, variantId, quantity, notes } = req.body;

      if (!fromBinId || !toBinId || !productId || !quantity) {
        return res.status(400).json({ error: "fromBinId, toBinId, productId, and quantity are required" });
      }

      const result = wh.moveBetweenBins(db, {
        fromBinId: parseInt(fromBinId),
        toBinId: parseInt(toBinId),
        productId: parseInt(productId),
        variantId: variantId ? parseInt(variantId) : null,
        quantity: parseFloat(quantity),
        notes: notes || null,
        businessId: req.businessId,
        userId: req.user.id,
      });

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "warehouse.items_moved",
        entityType: "bin_content",
        entityId: productId,
        previousValue: { fromBinId },
        newValue: { toBinId, quantity },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.json({ success: true, ...result });
    } catch (err) {
      console.error("POST /api/warehouse/move error:", err);
      res.status(400).json({ error: err.message || "Failed to move items" });
    }
  });

  // ── Pick ──────────────────────────────────────────────────────────

  // POST /api/warehouse/pick — Pick for order
  app.post("/api/warehouse/pick", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const { orderId, binId, productId, variantId, quantity, orderItemId } = req.body;

      if (!orderId || !binId || !productId || !quantity) {
        return res.status(400).json({ error: "orderId, binId, productId, and quantity are required" });
      }

      const result = wh.pickForOrder(db, {
        orderId: parseInt(orderId),
        binId: parseInt(binId),
        productId: parseInt(productId),
        variantId: variantId ? parseInt(variantId) : null,
        quantity: parseFloat(quantity),
        orderItemId: orderItemId ? parseInt(orderItemId) : null,
        businessId: req.businessId,
        userId: req.user.id,
      });

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "warehouse.items_picked",
        entityType: "order",
        entityId: parseInt(orderId),
        newValue: { productId, binId, quantity },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      emit("warehouse.items_picked", {
        businessId: req.businessId,
        orderId: parseInt(orderId),
        productId: parseInt(productId),
        quantity: parseFloat(quantity),
      });

      res.json({ success: true, ...result });
    } catch (err) {
      console.error("POST /api/warehouse/pick error:", err);
      res.status(400).json({ error: err.message || "Failed to pick items" });
    }
  });

  // ── Cycle Count ───────────────────────────────────────────────────

  // POST /api/warehouse/cycle-count — Cycle count adjustment
  app.post("/api/warehouse/cycle-count", requireAuth(db, "inventory.write"), (req, res) => {
    try {
      const { binId, productId, variantId, actualQuantity } = req.body;

      if (!binId || !productId || actualQuantity === undefined) {
        return res.status(400).json({ error: "binId, productId, and actualQuantity are required" });
      }

      const result = wh.cycleCount(db, {
        binId: parseInt(binId),
        productId: parseInt(productId),
        variantId: variantId ? parseInt(variantId) : null,
        actualQuantity: parseFloat(actualQuantity),
        businessId: req.businessId,
        userId: req.user.id,
      });

      if (result.adjusted) {
        auditLog(db, {
          businessId: req.businessId,
          userId: req.user.id,
          actionType: "warehouse.cycle_count",
          entityType: "bin_content",
          entityId: parseInt(binId),
          previousValue: { quantity: result.previousQty },
          newValue: { quantity: result.actualQuantity, difference: result.difference },
          source: "manual",
          deviceInfo: getDeviceInfo(req),
        });
      }

      res.json(result);
    } catch (err) {
      console.error("POST /api/warehouse/cycle-count error:", err);
      res.status(500).json({ error: err.message || "Failed to perform cycle count" });
    }
  });

  // ── Pick List ─────────────────────────────────────────────────────

  // GET /api/warehouse/pick-list/:orderId — Pick list for an order
  app.get("/api/warehouse/pick-list/:orderId", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const pickList = wh.getPickList(db, parseInt(req.params.orderId), req.businessId);
      res.json(pickList);
    } catch (err) {
      console.error("GET /api/warehouse/pick-list/:orderId error:", err);
      res.status(500).json({ error: "Failed to get pick list" });
    }
  });

  // ── Ship ──────────────────────────────────────────────────────────

  // POST /api/warehouse/ship/:orderId — Ship order
  app.post("/api/warehouse/ship/:orderId", requireAuth(db, "orders.fulfill"), (req, res) => {
    try {
      const orderId = parseInt(req.params.orderId);

      const result = wh.shipOrder(db, {
        orderId,
        businessId: req.businessId,
        userId: req.user.id,
      });

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "warehouse.order_shipped",
        entityType: "order",
        entityId: orderId,
        newValue: { status: "shipped" },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      emit("warehouse.order_shipped", {
        businessId: req.businessId,
        orderId,
      });

      res.json(result);
    } catch (err) {
      console.error("POST /api/warehouse/ship/:orderId error:", err);
      res.status(400).json({ error: err.message || "Failed to ship order" });
    }
  });

  // ── Stock Summary ─────────────────────────────────────────────────

  // GET /api/warehouse/stock-summary — Bin stock overview
  app.get("/api/warehouse/stock-summary", requireAuth(db, "inventory.read"), (req, res) => {
    try {
      const summary = wh.getBinStockSummary(db, req.businessId);
      res.json(summary);
    } catch (err) {
      console.error("GET /api/warehouse/stock-summary error:", err);
      res.status(500).json({ error: "Failed to get stock summary" });
    }
  });

  // ── Transfers ─────────────────────────────────────────────────────

  // GET /api/warehouse/transfers — Transfer history with filters
  app.get("/api/warehouse/transfers", requireAuth(db, "inventory.read"), (req, res) => {
    try {
      const filters = {};
      if (req.query.type) filters.type = req.query.type;
      if (req.query.productId) filters.productId = parseInt(req.query.productId);
      if (req.query.limit) filters.limit = parseInt(req.query.limit);

      const transfers = wh.getTransfers(db, req.businessId, filters);
      res.json(transfers);
    } catch (err) {
      console.error("GET /api/warehouse/transfers error:", err);
      res.status(500).json({ error: "Failed to fetch transfers" });
    }
  });

  console.log("Warehouse routes mounted");
}
