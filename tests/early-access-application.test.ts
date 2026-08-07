import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { setupTest } from "./helpers/test-harness.js";

let appUrl: string;
let cleanup: (() => Promise<void>) | undefined;
let db: any;

beforeAll(async () => {
  const env = await setupTest({
    env: { NODE_ENV: "development" },
  });
  appUrl = env.appUrl;
  db = env.db;
  cleanup = env.cleanup;
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

function rowCountApplications(): number {
  const row = db.query("SELECT COUNT(*) as count FROM early_access_applications").get() as { count: number };
  return row.count;
}

const validPayload = {
  first_name: "Dana",
  last_name: "Maker",
  email: "dana.maker@example.test",
  business_name: "Sparkle Supply Co",
  website_url: "",
  what_business_sells: "Craft kits and blank apparel",
  business_category: "craft_maker_supplies",
  current_commerce_platform: "shopify",
  monthly_order_range: "101_500",
  team_size: "2_5",
  biggest_operational_challenge: "Managing supplier lead times and backorders",
  plan_interest: "grow",
  consent: true,
  privacy_acknowledged: true,
  fax_number: "",
};

describe("GET /api/public/runtime", () => {
  it("returns privateMode=false in development mode", async () => {
    const res = await fetch(`${appUrl}/api/public/runtime`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.privateMode).toBe(false);
    expect(data.noindex).toBe(false);
    expect(typeof data.dreamGrantOpen).toBe("boolean");
    expect(typeof data.siteOrigin).toBe("string");
  });
});

describe("POST /api/early-access/apply", () => {
  it("accepts a valid complete application", async () => {
    const before = rowCountApplications();
    const res = await fetch(`${appUrl}/api/early-access/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(rowCountApplications()).toBe(before + 1);
  });

  it("returns success without a duplicate write for the same email", async () => {
    const before = rowCountApplications();
    const res = await fetch(`${appUrl}/api/early-access/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPayload, email: "dana.maker@example.test" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.duplicate).toBe(true);
    expect(rowCountApplications()).toBe(before);
  });

  it("normalizes email to lowercase before dedup", async () => {
    const before = rowCountApplications();
    const res = await fetch(`${appUrl}/api/early-access/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPayload, email: "DANA.MAKER@EXAMPLE.TEST" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.duplicate).toBe(true);
    expect(rowCountApplications()).toBe(before);
  });

  it("rejects a missing required field", async () => {
    const res = await fetch(`${appUrl}/api/early-access/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPayload, first_name: "" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toBeTruthy();
  });

  it("rejects an invalid email", async () => {
    const res = await fetch(`${appUrl}/api/early-access/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPayload, email: "not-an-email", business_name: "Dup guard" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("email");
  });

  it("rejects when consent is missing", async () => {
    const res = await fetch(`${appUrl}/api/early-access/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPayload, email: "noconsent@example.test", consent: false }),
    });
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Consent");
  });

  it("silently accepts honeypot submissions without persisting", async () => {
    const before = rowCountApplications();
    const res = await fetch(`${appUrl}/api/early-access/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPayload, email: "bot@spam.example.test", fax_number: "555-9999" }),
    });
    expect(res.status).toBe(202);
    expect(rowCountApplications()).toBe(before);
  });

  it("rejects invalid plan_interest values", async () => {
    const res = await fetch(`${appUrl}/api/early-access/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPayload, email: "badplan@example.test", plan_interest: "enterprise" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("plan");
  });

  it("rejects invalid website URL", async () => {
    const res = await fetch(`${appUrl}/api/early-access/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPayload, email: "badurl@example.test", website_url: "not-a-url" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("URL");
  });

  it("does not log or expose PII in the response payload", async () => {
    const res = await fetch(`${appUrl}/api/early-access/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPayload, email: "piicheck@example.test" }),
    });
    const body = await res.text();
    expect(body).not.toContain("piicheck@example.test");
  });
});
