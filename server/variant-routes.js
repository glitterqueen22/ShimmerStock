/**
 * Product Variants — API Routes
 * =============================
 * Mounted on the Express app from index.js.
 */

import * as store from "./store.js";
import * as variantStore from "./variant-store.js";
import { auditLog, getDeviceInfo } from "./audit.js";

/**
 * Mount variant-related routes on the Express app.
 * @param {import("express").Express} app
 * @param {import("bun:sqlite").Database} db
 * @param {Function} requireAuth - Auth middleware factory
 */
export function mountVariantRoutes(app, db, requireAuth) {
  // GET /api/products/:id/variants — list variants for a product
  app.get("/api/products/:id/variants", requireAuth(db, "products.read"), (req, res) => {
    try {
      const productId = parseInt(req.params.id);

      const product = store.getProductById(db, productId, req.businessId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      const variants = variantStore.listVariants(db, productId, req.businessId);
      res.json(variants);
    } catch (err) {
      console.error("GET /api/products/:id/variants error:", err);
      res.status(500).json({ error: "Failed to fetch variants" });
    }
  });

  // POST /api/products/:id/variants — create a variant
  app.post("/api/products/:id/variants", requireAuth(db, "products.write"), (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { sku, barcode, variantType, variantValue, price, cost, stockCount, weightOz } = req.body;

      if (!sku || !variantType || !variantValue) {
        return res.status(400).json({ error: "SKU, variantType, and variantValue are required" });
      }

      const product = store.getProductById(db, productId, req.businessId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      const variantId = variantStore.createVariant(db, {
        productId,
        businessId: req.businessId,
        sku: sku.trim(),
        barcode: barcode ? barcode.trim() : null,
        variantType,
        variantValue,
        price: price ?? null,
        cost: cost ?? null,
        stockCount: stockCount ?? 0,
        weightOz: weightOz ?? null,
      });

      const created = variantStore.getVariant(db, variantId, req.businessId);

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "variant.created",
        entityType: "product_variant",
        entityId: variantId,
        newValue: { sku: created.sku, variantType, variantValue, productId, productName: product.name },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.status(201).json(created);
    } catch (err) {
      if (err.message && err.message.includes("UNIQUE constraint failed")) {
        return res.status(409).json({ error: "SKU already exists for this business" });
      }
      console.error("POST /api/products/:id/variants error:", err);
      res.status(500).json({ error: "Failed to create variant" });
    }
  });

  // PUT /api/variants/:variantId — update a variant
  app.put("/api/variants/:variantId", requireAuth(db, "products.write"), (req, res) => {
    try {
      const variantId = parseInt(req.params.variantId);
      const oldVariant = variantStore.getVariant(db, variantId, req.businessId);

      if (!oldVariant) {
        return res.status(404).json({ error: "Variant not found" });
      }

      const { sku, barcode, variantType, variantValue, price, cost, stockCount, weightOz, isActive } = req.body;
      const fields = {};
      if (sku !== undefined) fields.sku = sku.trim();
      if (barcode !== undefined) fields.barcode = barcode ? barcode.trim() : null;
      if (variantType !== undefined) fields.variantType = variantType;
      if (variantValue !== undefined) fields.variantValue = variantValue;
      if (price !== undefined) fields.price = price;
      if (cost !== undefined) fields.cost = cost;
      if (stockCount !== undefined) fields.stockCount = stockCount;
      if (weightOz !== undefined) fields.weightOz = weightOz;
      if (isActive !== undefined) fields.isActive = isActive;

      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      variantStore.updateVariant(db, variantId, req.businessId, fields);
      const updated = variantStore.getVariant(db, variantId, req.businessId);

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "variant.updated",
        entityType: "product_variant",
        entityId: variantId,
        previousValue: { sku: oldVariant.sku, price: oldVariant.price, cost: oldVariant.cost },
        newValue: { sku: updated.sku, price: updated.price, cost: updated.cost },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.json(updated);
    } catch (err) {
      if (err.message && err.message.includes("UNIQUE constraint failed")) {
        return res.status(409).json({ error: "SKU already exists for this business" });
      }
      console.error("PUT /api/variants/:variantId error:", err);
      res.status(500).json({ error: "Failed to update variant" });
    }
  });

  // DELETE /api/variants/:variantId — soft-delete a variant
  app.delete("/api/variants/:variantId", requireAuth(db, "products.write"), (req, res) => {
    try {
      const variantId = parseInt(req.params.variantId);
      const variant = variantStore.getVariant(db, variantId, req.businessId);

      if (!variant) {
        return res.status(404).json({ error: "Variant not found" });
      }

      variantStore.deleteVariant(db, variantId, req.businessId);

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "variant.deleted",
        entityType: "product_variant",
        entityId: variantId,
        previousValue: { sku: variant.sku, variantType: variant.variantType, variantValue: variant.variantValue },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/variants/:variantId error:", err);
      res.status(500).json({ error: "Failed to delete variant" });
    }
  });

  // POST /api/products/bulk — bulk import products with nested variants
  app.post("/api/products/bulk", requireAuth(db, "products.write"), (req, res) => {
    try {
      const { products } = req.body;

      if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ error: "products array is required" });
      }

      const results = variantStore.bulkProductImport(db, req.businessId, products);

      auditLog(db, {
        businessId: req.businessId,
        userId: req.user.id,
        actionType: "products.bulk_imported",
        entityType: "product",
        entityId: null,
        newValue: {
          totalProducts: results.length,
          created: results.filter(r => r.action === "created").length,
          skipped: results.filter(r => r.action === "skipped").length,
          totalVariants: results.reduce((sum, r) => sum + r.variants.length, 0),
        },
        source: "manual",
        deviceInfo: getDeviceInfo(req),
      });

      res.status(201).json({
        success: true,
        results,
        summary: {
          totalProducts: results.length,
          created: results.filter(r => r.action === "created").length,
          skipped: results.filter(r => r.action === "skipped").length,
          totalVariants: results.reduce((sum, r) => sum + r.variants.filter(v => v.action === "created").length, 0),
        },
      });
    } catch (err) {
      console.error("POST /api/products/bulk error:", err);
      res.status(500).json({ error: "Failed to bulk import products" });
    }
  });

  console.log("Variant routes mounted");
}
