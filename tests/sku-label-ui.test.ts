import { describe, expect, it } from "bun:test";

describe("Novi SKU & Label Studio UX contract", () => {
  it("keeps the default flow streamlined and customization progressive", async () => {
    const source = await Bun.file("client/src/pages/SkuLabelStudio.tsx").text();
    expect(source).toContain("Yes, set them up");
    expect(source).toContain("Review first");
    expect(source).toContain("Customize");
    expect(source).toContain('useState(false)');
    expect(source).toContain("Where should I save these?");
    expect(source).toContain("ShimmerStock only");
    expect(source).toContain("ShimmerStock + Shopify");
    expect(source).toContain("Save now and print");
  });

  it("provides exact thermal dimensions and test-label-first printing", async () => {
    const source = await Bun.file("client/src/pages/SkuLabelStudio.tsx").text();
    expect(source).toContain('"2x1": { label: "2 x 1 inch", width: 2, height: 1 }');
    expect(source).toContain('"2.25x1.25"');
    expect(source).toContain('"3x2"');
    expect(source).toContain('"4x2"');
    expect(source).toContain("Print one test label");
    expect(source).toContain("@page");
    expect(source).toContain("in ${labelSize.height}in");
  });

  it("never labels Product Editing mode as read-only", async () => {
    const source = await Bun.file("client/src/components/ShopifyConnect.tsx").text();
    expect(source).toContain('status!.identifierWritebackEnabled ? "Product Writeback Enabled" : "Safe Mode"');
    expect(source).toContain('status!.identifierWritebackEnabled ? "SKU/Barcode Only" : "Read Only"');
    expect(source).toContain('!status!.identifierWritebackEnabled && !safeModeDismissed');
    expect(source).toContain("Each update is re-read from Shopify");
    expect(source).toContain("Inventory, orders, locations, titles, prices, and collections remain read-only");
    expect(source).not.toContain("inventory counts will be synced both ways");
    expect(source).not.toContain("Enable Full Sync");
  });

  it("offers instant scanning without automatic Shopify inventory writes", async () => {
    const source = await Bun.file("client/src/pages/SkuLabelStudio.tsx").text();
    expect(source).toContain("Scan Something");
    expect(source).toContain("USB and Bluetooth scanners work automatically");
    expect(source).toContain('navigate("/scan")');
    expect(source).toContain("Shopify locations");
    expect(source).toContain("Inventory is not tracked in Shopify");
    expect(source).not.toContain("write_inventory");
  });

  it("offers the automatic post-sync catalog audit without forcing review", async () => {
    const source = await Bun.file("client/src/components/ShopifyConnect.tsx").text();
    expect(source).toContain("Catalog audit ready");
    expect(source).toContain("Review catalog");
    expect(source).toContain("Not now");
  });

  it("distinguishes local saves, Shopify mismatches, and failed writebacks", async () => {
    const source = await Bun.file("client/src/pages/SkuLabelStudio.tsx").text();
    expect(source).toContain("Saved in ShimmerStock");
    expect(source).toContain("Shopify was not changed");
    expect(source).toContain("Verified in Shopify");
    expect(source).toContain("Shopify update failed");
    expect(source).toContain("Shopify has a different SKU — review needed");
    expect(source.indexOf('item.sku_sync_state === "SHOPIFY_UPDATE_FAILED"')).toBeLessThan(
      source.indexOf("item.skuTruth?.mismatch"),
    );
  });
});