/**
 * Purchasing Intelligence Engine — API Routes
 * ============================================
 * Attached to the Express app from index.js.
 * All routes are scoped under /api/purchasing
 */

import * as store from "./store.js";
import { emit } from "./events.js";
import { auditLog, getDeviceInfo } from "./audit.js";
import { requireAuth } from "./auth.js";

export function mountPurchasingRoutes(app, db) {
  // ── Suppliers ──────────────────────────────────────────────────────────

  // GET /api/purchasing/suppliers — list all suppliers
  app.get("/api/purchasing/suppliers", requireAuth(db, "purchasing.read"), (req, res) => {
    try {
      const suppliers = store.listSuppliers(db, req.businessId);
      res.json(suppliers);
    } catch (err) {
      console.error("GET /api/purchasing/suppliers error:", err);
      res.status(500).json({ error: "Failed to fetch suppliers" });
    }
  });

  // POST /api/purchasing/suppliers — create a supplier
  app.post("/api/purchasing/suppliers", requireAuth(db, "purchasing.write"), (req, res) => {
    try {
      const { name, contactName, email, phone, website, notes } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Supplier name is required" });
      }

      const id = store.createSupplier(db, {
        businessId: req.businessId,
        name: name.trim(),
        contactName: contactName?.trim() || null,
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        website: website?.trim() || null,
        notes: notes?.trim() || null,
      });

      emit("purchasing.supplier_added", { supplierId: id, businessId: req.businessId, name: name.trim() });

      res.status(201).json({ id });
    } catch (err) {
      console.error("POST /api/purchasing/suppliers error:", err);
      res.status(500).json({ error: "Failed to create supplier" });
    }
  });

  // GET /api/purchasing/suppliers/:id — get a single supplier with products + performance
  app.get("/api/purchasing/suppliers/:id", requireAuth(db, "purchasing.read"), (req, res) => {
    try {
      const perf = store.getSupplierPerformance(db, req.params.id, req.businessId);
      if (!perf) {
        return res.status(404).json({ error: "Supplier not found" });
      }
      res.json(perf);
    } catch (err) {
      console.error("GET /api/purchasing/suppliers/:id error:", err);
      res.status(500).json({ error: "Failed to fetch supplier" });
    }
  });

  // PUT /api/purchasing/suppliers/:id — update a supplier
  app.put("/api/purchasing/suppliers/:id", requireAuth(db, "purchasing.write"), (req, res) => {
    try {
      const changes = store.updateSupplier(db, req.params.id, req.businessId, req.body);
      if (changes === 0) {
        return res.status(404).json({ error: "Supplier not found or no changes" });
      }
      res.json({ changes });
    } catch (err) {
      console.error("PUT /api/purchasing/suppliers/:id error:", err);
      res.status(500).json({ error: "Failed to update supplier" });
    }
  });

  // DELETE /api/purchasing/suppliers/:id — delete a supplier
  app.delete("/api/purchasing/suppliers/:id", requireAuth(db, "purchasing.write"), (req, res) => {
    try {
      const supplier = store.deleteSupplier(db, req.params.id, req.businessId);
      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }
      res.json({ deleted: supplier });
    } catch (err) {
      console.error("DELETE /api/purchasing/suppliers/:id error:", err);
      res.status(500).json({ error: "Failed to delete supplier" });
    }
  });

  // ── Supplier Products ──────────────────────────────────────────────────

  // POST /api/purchasing/suppliers/:id/products — link a product to a supplier
  app.post("/api/purchasing/suppliers/:id/products", requireAuth(db, "purchasing.write"), (req, res) => {
    try {
      const supplierId = req.params.id;
      const supplier = store.getSupplier(db, supplierId, req.businessId);
      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }

      const { productId, supplierSku, unitCost, unitType, minOrderQty, quotedLeadTimeDays, isPreferred } = req.body;
      if (!productId) {
        return res.status(400).json({ error: "productId is required" });
      }

      const product = store.getProductById(db, productId, req.businessId);
      if (!product) {
        return res.status(400).json({ error: "Product not found" });
      }

      const id = store.linkSupplierProduct(db, {
        supplierId: Number(supplierId),
        productId,
        supplierSku: supplierSku?.trim() || null,
        unitCost: unitCost != null ? unitCost : null,
        unitType: unitType || "unit",
        minOrderQty: minOrderQty || 1,
        quotedLeadTimeDays: quotedLeadTimeDays != null ? quotedLeadTimeDays : null,
        isPreferred: isPreferred ? 1 : 0,
      });

      if (isPreferred) {
        store.setPreferredSupplier(db, Number(supplierId), productId);
      }

      res.status(201).json({ id });
    } catch (err) {
      console.error("POST /api/purchasing/suppliers/:id/products error:", err);
      res.status(500).json({ error: "Failed to link product" });
    }
  });

  // GET /api/purchasing/suppliers/:id/products — get products linked to a supplier
  app.get("/api/purchasing/suppliers/:id/products", requireAuth(db, "purchasing.read"), (req, res) => {
    try {
      const products = store.getSupplierProducts(db, req.params.id);
      res.json(products);
    } catch (err) {
      console.error("GET /api/purchasing/suppliers/:id/products error:", err);
      res.status(500).json({ error: "Failed to fetch supplier products" });
    }
  });

  // ── Inventory Thresholds ───────────────────────────────────────────────

  // GET /api/purchasing/thresholds — list all thresholds
  app.get("/api/purchasing/thresholds", requireAuth(db, "purchasing.read"), (req, res) => {
    try {
      const thresholds = store.listThresholds(db, req.businessId);
      res.json(thresholds);
    } catch (err) {
      console.error("GET /api/purchasing/thresholds error:", err);
      res.status(500).json({ error: "Failed to fetch thresholds" });
    }
  });

  // POST /api/purchasing/thresholds — create or update a threshold
  app.post("/api/purchasing/thresholds", requireAuth(db, "purchasing.write"), (req, res) => {
    try {
      const { productId, reorderPoint, reorderQuantity, unitType } = req.body;
      if (!productId || reorderPoint == null || reorderQuantity == null) {
        return res.status(400).json({ error: "productId, reorderPoint, and reorderQuantity are required" });
      }

      const product = store.getProductById(db, productId, req.businessId);
      if (!product) {
        return res.status(400).json({ error: "Product not found" });
      }

      const id = store.upsertThreshold(db, {
        businessId: req.businessId,
        productId,
        reorderPoint,
        reorderQuantity,
        unitType: unitType || "unit",
      });

      res.status(201).json({ id });
    } catch (err) {
      console.error("POST /api/purchasing/thresholds error:", err);
      res.status(500).json({ error: "Failed to set threshold" });
    }
  });

  // PUT /api/purchasing/thresholds/:productId — update a threshold
  app.put("/api/purchasing/thresholds/:productId", requireAuth(db, "purchasing.write"), (req, res) => {
    try {
      const { reorderPoint, reorderQuantity, unitType } = req.body;
      if (reorderPoint == null && reorderQuantity == null) {
        return res.status(400).json({ error: "reorderPoint or reorderQuantity is required" });
      }

      const existing = store.getThreshold(db, req.businessId, req.params.productId);
      if (!existing) {
        return res.status(404).json({ error: "Threshold not found for this product" });
      }

      const id = store.upsertThreshold(db, {
        businessId: req.businessId,
        productId: Number(req.params.productId),
        reorderPoint: reorderPoint != null ? reorderPoint : existing.reorder_point,
        reorderQuantity: reorderQuantity != null ? reorderQuantity : existing.reorder_quantity,
        unitType: unitType || existing.unit_type,
      });

      res.json({ id });
    } catch (err) {
      console.error("PUT /api/purchasing/thresholds/:productId error:", err);
      res.status(500).json({ error: "Failed to update threshold" });
    }
  });

  // ── Purchase Orders ────────────────────────────────────────────────────

  // GET /api/purchasing/orders — list all POs
  app.get("/api/purchasing/orders", requireAuth(db, "purchasing.read"), (req, res) => {
    try {
      const orders = store.listPOs(db, req.businessId);
      res.json(orders);
    } catch (err) {
      console.error("GET /api/purchasing/orders error:", err);
      res.status(500).json({ error: "Failed to fetch purchase orders" });
    }
  });

  // POST /api/purchasing/orders — create a PO
  app.post("/api/purchasing/orders", requireAuth(db, "purchasing.write"), (req, res) => {
    try {
      const { supplierId, notes, expectedDelivery, items } = req.body;
      if (!supplierId) {
        return res.status(400).json({ error: "supplierId is required" });
      }

      const supplier = store.getSupplier(db, supplierId, req.businessId);
      if (!supplier) {
        return res.status(400).json({ error: "Supplier not found" });
      }

      const result = store.transaction(db, () => {
        const poId = store.createPO(db, {
          businessId: req.businessId,
          supplierId,
          notes: notes?.trim() || null,
          expectedDelivery: expectedDelivery || null,
          createdBy: req.user.id,
        });

        if (items && Array.isArray(items)) {
          for (const item of items) {
            if (!item.productId || !item.quantity) continue;
            store.addPOItem(db, {
              poId,
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost != null ? item.unitCost : null,
              totalCost: item.unitCost != null && item.quantity ? item.unitCost * item.quantity : null,
            });
          }
        }

        return poId;
      });

      emit("purchasing.po_created", { poId: result, businessId: req.businessId, supplierId });

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "purchasing.po_created",
        entityType: "purchase_order",
        entityId: result,
        newValue: { supplierId, itemCount: items?.length || 0 },
        source: "manual",
      });

      res.status(201).json({ id: result });
    } catch (err) {
      console.error("POST /api/purchasing/orders error:", err);
      res.status(500).json({ error: "Failed to create purchase order" });
    }
  });

  // GET /api/purchasing/orders/:id — get a single PO with items
  app.get("/api/purchasing/orders/:id", requireAuth(db, "purchasing.read"), (req, res) => {
    try {
      const po = store.getPO(db, req.params.id, req.businessId);
      if (!po) {
        return res.status(404).json({ error: "Purchase order not found" });
      }
      const items = store.getPOItems(db, req.params.id);
      res.json({ ...po, items });
    } catch (err) {
      console.error("GET /api/purchasing/orders/:id error:", err);
      res.status(500).json({ error: "Failed to fetch purchase order" });
    }
  });

  // POST /api/purchasing/orders/:id/order — mark PO as ordered
  app.post("/api/purchasing/orders/:id/order", requireAuth(db, "purchasing.write"), (req, res) => {
    try {
      const po = store.getPO(db, req.params.id, req.businessId);
      if (!po) {
        return res.status(404).json({ error: "Purchase order not found" });
      }
      if (po.status !== "draft") {
        return res.status(400).json({ error: `Cannot order PO in '${po.status}' status` });
      }
      store.updatePOStatus(db, req.params.id, "ordered", {
        expectedDelivery: req.body.expectedDelivery,
      });

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "purchasing.po_ordered",
        entityType: "purchase_order",
        entityId: Number(req.params.id),
        newValue: { supplierId: po.supplier_id },
        source: "manual",
      });

      res.json({ status: "ordered" });
    } catch (err) {
      console.error("POST /api/purchasing/orders/:id/order error:", err);
      res.status(500).json({ error: "Failed to mark PO as ordered" });
    }
  });

  // POST /api/purchasing/orders/:id/receive — receive inventory against a PO
  app.post("/api/purchasing/orders/:id/receive", requireAuth(db, "purchasing.write"), (req, res) => {
    try {
      const result = store.receivePO(db, Number(req.params.id), req.businessId, req.user.id);

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "purchasing.po_received",
        entityType: "purchase_order",
        entityId: result.poId,
        newValue: {
          supplierId: result.supplierId,
          received: result.received.map(r => `${r.productName}: ${r.quantity}`),
        },
        source: "manual",
      });

      for (const r of result.received) {
        auditLog(db, {
          businessId: req.businessId,
          userId: req.user.id,
          actionType: "purchasing.inventory_received",
          entityType: "inventory",
          entityId: r.productId,
          newValue: { product: r.productName, sku: r.sku, quantity: r.quantity, cost: r.unitCost },
          source: "purchasing",
          reason: `PO #${result.poId}`,
        });
      }

      emit("purchasing.po_received", { poId: result.poId, businessId: req.businessId, ...result });

      res.json(result);
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("POST /api/purchasing/orders/:id/receive error:", err);
      res.status(500).json({ error: "Failed to receive PO" });
    }
  });

  // ── Intelligence Endpoints ─────────────────────────────────────────────

  // GET /api/purchasing/recommendations — explainable reorder suggestions
  app.get("/api/purchasing/recommendations", requireAuth(db, "purchasing.read"), (req, res) => {
    try {
      const recommendations = store.getReorderRecommendations(db, req.businessId);
      res.json(recommendations);
    } catch (err) {
      console.error("GET /api/purchasing/recommendations error:", err);
      res.status(500).json({ error: "Failed to fetch recommendations" });
    }
  });

  // GET /api/purchasing/summary — AI-consumable purchasing summary
  app.get("/api/purchasing/summary", requireAuth(db, "purchasing.read"), (req, res) => {
    try {
      const summary = store.getPurchasingSummary(db, req.businessId);
      res.json(summary);
    } catch (err) {
      console.error("GET /api/purchasing/summary error:", err);
      res.status(500).json({ error: "Failed to fetch purchasing summary" });
    }
  });
