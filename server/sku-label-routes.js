import bwipjs from "bwip-js";
import { requireAuth } from "./auth.js";
import {
  analyzeCatalog,
  getIdentitySettings,
  getOrCreateInternalBarcode,
  prepareQuickSetup,
  recommendSkuPattern,
  resolveScan,
  saveIdentitySettings,
  saveLocalIdentifiers,
} from "./sku-label-studio.js";
import { createWritebackPreview, executeWriteback } from "./shopify-identifier-writeback.js";

const LABEL_SIZES = Object.freeze({
  "2x1": { width: 2, height: 1, label: "2 x 1 inch" },
  "2.25x1.25": { width: 2.25, height: 1.25, label: "2.25 x 1.25 inch" },
  "3x2": { width: 3, height: 2, label: "3 x 2 inch" },
  "4x2": { width: 4, height: 2, label: "4 x 2 inch" },
});

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export function mountSkuLabelRoutes(app, db) {
  app.get("/api/sku-label-studio", requireAuth(db, "products.read"), (req, res) => {
    const audit = analyzeCatalog(db, req.businessId);
    const recommendation = recommendSkuPattern(db, req.businessId);
    const settings = getIdentitySettings(db, req.businessId);
    const credential = db.query(
      "SELECT scopes, shop_domain FROM provider_credentials WHERE business_id = ? AND provider = 'shopify' AND is_active = 1"
    ).get(req.businessId);
    const scopes = String(credential?.scopes ?? "").split(",").map(scope => scope.trim()).filter(Boolean);
    res.json({
      audit,
      recommendation,
      settings,
      labelSizes: LABEL_SIZES,
      shopifyMode: scopes.includes("write_products") ? "writeback" : "readonly",
      shopDomain: credential?.shop_domain ?? null,
    });
  });

  app.post("/api/sku-label-studio/preview", requireAuth(db, "products.write"), (req, res) => {
    try {
      res.json(prepareQuickSetup(db, req.businessId, req.body ?? {}));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/sku-label-studio/settings", requireAuth(db, "products.write"), (req, res) => {
    try {
      const current = getIdentitySettings(db, req.businessId);
      if (typeof req.body?.autoWritebackEnabled === "boolean" && req.body.autoWritebackEnabled !== current.autoWritebackEnabled) {
        if (!new Set(["owner", "admin"]).has(req.businessRole)) {
          return res.status(403).json({ error: "Only an owner or admin can change automatic Shopify identifier updates" });
        }
        if (req.body.autoWritebackEnabled) {
          const credential = db.query(
            "SELECT scopes FROM provider_credentials WHERE business_id = ? AND provider = 'shopify' AND is_active = 1"
          ).get(req.businessId);
          const scopes = String(credential?.scopes || "").split(",").map(scope => scope.trim());
          if (!scopes.includes("write_products")) {
            return res.status(403).json({ error: "Product Editing permission is required for automatic Shopify updates" });
          }
        }
      }
      res.json(saveIdentitySettings(db, req.businessId, req.body ?? {}));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/sku-label-studio/save-local", requireAuth(db, "products.write"), (req, res) => {
    try {
      const results = saveLocalIdentifiers(db, req.businessId, req.body?.items, { settings: req.body?.settings });
      res.json({ success: true, updated: results.length, results });
    } catch (error) {
      const status = String(error.message).includes("not found") ? 404 : 409;
      res.status(status).json({ success: false, error: error.message });
    }
  });

  app.post("/api/sku-label-studio/internal-barcodes/:variantId", requireAuth(db, "products.write"), (req, res) => {
    try {
      const barcode = getOrCreateInternalBarcode(db, req.businessId, Number(req.params.variantId));
      res.status(201).json({ barcode, kind: "internal", retailIdentifier: false });
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  });

  app.get("/api/sku-label-studio/barcodes/:variantId.svg", requireAuth(db, "products.read"), (req, res) => {
    const variant = db.query(`
      SELECT v.barcode, ib.barcode_value AS internal_barcode
      FROM product_variants v
      LEFT JOIN generated_internal_barcodes ib
        ON ib.variant_id = v.id AND ib.business_id = v.business_id
      WHERE v.id = ? AND v.business_id = ?
    `).get(Number(req.params.variantId), req.businessId);
    const value = variant?.barcode || variant?.internal_barcode;
    if (!value) return res.status(404).json({ error: "Barcode not found" });
    try {
      const svg = bwipjs.toSVG({ bcid: "code128", text: String(value), scale: 2, height: 10, includetext: true, textxalign: "center" });
      const markedSvg = svg.replace("<svg", `<svg data-barcode-value="${encodeURIComponent(String(value))}"`);
      res.type("image/svg+xml").send(markedSvg);
    } catch {
      res.status(422).json({ error: "Barcode cannot be rendered" });
    }
  });

  app.post("/api/sku-label-studio/scan", requireAuth(db, "products.read"), (req, res) => {
    const result = resolveScan(db, req.businessId, req.body?.value);
    res.status(result.status === "not_found" ? 404 : result.status === "ambiguous" ? 409 : 200).json(result);
  });

  app.get("/api/sku-label-studio/templates", requireAuth(db, "products.read"), (req, res) => {
    const templates = db.query(
      "SELECT * FROM label_templates WHERE business_id = ? ORDER BY is_default DESC, updated_at DESC"
    ).all(req.businessId).map(row => ({ ...row, fields: parseJson(row.fields, []) }));
    res.json(templates);
  });

  app.post("/api/sku-label-studio/templates", requireAuth(db, "products.write"), (req, res) => {
    const size = LABEL_SIZES[req.body?.size];
    if (!size) return res.status(400).json({ error: "Choose a supported label size" });
    const fields = Array.isArray(req.body?.fields) ? req.body.fields : ["product", "variant", "sku", "barcode"];
    if (req.body?.isDefault) db.run("UPDATE label_templates SET is_default = 0 WHERE business_id = ?", [req.businessId]);
    const result = db.run(`
      INSERT INTO label_templates (business_id, name, width_inches, height_inches, fields, custom_text, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [req.businessId, String(req.body?.name || size.label).trim(), size.width, size.height, JSON.stringify(fields), req.body?.customText || null, req.body?.isDefault ? 1 : 0]);
    res.status(201).json({ id: Number(result.lastInsertRowid), size: req.body.size, width: size.width, height: size.height, fields });
  });

  app.put("/api/sku-label-studio/templates/:id", requireAuth(db, "products.write"), (req, res) => {
    const size = LABEL_SIZES[req.body?.size];
    if (!size) return res.status(400).json({ error: "Choose a supported label size" });
    const existing = db.query("SELECT id FROM label_templates WHERE id = ? AND business_id = ?").get(Number(req.params.id), req.businessId);
    if (!existing) return res.status(404).json({ error: "Label template not found" });
    const fields = Array.isArray(req.body?.fields) ? req.body.fields : ["product", "variant", "sku", "barcode"];
    db.run(`
      UPDATE label_templates SET name = ?, width_inches = ?, height_inches = ?, fields = ?,
        custom_text = ?, is_default = ?, updated_at = datetime('now')
      WHERE id = ? AND business_id = ?
    `, [String(req.body?.name || size.label).trim(), size.width, size.height, JSON.stringify(fields),
      req.body?.customText || null, req.body?.isDefault ? 1 : 0, existing.id, req.businessId]);
    res.json({ id: existing.id, size: req.body.size, width: size.width, height: size.height, fields, customText: req.body?.customText || null });
  });

  app.post("/api/sku-label-studio/print-jobs", requireAuth(db, "products.write"), (req, res) => {
    const template = db.query("SELECT id FROM label_templates WHERE id = ? AND business_id = ?").get(req.body?.templateId, req.businessId);
    if (!template) return res.status(404).json({ error: "Label template not found" });
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const normalized = [];
    let totalLabels = 0;
    for (const item of items) {
      const variant = db.query("SELECT id FROM product_variants WHERE id = ? AND business_id = ?").get(item.variantId, req.businessId);
      const quantity = Math.max(1, Math.min(1000, Number(item.quantity) || 1));
      if (!variant) return res.status(404).json({ error: `Variant ${item.variantId} not found` });
      normalized.push({ variantId: variant.id, quantity });
      totalLabels += quantity;
    }
    if (totalLabels === 0) return res.status(400).json({ error: "Choose at least one label" });
    const result = db.run(`
      INSERT INTO label_print_jobs (business_id, template_id, requested_by, items, total_labels, is_test)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [req.businessId, template.id, req.user.id, JSON.stringify(normalized), totalLabels, req.body?.isTest ? 1 : 0]);
    res.status(201).json({ id: Number(result.lastInsertRowid), status: "queued", totalLabels, isTest: Boolean(req.body?.isTest) });
  });

  app.get("/api/sku-label-studio/print-jobs", requireAuth(db, "products.read"), (req, res) => {
    const jobs = db.query(
      "SELECT * FROM label_print_jobs WHERE business_id = ? ORDER BY created_at DESC LIMIT 50"
    ).all(req.businessId).map(row => ({ ...row, items: parseJson(row.items, []) }));
    res.json(jobs);
  });

  app.get("/api/sku-label-studio/writeback-audit", requireAuth(db, "products.read"), (req, res) => {
    const rows = db.query(`
      SELECT id, shop, shopify_product_id, shopify_variant_id, previous_sku,
             previous_barcode, requested_sku, requested_barcode, result,
             shopify_user_errors, initiated_by, created_at
      FROM shopify_identifier_writeback_audit
      WHERE business_id = ? ORDER BY created_at DESC LIMIT 100
    `).all(req.businessId).map(row => ({ ...row, shopify_user_errors: parseJson(row.shopify_user_errors, []) }));
    res.json(rows);
  });

  app.post("/api/sku-label-studio/shopify-preview", requireAuth(db, "products.write"), (req, res) => {
    try {
      res.status(201).json(createWritebackPreview(db, req.businessId, req.user.id, req.body?.items, req.body?.accepted));
    } catch (error) {
      res.status(403).json({ error: error.message });
    }
  });

  app.post("/api/sku-label-studio/shopify-writeback", requireAuth(db, "products.write"), async (req, res) => {
    try {
      const results = await executeWriteback(db, req.businessId, req.user.id, req.body?.previewId, req.body?.confirmation);
      res.status(results.failed > 0 ? 207 : 200).json(results);
    } catch (error) {
      res.status(403).json({ error: error.message });
    }
  });
}