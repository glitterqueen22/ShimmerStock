import { describe, expect, it } from "bun:test";
import fs from "fs";
import { initDb } from "../server/db.js";
import { getRuntimeConfig } from "../server/runtime-config.js";
import {
  TEST_ADMIN_INITIAL_PASSWORD,
  TEST_OWNER_INITIAL_PASSWORD,
} from "./helpers/bootstrap-creds.js";

function cleanupDb(dbPath: string) {
  try { fs.unlinkSync(dbPath); } catch {}
  try { fs.unlinkSync(`${dbPath}-wal`); } catch {}
  try { fs.unlinkSync(`${dbPath}-shm`); } catch {}
}

describe("Runtime config validation", () => {
  it("defaults PORT to 3000 when unset", () => {
    const cfg = getRuntimeConfig({ SHIMMERSTOCK_TEST: "true" } as Record<string, string>);
    expect(cfg.port).toBe(3000);
  });

  it("rejects invalid PORT values", () => {
    expect(() => getRuntimeConfig({ PORT: "70000", SHIMMERSTOCK_TEST: "true" } as Record<string, string>)).toThrow("PORT");
  });

  it("requires an https SHIMMERSTOCK_URL in private mode", () => {
    expect(() => getRuntimeConfig({ SHIMMERSTOCK_PRIVATE_MODE: "true" } as Record<string, string>)).toThrow("SHIMMERSTOCK_URL");
    expect(() => getRuntimeConfig({ SHIMMERSTOCK_PRIVATE_MODE: "true", SHIMMERSTOCK_URL: "http://staging.example.test" } as Record<string, string>)).toThrow("https");
  });
});

describe("Database startup migrations", () => {
  it("can initialize the same SQLite path repeatedly", () => {
    const dbPath = `/tmp/shimmerstock-runtime-${crypto.randomUUID()}.db`;
    const savedOwner = process.env.OWNER_INITIAL_PASSWORD;
    const savedAdmin = process.env.ADMIN_INITIAL_PASSWORD;

    process.env.OWNER_INITIAL_PASSWORD = TEST_OWNER_INITIAL_PASSWORD;
    process.env.ADMIN_INITIAL_PASSWORD = TEST_ADMIN_INITIAL_PASSWORD;

    try {
      const db1 = initDb(dbPath);
      db1.close();
      const db2 = initDb(dbPath);
      const business = db2.query("SELECT COUNT(*) as count FROM businesses").get() as { count: number };
      expect(business.count).toBeGreaterThan(0);
      db2.close();
    } finally {
      if (savedOwner === undefined) delete process.env.OWNER_INITIAL_PASSWORD;
      else process.env.OWNER_INITIAL_PASSWORD = savedOwner;
      if (savedAdmin === undefined) delete process.env.ADMIN_INITIAL_PASSWORD;
      else process.env.ADMIN_INITIAL_PASSWORD = savedAdmin;
      cleanupDb(dbPath);
    }
  });
});