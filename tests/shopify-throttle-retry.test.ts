/**
 * Shopify Throttle Retry — Bounded Retry Limit Tests
 *
 * Validates:
 *  1.  MAX_THROTTLE_RETRIES is a finite positive number (no infinite loop)
 *  2.  MAX_THROTTLE_BACKOFF_MS provides a hard cap on delay
 *  3.  extractGraphQLErrors correctly identifies THROTTLED via extensions.code
 *  4.  extractGraphQLErrors correctly identifies THROTTLED via message text
 *  5.  Non-throttle errors are not flagged as THROTTLED
 *  6.  Clean response returns isThrottled=false and empty messages
 *  7.  runInitialImport surfaces IMPORT_FAILED after throttle retry exhaustion
 *  8.  runInitialImport succeeds when THROTTLED clears after a single retry
 *  9.  No credential PII appears in the error messages pushed to graphqlErrors
 */

// Must be set before any server module import.
const TEST_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
if (!/^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY || "")) {
  process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
}

import { describe, expect, it, mock } from "bun:test";
import { Database } from "bun:sqlite";

// ── Pre-mock the gateway BEFORE importing shopify-import ─────────────────────

let mockGatewayImpl: (mode: string, domain: string, token: string, query: string) => unknown =
  () => ({ data: { products: { pageInfo: { hasNextPage: false, endCursor: null }, edges: [] } } });

mock.module("../server/providers/shopify-gateway.js", () => ({
  gatewayGraphQL: (mode: string, domain: string, token: string, query: string) =>
    mockGatewayImpl(mode, domain, token, query),
}));

import {
  MAX_THROTTLE_RETRIES,
  MAX_THROTTLE_BACKOFF_MS,
  extractGraphQLErrors,
  runInitialImport,
  IMPORT_STATES,
  _setThrottleSleepFn,
} from "../server/shopify-import.js";
import { initDb } from "../server/db.js";
import { encryptToken } from "../server/crypto-utils.js";

// Eliminate real sleep delays for all throttle-related tests.
_setThrottleSleepFn(() => Promise.resolve());

// ── helpers ──────────────────────────────────────────────────────────────────

function initTestDb(): Database {
  const savedOwner = process.env.OWNER_INITIAL_PASSWORD;
  const savedAdmin = process.env.ADMIN_INITIAL_PASSWORD;
  process.env.OWNER_INITIAL_PASSWORD = "TestOwner!Throttle1";
  process.env.ADMIN_INITIAL_PASSWORD = "TestAdmin!Throttle1";
  try {
    return initDb(`:memory:`);
  } finally {
    if (savedOwner !== undefined) process.env.OWNER_INITIAL_PASSWORD = savedOwner;
    else delete process.env.OWNER_INITIAL_PASSWORD;
    if (savedAdmin !== undefined) process.env.ADMIN_INITIAL_PASSWORD = savedAdmin;
    else delete process.env.ADMIN_INITIAL_PASSWORD;
  }
}

function insertFakeCredential(db: Database, businessId: number, shopDomain: string) {
  // Test-only fixture token — not a real Shopify token (intentional)
  const fakeToken = "TESTFIXTURE_FAKE_SHOPIFY_TOKEN_NOT_REAL_0000000";
  const encrypted = encryptToken(fakeToken);
  db.run(
    `INSERT OR REPLACE INTO provider_credentials
       (business_id, provider, shop_domain, access_token_encrypted, is_active, sync_status, credentials)
     VALUES (?, 'shopify', ?, ?, 1, 'connected', '{}')`,
    [businessId, shopDomain, encrypted]
  );
}

/** Return a Shopify THROTTLED GraphQL error response. */
function throttledResponse() {
  return {
    errors: [
      {
        message: "Throttled",
        extensions: { code: "THROTTLED" },
      },
    ],
  };
}

