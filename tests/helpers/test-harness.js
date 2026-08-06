/**
 * Test harness for ShimmerStock.
 *
 * Provides isolated DBs, fixture seeding, and authenticated HTTP helpers
 * for testing the Express app without touching the live shimmerstock.db.
 *
 * Usage in a test file:
 *   import { setupTest, teardownTest, loginAs } from "./helpers/test-harness.js";
 *
 *   const { appUrl, db, cleanup } = await setupTest();
 *   const token = await loginAs(appUrl, "owner_a", "test1234");
 *   // ... tests ...
 *   await cleanup();
 */

import http from "http";
import { Database } from "bun:sqlite";
import { initDb } from "../../server/db.js";
import * as store from "../../server/store.js";
import { hashPassword } from "../../server/auth.js";
import fs from "fs";
import {
  TEST_OWNER_INITIAL_PASSWORD,
  TEST_ADMIN_INITIAL_PASSWORD,
} from "./bootstrap-creds.js";

// ── Schema helpers ────────────────────────────────────────────────────────

/**
 * Create an isolated SQLite DB at a temp path, run full schema + migrations,
 * and seed the standard test fixture.
 * Returns { db, dbPath }.
 */
export function createTestDb() {
  const dbPath = `/tmp/shimmerstock-test-${crypto.randomUUID()}.db`;
  // Supply explicit test-only bootstrap credentials so production validation passes.
  // These credentials are used only for the seeded accounts; seedFixtures() wipes
  // and replaces them immediately after, so the values never reach production.
  const savedOwner = process.env.OWNER_INITIAL_PASSWORD;
  const savedAdmin = process.env.ADMIN_INITIAL_PASSWORD;
  process.env.OWNER_INITIAL_PASSWORD = TEST_OWNER_INITIAL_PASSWORD;
  process.env.ADMIN_INITIAL_PASSWORD = TEST_ADMIN_INITIAL_PASSWORD;
  let db;
  try {
    db = initDb(dbPath);
  } finally {
    if (savedOwner !== undefined) {
      process.env.OWNER_INITIAL_PASSWORD = savedOwner;
    } else {
      delete process.env.OWNER_INITIAL_PASSWORD;
    }
    if (savedAdmin !== undefined) {
      process.env.ADMIN_INITIAL_PASSWORD = savedAdmin;
    } else {
      delete process.env.ADMIN_INITIAL_PASSWORD;
    }
  }
  seedFixtures(db);
  return { db, dbPath };
}

/**
 * Seed minimal multi-tenant fixtures:
 * - Business A (id=1): owner_a (owner role), viewer_a (viewer role)
 * - Business B (id=2): owner_b (owner role), viewer_b (viewer role)
 * - Each business gets 2 products, 1 order, 1 inventory movement
 */
