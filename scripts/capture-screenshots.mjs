import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const BASE_URL = 'http://localhost:3001';
const WEEK = '2025-12-29';

const screenshots = [
  {
    name: 'dashboard',
    path: `/?week=${WEEK}`,
    waitFor: '[data-testid="timesheet"]',
    fallbackWait: 3000,
  },
  {
    name: 'timesheet',
    path: `/?week=${WEEK}`,
    waitFor: '[data-testid="timesheet"]',
    fallbackWait: 3000,
  },
  { name: 'projects', path: '/projects', waitFor: 'text=Projects', fallbackWait: 3000 },
  { name: 'reports', path: '/reports', waitFor: 'text=Reports', fallbackWait: 3000 },
  { name: 'approvals', path: '/approvals', waitFor: 'text=Approvals', fallbackWait: 3000 },
  { name: 'team', path: '/team', waitFor: 'text=Team', fallbackWait: 3000 },
];

async function captureScreenshots() {
  try {
    console.log('Connecting to browser...');
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('✓ Connected to browser');

    const context = browser.contexts()[0];

    // Find or create a page for Thyme
    let page = context.pages().find((p) => p.url().includes('localhost:3001'));

    // Auto-dismiss any dialogs
    page.on('dialog', async (dialog) => {
      console.log(`  Dialog detected: ${dialog.message()}`);
      await dialog.dismiss().catch(() => {});
    });

    if (!page) {
      console.log('Creating new page...');
      page = await context.newPage();
    }

    // Set viewport to AppSource required dimensions
    await page.setViewportSize({ width: 1280, height: 720 });
    console.log('✓ Viewport set to 1280x720');

    // Ensure screenshots directory exists
    await mkdir('./public/screenshots', { recursive: true });

    for (const shot of screenshots) {
      const url = `${BASE_URL}${shot.path}`;
      console.log(`\nNavigating to ${shot.name}: ${url}`);

      await page.goto(url, { waitUntil: 'networkidle' });

      // Wait for content to load
      try {
        await page.waitForSelector(shot.waitFor, { timeout: 5000 });
      } catch {
        console.log(`  Waiting ${shot.fallbackWait}ms for page to settle...`);
        await page.waitForTimeout(shot.fallbackWait);
      }

      // Additional wait for animations
      await page.waitForTimeout(1000);

      const filename = `./public/screenshots/${shot.name}.png`;
      await page.screenshot({ path: filename });
      console.log(`✓ Saved ${filename}`);
    }

    console.log('\n✅ All screenshots captured!');
    console.log('Screenshots saved to public/screenshots/');
  } catch (err) {
    console.error('Error:', err.message);
    if (err.message.includes('ECONNREFUSED')) {
      console.log('\n📋 Start Edge with: microsoft-edge --remote-debugging-port=9222');
    }
  }
}

captureScreenshots();
