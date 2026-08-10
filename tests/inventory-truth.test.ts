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

  it("never presents a synthetic product key as a merchant SKU", () => {
    db.run("UPDATE products SET sku = 'SHOPIFY-100' WHERE id = ?", [productId]);
    let product = store.listProducts(db, businessId)[0] as {
      sku: string; display_sku: string | null; sku_count: number; variant_count: number;
    };
    expect(product).toMatchObject({
      sku: "SHOPIFY-100", display_sku: "PRODUCT-A", sku_count: 1, variant_count: 1,
    });

    db.run(`
      INSERT INTO product_variants
        (product_id, business_id, sku, variant_type, variant_value, stock_count, sku_sync_state)
      VALUES (?, ?, 'PRODUCT-B', 'option', 'B', 0, 'SAVED_LOCAL')
    `, [productId, businessId]);
    product = store.listProducts(db, businessId)[0] as typeof product;
    expect(product).toMatchObject({ display_sku: null, sku_count: 2, variant_count: 2 });
  });

  it("does not describe untracked Shopify inventory as zero or low stock", () => {
    db.run("UPDATE product_variants SET inventory_tracked = 0, stock_count = 0 WHERE id = ?", [variantId]);

    const product = store.listProducts(db, businessId)[0] as { stock_count: number | null; inventory_tracked: boolean };
    expect(product.stock_count).toBeNull();
    expect(product.inventory_tracked).toBe(false);
    expect(store.getLowStockProducts(db, businessId)).toHaveLength(0);
    const summary = getHQSummary(db, businessId);
    expect(summary.catalogHealth).toMatchObject({ inventoryKnown: 0, inventoryUnknown: 1, outOfStock: 0, lowStock: 0 });
    expect(summary.commandCenter.exceptions).toContainEqual(expect.objectContaining({
      key: "inventory-unknown", count: 1, link: "/products",
    }));
  });

  it("uses tenant-scoped canonical inventory for reorder recommendations", () => {
    db.run(
      "INSERT INTO inventory_thresholds (business_id, product_id, reorder_point, reorder_quantity) VALUES (?, ?, 5, 10)",
      [businessId, productId],
    );
    db.run(
      "INSERT INTO shopify_inventory_levels (business_id, shopify_inventory_item_id, shopify_location_id, available) VALUES (?, '300', '400', 12)",
      [businessId],
    );
    const otherProductId = Number(db.run(
      "INSERT INTO products (name, sku, stock_count, business_id) VALUES ('Other Product', 'OTHER', 0, ?)",
      [otherBusinessId],
    ).lastInsertRowid);
    db.run(
      "INSERT INTO inventory_thresholds (business_id, product_id, reorder_point, reorder_quantity) VALUES (?, ?, 5, 10)",
      [otherBusinessId, otherProductId],
    );

    expect(store.getReorderRecommendations(db, businessId)).toHaveLength(0);

    db.run("UPDATE product_variants SET inventory_tracked = 0 WHERE id = ?", [variantId]);
    expect(store.getReorderRecommendations(db, businessId)).toHaveLength(0);
  });

  it("resolves stale detector opportunities without reactivating user decisions", () => {
    const staleId = Number(store.createOpportunity(db, {
      businessId,
      source: "opportunity-center",
      sourceEventType: "reorder",
      engine: "purchasing",
      title: "Reorder Product",
      impact: "high",
    }));
    store.createOpportunity(db, {
      businessId: otherBusinessId,
      source: "opportunity-center",
      sourceEventType: "reorder",
      engine: "purchasing",
      title: "Reorder Other Product",
      impact: "high",
    });

    expect(store.reconcileDetectorOpportunities(db, businessId, "opportunity-center", [])).toBe(1);
    expect(store.getOpportunity(db, staleId)).toMatchObject({ status: "completed", completed_by: null });
    expect(store.getOpportunitySummary(db, otherBusinessId).active).toBe(1);

    store.upsertOpportunity(db, {
      businessId,
      source: "opportunity-center",
      sourceEventType: "reorder",
      engine: "purchasing",
      title: "Reorder Product",
      impact: "high",
    });
    expect(store.getOpportunity(db, staleId)).toMatchObject({ status: "completed" });
  });

  it("separates raw Novi volume from grouped owner decisions", () => {
    for (const title of ["Low Stock: A", "Low Stock: B", "Out of Stock: C"]) {
      store.createOpportunity(db, {
        businessId,
        source: "novi",
        sourceEventType: title.startsWith("Low") ? "low_inventory" : "out_of_stock",
        engine: "inventory",
        title,
        impact: "high",
        actionLink: "/purchasing",
      });
    }
    store.createOpportunity(db, {
      businessId,
      source: "novi",
      sourceEventType: "missing_skus",
      engine: "inventory",
      title: "Missing SKUs",
      impact: "medium",
      actionLink: "/products?filter=missing-sku",
    });
    for (const title of ["Message A", "Message B", "Message C"]) {
      store.createNoviMessage(db, {
        businessId,
        eventType: "low_inventory",
        title,
        description: title,
        severity: "warning",
      });
    }

    expect(store.getOwnerAttentionSummary(db, businessId)).toMatchObject({
      rawEventCount: 3,
      opportunityCount: 4,
      groupedIssueCount: 3,
      actionableDecisionCount: 2,
    });
    expect(store.getOwnerAttentionSummary(db, otherBusinessId)).toMatchObject({
      rawEventCount: 0,
      opportunityCount: 0,
      groupedIssueCount: 0,
      actionableDecisionCount: 0,
    });
  });

  it("distinguishes disconnected, connected-only, reconciled, and reconciliation-required imports", () => {
    expect(getHQSummary(db, businessId).syncHealth).toMatchObject({
      state: "DISCONNECTED", label: "Not connected", isConnected: false, isReconciled: false, needsReview: false,
    });
    db.run(`INSERT INTO provider_credentials
      (business_id, provider, credentials, is_active, sync_status)
      VALUES (?, 'shopify', '{}', 1, 'connected')`, [businessId]);
    expect(getHQSummary(db, businessId).syncHealth).toMatchObject({
      state: "CONNECTED", label: "Connected — import not started", isConnected: true, isReconciled: false,
    });
    const sessionId = Number(db.run(
      "INSERT INTO shopify_import_sessions (business_id, state) VALUES (?, 'SYNCED')", [businessId],
    ).lastInsertRowid);
    expect(getHQSummary(db, businessId).syncHealth).toMatchObject({
      state: "SYNCED", label: "Imported and reconciled", isReconciled: true, needsReview: false,
    });
    db.run("UPDATE shopify_import_sessions SET state = 'RECONCILIATION_REQUIRED' WHERE id = ?", [sessionId]);
    const summary = getHQSummary(db, businessId);
    expect(summary.syncHealth).toMatchObject({
      state: "RECONCILIATION_REQUIRED", label: "Reconciliation required", isReconciled: false, needsReview: true,
    });
    expect(summary.commandCenter.exceptions).toContainEqual(expect.objectContaining({ key: "sync", link: "/commerce" }));
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