import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";

const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.ENCRYPTION_KEY = TEST_KEY;

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

async function writebackDb(scopes = "read_orders,read_products,read_inventory,read_locations,write_products") {
  const { encryptToken } = await import("../server/crypto-utils.js");
  const db = new Database(":memory:");
  db.run(`CREATE TABLE provider_credentials (
    business_id INTEGER, provider TEXT, is_active INTEGER, shop_domain TEXT,
    access_token_encrypted TEXT, scopes TEXT
  )`);
  db.run(`CREATE TABLE product_identity_settings (
    business_id INTEGER PRIMARY KEY, writeback_enabled INTEGER,
    sku_pattern TEXT, sku_separator TEXT, sku_case TEXT, number_start INTEGER,
    number_padding INTEGER, preserve_existing INTEGER, preferred_label_size TEXT,
    label_fields TEXT, updated_at TEXT
  )`);
  db.run("CREATE TABLE products (id INTEGER PRIMARY KEY, business_id INTEGER, name TEXT, shopify_product_id TEXT)");
  db.run(`CREATE TABLE product_variants (
    id INTEGER PRIMARY KEY, product_id INTEGER, business_id INTEGER, sku TEXT, barcode TEXT,
    shopify_sku TEXT, shopify_barcode TEXT, shopify_variant_id TEXT,
    shopify_inventory_item_id TEXT, variant_value TEXT, is_active INTEGER, updated_at TEXT
  )`);
  db.run(`CREATE TABLE shopify_identifier_writeback_previews (
    id TEXT PRIMARY KEY, business_id INTEGER, initiated_by INTEGER, payload TEXT,
    accepted_at TEXT, expires_at TEXT, executed_at TEXT, created_at TEXT
  )`);
  db.run(`CREATE TABLE shopify_identifier_writeback_audit (
    id INTEGER PRIMARY KEY, business_id INTEGER, shop TEXT, shopify_product_id TEXT,
    shopify_variant_id TEXT, previous_sku TEXT, previous_barcode TEXT,
    requested_sku TEXT, requested_barcode TEXT, result TEXT,
    shopify_user_errors TEXT, initiated_by INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE generated_internal_barcodes (
    id INTEGER PRIMARY KEY, business_id INTEGER, variant_id INTEGER, barcode_value TEXT,
    UNIQUE(business_id, variant_id), UNIQUE(business_id, barcode_value)
  )`);
  db.run("INSERT INTO product_identity_settings VALUES (1, 1, '{PRODUCT}-{NUMBER}', '-', 'upper', 1, 3, 1, '2x1', '[]', CURRENT_TIMESTAMP)");
  db.run("ALTER TABLE product_identity_settings ADD COLUMN auto_writeback_enabled INTEGER NOT NULL DEFAULT 0");
  db.run("INSERT INTO products VALUES (10, 1, 'Pink Glitter', '10')");
  db.run(`INSERT INTO product_variants VALUES (
    101, 10, 1, 'LOCAL-OLD', 'LOCAL-BAR', 'SHOP-OLD', 'SHOP-BAR',
    '101', '501', 'Pink 2oz', 1, CURRENT_TIMESTAMP
  )`);
  db.run("ALTER TABLE product_variants ADD COLUMN sku_sync_state TEXT NOT NULL DEFAULT 'SAVED_LOCAL'");
  db.run("ALTER TABLE product_variants ADD COLUMN barcode_sync_state TEXT NOT NULL DEFAULT 'SAVED_LOCAL'");
  db.run("INSERT INTO provider_credentials VALUES (?, 'shopify', 1, 'test.myshopify.com', ?, ?)", [
    1, encryptToken("shpat_writeback_test_token"), scopes,
  ]);
  return db;
}

