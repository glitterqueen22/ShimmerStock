import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { initDb } from "../server/db.js";
import { setupTest, loginAs } from "./helpers/test-harness.js";

let appUrl: string;
let cleanup: (() => Promise<void>) | undefined;
let tokenOwner: string;
let tokenViewer: string;
let testDb: Database;

beforeAll(async () => {
  const env = await setupTest();
  appUrl = env.appUrl;
  cleanup = env.cleanup;
  testDb = env.db;
  tokenOwner = await loginAs(appUrl, "owner_a", "test1234");
  tokenViewer = await loginAs(appUrl, "viewer_a", "test1234");
});

afterAll(async () => {
  if (cleanup) await cleanup();
});

async function authGet(path: string, token: string) {
  return fetch(`${appUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe("pilot orders context regressions", () => {
  it("owner can read CS unread count", async () => {
    const res = await authGet("/api/cs/unread-count", tokenOwner);
    expect(res.status).toBe(200);
    const data = await res.json() as { total: number };
    expect(typeof data.total).toBe("number");
  });

  it("viewer remains blocked from CS unread count", async () => {
    const res = await authGet("/api/cs/unread-count", tokenViewer);
    expect(res.status).toBe(403);
  });

  it("uses the newly selected business for subsequent API requests", async () => {
    const owner = testDb.query("SELECT id FROM users WHERE username = 'owner_a'").get() as { id: number };
    testDb.run(
      "INSERT INTO user_businesses (user_id, business_id, role, is_active) VALUES (?, 2, 'owner', 0)",
      [owner.id],
    );

    const switchRes = await fetch(`${appUrl}/api/businesses/2/activate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenOwner}` },
    });
    expect(switchRes.status).toBe(200);

    const productsRes = await authGet("/api/products", tokenOwner);
    expect(productsRes.status).toBe(200);
    const products = await productsRes.json() as Array<{ name: string }>;
    expect(products.length).toBeGreaterThan(0);
    expect(products.every((product) => product.name.startsWith("Product B"))).toBe(true);
  });

  it("Novi summary returns a safe empty summary when optional tables are missing", async () => {
    const dbPath = `/tmp/shimmerstock-novi-summary-${crypto.randomUUID()}.db`;
    const db = initDb(dbPath);

    db.run("DROP TABLE IF EXISTS purchase_orders");
    db.run("DROP TABLE IF EXISTS packing_recipes");

    const business = db.query("SELECT id FROM businesses LIMIT 1").get() as { id: number } | null;
    expect(business).not.toBeNull();

    const { getExecutiveSummary } = await import(`../server/novi-evolution.js?summary=${Math.random()}`);
    const summary = getExecutiveSummary(db as Database, business!.id);

    expect(summary.today.orders).toBeGreaterThanOrEqual(0);
    expect(summary.today.issues.length).toBeGreaterThan(0);
    expect(summary.packingRecipesCount).toBe(0);

    db.close();
    await Bun.file(dbPath).delete().catch(() => {});
    await Bun.file(`${dbPath}-wal`).delete().catch(() => {});
    await Bun.file(`${dbPath}-shm`).delete().catch(() => {});
  });
});