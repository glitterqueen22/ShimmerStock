export function normalizeSku(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function projectSkuTruth(row) {
  const localSku = normalizeSku(row.sku);
  const shopifySku = normalizeSku(row.shopify_sku);
  const linkedToShopify = Boolean(row.shopify_variant_id);
  const mismatch = linkedToShopify && localSku !== shopifySku;
  const status = mismatch && !["SHOPIFY_UPDATE_IN_PROGRESS", "SHOPIFY_UPDATE_FAILED"].includes(row.sku_sync_state)
    ? "SHOPIFY_MISMATCH"
    : row.sku_sync_state || (!localSku ? "MISSING" : linkedToShopify ? "IMPORTED" : "SAVED_LOCAL");
  const source = !localSku ? "missing"
    : status === "IMPORTED" ? "shopify"
    : status === "SHOPIFY_UPDATED" ? "verified_shopify"
    : "shimmerstock";
  return {
    localSku,
    shopifySku,
    effectiveSku: localSku,
    source,
    status,
    mismatch,
    needsReview: mismatch || ["SHOPIFY_UPDATE_FAILED", "REVIEW_REQUIRED"].includes(status),
  };
}

export function withSkuTruth(row) {
  const skuTruth = projectSkuTruth(row);
  return { ...row, sku: skuTruth.effectiveSku, sku_sync_state: skuTruth.status, skuTruth };
}

export function getLocalSkuSaveState(existing, nextValue) {
  const localSku = normalizeSku(nextValue);
  const shopifySku = normalizeSku(existing?.shopify_sku);
  if (!localSku) return "MISSING";
  if (existing?.sku_sync_state === "SHOPIFY_UPDATED" && localSku === shopifySku) return "SHOPIFY_UPDATED";
  if (existing?.shopify_variant_id && localSku === shopifySku) return "IMPORTED";
  return "SAVED_LOCAL";
}

export function listVariantSkuTruth(db, businessId) {
  return db.query(`
    SELECT v.id, v.product_id, v.business_id, v.sku, v.shopify_sku,
      v.shopify_variant_id, v.sku_sync_state, v.variant_value,
      p.name AS product_name
    FROM product_variants v
    JOIN products p ON p.id = v.product_id AND p.business_id = v.business_id
    WHERE v.business_id = ? AND v.is_active = 1
    ORDER BY p.name COLLATE NOCASE, v.variant_value COLLATE NOCASE, v.id
  `).all(businessId).map(withSkuTruth);
}

export function reconcileImportedSku(existing, importedValue) {
  const importedSku = normalizeSku(importedValue);
  const current = projectSkuTruth(existing);
  const previousShopifySku = normalizeSku(existing.shopify_sku);
  const locallyDiverged = current.localSku !== previousShopifySku;
  const followsShopify = !locallyDiverged && ["MISSING", "IMPORTED"].includes(existing.sku_sync_state);

  if (followsShopify) {
    return {
      localSku: importedSku,
      shopifySku: importedSku,
      status: importedSku ? "IMPORTED" : "MISSING",
    };
  }

  if (current.localSku === importedSku) {
    return {
      localSku: current.localSku,
      shopifySku: importedSku,
      status: existing.sku_sync_state === "SHOPIFY_UPDATED" ? "SHOPIFY_UPDATED" : "SAVED_LOCAL",
    };
  }

  return {
    localSku: current.localSku,
    shopifySku: importedSku,
    status: "SHOPIFY_MISMATCH",
  };
}

export function getVariantSkuTruth(db, businessId, variantId) {
  const row = db.query(`
    SELECT id, business_id, sku, shopify_sku, shopify_variant_id, sku_sync_state
    FROM product_variants WHERE id = ? AND business_id = ?
  `).get(variantId, businessId);
  return row ? projectSkuTruth(row) : null;
}