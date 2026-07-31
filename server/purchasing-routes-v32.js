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
          import("./events.js").then(({ emit }) => {
            emit("purchasing.items_received", {
              poId: result.poId,
              productId: r.productId,
              productName: r.productName,
              quantity: r.quantityReceived,
              binLocation: r.binLocation,
              businessId: req.businessId,
            });
          });
        }
      }

      // Audit log
      import("./audit.js").then(({ auditLog }) => {
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
      });

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
