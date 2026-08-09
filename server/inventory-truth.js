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
  return db.query(
    "SELECT id, name, sku, barcode, stock_count, shopify_product_id FROM products WHERE business_id = ? ORDER BY name ASC"
  ).all(businessId).map(product => ({
    ...product,
    stock_count: inventory.has(product.id) ? inventory.get(product.id) : product.stock_count,
    inventory_tracked: !inventory.has(product.id) || inventory.get(product.id) !== null,
  }));
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