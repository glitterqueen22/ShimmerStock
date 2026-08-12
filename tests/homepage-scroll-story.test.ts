import { describe, expect, it } from "bun:test";
import { stat } from "node:fs/promises";

describe("homepage scroll story contract", () => {
  it("keeps the homepage to eight truthful narrative chapters", async () => {
    const html = await Bun.file("public/index.html").text();

    expect(html.match(/<section\b/g)).toHaveLength(8);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("Your business has a lot going on. <em>Novi's already on it.</em>");
    expect(html).toContain("Watch ShimmerStock. Try how ShimmerStock thinks.");
    expect(html).toContain("Your business doesn't need another dashboard. It needs priorities.");
    expect(html).toContain("YOUR STORE. YOUR DATA. YOUR APPROVAL.");
    expect(html).toContain('id="order-journey"');
    expect(html).toContain('id="people-behind-the-colors"');
    expect(html).toContain('id="dream-grant-title"');
    expect(html).not.toContain('id="scene-desk"');
    expect(html).not.toContain('id="scene-label"');
    expect(html).not.toContain('id="scene-brief"');
    expect(html).not.toContain('id="missions-title"');
    expect(html).not.toContain('id="savings-title"');
    expect(html).not.toContain("novi-character.png");
    expect(html).not.toContain("Shopify Updated");
    expect(html).not.toContain("—");
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

  it("keeps scene rail debug-only while preserving scene-state tracking", async () => {
    const html = await Bun.file("public/index.html").text();
    const controller = await Bun.file("public/assets/homepage-story.js").text();

    expect(html).toContain('class="story-film-nav"');
    expect(html).toContain('data-debug-scene-nav');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('hidden>');
    expect(html).toContain('A DAY WITH NOVI');
    expect(html).toContain('data-scene-jump="#order-journey"');
    expect(html).toContain('data-scene-readout');
    expect(controller).toContain('function initSceneFilmNav()');
    expect(controller).toContain('params.get("sceneNav") === "1"');
    expect(controller).toContain('story.setAttribute("data-active-scene", scene.id);');
    expect(controller).toContain('initSceneFilmNav();');
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

  it("keeps the cinematic hero connected to the interactive Order #8197 journey", async () => {
    const html = await Bun.file("public/index.html").text();
    const controller = await Bun.file("public/assets/homepage-story.js").text();

    expect(html).toContain('data-novi-hero-video');
    expect(html).not.toContain('data-story-order-token');
    expect(html).toContain('id="order-journey"');
    expect(html).toContain('data-order-play');
    expect(html).toContain('data-order-stage-state');
    expect(html).toContain('data-order-reaction-text');
    expect(html).toContain('data-decision-linked="0"');
    expect(controller).toContain('function initOrderJourneyPlayer()');
    expect(controller).toContain('initOrderJourneyPlayer();');
    expect(controller).toContain('swapNoviPortrait(orderStates[activeIndex] || orderStates[0]);');
  });

  it("keeps the compact industry language and decision previews keyboard-readable", async () => {
    const html = await Bun.file("public/index.html").text();
    const controller = await Bun.file("public/assets/homepage-story.js").text();

    expect(html).toContain('alt="Novi reviewing the morning brief"');
    expect(html).toContain('<span class="story-demo-label">Demo</span>');
    expect(html.match(/class="decision-action cta-novi" aria-pressed="false"/g)).toHaveLength(3);
    expect(html).toContain('id="industry-workspace" role="tabpanel"');
    expect(html.match(/aria-controls="industry-workspace"/g)).toHaveLength(6);
    expect(html).not.toContain('Freshies');
    expect(html).toContain('data-industry="makers"');
    expect(html).toContain('data-industry="home"');
    expect(html).toContain('data-industry="apparel"');
    expect(html).toContain('data-industry="beauty"');
    expect(html).toContain('data-industry="food"');
    expect(html).toContain('data-industry="boutique"');
    expect(controller).toContain('event.key === "ArrowRight"');
    expect(controller).toContain('event.key === "ArrowLeft"');
    expect(controller).toContain('event.key === "Home"');
    expect(controller).toContain('event.key === "End"');
  });

  it("uses the seven approved WebP states without placeholder artwork", async () => {
    const controller = await Bun.file("public/assets/homepage-story.js").text();
    const html = await Bun.file("public/index.html").text();

    const states = [
      "novi-idle-desk", "novi-alert", "novi-focused", "novi-thinking",
      "novi-serious", "novi-success", "novi-cozy-end"
    ];
    for (const state of states) {
      const path = `public/assets/novi/${state}.webp`;
      const file = Bun.file(path);
      expect(await file.exists()).toBe(true);
      expect((await stat(path)).size).toBeGreaterThan(100_000);
    }

    expect(controller).toContain("const NOVI_ASSET_MANIFEST");
    expect(controller).toContain('idle: "/assets/novi/novi-idle-desk.webp"');
    expect(controller).toContain('"cozy-end": "/assets/novi/novi-cozy-end.webp"');
    expect(controller).toContain("function swapNoviPortrait(stateKey)");
    expect(controller).toContain("const probe = new Image()");
    expect(controller).toContain("probe.onload = function ()");
    expect(controller).toContain('swapNoviPortrait("idle")');
    expect(html).toContain('<img src="/assets/novi/novi-alert.webp"');
    expect(html).toContain('<img src="/assets/novi/novi-cozy-end.webp"');
    expect(html).not.toContain("approved art pending");
    expect(html).not.toMatch(/class="order-novi-mark"[^>]*>N</);
    expect(controller).not.toContain(".svg");
  });

  it("ties Novi's visual mood to the active Order Journey stage", async () => {
    const controller = await Bun.file("public/assets/homepage-story.js").text();
    const styles = await Bun.file("public/assets/marketing/homepage-story.css").text();

    expect(controller).toContain('const orderStates = ["alert", "focused", "thinking", "serious", "success", "cozy-end"]');
    expect(controller).toContain('reactionEl.dataset.noviState');
    expect(controller).toContain('swapNoviPortrait(orderStates[activeIndex]');
    expect(styles).not.toContain('[data-novi-mood=');
  });

  it("visually distinguishes the three owner decisions from the resolved noise", async () => {
    const html = await Bun.file("public/index.html").text();
    const controller = await Bun.file("public/assets/homepage-story.js").text();

    expect(html.match(/data-decision-linked="0"/g)?.length).toBeGreaterThan(0);
    expect(html.match(/data-decision-linked="1"/g)?.length).toBeGreaterThan(0);
    expect(html.match(/data-decision-linked="2"/g)?.length).toBeGreaterThan(0);
    expect(controller).toContain('resolvedRecords');
    expect(controller).toContain('linkedRecords');
  });

  it("introduces the people-behind-the-colors section and an authoritative Dream Grant state", async () => {
    const html = await Bun.file("public/index.html").text();
    const controller = await Bun.file("public/assets/homepage-story.js").text();

    expect(html).toContain('id="people-behind-the-colors"');
    expect(html).toContain('Pink is Monica\'s spark. Purple is her dad\'s steady support. Green is her mom\'s momentum and growth. Navy and grey are her husband\'s grounding trust and partnership.');
    expect(html.match(/class="people-card /g)).toHaveLength(4);
    expect(html).toContain('Coming Soon');
    expect(html).toContain('href="/about#people-behind-the-colors"');
    expect(html).toContain('cta-utility');
    expect(controller).toContain('initDecisionPreviews();');
  });

  it("ends with a concise cozy coda and one primary CTA", async () => {
    const html = await Bun.file("public/index.html").text();

    expect(html).toContain('Support received. Support passed forward.');
    expect(html).toContain('id="final-title"');
    expect(html).toContain('data-desk-resolution');
    expect(html).toContain("You\'re caught up.");
    expect(html.match(/cta-primary/g)).toHaveLength(2);
    expect(html).not.toContain('story-provenance">No fake urgency');
  });
});