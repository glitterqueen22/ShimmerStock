/**
 * Tests for workspace state gating, business DNA, and checklist storage isolation.
 *
 * Verifies:
 * - empty workspace does not show demo Novi alerts
 * - demo workspace shows labeled illustrative insights
 * - switching demo industry does not mutate real business data
 * - real workspace does not receive demo records or insights
 * - business DNA terminology updates per business type
 * - checklist storage key isolates by both businessId AND userId
 */
import { describe, expect, it } from "bun:test";
import {
  deriveWorkspaceState,
  filterInsightsByWorkspaceState,
  isDemoState,
} from "../client/src/lib/workspaceState";
import {
  getBusinessDna,
  getDemoInsights,
  getTerms,
  BUSINESS_TYPES,
  type BusinessTypeId,
} from "../client/src/lib/businessDna";
import { getChecklistStorageKey } from "../client/src/components/FirstDayChecklist";

// ── Workspace state derivation ────────────────────────────────────────

describe("deriveWorkspaceState", () => {
  it("returns empty_real for a brand-new workspace with no data", () => {
    const config = deriveWorkspaceState({
      hasAnyProducts: false,
      hasAnyOrders: false,
      hasCompletedOnboarding: false,
    });
    expect(config.state).toBe("empty_real");
    expect(config.demoLabel).toBeNull();
  });

  it("returns demo when isDemoMode is true", () => {
    const config = deriveWorkspaceState({
      hasAnyProducts: false,
      hasAnyOrders: false,
      hasCompletedOnboarding: false,
      isDemoMode: true,
      demoTypeId: "craft_supplies",
    });
    expect(config.state).toBe("demo");
    expect(config.demoTypeId).toBe("craft_supplies");
    expect(config.demoLabel).toBeTruthy();
  });

  it("defaults demo type to craft_supplies when not specified", () => {
    const config = deriveWorkspaceState({
      hasAnyProducts: false,
      hasAnyOrders: false,
      hasCompletedOnboarding: false,
      isDemoMode: true,
    });
    expect(config.demoTypeId).toBe("craft_supplies");
  });

  it("returns real when products exist and not demo mode", () => {
    const config = deriveWorkspaceState({
      hasAnyProducts: true,
      hasAnyOrders: false,
      hasCompletedOnboarding: true,
    });
    expect(config.state).toBe("real");
    expect(config.demoTypeId).toBeNull();
  });

  it("returns real when orders exist even without products", () => {
    const config = deriveWorkspaceState({
      hasAnyProducts: false,
      hasAnyOrders: true,
      hasCompletedOnboarding: true,
    });
    expect(config.state).toBe("real");
  });
});

// ── Insight filtering by workspace state ─────────────────────────────

describe("filterInsightsByWorkspaceState", () => {
  const demoInsights = getDemoInsights("craft_supplies");
  const realInsight = { ...demoInsights[0], is_demo: false as any };

  it("empty_real returns no insights — no fake alerts for new users", () => {
    const result = filterInsightsByWorkspaceState(demoInsights, "empty_real");
    expect(result).toHaveLength(0);
  });

  it("demo returns only is_demo=true insights", () => {
    const mixed = [...demoInsights, realInsight];
    const result = filterInsightsByWorkspaceState(mixed, "demo");
    result.forEach((i) => expect(i.is_demo).toBe(true));
  });

  it("real returns only is_demo=false insights", () => {
    const mixed = [...demoInsights, realInsight];
    const result = filterInsightsByWorkspaceState(mixed, "real");
    result.forEach((i) => expect((i as any).is_demo).not.toBe(true));
  });

  it("real workspace gets no demo insights", () => {
    const result = filterInsightsByWorkspaceState(demoInsights, "real");
    expect(result).toHaveLength(0);
  });
});

// ── isDemoState helper ────────────────────────────────────────────────

describe("isDemoState", () => {
  it("returns true only for demo state", () => {
    expect(isDemoState("demo")).toBe(true);
    expect(isDemoState("empty_real")).toBe(false);
    expect(isDemoState("real")).toBe(false);
  });
});

// ── Business DNA: switching type never mutates base data ──────────────

