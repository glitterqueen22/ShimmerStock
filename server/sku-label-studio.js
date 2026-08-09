import { getVariantInventory } from "./inventory-truth.js";
import { getLocalSkuSaveState, withSkuTruth } from "./sku-truth.js";

const DEFAULT_SETTINGS = Object.freeze({
  skuPattern: "{PRODUCT}-{VARIANT}-{NUMBER}",
  separator: "-",
  letterCase: "upper",
  numberStart: 1,
  numberPadding: 3,
  preserveExisting: true,
  writebackEnabled: false,
  autoWritebackEnabled: false,
  preferredLabelSize: "2x1",
  labelFields: ["product", "variant", "sku", "barcode"],
});

const ALLOWED_TOKENS = new Set(["BRAND", "PRODUCT", "TYPE", "COLOR", "SIZE", "VARIANT", "NUMBER"]);

function cleanPart(value, separator) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, separator)
    .replace(new RegExp(`^${escapeRegExp(separator)}+|${escapeRegExp(separator)}+$`, "g"), "")
    .replace(new RegExp(`${escapeRegExp(separator)}{2,}`, "g"), separator);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSettings(input = {}) {
  const separator = /^[._-]$/.test(input.separator) ? input.separator : DEFAULT_SETTINGS.separator;
  const letterCase = input.letterCase === "lower" ? "lower" : "upper";
  const numberStart = Number.isSafeInteger(input.numberStart) && input.numberStart >= 0 ? input.numberStart : 1;
  const numberPadding = Number.isSafeInteger(input.numberPadding) && input.numberPadding >= 1 && input.numberPadding <= 8
    ? input.numberPadding
    : 3;
  const skuPattern = typeof input.skuPattern === "string" && input.skuPattern.trim()
    ? input.skuPattern.trim()
    : DEFAULT_SETTINGS.skuPattern;
  for (const match of skuPattern.matchAll(/\{([^}]+)\}/g)) {
    if (!ALLOWED_TOKENS.has(match[1])) throw new Error(`Unsupported SKU token: {${match[1]}}`);
  }
  return { ...DEFAULT_SETTINGS, ...input, skuPattern, separator, letterCase, numberStart, numberPadding };
}

export function renderSku(pattern, attributes, sequence, options = {}) {
  const settings = normalizeSettings({ ...options, skuPattern: pattern });
  const number = String(sequence).padStart(settings.numberPadding, "0");
  const values = {
    BRAND: attributes.brand,
    PRODUCT: attributes.product,
    TYPE: attributes.type,
    COLOR: attributes.color,
    SIZE: attributes.size,
    VARIANT: attributes.variant,
    NUMBER: number,
  };
  let rendered = settings.skuPattern.replace(/\{([^}]+)\}/g, (_, token) => cleanPart(values[token], settings.separator));
  rendered = cleanPart(rendered, settings.separator);
  return settings.letterCase === "lower" ? rendered.toLowerCase() : rendered.toUpperCase();
}

export function getIdentitySettings(db, businessId) {
  const row = db.query("SELECT * FROM product_identity_settings WHERE business_id = ?").get(businessId);
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    skuPattern: row.sku_pattern,
    separator: row.sku_separator,
    letterCase: row.sku_case,
    numberStart: row.number_start,
    numberPadding: row.number_padding,
    preserveExisting: Boolean(row.preserve_existing),
    writebackEnabled: Boolean(row.writeback_enabled),
    autoWritebackEnabled: Boolean(row.auto_writeback_enabled),
    preferredLabelSize: row.preferred_label_size,
    labelFields: JSON.parse(row.label_fields),
  };
}

export function listCatalogVariants(db, businessId) {
  return db.query(`
    SELECT v.id, v.product_id, v.business_id, v.sku, v.barcode,
           v.shopify_sku, v.shopify_barcode, v.shopify_variant_id,
           v.shopify_inventory_item_id, v.variant_type, v.variant_value,
           v.price, v.stock_count, v.sku_sync_state, v.barcode_sync_state,
           p.name AS product_name,
           p.shopify_product_id, b.name AS business_name,
           ib.barcode_value AS internal_barcode
    FROM product_variants v
    JOIN products p ON p.id = v.product_id AND p.business_id = v.business_id
    JOIN businesses b ON b.id = v.business_id
    LEFT JOIN generated_internal_barcodes ib
      ON ib.variant_id = v.id AND ib.business_id = v.business_id
    WHERE v.business_id = ? AND v.is_active = 1
    ORDER BY p.name COLLATE NOCASE, v.variant_value COLLATE NOCASE, v.id
  `).all(businessId).map(withSkuTruth);
}