export function seedFixtures(db) {
  // The initDb already created a default business (id=1) and seeded owner/admin.
  // We need to clean that up and create our own fixtures for predictable tests.

  // Wipe auto-seeded data — disable FK checks since many tables reference businesses
  db.run("PRAGMA foreign_keys = OFF");
  db.run("DELETE FROM user_businesses");
  db.run("DELETE FROM sessions");
  db.run("DELETE FROM users");
  db.run("DELETE FROM businesses");
  db.run("DELETE FROM products");
  db.run("DELETE FROM orders");
  db.run("DELETE FROM order_items");
  db.run("DELETE FROM order_scans");
  db.run("DELETE FROM inventory_movements");
  db.run("PRAGMA foreign_keys = ON");

  // ── Business A ────────────────────────────────────────────────────
  db.run("INSERT INTO businesses (id, name, slug) VALUES (1, 'Business A', 'business-a')");

  // ── Business B ────────────────────────────────────────────────────
  db.run("INSERT INTO businesses (id, name, slug) VALUES (2, 'Business B', 'business-b')");

  // ── Users ─────────────────────────────────────────────────────────
  const ownerHash = Bun.password.hashSync("test1234");
  const viewerHash = Bun.password.hashSync("test1234");

  // owner_a (business A owner)
  const ownerA = db.run(
    "INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)",
    ["owner_a", ownerHash, "Owner A", "owner"]
  );
  const ownerAId = ownerA.lastInsertRowid;

  // viewer_a (business A viewer — limited role)
  const viewerA = db.run(
    "INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)",
    ["viewer_a", viewerHash, "Viewer A", "viewer"]
  );
  const viewerAId = viewerA.lastInsertRowid;

  // owner_b (business B owner)
  const ownerB = db.run(
    "INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)",
    ["owner_b", ownerHash, "Owner B", "owner"]
  );
  const ownerBId = ownerB.lastInsertRowid;

  // viewer_b (business B viewer)
  const viewerB = db.run(
    "INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)",
    ["viewer_b", viewerHash, "Viewer B", "viewer"]
  );
  const viewerBId = viewerB.lastInsertRowid;

  // ── User-Business assignments ──────────────────────────────────────
  db.run("INSERT INTO user_businesses (user_id, business_id, role, is_active) VALUES (?, 1, 'owner', 1)", [ownerAId]);
  db.run("INSERT INTO user_businesses (user_id, business_id, role, is_active) VALUES (?, 1, 'viewer', 1)", [viewerAId]);
  db.run("INSERT INTO user_businesses (user_id, business_id, role, is_active) VALUES (?, 2, 'owner', 1)", [ownerBId]);
  db.run("INSERT INTO user_businesses (user_id, business_id, role, is_active) VALUES (?, 2, 'viewer', 1)", [viewerBId]);

  // ── Products ──────────────────────────────────────────────────────
  // Business A products
  db.run("INSERT INTO products (name, sku, barcode, stock_count, business_id) VALUES (?, ?, ?, ?, 1)",
    ["Product A1", "SKU-A1", "BARCODE-A1", 100]);
  db.run("INSERT INTO products (name, sku, barcode, stock_count, business_id) VALUES (?, ?, ?, ?, 1)",
    ["Product A2", "SKU-A2", "BARCODE-A2", 50]);

  // Business B products
  db.run("INSERT INTO products (name, sku, barcode, stock_count, business_id) VALUES (?, ?, ?, ?, 2)",
    ["Product B1", "SKU-B1", "BARCODE-B1", 200]);
  db.run("INSERT INTO products (name, sku, barcode, stock_count, business_id) VALUES (?, ?, ?, ?, 2)",
    ["Product B2", "SKU-B2", "BARCODE-B2", 75]);

  // ── Orders ────────────────────────────────────────────────────────
  // Business A orders
  db.run("INSERT INTO orders (order_number, customer_name, source, status, business_id) VALUES (?, ?, ?, ?, 1)",
    [1001, "Customer A", "manual", "pending"]);
  const orderAId = db.query("SELECT last_insert_rowid() as id").get().id;
  db.run("INSERT INTO order_items (order_id, product_id, sku, quantity, business_id) VALUES (?, 1, 'SKU-A1', 2, 1)", [orderAId]);

  // Business B orders
  db.run("INSERT INTO orders (order_number, customer_name, source, status, business_id) VALUES (?, ?, ?, ?, 2)",
    [2001, "Customer B", "manual", "pending"]);
  const orderBId = db.query("SELECT last_insert_rowid() as id").get().id;
  db.run("INSERT INTO order_items (order_id, product_id, sku, quantity, business_id) VALUES (?, 4, 'SKU-B1', 3, 2)", [orderBId]);

  // ── Inventory movements ───────────────────────────────────────────
  db.run("INSERT INTO inventory_movements (product_id, type, quantity, business_id) VALUES (1, 'in', 100, 1)");
  db.run("INSERT INTO inventory_movements (product_id, type, quantity, business_id) VALUES (4, 'in', 200, 2)");

  return {
    businessAId: 1,
    businessBId: 2,
    ownerAId,
    viewerAId,
    ownerBId,
    viewerBId,
  };
}

// ── App helpers ────────────────────────────────────────────────────────────

/**
 * Start the Express app on an ephemeral port and return { appUrl, server }.
 * Must be called AFTER setting ENCRYPTION_KEY and SHIMMERSTOCK_TEST in env,
 * and after creating the test DB.
 */
export async function startTestApp(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      const appUrl = `http://127.0.0.1:${port}`;
      resolve({ appUrl, server });
    });
    server.on("error", reject);
  });
}

/**
 * Login as a user and return the session token.
 */
export async function loginAs(appUrl, username, password) {
  const res = await fetch(`${appUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Login failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data.token;
}

/**
 * Set up a complete test environment:
 * 1. Creates isolated DB with fixtures
 * 2. Imports the Express app
 * 3. Starts on ephemeral port
 * Returns { appUrl, db, dbPath, server, cleanup }
 */
export async function setupTest() {
  // Ensure encryption key is valid before importing server code
  if (!/^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY || "")) {
    process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  }
  process.env.OWNER_INITIAL_PASSWORD = TEST_OWNER_INITIAL_PASSWORD;
  process.env.ADMIN_INITIAL_PASSWORD = TEST_ADMIN_INITIAL_PASSWORD;
  process.env.SHIMMERSTOCK_TEST = "1";

  const { db, dbPath } = createTestDb();
  process.env.SHIMMERSTOCK_DB_PATH = dbPath;

  // Now import the app — it will use our test DB
  const indexPath = `../../server/index.js?worker=${process.pid}-${Math.random()}`;
  const { app } = await import(indexPath);
  const { appUrl, server } = await startTestApp(app);

  return {
    appUrl,
    db,
    dbPath,
    server,
    cleanup: async () => {
      server.close();
      db.close();
      try { fs.unlinkSync(dbPath); } catch (_) { /* ok */ }
      try { fs.unlinkSync(dbPath + "-wal"); } catch (_) { /* ok */ }
      try { fs.unlinkSync(dbPath + "-shm"); } catch (_) { /* ok */ }
    },
  };
}

/**
 * Remove the test DB file(s).
 */
export function cleanupTestDb(db, dbPath) {
  db.close();
  try { fs.unlinkSync(dbPath); } catch (_) { /* ok */ }
  try { fs.unlinkSync(dbPath + "-wal"); } catch (_) { /* ok */ }
  try { fs.unlinkSync(dbPath + "-shm"); } catch (_) { /* ok */ }
}
