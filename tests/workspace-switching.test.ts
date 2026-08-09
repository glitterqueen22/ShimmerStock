/**
 * Workspace switching regression tests.
 *
 * Covers:
 *  1. Member can switch to another business they belong to
 *  2. Non-member cannot switch (403)
 *  3. Active business persists across requests after switch
 *  4. Business context returned after switch is correct
 *  5. No cross-tenant data leakage after switch
 *  6. The WorkspaceSwitcher disabled logic uses user.business_id not is_active
 *  7. Switch works even when is_active is inconsistent (both rows is_active=1)
 */
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { setupTest, loginAs, seedMultiBusinessUser } from "./helpers/test-harness.js";

let appUrl: string;
let cleanup: (() => Promise<void>) | undefined;
let multiOwnerToken: string;
let ownerAToken: string;
let ownerBToken: string;

beforeAll(async () => {
  const env = await setupTest();
  appUrl = env.appUrl;
  cleanup = env.cleanup;

  // Seed a user who belongs to both businesses (with both rows is_active=1 to
  // reproduce the live-db bug).
  seedMultiBusinessUser(env.db);

  multiOwnerToken = await loginAs(appUrl, "multi_owner", "test1234");
  ownerAToken = await loginAs(appUrl, "owner_a", "test1234");
  ownerBToken = await loginAs(appUrl, "owner_b", "test1234");
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function authReq(
  method: string,
  path: string,
  token: string,
  body?: object,
) {
  return fetch(`${appUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function authGet(path: string, token: string) {
  return fetch(`${appUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── 1. Member can switch to another business they belong to ────────────────

describe("workspace switching — member can switch", () => {
  it("POST /api/businesses/2/activate returns 200 for multi_owner", async () => {
    const res = await authReq("POST", "/api/businesses/2/activate", multiOwnerToken);
    expect(res.status).toBe(200);
  });

  it("response body contains the correct business_id after switch", async () => {
    const res = await authReq("POST", "/api/businesses/2/activate", multiOwnerToken);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.business_id).toBe(2);
    expect(typeof data.business_name).toBe("string");
    expect(typeof data.business_role).toBe("string");
  });

  it("switches back to business 1 successfully", async () => {
    // Switch to 2 first
    await authReq("POST", "/api/businesses/2/activate", multiOwnerToken);
    // Then back to 1
    const res = await authReq("POST", "/api/businesses/1/activate", multiOwnerToken);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.business_id).toBe(1);
  });
});

// ── 2. Non-member cannot switch ────────────────────────────────────────────

describe("workspace switching — non-member is rejected", () => {
  it("owner_a cannot switch to business 2 (not a member)", async () => {
    const res = await authReq("POST", "/api/businesses/2/activate", ownerAToken);
    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toBeTruthy();
  });

  it("owner_b cannot switch to business 1 (not a member)", async () => {
    const res = await authReq("POST", "/api/businesses/1/activate", ownerBToken);
    expect(res.status).toBe(403);
  });

  it("unauthenticated request is rejected with 401", async () => {
    const res = await fetch(`${appUrl}/api/businesses/2/activate`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });
});

// ── 3. Active business persists across requests after switch ───────────────

describe("workspace switching — persistence", () => {
  it("products returned after switch belong to the new business", async () => {
    // Switch multi_owner to business 2
    const switchRes = await authReq("POST", "/api/businesses/2/activate", multiOwnerToken);
    expect(switchRes.status).toBe(200);

    // Subsequent products request must use business 2
    const productsRes = await authGet("/api/products", multiOwnerToken);
    expect(productsRes.status).toBe(200);
    const products = await productsRes.json() as Array<{ name: string }>;
    expect(products.every((p) => p.name.startsWith("Product B"))).toBe(true);

    // Switch back to business 1 to reset
    await authReq("POST", "/api/businesses/1/activate", multiOwnerToken);
  });

  it("products returned after switching back belong to business 1", async () => {
    // Start on 2
    await authReq("POST", "/api/businesses/2/activate", multiOwnerToken);
    // Switch back to 1
    await authReq("POST", "/api/businesses/1/activate", multiOwnerToken);

    const productsRes = await authGet("/api/products", multiOwnerToken);
    expect(productsRes.status).toBe(200);
    const products = await productsRes.json() as Array<{ name: string }>;
    expect(products.every((p) => p.name.startsWith("Product A"))).toBe(true);
  });
});

// ── 4. Business context returned after switch is correct ───────────────────

describe("workspace switching — context after switch", () => {
  it("/api/auth/me reflects the new business after switch", async () => {
    await authReq("POST", "/api/businesses/2/activate", multiOwnerToken);

    const meRes = await authGet("/api/auth/me", multiOwnerToken);
    expect(meRes.status).toBe(200);
    const me = await meRes.json() as any;
    expect(me.business_id).toBe(2);
    expect(typeof me.business_name).toBe("string");

    // Reset
    await authReq("POST", "/api/businesses/1/activate", multiOwnerToken);
  });

  it("businesses list in /api/auth/me includes all memberships", async () => {
    const meRes = await authGet("/api/auth/me", multiOwnerToken);
    expect(meRes.status).toBe(200);
    const me = await meRes.json() as any;
    expect(Array.isArray(me.businesses)).toBe(true);
    expect(me.businesses.length).toBeGreaterThanOrEqual(2);
    const ids = me.businesses.map((b: any) => b.business_id);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
  });
});

// ── 5. No cross-tenant data leakage after switch ───────────────────────────

describe("workspace switching — no cross-tenant leakage", () => {
  it("business A products are not visible when active on business B", async () => {
    await authReq("POST", "/api/businesses/2/activate", multiOwnerToken);

    const productsRes = await authGet("/api/products", multiOwnerToken);
    const products = await productsRes.json() as Array<{ name: string }>;
    const hasA = products.some((p) => p.name.startsWith("Product A"));
    expect(hasA).toBe(false);

    await authReq("POST", "/api/businesses/1/activate", multiOwnerToken);
  });

  it("business B products are not visible when active on business A", async () => {
    // Ensure on business 1
    await authReq("POST", "/api/businesses/1/activate", multiOwnerToken);

    const productsRes = await authGet("/api/products", multiOwnerToken);
    const products = await productsRes.json() as Array<{ name: string }>;
    const hasB = products.some((p) => p.name.startsWith("Product B"));
    expect(hasB).toBe(false);
  });

  it("owner_a with single business always sees only business A products", async () => {
    const productsRes = await authGet("/api/products", ownerAToken);
    const products = await productsRes.json() as Array<{ name: string }>;
    expect(products.every((p) => p.name.startsWith("Product A"))).toBe(true);
    // Paranoia: no B products visible
    expect(products.some((p) => p.name.startsWith("Product B"))).toBe(false);
  });
});

// ── 6. WorkspaceSwitcher disabled logic — uses business_id not is_active ───

describe("workspace switching — WorkspaceSwitcher disabled logic", () => {
  /**
   * The live-db bug: both user_businesses rows had is_active=1.
   * The WorkspaceSwitcher previously checked `disabled={biz.is_active === 1}`,
   * disabling ALL rows when all have is_active=1 and making clicks a no-op.
   *
   * After the fix, the component compares biz.business_id === user.business_id,
   * so only the currently active workspace button is disabled regardless of the
   * is_active column value.
   *
   * We verify this at the API level: the /api/auth/me response must accurately
   * report user.business_id == the session-active business so the client can
   * make the correct comparison.
   */
  it("user.business_id in /api/auth/me matches the active session business", async () => {
    // multi_owner has both rows is_active=1 due to the fixture intentionally
    // seeding the bug scenario.  After login (which pins the session to
    // business_id=1), user.business_id must be 1.
    const meRes = await authGet("/api/auth/me", multiOwnerToken);
    const me = await meRes.json() as any;
    // business_id comes from session.business_id (set at login), not is_active
    expect(me.business_id).toBe(1);
  });

  it("after switch to business 2, user.business_id is 2", async () => {
    await authReq("POST", "/api/businesses/2/activate", multiOwnerToken);
    const meRes = await authGet("/api/auth/me", multiOwnerToken);
    const me = await meRes.json() as any;
    expect(me.business_id).toBe(2);

    // Reset
    await authReq("POST", "/api/businesses/1/activate", multiOwnerToken);
  });

  it("businesses list always contains both memberships even when is_active is inconsistent", async () => {
    // multi_owner has both rows is_active=1 (intentional fixture)
    const meRes = await authGet("/api/auth/me", multiOwnerToken);
    const me = await meRes.json() as any;
    // Both businesses must be present regardless of is_active column values
    expect(me.businesses.length).toBeGreaterThanOrEqual(2);
  });
});

// ── 7. Switch works even when is_active is inconsistent ───────────────────

describe("workspace switching — is_active inconsistency tolerance", () => {
  it("switch succeeds and sets correct business even with both rows is_active=1", async () => {
    // The fixture seeded multi_owner with both rows is_active=1 (bug scenario).
    // The activate endpoint must still work: it reads getUserBusinesses (not
    // is_active-filtered), validates membership, then atomically sets active.
    const res = await authReq("POST", "/api/businesses/2/activate", multiOwnerToken);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.business_id).toBe(2);

    // After switch, me.business_id must be 2 (session pinned correctly)
    const meRes = await authGet("/api/auth/me", multiOwnerToken);
    const me = await meRes.json() as any;
    expect(me.business_id).toBe(2);

    // Reset
    await authReq("POST", "/api/businesses/1/activate", multiOwnerToken);
  });

  it("GET /api/businesses returns correct list for multi_owner", async () => {
    const res = await authGet("/api/businesses", multiOwnerToken);
    expect(res.status).toBe(200);
    const businesses = await res.json() as Array<{ business_id: number }>;
    const ids = businesses.map((b) => b.business_id);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
  });
});
