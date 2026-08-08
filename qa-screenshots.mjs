import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const QA_DIR = './qa-results';
const BASE_URL = 'http://localhost:3000';

// Viewport sizes to test
const VIEWPORTS = [
  { name: '375px-mobile', width: 375, height: 667 },
  { name: '430px-mobile', width: 430, height: 932 },
  { name: '768px-tablet', width: 768, height: 1024 },
  { name: '1024px-laptop', width: 1024, height: 768 },
  { name: '1280px-desktop', width: 1280, height: 720 },
  { name: '1440px-ultrawide', width: 1440, height: 900 }
];

// Pages to test
const PAGES = [
  { name: 'homepage', path: '/', interactions: ['scroll', 'tabs', 'calculator'] },
  { name: 'product', path: '/product', interactions: ['scroll', 'engine-cards'] },
  { name: 'novi', path: '/product/novi', interactions: ['priorities'] },
  { name: 'craft-suppliers', path: '/solutions/craft-suppliers', interactions: ['catalog-rows'] },
  { name: 'ecommerce', path: '/solutions/ecommerce-brands', interactions: ['scroll'] },
  { name: 'freshies', path: '/solutions/freshies', interactions: ['formula-demo'] },
  { name: 'about', path: '/about', interactions: ['scroll'] },
  { name: 'pricing', path: '/pricing', interactions: ['scroll'] },
  { name: 'early-access', path: '/early-access', interactions: ['form'] },
  { name: 'integrations', path: '/resources/integrations', interactions: ['scroll'] }
];

async function captureScreenshots() {
  await fs.mkdir(QA_DIR, { recursive: true });
  
  const browser = await chromium.launch();
  const results = [];
  
  try {
    for (const page of PAGES) {
      console.log(`\n📄 Testing: ${page.name}`);
      
      for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({ 
          viewport: { width: viewport.width, height: viewport.height },
          ignoreHTTPSErrors: true
        });
        const pageObj = await context.newPage();
        
        const consoleErrors = [];
        const networkErrors = [];
        
        pageObj.on('console', msg => {
          if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
          }
        });
        
        pageObj.on('response', resp => {
          if (!resp.ok()) {
            networkErrors.push(`${resp.status()} ${resp.url()}`);
          }
        });
        
        try {
          await pageObj.goto(`${BASE_URL}${page.path}`, { waitUntil: 'networkidle', timeout: 10000 });
          
          // Wait for any animations
          await pageObj.waitForTimeout(1000);
          
          // Perform basic interactions
          if (page.interactions.includes('scroll')) {
            await pageObj.evaluate(() => window.scrollBy(0, 500));
            await pageObj.waitForTimeout(500);
          }
          
          // Check for overflow
          const overflow = await pageObj.evaluate(() => {
            const body = document.body;
            return body.scrollWidth > window.innerWidth;
          });
          
          const filename = `${page.name}-${viewport.name}.png`;
          const filepath = path.join(QA_DIR, filename);
          
          await pageObj.screenshot({ path: filepath, fullPage: false });
          
          results.push({
            page: page.name,
            viewport: viewport.name,
            status: 'PASS',
            consoleErrors: consoleErrors.length,
            networkErrors: networkErrors.length,
            hasOverflow: overflow,
            screenshot: filepath
          });
          
          console.log(`  ✅ ${viewport.name} - ${consoleErrors.length} errors, overflow: ${overflow}`);
          
        } catch (error) {
          console.log(`  ❌ ${viewport.name} - ${error.message}`);
          results.push({
            page: page.name,
            viewport: viewport.name,
            status: 'FAIL',
            error: error.message
          });
        } finally {
          await context.close();
        }
      }
    }
    
  } finally {
    await browser.close();
  }
  
  // Write results
  const report = {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passed: results.filter(r => r.status === 'PASS').length,
    failed: results.filter(r => r.status === 'FAIL').length,
    totalConsoleErrors: results.reduce((sum, r) => sum + (r.consoleErrors || 0), 0),
    totalNetworkErrors: results.reduce((sum, r) => sum + (r.networkErrors || 0), 0),
    pagesWithOverflow: results.filter(r => r.hasOverflow).length,
    results
  };
  
  await fs.writeFile(
    path.join(QA_DIR, 'qa-report.json'),
    JSON.stringify(report, null, 2)
  );
  
  console.log(`\n\n📊 QA SUMMARY`);
  console.log(`============`);
  console.log(`Total Tests: ${report.totalTests}`);
  console.log(`Passed: ${report.passed}`);
  console.log(`Failed: ${report.failed}`);
  console.log(`Console Errors: ${report.totalConsoleErrors}`);
  console.log(`Network Errors: ${report.totalNetworkErrors}`);
  console.log(`Pages with Overflow: ${report.pagesWithOverflow}`);
  console.log(`\nScreenshots saved to: ${QA_DIR}/`);
}

captureScreenshots().catch(console.error);
