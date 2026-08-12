import { describe, expect, it } from "bun:test";

describe("public site cohesion", () => {
  it("keeps the shared footer and early-access form aligned to the broader product taxonomy", async () => {
    const footerSource = await Bun.file("public/assets/marketing.js").text();
    expect(footerSource).toContain('/solutions/boutiques');
    expect(footerSource).toContain('Boutique &amp; Retail');

    const earlyAccess = await Bun.file("public/early-access/index.html").text();
    expect(earlyAccess).not.toContain("freshie_business");
    expect(earlyAccess).not.toContain("ecommerce_brand");
    expect(earlyAccess).not.toContain("Candles / Bath &amp; Body / Home Fragrance");
    expect(earlyAccess).toContain('option value="home_fragrance">Home &amp; Fragrance</option>');
    expect(earlyAccess).toContain('option value="boutique_retail">Boutique / Retail</option>');
  });
});
