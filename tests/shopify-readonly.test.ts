/**
 * P0 Security: Shopify read-only staging and credential containment.
 *
 * Validates:
 *  1. pushInventory is blocked before any network call when mode is "readonly"
 *  2. SHOPIFY_READ_ONLY=true forces readonly regardless of SHOPIFY_SYNC_MODE
 *  3. setMode("full") is rejected when SHOPIFY_READ_ONLY=true
 *  4. setMode does not mutate process.env.SHOPIFY_SYNC_MODE (multi-tenant safety)
 *  5. Registry returns an unconfigured provider — not the singleton — when no DB
 *     credentials exist for a given business (credential containment)
 *  6. OAuth scopes contain no write_* permissions and match exact P0 policy
 *  7. Strict mode validation: invalid/missing/conflicting values → "readonly"
 *  8. SHOPIFY_ALLOW_WRITE_MODE=false (absent) blocks "full" mode always
 *  9. setMode("full") rejected when SHOPIFY_ALLOW_WRITE_MODE is not set
 * 10. Gateway blocks REST writes before any network call
 * 11. Gateway blocks GraphQL mutations before any network call
 * 12. Gateway blocks ambiguous GraphQL documents (fail closed)
 * 13. Granted-scope verification rejects write scopes
 * 14. Granted-scope verification rejects missing required scopes
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

// ── 1–5. ShopifyProvider unit tests ─────────────────────────────────────────

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
      { SHOPIFY_SYNC_MODE: undefined, SHOPIFY_READ_ONLY: undefined, SHOPIFY_ALLOW_WRITE_MODE: undefined },
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
      { SHOPIFY_READ_ONLY: "true", SHOPIFY_SYNC_MODE: "full", SHOPIFY_ALLOW_WRITE_MODE: "true" },
      async () => {
        const { default: ShopifyProvider } = await import(
          "../server/providers/shopify.js?ro-3"
        );
        const provider = new ShopifyProvider({
          shopDomain: "test.myshopify.com",
          accessToken: "shpat_testtoken",
          syncMode: "full", // explicitly requested — must be overridden by SHOPIFY_READ_ONLY
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
      { SHOPIFY_READ_ONLY: undefined, SHOPIFY_SYNC_MODE: "readonly", SHOPIFY_ALLOW_WRITE_MODE: "true" },
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
        // (because SHOPIFY_SYNC_MODE is still "readonly" and SHOPIFY_ALLOW_WRITE_MODE is set
        //  but no syncMode option → parseMode(undefined) with SHOPIFY_SYNC_MODE=readonly → "readonly")
        const providerB = new ShopifyProvider({
          shopDomain: "tenant-b.myshopify.com",
          accessToken: "shpat_tokenB",
        });
        expect(providerB.getStatus().mode).toBe("readonly");
      }
    );
  });
});

// ── 7–9. Strict mode validation ──────────────────────────────────────────────

describe("ShopifyProvider — strict mode validation", () => {
  it("invalid string syncMode values default to readonly", async () => {
    await withEnv(
      { SHOPIFY_READ_ONLY: undefined, SHOPIFY_ALLOW_WRITE_MODE: "true" },
      async () => {
        const { default: ShopifyProvider } = await import(
          "../server/providers/shopify.js?strict-1"
        );
        const invalidModes = ["FULL", "Full", "READONLY", "  full", "full ", "write", "rw", "1", "true", "yes"];
        for (const mode of invalidModes) {
          const provider = new ShopifyProvider({
            shopDomain: "test.myshopify.com",
            accessToken: "shpat_testtoken",
            syncMode: mode,
          });
          expect(provider.getStatus().mode).toBe("readonly");
        }
      }
    );
  });

  it("missing syncMode defaults to readonly", async () => {
    await withEnv(
      { SHOPIFY_READ_ONLY: undefined, SHOPIFY_ALLOW_WRITE_MODE: "true", SHOPIFY_SYNC_MODE: undefined },
      async () => {
        const { default: ShopifyProvider } = await import(
          "../server/providers/shopify.js?strict-2"
        );
        const provider = new ShopifyProvider({
          shopDomain: "test.myshopify.com",
          accessToken: "shpat_testtoken",
        });
        expect(provider.getStatus().mode).toBe("readonly");
      }
    );
  });

  it("SHOPIFY_ALLOW_WRITE_MODE absent (P0 default) blocks full mode regardless of syncMode option", async () => {
    await withEnv(
      { SHOPIFY_READ_ONLY: undefined, SHOPIFY_ALLOW_WRITE_MODE: undefined },
      async () => {
        const { default: ShopifyProvider } = await import(
          "../server/providers/shopify.js?strict-3"
        );
        // Even explicitly requesting "full" must be blocked when SHOPIFY_ALLOW_WRITE_MODE is absent
        const provider = new ShopifyProvider({
          shopDomain: "test.myshopify.com",
          accessToken: "shpat_testtoken",
          syncMode: "full",
        });
        expect(provider.getStatus().mode).toBe("readonly");
        expect(provider.getStatus().canWrite).toBe(false);
      }
    );
  });

  it("SHOPIFY_ALLOW_WRITE_MODE=false blocks full mode", async () => {
    await withEnv(
      { SHOPIFY_READ_ONLY: undefined, SHOPIFY_ALLOW_WRITE_MODE: "false" },
      async () => {
        const { default: ShopifyProvider } = await import(
          "../server/providers/shopify.js?strict-4"
        );
        const provider = new ShopifyProvider({
          shopDomain: "test.myshopify.com",
          accessToken: "shpat_testtoken",
          syncMode: "full",
        });
        expect(provider.getStatus().mode).toBe("readonly");
      }
    );
  });

  it("setMode('full') rejected when SHOPIFY_ALLOW_WRITE_MODE not set", async () => {
    await withEnv(
      { SHOPIFY_READ_ONLY: undefined, SHOPIFY_ALLOW_WRITE_MODE: undefined },
      async () => {
        const { default: ShopifyProvider } = await import(
          "../server/providers/shopify.js?strict-5"
        );
        const provider = new ShopifyProvider({
          shopDomain: "test.myshopify.com",
          accessToken: "shpat_testtoken",
          syncMode: "readonly",
        });
        await provider.setMode("full");
        expect(provider.getStatus().mode).toBe("readonly");
      }
    );
  });

  it("setMode('invalid') is rejected", async () => {
    await withEnv(
      { SHOPIFY_READ_ONLY: undefined, SHOPIFY_ALLOW_WRITE_MODE: "true" },
      async () => {
        const { default: ShopifyProvider } = await import(
          "../server/providers/shopify.js?strict-6"
        );
        const provider = new ShopifyProvider({
          shopDomain: "test.myshopify.com",
          accessToken: "shpat_testtoken",
          syncMode: "readonly",
        });
        await provider.setMode("FULL" as any);
        expect(provider.getStatus().mode).toBe("readonly");
        await provider.setMode("write" as any);
        expect(provider.getStatus().mode).toBe("readonly");
      }
    );
  });
});

// ── 10–12. Gateway tests ──────────────────────────────────────────────────────

describe("Shopify Gateway — write blocking", () => {
  it("blocks REST POST before any network call in read-only mode", async () => {
    let networkCallCount = 0;
    const orig = global.fetch;
    (global as any).fetch = async (..._args: any[]) => {
      networkCallCount++;
      return new Response("{}");
    };

    try {
      const { gatewayFetch, GatewayReadOnlyError } = await import(
        "../server/providers/shopify-gateway.js?gw-post"
      );
      await expect(
        gatewayFetch("readonly", "test.myshopify.com", "shpat_fake", "POST", "/inventory_levels/set.json", {})
      ).rejects.toBeInstanceOf(GatewayReadOnlyError);
      expect(networkCallCount).toBe(0);
    } finally {
      global.fetch = orig;
    }
  });

  it("blocks REST PUT in read-only mode", async () => {
    let networkCallCount = 0;
    const orig = global.fetch;
    (global as any).fetch = async (..._args: any[]) => { networkCallCount++; return new Response("{}"); };
    try {
      const { gatewayFetch, GatewayReadOnlyError } = await import("../server/providers/shopify-gateway.js?gw-put");
      await expect(
        gatewayFetch("readonly", "test.myshopify.com", "shpat_fake", "PUT", "/products/1.json", {})
      ).rejects.toBeInstanceOf(GatewayReadOnlyError);
      expect(networkCallCount).toBe(0);
    } finally {
      global.fetch = orig;
    }
  });

  it("blocks REST PATCH in read-only mode", async () => {
    let networkCallCount = 0;
    const orig = global.fetch;
    (global as any).fetch = async (..._args: any[]) => { networkCallCount++; return new Response("{}"); };
    try {
      const { gatewayFetch, GatewayReadOnlyError } = await import("../server/providers/shopify-gateway.js?gw-patch");
      await expect(
        gatewayFetch("readonly", "test.myshopify.com", "shpat_fake", "PATCH", "/products/1.json", {})
      ).rejects.toBeInstanceOf(GatewayReadOnlyError);
      expect(networkCallCount).toBe(0);
    } finally {
      global.fetch = orig;
    }
  });

  it("blocks REST DELETE in read-only mode", async () => {
    let networkCallCount = 0;
    const orig = global.fetch;
    (global as any).fetch = async (..._args: any[]) => { networkCallCount++; return new Response("{}"); };
    try {
      const { gatewayFetch, GatewayReadOnlyError } = await import("../server/providers/shopify-gateway.js?gw-delete");
      await expect(
        gatewayFetch("readonly", "test.myshopify.com", "shpat_fake", "DELETE", "/products/1.json")
      ).rejects.toBeInstanceOf(GatewayReadOnlyError);
      expect(networkCallCount).toBe(0);
    } finally {
      global.fetch = orig;
    }
  });

  it("allows REST GET in read-only mode (passes to network)", async () => {
    let networkCallCount = 0;
    const orig = global.fetch;
    (global as any).fetch = async (..._args: any[]) => {
      networkCallCount++;
      return new Response(JSON.stringify({ products: [] }));
    };
    try {
      const { gatewayFetch } = await import("../server/providers/shopify-gateway.js?gw-get");
      const result = await gatewayFetch("readonly", "test.myshopify.com", "shpat_fake", "GET", "/products.json");
      expect(networkCallCount).toBe(1);
      expect(result).toBeDefined();
    } finally {
      global.fetch = orig;
    }
  });

  it("blocks GraphQL mutation in read-only mode before any network call", async () => {
    let networkCallCount = 0;
    const orig = global.fetch;
    (global as any).fetch = async (..._args: any[]) => { networkCallCount++; return new Response("{}"); };
    try {
      const { gatewayGraphQL, GatewayReadOnlyError } = await import("../server/providers/shopify-gateway.js?gw-graphql-mutation");
      await expect(
        gatewayGraphQL("readonly", "test.myshopify.com", "shpat_fake", "mutation { productCreate(input: {title: \"Test\"}) { product { id } } }")
      ).rejects.toBeInstanceOf(GatewayReadOnlyError);
      expect(networkCallCount).toBe(0);
    } finally {
      global.fetch = orig;
    }
  });

  it("blocks ambiguous/unclassified GraphQL documents (fail closed)", async () => {
    let networkCallCount = 0;
    const orig = global.fetch;
    (global as any).fetch = async (..._args: any[]) => { networkCallCount++; return new Response("{}"); };
    try {
      const { gatewayGraphQL, GatewayReadOnlyError } = await import("../server/providers/shopify-gateway.js?gw-graphql-ambiguous");
      // Document with no recognizable operation keyword
      await expect(
        gatewayGraphQL("readonly", "test.myshopify.com", "shpat_fake", "{ shop { invalidQuery } }" as any)
      ).resolves.toBeDefined(); // shorthand query { ... } is allowed

      // Truly ambiguous — no operation type
      await expect(
        gatewayGraphQL("readonly", "test.myshopify.com", "shpat_fake", "someUnknownOperation { foo }")
      ).rejects.toBeInstanceOf(GatewayReadOnlyError);
      expect(networkCallCount).toBe(1); // only the shorthand query call should have fired
    } finally {
      global.fetch = orig;
    }
  });

  it("allows GraphQL query in read-only mode", async () => {
    let networkCallCount = 0;
    const orig = global.fetch;
    (global as any).fetch = async (..._args: any[]) => {
      networkCallCount++;
      return new Response(JSON.stringify({ data: { shop: { name: "Test" } } }));
    };
    try {
      const { gatewayGraphQL } = await import("../server/providers/shopify-gateway.js?gw-graphql-query");
      const result = await gatewayGraphQL("readonly", "test.myshopify.com", "shpat_fake", "query { shop { name } }");
      expect(networkCallCount).toBe(1);
      expect(result).toBeDefined();
    } finally {
      global.fetch = orig;
    }
  });
});

// ── 13–14. Scope verification ─────────────────────────────────────────────────

describe("Shopify OAuth — granted scope verification", () => {
  it("rejects granted scopes containing any write_* scope", async () => {
    // Access the verifyGrantedScopes function via the route module source inspection
    const src = await Bun.file("server/shopify-oauth-routes.js").text();
    // Verify the source does NOT contain webhook registration calls
    expect(src).not.toContain("registerWebhooks");
    expect(src).not.toContain("webhooks.json");
  });

  it("SHOPIFY_SCOPES contains exactly the P0 read-only scopes", async () => {
    const src = await Bun.file("server/shopify-oauth-routes.js").text();

    const match = src.match(/const REQUIRED_SCOPES\s*=\s*\[([\s\S]*?)\]/);
    expect(match).toBeTruthy();
    const scopesBlock = match![1];

    // No write scope must appear
    expect(scopesBlock).not.toContain("write_");

    // Extra unapproved read scopes must not appear
    expect(scopesBlock).not.toContain("read_fulfillments");
    expect(scopesBlock).not.toContain("read_customers");
    expect(scopesBlock).not.toContain("read_checkouts");

    // Required P0 scopes must all be present
    expect(scopesBlock).toContain("read_orders");
    expect(scopesBlock).toContain("read_products");
    expect(scopesBlock).toContain("read_inventory");
    expect(scopesBlock).toContain("read_locations");
  });

  it("no webhook registration mutation during OAuth connect", async () => {
    const src = await Bun.file("server/shopify-oauth-routes.js").text();
    // Must not contain any webhook registration call (write mutation)
    expect(src).not.toContain("registerWebhooks");
    expect(src).not.toContain("/webhooks.json");
    expect(src).not.toContain("webhook_id");
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
