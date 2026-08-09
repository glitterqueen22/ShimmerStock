/**
 * Product Variants — Data Access Layer
 * ====================================
 * All variant database access goes through these functions.
 * Re-exported from store.js for unified imports.
 */

/** List all variants for a product, scoped to business. */
import { getVariantInventory, listVariantInventory } from "./inventory-truth.js";

function withInventory(rows, inventoryRows) {
  const inventory = new Map(inventoryRows.map(row => [row.id, row]));
  return rows.map(row => {
    const truth = inventory.get(row.id);
    return truth ? { ...row, stock_count: truth.available, inventory_tracked: truth.available !== null } : row;
  });
}

export function listVariants(db, productId, businessId) {
  const rows = db
    .query(
      "SELECT id, product_id, business_id, sku, barcode, variant_type, variant_value, price, cost, stock_count, weight_oz, is_active, created_at, updated_at FROM product_variants WHERE product_id = ? AND business_id = ? ORDER BY variant_type, variant_value"
    )
    .all(productId, businessId);
  return withInventory(rows, listVariantInventory(db, businessId));
}

/** Get a single variant by ID, scoped to business. */
export function getVariant(db, variantId, businessId) {
  const row = db
    .query(
      "SELECT id, product_id, business_id, sku, barcode, variant_type, variant_value, price, cost, stock_count, weight_oz, is_active, created_at, updated_at FROM product_variants WHERE id = ? AND business_id = ?"
    )
    .get(variantId, businessId);
  if (!row) return null;
  const truth = getVariantInventory(db, businessId, variantId);
  return truth ? { ...row, stock_count: truth.available, inventory_tracked: truth.available !== null } : row;
}

/** Get a variant by SKU, scoped to business. */
export function getVariantBySku(db, sku, businessId) {
  return db
    .query(
      "SELECT id, product_id, business_id, sku, barcode, variant_type, variant_value, price, cost, stock_count, weight_oz, is_active, created_at, updated_at FROM product_variants WHERE sku = ? AND business_id = ?"
    )
    .get(sku, businessId);
}

/** Create a variant. Returns lastInsertRowid. */
export function createVariant(db, { productId, businessId, sku, barcode, variantType, variantValue, price, cost, stockCount, weightOz }) {
  const result = db.run(
    `INSERT INTO product_variants (product_id, business_id, sku, barcode, variant_type, variant_value, price, cost, stock_count, weight_oz)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [productId, businessId, sku, barcode ?? null, variantType, variantValue, price ?? null, cost ?? null, stockCount ?? 0, weightOz ?? null]
  );
  return result.lastInsertRowid;
}

/** Update a variant's mutable fields, scoped to business. Returns changes count. */
export function updateVariant(db, variantId, businessId, fields) {
  const updates = [];
  const values = [];

  if (fields.sku !== undefined) { updates.push("sku = ?"); values.push(fields.sku); }
  if (fields.barcode !== undefined) { updates.push("barcode = ?"); values.push(fields.barcode ?? null); }
  if (fields.variantType !== undefined) { updates.push("variant_type = ?"); values.push(fields.variantType); }
  if (fields.variantValue !== undefined) { updates.push("variant_value = ?"); values.push(fields.variantValue); }
  if (fields.price !== undefined) { updates.push("price = ?"); values.push(fields.price); }
  if (fields.cost !== undefined) { updates.push("cost = ?"); values.push(fields.cost); }
  if (fields.stockCount !== undefined) { updates.push("stock_count = ?"); values.push(fields.stockCount); }
  if (fields.weightOz !== undefined) { updates.push("weight_oz = ?"); values.push(fields.weightOz); }
  if (fields.isActive !== undefined) { updates.push("is_active = ?"); values.push(fields.isActive ? 1 : 0); }

  if (updates.length === 0) return 0;

  updates.push("updated_at = datetime('now')");
  values.push(variantId, businessId);

  const result = db.run(
    `UPDATE product_variants SET ${updates.join(", ")} WHERE id = ? AND business_id = ?`,
    values
  );
  return result.changes;
}

/** Soft-delete a variant (set is_active=0). Returns changes count. */
export function deleteVariant(db, variantId, businessId) {
  const result = db.run(
    "UPDATE product_variants SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND business_id = ?",
    [variantId, businessId]
  );
  return result.changes;
}

/** Update just the stock_count for a variant, scoped to business. */
export function updateVariantStock(db, variantId, businessId, newStock) {
  db.run(
    "UPDATE product_variants SET stock_count = ?, updated_at = datetime('now') WHERE id = ? AND business_id = ?",
    [newStock, variantId, businessId]
  );
}

/** Bulk import products with nested variants. Returns created product/variant IDs. */
export function bulkProductImport(db, businessId, productsArray) {
  const txnFn = db.transaction((txnDb) => {
    const results = [];

    for (const p of productsArray) {
      if (!p.name || !p.sku) continue;

      // Check if product with this SKU already exists (idempotent)
      const existing = txnDb
        .query("SELECT id FROM products WHERE sku = ? AND business_id = ?")
        .get(p.sku, businessId);

      let productId;
      if (existing) {
        productId = existing.id;
      } else {
        const productResult = txnDb.run(
          "INSERT INTO products (name, sku, barcode, stock_count, business_id) VALUES (?, ?, ?, ?, ?)",
          [p.name.trim(), p.sku.trim(), p.barcode ?? null, 0, businessId]
        );
        productId = productResult.lastInsertRowid;
      }

      const variantResults = [];

      if (p.variants && Array.isArray(p.variants)) {
        for (const v of p.variants) {
          if (!v.sku) continue;

          // Check if variant SKU already exists (idempotent)
          const existingVariant = txnDb
            .query("SELECT id FROM product_variants WHERE sku = ? AND business_id = ?")
            .get(v.sku, businessId);

          if (existingVariant) {
            variantResults.push({ variantId: existingVariant.id, sku: v.sku, action: "skipped" });
            continue;
          }

          const variantResult = txnDb.run(
            `INSERT INTO product_variants (product_id, business_id, sku, barcode, variant_type, variant_value, price, cost, stock_count, weight_oz)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              productId,
              businessId,
              v.sku.trim(),
              v.barcode ?? null,
              v.variantType || "default",
              v.variantValue || "default",
              v.price ?? null,
              v.cost ?? null,
              v.stockCount ?? 0,
              v.weightOz ?? null,
            ]
          );

          variantResults.push({ variantId: variantResult.lastInsertRowid, sku: v.sku, action: "created" });
        }
      }

      results.push({
        productId,
        sku: p.sku,
        name: p.name,
        action: existing ? "skipped" : "created",
        variants: variantResults,
      });
    }

    return results;
  });

  return txnFn(db);
}