// ── V3.2: Purchase Order Receiving Routes ────────────────────────────────
// Append these to the mountPurchasingRoutes function (before the closing brace)

  // POST /api/purchasing/receive/:poId — Receive items with line-item granularity
  app.post("/api/purchasing/receive/:poId", requireAuth(db, "purchasing.write"), (req, res) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items array is required" });
      }

      const result = store.receivePO_v32(db, {
        poId: Number(req.params.poId),
        businessId: req.businessId,
        items,
        receivedBy: req.user.id,
      });

      // Emit event for each product received
      for (const r of result.received) {
        if (r.quantityReceived > 0) {
          emit("purchasing.items_received", {
            poId: result.poId,
            productId: r.productId,
            productName: r.productName,
            quantity: r.quantityReceived,
            binLocation: r.binLocation,
            businessId: req.businessId,
          });
        }
      }

      // Audit log
      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "purchasing.items_received",
        entityType: "purchase_order",
        entityId: result.poId,
        newValue: { status: result.status, items: result.received },
        source: "manual",
      });
      for (const r of result.received) {
        auditLog(db, {
          businessId: req.businessId,
          userId: req.user.id,
          actionType: "purchasing.inventory_received",
          entityType: "inventory",
          entityId: r.productId,
          newValue: { product: r.productName, sku: r.sku, qtyReceived: r.quantityReceived, qtyDamaged: r.quantityDamaged, qtyBackordered: r.quantityBackordered },
          source: "purchasing",
          reason: `PO #${result.poId}`,
        });
      }

      res.json(result);
    } catch (err) {
      if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
      console.error("POST /api/purchasing/receive/:poId error:", err);
      res.status(500).json({ error: "Failed to receive PO items" });
    }
  });

  // GET /api/purchasing/receive/:poId/history — Receiving history for a PO
  app.get("/api/purchasing/receive/:poId/history", requireAuth(db, "purchasing.read"), (req, res) => {
    try {
      const history = store.listReceivingEvents(db, Number(req.params.poId), req.businessId);
      res.json(history);
    } catch (err) {
      console.error("GET /api/purchasing/receive/:poId/history error:", err);
      res.status(500).json({ error: "Failed to fetch receiving history" });
    }
  });

  // PUT /api/purchasing/po/:poId — Update PO fields
  app.put("/api/purchasing/po/:poId", requireAuth(db, "purchasing.write"), (req, res) => {
    try {
      const changes = store.updatePO(db, Number(req.params.poId), req.businessId, req.body);
      if (changes === 0) {
        return res.status(404).json({ error: "PO not found or no changes" });
      }
      res.json({ changes });
    } catch (err) {
      console.error("PUT /api/purchasing/po/:poId error:", err);
      res.status(500).json({ error: "Failed to update PO" });
    }
  });

  // POST /api/purchasing/suppliers/:supplierId/notes — Add supplier note
  app.post("/api/purchasing/suppliers/:supplierId/notes", requireAuth(db, "purchasing.write"), (req, res) => {
    try {
      const { note, poId } = req.body;
      if (!note || !note.trim()) {
        return res.status(400).json({ error: "Note text is required" });
      }
      const id = store.addSupplierNote(db, {
        supplierId: Number(req.params.supplierId),
        poId: poId || null,
        note: note.trim(),
        createdBy: req.user.id,
        businessId: req.businessId,
      });
      res.status(201).json({ id });
    } catch (err) {
      console.error("POST /api/purchasing/suppliers/:supplierId/notes error:", err);
      res.status(500).json({ error: "Failed to add supplier note" });
    }
  });

  // GET /api/purchasing/suppliers/:supplierId/notes — Get supplier notes
  app.get("/api/purchasing/suppliers/:supplierId/notes", requireAuth(db, "purchasing.read"), (req, res) => {
    try {
      const notes = store.getSupplierNotes(db, Number(req.params.supplierId), req.businessId);
      res.json(notes);
    } catch (err) {
      console.error("GET /api/purchasing/suppliers/:supplierId/notes error:", err);
      res.status(500).json({ error: "Failed to fetch supplier notes" });
    }
  });

  // GET /api/purchasing/deliveries/expected — Expected deliveries
  app.get("/api/purchasing/deliveries/expected", requireAuth(db, "purchasing.read"), (req, res) => {
    try {
      const deliveries = store.getExpectedDeliveries(db, req.businessId);
      res.json(deliveries);
    } catch (err) {
      console.error("GET /api/purchasing/deliveries/expected error:", err);
      res.status(500).json({ error: "Failed to fetch expected deliveries" });
    }
  });

  // GET /api/purchasing/backorders — Backordered items
  app.get("/api/purchasing/backorders", requireAuth(db, "purchasing.read"), (req, res) => {
    try {
      const backorders = store.getBackorderedItems(db, req.businessId);
      res.json(backorders);
    } catch (err) {
      console.error("GET /api/purchasing/backorders error:", err);
      res.status(500).json({ error: "Failed to fetch backorders" });
    }
  });

  // GET /api/purchasing/orders/:id/full — Full PO with supplier + receiving history
  app.get("/api/purchasing/orders/:id/full", requireAuth(db, "purchasing.read"), (req, res) => {
    try {
      const po = store.getPOWithSupplier(db, Number(req.params.id), req.businessId);
      if (!po) return res.status(404).json({ error: "PO not found" });
      res.json(po);
    } catch (err) {
      console.error("GET /api/purchasing/orders/:id/full error:", err);
      res.status(500).json({ error: "Failed to fetch PO" });
    }
  });


}
