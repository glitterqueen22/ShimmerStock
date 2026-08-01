/**
 * Auth tests: login, logout, password hashes in responses.
 */
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { setupTest, loginAs } from "./helpers/test-harness.js";

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

describe("POST /api/auth/login", () => {
  it("succeeds with valid credentials and returns a session token", async () => {
    const res = await fetch(`${appUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "owner_a", password: "test1234" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBeDefined();
    expect(typeof data.token).toBe("string");
    expect(data.token.length).toBeGreaterThan(10);
    expect(data.user).toBeDefined();
    expect(data.user.username).toBe("owner_a");
    expect(data.user.role).toBe("owner");
    expect(data.user.business_id).toBe(1);
  });

  it("returns 401 for wrong password", async () => {
    const res = await fetch(`${appUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "owner_a", password: "wrongpassword" }),
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/invalid/i);
  });

  it("returns 401 for unknown username", async () => {
    const res = await fetch(`${appUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "nonexistent_user", password: "anything" }),
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/invalid/i);
  });

  it("never returns password_hash in the response body", async () => {
    const res = await fetch(`${appUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "owner_a", password: "test1234" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    const bodyStr = JSON.stringify(data);
    expect(bodyStr).not.toContain("password_hash");
    expect(bodyStr).not.toContain("$2b$");
    expect(bodyStr).not.toContain("$2a$");
    // Also check the user object
    expect(data.user.password_hash).toBeUndefined();
    expect(data.user.password).toBeUndefined();
  });

  it("returns user business list with correct business info", async () => {
    const res = await fetch(`${appUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "owner_a", password: "test1234" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.businesses).toBeDefined();
    expect(Array.isArray(data.user.businesses)).toBe(true);
    expect(data.user.businesses.length).toBeGreaterThanOrEqual(1);
    expect(data.user.businesses[0].business_id).toBe(1);
  });
});

describe("POST /api/auth/logout", () => {
  it("invalidates the session so it can no longer be used", async () => {
    const token = await loginAs(appUrl, "owner_a", "test1234");

    // Verify the token works
    const meRes1 = await fetch(`${appUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes1.status).toBe(200);

    // Logout
    const logoutRes = await fetch(`${appUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(logoutRes.status).toBe(200);

    // Token should now be rejected
    const meRes2 = await fetch(`${appUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes2.status).toBe(401);
  });
});

describe("POST /api/auth/forgot-password", () => {
  it("does not return resetToken in the response", async () => {
    const res = await fetch(`${appUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "owner_a" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe("If that account exists, a reset link has been sent.");
    expect(data.resetToken).toBeUndefined();
  });
});
