import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";

const BASE_URL = process.env.HOMEPAGE_CAPTURE_BASE_URL || "http://127.0.0.1:4173/";
const OUTPUT_DIR = path.resolve(process.cwd(), "qa-results", "novi-desk-acceptance");
const VIDEO_DIR = path.join(OUTPUT_DIR, "video");

async function ensureDirs() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(VIDEO_DIR, { recursive: true });
}

async function gotoDesk(page) {
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  const desk = page.locator("#novi-desk .desk-scene").first();
  await desk.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  return desk;
}

async function captureDesktop(browser, files) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const desk = await gotoDesk(page);

  const idlePath = path.join(OUTPUT_DIR, "desktop-idle-desk.png");
  await desk.screenshot({ path: idlePath });
  files.push(idlePath);

  await page.locator("[data-order-play]").click();
  await page.waitForTimeout(300);
  const alertPath = path.join(OUTPUT_DIR, "desktop-new-order-alert.png");
  await desk.screenshot({ path: alertPath });
  files.push(alertPath);

  await page.waitForTimeout(1200);
  const focusedPath = path.join(OUTPUT_DIR, "desktop-focused-go-time.png");
  await desk.screenshot({ path: focusedPath });
  files.push(focusedPath);

  const order = page.locator("#order-journey .order-story").first();
  await order.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const transitionPath = path.join(OUTPUT_DIR, "desktop-transition-into-order-journey.png");
  await order.screenshot({ path: transitionPath });
  files.push(transitionPath);

  await context.close();
}

async function captureMobile(browser, files) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const desk = await gotoDesk(page);

  const idlePath = path.join(OUTPUT_DIR, "mobile-idle.png");
  await desk.screenshot({ path: idlePath });
  files.push(idlePath);

  await page.locator("[data-order-play]").click();
  await page.waitForTimeout(420);
  const alertPath = path.join(OUTPUT_DIR, "mobile-alert.png");
  await desk.screenshot({ path: alertPath });
  files.push(alertPath);

  await context.close();
}

async function captureReducedMotion(browser, files) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  const desk = await gotoDesk(page);
  await page.locator("[data-order-play]").click();
  await page.waitForTimeout(200);

  const reducedPath = path.join(OUTPUT_DIR, "reduced-motion-equivalent-static-state.png");
  await desk.screenshot({ path: reducedPath });
  files.push(reducedPath);

  await context.close();
}

async function captureVideo(browser, files) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1440, height: 900 }
    }
  });
  const page = await context.newPage();

  await gotoDesk(page);
  await page.waitForTimeout(300);
  await page.locator("[data-order-play]").click();
  await page.waitForTimeout(1600);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(700);

  const video = page.video();
  await page.close();
  await context.close();
  if (!video) throw new Error("No video captured.");

  const videoPath = await video.path();
  files.push(videoPath);
}

async function writeReport(files) {
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    files
  };
  const reportPath = path.join(OUTPUT_DIR, "novi-desk-acceptance-report.json");
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

async function main() {
  await ensureDirs();
  const browser = await chromium.launch({ headless: true });
  const files = [];

  try {
    await captureDesktop(browser, files);
    await captureMobile(browser, files);
    await captureReducedMotion(browser, files);
    await captureVideo(browser, files);
  } finally {
    await browser.close();
  }

  const reportPath = await writeReport(files);
  console.log("Novi desk acceptance capture complete");
  console.log(`Report: ${reportPath}`);
  files.forEach((file) => console.log(`- ${file}`));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
