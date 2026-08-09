import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { loginAs, setupTest } from "./helpers/test-harness.js";

let appUrl = "";
let tokenA = "";
let tokenB = "";
let managerToken = "";
let cleanup: (() => Promise<void>) | undefined;
let testDb: any;
let variantA = 0;
let variantAExisting = 0;
let variantB = 0;
let internalBarcodeA = "";

function request(method: string, path: string, token: string, body?: unknown) {
  return fetch(`${appUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeAll(async () => {
  const environment = await setupTest();
  appUrl = environment.appUrl;
  cleanup = environment.cleanup;
  tokenA = await loginAs(appUrl, "owner_a", "test1234");
  tokenB = await loginAs(appUrl, "owner_b", "test1234");
  const db = environment.db;
  testDb = db;
  const managerHash = Bun.password.hashSync("test1234");
  const managerId = Number(db.run(
    "INSERT INTO users (username, password_hash, display_name, role) VALUES ('manager_a', ?, 'Manager A', 'manager')",
    [managerHash],
  ).lastInsertRowid);
  db.run("INSERT INTO user_businesses (user_id, business_id, role, is_active) VALUES (?, 1, 'manager', 1)", [managerId]);
  managerToken = await loginAs(appUrl, "manager_a", "test1234");
  const productA = db.query("SELECT id FROM products WHERE business_id = 1 ORDER BY id LIMIT 1").get() as { id: number };
  const productB = db.query("SELECT id FROM products WHERE business_id = 2 ORDER BY id LIMIT 1").get() as { id: number };
  variantA = Number(db.run(`
    INSERT INTO product_variants
      (product_id, business_id, sku, barcode, variant_type, variant_value, stock_count, shopify_variant_id, shopify_inventory_item_id)
    VALUES (?, 1, NULL, NULL, 'Color', 'Pink', 14, 'A-101', 'A-501')
  `, [productA.id]).lastInsertRowid);
  variantAExisting = Number(db.run(`
    INSERT INTO product_variants
      (product_id, business_id, sku, barcode, variant_type, variant_value, stock_count, shopify_variant_id, shopify_inventory_item_id)
    VALUES (?, 1, 'GOOD-SKU', '012345678905', 'Color', 'Blue', 8, 'A-102', 'A-502')
  `, [productA.id]).lastInsertRowid);
  variantB = Number(db.run(`
    INSERT INTO product_variants
      (product_id, business_id, sku, barcode, variant_type, variant_value, stock_count, shopify_variant_id, shopify_inventory_item_id)
    VALUES (?, 2, NULL, NULL, 'Color', 'Pink', 99, 'B-101', 'B-501')
  `, [productB.id]).lastInsertRowid);
});

afterAll(async () => {
  await cleanup?.();
});

describe("Novi SKU & Label Studio local workflow", () => {
  it("keeps automatic Shopify updates off by default and owner controlled", async () => {
    const initial = await request("GET", "/api/sku-label-studio", tokenA);
    expect((await initial.json() as any).settings.autoWritebackEnabled).toBe(false);
    const managerAttempt = await request("PUT", "/api/sku-label-studio/settings", managerToken, {
      autoWritebackEnabled: true,
    });
    expect(managerAttempt.status).toBe(403);
    expect((await managerAttempt.json() as any).error).toContain("owner or admin");
  });
  it("audits only the active business and proposes deterministic missing SKUs", async () => {
    const response = await request("GET", "/api/sku-label-studio", tokenA);
    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data.audit.total).toBe(2);
    expect(data.audit.items.every((item: any) => item.business_id === 1)).toBe(true);
    const previewResponse = await request("POST", "/api/sku-label-studio/preview", tokenA, {
      skuPattern: "GLIT-{COLOR}-{NUMBER}", separator: "-", numberPadding: 3,
    });
    const preview = await previewResponse.json() as any;
    expect(preview.items.find((item: any) => item.id === variantA).proposedSku).toBe("GLIT-PINK-001");
    expect(preview.items.find((item: any) => item.id === variantAExisting).proposedSku).toBe("GOOD-SKU");
  });

  it("saves a manual override locally, creates a stable internal barcode, and ignores forged business_id", async () => {
    const firstBarcode = await request("POST", `/api/sku-label-studio/internal-barcodes/${variantA}`, tokenA);
    const secondBarcode = await request("POST", `/api/sku-label-studio/internal-barcodes/${variantA}`, tokenA);
    const firstValue = (await firstBarcode.json() as any).barcode;
    internalBarcodeA = firstValue;
    expect((await secondBarcode.json() as any).barcode).toBe(firstValue);
    const save = await request("POST", "/api/sku-label-studio/save-local", tokenA, {
      business_id: 2,
      items: [{ variantId: variantA, sku: "MANUAL-PINK-001", barcode: firstValue }],
    });
    expect(save.status).toBe(200);
    const scan = await request("POST", "/api/sku-label-studio/scan", tokenA, { value: firstValue });
    expect(scan.status).toBe(200);
    expect((await scan.json() as any).match.id).toBe(variantA);
    const wrongTenantScan = await request("POST", "/api/sku-label-studio/scan", tokenB, { value: firstValue });
    expect(wrongTenantScan.status).toBe(404);
  });

  it("allows the same generated SKU in another business but rejects collisions within one", async () => {
    const saveB = await request("POST", "/api/sku-label-studio/save-local", tokenB, {
      items: [{ variantId: variantB, sku: "MANUAL-PINK-001" }],
    });
    expect(saveB.status).toBe(200);
    const collision = await request("POST", "/api/sku-label-studio/save-local", tokenA, {
      items: [{ variantId: variantAExisting, sku: "MANUAL-PINK-001", replaceSku: true }],
    });
    expect(collision.status).toBe(409);
    expect((await collision.json() as any).error).toContain("collision");
  });

  it("never silently replaces good retail identifiers", async () => {
    const replaceSku = await request("POST", "/api/sku-label-studio/save-local", tokenA, {
      items: [{ variantId: variantAExisting, sku: "REPLACEMENT" }],
    });
    expect(replaceSku.status).toBe(409);
    expect((await replaceSku.json() as any).error).toContain("requires confirmation");
    const replaceBarcode = await request("POST", "/api/sku-label-studio/save-local", tokenA, {
      items: [{ variantId: variantAExisting, generateInternalBarcode: true }],
    });
    expect(replaceBarcode.status).toBe(409);
    expect((await replaceBarcode.json() as any).error).toContain("retail barcode");
  });

  it("renders Code 128 artwork from the exact stored value", async () => {
    const response = await request("GET", `/api/sku-label-studio/barcodes/${variantA}.svg`, tokenA);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    const svg = await response.text();
    expect(svg).toContain(`data-barcode-value="${encodeURIComponent(internalBarcodeA)}"`);
    const crossTenant = await request("GET", `/api/sku-label-studio/barcodes/${variantA}.svg`, tokenB);
    expect(crossTenant.status).toBe(404);
  });
});

describe("Scanner ambiguity and labels", () => {
  it("fails safely when a legacy SKU matches multiple variants", async () => {
    const productId = (testDb.query("SELECT product_id FROM product_variants WHERE id = ?").get(variantA) as any).product_id;
    testDb.run(`INSERT INTO product_variants
      (product_id, business_id, sku, variant_type, variant_value, stock_count)
      VALUES (?, 1, 'LEGACY-DUPLICATE', 'Color', 'Gold', 3)`, [productId]);
    testDb.run(`INSERT INTO product_variants
      (product_id, business_id, sku, variant_type, variant_value, stock_count)
      VALUES (?, 1, 'LEGACY-DUPLICATE', 'Color', 'Silver', 4)`, [productId]);
    const response = await request("POST", "/api/sku-label-studio/scan", tokenA, { value: "LEGACY-DUPLICATE" });
    expect(response.status).toBe(409);
    const result = await response.json() as any;
    expect(result.status).toBe("ambiguous");
    expect(result.matches).toHaveLength(2);
  });

  it("returns canonical availability with tenant-scoped location and bin context", async () => {
    const productId = (testDb.query("SELECT product_id FROM product_variants WHERE id = ?").get(variantA) as any).product_id;
    testDb.run("UPDATE products SET bin_location = 'A-07' WHERE id = ? AND business_id = 1", [productId]);
    testDb.run("INSERT INTO shopify_locations (business_id, shopify_location_id, name) VALUES (1, 'LOC-A', 'Main Store')");
    testDb.run("INSERT INTO shopify_locations (business_id, shopify_location_id, name) VALUES (2, 'LOC-B', 'Other Tenant')");
    testDb.run(`INSERT INTO shopify_inventory_levels
      (business_id, shopify_inventory_item_id, shopify_location_id, available)
      VALUES (1, 'A-501', 'LOC-A', 23), (2, 'A-501', 'LOC-B', 900)`);

    const response = await request("POST", "/api/sku-label-studio/scan", tokenA, { value: internalBarcodeA });
    expect(response.status).toBe(200);
    const result = await response.json() as any;
    expect(result.match.stock_count).toBe(23);
    expect(result.match.bin_location).toBe("A-07");
    expect(result.match.locations).toEqual([{ name: "Main Store", shopify_location_id: "LOC-A", available: 23 }]);
  });

  it("stores physical label dimensions and tenant-scoped templates", async () => {
    const created = await request("POST", "/api/sku-label-studio/templates", tokenA, {
      name: "Novi 2 x 1", size: "2x1", fields: ["product", "variant", "sku", "barcode"], isDefault: true,
    });
    expect(created.status).toBe(201);
    const template = await created.json() as any;
    expect(template.width).toBe(2);
    expect(template.height).toBe(1);
    const listA = await request("GET", "/api/sku-label-studio/templates", tokenA);
    const listB = await request("GET", "/api/sku-label-studio/templates", tokenB);
    expect((await listA.json() as any[]).some(row => row.id === template.id)).toBe(true);
    expect((await listB.json() as any[]).some(row => row.id === template.id)).toBe(false);

    const job = await request("POST", "/api/sku-label-studio/print-jobs", tokenA, {
      templateId: template.id, items: [{ variantId: variantA, quantity: 4 }], isTest: false,
    });
    expect(job.status).toBe(201);
    expect((await job.json() as any).totalLabels).toBe(4);
    const jobsB = await request("GET", "/api/sku-label-studio/print-jobs", tokenB);
    expect(await jobsB.json()).toEqual([]);
  });

  it("returns a truthful empty state for a tenant with no active variants", async () => {
    testDb.run("UPDATE product_variants SET is_active = 0 WHERE business_id = 2");
    const response = await request("GET", "/api/sku-label-studio", tokenB);
    const data = await response.json() as any;
    expect(data.audit.total).toBe(0);
    expect(data.audit.items).toEqual([]);
    const audits = await request("GET", "/api/sku-label-studio/writeback-audit", tokenB);
    expect(await audits.json()).toEqual([]);
  });
});