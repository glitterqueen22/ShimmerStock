import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { loginAs, setupTest } from "./helpers/test-harness.js";

let appUrl: string;
let cleanup: (() => Promise<void>) | undefined;

beforeAll(async () => {
  const env = await setupTest();
  appUrl = env.appUrl;
  cleanup = env.cleanup;
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

function request(path: string, token: string, options: RequestInit = {}) {
  return fetch(`${appUrl}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers },
  });
}

describe("Settings account, support, and current access", () => {
  it("returns tenant-scoped usage and never invents billing details", async () => {
    const token = await loginAs(appUrl, "owner_a", "test1234");
    const response = await request("/api/settings/overview?business_id=2", token);
    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data.business.id).toBe(1);
    expect(data.business.name).toBe("Business A");
    expect(data.access.name).toBe("Early Access");
    expect(data.access.usage.products).toBe(2);
    expect(data.access.recommendation.verdict).toBe("STAY_PUT");
    expect(data.access.billing).toEqual({ configured: false, renewalDate: null, paymentMethod: null, invoices: [] });
    expect(JSON.stringify(data)).not.toContain("access_token");
    expect(JSON.stringify(data)).not.toContain("password_hash");
  });

  it("persists support in the authenticated tenant and returns a real reference", async () => {
    const tokenA = await loginAs(appUrl, "owner_a", "test1234");
    const tokenB = await loginAs(appUrl, "owner_b", "test1234");
    const create = await request("/api/settings/support-requests", tokenA, {
      method: "POST",
      body: JSON.stringify({
        business_id: 2,
        category: "inventory",
        subject: "Inventory total needs review",
        message: "A tracked product total does not match what I expected.",
        safeContext: { currentRoute: "/products", importId: "42", accessToken: "must-not-store" },
      }),
    });
    expect(create.status).toBe(201);
    const created = await create.json() as any;
    expect(created.persisted).toBe(true);
    expect(created.status).toBe("received");
    expect(created.reference).toMatch(/^SUP-\d{6}$/);

    const ownList = await request("/api/settings/support-requests", tokenA);
    const ownData = await ownList.json() as any;
    expect(ownData.requests).toHaveLength(1);
    expect(ownData.requests[0].reference).toBe(created.reference);
    expect(ownData.requests[0].safeContext).toEqual({ currentRoute: "/products", importId: "42" });
    expect(JSON.stringify(ownData)).not.toContain("must-not-store");

    const otherList = await request("/api/settings/support-requests", tokenB);
    expect((await otherList.json() as any).requests).toHaveLength(0);
  });

  it("rejects support content that appears to contain credentials", async () => {
    const token = await loginAs(appUrl, "owner_a", "test1234");
    const response = await request("/api/settings/support-requests", token, {
      method: "POST",
      body: JSON.stringify({
        category: "technical",
        subject: "Connection issue",
        message: "Authorization: Bearer definitely-not-safe-to-store",
      }),
    });
    expect(response.status).toBe(400);
  });

  it("requires password confirmation and invalidates every other session", async () => {
    const currentToken = await loginAs(appUrl, "viewer_a", "test1234");
    const otherToken = await loginAs(appUrl, "viewer_a", "test1234");
    const wrongCurrent = await request("/api/auth/change-password", currentToken, {
      method: "POST",
      body: JSON.stringify({ currentPassword: "wrong", newPassword: "newpass1234", newPasswordConfirmation: "newpass1234" }),
    });
    expect(wrongCurrent.status).toBe(401);

    const mismatch = await request("/api/auth/change-password", currentToken, {
      method: "POST",
      body: JSON.stringify({ currentPassword: "test1234", newPassword: "newpass1234", newPasswordConfirmation: "different1234" }),
    });
    expect(mismatch.status).toBe(400);

    const changed = await request("/api/auth/change-password", currentToken, {
      method: "POST",
      body: JSON.stringify({ userId: 999, currentPassword: "test1234", newPassword: "newpass1234", newPasswordConfirmation: "newpass1234" }),
    });
    expect(changed.status).toBe(200);
    expect(JSON.stringify(await changed.json())).not.toContain("password_hash");

    expect((await request("/api/auth/me", otherToken)).status).toBe(401);
    expect((await request("/api/auth/me", currentToken)).status).toBe(200);
    const oldLogin = await fetch(`${appUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "viewer_a", password: "test1234" }),
    });
    expect(oldLogin.status).toBe(401);
    const newLogin = await fetch(`${appUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "viewer_a", password: "newpass1234" }),
    });
    expect(newLogin.status).toBe(200);
  });
});