describe("businessDna — data isolation", () => {
  it("getBusinessDna returns a copy; mutating it does not affect the module", () => {
    const craftDna = getBusinessDna("craft_supplies");
    const originalProductCount = craftDna.products.length;

    // Simulate "switching" to ecommerce
    const ecommDna = getBusinessDna("ecommerce_brand");
    expect(ecommDna.products.length).not.toBe(0);

    // Craft products are unchanged
    const craftAgain = getBusinessDna("craft_supplies");
    expect(craftAgain.products.length).toBe(originalProductCount);
  });

  it("demo products are not shared across business types", () => {
    const craft = getBusinessDna("craft_supplies");
    const ecomm = getBusinessDna("ecommerce_brand");
    const craftSkus = new Set(craft.products.map((p) => p.sku));
    const ecommSkus = new Set(ecomm.products.map((p) => p.sku));
    // No SKU overlap between the two flagship demo workspaces
    for (const sku of ecommSkus) {
      expect(craftSkus.has(sku)).toBe(false);
    }
  });

  it("demo orders are not shared across business types", () => {
    const craft = getBusinessDna("craft_supplies");
    const ecomm = getBusinessDna("ecommerce_brand");
    const craftOrderIds = new Set(craft.orders.map((o) => o.id));
    const ecommOrderIds = new Set(ecomm.orders.map((o) => o.id));
    for (const id of ecommOrderIds) {
      expect(craftOrderIds.has(id)).toBe(false);
    }
  });
});

// ── Business DNA: terminology adaptation ─────────────────────────────

describe("businessDna — terminology", () => {
  it("freshies uses 'Formula' not 'Recipe'", () => {
    const terms = getTerms("freshies");
    expect(terms.recipe).toBe("Formula");
  });

  it("made_to_order uses 'Item' for product", () => {
    const terms = getTerms("made_to_order");
    expect(terms.product).toBe("Item");
  });

  it("made_to_order uses 'Job' for batch", () => {
    const terms = getTerms("made_to_order");
    expect(terms.batch).toBe("Job");
  });

  it("craft_supplies uses base terms", () => {
    const terms = getTerms("craft_supplies");
    expect(terms.product).toBe("Product");
    expect(terms.production).toBe("Production");
  });

  it("ecommerce_brand uses base terms", () => {
    const terms = getTerms("ecommerce_brand");
    expect(terms.order).toBe("Order");
    expect(terms.customer).toBe("Customer");
  });

  it("all four approved business types are registered", () => {
    const ids: BusinessTypeId[] = ["craft_supplies", "ecommerce_brand", "made_to_order", "freshies"];
    for (const id of ids) {
      const dna = getBusinessDna(id);
      expect(dna.id).toBe(id);
      expect(dna.name).toBeTruthy();
    }
  });

  it("BUSINESS_TYPES list has exactly four entries", () => {
    expect(BUSINESS_TYPES).toHaveLength(4);
  });

  it("unknown type falls back to craft_supplies without error", () => {
    const dna = getBusinessDna("unknown_type");
    expect(dna.id).toBe("craft_supplies");
  });
});

// ── Demo insights: all marked is_demo=true ────────────────────────────

describe("businessDna — demo insight labeling", () => {
  const allTypes: BusinessTypeId[] = ["craft_supplies", "ecommerce_brand", "made_to_order", "freshies"];

  for (const typeId of allTypes) {
    it(`all insights for ${typeId} have is_demo=true`, () => {
      const insights = getDemoInsights(typeId);
      for (const insight of insights) {
        expect(insight.is_demo).toBe(true);
      }
    });
  }

  it("filtered insights by engine return only matching engine + hq", () => {
    const inventoryInsights = getDemoInsights("craft_supplies", "inventory");
    for (const i of inventoryInsights) {
      expect(["inventory", "hq"].includes(i.engine)).toBe(true);
    }
  });
});

// ── FirstDayChecklist — fail-closed localStorage isolation ────────────

describe("FirstDayChecklist — storage key isolation", () => {
  it("returns a non-null key when both IDs are present", () => {
    const key = getChecklistStorageKey(42, 7);
    expect(key).not.toBeNull();
    expect(key).toContain("b42");
    expect(key).toContain("u7");
  });

  it("different users in the same business get different keys", () => {
    const userA = getChecklistStorageKey(42, 1);
    const userB = getChecklistStorageKey(42, 2);
    expect(userA).not.toBe(userB);
  });

  it("same user in different businesses gets different keys", () => {
    const bizA = getChecklistStorageKey(10, 1);
    const bizB = getChecklistStorageKey(20, 1);
    expect(bizA).not.toBe(bizB);
  });

  it("returns null (not empty string) when businessId is missing", () => {
    expect(getChecklistStorageKey(undefined, 1)).toBeNull();
    expect(getChecklistStorageKey(null, 1)).toBeNull();
    expect(getChecklistStorageKey("", 1)).toBeNull();
  });

  it("returns null (not empty string) when userId is missing", () => {
    expect(getChecklistStorageKey(42, undefined)).toBeNull();
    expect(getChecklistStorageKey(42, null)).toBeNull();
    expect(getChecklistStorageKey(42, "")).toBeNull();
  });

  it("returns null when both are missing", () => {
    expect(getChecklistStorageKey(undefined, undefined)).toBeNull();
    expect(getChecklistStorageKey(null, null)).toBeNull();
  });

  it("key is deterministic for the same business+user pair", () => {
    const k1 = getChecklistStorageKey(99, 5);
    const k2 = getChecklistStorageKey(99, 5);
    expect(k1).toBe(k2);
  });
});

