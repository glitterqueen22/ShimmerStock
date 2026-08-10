import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";

const BASE_URL = process.env.HOMEPAGE_CAPTURE_BASE_URL || "http://127.0.0.1:4173/";
const OUTPUT_DIR = path.resolve(process.cwd(), "qa-results", "visual-owner-review");
const VIDEO_DIR = path.join(OUTPUT_DIR, "video");

const SCENES = [
  { name: "hero", selector: ".story-opening" },
  { name: "novi-desk-scene", selector: ".story-desk" },
  { name: "order-journey", selector: "#order-journey" },
  { name: "chaos-to-3-decisions", selector: "#novi-section" },
  { name: "label-scan-scene", selector: ".story-labels" },
  { name: "people-behind-colors", selector: "#people-behind-the-colors" },
  { name: "dream-grant", selector: ".story-dream-grant" },
  { name: "final-cozy-scene", selector: ".story-final" }
];

async function ensureDirs() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(VIDEO_DIR, { recursive: true });
}

async function openReadyPage(context, viewport) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(900);
  return page;
}

async function captureSceneScreens(page) {
  const captures = [];
  for (const scene of SCENES) {
    const locator = page.locator(scene.selector).first();
    await locator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(350);
    const filePath = path.join(OUTPUT_DIR, `${scene.name}.png`);
    await locator.screenshot({ path: filePath });
    captures.push(filePath);
  }
  return captures;
}

async function captureGoTimeScene(page) {
  const deskScene = page.locator(".desk-scene").first();
  await deskScene.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const playButton = page.locator("[data-order-play]").first();
  if (await playButton.isVisible()) {
    await playButton.click();
    await page.waitForTimeout(850);
  }
  const outputPath = path.join(OUTPUT_DIR, "go-time-scene.png");
  await deskScene.screenshot({ path: outputPath });
  return outputPath;
}

async function captureFullPageStates(browser) {
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true
  });
  const desktopPage = await openReadyPage(desktopContext, { width: 1440, height: 900 });
  const desktopFull = path.join(OUTPUT_DIR, "homepage-desktop-full.png");
  await desktopPage.screenshot({ path: desktopFull, fullPage: true });
  await desktopContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true
  });
  const mobilePage = await openReadyPage(mobileContext, { width: 390, height: 844 });
  const mobileFull = path.join(OUTPUT_DIR, "homepage-mobile.png");
  await mobilePage.screenshot({ path: mobileFull, fullPage: true });
  await mobileContext.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    reducedMotion: "reduce"
  });
  const reducedPage = await openReadyPage(reducedContext, { width: 1440, height: 900 });
  const reducedFull = path.join(OUTPUT_DIR, "homepage-reduced-motion.png");
  await reducedPage.screenshot({ path: reducedFull, fullPage: true });
  await reducedContext.close();

  return [desktopFull, mobileFull, reducedFull];
}

async function captureMotionVideo(browser) {
  const videoContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1440, height: 900 }
    }
  });
  const page = await openReadyPage(videoContext, { width: 1440, height: 900 });
  await page.locator(".story-opening").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(400);
  const playButton = page.locator("[data-order-play]").first();
  if (await playButton.isVisible()) {
    await playButton.click();
    await page.waitForTimeout(900);
  }
  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(600);
  const pageVideo = page.video();
  await page.close();
  await videoContext.close();
  if (!pageVideo) {
    throw new Error("Video recording was not created by Playwright.");
  }
  return pageVideo.path();
}

async function writeReport(files) {
  const reportPath = path.join(OUTPUT_DIR, "owner-review-report.json");
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    outputDir: OUTPUT_DIR,
    files
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  await ensureDirs();
  const browser = await chromium.launch({ headless: true });
  const collected = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      ignoreHTTPSErrors: true
    });
    const page = await openReadyPage(context, { width: 1440, height: 900 });
    collected.push(...(await captureSceneScreens(page)));
    collected.push(await captureGoTimeScene(page));
    await context.close();

    collected.push(...(await captureFullPageStates(browser)));
    collected.push(await captureMotionVideo(browser));
  } finally {
    await browser.close();
  }

  const reportPath = await writeReport(collected);
  console.log("Owner review capture complete");
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log(`Report: ${reportPath}`);
  for (const filePath of collected) {
    console.log(`- ${filePath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});