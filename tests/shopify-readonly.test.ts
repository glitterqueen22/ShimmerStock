/**
 * P0 Security: Shopify read-only staging and credential containment.
 *
 * Validates:
 *  1. pushInventory is blocked before any network call when mode is "readonly"
 *  2. SHOPIFY_READ_ONLY=true forces readonly regardless of SHOPIFY_SYNC_MODE
 *  3. setMode("full") is rejected when SHOPIFY_READ_ONLY=true
 *  4. setMode no longer mutates process.env.SHOPIFY_SYNC_MODE (multi-tenant safety)
 *  5. Registry returns an unconfigured provider — not the singleton — when no DB
 *     credentials exist for a given business (credential containment)
 *  6. OAuth scopes contain no write_* permissions (read-only staging)
 */

// Must be set before any server module import — crypto-utils.js validates it eagerly
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY ||
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { describe, expect, it, beforeEach, afterEach } from "bun:test";

// ── helpers ─────────────────────────────────────────────────────────────────

/** Temporarily swap env vars for the duration of a callback. */
async function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void | Promise<void>
) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// ── 1–4. ShopifyProvider unit tests ─────────────────────────────────────────

describe("ShopifyProvider — read-only enforcement", () => {
  let fetchCallCount = 0;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    fetchCallCount = 0;
    originalFetch = global.fetch;
    // Replace fetch so any attempted network call is detectable
    (global as any).fetch = async (..._args: any[]) => {
      fetchCallCount++;
      throw new Error(`Unexpected network call in read-only test: ${_args[0]}`);
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("blocks pushInventory in readonly mode and makes NO network call", async () => {
    const { default: ShopifyProvider } = await import(
      "../server/providers/shopify.js?ro-1"
    );
    const provider = new ShopifyProvider({
      shopDomain: "test.myshopify.com",
      accessToken: "shpat_testtoken",
      syncMode: "readonly",
    });

    expect(provider.getStatus().mode).toBe("readonly");
    expect(provider.getStatus().canWrite).toBe(false);

    const result = await provider.pushInventory("SKU-1", 123, 10);

    expect(result.success).toBe(false);
    expect(result.error).toContain("read-only");
    // No HTTP request should have been made
    expect(fetchCallCount).toBe(0);
  });

  it("defaults to readonly when no explicit mode is given", async () => {
    await withEnv(
      { SHOPIFY_SYNC_MODE: undefined, SHOPIFY_READ_ONLY: undefined },
      async () => {
        const { default: ShopifyProvider } = await import(
          "../server/providers/shopify.js?ro-2"
        );
        const provider = new ShopifyProvider({
          shopDomain: "test.myshopify.com",
          accessToken: "shpat_testtoken",
        });

        expect(provider.getStatus().mode).toBe("readonly");
        const result = await provider.pushInventory("SKU-1", 123, 10);
        expect(result.success).toBe(false);
        expect(fetchCallCount).toBe(0);
      }
    );
  });

  it("SHOPIFY_READ_ONLY=true overrides syncMode:'full' passed in options", async () => {
    await withEnv(
      { SHOPIFY_READ_ONLY: "true", SHOPIFY_SYNC_MODE: "full" },
      async () => {
        const { default: ShopifyProvider } = await import(
          "../server/providers/shopify.js?ro-3"
        );
        const provider = new ShopifyProvider({
          shopDomain: "test.myshopify.com",
          accessToken: "shpat_testtoken",
          syncMode: "full", // explicitly requested — must be overridden
        });

        expect(provider.getStatus().mode).toBe("readonly");
        expect(provider.getStatus().canWrite).toBe(false);
        const result = await provider.pushInventory("SKU-X", 999, 5);
        expect(result.success).toBe(false);
        expect(result.error).toContain("read-only");
        expect(fetchCallCount).toBe(0);
      }
    );
  });

  it("setMode('full') is silently rejected when SHOPIFY_READ_ONLY=true", async () => {
    await withEnv({ SHOPIFY_READ_ONLY: "true" }, async () => {
      const { default: ShopifyProvider } = await import(
        "../server/providers/shopify.js?ro-4"
      );
      const provider = new ShopifyProvider({
        shopDomain: "test.myshopify.com",
        accessToken: "shpat_testtoken",
        syncMode: "readonly",
      });

      await provider.setMode("full");

      // Mode must remain readonly
      expect(provider.getStatus().mode).toBe("readonly");
      expect(provider.getStatus().canWrite).toBe(false);
    });
  });

  it("setMode does NOT mutate process.env.SHOPIFY_SYNC_MODE (multi-tenant safety)", async () => {
    await withEnv(
      { SHOPIFY_READ_ONLY: undefined, SHOPIFY_SYNC_MODE: "readonly" },
      async () => {
        const { default: ShopifyProvider } = await import(
          "../server/providers/shopify.js?ro-5"
        );
        const providerA = new ShopifyProvider({
          shopDomain: "tenant-a.myshopify.com",
          accessToken: "shpat_tokenA",
          syncMode: "readonly",
        });

        // Tenant A switches their own provider to "full"
        await providerA.setMode("full");
        expect(providerA.getStatus().mode).toBe("full");

        // The shared env var must NOT have changed
        expect(process.env.SHOPIFY_SYNC_MODE).toBe("readonly");

        // A second provider constructed afterward still defaults to readonly
        const providerB = new ShopifyProvider({
          shopDomain: "tenant-b.myshopify.com",
          accessToken: "shpat_tokenB",
        });
        expect(providerB.getStatus().mode).toBe("readonly");
      }
    );
  });
});

// ── 5. Registry credential-containment test ──────────────────────────────────

describe("Provider registry — credential containment", () => {
  it("returns an unconfigured provider when business has no DB credentials", async () => {
    const { initDb } = await import("../server/db.js");
    const { initRegistry, getProvider } = await import(
      "../server/providers/registry.js?containment-1"
    );

    const tmpPath = `/tmp/shimmerstock-containment-${crypto.randomUUID()}.db`;
    const db = initDb(tmpPath);

    try {
      initRegistry();

      // Business 99999 has no rows in provider_credentials
      const provider = getProvider(99999, db);
      const status = provider.getStatus();

      // Must be NOT configured — no credential must leak from a singleton
      expect(status.configured).toBe(false);
      expect(status.canWrite).toBe(false);
    } finally {
      db.close();
      try { require("fs").unlinkSync(tmpPath); } catch (_) { /* ok */ }
    }
  });
});

// ── 6. OAuth scopes must be read-only ────────────────────────────────────────

describe("Shopify OAuth — scope containment", () => {
  it("SHOPIFY_SCOPES contains no write_* permissions", async () => {
    const src = await Bun.file("server/shopify-oauth-routes.js").text();

    const match = src.match(/const SHOPIFY_SCOPES\s*=\s*\[([\s\S]*?)\]\.join/);
    expect(match).toBeTruthy();
    const scopesBlock = match![1];

    // No write scope must appear
    expect(scopesBlock).not.toContain("write_inventory");
    expect(scopesBlock).not.toContain("write_fulfillments");
    expect(scopesBlock).not.toContain("write_orders");
    expect(scopesBlock).not.toContain("write_products");

    // Required read scopes must be present
    expect(scopesBlock).toContain("read_orders");
    expect(scopesBlock).toContain("read_products");
  });
});

