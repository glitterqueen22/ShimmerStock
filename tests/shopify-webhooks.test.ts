import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { setupTest } from "./helpers/test-harness.js";
import crypto from "crypto";

let appUrl: string;
let db: any;
let cleanup: () => Promise<void>;
let businessId = 1;

beforeAll(async () => {
  process.env.SHOPIFY_CLIENT_SECRET = "test_webhook_secret";
  process.env.SHIMMERSTOCK_URL = "http://localhost:3000";

  const env = await setupTest();
  appUrl = env.appUrl;
  db = env.db;
  cleanup = env.cleanup;

  // Insert active provider credentials so the webhook route can resolve the businessId
  db.run(`
    INSERT INTO provider_credentials (business_id, provider, credentials, is_active, shop_domain, sync_status, last_synced_at, updated_at)
    VALUES (?, 'shopify', '{}', 1, 'test.myshopify.com', 'connected', datetime('now'), datetime('now'))
  `, [businessId]);
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

function generateWebhookHmac(rawBody: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
}

describe("Shopify Webhooks", () => {
  it("rejects webhook missing HMAC signature", async () => {
    const payload = JSON.stringify({ id: 12345, title: "Test Product" });
    const res = await fetch(`${appUrl}/api/shopify/webhooks/products-update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Shop-Domain": "test.myshopify.com",
        "X-Shopify-Webhook-Id": "wh_1"
      },
      body: payload
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Invalid HMAC signature");
  });

  it("rejects webhook with tampered body", async () => {
    const originalPayload = JSON.stringify({ id: 12345, price: "10.00" });
    const hmac = generateWebhookHmac(originalPayload, "test_webhook_secret");

    const tamperedPayload = JSON.stringify({ id: 12345, price: "1.00" });

    const res = await fetch(`${appUrl}/api/shopify/webhooks/products-update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Shop-Domain": "test.myshopify.com",
        "X-Shopify-Hmac-SHA256": hmac,
        "X-Shopify-Webhook-Id": "wh_2"
      },
      body: tamperedPayload
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Invalid HMAC signature");
  });

  it("accepts webhook with valid HMAC signature", async () => {
    const payload = JSON.stringify({ id: 12345, title: "Test Product" });
    const hmac = generateWebhookHmac(payload, "test_webhook_secret");

    const res = await fetch(`${appUrl}/api/shopify/webhooks/products-update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Shop-Domain": "test.myshopify.com",
        "X-Shopify-Hmac-SHA256": hmac,
        "X-Shopify-Webhook-Id": "wh_3"
      },
      body: payload
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify it was logged in shopify_webhook_deliveries
    const delivery = db.query("SELECT * FROM shopify_webhook_deliveries WHERE shopify_id = 'wh_3'").get();
    expect(delivery).toBeTruthy();
    expect(delivery.business_id).toBe(businessId);
    expect(delivery.processed).toBe(1);
  });

  it("prevents duplicate/replay processing for the same order", async () => {
    const orderPayload = {
      id: 999999,
      order_number: 1005,
      customer: { first_name: "John", last_name: "Doe" },
      line_items: [
        { sku: "SKU-A1", title: "Product A1", quantity: 2, variant_id: 111 }
      ]
    };
    
    const payloadStr = JSON.stringify(orderPayload);
    const hmac = generateWebhookHmac(payloadStr, "test_webhook_secret");

    // Send first time
    const res1 = await fetch(`${appUrl}/api/shopify/webhooks/orders-create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Shop-Domain": "test.myshopify.com",
        "X-Shopify-Hmac-SHA256": hmac,
        "X-Shopify-Webhook-Id": "wh_4_initial"
      },
      body: payloadStr
    });
    
    expect(res1.status).toBe(200);
    
    // Check order created
    const orders1 = db.query("SELECT * FROM orders WHERE shopify_order_id = '999999' AND business_id = ?").all(businessId);
    expect(orders1.length).toBe(1);
    
    // Send second time (replay/duplicate)
    const res2 = await fetch(`${appUrl}/api/shopify/webhooks/orders-create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Shop-Domain": "test.myshopify.com",
        "X-Shopify-Hmac-SHA256": hmac,
        "X-Shopify-Webhook-Id": "wh_4_replay"
      },
      body: payloadStr
    });
    
    expect(res2.status).toBe(200);

    // Check that there is STILL only 1 order with that shopify_order_id
    const orders2 = db.query("SELECT * FROM orders WHERE shopify_order_id = '999999' AND business_id = ?").all(businessId);
    expect(orders2.length).toBe(1); // Should not have created a second order
  });
});
