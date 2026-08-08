import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const VIEWPORTS = [
  { name: '375px-mobile', width: 375, height: 667 },
  { name: '430px-mobile', width: 430, height: 932 }
];

(async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const pageObj = await context.newPage();
      try {
        await pageObj.goto(`${BASE_URL}/resources/integrations`, { waitUntil: 'networkidle', timeout: 10000 });
        await pageObj.waitForTimeout(1000);
        await pageObj.screenshot({ path: `./qa-results/integrations-${viewport.name}.png` });
        console.log(`✅ integrations ${viewport.name}`);
      } catch (e) {
        console.log(`❌ ${e.message}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
})();