function duplicateValues(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const value = String(row[field] ?? "").trim();
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([value]) => value));
}

export function analyzeCatalog(db, businessId) {
  const variants = listCatalogVariants(db, businessId);
  const duplicateSkus = duplicateValues(variants, "sku");
  const duplicateBarcodes = duplicateValues(variants, "barcode");
  const items = variants.map((variant) => {
    const sku = String(variant.sku ?? "").trim();
    const barcode = String(variant.barcode ?? "").trim();
    const missingSku = !sku;
    const missingBarcode = !barcode && !variant.internal_barcode;
    const duplicateSku = Boolean(sku && duplicateSkus.has(sku));
    const duplicateBarcode = Boolean(barcode && duplicateBarcodes.has(barcode));
    const differsFromShopify = (
      variant.skuTruth.mismatch ||
      String(variant.shopify_barcode ?? "").trim() !== barcode
    );
    const needsReview = duplicateSku || duplicateBarcode ||
      variant.skuTruth.needsReview || variant.barcode_sync_state === "SHOPIFY_UPDATE_FAILED";
    const ready = !missingSku && (!missingBarcode || Boolean(variant.internal_barcode)) && !needsReview;
    return { ...variant, missingSku, missingBarcode, duplicateSku, duplicateBarcode, differsFromShopify, ready, needsReview };
  });
  return {
    total: items.length,
    missingSkus: items.filter(item => item.missingSku).length,
    missingBarcodes: items.filter(item => item.missingBarcode).length,
    duplicateSkus: items.filter(item => item.duplicateSku).length,
    duplicateBarcodes: items.filter(item => item.duplicateBarcode).length,
    ready: items.filter(item => item.ready).length,
    needsReview: items.filter(item => item.needsReview).length,
    differences: items.filter(item => item.differsFromShopify).length,
    items,
  };
}

export function recommendSkuPattern(db, businessId) {
  const rows = listCatalogVariants(db, businessId);
  const existing = rows.map(row => String(row.sku ?? "").trim()).filter(Boolean);
  const separatorCounts = new Map([["-", 0], ["_", 0], [".", 0]]);
  for (const sku of existing) {
    for (const separator of separatorCounts.keys()) {
      if (sku.includes(separator)) separatorCounts.set(separator, separatorCounts.get(separator) + 1);
    }
  }
  const [separator, count] = [...separatorCounts].sort((a, b) => b[1] - a[1])[0];
  const recognized = existing.length >= 3 && count / existing.length >= 0.6;
  return {
    recognized,
    message: recognized
      ? "I spotted a pattern you're already using. Want me to keep it consistent?"
      : "I can start a clean SKU system for you.",
    settings: normalizeSettings({ separator, skuPattern: "{PRODUCT}-{VARIANT}-{NUMBER}" }),
  };
}

export function prepareQuickSetup(db, businessId, input = {}) {
  const audit = analyzeCatalog(db, businessId);
  const settings = normalizeSettings({ ...getIdentitySettings(db, businessId), ...input });
  const used = new Set(audit.items.map(item => String(item.sku ?? "").trim()).filter(Boolean));
  let sequence = settings.numberStart;
  const items = audit.items.map((item) => {
    if (!item.missingSku || item.needsReview) {
      return { ...item, proposedSku: item.sku, status: item.needsReview ? "needs_review" : "already_existed" };
    }
    let proposedSku;
    do {
      proposedSku = renderSku(settings.skuPattern, {
        brand: item.business_name,
        product: item.product_name,
        type: item.variant_type,
        variant: item.variant_value,
        color: item.variant_value,
        size: item.variant_value,
      }, sequence++, settings);
    } while (!proposedSku || used.has(proposedSku));
    used.add(proposedSku);
    return { ...item, proposedSku, status: "novi_generated" };
  });
  return { audit, settings, items };
}

function barcodeCheckDigit(value) {
  return String([...value].reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0) % 10);
}

export function internalBarcodeValue(businessId, variantId) {
  const body = `SS${Number(businessId).toString(36).toUpperCase().padStart(4, "0")}${Number(variantId).toString(36).toUpperCase().padStart(8, "0")}`;
  return `${body}${barcodeCheckDigit(body)}`;
}

