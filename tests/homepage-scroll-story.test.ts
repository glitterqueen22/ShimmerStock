import { describe, expect, it } from "bun:test";

describe("homepage scroll story contract", () => {
  it("keeps the homepage to eight truthful narrative chapters", async () => {
    const html = await Bun.file("public/index.html").text();

    expect(html.match(/<section\b/g)).toHaveLength(8);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("ONE ORDER / ONE CONNECTED JOURNEY");
    expect(html).toContain("Twenty-six records. Three owner decisions.");
    expect(html).toContain("Shopify connection: Early Access / Read-only Beta");
    expect(html).toContain("Internal barcodes support your operations. They are not retail UPCs or GTINs.");
    expect(html).not.toContain("novi-character.png");
    expect(html).not.toContain("Shopify Updated");
  });

  it("loads story styles and motion only from the homepage", async () => {
    const html = await Bun.file("public/index.html").text();
    const marketingEntry = await Bun.file("public/assets/marketing.css").text();
    const server = await Bun.file("server/index.js").text();

    expect(html).toContain('href="/assets/marketing/homepage-story.css"');
    expect(html).toContain('src="/assets/vendor/gsap/gsap.min.js"');
    expect(html).toContain('src="/assets/vendor/gsap/ScrollTrigger.min.js"');
    expect(html).toContain('src="/assets/homepage-story.js"');
    expect(marketingEntry).not.toContain("homepage-story.css");
    expect(server).toContain('/assets/vendor/gsap/gsap.min.js');
    expect(server).toContain('/assets/vendor/gsap/ScrollTrigger.min.js');
  });

  it("preserves native scrolling and complete reduced-motion content", async () => {
    const controller = await Bun.file("public/assets/homepage-story.js").text();
    const styles = await Bun.file("public/assets/marketing/homepage-story.css").text();

    expect(controller).toContain('gsap.matchMedia()');
    expect(controller).toContain('prefers-reduced-motion: reduce');
    expect(controller).toContain('motionContext.revert()');
    expect(controller).toContain('min-width: 1101px');
    expect(controller).not.toContain("ScrollSmoother");
    expect(controller).not.toContain("scrollerProxy");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).not.toContain("scroll-snap-type");
  });

  it("keeps Novi previews and industry tabs keyboard-readable", async () => {
    const html = await Bun.file("public/index.html").text();
    const controller = await Bun.file("public/assets/homepage-story.js").text();

    expect(html).toContain('aria-label="Novi approved artwork pending"');
    expect(html).toContain('<span class="story-demo-label">Demo</span>');
    expect(html.match(/class="decision-action" aria-pressed="false"/g)).toHaveLength(3);
    expect(html).toContain('id="industry-workspace" role="tabpanel"');
    expect(html.match(/aria-controls="industry-workspace"/g)).toHaveLength(8);
    expect(controller).toContain('event.key === "ArrowRight"');
    expect(controller).toContain('event.key === "ArrowLeft"');
    expect(controller).toContain('event.key === "Home"');
    expect(controller).toContain('event.key === "End"');
  });
});