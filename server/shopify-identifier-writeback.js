import crypto from "node:crypto";
import { decryptToken } from "./crypto-utils.js";
import { gatewayProductVariantsBulkUpdate, gatewayProductVariantsByIds } from "./providers/shopify-gateway.js";
import { saveLocalIdentifiers } from "./sku-label-studio.js";

function gid(type, value) {
  const normalized = String(value || "");
  return normalized.startsWith("gid://shopify/") ? normalized : `gid://shopify/${type}/${normalized}`;
}

function loadWritebackCredential(db, businessId) {
  const credential = db.query(`
    SELECT business_id, shop_domain, access_token_encrypted, scopes
    FROM provider_credentials
    WHERE business_id = ? AND provider = 'shopify' AND is_active = 1
  `).get(businessId);
  if (!credential || Number(credential.business_id) !== Number(businessId)) throw new Error("Active business Shopify credential not found");
  const scopes = String(credential.scopes || "").split(",").map(scope => scope.trim());
  if (!scopes.includes("write_products")) throw new Error("Product Editing permission is required");
  return { shop: credential.shop_domain, accessToken: decryptToken(credential.access_token_encrypted) };
}

function validatePreviewItems(db, businessId, items) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Choose at least one variant");
  const requestedSkus = new Set();
  const requestedBarcodes = new Set();
  return items.map((item) => {
    const variant = db.query(`
      SELECT v.id, v.sku, v.barcode, v.shopify_sku, v.shopify_barcode,
             v.shopify_variant_id, v.shopify_inventory_item_id,
             p.name AS product_name, p.shopify_product_id, v.variant_value
      FROM product_variants v
      JOIN products p ON p.id = v.product_id AND p.business_id = v.business_id
      WHERE v.id = ? AND v.business_id = ? AND v.is_active = 1
    `).get(item.variantId, businessId);
    if (!variant?.shopify_variant_id || !variant?.shopify_inventory_item_id || !variant?.shopify_product_id) {
      throw new Error(`Variant ${item.variantId} is not linked to Shopify`);
    }
    const requestedSku = item.sku === undefined ? variant.sku : String(item.sku ?? "").trim() || null;
    const requestedBarcode = item.barcode === undefined ? variant.barcode : String(item.barcode ?? "").trim() || null;
    if (variant.shopify_sku && requestedSku !== variant.shopify_sku && !item.replaceSku) {
      throw new Error(`Variant ${item.variantId} Shopify SKU replacement was not selected`);
    }
    if (variant.shopify_barcode && requestedBarcode !== variant.shopify_barcode && !item.replaceBarcode) {
      throw new Error(`Variant ${item.variantId} Shopify barcode replacement was not selected`);
    }
    if (requestedSku && requestedSku !== variant.sku) {
      const collision = db.query("SELECT id FROM product_variants WHERE business_id = ? AND sku = ? AND id != ? LIMIT 1").get(
        businessId, requestedSku, variant.id
      );
      if (collision || requestedSkus.has(requestedSku)) throw new Error(`SKU collision: ${requestedSku}`);
      requestedSkus.add(requestedSku);
    }
    if (requestedBarcode && requestedBarcode !== variant.barcode) {
      const collision = db.query("SELECT id FROM product_variants WHERE business_id = ? AND barcode = ? AND id != ? LIMIT 1").get(
        businessId, requestedBarcode, variant.id
      );
      if (collision || requestedBarcodes.has(requestedBarcode)) throw new Error(`Barcode collision: ${requestedBarcode}`);
      requestedBarcodes.add(requestedBarcode);
    }
    return {
      variantId: variant.id,
      productName: variant.product_name,
      variantName: variant.variant_value,
      shopifyProductId: gid("Product", variant.shopify_product_id),
      shopifyVariantId: gid("ProductVariant", variant.shopify_variant_id),
      shopifyInventoryItemId: gid("InventoryItem", variant.shopify_inventory_item_id),
      previousSku: variant.shopify_sku,
      previousBarcode: variant.shopify_barcode,
      requestedSku,
      requestedBarcode,
      replaceSku: Boolean(item.replaceSku),
      replaceBarcode: Boolean(item.replaceBarcode),
    };
  });
}

