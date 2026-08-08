import { chromium } from "playwright";
import fs from "fs/promises";

const browser = await chromium.launch({ headless: true });
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
await page.goto("http://localhost:3000/login", { waitUntil: "networkidle", timeout: 10000 });
await page.waitForTimeout(800);
console.log("Console errors on /login:", errs.length);
errs.slice(0, 5).forEach(e => console.log(" -", e));
await browser.close();
