import { chromium } from "playwright";
import fs from "fs/promises";

const BASE = "http://localhost:3000";
const QA_DIR = "./qa-results";

const VIEWPORTS = [
  { w: 375, h: 667, label: "375" },
  { w: 390, h: 844, label: "390" },
  { w: 430, h: 932, label: "430" },
  { w: 768, h: 1024, label: "768" },
  { w: 1024, h: 768, label: "1024" },
  { w: 1280, h: 720, label: "1280" },
  { w: 1440, h: 900, label: "1440" },
];

const ROUTES = [
  { path: "/",                           label: "homepage",         auth: false },
  { path: "/pricing",                    label: "pricing",          auth: false },
  { path: "/early-access",              label: "early-access",     auth: false },
  { path: "/product/novi",              label: "novi-flagship",    auth: false },
  { path: "/solutions/craft-suppliers", label: "craft-suppliers",  auth: false },
  { path: "/solutions/ecommerce-brands",label: "ecommerce-brands", auth: false },
  { path: "/solutions/freshies",        label: "freshies",         auth: false },
  { path: "/about",                     label: "about",            auth: false },
  { path: "/resources/integrations",    label: "integrations",     auth: false },
  { path: "/login", label: "login", auth: true },
  { path: "/hq",                        label: "command-center",   auth: true },
  { path: "/products",                  label: "products",         auth: true },
  { path: "/orders",                    label: "orders",           auth: true },
  { path: "/purchasing",                label: "purchasing",       auth: true },
  { path: "/production",                label: "production",       auth: true },
  { path: "/fulfillment",               label: "fulfillment",      auth: true },
  { path: "/warehouse",                 label: "warehouse",        auth: true },
  { path: "/customers",                 label: "customer-care",    auth: true },
  { path: "/commerce",                  label: "shopify-readiness",auth: true },
  { path: "/onboarding",                label: "onboarding",       auth: true },
];

async function run() {
  await fs.mkdir(QA_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const rows = [];

  for (const route of ROUTES) {
    const routeRows = [];
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const page = await ctx.newPage();
      const cerrs = [];
      page.on("console", m => { if (m.type() === "error") cerrs.push(m.text()); });

      try {
        await page.goto(`${BASE}${route.path}`, { waitUntil: "networkidle", timeout: 12000 });
        await page.waitForTimeout(500);

        const overflow = await page.evaluate(() => document.body.scrollWidth > window.innerWidth + 2);
        const finalUrl = page.url();
        const redirected = finalUrl.includes("/login") && !route.path.includes("/login");

        // Auth routes: 401 errors are expected without a session
        const realErrors = route.auth
          ? cerrs.filter(e => !e.includes("401") && !e.includes("Unauthorized"))
          : cerrs;

        const status = realErrors.length > 0 ? "FAIL" : redirected ? "REDIRECT" : "PASS";
        const note = route.auth && cerrs.some(e => e.includes("401")) ? "401=expected" : "";

        routeRows.push({ label: route.label, vp: vp.label, status, consoleErrors: realErrors.length, overflow, note });
      } catch (e) {
        routeRows.push({ label: route.label, vp: vp.label, status: "FAIL", consoleErrors: 1, overflow: false, note: String(e.message).slice(0, 60) });
      } finally {
        await ctx.close();
      }
    }

    const allOk = routeRows.every(r => r.status === "PASS" || r.status === "REDIRECT");
    const overflows = routeRows.filter(r => r.overflow).length;
    const errs = routeRows.reduce((s, r) => s + r.consoleErrors, 0);
    const note = routeRows[0]?.note ?? "";
    console.log(`${allOk ? "✅" : "❌"} ${route.label.padEnd(22)} errors=${errs} overflow=${overflows} ${note}`);
    rows.push(...routeRows);
  }

  await browser.close();

  const pass = rows.filter(r => r.status === "PASS" || r.status === "REDIRECT").length;
  const fail = rows.filter(r => r.status === "FAIL").length;
  const overflows = rows.filter(r => r.overflow).length;
  const errors = rows.reduce((s, r) => s + r.consoleErrors, 0);

  const report = { timestamp: new Date().toISOString(), totalCombinations: rows.length, pass, fail, overflows, consoleErrors: errors, rows };
  await fs.writeFile(`${QA_DIR}/phase1-final-qa.json`, JSON.stringify(report, null, 2));

  console.log("\n=== BROWSER QA SUMMARY ===");
  console.log(`Routes:            ${ROUTES.length}`);
  console.log(`Viewports:         7 (375,390,430,768,1024,1280,1440)`);
  console.log(`Total combinations:${rows.length} (${ROUTES.length} × 7)`);
  console.log(`PASS + REDIRECT:   ${pass}`);
  console.log(`FAIL:              ${fail}`);
  console.log(`Overflow:          ${overflows}`);
  console.log(`Real console errs: ${errors}`);
}

run().catch(console.error);
