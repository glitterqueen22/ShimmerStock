import { describe, expect, it } from "bun:test";

describe("homepage scroll story contract", () => {
  it("keeps the homepage to ten truthful narrative chapters", async () => {
    const html = await Bun.file("public/index.html").text();

    expect(html.match(/<section\b/g)).toHaveLength(10);
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

  it("gives the Order Journey independent Play, Pause, Replay, and manual stage controls", async () => {
    const html = await Bun.file("public/index.html").text();
    const controller = await Bun.file("public/assets/homepage-story.js").text();

    expect(html).toContain('data-order-play');
    expect(html).toContain('data-order-pause');
    expect(html).toContain('data-order-replay');
    expect(html.match(/data-order-jump="[0-5]"/g)).toHaveLength(6);
    expect(html).toContain('data-order-reaction-text');
    expect(controller).toContain('function initOrderJourneyPlayer()');
    expect(controller).toContain('initOrderJourneyPlayer();');
    expect(controller).not.toContain('ScrollTrigger.create({\n          trigger: orderStory');
    expect(controller).toContain('setInterval(function ()');
    expect(controller).toContain('aria-current');
  });

  it("gives Novi a cinematic desk scene that connects to the same Order #8197", async () => {
    const html = await Bun.file("public/index.html").text();
    const controller = await Bun.file("public/assets/homepage-story.js").text();

    expect(html).toContain('id="novi-desk"');
    expect(html).toContain('alt="Novi, ShimmerStock\'s tuxedo-cat mascot — approved character artwork pending"');
    expect(html).toContain('/assets/novi/novi-idle-desk.svg');
    expect(html).toContain('data-novi-portrait');
    expect(html).toContain('class="novi-desk-portrait"');
    expect(html).toContain('Order #8197 — Vanilla Cupcake Kit x 2');
    expect(html).toContain('data-desk-notification');
    expect(controller).toContain('function initNoviDeskScene()');
    expect(controller).toContain('function markDeskActive()');
    expect(controller).toContain('IntersectionObserver');
  });

  it("wires a real 7-state Novi asset manifest with honest pending labeling and no code changes needed to activate final art", async () => {
    const controller = await Bun.file("public/assets/homepage-story.js").text();
    const html = await Bun.file("public/index.html").text();

    const states = [
      "novi-idle-desk", "novi-alert", "novi-focused", "novi-thinking",
      "novi-serious", "novi-success", "novi-cozy-end"
    ];
    for (const state of states) {
      const file = Bun.file(`public/assets/novi/${state}.svg`);
      expect(await file.exists()).toBe(true);
      const source = await file.text();
      expect(source).toContain("ARTWORK PENDING / TEMPORARY REFERENCE");
      expect(source).not.toMatch(/in\s+(loving\s+)?memory\s+of/i);
    }

    expect(controller).toContain("const NOVI_ASSET_MANIFEST");
    expect(controller).toContain('idle: "/assets/novi/novi-idle-desk.svg"');
    expect(controller).toContain('cozy: "/assets/novi/novi-cozy-end.svg"');
    expect(controller).toContain("function swapNoviPortrait(moodKey)");
    expect(html).toContain('/assets/novi/novi-cozy-end.svg');
    expect(html).not.toContain("novi-art-pending.svg");
  });

  it("ties Novi's visual mood to the active Order Journey stage", async () => {
    const controller = await Bun.file("public/assets/homepage-story.js").text();
    const styles = await Bun.file("public/assets/marketing/homepage-story.css").text();

    expect(controller).toContain('const orderMoods = ["alert", "confident", "thinking", "serious", "success", "pleased"]');
    expect(controller).toContain('reactionEl.dataset.noviMood');
    expect(controller).toContain('swapNoviPortrait(orderMoods[activeIndex]');
    expect(styles).toContain('[data-novi-mood="serious"]');
    expect(styles).toContain('[data-novi-mood="success"]');
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

  it("upgrades the SKU/label scene with a real sequence and a manual scan trigger", async () => {
    const html = await Bun.file("public/index.html").text();
    const controller = await Bun.file("public/assets/homepage-story.js").text();

    expect(html).toContain('data-label-sequence');
    expect(html.match(/data-label-stage="[0-4]"/g)).toHaveLength(5);
    expect(html).toContain('data-scan-trigger');
    expect(controller).toContain('function initSkuSequence()');
  });

  it("adds a truthful Dream Grant scene and a story-resolution coda without duplicating People Behind the Colors", async () => {
    const html = await Bun.file("public/index.html").text();
    const dreamGrantSection = html.slice(html.indexOf('id="dream-grant-title"'), html.indexOf('id="final-title"'));

    expect(dreamGrantSection).toContain('Applications are not yet open.');
    expect(dreamGrantSection).not.toMatch(/\$\d/);
    expect(dreamGrantSection).not.toMatch(/\b(20\d{2}|january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
    expect(html).toContain('href="/about#people-behind-the-colors"');
    expect(html).not.toContain('id="people-behind-the-colors"');
    expect(html).toContain('data-desk-resolution');
    expect(html).toContain("You're caught up.");
  });
});