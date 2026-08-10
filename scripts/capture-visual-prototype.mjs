import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.HOMEPAGE_CAPTURE_BASE_URL || "http://127.0.0.1:4173";
const OUT_DIR = path.resolve("qa-results/visual-prototype");

async function ensureOutputDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

async function captureScreenshot(browser, name, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1600);

  const output = path.join(OUT_DIR, name);
  await page.screenshot({ path: output, fullPage: false });

  await context.close();
  return output;
}

async function captureWalkthroughVideo(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: OUT_DIR,
      size: { width: 1440, height: 900 }
    }
  });

  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);

  const playPause = page.locator("[data-hero-toggle]");
  if (await playPause.count()) {
    await playPause.click();
    await page.waitForTimeout(700);
    await playPause.click();
  }

  await page.locator("#order-journey").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1800);

  await page.locator("[data-order-play]").click();
  await page.waitForTimeout(3200);
  await page.locator("[data-order-pause]").click();

  const peopleSection = page.locator("#people-behind-the-colors");
  await peopleSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000);

  const dreamGrant = page.locator("#dream-grant-mention");
  await dreamGrant.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2600);

  // Slow final pan in final CTA for context.
  await page.mouse.wheel(0, 350);
  await page.waitForTimeout(2000);

  const videoPath = await page.video().path();
  await context.close();

  const normalizedPath = path.join(OUT_DIR, "homepage-walkthrough.webm");
  await fs.rename(videoPath, normalizedPath);
  return normalizedPath;
}

async function run() {
  await ensureOutputDir();
  const browser = await chromium.launch({ headless: true });

  try {
    const desktopShot = await captureScreenshot(browser, "homepage-desktop-hero.png", { width: 1440, height: 900 });
    const mobileShot = await captureScreenshot(browser, "homepage-mobile-hero.png", { width: 390, height: 844 });
    const video = await captureWalkthroughVideo(browser);

    const manifest = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      files: {
        desktop: path.relative(process.cwd(), desktopShot),
        mobile: path.relative(process.cwd(), mobileShot),
        walkthrough: path.relative(process.cwd(), video)
      }
    };

    await fs.writeFile(
      path.join(OUT_DIR, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8"
    );

    console.log("Capture complete:");
    console.log(`- ${manifest.files.desktop}`);
    console.log(`- ${manifest.files.mobile}`);
    console.log(`- ${manifest.files.walkthrough}`);
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
