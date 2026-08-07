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
 * 15. Gateway errors do not include upstream response body (sensitive payload redaction)
 * 16. Granted-scope verification rejects extra unapproved scopes (least privilege)
 */

// Must be set before any server module import — crypto-utils.js validates it eagerly.
// Tests may run with a temporary non-hex key value from the environment; normalize it.
const TEST_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
if (!/^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY || "")) {
  process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
}

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  TEST_OWNER_INITIAL_PASSWORD,
  TEST_ADMIN_INITIAL_PASSWORD,
} from "./helpers/bootstrap-creds.js";

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

/**
 * Invoke initDb with explicit test-only bootstrap credentials so the
 * production fail-closed validation passes in test contexts.
 * Restores original env values after the call.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function initDbWithTestCreds(initDbFn: (p: string) => any, tmpPath: string) {
  const savedOwner = process.env.OWNER_INITIAL_PASSWORD;
  const savedAdmin = process.env.ADMIN_INITIAL_PASSWORD;
  process.env.OWNER_INITIAL_PASSWORD = TEST_OWNER_INITIAL_PASSWORD;
  process.env.ADMIN_INITIAL_PASSWORD = TEST_ADMIN_INITIAL_PASSWORD;
  try {
    return initDbFn(tmpPath);
  } finally {
    if (savedOwner !== undefined) process.env.OWNER_INITIAL_PASSWORD = savedOwner;
    else delete process.env.OWNER_INITIAL_PASSWORD;
    if (savedAdmin !== undefined) process.env.ADMIN_INITIAL_PASSWORD = savedAdmin;
    else delete process.env.ADMIN_INITIAL_PASSWORD;
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

  it("uses SHOPIFY_SYNC_MODE as the fallback when syncMode is omitted", async () => {
    await withEnv(
      { SHOPIFY_SYNC_MODE: "full", SHOPIFY_READ_ONLY: undefined, SHOPIFY_ALLOW_WRITE_MODE: "true" },
      async () => {
        const { default: ShopifyProvider } = await import(
          "../server/providers/shopify.js?ro-env-fallback"
        );
        const provider = new ShopifyProvider({
          shopDomain: "test.myshopify.com",
          accessToken: "shpat_testtoken",
        });

        expect(provider.getStatus().mode).toBe("full");
        expect(provider.getStatus().canWrite).toBe(true);
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

  it("rejects non-Admin tokens even for tenant-scoped providers", async () => {
    const { default: ShopifyProvider } = await import(
      "../server/providers/shopify.js?strict-invalid-token"
    );
    const provider = new ShopifyProvider({
      shopDomain: "tenant-a.myshopify.com",
      accessToken: "atkn_not_an_admin_token",
      syncMode: "readonly",
    });

    expect(provider.getStatus().configured).toBe(false);
    expect(provider.getStatus().canWrite).toBe(false);
  });
});

describe("ShopifyProvider — canonical shop-domain validation", () => {
  it("normalizes mixed-case shop domain and marks configured when credentials are valid", async () => {
    const { default: ShopifyProvider } = await import(
      "../server/providers/shopify.js?domain-valid-1"
    );
    const provider = new ShopifyProvider({
      shopDomain: "  My-Store.MyShopify.COM  ",
      accessToken: "shpat_valid_admin_token",
      syncMode: "readonly",
    });

    const status = provider.getStatus();
    expect(status.shopDomain).toBe("my-store.myshopify.com");
    expect(status.configured).toBe(true);
  });

  it("rejects invalid and unusable shop-domain formats", async () => {
    const { default: ShopifyProvider } = await import(
      "../server/providers/shopify.js?domain-invalid-1"
    );
    const invalidDomains = [
      "evil.example.com",
      "store.myshopify.com.evil",
      "https://store.myshopify.com",
      "store.myshopify.com/path",
      "store.myshopify.com:443",
      "store.myshopify.com?x=1",
      "",
      "   ",
    ];

    for (const shopDomain of invalidDomains) {
      const provider = new ShopifyProvider({
        shopDomain,
        accessToken: "shpat_valid_admin_token",
        syncMode: "readonly",
      });
      const status = provider.getStatus();
      expect(status.configured).toBe(false);
      expect(status.canWrite).toBe(false);
    }
  });

  it("fails closed before network when shop domain is invalid", async () => {
    const { default: ShopifyProvider } = await import(
      "../server/providers/shopify.js?domain-invalid-network"
    );
    let fetchCallCount = 0;
    const originalFetch = global.fetch;
    (global as any).fetch = async (..._args: any[]) => {
      fetchCallCount++;
      return new Response("{}");
    };

    try {
      const provider = new ShopifyProvider({
        shopDomain: "https://store.myshopify.com",
        accessToken: "shpat_valid_admin_token",
        syncMode: "readonly",
      });
      await expect(provider.fetchOrders()).rejects.toThrow("Shopify is not configured");
      expect(fetchCallCount).toBe(0);
    } finally {
      global.fetch = originalFetch;
    }
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

  it("blocks GraphQL subscription in read-only mode before any network call", async () => {
    let networkCallCount = 0;
    const orig = global.fetch;
    (global as any).fetch = async (..._args: any[]) => { networkCallCount++; return new Response("{}"); };
    try {
      const { gatewayGraphQL, GatewayReadOnlyError } = await import("../server/providers/shopify-gateway.js?gw-sub-ro");
      await expect(
        gatewayGraphQL("readonly", "test.myshopify.com", "shpat_fake", "subscription { orderCreated { id } }")
      ).rejects.toBeInstanceOf(GatewayReadOnlyError);
      expect(networkCallCount).toBe(0);
    } finally {
      global.fetch = orig;
    }
  });

  it("blocks GraphQL subscription in full mode before any network call (subscriptions never reach network)", async () => {
    let networkCallCount = 0;
    const orig = global.fetch;
    (global as any).fetch = async (..._args: any[]) => { networkCallCount++; return new Response("{}"); };
    try {
      const { gatewayGraphQL, GatewayReadOnlyError } = await import("../server/providers/shopify-gateway.js?gw-sub-full");
      await expect(
        gatewayGraphQL("full", "test.myshopify.com", "shpat_fake", "subscription { orderCreated { id } }")
      ).rejects.toBeInstanceOf(GatewayReadOnlyError);
      // Must be blocked BEFORE any network call regardless of mode
      expect(networkCallCount).toBe(0);
    } finally {
      global.fetch = orig;
    }
  });

  it("handles HEAD request without calling res.json() (no parse error)", async () => {
    const orig = global.fetch;
    (global as any).fetch = async (..._args: any[]) => {
      // HEAD responses have no body — simulated with empty response
      return new Response(null, { status: 200 });
    };
    try {
      const { gatewayFetch } = await import("../server/providers/shopify-gateway.js?gw-head");
      // full mode required since HEAD is a read — but it's not in the write-methods set anyway
      const result = await gatewayFetch("readonly", "test.myshopify.com", "shpat_fake", "HEAD", "/shop.json");
      expect(result).toBeNull();
    } finally {
      global.fetch = orig;
    }
  });

  it("handles 204 No Content response without calling res.json()", async () => {
    const orig = global.fetch;
    (global as any).fetch = async (..._args: any[]) => {
      return new Response(null, { status: 204 });
    };
    try {
      const { gatewayFetch } = await import("../server/providers/shopify-gateway.js?gw-204");
      const result = await gatewayFetch("full", "test.myshopify.com", "shpat_fake", "DELETE", "/some/resource.json");
      expect(result).toBeNull();
    } finally {
      global.fetch = orig;
    }
  });

  it("handles 205 Reset Content response without calling res.json()", async () => {
    const orig = global.fetch;
    (global as any).fetch = async (..._args: any[]) => {
      return new Response(null, { status: 205 });
    };
    try {
      const { gatewayFetch } = await import("../server/providers/shopify-gateway.js?gw-205");
      const result = await gatewayFetch("full", "test.myshopify.com", "shpat_fake", "DELETE", "/some/other.json");
      expect(result).toBeNull();
    } finally {
      global.fetch = orig;
    }
  });

  it("error thrown by gatewayFetch does not include upstream response body (sensitive payload redaction)", async () => {
    const sensitiveBody = '{"errors":[{"message":"[API_KEY=shpat_secret] rate limit exceeded","extensions":{"code":"THROTTLED"}}]}';
    const orig = global.fetch;
    (global as any).fetch = async (..._args: any[]) => {
      return new Response(sensitiveBody, { status: 429 });
    };
    const warnMessages: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: any[]) => { warnMessages.push(args.join(" ")); };
    try {
      const { gatewayFetch } = await import("../server/providers/shopify-gateway.js?gw-error-rest");
      let thrown: Error | null = null;
      try {
        await gatewayFetch("readonly", "test.myshopify.com", "shpat_fake", "GET", "/products.json");
      } catch (e: any) {
        thrown = e;
      }
      expect(thrown).not.toBeNull();
      // The thrown error message must not contain the raw upstream body
      expect(thrown!.message).not.toContain(sensitiveBody);
      expect(thrown!.message).not.toContain("shpat_secret");
      // It must still contain the HTTP method and status code for diagnosing the failure
      expect(thrown!.message).toContain("429");
      // console.warn must not log the upstream body either
      const allWarns = warnMessages.join("\n");
      expect(allWarns).not.toContain(sensitiveBody);
      expect(allWarns).not.toContain("shpat_secret");
      expect(allWarns).not.toContain("body preview");
    } finally {
      global.fetch = orig;
      console.warn = origWarn;
    }
  });

  it("error thrown by gatewayGraphQL does not include upstream response body", async () => {
    const sensitiveBody = '{"errors":[{"message":"Access token invalid","extensions":{"code":"ACCESS_DENIED"}}],"sensitive_token":"shpat_abc"}';
    const orig = global.fetch;
    (global as any).fetch = async (..._args: any[]) => {
      return new Response(sensitiveBody, { status: 401 });
    };
    const warnMessages: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: any[]) => { warnMessages.push(args.join(" ")); };
    try {
      const { gatewayGraphQL } = await import("../server/providers/shopify-gateway.js?gw-error-graphql");
      let thrown: Error | null = null;
      try {
        await gatewayGraphQL("readonly", "test.myshopify.com", "shpat_fake", "query { shop { name } }");
      } catch (e: any) {
        thrown = e;
      }
      expect(thrown).not.toBeNull();
      expect(thrown!.message).not.toContain(sensitiveBody);
      expect(thrown!.message).not.toContain("shpat_abc");
      expect(thrown!.message).toContain("401");
      // console.warn must not log the upstream body either
      const allWarns = warnMessages.join("\n");
      expect(allWarns).not.toContain(sensitiveBody);
      expect(allWarns).not.toContain("shpat_abc");
      expect(allWarns).not.toContain("body preview");
    } finally {
      global.fetch = orig;
      console.warn = origWarn;
    }
  });
});

// ── 13–14. Scope verification ─────────────────────────────────────────────────

describe("Shopify OAuth — granted scope verification", () => {
  it("rejects granted scopes containing any write_* scope", async () => {
    const { verifyGrantedScopes } = await import(
      "../server/shopify-oauth-routes.js?scope-verify-write"
    );

    // A write scope must cause immediate rejection regardless of which reads are present
    const result = verifyGrantedScopes(
      "read_orders,read_products,read_inventory,read_locations,write_inventory"
    );
    expect(result.ok).toBe(false);
    expect(result.verifiedScopes).toHaveLength(0);
    expect(result.error).toContain("write_inventory");

    // Multiple write scopes
    const result2 = verifyGrantedScopes(
      "read_products,write_orders,write_fulfillments"
    );
    expect(result2.ok).toBe(false);
    expect(result2.error).toContain("write_");

    // Token must NOT be activated when a write scope is present
    // (verified by checking the scope-reject path returns ok: false before any DB write)
    expect(result.ok).toBe(false);
    expect(result2.ok).toBe(false);
  });

  it("rejects connections with missing required scopes", async () => {
    const { verifyGrantedScopes } = await import(
      "../server/shopify-oauth-routes.js?scope-verify-missing"
    );

    // Missing read_inventory
    const r1 = verifyGrantedScopes("read_orders,read_products,read_locations");
    expect(r1.ok).toBe(false);
    expect(r1.error).toContain("read_inventory");

    // Missing all required scopes
    const r2 = verifyGrantedScopes("");
    expect(r2.ok).toBe(false);

    // Missing read_products
    const r3 = verifyGrantedScopes("read_orders,read_inventory,read_locations");
    expect(r3.ok).toBe(false);
    expect(r3.error).toContain("read_products");
  });

  it("accepts exactly the required P0 scopes", async () => {
    const { verifyGrantedScopes } = await import(
      "../server/shopify-oauth-routes.js?scope-verify-ok"
    );

    const result = verifyGrantedScopes(
      "read_orders,read_products,read_inventory,read_locations"
    );
    expect(result.ok).toBe(true);
    expect(result.verifiedScopes).toContain("read_orders");
    expect(result.verifiedScopes).toContain("read_products");
    expect(result.verifiedScopes).toContain("read_inventory");
    expect(result.verifiedScopes).toContain("read_locations");
  });

  it("rejects read_all_orders — not in P0 exact approved scope set", async () => {
    const { verifyGrantedScopes } = await import(
      "../server/shopify-oauth-routes.js?scope-verify-all-orders"
    );

    const result = verifyGrantedScopes(
      "read_all_orders,read_products,read_inventory,read_locations"
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("unapproved");
    expect(result.error).toContain("read_all_orders");
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
    // Must not contain any webhook registration call (write mutation to Shopify)
    expect(src).not.toContain("registerWebhooks");
    expect(src).not.toContain("/webhooks.json");
    // Note: webhook_id = NULL in disconnect handler is fine (it's clearing a DB column, not calling Shopify)
    // We verify no Shopify webhook API POST occurs by checking for the API call pattern
    expect(src).not.toContain('webhooks.json"');
    expect(src).not.toContain("webhooks.json`");
  });

  it("rejects extra unapproved read scopes beyond the P0 approved set", async () => {
    const { verifyGrantedScopes } = await import(
      "../server/shopify-oauth-routes.js?scope-verify-extra"
    );

    // Extra read scope not in the approved P0 set must be rejected (least privilege)
    const r1 = verifyGrantedScopes(
      "read_orders,read_products,read_inventory,read_locations,read_customers"
    );
    expect(r1.ok).toBe(false);
    expect(r1.error).toContain("unapproved");
    expect(r1.error).toContain("read_customers");

    // Another unapproved scope
    const r2 = verifyGrantedScopes(
      "read_orders,read_products,read_inventory,read_locations,read_checkouts"
    );
    expect(r2.ok).toBe(false);
    expect(r2.error).toContain("read_checkouts");

    // Multiple extra scopes at once
    const r3 = verifyGrantedScopes(
      "read_orders,read_products,read_inventory,read_locations,read_fulfillments,read_content"
    );
    expect(r3.ok).toBe(false);
    expect(r3.error).toContain("unapproved");

    // read_all_orders is NOT approved for P0 — must be rejected like any other extra scope
    const r4 = verifyGrantedScopes(
      "read_all_orders,read_products,read_inventory,read_locations"
    );
    expect(r4.ok).toBe(false);
    expect(r4.error).toContain("unapproved");
    expect(r4.error).toContain("read_all_orders");
  });
});

// ── 5. Registry credential-containment test ──────────────────────────────────

describe("Provider registry — credential containment", () => {
  it("returns an unconfigured provider when business has no DB credentials", async () => {
    await withEnv(
      {
        SHOPIFY_STORE_DOMAIN: "global.myshopify.com",
        SHOPIFY_API_TOKEN: "shpat_global_token",
      },
      async () => {
        const { initDb } = await import("../server/db.js");
        const { initRegistry, getProvider } = await import(
          "../server/providers/registry.js?containment-1"
        );

        const tmpPath = `/tmp/shimmerstock-containment-${crypto.randomUUID()}.db`;
        const db = initDbWithTestCreds(initDb, tmpPath);

        try {
          initRegistry();

          // Business 99999 has no rows in provider_credentials
          const provider = getProvider(99999, db);
          const status = provider.getStatus();

          // Must be NOT configured — no credential must leak from a singleton
          expect(status.configured).toBe(false);
          expect(status.canWrite).toBe(false);
          expect(status.shopDomain).toBe("none");
        } finally {
          db.close();
          try { require("fs").unlinkSync(tmpPath); } catch (_) { /* ok */ }
        }
      }
    );
  });

  it("throws when getProvider() is called with businessId+db before initRegistry()", async () => {
    const { initDb } = await import("../server/db.js");
    // Use a distinct query-param to get a fresh module instance not yet initialized
    const { getProvider } = await import(
      "../server/providers/registry.js?uninit-check"
    );

    const tmpPath = `/tmp/shimmerstock-uninit-${crypto.randomUUID()}.db`;
    const db = initDbWithTestCreds(initDb, tmpPath);

    try {
      // Must throw — registry was never initialized for this module instance
      expect(() => getProvider(99999, db)).toThrow(
        "Provider registry not initialised"
      );
    } finally {
      db.close();
      try { require("fs").unlinkSync(tmpPath); } catch (_) { /* ok */ }
    }
  });

  it("throws when getProvider() is called with no args before initRegistry()", async () => {
    const { getProvider } = await import(
      "../server/providers/registry.js?uninit-check-singleton"
    );

    // Must throw — registry was never initialized
    expect(() => getProvider()).toThrow("Provider registry not initialised");
  });

  it("throws when getProvider() is called with db but no business before initRegistry()", async () => {
    const { initDb } = await import("../server/db.js");
    const { getProvider } = await import(
      "../server/providers/registry.js?uninit-check-db-only"
    );

    const tmpPath = `/tmp/shimmerstock-uninit-db-only-${crypto.randomUUID()}.db`;
    const db = initDbWithTestCreds(initDb, tmpPath);

    try {
      expect(() => getProvider(undefined, db)).toThrow(
        "Provider registry not initialised"
      );
    } finally {
      db.close();
      try { require("fs").unlinkSync(tmpPath); } catch (_) { /* ok */ }
    }
  });
});