describe("Shopify SKU/barcode gateway", () => {
  it("keeps arbitrary GraphQL mutations blocked before network", async () => {
    const { gatewayGraphQL } = await import("../server/providers/shopify-gateway.js");
    let calls = 0;
    global.fetch = (async () => { calls++; return new Response("{}"); }) as unknown as typeof fetch;
    await expect(gatewayGraphQL(
      "readonly", "test.myshopify.com", "shpat_fake",
      "mutation { productDelete(input: {id: \"gid://shopify/Product/1\"}) { deletedProductId } }"
    )).rejects.toThrow("read-only");
    expect(calls).toBe(0);
  });

  it("constructs only productVariantsBulkUpdate with API 2026-07 SKU and barcode inputs", async () => {
    const { gatewayProductVariantsBulkUpdate } = await import("../server/providers/shopify-gateway.js");
    let capturedUrl = "";
    let capturedBody: any;
    global.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ data: { productVariantsBulkUpdate: { productVariants: [], userErrors: [] } } }));
    }) as typeof fetch;
    await gatewayProductVariantsBulkUpdate(
      "test.myshopify.com", "shpat_fake", "gid://shopify/Product/10",
      [{ id: "gid://shopify/ProductVariant/101", sku: "NEW-SKU", barcode: "SS00010000002T9" }]
    );
    expect(capturedUrl).toContain("/admin/api/2026-07/graphql.json");
    expect(capturedBody.query).toContain("productVariantsBulkUpdate");
    expect(capturedBody.query).not.toContain("inventoryAdjust");
    expect(capturedBody.variables.variants[0]).toEqual({
      id: "gid://shopify/ProductVariant/101",
      barcode: "SS00010000002T9",
      inventoryItem: { sku: "NEW-SKU" },
    });
  });
});