export function createWritebackPreview(db, businessId, userId, items, accepted) {
  if (accepted !== true) throw new Error("Preview must be explicitly accepted");
  const settings = db.query("SELECT writeback_enabled FROM product_identity_settings WHERE business_id = ?").get(businessId);
  if (!settings?.writeback_enabled) throw new Error("SKU & Label Studio writeback is not enabled");
  loadWritebackCredential(db, businessId);
  const payload = validatePreviewItems(db, businessId, items);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  db.run(`
    INSERT INTO shopify_identifier_writeback_previews
      (id, business_id, initiated_by, payload, accepted_at, expires_at)
    VALUES (?, ?, ?, ?, datetime('now'), ?)
  `, [id, businessId, userId, JSON.stringify(payload), expiresAt]);
  return { id, expiresAt, items: payload };
}

function auditResult(db, businessId, userId, shop, item, result, errors) {
  db.run(`
    INSERT INTO shopify_identifier_writeback_audit
      (business_id, shop, shopify_product_id, shopify_variant_id, previous_sku,
       previous_barcode, requested_sku, requested_barcode, result, shopify_user_errors, initiated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [businessId, shop, item.shopifyProductId, item.shopifyVariantId, item.previousSku,
    item.previousBarcode, item.requestedSku, item.requestedBarcode, result, JSON.stringify(errors || []), userId]);
}

function normalizeIdentifier(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function setIdentifierStates(db, businessId, items, state) {
  const update = db.query(`
    UPDATE product_variants SET sku_sync_state = ?, barcode_sync_state = ?, updated_at = datetime('now')
    WHERE id = ? AND business_id = ?
  `);
  for (const item of items) update.run(state, state, item.variantId, businessId);
}

export async function executeWriteback(db, businessId, userId, previewId, confirmation) {
  const settings = db.query(
    "SELECT writeback_enabled, auto_writeback_enabled FROM product_identity_settings WHERE business_id = ?"
  ).get(businessId);
  if (confirmation !== "UPDATE SHOPIFY" && !settings?.auto_writeback_enabled) {
    throw new Error("Final confirmation is required");
  }
  const preview = db.query(`
    SELECT * FROM shopify_identifier_writeback_previews
    WHERE id = ? AND business_id = ? AND initiated_by = ?
      AND accepted_at IS NOT NULL AND executed_at IS NULL AND expires_at > datetime('now')
  `).get(previewId, businessId, userId);
  if (!preview) throw new Error("Accepted preview not found or expired");
  if (!settings?.writeback_enabled) throw new Error("SKU & Label Studio writeback is not enabled");
  const credential = loadWritebackCredential(db, businessId);
  const items = JSON.parse(preview.payload);
  const currentItems = validatePreviewItems(db, businessId, items.map(item => ({
    variantId: item.variantId,
    sku: item.requestedSku,
    barcode: item.requestedBarcode,
    replaceSku: item.replaceSku,
    replaceBarcode: item.replaceBarcode,
  })));
  for (let index = 0; index < items.length; index++) {
    if (currentItems[index].previousSku !== items[index].previousSku || currentItems[index].previousBarcode !== items[index].previousBarcode) {
      throw new Error("Shopify identifiers changed after preview; review the latest values before updating");
    }
  }
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.shopifyProductId)) groups.set(item.shopifyProductId, []);
    groups.get(item.shopifyProductId).push(item);
  }
  const results = [];
  for (const [productId, productItems] of groups) {
    saveLocalIdentifiers(db, businessId, productItems.map(item => ({
      variantId: item.variantId,
      sku: item.requestedSku,
      barcode: item.requestedBarcode,
      replaceSku: item.replaceSku,
      replaceBarcode: item.replaceBarcode,
    })));
    setIdentifierStates(db, businessId, productItems, "SHOPIFY_UPDATE_IN_PROGRESS");
    try {
      const response = await gatewayProductVariantsBulkUpdate(
        credential.shop,
        credential.accessToken,
        productId,
        productItems.map(item => ({ id: item.shopifyVariantId, sku: item.requestedSku, barcode: item.requestedBarcode }))
      );
      const payload = response?.data?.productVariantsBulkUpdate;
      const globalErrors = response?.errors || [];
      const userErrors = payload?.userErrors || [];
      const updatedIds = new Set((payload?.productVariants || []).map(variant => variant.id));
      let verifiedById = new Map();
      const itemErrors = productItems.map((_, index) => [
        ...globalErrors,
        ...userErrors.filter(error => {
          const field = Array.isArray(error.field) ? error.field : [];
          const variantIndex = field[0] === "variants" ? Number(field[1]) : null;
          return variantIndex === null || Number.isNaN(variantIndex) || variantIndex === index;
        }),
      ]);
      const verificationIds = productItems
        .filter((item, index) => itemErrors[index].length === 0 && updatedIds.has(item.shopifyVariantId))
        .map(item => item.shopifyVariantId);
      if (verificationIds.length > 0) {
        const verification = await gatewayProductVariantsByIds(
          credential.shop, credential.accessToken, verificationIds
        );
        verifiedById = new Map((verification?.data?.nodes || []).filter(Boolean).map(variant => [variant.id, variant]));
      }
      for (let index = 0; index < productItems.length; index++) {
        const item = productItems[index];
        const verified = verifiedById.get(item.shopifyVariantId);
        const errors = itemErrors[index];
        const updated = errors.length === 0 && updatedIds.has(item.shopifyVariantId)
          && normalizeIdentifier(verified?.inventoryItem?.sku) === normalizeIdentifier(item.requestedSku)
          && normalizeIdentifier(verified?.barcode) === normalizeIdentifier(item.requestedBarcode);
        const auditErrors = updated ? [] : errors.length > 0 ? errors : [{ message: "Shopify verification did not match the approved identifiers" }];
        if (updated) {
          db.run(`UPDATE product_variants SET shopify_sku = ?, shopify_barcode = ?,
            sku_sync_state = 'SHOPIFY_UPDATED', barcode_sync_state = 'SHOPIFY_UPDATED'
            WHERE id = ? AND business_id = ?`,
            [item.requestedSku, item.requestedBarcode, item.variantId, businessId]);
        } else {
          db.run(`UPDATE product_variants SET sku_sync_state = 'SHOPIFY_UPDATE_FAILED',
            barcode_sync_state = 'SHOPIFY_UPDATE_FAILED' WHERE id = ? AND business_id = ?`,
            [item.variantId, businessId]);
        }
        const result = updated ? "SHOPIFY_UPDATED" : "SHOPIFY_UPDATE_FAILED";
        auditResult(db, businessId, userId, credential.shop, item, result, auditErrors);
        results.push({ variantId: item.variantId, result, errors: auditErrors });
      }
    } catch (error) {
      setIdentifierStates(db, businessId, productItems, "SHOPIFY_UPDATE_FAILED");
      for (const item of productItems) {
        const errors = [{ message: error.message }];
        auditResult(db, businessId, userId, credential.shop, item, "SHOPIFY_UPDATE_FAILED", errors);
        results.push({ variantId: item.variantId, result: "SHOPIFY_UPDATE_FAILED", errors });
      }
    }
  }
  db.run("UPDATE shopify_identifier_writeback_previews SET executed_at = datetime('now') WHERE id = ?", [previewId]);
  return {
    updated: results.filter(result => result.result === "SHOPIFY_UPDATED").length,
    skipped: results.filter(result => result.result === "skipped").length,
    failed: results.filter(result => result.result === "SHOPIFY_UPDATE_FAILED").length,
    results,
  };
}