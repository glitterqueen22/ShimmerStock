import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import {
  analyzeCatalog,
  getOrCreateInternalBarcode,
  prepareQuickSetup,
  renderSku,
} from "../server/sku-label-studio.js";

interface StudioItem {
  id: number;
  proposedSku?: string | null;
  shopify_variant_id?: string | null;
  status?: string;
  barcode?: string | null;
}

function testDb() {
  const db = new Database(":memory:");
  db.run("CREATE TABLE businesses (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
  db.run("CREATE TABLE products (id INTEGER PRIMARY KEY, business_id INTEGER NOT NULL, name TEXT NOT NULL, shopify_product_id TEXT)");
  db.run(`CREATE TABLE product_variants (
    id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, business_id INTEGER NOT NULL,
    sku TEXT, barcode TEXT, shopify_sku TEXT, shopify_barcode TEXT,
    shopify_variant_id TEXT, shopify_inventory_item_id TEXT,
    variant_type TEXT, variant_value TEXT, price REAL, stock_count INTEGER,
    is_active INTEGER DEFAULT 1
  )`);
  db.run(`CREATE TABLE generated_internal_barcodes (
    id INTEGER PRIMARY KEY, business_id INTEGER NOT NULL, variant_id INTEGER NOT NULL,
    barcode_value TEXT NOT NULL, UNIQUE(business_id, variant_id), UNIQUE(business_id, barcode_value)
  )`);
  db.run(`CREATE TABLE product_identity_settings (
    business_id INTEGER PRIMARY KEY, sku_pattern TEXT, sku_separator TEXT, sku_case TEXT,
    number_start INTEGER, number_padding INTEGER, preserve_existing INTEGER,
    writeback_enabled INTEGER, preferred_label_size TEXT, label_fields TEXT
  )`);
  db.run("INSERT INTO businesses VALUES (1, 'Glitter House'), (2, 'Second Shop')");
  db.run("INSERT INTO products VALUES (10, 1, 'Chunky Glitter', 'gid://shopify/Product/10'), (20, 2, 'Chunky Glitter', 'gid://shopify/Product/10')");
  db.run(`INSERT INTO product_variants VALUES
    (101, 10, 1, NULL, NULL, NULL, NULL, 'gid://shopify/ProductVariant/101', 'gid://shopify/InventoryItem/101', 'Color', 'Pink 2oz', 9.99, 14, 1),
    (102, 10, 1, 'GLIT-BLUE-001', '012345678905', 'GLIT-BLUE-001', '012345678905', 'gid://shopify/ProductVariant/102', 'gid://shopify/InventoryItem/102', 'Color', 'Blue 2oz', 9.99, 8, 1),
    (103, 10, 1, 'DUP', 'LEGACY', 'DUP', 'LEGACY', 'gid://shopify/ProductVariant/103', 'gid://shopify/InventoryItem/103', 'Color', 'Gold', 9.99, 2, 1),
    (104, 10, 1, 'DUP', 'LEGACY', 'DUP', 'LEGACY', 'gid://shopify/ProductVariant/104', 'gid://shopify/InventoryItem/104', 'Color', 'Silver', 9.99, 3, 1),
    (201, 20, 2, NULL, NULL, NULL, NULL, 'gid://shopify/ProductVariant/101', 'gid://shopify/InventoryItem/201', 'Color', 'Pink 2oz', 9.99, 99, 1)
  `);
  return db;
}

describe("Novi SKU generation", () => {
  it("normalizes custom patterns and uses deterministic numbering", () => {
    expect(renderSku("{PRODUCT}_{COLOR}_{NUMBER}", {
      product: "Glittér Mix!", color: "Hot Pink / 2oz",
    }, 7, { separator: "_", numberPadding: 3 })).toBe("GLITTER_MIX_HOT_PINK_2OZ_007");
  });

  it("generates only missing SKUs and preserves imported identity and existing values", () => {
    const db = testDb();
    const first = prepareQuickSetup(db, 1, { skuPattern: "GLIT-{COLOR}-{NUMBER}" });
    const second = prepareQuickSetup(db, 1, { skuPattern: "GLIT-{COLOR}-{NUMBER}" });
    const firstItems = first.items as StudioItem[];
    const secondItems = second.items as StudioItem[];
    const generated = firstItems.find(item => item.id === 101)!;
    expect(generated.proposedSku).toBe("GLIT-PINK-2OZ-001");
    expect(secondItems.find(item => item.id === 101)?.proposedSku).toBe(generated.proposedSku);
    expect(generated.shopify_variant_id).toBe("gid://shopify/ProductVariant/101");
    expect(firstItems.find(item => item.id === 102)?.proposedSku).toBe("GLIT-BLUE-001");
    expect(firstItems.find(item => item.id === 103)?.status).toBe("needs_review");
    expect(firstItems.find(item => item.id === 104)?.status).toBe("needs_review");
  });

  it("allows equivalent generated values in different businesses without leaking rows", () => {
    const db = testDb();
    const businessA = prepareQuickSetup(db, 1, { skuPattern: "{COLOR}-{NUMBER}" });
    const businessB = prepareQuickSetup(db, 2, { skuPattern: "{COLOR}-{NUMBER}" });
    expect((businessA.items as StudioItem[]).some(item => item.id === 201)).toBe(false);
    expect(businessB.items).toHaveLength(1);
    expect(businessB.items[0].proposedSku).toBe("PINK-2OZ-001");
  });
});

describe("Novi catalog audit and internal barcodes", () => {
  it("preserves good retail identifiers and flags ambiguous legacy duplicates", () => {
    const audit = analyzeCatalog(testDb(), 1);
    expect(audit.total).toBe(4);
    expect(audit.missingSkus).toBe(1);
    expect(audit.missingBarcodes).toBe(1);
    expect(audit.duplicateSkus).toBe(2);
    expect(audit.duplicateBarcodes).toBe(2);
    expect((audit.items as StudioItem[]).find(item => item.id === 102)?.barcode).toBe("012345678905");
  });

  it("creates a stable tenant-safe Code 128 value tied to variant identity", () => {
    const db = testDb();
    const first = getOrCreateInternalBarcode(db, 1, 101);
    const second = getOrCreateInternalBarcode(db, 1, 101);
    const otherTenant = getOrCreateInternalBarcode(db, 2, 201);
    expect(first).toBe(second);
    expect(first).toMatch(/^SS[A-Z0-9]+$/);
    expect(otherTenant).not.toBe(first);
    expect(() => getOrCreateInternalBarcode(db, 2, 101)).toThrow("Variant not found");
  });

  it("preserves local identifiers while refreshing Shopify source values", async () => {
    const { upsertVariant } = await import("../server/shopify-import.js");
    const db = testDb();
    db.run("ALTER TABLE product_variants ADD COLUMN updated_at TEXT");
    db.run("UPDATE product_variants SET sku = 'LOCAL-SKU', barcode = 'LOCAL-BAR', shopify_sku = 'OLD-SHOP', shopify_barcode = 'OLD-BAR', shopify_variant_id = '102' WHERE id = 102");
    upsertVariant(db, 1, 10, {
      id: "gid://shopify/ProductVariant/102",
      sku: "NEW-SHOP",
      barcode: "NEW-BAR",
      title: "Blue 2oz",
      inventoryItem: { id: "gid://shopify/InventoryItem/102" },
      inventoryQuantity: 8,
    });
    const row = db.query("SELECT sku, barcode, shopify_sku, shopify_barcode FROM product_variants WHERE id = 102").get();
    expect(row).toEqual({ sku: "LOCAL-SKU", barcode: "LOCAL-BAR", shopify_sku: "NEW-SHOP", shopify_barcode: "NEW-BAR" });
  });
});