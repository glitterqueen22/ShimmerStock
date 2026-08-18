import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const brandDir = path.resolve("public/brand");
const renders = [
  ["favicon.svg", "favicon-32x32.png", 32, 32],
  ["shimmerstock-app-icon.svg", "apple-touch-icon.png", 180, 180],
  ["shimmerstock-app-icon.svg", "shimmerstock-app-icon-192.png", 192, 192],
  ["shimmerstock-app-icon.svg", "shimmerstock-app-icon-512.png", 512, 512],
  ["shimmerstock-social-1200x630.svg", "shimmerstock-social-1200x630.png", 1200, 630],
];

const browser = await chromium.launch({ headless: true });

try {
  for (const [sourceName, outputName, width, height] of renders) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(pathToFileURL(path.join(brandDir, sourceName)).href, { waitUntil: "load" });
    await page.screenshot({
      path: path.join(brandDir, outputName),
      omitBackground: true,
    });
    await page.close();
    console.log(`${outputName}: ${width}x${height}`);
  }
} finally {
  await browser.close();
}