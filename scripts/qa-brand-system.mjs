import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.BRAND_QA_BASE_URL || "http://127.0.0.1:3210";
const outputDir = path.resolve("artifacts/brand-system");

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

async function captureRoute(name, route, viewport, options = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  const networkErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    const expectedSessionProbe = route === "/login" && response.status() === 401 && response.url().endsWith("/api/auth/me");
    if (response.status() >= 400 && !expectedSessionProbe) networkErrors.push(`${response.status()} ${response.url()}`);
  });

  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(500);

  if (options.openMobileNav) {
    await page.locator("#mobile-toggle").click();
    await page.waitForTimeout(150);
  }

  const metrics = await page.evaluate(() => {
    const logo = document.querySelector(".site-header .brand-logo img");
    const brand = document.querySelector(".site-header .brand");
    const nav = document.querySelector(".nav-desktop");
    const headerRight = document.querySelector(".header-right");
    const overlaps = (left, right) => {
      if (!left || !right) return false;
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
    };

    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      logo: logo ? {
        width: Math.round(logo.getBoundingClientRect().width),
        height: Math.round(logo.getBoundingClientRect().height),
        naturalWidth: logo.naturalWidth,
        naturalHeight: logo.naturalHeight,
      } : null,
      brandNavCollision: overlaps(brand, nav),
      brandActionsCollision: overlaps(brand, headerRight),
    };
  });

  const accessibility = await new AxeBuilder({ page }).analyze();
  const screenshot = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: screenshot, fullPage: options.fullPage ?? false });
  const reportedConsoleErrors = route === "/login"
    ? consoleErrors.filter((message) => !message.includes("401 (Unauthorized)"))
    : consoleErrors;
  results.push({
    name,
    route,
    viewport,
    screenshot: path.relative(process.cwd(), screenshot),
    consoleErrors: reportedConsoleErrors,
    networkErrors,
    metrics,
    accessibilityViolations: accessibility.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      nodes: nodes.map((node) => ({ target: node.target, html: node.html })),
    })),
  });
  await context.close();
}

async function captureAsset(name, assetPath, size, background = "transparent") {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.goto(`${baseUrl}${assetPath}`, { waitUntil: "load" });
  const screenshot = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: screenshot, omitBackground: background === "transparent" });
  results.push({
    name,
    assetPath,
    viewport: { width: size, height: size },
    screenshot: path.relative(process.cwd(), screenshot),
  });
  await page.close();
}

async function captureDarkHeader() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 180 } });
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #0f172a; font-family: Arial, sans-serif; }
      header { height: 88px; padding: 18px 56px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,.16); }
      img { display: block; width: 235px; height: 50px; object-fit: contain; }
      nav { display: flex; gap: 30px; color: #fff7f2; font-weight: 700; }
    </style>
    <header aria-label="Dark header logo QA">
      <img src="${baseUrl}/brand/shimmerstock-logo-horizontal-dark.svg" alt="ShimmerStock">
      <nav aria-label="Example navigation"><span>Product</span><span>Solutions</span><span>Pricing</span><span>Login</span></nav>
    </header>
  `);
  await page.waitForLoadState("networkidle");
  const screenshot = path.join(outputDir, "header-dark.png");
  await page.screenshot({ path: screenshot });
  results.push({ name: "header-dark", screenshot: path.relative(process.cwd(), screenshot) });
  await page.close();
}

try {
  await captureRoute("homepage-desktop", "/", { width: 1440, height: 900 });
  await captureRoute("homepage-mobile", "/", { width: 390, height: 844 });
  await captureRoute("mobile-navigation", "/", { width: 390, height: 844 }, { openMobileNav: true });
  await captureRoute("light-page-header", "/pricing", { width: 1440, height: 900 });
  await captureRoute("login", "/login", { width: 1440, height: 900 });
  await captureRoute("early-access", "/early-access", { width: 1440, height: 900 });
  await captureDarkHeader();
  await captureAsset("favicon-16", "/brand/favicon.svg", 16);
  await captureAsset("favicon-32", "/brand/favicon.svg", 32);
  await captureAsset("app-icon-64", "/brand/shimmerstock-app-icon-192.png", 64);
} finally {
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  results,
  summary: {
    consoleErrors: results.reduce((count, result) => count + (result.consoleErrors?.length || 0), 0),
    networkErrors: results.reduce((count, result) => count + (result.networkErrors?.length || 0), 0),
    horizontalOverflows: results.filter((result) => result.metrics?.hasHorizontalOverflow).length,
    headerCollisions: results.filter((result) => result.metrics?.brandNavCollision || result.metrics?.brandActionsCollision).length,
    accessibilityViolations: results.reduce((count, result) => count + (result.accessibilityViolations?.length || 0), 0),
  },
};

await fs.writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));