export function getOrCreateInternalBarcode(db, businessId, variantId) {
  const variant = db.query("SELECT id FROM product_variants WHERE id = ? AND business_id = ?").get(variantId, businessId);
  if (!variant) throw new Error("Variant not found");
  const existing = db.query(
    "SELECT barcode_value FROM generated_internal_barcodes WHERE business_id = ? AND variant_id = ?"
  ).get(businessId, variantId);
  if (existing) return existing.barcode_value;
  const barcodeValue = internalBarcodeValue(businessId, variantId);
  db.run(
    "INSERT INTO generated_internal_barcodes (business_id, variant_id, barcode_value) VALUES (?, ?, ?)",
    [businessId, variantId, barcodeValue]
  );
  db.run(
    "UPDATE product_variants SET barcode_sync_state = 'GENERATED_LOCAL', updated_at = datetime('now') WHERE id = ? AND business_id = ? AND (barcode IS NULL OR trim(barcode) = '')",
    [variantId, businessId]
  );
  return barcodeValue;
}

export function saveIdentitySettings(db, businessId, input) {
  const existing = getIdentitySettings(db, businessId);
  const settings = normalizeSettings(input);
  const labelFields = Array.isArray(input.labelFields) ? input.labelFields : DEFAULT_SETTINGS.labelFields;
  const preferredLabelSize = ["2x1", "2.25x1.25", "3x2", "4x2"].includes(input.preferredLabelSize)
    ? input.preferredLabelSize
    : DEFAULT_SETTINGS.preferredLabelSize;
  db.run(`
    INSERT INTO product_identity_settings
      (business_id, sku_pattern, sku_separator, sku_case, number_start, number_padding,
      preserve_existing, writeback_enabled, auto_writeback_enabled,
      preferred_label_size, label_fields, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(business_id) DO UPDATE SET
      sku_pattern = excluded.sku_pattern, sku_separator = excluded.sku_separator,
      sku_case = excluded.sku_case, number_start = excluded.number_start,
      number_padding = excluded.number_padding, preserve_existing = excluded.preserve_existing,
      writeback_enabled = excluded.writeback_enabled,
      auto_writeback_enabled = excluded.auto_writeback_enabled,
      preferred_label_size = excluded.preferred_label_size,
      label_fields = excluded.label_fields, updated_at = datetime('now')
  `, [
    businessId, settings.skuPattern, settings.separator, settings.letterCase,
    settings.numberStart, settings.numberPadding, settings.preserveExisting ? 1 : 0,
    typeof input.writebackEnabled === "boolean" ? Number(input.writebackEnabled) : Number(existing.writebackEnabled),
    typeof input.autoWritebackEnabled === "boolean" ? Number(input.autoWritebackEnabled) : Number(existing.autoWritebackEnabled),
    preferredLabelSize, JSON.stringify(labelFields),
  ]);
  return getIdentitySettings(db, businessId);
}

export function recordCatalogAudit(db, businessId, importSessionId = null) {
  const audit = analyzeCatalog(db, businessId);
  const summary = {
    total: audit.total,
    missingSkus: audit.missingSkus,
    missingBarcodes: audit.missingBarcodes,
    duplicateSkus: audit.duplicateSkus,
    duplicateBarcodes: audit.duplicateBarcodes,
    ready: audit.ready,
    needsReview: audit.needsReview,
    differences: audit.differences,
  };
  db.run(
    "INSERT INTO product_setup_audits (business_id, import_session_id, summary) VALUES (?, ?, ?)",
    [businessId, importSessionId, JSON.stringify(summary)]
  );
  return summary;
}

