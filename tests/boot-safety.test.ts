/**
 * Boot safety tests.
 *
 * The server must refuse to start when ENCRYPTION_KEY is absent.
 * The crypto-utils module eagerly validates this at import time.
 */
import { describe, expect, it, beforeAll } from "bun:test";

describe("Boot safety — ENCRYPTION_KEY required", () => {
  it("crypto-utils throws when ENCRYPTION_KEY is absent", async () => {
    // Save current key
    const savedKey = process.env.ENCRYPTION_KEY;

    // Remove the key
    delete process.env.ENCRYPTION_KEY;

    try {
      // Dynamic import should fail because crypto-utils calls process.exit(1)
      // at module load time if the key is missing. We need to test this
      // in a subprocess because process.exit will kill the test runner.
      const proc = Bun.spawnSync({
        cmd: ["bun", "-e", "import '../server/crypto-utils.js'; console.log('IMPORTED')"],
        cwd: import.meta.dirname || import.meta.dir,
        env: { ...process.env, ENCRYPTION_KEY: "" },
      });

      // The process should exit with code 1 (crypto-utils calls process.exit(1))
      expect(proc.exitCode).not.toBe(0);
      const stderr = new TextDecoder().decode(proc.stderr);
      expect(stderr).toContain("FATAL");
      expect(stderr).toContain("ENCRYPTION_KEY");
    } finally {
      // Restore the key for other tests
      if (savedKey) {
        process.env.ENCRYPTION_KEY = savedKey;
      }
    }
  });

  it("crypto-utils loads successfully when ENCRYPTION_KEY is valid", async () => {
    // Key is already set by the test environment
    const mod = await import("../server/crypto-utils.js");
    expect(mod.encryptToken).toBeDefined();
    expect(mod.decryptToken).toBeDefined();

    // Verify it can actually encrypt/decrypt
    const original = "test-secret-value";
    const encrypted = mod.encryptToken(original);
    expect(encrypted).not.toBe(original);
    const decrypted = mod.decryptToken(encrypted);
    expect(decrypted).toBe(original);
  });

  it("crypto-utils rejects invalid-length ENCRYPTION_KEY", async () => {
    const proc = Bun.spawnSync({
      cmd: ["bun", "-e", "import '../server/crypto-utils.js'; console.log('IMPORTED')"],
      cwd: import.meta.dirname || import.meta.dir,
      env: { ...process.env, ENCRYPTION_KEY: "too-short" },
    });

    expect(proc.exitCode).not.toBe(0);
    const stderr = new TextDecoder().decode(proc.stderr);
    expect(stderr).toContain("FATAL");
    expect(stderr).toContain("64 hex");
  });
});

// ── Bootstrap credential tests ────────────────────────────────────────────────

import fs from "fs";
import type { Database } from "bun:sqlite";
import {
  TEST_OWNER_INITIAL_PASSWORD,
  TEST_ADMIN_INITIAL_PASSWORD,
} from "./helpers/bootstrap-creds.js";

/** Temporarily set env vars, run fn synchronously, restore originals. */
function withSyncEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function cleanupDb(dbPath: string) {
  try { fs.unlinkSync(dbPath); } catch (_) { /* ok */ }
  try { fs.unlinkSync(dbPath + "-wal"); } catch (_) { /* ok */ }
  try { fs.unlinkSync(dbPath + "-shm"); } catch (_) { /* ok */ }
}

