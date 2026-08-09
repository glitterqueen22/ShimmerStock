/**
 * Tenant isolation tests — the critical one.
 *
 * A user authenticated to Business A must NOT be able to read, list, update,
 * or delete records belonging to Business B. Coverage: products, orders,
 * inventory/movements, and users.
 *
 * Also tests that a forged business_id in the request body or query string
 * does NOT override effective_business_id from the session.
 */
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { setupTest, loginAs } from "./helpers/test-harness.js";

let appUrl: string;
let cleanup: (() => Promise<void>) | undefined;
let tokenA: string;
let tokenB: string;

beforeAll(async () => {
  const env = await setupTest();
  appUrl = env.appUrl;
  cleanup = env.cleanup;
  tokenA = await loginAs(appUrl, "owner_a", "test1234");
  tokenB = await loginAs(appUrl, "owner_b", "test1234");
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

// Helper: authenticated GET
async function authGet(path: string, token: string) {
  return fetch(`${appUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Helper: authenticated request with body
async function authReq(method: string, path: string, token: string, body?: any) {
  return fetch(`${appUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Tenant isolation — Products", () => {
  it("GET /api/products — user A sees only Business A products", async () => {
    const res = await authGet("/api/products", tokenA);
    expect(res.status).toBe(200);
    const products = await res.json() as any;
    expect(Array.isArray(products)).toBe(true);
    // Should only see products belonging to business 1
    for (const p of products) {
      expect(p.name).toMatch(/Product A/);
      expect(p.name).not.toMatch(/Product B/);
    }
  });

  it("GET /api/products — user B sees only Business B products", async () => {
    const res = await authGet("/api/products", tokenB);
    expect(res.status).toBe(200);
    const products = await res.json() as any;
    for (const p of products) {
      expect(p.name).toMatch(/Product B/);
      expect(p.name).not.toMatch(/Product A/);
    }
  });

  it("GET /api/products/:id — user A cannot fetch Business B product", async () => {
    // Product id=4 is "Product B1" in business 2
    const res = await authGet("/api/products/4", tokenA);
    // Should return 404 (not found) — not the product data
    expect([403, 404]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json() as any;
      // This would be a tenant isolation failure — flag it
      expect(data.name).toBeUndefined(); // force failure if we get data
    }
  });

  it("PUT /api/products/:id — user A cannot update Business B product", async () => {
    const res = await authReq("PUT", "/api/products/4", tokenA, { name: "Hacked" });
    expect([403, 404]).toContain(res.status);
  });

  it("DELETE /api/products/:id — user A cannot delete Business B product", async () => {
    const res = await authReq("DELETE", "/api/products/4", tokenA);
    expect([403, 404]).toContain(res.status);
  });
});

describe("Tenant isolation — Orders", () => {
  it("user A sees only Business A orders", async () => {
    const res = await authGet("/api/orders", tokenA);
    expect(res.status).toBe(200);
    const orders = await res.json() as any;
    for (const o of orders) {
      // Business A order is #1001
      expect(o.customer_name || "").not.toMatch(/Customer B/);
    }
  });

  it("user A cannot fetch Business B order", async () => {
    // Order for business B was created with order_number 2001
    // We need to find its ID. Let's just get all orders as user B first
    const resB = await authGet("/api/orders", tokenB);
    expect(resB.status).toBe(200);
    const ordersB = await resB.json() as any;
    expect(ordersB.length).toBeGreaterThan(0);
    const orderBId = ordersB[0].id;

    // Now user A tries to access it
    const resA = await authGet(`/api/orders/${orderBId}`, tokenA);
    expect([403, 404]).toContain(resA.status);
  });
});

describe("Tenant isolation — Inventory / Movements", () => {
  it("user A sees only Business A movements", async () => {
    const res = await authGet("/api/movements", tokenA);
    expect(res.status).toBe(200);
    const movements = await res.json() as any;
    // All movements should be for business A products (id 1-3)
    for (const m of movements) {
      expect(m.product_id).toBeLessThan(4); // Business A product IDs are 1-3
    }
  });
});

describe("Tenant isolation — Production", () => {
  it("active business sessions see only their own production batches", async () => {
    const bomAResponse = await authReq("POST", "/api/production/boms", tokenA, {
      name: "Business A BOM",
      outputProductId: 1,
      outputQuantity: 1,
      business_id: 2,
    });
    expect(bomAResponse.status).toBe(201);
    const bomA = await bomAResponse.json() as { id: number };

    const bomBResponse = await authReq("POST", "/api/production/boms", tokenB, {
      name: "Business B BOM",
      outputProductId: 4,
      outputQuantity: 1,
      business_id: 1,
    });
    expect(bomBResponse.status).toBe(201);
    const bomB = await bomBResponse.json() as { id: number };

    expect((await authReq("POST", "/api/production/batches", tokenA, {
      bomId: bomA.id,
      batchSize: 1,
      business_id: 2,
    })).status).toBe(201);
    expect((await authReq("POST", "/api/production/batches", tokenB, {
      bomId: bomB.id,
      batchSize: 1,
      business_id: 1,
    })).status).toBe(201);

    const batchesAResponse = await authGet("/api/production/batches?business_id=2", tokenA);
    const batchesBResponse = await authGet("/api/production/batches?business_id=1", tokenB);
    expect(batchesAResponse.status).toBe(200);
    expect(batchesBResponse.status).toBe(200);
    const batchesA = await batchesAResponse.json() as { bom_name: string }[];
    const batchesB = await batchesBResponse.json() as { bom_name: string }[];

    expect(batchesA.map(batch => batch.bom_name)).toContain("Business A BOM");
    expect(batchesA.map(batch => batch.bom_name)).not.toContain("Business B BOM");
    expect(batchesB.map(batch => batch.bom_name)).toContain("Business B BOM");
    expect(batchesB.map(batch => batch.bom_name)).not.toContain("Business A BOM");
  });
});

describe("Tenant isolation — Users", () => {
  it("user A sees only Business A users", async () => {
    const res = await authGet("/api/users", tokenA);
    expect(res.status).toBe(200);
    const users = await res.json() as any;
    for (const u of users) {
      expect(u.username).not.toMatch(/_b$/);
    }
  });

  it("user B sees only Business B users", async () => {
    const res = await authGet("/api/users", tokenB);
    expect(res.status).toBe(200);
    const users = await res.json() as any;
    for (const u of users) {
      expect(u.username).not.toMatch(/_a$/);
    }
  });
});

describe("Tenant isolation — Forged business_id override", () => {
  it("forged business_id in query string does not leak cross-tenant data", async () => {
    // User A tries to pass business_id=2 in the query
    const res = await authGet("/api/products?business_id=2", tokenA);
    expect(res.status).toBe(200);
    const products = await res.json() as any;
    // Should still only see business A products
    for (const p of products) {
      expect(p.name).toMatch(/Product A/);
    }
  });

  it("forged business_id in request body does not create cross-tenant product", async () => {
    const res = await authReq("POST", "/api/products", tokenA, {
      name: "Cross-Tenant Product",
      sku: "SKU-CROSS",
      business_id: 2, // attempt to create in Business B
    });
    // Should create in business A, or reject
    if (res.status === 201) {
      await res.json(); // consume body; cross-tenant isolation verified below
      // If created, it must be in business A, not B
      // Verify by fetching as user B — user B should NOT see it
      const resB = await authGet("/api/products", tokenB);
      const productsB = await resB.json() as any;
      const found = productsB.find((p: any) => p.sku === "SKU-CROSS");
      expect(found).toBeUndefined();
    }
  });

  it("forged business_id in request body does not leak data in update", async () => {
    // User A tries to update a business B product with forged business_id
    const res = await authReq("PUT", "/api/products/4", tokenA, {
      name: "Hacked with forged biz",
      business_id: 2,
    });
    expect([403, 404]).toContain(res.status);
  });
});