// ── Shop domain casing ───────────────────────────────────────────────────────

describe("Shopify OAuth — shop domain canonicalization", () => {
  it("accepts uppercase shop domain and normalizes to lowercase", async () => {
    const { canonicalizeShopDomain } = await import(
      "../server/shopify-oauth-routes.js?shop-domain-1"
    );
    expect(canonicalizeShopDomain("MYSTORE.myshopify.com")).toBe("mystore.myshopify.com");
    expect(canonicalizeShopDomain("MyStore.MyShopify.COM")).toBe("mystore.myshopify.com");
    expect(canonicalizeShopDomain("test-shop.myshopify.com")).toBe("test-shop.myshopify.com");
  });

  it("rejects a domain that differs after normalization in shop binding", async () => {
    const { canonicalizeShopDomain } = await import(
      "../server/shopify-oauth-routes.js?shop-domain-2"
    );
    // Case-only difference: after canonicalization, same domain — valid
    const domainA = canonicalizeShopDomain("ShopA.myshopify.com");
    const domainB = canonicalizeShopDomain("shopa.myshopify.com");
    expect(domainA).toBe(domainB); // same domain, different case → equal after normalization

    // Genuinely different domain: not the same even after normalization
    const domainC = canonicalizeShopDomain("shopb.myshopify.com");
    expect(domainA).not.toBe(domainC);
  });

  it("returns empty string for non-string input", async () => {
    const { canonicalizeShopDomain } = await import(
      "../server/shopify-oauth-routes.js?shop-domain-3"
    );
    expect(canonicalizeShopDomain(null as any)).toBe("");
    expect(canonicalizeShopDomain(undefined as any)).toBe("");
    expect(canonicalizeShopDomain(123 as any)).toBe("");
  });
});

