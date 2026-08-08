import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const VIEWPORTS = [
  { name: '1024px-laptop', width: 1024, height: 768 },
  { name: '1280px-desktop', width: 1280, height: 720 },
  { name: '1440px-ultrawide', width: 1440, height: 900 }
];

const PAGES = [
  { name: 'early-access', path: '/early-access' },
  { name: 'integrations', path: '/resources/integrations' }
];

(async () => {
  const browser = await chromium.launch();
  try {
    for (const page of PAGES) {
      for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
        const pageObj = await context.newPage();
        try {
          await pageObj.goto(`${BASE_URL}${page.path}`, { waitUntil: 'networkidle', timeout: 10000 });
          await pageObj.waitForTimeout(1000);
          await pageObj.screenshot({ path: `./qa-results/${page.name}-${viewport.name}.png` });
          console.log(`✅ ${page.name} ${viewport.name}`);
        } catch (e) {
          console.log(`❌ ${page.name} ${viewport.name}: ${e.message}`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
})();