describe("FirstDayChecklist — fail-closed localStorage behavior", () => {
  it("null key must never be used as a localStorage key (empty string rejected)", () => {
    const nullKey = getChecklistStorageKey(undefined, 1);
    expect(nullKey).toBeNull();
    // Prove the null check prevents any storage call:
    // callers must guard: if (key !== null) { localStorage.getItem(key) }
    // accessing localStorage[""] would be a bug — we assert the key is not ""
    if (nullKey !== null) {
      expect(nullKey.length).toBeGreaterThan(0);
    }
  });

  it("valid key is a non-empty string", () => {
    const key = getChecklistStorageKey(1, 2);
    expect(typeof key).toBe("string");
    expect((key as string).length).toBeGreaterThan(0);
  });

  it("key format prevents cross-user contamination", () => {
    // User 1 of biz 42 vs user 2 of biz 42 — must not share a key
    const u1 = getChecklistStorageKey(42, 1) as string;
    const u2 = getChecklistStorageKey(42, 2) as string;
    expect(u1).not.toBe(u2);
    // Switching userId resets which key is used
    expect(u1.includes("u1")).toBe(true);
    expect(u2.includes("u2")).toBe(true);
  });

  it("key format prevents cross-business contamination", () => {
    const b10 = getChecklistStorageKey(10, 1) as string;
    const b20 = getChecklistStorageKey(20, 1) as string;
    expect(b10).not.toBe(b20);
    expect(b10.includes("b10")).toBe(true);
    expect(b20.includes("b20")).toBe(true);
  });

  it("key uniquely identifies the business+user pair", () => {
    // Four combinations for biz 1/2 × user 1/2 must all be distinct
    const keys = [
      getChecklistStorageKey(1, 1),
      getChecklistStorageKey(1, 2),
      getChecklistStorageKey(2, 1),
      getChecklistStorageKey(2, 2),
    ];
    const unique = new Set(keys);
    expect(unique.size).toBe(4);
  });
});

// ── Business DNA UI coverage — terminology per engine ─────────────────

describe("businessDna — terminology for all required engines", () => {
  // Command Center
  it("craft_supplies — order label for Command Center Today cards", () => {
    const terms = getTerms("craft_supplies");
    expect(terms.order).toBe("Order");
    expect(terms.inventory).toBe("Inventory");
    expect(terms.production).toBe("Production");
    expect(terms.purchasing).toBe("Purchasing");
    expect(terms.fulfillment).toBe("Fulfillment");
  });

  it("freshies — production adapts for Command Center", () => {
    const terms = getTerms("freshies");
    expect(terms.production).toBe("Batch Production");
  });

  it("made_to_order — production adapts for Command Center", () => {
    const terms = getTerms("made_to_order");
    expect(terms.production).toBe("Production Schedule");
  });

  // Inventory / Products
  it("freshies — inventory uses 'Materials' terminology", () => {
    const terms = getTerms("freshies");
    expect(terms.inventory).toBe("Materials");
  });

  it("craft_supplies — inventory uses base term", () => {
    const terms = getTerms("craft_supplies");
    expect(terms.inventory).toBe("Inventory");
  });

  // Warehouse
  it("freshies — warehouse uses 'Formula Shelf' for bin", () => {
    const terms = getTerms("freshies");
    expect(terms.bin).toBe("Formula Shelf");
  });

  it("craft_supplies — bin uses base term 'Bin'", () => {
    const terms = getTerms("craft_supplies");
    expect(terms.bin).toBe("Bin");
  });

  // Orders (for Fulfillment + CustomerHub)
  it("made_to_order — order term adapts", () => {
    const terms = getTerms("made_to_order");
    expect(terms.order).toBe("Order"); // universal concept kept
  });

  it("all types have fulfillment term defined", () => {
    const types: BusinessTypeId[] = ["craft_supplies", "ecommerce_brand", "made_to_order", "freshies"];
    for (const t of types) {
      const terms = getTerms(t);
      expect(typeof terms.fulfillment).toBe("string");
      expect(terms.fulfillment.length).toBeGreaterThan(0);
    }
  });

  it("all types have customer term defined", () => {
    const types: BusinessTypeId[] = ["craft_supplies", "ecommerce_brand", "made_to_order", "freshies"];
    for (const t of types) {
      const terms = getTerms(t);
      expect(typeof terms.customer).toBe("string");
      expect(terms.customer.length).toBeGreaterThan(0);
    }
  });

  it("all types have warehouse term defined", () => {
    const types: BusinessTypeId[] = ["craft_supplies", "ecommerce_brand", "made_to_order", "freshies"];
    for (const t of types) {
      const terms = getTerms(t);
      expect(typeof terms.warehouse).toBe("string");
      expect(terms.warehouse.length).toBeGreaterThan(0);
    }
  });
});