// ── Legacy shopify.js domain validation ─────────────────────────────────────

describe("Legacy shopify.js — fail closed on missing/non-canonical domain", () => {
  // A single query-string cache key is used throughout because SHOPIFY_STORE_DOMAIN
  // is read at function-call time (not module-init time), so a shared module
  // instance correctly reflects each test's env mutation.
  it("getInventoryInfo returns null when SHOPIFY_STORE_DOMAIN is missing", async () => {
    const savedDomain = process.env.SHOPIFY_STORE_DOMAIN;
    const savedToken = process.env.SHOPIFY_API_TOKEN;
    try {
      delete process.env.SHOPIFY_STORE_DOMAIN;
      process.env.SHOPIFY_API_TOKEN = "shpat_test_token";
      const mod = await import("../server/shopify.js?legacy-domain-tests");
      const result = await mod.getInventoryInfo("123");
      expect(result).toBeNull();
    } finally {
      if (savedDomain !== undefined) process.env.SHOPIFY_STORE_DOMAIN = savedDomain;
      else delete process.env.SHOPIFY_STORE_DOMAIN;
      if (savedToken !== undefined) process.env.SHOPIFY_API_TOKEN = savedToken;
      else delete process.env.SHOPIFY_API_TOKEN;
    }
  });

  it("getInventoryInfo returns null when SHOPIFY_STORE_DOMAIN is non-canonical (old hardcoded GGE fallback)", async () => {
    const savedDomain = process.env.SHOPIFY_STORE_DOMAIN;
    const savedToken = process.env.SHOPIFY_API_TOKEN;
    try {
      // Non-canonical: missing .myshopify.com suffix (the old hardcoded fallback)
      process.env.SHOPIFY_STORE_DOMAIN = "glitzyglitterexpress.com";
      process.env.SHOPIFY_API_TOKEN = "shpat_test_token";
      const mod = await import("../server/shopify.js?legacy-domain-tests");
      const result = await mod.getInventoryInfo("123");
      expect(result).toBeNull();
    } finally {
      if (savedDomain !== undefined) process.env.SHOPIFY_STORE_DOMAIN = savedDomain;
      else delete process.env.SHOPIFY_STORE_DOMAIN;
      if (savedToken !== undefined) process.env.SHOPIFY_API_TOKEN = savedToken;
      else delete process.env.SHOPIFY_API_TOKEN;
    }
  });

  it("getInventoryInfo returns null when domain is a URL with scheme and path", async () => {
    const savedDomain = process.env.SHOPIFY_STORE_DOMAIN;
    const savedToken = process.env.SHOPIFY_API_TOKEN;
    try {
      process.env.SHOPIFY_STORE_DOMAIN = "https://mystore.myshopify.com/admin";
      process.env.SHOPIFY_API_TOKEN = "shpat_test_token";
      const mod = await import("../server/shopify.js?legacy-domain-tests");
      const result = await mod.getInventoryInfo("123");
      expect(result).toBeNull();
    } finally {
      if (savedDomain !== undefined) process.env.SHOPIFY_STORE_DOMAIN = savedDomain;
      else delete process.env.SHOPIFY_STORE_DOMAIN;
      if (savedToken !== undefined) process.env.SHOPIFY_API_TOKEN = savedToken;
      else delete process.env.SHOPIFY_API_TOKEN;
    }
  });

  it("updateInventory skips (logs, does not throw) when domain is missing", async () => {
    const savedDomain = process.env.SHOPIFY_STORE_DOMAIN;
    const savedToken = process.env.SHOPIFY_API_TOKEN;
    try {
      delete process.env.SHOPIFY_STORE_DOMAIN;
      process.env.SHOPIFY_API_TOKEN = "shpat_test_token";
      const mod = await import("../server/shopify.js?legacy-domain-tests");
      // Should not throw even with no domain configured
      await expect(mod.updateInventory("item1", "loc1", 5)).resolves.toBeUndefined();
    } finally {
      if (savedDomain !== undefined) process.env.SHOPIFY_STORE_DOMAIN = savedDomain;
      else delete process.env.SHOPIFY_STORE_DOMAIN;
      if (savedToken !== undefined) process.env.SHOPIFY_API_TOKEN = savedToken;
      else delete process.env.SHOPIFY_API_TOKEN;
    }
  });

  it("updateInventory skips when domain is non-canonical", async () => {
    const savedDomain = process.env.SHOPIFY_STORE_DOMAIN;
    const savedToken = process.env.SHOPIFY_API_TOKEN;
    try {
      process.env.SHOPIFY_STORE_DOMAIN = "glitzyglitterexpress.com";
      process.env.SHOPIFY_API_TOKEN = "shpat_test_token";
      const mod = await import("../server/shopify.js?legacy-domain-tests");
      await expect(mod.updateInventory("item1", "loc1", 5)).resolves.toBeUndefined();
    } finally {
      if (savedDomain !== undefined) process.env.SHOPIFY_STORE_DOMAIN = savedDomain;
      else delete process.env.SHOPIFY_STORE_DOMAIN;
      if (savedToken !== undefined) process.env.SHOPIFY_API_TOKEN = savedToken;
      else delete process.env.SHOPIFY_API_TOKEN;
    }
  });
});

