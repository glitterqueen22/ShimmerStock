/**
 * Tabs fallback active-ID consistency test.
 *
 * Verifies that the default active fallback for tabs without an explicit id/key
 * matches the generated tab ID used during rendering (`tab-${index}`), so the
 * first tab is visually active by default when no active prop is supplied.
 */
import { describe, expect, it } from "bun:test";

/**
 * Mirrors the fallback logic in client/src/components/ui/Tabs.tsx.
 * currentActive = active ?? activeId ?? activeTab ?? (tabs[0]?.id ?? tabs[0]?.key ?? `tab-0`)
 * tabId         = tab.id ?? tab.key ?? `tab-${index}`
 */
function computeActive(
  tabs: Array<{ id?: string; key?: string; label: string }>,
  active?: string,
  activeId?: string,
  activeTab?: string
): string {
  return active ?? activeId ?? activeTab ?? (tabs[0]?.id ?? tabs[0]?.key ?? "tab-0");
}

function tabId(tab: { id?: string; key?: string }, index: number): string {
  return tab.id ?? tab.key ?? `tab-${index}`;
}

describe("Tabs default-active fallback", () => {
  it("first tab is active by default when no active prop supplied and tabs have no id/key", () => {
    const tabs = [
      { label: "Orders" },
      { label: "Products" },
      { label: "Settings" },
    ];
    const defaultActive = computeActive(tabs);
    const firstTabId = tabId(tabs[0], 0);
    // Both must be "tab-0" — previously defaultActive was '' and firstTabId was 'tab-0'
    expect(defaultActive).toBe("tab-0");
    expect(firstTabId).toBe("tab-0");
    expect(defaultActive).toBe(firstTabId);
  });

  it("first tab is active by default when tabs have explicit id", () => {
    const tabs = [
      { id: "orders", label: "Orders" },
      { id: "products", label: "Products" },
    ];
    const defaultActive = computeActive(tabs);
    const firstTabId = tabId(tabs[0], 0);
    expect(defaultActive).toBe("orders");
    expect(firstTabId).toBe("orders");
    expect(defaultActive).toBe(firstTabId);
  });

  it("first tab is active by default when tabs have explicit key (no id)", () => {
    const tabs = [
      { key: "k-orders", label: "Orders" },
      { key: "k-products", label: "Products" },
    ];
    const defaultActive = computeActive(tabs);
    const firstTabId = tabId(tabs[0], 0);
    expect(defaultActive).toBe("k-orders");
    expect(firstTabId).toBe("k-orders");
    expect(defaultActive).toBe(firstTabId);
  });

  it("explicit active prop overrides the fallback", () => {
    const tabs = [
      { label: "Orders" },
      { label: "Products" },
    ];
    const defaultActive = computeActive(tabs, "products-manual");
    expect(defaultActive).toBe("products-manual");
  });

  it("activeId and activeTab are also accepted as override", () => {
    const tabs = [{ label: "A" }, { label: "B" }];
    expect(computeActive(tabs, undefined, "via-activeId")).toBe("via-activeId");
    expect(computeActive(tabs, undefined, undefined, "via-activeTab")).toBe("via-activeTab");
  });

  it("empty tabs array falls back to 'tab-0' without throwing", () => {
    const tabs: Array<{ label: string }> = [];
    expect(computeActive(tabs)).toBe("tab-0");
  });
});