describe("Shopify identifier writeback authorization", () => {
  it("rejects missing write_products and cross-tenant variants", async () => {
    const { createWritebackPreview } = await import("../server/shopify-identifier-writeback.js");
    const readOnlyDb = await writebackDb("read_orders,read_products,read_inventory,read_locations");
    expect(() => createWritebackPreview(readOnlyDb, 1, 7, [{ variantId: 101 }], true)).toThrow("Product Editing");
    const enabledDb = await writebackDb();
    expect(() => createWritebackPreview(enabledDb, 2, 7, [{ variantId: 101 }], true)).toThrow();
  });

  it("requires accepted preview and exact final confirmation", async () => {
    const { createWritebackPreview, executeWriteback } = await import("../server/shopify-identifier-writeback.js");
    const db = await writebackDb();
    expect(() => createWritebackPreview(db, 1, 7, [{ variantId: 101 }], false)).toThrow("explicitly accepted");
    const preview = createWritebackPreview(db, 1, 7, [{
      variantId: 101, sku: "NEW-SKU", barcode: "NEW-BAR", replaceSku: true, replaceBarcode: true,
    }], true);
    await expect(executeWriteback(db, 1, 7, preview.id, "yes")).rejects.toThrow("Final confirmation");
  });

  it("allows an accepted preview to use auto mode only after business enablement", async () => {
    const { createWritebackPreview, executeWriteback } = await import("../server/shopify-identifier-writeback.js");
    const db = await writebackDb();
    const preview = createWritebackPreview(db, 1, 7, [{
      variantId: 101, sku: "NEW-SKU", barcode: "NEW-BAR", replaceSku: true, replaceBarcode: true,
    }], true);
    await expect(executeWriteback(db, 1, 7, preview.id, "AUTO_APPROVED")).rejects.toThrow("Final confirmation");
    db.run("UPDATE product_identity_settings SET auto_writeback_enabled = 1 WHERE business_id = 1");
    global.fetch = (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const query = String(JSON.parse(String(init?.body)).query || "");
      return new Response(JSON.stringify(query.includes("mutation")
        ? { data: { productVariantsBulkUpdate: { productVariants: [{ id: "gid://shopify/ProductVariant/101" }], userErrors: [] } } }
        : { data: { nodes: [{ id: "gid://shopify/ProductVariant/101", barcode: "NEW-BAR", inventoryItem: { sku: "NEW-SKU" } }] } }));
    }) as unknown as typeof fetch;
    expect(await executeWriteback(db, 1, 7, preview.id, "AUTO_APPROVED")).toMatchObject({ updated: 1, failed: 0 });
  });

  it("writes the approved shape, updates local values, and audits without credentials", async () => {
    const { createWritebackPreview, executeWriteback } = await import("../server/shopify-identifier-writeback.js");
    const db = await writebackDb();
    let calls = 0;
    global.fetch = (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      calls++;
      const query = String(JSON.parse(String(init?.body)).query || "");
      if (query.includes("mutation NoviSkuBarcodeUpdate")) return new Response(JSON.stringify({
        data: { productVariantsBulkUpdate: {
          productVariants: [{ id: "gid://shopify/ProductVariant/101", barcode: "NEW-BAR", inventoryItem: { id: "gid://shopify/InventoryItem/501", sku: "NEW-SKU" } }],
          userErrors: [],
        } },
      }));
      expect(query).toContain("query NoviSkuBarcodeVerify");
      return new Response(JSON.stringify({ data: { nodes: [
        { id: "gid://shopify/ProductVariant/101", barcode: "NEW-BAR", inventoryItem: { id: "gid://shopify/InventoryItem/501", sku: "NEW-SKU" } },
      ] } }));
    }) as unknown as typeof fetch;
    const preview = createWritebackPreview(db, 1, 7, [{
      variantId: 101, sku: "NEW-SKU", barcode: "NEW-BAR", replaceSku: true, replaceBarcode: true,
    }], true);
    const result = await executeWriteback(db, 1, 7, preview.id, "UPDATE SHOPIFY");
    expect(result).toMatchObject({ updated: 1, failed: 0 });
    expect(calls).toBe(2);
    expect(db.query("SELECT sku, barcode, sku_sync_state, barcode_sync_state FROM product_variants WHERE id = 101").get()).toEqual({
      sku: "NEW-SKU", barcode: "NEW-BAR", sku_sync_state: "SHOPIFY_UPDATED", barcode_sync_state: "SHOPIFY_UPDATED",
    });
    const auditText = JSON.stringify(db.query("SELECT * FROM shopify_identifier_writeback_audit").all());
    expect(auditText).not.toContain("shpat_");
    expect(auditText).not.toContain("access_token");
  });

  it("surfaces Shopify user errors while preserving the approved local values", async () => {
    const { createWritebackPreview, executeWriteback } = await import("../server/shopify-identifier-writeback.js");
    const db = await writebackDb();
    global.fetch = (async () => new Response(JSON.stringify({
      data: { productVariantsBulkUpdate: {
        productVariants: [],
        userErrors: [{ field: ["variants", "0", "barcode"], message: "Barcode is invalid", code: "INVALID" }],
      } },
    }))) as unknown as typeof fetch;
    const preview = createWritebackPreview(db, 1, 7, [{
      variantId: 101, sku: "NEW-SKU", barcode: "NEW-BAR", replaceSku: true, replaceBarcode: true,
    }], true);
    const result = await executeWriteback(db, 1, 7, preview.id, "UPDATE SHOPIFY");
    expect(result).toMatchObject({ updated: 0, failed: 1 });
    expect(result.results[0].errors[0].message).toBe("Barcode is invalid");
    expect(db.query("SELECT sku, barcode, sku_sync_state, barcode_sync_state FROM product_variants WHERE id = 101").get()).toEqual({
      sku: "NEW-SKU", barcode: "NEW-BAR", sku_sync_state: "SHOPIFY_UPDATE_FAILED", barcode_sync_state: "SHOPIFY_UPDATE_FAILED",
    });
  });

  it("does not report updated when mutation succeeds but verification differs", async () => {
    const { createWritebackPreview, executeWriteback } = await import("../server/shopify-identifier-writeback.js");
    const db = await writebackDb();
    global.fetch = (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const query = String(JSON.parse(String(init?.body)).query || "");
      if (query.includes("mutation NoviSkuBarcodeUpdate")) return new Response(JSON.stringify({
        data: { productVariantsBulkUpdate: {
          productVariants: [{ id: "gid://shopify/ProductVariant/101" }], userErrors: [],
        } },
      }));
      return new Response(JSON.stringify({ data: { nodes: [
        { id: "gid://shopify/ProductVariant/101", barcode: "SHOP-BAR", inventoryItem: { id: "gid://shopify/InventoryItem/501", sku: "SHOP-OLD" } },
      ] } }));
    }) as unknown as typeof fetch;
    const preview = createWritebackPreview(db, 1, 7, [{
      variantId: 101, sku: "NEW-SKU", barcode: "NEW-BAR", replaceSku: true, replaceBarcode: true,
    }], true);

    const result = await executeWriteback(db, 1, 7, preview.id, "UPDATE SHOPIFY");

    expect(result).toMatchObject({ updated: 0, failed: 1 });
    expect(result.results[0].errors[0].message).toContain("verification did not match");
    expect((db.query("SELECT sku_sync_state FROM product_variants WHERE id = 101").get() as { sku_sync_state: string }).sku_sync_state).toBe("SHOPIFY_UPDATE_FAILED");
    expect((db.query("SELECT result FROM shopify_identifier_writeback_audit").get() as { result: string }).result).toBe("SHOPIFY_UPDATE_FAILED");
  });

  it("reports exact counts when a bulk write verifies only some variants", async () => {
    const { createWritebackPreview, executeWriteback } = await import("../server/shopify-identifier-writeback.js");
    const db = await writebackDb();
    db.run(`INSERT INTO product_variants VALUES (
      102, 10, 1, 'LOCAL-TWO', 'LOCAL-BAR-TWO', 'SHOP-TWO', 'SHOP-BAR-TWO',
      '102', '502', 'Purple 2oz', 1, CURRENT_TIMESTAMP, 'SAVED_LOCAL', 'SAVED_LOCAL'
    )`);
    global.fetch = (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const query = String(JSON.parse(String(init?.body)).query || "");
      if (query.includes("mutation NoviSkuBarcodeUpdate")) return new Response(JSON.stringify({
        data: { productVariantsBulkUpdate: {
          productVariants: [
            { id: "gid://shopify/ProductVariant/101" },
            { id: "gid://shopify/ProductVariant/102" },
          ],
          userErrors: [],
        } },
      }));
      return new Response(JSON.stringify({ data: { nodes: [
        { id: "gid://shopify/ProductVariant/101", barcode: "NEW-BAR", inventoryItem: { sku: "NEW-SKU" } },
        { id: "gid://shopify/ProductVariant/102", barcode: "SHOP-BAR-TWO", inventoryItem: { sku: "SHOP-TWO" } },
      ] } }));
    }) as unknown as typeof fetch;
    const preview = createWritebackPreview(db, 1, 7, [
      { variantId: 101, sku: "NEW-SKU", barcode: "NEW-BAR", replaceSku: true, replaceBarcode: true },
      { variantId: 102, sku: "NEW-TWO", barcode: "NEW-BAR-TWO", replaceSku: true, replaceBarcode: true },
    ], true);

    const result = await executeWriteback(db, 1, 7, preview.id, "UPDATE SHOPIFY");

    expect(result).toMatchObject({ updated: 1, failed: 1, skipped: 0 });
    expect(result.results.map(item => item.result)).toEqual(["SHOPIFY_UPDATED", "SHOPIFY_UPDATE_FAILED"]);
    expect(db.query("SELECT sku_sync_state FROM product_variants WHERE id = 101").get()).toEqual({ sku_sync_state: "SHOPIFY_UPDATED" });
    expect(db.query("SELECT sku_sync_state FROM product_variants WHERE id = 102").get()).toEqual({ sku_sync_state: "SHOPIFY_UPDATE_FAILED" });
    expect(db.query("SELECT COUNT(*) AS count FROM shopify_identifier_writeback_audit").get()).toEqual({ count: 2 });
  });
});