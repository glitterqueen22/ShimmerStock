import { describe, expect, it, beforeAll } from "bun:test";

// The crypto-utils module eagerly validates ENCRYPTION_KEY at import time
// and calls process.exit(1) if absent. Set it before any imports that transitively
// load crypto-utils.
beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  }
});

describe("ShimmerStock smoke tests", () => {
  it("bun test runner works", () => {
    expect(true).toBe(true);
  });

  it("environment has expected globals", () => {
    expect(typeof Bun).toBe("object");
    expect(typeof process).toBe("object");
  });

  it("can import and verify crypto-utils exports", async () => {
    const mod = await import("../server/crypto-utils.js");
    expect(mod).toBeDefined();
    expect(typeof mod.encryptToken).toBe("function");
    expect(typeof mod.decryptToken).toBe("function");
  });

  it("ENCRYPTION_KEY is set", () => {
    expect(process.env.ENCRYPTION_KEY).toBeDefined();
    expect(process.env.ENCRYPTION_KEY!.length).toBe(64);
  });
});
