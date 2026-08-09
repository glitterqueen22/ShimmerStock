import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { initDb } from "../server/db.js";
import {
  getVariantInventory,
  listProductInventory,
  projectShopifyInventory,
} from "../server/inventory-truth.js";
import * as store from "../server/store.js";
import { getHQSummary } from "../server/hq.js";

describe("canonical inventory truth", () => {
  let db: Database;
  let businessId: number;
  let otherBusinessId: number;
  let productId: number;
  let variantId: number;

  beforeEach(() => {
    process.env.OWNER_INITIAL_PASSWORD = "inventory-test-owner-password";
    process.env.ADMIN_INITIAL_PASSWORD = "inventory-test-admin-password";
    db = initDb(":memory:");
    businessId = Number((db.query("SELECT id FROM businesses LIMIT 1").get() as { id: number }).id);
    otherBusinessId = Number(db.run("INSERT INTO businesses (name, slug) VALUES ('Other', 'other')").lastInsertRowid);
    productId = Number(db.run(
      "INSERT INTO products (name, sku, stock_count, business_id, shopify_product_id) VALUES ('Product', 'PRODUCT', 0, ?, '100')",
      [businessId],
    ).lastInsertRowid);
    variantId = Number(db.run(`
      INSERT INTO product_variants
        (product_id, business_id, sku, variant_type, variant_value, stock_count,
         shopify_variant_id, shopify_inventory_item_id, inventory_tracked)
      VALUES (?, ?, 'PRODUCT-A', 'shopify', 'A', 0, '200', '300', 1)
    `, [productId, businessId]).lastInsertRowid);
  });

  afterEach(() => db.close());

  it("aggregates positive multi-location inventory into variant and product truth", () => {
    db.run(`INSERT INTO shopify_inventory_levels
      (business_id, shopify_inventory_item_id, shopify_location_id, available)
      VALUES (?, '300', '400', 7), (?, '300', '401', 5), (?, '300', '400', 99)`,
    [businessId, businessId, otherBusinessId]);

    projectShopifyInventory(db, businessId);

    expect((getVariantInventory(db, businessId, variantId) as { available: number }).available).toBe(12);
    expect((listProductInventory(db, businessId)[0] as { available: number }).available).toBe(12);
    expect((db.query("SELECT stock_count FROM product_variants WHERE id = ?").get(variantId) as { stock_count: number }).stock_count).toBe(12);
    expect((db.query("SELECT stock_count FROM products WHERE id = ?").get(productId) as { stock_count: number }).stock_count).toBe(12);
  });

  it("aggregates multiple variants and reports the same truth to Products and HQ", () => {
    const secondVariantId = Number(db.run(`
      INSERT INTO product_variants
        (product_id, business_id, sku, variant_type, variant_value, stock_count,
         shopify_variant_id, shopify_inventory_item_id, inventory_tracked)
      VALUES (?, ?, 'PRODUCT-B', 'shopify', 'B', 0, '201', '301', 1)
    `, [productId, businessId]).lastInsertRowid);
    db.run(`INSERT INTO shopify_inventory_levels
      (business_id, shopify_inventory_item_id, shopify_location_id, available)
      VALUES (?, '300', '400', 4), (?, '301', '400', 0)`, [businessId, businessId]);

    projectShopifyInventory(db, businessId);

    expect((getVariantInventory(db, businessId, secondVariantId) as { available: number }).available).toBe(0);
    expect((store.listProducts(db, businessId)[0] as { stock_count: number }).stock_count).toBe(4);
    const lowStock = getHQSummary(db, businessId).needsAttention.lowStock as Array<{ id: number; stock_count: number }>;
    expect(lowStock).toContainEqual(expect.objectContaining({ id: productId, stock_count: 4 }));
  });

  it("does not describe untracked Shopify inventory as zero or low stock", () => {
    db.run("UPDATE product_variants SET inventory_tracked = 0, stock_count = 0 WHERE id = ?", [variantId]);

    const product = store.listProducts(db, businessId)[0] as { stock_count: number | null; inventory_tracked: boolean };
    expect(product.stock_count).toBeNull();
    expect(product.inventory_tracked).toBe(false);
    expect(store.getLowStockProducts(db, businessId)).toHaveLength(0);
  });

  it("builds tenant-scoped Novi exceptions with operational action links", () => {
    db.run("UPDATE product_variants SET sku_sync_state = 'MISSING', barcode_sync_state = 'REVIEW_REQUIRED' WHERE id = ?", [variantId]);
    db.run(
      "INSERT INTO orders (order_number, customer_name, source, status, business_id, created_at) VALUES (1001, 'Waiting Customer', 'manual', 'pending', ?, datetime('now', '-3 hours'))",
      [businessId],
    );
    const otherProductId = Number(db.run(
      "INSERT INTO products (name, sku, stock_count, business_id) VALUES ('Other Product', 'OTHER', 0, ?)",
      [otherBusinessId],
    ).lastInsertRowid);
    db.run(`
      INSERT INTO product_variants
        (product_id, business_id, sku, variant_type, variant_value, stock_count, sku_sync_state, barcode_sync_state)
      VALUES (?, ?, 'OTHER-A', 'option', 'A', 0, 'SHOPIFY_UPDATE_FAILED', 'SHOPIFY_UPDATE_FAILED')
    `, [otherProductId, otherBusinessId]);
    db.run(
      "INSERT INTO orders (order_number, customer_name, source, status, business_id) VALUES (2001, 'Other Customer', 'manual', 'confirmed', ?)",
      [otherBusinessId],
    );
    db.run(
      "INSERT INTO novi_business_preferences (business_id, preferred_workflow, production_priority) VALUES (?, 'orders_first', 'shortages_first'), (?, 'production_first', 'best_sellers_first')",
      [businessId, otherBusinessId],
    );

    const summary = getHQSummary(db, businessId);
    const commandCenter = summary.commandCenter as {
      brief: { oldestCustomerWaitHours: number; readyToPack: number };
      exceptions: Array<{ key: string; link: string }>;
      missions: Array<{ id: string; link: string }>;
      preferences: { preferred_workflow: string; production_priority: string };
    };

    expect(commandCenter.brief.oldestCustomerWaitHours).toBeGreaterThanOrEqual(2);
    expect(commandCenter.brief.readyToPack).toBe(0);
    expect(commandCenter.exceptions.map((exception) => exception.key)).toContain("identifiers");
    expect(commandCenter.exceptions.map((exception) => exception.key)).toContain("customer");
    expect(commandCenter.exceptions.map((exception) => exception.key)).not.toContain("packing");
    expect(commandCenter.exceptions.every((exception) => exception.link.startsWith("/"))).toBe(true);
    expect(commandCenter.missions).toHaveLength(6);
    expect(commandCenter.missions.every((mission) => mission.link.startsWith("/"))).toBe(true);
    expect(commandCenter.preferences.preferred_workflow).toBe("orders_first");
    expect(commandCenter.preferences.production_priority).toBe("shortages_first");
  });
});