describe("Bootstrap credential — fail-closed validation", () => {
  // Re-import initDb for each describe block to get a stable reference.
  // We use a unique cache key so the module is not re-used across suites.
  let initDb: (dbPath: string) => Database;

  beforeAll(async () => {
    // Ensure encryption key is present (crypto-utils eagerly validates it)
    if (!process.env.ENCRYPTION_KEY) {
      process.env.ENCRYPTION_KEY =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    }
    const mod = await import(`../server/db.js?boot-safety-${Date.now()}`);
    initDb = mod.initDb;
  });

  it("fresh DB + missing OWNER_INITIAL_PASSWORD fails before account creation", () => {
    const tmpPath = `/tmp/ss-boot-owner-missing-${crypto.randomUUID()}.db`;
    try {
      withSyncEnv(
        { OWNER_INITIAL_PASSWORD: undefined, ADMIN_INITIAL_PASSWORD: undefined },
        () => {
          let err: Error | null = null;
          try { initDb(tmpPath); } catch (e) { err = e as Error; }
          expect(err).not.toBeNull();
          expect(err!.message).toContain("OWNER_INITIAL_PASSWORD");
          // Error must not expose any credential value
          expect(err!.message).not.toMatch(/password\s*[:=]/i);
        }
      );
    } finally {
      cleanupDb(tmpPath);
    }
  });

  it("fresh DB + missing ADMIN_INITIAL_PASSWORD fails before admin account creation", () => {
    const tmpPath = `/tmp/ss-boot-admin-missing-${crypto.randomUUID()}.db`;
    try {
      withSyncEnv(
        {
          OWNER_INITIAL_PASSWORD: "StrongOwnerPass!2025",
          ADMIN_INITIAL_PASSWORD: undefined,
        },
        () => {
          expect(() => initDb(tmpPath)).toThrow("ADMIN_INITIAL_PASSWORD");
        }
      );
    } finally {
      cleanupDb(tmpPath);
    }
  });

  it("weak OWNER_INITIAL_PASSWORD (too short) is rejected", () => {
    const tmpPath = `/tmp/ss-boot-owner-weak-${crypto.randomUUID()}.db`;
    try {
      withSyncEnv(
        { OWNER_INITIAL_PASSWORD: "short", ADMIN_INITIAL_PASSWORD: undefined },
        () => {
          expect(() => initDb(tmpPath)).toThrow("OWNER_INITIAL_PASSWORD");
        }
      );
    } finally {
      cleanupDb(tmpPath);
    }
  });

  it("placeholder OWNER_INITIAL_PASSWORD ('password') is rejected", () => {
    const tmpPath = `/tmp/ss-boot-owner-placeholder-${crypto.randomUUID()}.db`;
    try {
      withSyncEnv(
        { OWNER_INITIAL_PASSWORD: "password", ADMIN_INITIAL_PASSWORD: undefined },
        () => {
          expect(() => initDb(tmpPath)).toThrow("OWNER_INITIAL_PASSWORD");
        }
      );
    } finally {
      cleanupDb(tmpPath);
    }
  });

  it("placeholder ADMIN_INITIAL_PASSWORD ('admin') is rejected", () => {
    const tmpPath = `/tmp/ss-boot-admin-placeholder-${crypto.randomUUID()}.db`;
    try {
      withSyncEnv(
        {
          OWNER_INITIAL_PASSWORD: "StrongOwnerPass!2025",
          ADMIN_INITIAL_PASSWORD: "admin",
        },
        () => {
          expect(() => initDb(tmpPath)).toThrow("ADMIN_INITIAL_PASSWORD");
        }
      );
    } finally {
      cleanupDb(tmpPath);
    }
  });

  it("strong supplied credentials create owner and admin accounts", () => {
    const tmpPath = `/tmp/ss-boot-success-${crypto.randomUUID()}.db`;
    try {
      withSyncEnv(
        {
          OWNER_INITIAL_PASSWORD: "StrongOwnerPass!2025",
          ADMIN_INITIAL_PASSWORD: "StrongAdminPass!2025",
        },
        () => {
          const db = initDb(tmpPath);
          const owner = db.query("SELECT role FROM users WHERE username = ?").get("owner") as { role: string } | null;
          const admin = db.query("SELECT role FROM users WHERE username = ?").get("admin") as { role: string } | null;
          expect(owner?.role).toBe("owner");
          expect(admin?.role).toBe("admin");
          db.close();
        }
      );
    } finally {
      cleanupDb(tmpPath);
    }
  });

  it("existing initialized DB opens normally without bootstrap variables", () => {
    const tmpPath = `/tmp/ss-boot-existing-${crypto.randomUUID()}.db`;
    try {
      // First: create the DB with valid credentials
      withSyncEnv(
        {
          OWNER_INITIAL_PASSWORD: "StrongOwnerPass!2025",
          ADMIN_INITIAL_PASSWORD: "StrongAdminPass!2025",
        },
        () => {
          const db = initDb(tmpPath);
          db.close();
        }
      );

      // Second: re-open without credentials — must succeed (no seeding needed)
      withSyncEnv(
        { OWNER_INITIAL_PASSWORD: undefined, ADMIN_INITIAL_PASSWORD: undefined },
        () => {
          expect(() => {
            const db = initDb(tmpPath);
            db.close();
          }).not.toThrow();
        }
      );
    } finally {
      cleanupDb(tmpPath);
    }
  });

  it("test initialization succeeds using explicit temporary test credentials", () => {
    const tmpPath = `/tmp/ss-boot-test-creds-${crypto.randomUUID()}.db`;
    try {
      withSyncEnv(
        {
          OWNER_INITIAL_PASSWORD: TEST_OWNER_INITIAL_PASSWORD,
          ADMIN_INITIAL_PASSWORD: TEST_ADMIN_INITIAL_PASSWORD,
        },
        () => {
          const db = initDb(tmpPath);
          const owner = db.query("SELECT username FROM users WHERE username = ?").get("owner");
          expect(owner).not.toBeNull();
          db.close();
        }
      );
    } finally {
      cleanupDb(tmpPath);
    }
  });

  it("thrown error messages do not expose password values", () => {
    const tmpPath = `/tmp/ss-boot-no-leak-${crypto.randomUUID()}.db`;
    const weakPass = "weakpass";
    try {
      withSyncEnv(
        { OWNER_INITIAL_PASSWORD: weakPass, ADMIN_INITIAL_PASSWORD: undefined },
        () => {
          let errMsg = "";
          try {
            initDb(tmpPath);
          } catch (e) {
            errMsg = (e as Error).message;
          }
          expect(errMsg).not.toContain(weakPass);
          expect(errMsg).toContain("OWNER_INITIAL_PASSWORD");
        }
      );
    } finally {
      cleanupDb(tmpPath);
    }
  });
});
