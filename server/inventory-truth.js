import { projectSkuTruth } from "./sku-truth.js";

function variantInventoryQuery(whereClause) {
  return `
    SELECT v.id, v.product_id, v.business_id, v.shopify_inventory_item_id,
      v.inventory_tracked,
      CASE
        WHEN v.shopify_inventory_item_id IS NULL THEN v.stock_count
        WHEN v.inventory_tracked = 0 THEN NULL
        ELSE COALESCE(SUM(il.available), 0)
      END AS available
    FROM product_variants v
    LEFT JOIN shopify_inventory_levels il
      ON il.business_id = v.business_id
      AND il.shopify_inventory_item_id = v.shopify_inventory_item_id
    WHERE ${whereClause}
    GROUP BY v.id
  `;
}

export function listVariantInventory(db, businessId) {
  return db.query(variantInventoryQuery("v.business_id = ? AND v.is_active = 1")).all(businessId);
}

export function getVariantInventory(db, businessId, variantId) {
  return db.query(variantInventoryQuery("v.business_id = ? AND v.id = ? AND v.is_active = 1")).get(businessId, variantId);
}

export function listProductInventory(db, businessId) {
  return db.query(`
    WITH variant_inventory AS (${variantInventoryQuery("v.business_id = ? AND v.is_active = 1")})
    SELECT p.id, p.business_id,
      CASE
        WHEN COUNT(vi.id) = 0 THEN p.stock_count
        WHEN SUM(CASE WHEN vi.available IS NOT NULL THEN 1 ELSE 0 END) = 0 THEN NULL
        ELSE SUM(COALESCE(vi.available, 0))
      END AS available
    FROM products p
    LEFT JOIN variant_inventory vi ON vi.product_id = p.id AND vi.business_id = p.business_id
    WHERE p.business_id = ?
    GROUP BY p.id
    ORDER BY p.name COLLATE NOCASE, p.id
  `).all(businessId, businessId);
}

export function listProductsWithInventory(db, businessId) {
  const inventory = new Map(listProductInventory(db, businessId).map(row => [row.id, row.available]));
  const variantsByProduct = new Map();
  const variants = db.query(`
    SELECT v.id, v.product_id, v.sku, v.shopify_sku, v.shopify_variant_id, v.sku_sync_state,
      v.barcode, ib.barcode_value AS internal_barcode
    FROM product_variants v
    LEFT JOIN generated_internal_barcodes ib
      ON ib.business_id = v.business_id AND ib.variant_id = v.id
    WHERE v.business_id = ? AND v.is_active = 1
    ORDER BY v.id
  `).all(businessId);
  for (const variant of variants) {
    const productVariants = variantsByProduct.get(variant.product_id) || [];
    productVariants.push(variant);
    variantsByProduct.set(variant.product_id, productVariants);
  }

  return db.query(
    "SELECT id, name, sku, barcode, stock_count, shopify_product_id FROM products WHERE business_id = ? ORDER BY name ASC"
  ).all(businessId).map(product => {
    const productVariants = variantsByProduct.get(product.id) || [];
    const variantSkus = [...new Set(productVariants
      .map(variant => projectSkuTruth(variant).effectiveSku)
      .filter(Boolean))];
    const retailBarcodes = [...new Set(productVariants.map(variant => String(variant.barcode || "").trim()).filter(Boolean))];
    const internalBarcodes = [...new Set(productVariants.map(variant => variant.internal_barcode).filter(Boolean))];
    const productSku = String(product.sku || "").trim();
    const displaySku = variantSkus.length === 1
      ? variantSkus[0]
      : productVariants.length === 0 && productSku && !productSku.startsWith("SHOPIFY-") ? productSku : null;
    const displayBarcode = retailBarcodes.length === 1
      ? retailBarcodes[0]
      : retailBarcodes.length === 0 && internalBarcodes.length === 1 ? internalBarcodes[0]
        : productVariants.length === 0 ? product.barcode : null;

    return {
      ...product,
      display_sku: displaySku,
      display_barcode: displayBarcode,
      display_barcode_kind: retailBarcodes.length === 1 ? "retail" : internalBarcodes.length === 1 ? "shimmerstock" : null,
      variant_count: productVariants.length,
      sku_count: variantSkus.length,
      stock_count: inventory.has(product.id) ? inventory.get(product.id) : product.stock_count,
      inventory_tracked: !inventory.has(product.id) || inventory.get(product.id) !== null,
    };
  });
}

export function getProductWithInventory(db, businessId, productId) {
  const normalizedProductId = Number(productId);
  return listProductsWithInventory(db, businessId).find(product => product.id === normalizedProductId) ?? null;
}

export function getLowStockProducts(db, businessId, threshold = 5) {
  return listProductsWithInventory(db, businessId)
    .filter(product => product.inventory_tracked && product.stock_count <= threshold)
    .sort((left, right) => left.stock_count - right.stock_count);
}

export function projectShopifyInventory(db, businessId) {
  const variants = listVariantInventory(db, businessId);
  const updateVariant = db.query(
    "UPDATE product_variants SET stock_count = ?, updated_at = datetime('now') WHERE id = ? AND business_id = ?"
  );
  for (const variant of variants) {
    if (variant.shopify_inventory_item_id && variant.available !== null) {
      updateVariant.run(variant.available, variant.id, businessId);
    }
  }

  const products = listProductInventory(db, businessId);
  const updateProduct = db.query(
    "UPDATE products SET stock_count = ?, updated_at = datetime('now') WHERE id = ? AND business_id = ?"
  );
  for (const product of products) {
    if (product.available !== null) updateProduct.run(product.available, product.id, businessId);
  }

  return { variants, products };
}