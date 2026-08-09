import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initDb } from "../server/db.js";
import { getHQSummary } from "../server/hq.js";
import { upsertVariant } from "../server/shopify-import.js";
import { getVariantSkuTruth } from "../server/sku-truth.js";
import { analyzeCatalog, listCatalogVariants, resolveScan, saveLocalIdentifiers } from "../server/sku-label-studio.js";
import { bulkProductImport, createVariant, getVariant, updateVariant } from "../server/variant-store.js";

function shopifyVariant(id: string, sku: string | null, title = "Default") {
  return {
    id: `gid://shopify/ProductVariant/${id}`,
    sku,
    barcode: null,
    title,
    inventoryItem: { id: `gid://shopify/InventoryItem/${id}`, tracked: true },
    inventoryQuantity: 0,
  };
}

describe("canonical SKU truth", () => {
  let db: Database;
  let businessId: number;
  let otherBusinessId: number;
  let productId: number;

  beforeEach(() => {
    process.env.OWNER_INITIAL_PASSWORD = "sku-truth-owner-password";
    process.env.ADMIN_INITIAL_PASSWORD = "sku-truth-admin-password";
    db = initDb(":memory:");
    businessId = Number((db.query("SELECT id FROM businesses LIMIT 1").get() as { id: number }).id);
    otherBusinessId = Number(db.run("INSERT INTO businesses (name, slug) VALUES ('Other SKU Business', 'other-sku-business')").lastInsertRowid);
    productId = Number(db.run(
      "INSERT INTO products (name, sku, stock_count, business_id, shopify_product_id) VALUES ('SKU Product', 'SHOPIFY-PRODUCT-500', 0, ?, '500')",
      [businessId],
    ).lastInsertRowid);
  });

  afterEach(() => db.close());

  it("faithfully imports null, blank, and duplicate Shopify SKUs by variant identity", () => {
    upsertVariant(db, businessId, productId, shopifyVariant("501", null, "Null"));
    upsertVariant(db, businessId, productId, shopifyVariant("502", "", "Blank"));
    upsertVariant(db, businessId, productId, shopifyVariant("503", "DUPLICATE", "First duplicate"));
    upsertVariant(db, businessId, productId, shopifyVariant("504", "DUPLICATE", "Second duplicate"));
    upsertVariant(db, businessId, productId, shopifyVariant("505", "   ", "Whitespace"));

    const rows = db.query(`
      SELECT shopify_variant_id, sku, shopify_sku, sku_sync_state
      FROM product_variants WHERE business_id = ? AND product_id = ? ORDER BY shopify_variant_id
    `).all(businessId, productId) as Array<Record<string, unknown>>;

    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ shopify_variant_id: "501", sku: null, shopify_sku: null, sku_sync_state: "MISSING" });
    expect(rows[1]).toMatchObject({ shopify_variant_id: "502", sku: "", shopify_sku: "", sku_sync_state: "MISSING" });
    expect(rows[2]).toMatchObject({ shopify_variant_id: "503", sku: "DUPLICATE", sku_sync_state: "IMPORTED" });
    expect(rows[3]).toMatchObject({ shopify_variant_id: "504", sku: "DUPLICATE", sku_sync_state: "IMPORTED" });
    expect(rows[4]).toMatchObject({ shopify_variant_id: "505", sku: "   ", shopify_sku: "   ", sku_sync_state: "MISSING" });
    expect(new Set(rows.map(row => row.shopify_variant_id)).size).toBe(5);
  });

  it("preserves an approved local SKU on read-only rerun and exposes one mismatch everywhere", () => {
    const variantId = upsertVariant(db, businessId, productId, shopifyVariant("510", null, "Pink"));
    saveLocalIdentifiers(db, businessId, [{ variantId, sku: "NOVI-PINK-001" }]);

    upsertVariant(db, businessId, productId, shopifyVariant("510", null, "Pink"));
    upsertVariant(db, businessId, productId, shopifyVariant("510", "SHOPIFY-OLD", "Pink"));

    const truth = getVariantSkuTruth(db, businessId, variantId);
    expect(truth).toEqual({
      localSku: "NOVI-PINK-001",
      shopifySku: "SHOPIFY-OLD",
      effectiveSku: "NOVI-PINK-001",
      source: "shimmerstock",
      status: "SHOPIFY_MISMATCH",
      mismatch: true,
      needsReview: true,
    });

    const productVariant = getVariant(db, variantId, businessId) as any;
    const studioVariant = listCatalogVariants(db, businessId).find((row: any) => row.id === variantId) as any;
    const scan = resolveScan(db, businessId, "NOVI-PINK-001") as any;
    const dashboard = getHQSummary(db, businessId).needsAttention.identifierExceptions.find((row: any) => row.id === variantId) as any;

    expect(productVariant.sku).toBe("NOVI-PINK-001");
    expect(productVariant.skuTruth).toEqual(truth);
    expect(studioVariant.skuTruth).toEqual(truth);
    expect(scan.match.sku).toBe("NOVI-PINK-001");
    expect(scan.match.skuTruth).toEqual(truth);
    expect(dashboard.sku).toBe("NOVI-PINK-001");
    expect(dashboard.skuTruth).toEqual(truth);
    expect(analyzeCatalog(db, businessId).items.find((row: any) => row.id === variantId)?.needsReview).toBe(true);
    expect(db.query("SELECT COUNT(*) AS count FROM product_variants WHERE business_id = ? AND shopify_variant_id = '510'").get(businessId)).toEqual({ count: 1 });
  });

  it("adopts external Shopify changes only until local approval creates a conflict boundary", () => {
    const variantId = upsertVariant(db, businessId, productId, shopifyVariant("520", "SHOPIFY-ONE"));
    upsertVariant(db, businessId, productId, shopifyVariant("520", "SHOPIFY-TWO"));
    expect(getVariantSkuTruth(db, businessId, variantId)).toMatchObject({
      effectiveSku: "SHOPIFY-TWO", shopifySku: "SHOPIFY-TWO", source: "shopify", status: "IMPORTED", mismatch: false,
    });

    saveLocalIdentifiers(db, businessId, [{ variantId, sku: "LOCAL-APPROVED", replaceSku: true }]);
    upsertVariant(db, businessId, productId, shopifyVariant("520", "SHOPIFY-EXTERNAL"));
    expect(getVariantSkuTruth(db, businessId, variantId)).toMatchObject({
      effectiveSku: "LOCAL-APPROVED", shopifySku: "SHOPIFY-EXTERNAL", source: "shimmerstock",
      status: "SHOPIFY_MISMATCH", mismatch: true, needsReview: true,
    });
  });

  it("preserves verified SKU authority through later barcode-only saves", () => {
    const variantId = upsertVariant(db, businessId, productId, shopifyVariant("525", "VERIFIED-SKU"));
    db.run("UPDATE product_variants SET sku_sync_state = 'SHOPIFY_UPDATED' WHERE id = ?", [variantId]);

    saveLocalIdentifiers(db, businessId, [{ variantId, barcode: "LOCAL-BARCODE" }]);
    expect(getVariantSkuTruth(db, businessId, variantId)).toMatchObject({
      effectiveSku: "VERIFIED-SKU", status: "SHOPIFY_UPDATED", source: "verified_shopify",
    });

    upsertVariant(db, businessId, productId, shopifyVariant("525", "EXTERNAL-CHANGE"));
    expect(getVariantSkuTruth(db, businessId, variantId)).toMatchObject({
      effectiveSku: "VERIFIED-SKU", shopifySku: "EXTERNAL-CHANGE", status: "SHOPIFY_MISMATCH", mismatch: true,
    });
  });

  it("marks manual variant creates and SKU changes as locally saved", () => {
    const manualId = Number(createVariant(db, {
      productId, businessId, sku: "MANUAL-CREATE", barcode: null,
      variantType: "Size", variantValue: "Large", price: null, cost: null, stockCount: 0, weightOz: null,
    }));
    expect(getVariant(db, manualId, businessId)?.skuTruth).toMatchObject({
      effectiveSku: "MANUAL-CREATE", status: "SAVED_LOCAL", source: "shimmerstock",
    });

    const importedId = upsertVariant(db, businessId, productId, shopifyVariant("526", "SHOPIFY-SKU"));
    updateVariant(db, importedId, businessId, { sku: "MANUAL-CHANGE" });
    expect(getVariant(db, importedId, businessId)?.skuTruth).toMatchObject({
      effectiveSku: "MANUAL-CHANGE", shopifySku: "SHOPIFY-SKU", status: "SHOPIFY_MISMATCH",
      source: "shimmerstock", mismatch: true,
    });
    expect((db.query("SELECT sku_sync_state FROM product_variants WHERE id = ?").get(importedId) as { sku_sync_state: string }).sku_sync_state).toBe("SAVED_LOCAL");

    const bulk = bulkProductImport(db, businessId, [{
      name: "Bulk Product", sku: "BULK-PRODUCT", variants: [
        { sku: "   ", variantType: "Size", variantValue: "Blank" },
        { sku: " BULK-VARIANT ", variantType: "Size", variantValue: "Valid" },
      ],
    }]);
    expect(bulk[0].variants).toHaveLength(1);
    expect(bulk[0].variants[0]).toMatchObject({ sku: "BULK-VARIANT", action: "created" });
    expect(db.query("SELECT sku, sku_sync_state FROM product_variants WHERE id = ?").get(bulk[0].variants[0].variantId)).toEqual({
      sku: "BULK-VARIANT", sku_sync_state: "SAVED_LOCAL",
    });
  });

  it("corrects legacy imported states once without demoting audited writebacks", () => {
    const directory = mkdtempSync(join(tmpdir(), "shimmerstock-sku-upgrade-"));
    const databasePath = join(directory, "upgrade.sqlite");
    let upgradeDb = initDb(databasePath);
    try {
      const upgradeBusinessId = Number((upgradeDb.query("SELECT id FROM businesses LIMIT 1").get() as { id: number }).id);
      const upgradeProductId = Number(upgradeDb.run(
        "INSERT INTO products (name, sku, stock_count, business_id, shopify_product_id) VALUES ('Upgrade Product', 'UPGRADE', 0, ?, '900')",
        [upgradeBusinessId],
      ).lastInsertRowid);
      const importedId = upsertVariant(upgradeDb, upgradeBusinessId, upgradeProductId, shopifyVariant("901", "IMPORTED-OLD"));
      const verifiedId = upsertVariant(upgradeDb, upgradeBusinessId, upgradeProductId, shopifyVariant("902", "VERIFIED-OLD"));
      upgradeDb.run("UPDATE product_variants SET sku_sync_state = 'SHOPIFY_UPDATED' WHERE id IN (?, ?)", [importedId, verifiedId]);
      const userId = Number((upgradeDb.query("SELECT id FROM users WHERE business_id = ? LIMIT 1").get(upgradeBusinessId) as { id: number }).id);
      upgradeDb.run(`INSERT INTO shopify_identifier_writeback_audit
        (business_id, shop, shopify_product_id, shopify_variant_id, previous_sku, requested_sku,
         result, shopify_user_errors, initiated_by)
        VALUES (?, 'upgrade.myshopify.com', 'gid://shopify/Product/900',
          'gid://shopify/ProductVariant/902', 'BEFORE', 'VERIFIED-OLD', 'SHOPIFY_UPDATED', '[]', ?)`,
      [upgradeBusinessId, userId]);
      upgradeDb.run("DELETE FROM schema_migrations WHERE name = '2026-03-sku-imported-state-truth'");
      upgradeDb.close();

      upgradeDb = initDb(databasePath);
      expect(upgradeDb.query("SELECT sku_sync_state FROM product_variants WHERE id = ?").get(importedId)).toEqual({ sku_sync_state: "IMPORTED" });
      expect(upgradeDb.query("SELECT sku_sync_state FROM product_variants WHERE id = ?").get(verifiedId)).toEqual({ sku_sync_state: "SHOPIFY_UPDATED" });
      expect(upgradeDb.query("SELECT COUNT(*) AS count FROM schema_migrations WHERE name = '2026-03-sku-imported-state-truth'").get()).toEqual({ count: 1 });
    } finally {
      try { upgradeDb.close(); } catch {}
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("remains idempotent and tenant-scoped when Shopify variant IDs overlap", () => {
    const otherProductId = Number(db.run(
      "INSERT INTO products (name, sku, stock_count, business_id, shopify_product_id) VALUES ('Other Product', 'OTHER-500', 0, ?, '500')",
      [otherBusinessId],
    ).lastInsertRowid);
    const firstId = upsertVariant(db, businessId, productId, shopifyVariant("530", "FIRST"));
    const rerunId = upsertVariant(db, businessId, productId, shopifyVariant("530", "FIRST"));
    const otherId = upsertVariant(db, otherBusinessId, otherProductId, shopifyVariant("530", "SECOND"));

    expect(rerunId).toBe(firstId);
    expect(otherId).not.toBe(firstId);
    expect(getVariantSkuTruth(db, businessId, firstId)?.effectiveSku).toBe("FIRST");
    expect(getVariantSkuTruth(db, otherBusinessId, otherId)?.effectiveSku).toBe("SECOND");
    expect(getVariantSkuTruth(db, businessId, otherId)).toBeNull();
    expect(db.query("SELECT COUNT(*) AS count FROM product_variants WHERE shopify_variant_id = '530'").get()).toEqual({ count: 2 });
  });
});
