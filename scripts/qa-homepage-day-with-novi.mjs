import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE_URL = process.env.HOMEPAGE_CAPTURE_BASE_URL || "http://127.0.0.1:4173/";
const OUT_DIR = path.resolve(process.cwd(), "qa-results", "day-with-novi-final");
const VIDEO_DIR = path.join(OUT_DIR, "video");

async function ensureDirs() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(VIDEO_DIR, { recursive: true });
}

async function addVitalsObservers(page) {
  await page.addInitScript(() => {
    window.__storyVitals = { cls: 0, lcp: 0, inp: 0 };

    const clsObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__storyVitals.cls += entry.value;
        }
      }
    });
    clsObserver.observe({ type: "layout-shift", buffered: true });

    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const last = entries[entries.length - 1];
      if (last) window.__storyVitals.lcp = Math.round(last.startTime);
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });

    if (PerformanceObserver.supportedEntryTypes.includes("event")) {
      const inpObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (entry.name === "click" || entry.name === "keydown" || entry.name === "pointerdown") {
            const latency = entry.processingStart - entry.startTime;
            if (latency > window.__storyVitals.inp) window.__storyVitals.inp = Math.round(latency);
          }
        }
      });
      inpObserver.observe({ type: "event", buffered: true, durationThreshold: 16 });
    }
  });
}

async function gotoHomepage(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1200);
}

async function screenshot(locator, fileName) {
  await locator.scrollIntoViewIfNeeded();
  await locator.page().waitForTimeout(350);
  const target = path.join(OUT_DIR, fileName);
  await locator.screenshot({ path: target });
  return target;
}

async function desktopEvidence(browser, files) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 940 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await addVitalsObservers(page);
  await gotoHomepage(page);

  files.push(await screenshot(page.locator("#scene-desk .desk-scene"), "novi-idle-scene-desktop.png"));
  await page.locator("[data-order-play]").click();
  await page.waitForTimeout(360);
  files.push(await screenshot(page.locator("#scene-desk .desk-scene"), "novi-alert-scene-desktop.png"));
  await page.waitForTimeout(1200);
  files.push(await screenshot(page.locator("#scene-order .order-story"), "novi-work-scene-order-journey-desktop.png"));

  await page.locator('[data-order-jump="3"]').click();
  await page.waitForTimeout(450);
  files.push(await screenshot(page.locator("#scene-order .order-story"), "exception-scene-desktop.png"));

  files.push(await screenshot(page.locator("#scene-chaos .novi-reduction"), "chaos-to-3-decisions-desktop.png"));

  await page.locator('#scene-label [data-label-action="review"]').click();
  await page.waitForTimeout(220);
  await page.locator('#scene-label [data-label-action="approve"]').click();
  await page.waitForTimeout(220);
  await page.locator('#scene-label [data-label-action="print"]').click();
  await page.waitForTimeout(350);
  await page.locator('#scene-label [data-scan-trigger]').click();
  await page.waitForTimeout(480);
  files.push(await screenshot(page.locator("#scene-label .label-workflow"), "label-scan-desktop.png"));

  files.push(await screenshot(page.locator("#people-behind-the-colors"), "people-behind-colors-desktop.png"));
  files.push(await screenshot(page.locator("#scene-grant"), "dream-grant-desktop.png"));
  files.push(await screenshot(page.locator("#scene-resolution"), "final-cozy-novi-desktop.png"));

  const fullPage = path.join(OUT_DIR, "desktop-fullpage.png");
  await page.screenshot({ path: fullPage, fullPage: true });
  files.push(fullPage);

  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      lcpMs: window.__storyVitals?.lcp ?? 0,
      cls: Number((window.__storyVitals?.cls ?? 0).toFixed(4)),
      inpMs: window.__storyVitals?.inp ?? 0,
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : 0,
      loadEventMs: nav ? Math.round(nav.loadEventEnd) : 0
    };
  });

  const ctaAudit = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a[href],button[data-order-play],button[data-order-pause],button[data-order-replay],button[data-order-jump],button[data-label-action],button[data-scan-trigger],button[data-mission-preview]"));
    const anchors = Array.from(document.querySelectorAll("a[href]")).map((a) => ({ text: a.textContent?.trim() || "", href: a.getAttribute("href") || "" }));
    const deadAnchors = anchors.filter((a) => !a.href || a.href === "#" || a.href.startsWith("javascript:"));
    return { interactiveCount: links.length, deadAnchors };
  });

  const axe = await new AxeBuilder({ page }).analyze();
  await context.close();
  return { perf, ctaAudit, axe };
}

async function mobileEvidence(browser, files) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await gotoHomepage(page);

  files.push(await screenshot(page.locator("#scene-desk .desk-scene"), "mobile-idle-scene.png"));
  await page.locator("[data-order-play]").click();
  await page.waitForTimeout(360);
  files.push(await screenshot(page.locator("#scene-desk .desk-scene"), "mobile-alert-scene.png"));

  const fullPage = path.join(OUT_DIR, "mobile-fullpage.png");
  await page.screenshot({ path: fullPage, fullPage: true });
  files.push(fullPage);
  await context.close();
}

async function reducedMotionEvidence(browser, files) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 940 },
    ignoreHTTPSErrors: true,
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  await gotoHomepage(page);
  await page.locator("[data-order-play]").click();
  await page.waitForTimeout(220);
  files.push(await screenshot(page.locator("#scene-desk .desk-scene"), "reduced-motion-desk-equivalent.png"));
  const fullPage = path.join(OUT_DIR, "reduced-motion-fullpage.png");
  await page.screenshot({ path: fullPage, fullPage: true });
  files.push(fullPage);
  await context.close();
}

async function recordShortFilm(browser, files) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 940 },
    ignoreHTTPSErrors: true,
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1440, height: 940 }
    }
  });
  const page = await context.newPage();
  await gotoHomepage(page);

  await page.locator("#scene-desk .desk-scene").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.locator("[data-order-play]").click();
  await page.waitForTimeout(1600);
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(600);
  await page.locator('[data-order-jump="3"]').click();
  await page.waitForTimeout(600);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(700);

  const video = page.video();
  await page.close();
  await context.close();
  if (!video) throw new Error("Expected Playwright video file.");
  files.push(await video.path());
}

async function main() {
  await ensureDirs();
  const browser = await chromium.launch({ headless: true });
  const files = [];

  try {
    const desktop = await desktopEvidence(browser, files);
    await mobileEvidence(browser, files);
    await reducedMotionEvidence(browser, files);
    await recordShortFilm(browser, files);

    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      files,
      performance: desktop.perf,
      ctaAudit: desktop.ctaAudit,
      accessibility: {
        violations: desktop.axe.violations.length,
        incomplete: desktop.axe.incomplete.length,
        passes: desktop.axe.passes.length,
        firstViolation: desktop.axe.violations[0]
          ? {
              id: desktop.axe.violations[0].id,
              impact: desktop.axe.violations[0].impact,
              description: desktop.axe.violations[0].description,
              nodes: desktop.axe.violations[0].nodes.length
            }
          : null
      }
    };

    const reportPath = path.join(OUT_DIR, "day-with-novi-report.json");
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log("Final cinematic QA capture complete");
    console.log(`Report: ${reportPath}`);
    files.forEach((file) => console.log(`- ${file}`));
    console.log(`Performance: LCP ${report.performance.lcpMs}ms, CLS ${report.performance.cls}, INP ${report.performance.inpMs}ms`);
    console.log(`Accessibility: ${report.accessibility.violations} violations, ${report.accessibility.incomplete} incomplete`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
