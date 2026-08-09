import { describe, expect, it } from "bun:test";

describe("Novi Command Center UI contract", () => {
  it("renders live tenant exceptions and safe module handoffs without demo claims", async () => {
    const source = await Bun.file("client/src/pages/HQ.tsx").text();
    expect(source).toContain("Live workspace");
    expect(source).toContain("No operational exceptions right now.");
    expect(source).toContain("Preview mission");
    expect(source).toContain("review and approve the work");
    expect(source).toContain("What Novi remembers");
    expect(source).not.toContain("getDemoInsights");
    expect(source).not.toContain("Demo ·");
  });

  it("uses one reusable pink-forward wordmark and favicon treatment", async () => {
    const brand = await Bun.file("client/src/components/BrandMark.tsx").text();
    const navbar = await Bun.file("client/src/components/ui/Navbar.tsx").text();
    const html = await Bun.file("client/index.html").text();
    expect(brand).toContain('aria-label="ShimmerStock"');
    expect(brand).toContain("#f43f72");
    expect(brand).toContain("#6d28d9");
    expect(brand).toContain("#a7dc9b");
    expect(navbar.match(/<BrandMark/g)).toHaveLength(2);
    expect(html).toContain('href="/favicon.svg"');
    expect(html).toContain('content="#f43f72"');
  });

  it("gives Novi a warm, wider silhouette with restrained eyes", async () => {
    const source = await Bun.file("client/src/components/Novi.tsx").text();
    expect(source).toContain("warm pebble silhouette");
    expect(source).toContain("cfg.eyeRx * 0.82");
    expect(source).toContain('primary: "#9B6BD3"');
    expect(source).toContain('core: "#FFF8F4"');
  });
});