/**
 * Session expiry tests.
 */
import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { setupTest, loginAs } from "./helpers/test-harness.js";
import { Database } from "bun:sqlite";

let appUrl: string;
let dbPath: string;
let cleanup: (() => Promise<void>) | undefined;

beforeAll(async () => {
  const env = await setupTest();
  appUrl = env.appUrl;
  dbPath = env.dbPath;
  cleanup = env.cleanup;
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

describe("Session expiry", () => {
  it("a valid session is accepted", async () => {
    const token = await loginAs(appUrl, "owner_a", "test1234");
    const res = await fetch(`${appUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.username).toBe("owner_a");
  });

  it("an expired session is rejected with 401", async () => {
    // Login to create a session, then manually expire it in the DB
    const token = await loginAs(appUrl, "owner_a", "test1234");

    // Verify it works first
    const res1 = await fetch(`${appUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res1.status).toBe(200);

    // Manually expire the session by updating expires_at in the DB
    const db = new Database(dbPath);
    db.run("UPDATE sessions SET expires_at = ? WHERE token = ?", [
      "2020-01-01T00:00:00.000Z",
      token,
    ]);
    db.close();

    // Now the session should be rejected
    const res2 = await fetch(`${appUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res2.status).toBe(401);
    const data2 = await res2.json() as any;
    expect(data2.error).toMatch(/expired/i);
  });

  it("a nonexistent token is rejected with 401", async () => {
    const res = await fetch(`${appUrl}/api/auth/me`, {
      headers: { Authorization: "Bearer nonexistent-token-12345" },
    });
    expect(res.status).toBe(401);
  });

  it("a missing Authorization header is rejected with 401", async () => {
    const res = await fetch(`${appUrl}/api/auth/me`);
    expect(res.status).toBe(401);
  });
});
