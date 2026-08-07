import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { setupTest } from "./helpers/test-harness.js";
import { sanitizeLogContext } from "../server/logging.js";

let appUrl: string;
let cleanup: (() => Promise<void>) | undefined;
let db: any;

beforeAll(async () => {
  const env = await setupTest({
    env: {
      NODE_ENV: "production",
      SHIMMERSTOCK_PRIVATE_MODE: "true",
      SHIMMERSTOCK_URL: "https://staging.example.test",
    },
  });
  appUrl = env.appUrl;
  db = env.db;
  cleanup = env.cleanup;
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

async function loginWithCookie() {
  const res = await fetch(`${appUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "owner_a", password: "test1234" }),
  });
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie");
  expect(cookie).toContain("token=");
  return cookie as string;
}

function tableRowCount(tableName: "dream_grant_applications" | "waitlist" | "partner_application_submissions" | "affiliate_tracking_cookies" | "early_access_applications") {
  const row = db.query(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
  return row.count;
}

describe("Private staging health and readiness", () => {
  it("GET /health returns 200 without exposing sensitive internals", async () => {
    const res = await fetch(`${appUrl}/health`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toEqual({ status: "ok" });
    expect(JSON.stringify(data)).not.toContain("shimmerstock.db");
  });

  it("GET /ready returns 200 once app dependencies are ready", async () => {
    const res = await fetch(`${appUrl}/ready`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toEqual({ status: "ready" });
  });
});

describe("Private staging access control", () => {
  it("blocks public self-service registration in private mode", async () => {
    const res = await fetch(`${appUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "public_signup",
        password: "publicpass1234",
        displayName: "Public Signup",
        businessName: "Public Signup Co",
      }),
    });
    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toContain("disabled");
  });

  it("keeps existing authenticated access working in private mode", async () => {
    const cookie = await loginWithCookie();
    const me = await fetch(`${appUrl}/api/auth/me`, {
      headers: { Cookie: cookie },
    });
    expect(me.status).toBe(200);
  });

  it("does not expose the session token in private-mode login responses", async () => {
    const res = await fetch(`${appUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "owner_a", password: "test1234" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.token).toBeUndefined();
    expect(data.user?.username).toBe("owner_a");
  });

  it("blocks Dream Grant submissions and prevents writes in private mode", async () => {
    const beforeCount = tableRowCount("dream_grant_applications");
    const res = await fetch(`${appUrl}/api/dream-grant/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Public Applicant",
        email: "public@example.test",
        dream: "Grow faster",
        build: "Operations platform",
        change: "How small brands scale",
      }),
    });

    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toContain("disabled");
    expect(tableRowCount("dream_grant_applications")).toBe(beforeCount);
  });

  it("blocks waitlist submissions and prevents writes in private mode", async () => {
    const beforeCount = tableRowCount("waitlist");
    const res = await fetch(`${appUrl}/api/waitlist/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Public Waitlist",
        email: "waitlist@example.test",
        business_type: "DTC",
      }),
    });

    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toContain("disabled");
    expect(tableRowCount("waitlist")).toBe(beforeCount);
  });

  it("blocks public partner application submissions and prevents writes in private mode", async () => {
    const beforeCount = tableRowCount("partner_application_submissions");
    const res = await fetch(`${appUrl}/api/partner/forms/999/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicant_email: "partner@example.test",
        applicant_name: "Partner Applicant",
      }),
    });

    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toContain("disabled");
    expect(tableRowCount("partner_application_submissions")).toBe(beforeCount);
  });

  it("blocks affiliate click tracking submissions and prevents writes in private mode", async () => {
    const beforeCount = tableRowCount("affiliate_tracking_cookies");
    const res = await fetch(`${appUrl}/api/affiliate-attribution/track-click`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        linkCode: "test-link",
        visitorId: "visitor-1",
      }),
    });

    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toContain("disabled");
    expect(tableRowCount("affiliate_tracking_cookies")).toBe(beforeCount);
  });
});

describe("Private staging session cookies", () => {
  it("sets secure HttpOnly SameSite cookies on login", async () => {
    const res = await fetch(`${appUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "owner_a", password: "test1234" }),
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toContain("token=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
  });

  it("clears the session cookie on logout", async () => {
    const cookie = await loginWithCookie();
    const logout = await fetch(`${appUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(logout.status).toBe(200);
    const setCookie = logout.headers.get("set-cookie") || "";
    expect(setCookie).toContain("token=");
    expect(setCookie).toMatch(/Expires=/i);
  });
});

describe("Sensitive log redaction", () => {
  it("redacts secrets from structured log context", () => {
    const sanitized = sanitizeLogContext({
      authorization: "Bearer secret-token",
      cookie: "token=abc123",
      nested: { password: "supersecret" },
      ok: "safe",
    });

    expect(sanitized).toEqual({
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      nested: { password: "[REDACTED]" },
      ok: "safe",
    });
  });
});

const validEarlyAccessPayload = {
  first_name: "Test",
  last_name: "Operator",
  email: "early-access-test@example.test",
  business_name: "Test Supplies Co",
  website_url: "",
  what_business_sells: "Craft supplies and maker kits",
  business_category: "craft_maker_supplies",
  current_commerce_platform: "shopify",
  monthly_order_range: "101_500",
  team_size: "2_5",
  biggest_operational_challenge: "Managing inventory across multiple suppliers",
  plan_interest: "grow",
  consent: true,
  privacy_acknowledged: true,
  fax_number: "",
};

describe("Early Access application endpoint — private staging closed state", () => {
  it("blocks early access application in private staging mode", async () => {
    const beforeCount = tableRowCount("early_access_applications");
    const res = await fetch(`${appUrl}/api/early-access/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validEarlyAccessPayload),
    });
    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toContain("disabled");
    expect(tableRowCount("early_access_applications")).toBe(beforeCount);
  });

  it("rejects missing required fields", async () => {
    const res = await fetch(`${appUrl}/api/early-access/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "incomplete@example.test" }),
    });
    expect(res.status).toBe(403); // private mode rejects before validation
    const data = await res.json() as any;
    expect(data.error).toContain("disabled");
  });

  it("GET /api/public/runtime returns privateMode=true in staging", async () => {
    const res = await fetch(`${appUrl}/api/public/runtime`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.privateMode).toBe(true);
    expect(data.noindex).toBe(true);
  });
});