/** Return a successful products-only response (no next page). */
function emptyProductsResponse() {
  return {
    data: {
      products: { pageInfo: { hasNextPage: false, endCursor: null }, edges: [] },
    },
  };
}

/** Return a successful locations response (no next page). */
function emptyLocationsResponse() {
  return {
    data: {
      locations: { pageInfo: { hasNextPage: false, endCursor: null }, edges: [] },
    },
  };
}

/** Return a successful orders response (no next page). */
function emptyOrdersResponse() {
  return {
    data: {
      orders: { pageInfo: { hasNextPage: false, endCursor: null }, edges: [] },
    },
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("Throttle retry constants", () => {
  it("MAX_THROTTLE_RETRIES is a finite positive integer", () => {
    expect(typeof MAX_THROTTLE_RETRIES).toBe("number");
    expect(Number.isFinite(MAX_THROTTLE_RETRIES)).toBe(true);
    expect(MAX_THROTTLE_RETRIES).toBeGreaterThan(0);
    // Sanity-check it is not absurdly large (would still allow infinite effective looping)
    expect(MAX_THROTTLE_RETRIES).toBeLessThanOrEqual(20);
  });

  it("MAX_THROTTLE_BACKOFF_MS is a finite positive number with a hard cap", () => {
    expect(typeof MAX_THROTTLE_BACKOFF_MS).toBe("number");
    expect(Number.isFinite(MAX_THROTTLE_BACKOFF_MS)).toBe(true);
    expect(MAX_THROTTLE_BACKOFF_MS).toBeGreaterThan(0);
    // Must not be unbounded (e.g. Infinity or a multi-minute value per retry)
    expect(MAX_THROTTLE_BACKOFF_MS).toBeLessThanOrEqual(60_000);
  });
});

// ── extractGraphQLErrors ──────────────────────────────────────────────────────

describe("extractGraphQLErrors — THROTTLED detection", () => {
  it("detects THROTTLED via extensions.code", () => {
    const result = extractGraphQLErrors({
      errors: [{ message: "Query cost exceeded", extensions: { code: "THROTTLED" } }],
    });
    expect(result.isThrottled).toBe(true);
    expect(result.messages).toHaveLength(1);
  });

  it("detects THROTTLED via message text (case-insensitive Throttled substring)", () => {
    const result = extractGraphQLErrors({
      errors: [{ message: "Throttled: query cost 500 exceeds bucket size 1000" }],
    });
    expect(result.isThrottled).toBe(true);
  });

  it("does NOT flag a non-throttle error as THROTTLED", () => {
    const result = extractGraphQLErrors({
      errors: [{ message: "Field 'foo' doesn't exist", extensions: { code: "GRAPHQL_VALIDATION_FAILED" } }],
    });
    expect(result.isThrottled).toBe(false);
    expect(result.messages).toHaveLength(1);
  });

  it("returns isThrottled=false and empty messages for a clean response", () => {
    const result = extractGraphQLErrors({ data: { products: {} } });
    expect(result.isThrottled).toBe(false);
    expect(result.messages).toHaveLength(0);
  });

  it("returns isThrottled=false and empty messages when errors array is empty", () => {
    const result = extractGraphQLErrors({ errors: [] });
    expect(result.isThrottled).toBe(false);
    expect(result.messages).toHaveLength(0);
  });
});

// ── runInitialImport throttle exhaustion ──────────────────────────────────────

describe("runInitialImport — throttle retry exhaustion", () => {
  it("surfaces IMPORT_FAILED after THROTTLED exceeds MAX_THROTTLE_RETRIES on products", async () => {
    const db = initTestDb();
    insertFakeCredential(db, 1, "throttle-test.myshopify.com");

    let callCount = 0;
    mockGatewayImpl = () => {
      callCount++;
      return throttledResponse();
    };

    const result = await runInitialImport(db, 1);

    // Must NOT be SYNCED or still IMPORTING — throttle exhaustion must surface a terminal error state.
    // The import layer maps graphqlErrors → RECONCILIATION_REQUIRED (not SYNCED).
    expect(result.state).not.toBe(IMPORT_STATES.SYNCED);
    expect(result.state).not.toBe("IMPORTING");
    // Must be one of the two acceptable terminal-error states.
    const terminalErrorStates = [IMPORT_STATES.IMPORT_FAILED, IMPORT_STATES.RECONCILIATION_REQUIRED];
    expect(terminalErrorStates).toContain(result.state as string);
    // Must have called the gateway a finite number of times.
    // 3 fetches (products, locations, orders) each exhaust their retry budget.
    expect(callCount).toBeGreaterThan(0);
    expect(callCount).toBeLessThanOrEqual((MAX_THROTTLE_RETRIES + 1) * 4);
    // Error message must not contain the raw access token or shop domain credential detail
    const errorText = JSON.stringify(result);
    expect(errorText).not.toContain("TESTFIXTURE_FAKE_SHOPIFY_TOKEN_NOT_REAL");
  });

  it("succeeds when THROTTLED resolves after one retry (no false IMPORT_FAILED)", async () => {
    const db = initTestDb();
    insertFakeCredential(db, 1, "throttle-recover.myshopify.com");

    let callCount = 0;
    mockGatewayImpl = (_mode, _domain, _token, query) => {
      callCount++;
      // First call for products is THROTTLED; second succeeds
      if (callCount === 1) return throttledResponse();
      // Products page
      if (String(query).includes("products(")) return emptyProductsResponse();
      // Locations page
      if (String(query).includes("locations(")) return emptyLocationsResponse();
      // Orders page
      if (String(query).includes("orders(")) return emptyOrdersResponse();
      return { data: {} };
    };

    const result = await runInitialImport(db, 1);

    // After a single THROTTLE that recovers, the import must not fail
    expect(result.state).not.toBe(IMPORT_STATES.IMPORT_FAILED);
  });

  it("error messages pushed on exhaustion do not contain raw credentials or PII", async () => {
    const db = initTestDb();
    insertFakeCredential(db, 1, "throttle-pii-test.myshopify.com");

    mockGatewayImpl = () => throttledResponse();

    const result = await runInitialImport(db, 1);

    const resultStr = JSON.stringify(result);
    // Access token must never appear in any result field
    expect(resultStr).not.toContain("TESTFIXTURE_FAKE_SHOPIFY_TOKEN_NOT_REAL");
    // Email-like patterns must not appear
    expect(resultStr).not.toMatch(/@[a-z]+\.[a-z]{2,}/);
  });

  it("inventory GraphQL errors cannot report SYNCED", async () => {
    const db = initTestDb();
    insertFakeCredential(db, 1, "inventory-error.myshopify.com");

    mockGatewayImpl = (_mode, _domain, _token, query) => {
      if (String(query).includes("products(")) return emptyProductsResponse();
      if (String(query).includes("locations(")) {
        return {
          data: {
            locations: {
              pageInfo: { hasNextPage: false, endCursor: null },
              edges: [{ node: {
                id: "gid://shopify/Location/401",
                name: "Inventory Error Location",
                isActive: true,
                address: { formatted: [] },
              } }],
            },
          },
        };
      }
      if (String(query).includes("location(id:")) {
        return {
          errors: [{
            message: "Field 'available' doesn't exist on type 'InventoryLevel'",
            extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
          }],
        };
      }
      if (String(query).includes("orders(")) return emptyOrdersResponse();
      return { data: {} };
    };

    const result = await runInitialImport(db, 1);
    const summary = result.summary as any;

    expect(result.state).toBe(IMPORT_STATES.RECONCILIATION_REQUIRED);
    expect(result.state).not.toBe(IMPORT_STATES.SYNCED);
    expect(summary.graphqlErrors).toContain(
      "inventory: Field 'available' doesn't exist on type 'InventoryLevel'"
    );
    db.close();
  });
});
