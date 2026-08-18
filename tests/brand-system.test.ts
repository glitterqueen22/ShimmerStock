import { describe, expect, it } from "bun:test";

const BRAND_ASSETS = [
  "shimmerstock-logo-horizontal.svg",
  "shimmerstock-logo-horizontal-dark.svg",
  "shimmerstock-logo-stacked.svg",
  "shimmerstock-mark.svg",
  "shimmerstock-mark-dark.svg",
  "shimmerstock-wordmark.svg",
  "novi-sparkle.svg",
  "shimmerstock-layers-symbol.svg",
];

describe("approved ShimmerStock brand system", () => {
  it("keeps the approved board as documentation and exposes clean SVG assets", async () => {
    expect(await Bun.file("docs/brand/shimmerstock-approved-brand-board.png").exists()).toBe(true);
    expect(await Bun.file("docs/brand/README.md").exists()).toBe(true);

    for (const asset of BRAND_ASSETS) {
      const source = await Bun.file(`public/brand/${asset}`).text();
      expect(source).toContain("<svg");
      expect(source).toContain("viewBox=");
      expect(source).not.toMatch(/<image\b|data:image|\.png|\.jpe?g/i);
    }
  });

  it("uses reusable logo renderers on public and application surfaces", async () => {
    const marketing = await Bun.file("public/assets/marketing.js").text();
    const appBrand = await Bun.file("client/src/components/BrandMark.tsx").text();
    const login = await Bun.file("client/src/pages/Login.tsx").text();

    expect(marketing).toContain("function brandLogo");
    expect(marketing.match(/brandLogo\(/g)?.length).toBeGreaterThanOrEqual(4);
    expect(appBrand).toContain('variant?: "light" | "dark" | "oneColor"');
    expect(appBrand).toContain('layout?: "horizontal" | "stacked" | "mark"');
    expect(appBrand).toContain("showTagline?: boolean");
    expect(login).toContain("<BrandMark");
    expect(login).not.toContain('>✨</span>');
  });

  it("wires approved browser icons, social art, metadata, and palette tokens", async () => {
    const marketing = await Bun.file("public/assets/marketing.js").text();
    const tokens = await Bun.file("public/assets/marketing/tokens.css").text();
    const appHtml = await Bun.file("client/index.html").text();

    for (const token of ["--brand-navy", "--brand-purple", "--brand-lilac", "--brand-pink", "--brand-peach", "--brand-sage", "--brand-cream"]) {
      expect(tokens).toContain(token);
    }

    expect(marketing).toContain("/brand/shimmerstock-social-1200x630.png");
    expect(marketing).toContain('"logo"');
    expect(marketing).toContain('upsertLink("icon"');
    expect(marketing).toContain('upsertLink("apple-touch-icon"');
    expect(appHtml).toContain('href="/brand/favicon.svg"');
    expect(appHtml).toContain('href="/brand/site.webmanifest"');
    expect(appHtml).toContain('href="/brand/apple-touch-icon.png"');
  });

  it("uses one exact Novi sparkle and removes the legacy application favicon", async () => {
    const noviStyles = await Bun.file("public/assets/marketing/phase2.css").text();
    const productPage = await Bun.file("public/product/index.html").text();

    expect(noviStyles).toContain('url("/brand/novi-sparkle.svg")');
    expect(productPage).toContain('src="/brand/novi-sparkle.svg"');
    expect(productPage).not.toContain(">✨</span>");
    expect(await Bun.file("client/public/favicon.svg").exists()).toBe(false);
  });
});