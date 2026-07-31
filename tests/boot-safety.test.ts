/**
 * Boot safety tests.
 *
 * The server must refuse to start when ENCRYPTION_KEY is absent.
 * The crypto-utils module eagerly validates this at import time.
 */
import { describe, expect, it } from "bun:test";

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
