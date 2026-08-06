import { describe, expect, it, beforeAll, afterAll, mock } from "bun:test";
import { setupTest, loginAs } from "./helpers/test-harness.js";
import crypto from "crypto";

let appUrl: string;
let db: any;
let cleanup: () => Promise<void>;
let token: string;
let businessId = 1;

beforeAll(async () => {
  process.env.SHOPIFY_CLIENT_ID = "test_client_id";
  process.env.SHOPIFY_CLIENT_SECRET = "test_client_secret";
  process.env.SHIMMERSTOCK_URL = "http://localhost:3000";

  const env = await setupTest();
  appUrl = env.appUrl;
  db = env.db;
  cleanup = env.cleanup;
  token = await loginAs(appUrl, "owner_a", "test1234");
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

function generateCallbackHmac(queryObj: Record<string, string>, secret: string) {
  const params = { ...queryObj };
  delete params.hmac;
  const orderedParams = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHmac("sha256", secret).update(orderedParams).digest("hex");
}

describe("Shopify OAuth Flow", () => {
  it("redirects to Shopify authorize URL with opaque state and exact P0 scopes", async () => {
    const res = await fetch(`${appUrl}/api/shopify/auth?shop=test.myshopify.com`, {
      redirect: "manual",
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toContain("https://test.myshopify.com/admin/oauth/authorize");

    const url = new URL(location!);
    expect(url.searchParams.get("client_id")).toBe("test_client_id");

    // State should be an opaque hex token, not a base64 JSON object
    const state = url.searchParams.get("state");
    expect(state).toBeTruthy();
    expect(state).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes as hex

    // Verify the state is stored as a hash in the DB
    const stateHash = crypto.createHash("sha256").update(state!).digest("hex");
    const stateRecord = db.query("SELECT * FROM shopify_oauth_state WHERE state_hash = ?").get(stateHash);
    expect(stateRecord).toBeTruthy();
    expect(stateRecord.business_id).toBe(businessId);
    expect(stateRecord.expected_shop).toBe("test.myshopify.com");
    expect(stateRecord.used_at).toBeNull();

    // Verify exact P0 scopes are requested
    const scopes = url.searchParams.get("scope");
    expect(scopes).toContain("read_orders");
    expect(scopes).toContain("read_products");
    expect(scopes).toContain("read_inventory");
    expect(scopes).toContain("read_locations");
    expect(scopes).not.toContain("write_");
    expect(scopes).not.toContain("read_fulfillments");
    expect(scopes).not.toContain("read_customers");
    expect(scopes).not.toContain("read_checkouts");
  });

  it("returns JSON auth URL when requested via format=json", async () => {
    const res = await fetch(`${appUrl}/api/shopify/auth?shop=json-test.myshopify.com&format=json`, {
      headers: { Authorization: "Bearer " + token }
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.authUrl).toContain("https://json-test.myshopify.com/admin/oauth/authorize");
  });

  it("rejects query-token auth fallback", async () => {
    const res = await fetch(`${appUrl}/api/shopify/auth?shop=test.myshopify.com&token=${encodeURIComponent(token)}`, {
      redirect: "manual"
    });
    expect(res.status).toBe(401);
  });

  it("rejects callback with missing state", async () => {
    const query = {
      code: "test_code",
      shop: "test.myshopify.com",
    };
    const hmac = generateCallbackHmac(query as Record<string, string>, "test_client_secret");
    const qs = new URLSearchParams({ ...query, hmac }).toString();
    const res = await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Missing required parameters");
  });

  it("rejects callback with unknown/forged state", async () => {
    const forgotState = crypto.randomBytes(32).toString("hex"); // not in DB
    const query = {
      code: "test_code",
      shop: "test.myshopify.com",
      state: forgotState,
    };
    const hmac = generateCallbackHmac(query as Record<string, string>, "test_client_secret");
    const qs = new URLSearchParams({ ...query, hmac }).toString();
    const res = await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Unknown or replayed state");
  });

  it("does not exchange or store token when final state consume fails", async () => {
    const shop = "consume-fail.myshopify.com";
    db.run(
      "DELETE FROM provider_credentials WHERE business_id = ? AND provider = 'shopify' AND shop_domain = ?",
      [businessId, shop]
    );

    const forgedState = crypto.randomBytes(32).toString("hex");
    const query = {
      code: "test_code",
      shop,
      state: forgedState,
    };
    const hmac = generateCallbackHmac(query as Record<string, string>, "test_client_secret");
    const qs = new URLSearchParams({ ...query, hmac }).toString();

    let oauthExchangeCalls = 0;
    const originalFetch = global.fetch;
    (global as any).fetch = mock(async (input: any, init?: any) => {
      const urlStr = input.toString();
      if (urlStr.includes("/admin/oauth/access_token")) {
        oauthExchangeCalls += 1;
      }
      return originalFetch(input, init);
    });

    try {
      const res = await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });
      expect(res.status).toBe(400);
      expect(oauthExchangeCalls).toBe(0);

      const row = db
        .query("SELECT id FROM provider_credentials WHERE business_id = ? AND provider = 'shopify' AND shop_domain = ?")
        .get(businessId, shop);
      expect(row).toBeNull();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("rejects callback with invalid HMAC", async () => {
    // First get a real state token
    const authRes = await fetch(`${appUrl}/api/shopify/auth?shop=test.myshopify.com`, {
      redirect: "manual",
      headers: { Authorization: `Bearer ${token}` }
    });
    const authUrl = new URL(authRes.headers.get("location")!);
    const state = authUrl.searchParams.get("state")!;

    const qs = new URLSearchParams({
      code: "test_code",
      shop: "test.myshopify.com",
      state,
      hmac: "forged_hmac_signature",
    }).toString();
    const res = await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });

    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toContain("Invalid HMAC signature");
  });

  it("rejects callback with non-myshopify.com shop domain", async () => {
    const query = {
      code: "test_code",
      shop: "evil.example.com", // not a *.myshopify.com domain
      state: crypto.randomBytes(32).toString("hex"),
    };
    const hmac = generateCallbackHmac(query as Record<string, string>, "test_client_secret");
    const qs = new URLSearchParams({ ...query, hmac }).toString();
    const res = await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Invalid shop domain");
  });

  it("rejects callback when state shop does not match callback shop", async () => {
    // Create state bound to test.myshopify.com
    const authRes = await fetch(`${appUrl}/api/shopify/auth?shop=test.myshopify.com`, {
      redirect: "manual",
      headers: { Authorization: `Bearer ${token}` }
    });
    const authUrl = new URL(authRes.headers.get("location")!);
    const state = authUrl.searchParams.get("state")!;

    // Use different shop in callback
    const query = {
      code: "test_code",
      shop: "different.myshopify.com",
      state,
    };
    const hmac = generateCallbackHmac(query as Record<string, string>, "test_client_secret");
    const qs = new URLSearchParams({ ...query, hmac }).toString();
    const res = await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Shop mismatch");
  });

  it("rejects replay of a consumed state token", async () => {
    // Get a valid state
    const authRes = await fetch(`${appUrl}/api/shopify/auth?shop=replay.myshopify.com`, {
      redirect: "manual",
      headers: { Authorization: `Bearer ${token}` }
    });
    const authUrl = new URL(authRes.headers.get("location")!);
    const state = authUrl.searchParams.get("state")!;

    // Manually mark state as used in DB to simulate a completed flow
    const stateHash = crypto.createHash("sha256").update(state).digest("hex");
    db.run("UPDATE shopify_oauth_state SET used_at = datetime('now') WHERE state_hash = ?", [stateHash]);

    const query = {
      code: "test_code",
      shop: "replay.myshopify.com",
      state,
    };
    const hmac = generateCallbackHmac(query as Record<string, string>, "test_client_secret");
    const qs = new URLSearchParams({ ...query, hmac }).toString();
    const res = await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("already consumed");
  });

  it("rejects expired state token", async () => {
    // Insert an expired state directly
    const stateToken = crypto.randomBytes(32).toString("hex");
    const stateHash = crypto.createHash("sha256").update(stateToken).digest("hex");
    const expiredAt = new Date(Date.now() - 60000).toISOString(); // 1 minute ago

    db.run(
      "INSERT INTO shopify_oauth_state (state_hash, user_id, business_id, expected_shop, expires_at) VALUES (?, 1, 1, 'expired.myshopify.com', ?)",
      [stateHash, expiredAt]
    );

    const query = {
      code: "test_code",
      shop: "expired.myshopify.com",
      state: stateToken,
    };
    const hmac = generateCallbackHmac(query as Record<string, string>, "test_client_secret");
    const qs = new URLSearchParams({ ...query, hmac }).toString();
    const res = await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("expired");
  });

  it("rejects callback when granted scopes include a write scope", async () => {
    // Get a valid state
    const authRes = await fetch(`${appUrl}/api/shopify/auth?shop=writescope.myshopify.com`, {
      redirect: "manual",
      headers: { Authorization: `Bearer ${token}` }
    });
    const authUrl = new URL(authRes.headers.get("location")!);
    const state = authUrl.searchParams.get("state")!;

    const query = { code: "test_code", shop: "writescope.myshopify.com", state };
    const hmac = generateCallbackHmac(query as Record<string, string>, "test_client_secret");
    const qs = new URLSearchParams({ ...query, hmac }).toString();

    const originalFetch = global.fetch;
    (global as any).fetch = mock(async (input: any, init?: any) => {
      const urlStr = input.toString();
      if (urlStr.includes("/admin/oauth/access_token")) {
        // Shopify returns write_inventory which must be rejected
        return new Response(JSON.stringify({
          access_token: "shpat_12345",
          scope: "read_orders,read_products,read_inventory,read_locations,write_inventory"
        }));
      }
      return originalFetch(input, init);
    });

    try {
      const res = await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });
      expect(res.status).toBe(403);
      const data = await res.json() as any;
      expect(data.error).toContain("write");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("rejects callback when required read scope is missing", async () => {
    const authRes = await fetch(`${appUrl}/api/shopify/auth?shop=missingscope.myshopify.com`, {
      redirect: "manual",
      headers: { Authorization: `Bearer ${token}` }
    });
    const authUrl = new URL(authRes.headers.get("location")!);
    const state = authUrl.searchParams.get("state")!;

    const query = { code: "test_code", shop: "missingscope.myshopify.com", state };
    const hmac = generateCallbackHmac(query as Record<string, string>, "test_client_secret");
    const qs = new URLSearchParams({ ...query, hmac }).toString();

    const originalFetch = global.fetch;
    (global as any).fetch = mock(async (input: any, init?: any) => {
      const urlStr = input.toString();
      if (urlStr.includes("/admin/oauth/access_token")) {
        // Missing read_inventory and read_locations
        return new Response(JSON.stringify({
          access_token: "shpat_12345",
          scope: "read_orders,read_products"
        }));
      }
      return originalFetch(input, init);
    });

    try {
      const res = await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });
      expect(res.status).toBe(403);
      const data = await res.json() as any;
      expect(data.error).toContain("missing required scopes");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("successfully connects when all P0 scopes are granted and stores exact verified scopes", async () => {
    const authRes = await fetch(`${appUrl}/api/shopify/auth?shop=success.myshopify.com`, {
      redirect: "manual",
      headers: { Authorization: `Bearer ${token}` }
    });
    const authUrl = new URL(authRes.headers.get("location")!);
    const state = authUrl.searchParams.get("state")!;

    const query = { code: "test_code", shop: "success.myshopify.com", state };
    const hmac = generateCallbackHmac(query as Record<string, string>, "test_client_secret");
    const qs = new URLSearchParams({ ...query, hmac }).toString();

    const originalFetch = global.fetch;
    (global as any).fetch = mock(async (input: any, init?: any) => {
      const urlStr = input.toString();
      if (urlStr.includes("/admin/oauth/access_token")) {
        return new Response(JSON.stringify({
          access_token: "shpat_12345",
          scope: "read_orders,read_products,read_inventory,read_locations"
        }));
      }
      if (urlStr.includes("/admin/api/") && urlStr.includes("/shop.json")) {
        return new Response(JSON.stringify({
          shop: {
            myshopify_domain: "success.myshopify.com",
            email: "owner@success.com",
            name: "Success Shop"
          }
        }));
      }
      return originalFetch(input, init);
    });

    try {
      const res = await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toContain("shopify_connected=true");

      const row = db.query("SELECT * FROM provider_credentials WHERE business_id = ? AND provider = 'shopify'").get(businessId);
      expect(row).toBeTruthy();
      expect(row.shop_domain).toBe("success.myshopify.com");
      expect(row.sync_status).toBe("connected");
      expect(row.scopes).toBe("read_orders,read_products,read_inventory,read_locations");
      expect(row.access_token_encrypted).not.toBe("shpat_12345");

      // Verify state is consumed
      const stateHash = crypto.createHash("sha256").update(state).digest("hex");
      const stateRecord = db.query("SELECT * FROM shopify_oauth_state WHERE state_hash = ?").get(stateHash);
      expect(stateRecord?.used_at).not.toBeNull();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("no webhook registration occurs during OAuth connect", async () => {
    const authRes = await fetch(`${appUrl}/api/shopify/auth?shop=nowebhook.myshopify.com`, {
      redirect: "manual",
      headers: { Authorization: `Bearer ${token}` }
    });
    const authUrl = new URL(authRes.headers.get("location")!);
    const state = authUrl.searchParams.get("state")!;

    const query = { code: "test_code", shop: "nowebhook.myshopify.com", state };
    const hmac = generateCallbackHmac(query as Record<string, string>, "test_client_secret");
    const qs = new URLSearchParams({ ...query, hmac }).toString();

    const webhookCalls: string[] = [];
    const originalFetch = global.fetch;
    (global as any).fetch = mock(async (input: any, init?: any) => {
      const urlStr = input.toString();
      if (urlStr.includes("webhooks.json")) {
        webhookCalls.push(urlStr);
      }
      if (urlStr.includes("/admin/oauth/access_token")) {
        return new Response(JSON.stringify({
          access_token: "shpat_12345",
          scope: "read_orders,read_products,read_inventory,read_locations"
        }));
      }
      if (urlStr.includes("/shop.json")) {
        return new Response(JSON.stringify({
          shop: { myshopify_domain: "nowebhook.myshopify.com", email: "a@b.com", name: "Test" }
        }));
      }
      return originalFetch(input, init);
    });

    try {
      await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });
      expect(webhookCalls.length).toBe(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // -- OAuth State Binding Tests --

  it("rejects callback when initiating session has been invalidated (session mismatch)", async () => {
    // Insert a state record directly with a non-existent session_id.
    // This avoids expiring the shared test session used by subsequent tests.
    const fakeState = crypto.randomBytes(32).toString("hex");
    const fakeStateHash = crypto.createHash("sha256").update(fakeState).digest("hex");
    db.run(
      `INSERT INTO shopify_oauth_state (state_hash, user_id, business_id, session_id, expected_shop, expires_at)
       VALUES (?, 1, 1, -9999, 'session-test.myshopify.com', datetime('now', '+10 minutes'))`,
      [fakeStateHash]
    );

    const query = { code: "test_code", shop: "session-test.myshopify.com", state: fakeState };
    const hmac = generateCallbackHmac(query as Record<string, string>, "test_client_secret");
    const qs = new URLSearchParams({ ...query, hmac }).toString();

    const res = await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Session mismatch");
  });

  it("rejects callback when user is no longer associated with the business (business mismatch)", async () => {
    // Fresh login to avoid affecting the shared session used in beforeAll.
    const freshToken = await loginAs(appUrl, "owner_a", "test1234");
    const authRes = await fetch(`${appUrl}/api/shopify/auth?shop=biz-mismatch.myshopify.com`, {
      redirect: "manual",
      headers: { Authorization: `Bearer ${freshToken}` },
    });
    const authUrl = new URL(authRes.headers.get("location")!);
    const state = authUrl.searchParams.get("state")!;

    const stateHash = crypto.createHash("sha256").update(state).digest("hex");
    const stateRecord = db.query("SELECT * FROM shopify_oauth_state WHERE state_hash = ?").get(stateHash);
    expect(stateRecord).toBeTruthy();

    // Deactivate the user's business association
    db.run(
      "UPDATE user_businesses SET is_active = 0 WHERE user_id = ? AND business_id = ?",
      [stateRecord.user_id, stateRecord.business_id]
    );

    const query = { code: "test_code", shop: "biz-mismatch.myshopify.com", state };
    const hmac = generateCallbackHmac(query as Record<string, string>, "test_client_secret");
    const qs = new URLSearchParams({ ...query, hmac }).toString();

    const res = await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Business mismatch");

    // Restore for subsequent tests
    db.run(
      "UPDATE user_businesses SET is_active = 1 WHERE user_id = ? AND business_id = ?",
      [stateRecord.user_id, stateRecord.business_id]
    );
  });

  it("rejects callback when session user does not match state user (user mismatch)", async () => {
    // Fresh login to isolate from other tests.
    const freshToken = await loginAs(appUrl, "owner_a", "test1234");
    const authRes = await fetch(`${appUrl}/api/shopify/auth?shop=user-mismatch.myshopify.com`, {
      redirect: "manual",
      headers: { Authorization: `Bearer ${freshToken}` },
    });
    const authUrl = new URL(authRes.headers.get("location")!);
    const state = authUrl.searchParams.get("state")!;

    const stateHash = crypto.createHash("sha256").update(state).digest("hex");
    const stateRecord = db.query("SELECT * FROM shopify_oauth_state WHERE state_hash = ?").get(stateHash);
    expect(stateRecord).toBeTruthy();

    // Tamper the state record's user_id to simulate a different user initiating the flow
    db.run("UPDATE shopify_oauth_state SET user_id = 9999 WHERE state_hash = ?", [stateHash]);

    const query = { code: "test_code", shop: "user-mismatch.myshopify.com", state };
    const hmac = generateCallbackHmac(query as Record<string, string>, "test_client_secret");
    const qs = new URLSearchParams({ ...query, hmac }).toString();

    const res = await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toMatch(/mismatch/i);
  });

  it("rejects concurrent duplicate callback attempts (atomic one-time consumption)", async () => {
    const authRes = await fetch(`${appUrl}/api/shopify/auth?shop=atomic-test.myshopify.com`, {
      redirect: "manual",
      headers: { Authorization: `Bearer ${token}` },
    });
    const authUrl = new URL(authRes.headers.get("location")!);
    const state = authUrl.searchParams.get("state")!;

    const query = { code: "test_code", shop: "atomic-test.myshopify.com", state };
    const hmac = generateCallbackHmac(query as Record<string, string>, "test_client_secret");
    const qs = new URLSearchParams({ ...query, hmac }).toString();

    const originalFetch = global.fetch;
    (global as any).fetch = mock(async (input: any, init?: any) => {
      const urlStr = input.toString();
      if (urlStr.includes("/admin/oauth/access_token")) {
        return new Response(JSON.stringify({
          access_token: "shpat_test_atomic",
          scope: "read_orders,read_products,read_inventory,read_locations",
        }));
      }
      if (urlStr.includes("/shop.json")) {
        return new Response(JSON.stringify({
          shop: { myshopify_domain: "atomic-test.myshopify.com", email: "a@b.com", name: "Test" },
        }));
      }
      return originalFetch(input, init);
    });

    try {
      const [res1, res2] = await Promise.all([
        fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" }),
        fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      const successCount = statuses.filter((s) => s === 200 || s === 302).length;
      const rejectCount = statuses.filter((s) => s === 400 || s === 403).length;

      expect(successCount).toBeLessThanOrEqual(1);
      expect(rejectCount).toBeGreaterThanOrEqual(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // -- Generic credential-insertion containment --

  it("generic provider route does not accept raw Shopify access credentials", async () => {
    // Verify that generic provider/configuration routes cannot insert raw credentials.
    const res = await fetch(`${appUrl}/api/providers/shopify/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        shopDomain: "evil.myshopify.com",
        accessToken: "shpat_raw_direct_token",
        scopes: "read_orders,write_orders",
      }),
    });
    // Route must not exist or must reject the raw credential insertion
    expect([404, 400, 401, 403, 405]).toContain(res.status);
  });

});
