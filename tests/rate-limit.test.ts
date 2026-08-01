import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { setupTest } from "./helpers/test-harness.js";

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

describe("Auth Rate Limiting", () => {
  it("throttles repeated failed login attempts", async () => {
    // 5 failures
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${appUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "owner_a", password: "wrongpassword" }),
      });
      expect(res.status).toBe(401);
    }

    // 6th attempt should be 429
    const res6 = await fetch(`${appUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "owner_a", password: "wrongpassword" }),
    });
    expect(res6.status).toBe(429);
    const data6 = await res6.json();
    expect(data6.error).toMatch(/Too many failed login attempts/i);
  });

  it("resets failed counter on successful login", async () => {
    // 4 failures
    for (let i = 0; i < 4; i++) {
      const res = await fetch(`${appUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "viewer_a", password: "wrongpassword" }),
      });
      expect(res.status).toBe(401);
    }

    // 1 success
    const resSuccess = await fetch(`${appUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "viewer_a", password: "test1234" }),
    });
    expect(resSuccess.status).toBe(200);

    // Following failure should be 401 again, not 429, because counter reset
    const resFailAfterSuccess = await fetch(`${appUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "viewer_a", password: "wrongpassword" }),
    });
    expect(resFailAfterSuccess.status).toBe(401);
  });

  it("throttles forgot-password abuse", async () => {
    // 3 attempts
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${appUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "owner_b" }),
      });
      expect(res.status).toBe(200);
    }

    // 4th attempt should be 429
    const res4 = await fetch(`${appUrl}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "owner_b" }),
    });
    expect(res4.status).toBe(429);
    const data4 = await res4.json();
    expect(data4.error).toMatch(/Too many password reset requests/i);
  });
});