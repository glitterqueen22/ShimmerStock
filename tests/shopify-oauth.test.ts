import { describe, expect, it, beforeAll, afterAll, spyOn, mock } from "bun:test";
import { setupTest, loginAs } from "./helpers/test-harness.js";
import crypto from "crypto";

let appUrl: string;
let db: any;
let cleanup: () => Promise<void>;
let token: string;
let businessId = 1;

beforeAll(async () => {
  // Set env vars needed for Shopify OAuth
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
  it("redirects to Shopify authorize URL with correct state", async () => {
    const res = await fetch(`${appUrl}/api/shopify/auth?shop=test.myshopify.com`, {
      redirect: "manual",
      headers: { Authorization: `Bearer ${token}` }
    });

    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).toContain("https://test.myshopify.com/admin/oauth/authorize");
    
    const url = new URL(location!);
    expect(url.searchParams.get("client_id")).toBe("test_client_id");
    
    const state = url.searchParams.get("state");
    expect(state).toBeTruthy();
    
    const stateData = JSON.parse(Buffer.from(state!, "base64").toString("utf8"));
    expect(stateData.businessId).toBe(businessId);
    expect(stateData.nonce).toBeTruthy();
  });

  it("rejects callback with missing or forged state", async () => {
    const query = {
      code: "test_code",
      shop: "test.myshopify.com",
      state: "invalid_state",
    };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    query.hmac = generateCallbackHmac(query, "test_client_secret");

    const qs = new URLSearchParams(query as Record<string, string>).toString();
    const res = await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });
    
    // The handler returns a 400 JSON response for invalid state (unparseable)
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid state parameter");
  });

  it("rejects callback with invalid HMAC", async () => {
    const stateData = Buffer.from(JSON.stringify({ businessId, nonce: "1234" })).toString("base64");
    const query = {
      code: "test_code",
      shop: "test.myshopify.com",
      state: stateData,
      hmac: "forged_hmac_signature",
    };

    const qs = new URLSearchParams(query).toString();
    const res = await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });
    
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("Invalid HMAC signature");
  });

  it("successfully exchanges token and stores it encrypted", async () => {
    const stateData = Buffer.from(JSON.stringify({ businessId, nonce: "1234" })).toString("base64");
    const query = {
      code: "test_code",
      shop: "test.myshopify.com",
      state: stateData,
    };
    // @ts-ignore
    query.hmac = generateCallbackHmac(query, "test_client_secret");
    const qs = new URLSearchParams(query as Record<string, string>).toString();

    // Mock fetch for the 3 outbound calls: token exchange, shop info, webhooks
    const originalFetch = global.fetch;
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = input.toString();
      if (urlStr.includes("/admin/oauth/access_token")) {
        return new Response(JSON.stringify({ access_token: "shpat_12345", scope: "read_orders,read_products" }));
      }
      if (urlStr.includes("/admin/api/2024-01/shop.json")) {
        return new Response(JSON.stringify({ shop: { myshopify_domain: "test.myshopify.com", email: "owner@test.com", name: "Test Shop" } }));
      }
      if (urlStr.includes("/admin/api/2024-01/webhooks.json")) {
        return new Response(JSON.stringify({ webhook: { id: "webhook_123" } }));
      }
      return originalFetch(input, init);
    });
    global.fetch = fetchMock;

    try {
      const res = await fetch(`${appUrl}/api/shopify/auth/callback?${qs}`, { redirect: "manual" });
      
      // Should redirect to success
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toContain("shopify_connected=true");

      // Verify db state
      const row = db.query("SELECT * FROM provider_credentials WHERE business_id = ? AND provider = 'shopify'").get(businessId);
      expect(row).toBeTruthy();
      expect(row.shop_domain).toBe("test.myshopify.com");
      expect(row.shop_owner).toBe("owner@test.com");
      expect(row.shop_name).toBe("Test Shop");
      expect(row.sync_status).toBe("connected");
      expect(row.access_token_encrypted).not.toBe("shpat_12345"); // Should be encrypted
      expect(row.access_token_encrypted.length).toBeGreaterThan(20);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