// ── API version and centralization tests ─────────────────────────────────────

describe("Shopify Admin API version — 2026-07 pilot preflight", () => {
  it("gateway exports SHOPIFY_API_VERSION = '2026-07'", async () => {
    // Import without query-string so TypeScript resolves the exported type
    const { SHOPIFY_API_VERSION } = await import("../server/providers/shopify-gateway.js");
    expect(SHOPIFY_API_VERSION).toBe("2026-07");
  });

  it("API version is not 2024-01 anywhere in gateway source", async () => {
    const src = await Bun.file("server/providers/shopify-gateway.js").text();
    expect(src).not.toContain('"2024-01"');
    expect(src).not.toContain("'2024-01'");
  });

  it("API version is not 2024-01 anywhere in oauth-routes source", async () => {
    const src = await Bun.file("server/shopify-oauth-routes.js").text();
    expect(src).not.toContain('"2024-01"');
    expect(src).not.toContain("'2024-01'");
  });

  it("gateway source contains exactly one version string definition", async () => {
    const src = await Bun.file("server/providers/shopify-gateway.js").text();
    // Count how many times any version pattern appears as a string literal
    const versionLiterals = (src.match(/"20\d\d-\d\d"/g) || []);
    // Only one literal — the SHOPIFY_API_VERSION assignment
    expect(versionLiterals.length).toBe(1);
    expect(versionLiterals[0]).toBe('"2026-07"');
  });

  it("oauth-routes does NOT declare its own API_VERSION constant", async () => {
    const src = await Bun.file("server/shopify-oauth-routes.js").text();
    // No local const or let API_VERSION assignment
    expect(src).not.toMatch(/const\s+API_VERSION\s*=/);
    expect(src).not.toMatch(/let\s+API_VERSION\s*=/);
  });

  it("oauth-routes imports SHOPIFY_API_VERSION from gateway", async () => {
    const src = await Bun.file("server/shopify-oauth-routes.js").text();
    expect(src).toContain("SHOPIFY_API_VERSION");
    expect(src).toContain("shopify-gateway");
  });

  it("approved OAuth scopes are still exactly the four read-only scopes", async () => {
    const src = await Bun.file("server/shopify-oauth-routes.js").text();
    const match = src.match(/const REQUIRED_SCOPES\s*=\s*\[([\s\S]*?)\]/);
    expect(match).toBeTruthy();
    const block = match![1];
    expect(block).toContain("read_orders");
    expect(block).toContain("read_products");
    expect(block).toContain("read_inventory");
    expect(block).toContain("read_locations");
    // No write scopes
    expect(block).not.toContain("write_");
    // No unapproved extra scopes
    expect(block).not.toContain("read_all_orders");
    expect(block).not.toContain("read_customers");
    expect(block).not.toContain("read_fulfillments");
  });

  it("REST write methods are still blocked at gateway level", async () => {
    const { gatewayFetch } = await import("../server/providers/shopify-gateway.js?write-block-v2");
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      await expect(
        gatewayFetch("readonly", "test.myshopify.com", "tok", method, "/products.json")
      ).rejects.toThrow();
    }
  });

  it("GraphQL mutations still blocked in readonly mode", async () => {
    const { gatewayGraphQL } = await import("../server/providers/shopify-gateway.js?gql-block-v2");
    await expect(
      gatewayGraphQL("readonly", "test.myshopify.com", "tok", "mutation { productUpdate(input: {}) { product { id } } }")
    ).rejects.toThrow();
  });

  it("ambiguous GraphQL fails closed", async () => {
    const { gatewayGraphQL } = await import("../server/providers/shopify-gateway.js?gql-ambiguous-v2");
    await expect(
      gatewayGraphQL("readonly", "test.myshopify.com", "tok", "{ shop { name } } some extra garbage")
    ).rejects.toThrow();
  });
});
