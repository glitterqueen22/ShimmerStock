import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE_URL = process.env.HOMEPAGE_CAPTURE_BASE_URL || "http://127.0.0.1:3000/";
const OUT_DIR = path.resolve(process.cwd(), "artifacts", "homepage-final-art-direction");

async function ensureDirs() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

async function addVitalsObservers(page) {
  await page.addInitScript(() => {
    window.__storyVitals = { cls: 0, lcp: 0, inp: 0 };

    const clsObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!entry.hadRecentInput) window.__storyVitals.cls += entry.value;
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
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1400);
}

async function takeShot(page, locator, fileName) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  const filePath = path.join(OUT_DIR, fileName);
  await locator.screenshot({ path: filePath });
  return filePath;
}

async function copyVideo(videoPath, targetName) {
  const target = path.join(OUT_DIR, targetName);
  await fs.copyFile(videoPath, target);
  return target;
}

async function captureDesktopAndMetrics(browser, files) {
  const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await addVitalsObservers(page);
  await gotoHomepage(page);

  files.push(await takeShot(page, page.locator("#people-behind-the-colors"), "people-behind-colors.png"));
  files.push(await takeShot(page, page.locator("#scene-grant"), "dream-grant.png"));
  files.push(await takeShot(page, page.locator("#scene-resolution"), "final-novi-cta.png"));

  await page.locator('[data-scene-jump="#scene-enter"]').click();
  await page.waitForTimeout(280);
  files.push(path.join(OUT_DIR, "desktop-full.png"));
  await page.screenshot({ path: path.join(OUT_DIR, "desktop-full.png"), fullPage: true });

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

  const axe = await new AxeBuilder({ page }).analyze();
  await context.close();
  return { perf, axe };
}

async function captureMobile(browser, files) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await gotoHomepage(page);

  const mobileFull = path.join(OUT_DIR, "mobile-full.png");
  await page.screenshot({ path: mobileFull, fullPage: true });
  files.push(mobileFull);
  await context.close();
}

async function captureReducedMotion(browser, files) {
  const context = await browser.newContext({
    viewport: { width: 1512, height: 982 },
    ignoreHTTPSErrors: true,
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  await gotoHomepage(page);

  const reduced = path.join(OUT_DIR, "reduced-motion-proof.png");
  await page.screenshot({ path: reduced, fullPage: true });
  files.push(reduced);
  await context.close();
}

async function captureFullHomepageRecording(browser, files) {
  const context = await browser.newContext({
    viewport: { width: 1512, height: 982 },
    ignoreHTTPSErrors: true,
    recordVideo: { dir: OUT_DIR, size: { width: 1512, height: 982 } }
  });
  const page = await context.newPage();
  await gotoHomepage(page);

  await page.waitForTimeout(3200);
  await page.locator('[data-scene-jump="#order-journey"]').click();
  await page.waitForTimeout(400);
  await page.locator("[data-order-play]").click();
  await page.waitForTimeout(1900);
  await page.mouse.wheel(0, 950);
  await page.waitForTimeout(700);
  await page.locator('[data-order-jump="3"]').click();
  await page.waitForTimeout(700);
  await page.mouse.wheel(0, 1100);
  await page.waitForTimeout(850);
  await page.mouse.wheel(0, 1250);
  await page.waitForTimeout(850);
  await page.mouse.wheel(0, 1250);
  await page.waitForTimeout(900);

  const video = page.video();
  await page.close();
  await context.close();
  if (!video) throw new Error("Expected full homepage video output.");
  files.push(await copyVideo(await video.path(), "homepage-full-experience.webm"));
}

async function captureTransitionRecording(browser, files) {
  const context = await browser.newContext({
    viewport: { width: 1512, height: 982 },
    ignoreHTTPSErrors: true,
    recordVideo: { dir: OUT_DIR, size: { width: 1512, height: 982 } }
  });
  const page = await context.newPage();
  await gotoHomepage(page);

  await page.waitForTimeout(2500);
  await page.locator('[data-scene-jump="#order-journey"]').click();
  await page.waitForTimeout(400);
  await page.locator("[data-order-play]").click();
  await page.waitForTimeout(2300);

  const video = page.video();
  await page.close();
  await context.close();
  if (!video) throw new Error("Expected film-to-order transition video output.");
  files.push(await copyVideo(await video.path(), "film-to-order-transition.webm"));
}

async function captureChaosRecording(browser, files) {
  const context = await browser.newContext({
    viewport: { width: 1512, height: 982 },
    ignoreHTTPSErrors: true,
    recordVideo: { dir: OUT_DIR, size: { width: 1512, height: 982 } }
  });
  const page = await context.newPage();
  await gotoHomepage(page);

  await page.locator('[data-scene-jump="#scene-chaos"]').click();
  await page.waitForTimeout(900);
  await page.mouse.wheel(0, 420);
  await page.waitForTimeout(1800);
  const actions = page.locator('.decision-action');
  await actions.nth(0).click();
  await page.waitForTimeout(600);
  await actions.nth(1).click();
  await page.waitForTimeout(600);
  await actions.nth(2).click();
  await page.waitForTimeout(900);

  const video = page.video();
  await page.close();
  await context.close();
  if (!video) throw new Error("Expected chaos-to-3-decisions video output.");
  files.push(await copyVideo(await video.path(), "chaos-to-three-decisions.webm"));
}

async function main() {
  await ensureDirs();
  const browser = await chromium.launch({ headless: true });
  const files = [];

  try {
    const desktop = await captureDesktopAndMetrics(browser, files);
    await captureMobile(browser, files);
    await captureFullHomepageRecording(browser, files);
    await captureTransitionRecording(browser, files);
    await captureChaosRecording(browser, files);
    await captureReducedMotion(browser, files);

    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      files,
      performance: desktop.perf,
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

    const reportPath = path.join(OUT_DIR, "homepage-final-report.json");
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log("Homepage final art-direction capture complete");
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
