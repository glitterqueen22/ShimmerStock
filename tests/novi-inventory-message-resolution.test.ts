import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { initDb } from "../server/db.js";
import { runAllChecks, resolveRecoveredInventoryMessages } from "../server/novi-detection.js";
import * as store from "../server/store.js";

describe("Novi inventory message resolution", () => {
  let db: Database;
  let businessId: number;
  let productId: number;

  beforeEach(() => {
    process.env.OWNER_INITIAL_PASSWORD = "novi-resolve-test-owner-password";
    process.env.ADMIN_INITIAL_PASSWORD = "novi-resolve-test-admin-password";
    db = initDb(":memory:");
    businessId = Number((db.query("SELECT id FROM businesses LIMIT 1").get() as { id: number }).id);
    productId = Number(db.run(
      "INSERT INTO products (name, sku, stock_count, business_id) VALUES ('Vanilla Base', 'VB-1', 0, ?)",
      [businessId],
    ).lastInsertRowid);
  });

  afterEach(() => db.close());

  it("resolves a stale out-of-stock message once inventory truth recovers", () => {
    runAllChecks(db, businessId);
    expect(store.getNoviMessageCounts(db, businessId).unread).toBeGreaterThan(0);
    const messages = store.getNoviMessages(db, businessId, { status: "new" });
    expect(messages.some((m: any) => m.event_type === "out_of_stock")).toBe(true);

    db.run("UPDATE products SET stock_count = 40 WHERE id = ?", [productId]);
    const resolved = resolveRecoveredInventoryMessages(db, businessId);
    expect(resolved).toBeGreaterThan(0);

    const afterMessages = store.getNoviMessages(db, businessId, { status: "new" });
    expect(afterMessages.some((m: any) => m.event_type === "out_of_stock")).toBe(false);
  });

  it("resolves a stale low-inventory message once stock rises above the reorder point", () => {
    db.run("UPDATE products SET stock_count = 3 WHERE id = ?", [productId]);
    runAllChecks(db, businessId);
    const lowMessages = store.getNoviMessages(db, businessId, { status: "new" });
    expect(lowMessages.some((m: any) => m.event_type === "low_inventory")).toBe(true);

    db.run("UPDATE products SET stock_count = 50 WHERE id = ?", [productId]);
    runAllChecks(db, businessId);

    const afterMessages = store.getNoviMessages(db, businessId, { status: "new" });
    expect(afterMessages.some((m: any) => m.event_type === "low_inventory")).toBe(false);
  });

  it("keeps an active out-of-stock message when the product remains out of stock", () => {
    runAllChecks(db, businessId);
    const resolved = resolveRecoveredInventoryMessages(db, businessId);
    expect(resolved).toBe(0);
    expect(store.getNoviMessageCounts(db, businessId).unread).toBeGreaterThan(0);
  });

  it("never resolves messages belonging to a different tenant", () => {
    const otherBusinessId = Number(db.run("INSERT INTO businesses (name, slug) VALUES ('Other', 'other')").lastInsertRowid);
    runAllChecks(db, businessId);
    db.run("UPDATE products SET stock_count = 40 WHERE id = ?", [productId]);

    const resolvedForOther = resolveRecoveredInventoryMessages(db, otherBusinessId);
    expect(resolvedForOther).toBe(0);
    expect(store.getNoviMessages(db, businessId, { status: "new" }).some((m: any) => m.event_type === "out_of_stock")).toBe(true);
  });
});