export function saveLocalIdentifiers(db, businessId, items, options = {}) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("At least one variant is required");
  const transaction = db.transaction(() => {
    const results = [];
    const requestSkus = new Set();
    const requestBarcodes = new Set();
    for (const item of items) {
      const variant = db.query(
        `SELECT id, sku, barcode, shopify_sku, shopify_barcode, shopify_variant_id, sku_sync_state
         FROM product_variants WHERE id = ? AND business_id = ? AND is_active = 1`
      ).get(item.variantId, businessId);
      if (!variant) throw new Error(`Variant ${item.variantId} not found`);

      const nextSku = item.sku == null ? variant.sku : String(item.sku).trim() || null;
      let nextBarcode = item.barcode == null ? variant.barcode : String(item.barcode).trim() || null;
      if (item.generateInternalBarcode) {
        if (String(variant.barcode ?? "").trim() && !item.replaceBarcode) {
          throw new Error(`Variant ${item.variantId} already has a retail barcode`);
        }
        nextBarcode = getOrCreateInternalBarcode(db, businessId, item.variantId);
      }

      if (String(variant.sku ?? "").trim() && nextSku !== variant.sku && !item.replaceSku) {
        throw new Error(`Variant ${item.variantId} SKU replacement requires confirmation`);
      }
      if (String(variant.barcode ?? "").trim() && nextBarcode !== variant.barcode && !item.replaceBarcode) {
        throw new Error(`Variant ${item.variantId} barcode replacement requires confirmation`);
      }

      if (nextSku && nextSku !== variant.sku) {
        const collision = db.query(
          "SELECT id FROM product_variants WHERE business_id = ? AND sku = ? AND id != ? LIMIT 1"
        ).get(businessId, nextSku, item.variantId);
        if (collision || requestSkus.has(nextSku)) throw new Error(`SKU collision: ${nextSku}`);
        requestSkus.add(nextSku);
      }
      if (nextBarcode && nextBarcode !== variant.barcode) {
        const collision = db.query(
          "SELECT id FROM product_variants WHERE business_id = ? AND barcode = ? AND id != ? LIMIT 1"
        ).get(businessId, nextBarcode, item.variantId);
        if (collision || requestBarcodes.has(nextBarcode)) throw new Error(`Barcode collision: ${nextBarcode}`);
        requestBarcodes.add(nextBarcode);
      }

      const skuState = getLocalSkuSaveState(variant, nextSku);
      const barcodeState = !nextBarcode ? "MISSING"
        : variant.shopify_variant_id && nextBarcode === variant.shopify_barcode ? "SHOPIFY_UPDATED" : "SAVED_LOCAL";
      db.run(`
        UPDATE product_variants SET sku = ?, barcode = ?, sku_sync_state = ?,
          barcode_sync_state = ?, updated_at = datetime('now')
        WHERE id = ? AND business_id = ?
      `, [nextSku, nextBarcode, skuState, barcodeState, item.variantId, businessId]);
      results.push({
        variantId: item.variantId,
        previousSku: variant.sku,
        previousBarcode: variant.barcode,
        sku: nextSku,
        barcode: nextBarcode,
      });
    }
    if (options.settings) saveIdentitySettings(db, businessId, options.settings);
    return results;
  });
  return transaction();
}

export function resolveScan(db, businessId, value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return { status: "not_found", matches: [] };
  const select = `
        SELECT v.id, v.sku, v.barcode, v.variant_value, v.stock_count,
          v.shopify_sku, v.shopify_variant_id, v.sku_sync_state,
          v.shopify_inventory_item_id, v.inventory_tracked,
          p.id AS product_id, p.name AS product_name, p.bin_location,
           ib.barcode_value AS internal_barcode
    FROM product_variants v
    JOIN products p ON p.id = v.product_id AND p.business_id = v.business_id
    LEFT JOIN generated_internal_barcodes ib
      ON ib.variant_id = v.id AND ib.business_id = v.business_id
    WHERE v.business_id = ? AND v.is_active = 1`;
  let matches = db.query(`${select} AND (v.barcode = ? OR ib.barcode_value = ?) ORDER BY v.id`).all(
    businessId, normalized, normalized
  );
  let matchedBy = "barcode";
  if (matches.length === 0) {
    matches = db.query(`${select} AND v.sku = ? ORDER BY v.id`).all(businessId, normalized);
    matchedBy = "sku";
  }
  if (matches.length === 0) return { status: "not_found", matchedBy: null, matches: [] };
  const withInventory = matches.map((match) => {
    const inventory = getVariantInventory(db, businessId, match.id);
    const locations = match.shopify_inventory_item_id
      ? db.query(`
          SELECT l.name, l.shopify_location_id, il.available
          FROM shopify_inventory_levels il
          JOIN shopify_locations l
            ON l.business_id = il.business_id
            AND l.shopify_location_id = il.shopify_location_id
          WHERE il.business_id = ? AND il.shopify_inventory_item_id = ?
          ORDER BY l.name COLLATE NOCASE, l.shopify_location_id
        `).all(businessId, match.shopify_inventory_item_id)
      : [];
    return withSkuTruth({
      ...match,
      stock_count: inventory?.available ?? null,
      inventory_tracked: inventory?.available !== null,
      locations,
    });
  });
  if (withInventory.length > 1) return { status: "ambiguous", matchedBy, matches: withInventory };
  return { status: "found", matchedBy, match: withInventory[0], matches: withInventory };
}