// Capture the landing page / README screenshots from a running Thyme dev server.
//
// Connects to a browser you've already signed in to (started with
// --remote-debugging-port=9222), opens each page under /{environment}/{companyId}/…
// and saves 1280x720 PNGs to public/screenshots/. See
// .claude/skills/capture-app-screenshots.md for the full guide.
//
// Usage:
//   node scripts/capture-screenshots.mjs --env sandbox --company <company-guid> \
//     [--project PR00010] [--week 2026-10-12] [--only plan,plan-review] [--base-url http://localhost:3000]
//
// Every option can also come from an environment variable:
//   THYME_ENV, THYME_COMPANY_ID, THYME_PROJECT, THYME_WEEK, THYME_ONLY, THYME_BASE_URL, CDP_URL
//
// Use the demo company CRONUS UK Ltd. in a sandbox: the repository is public, so the
// screenshots must not show real client names or monetary amounts.

import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { parseArgs } from 'util';

const VIEWPORT = { width: 1280, height: 720 };
const OUTPUT_DIR = './public/screenshots';
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const { values: args } = parseArgs({
  options: {
    env: { type: 'string' },
    company: { type: 'string' },
    project: { type: 'string' },
    week: { type: 'string' },
    only: { type: 'string' },
    'base-url': { type: 'string' },
    'cdp-url': { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (args.help) {
  console.log(
    'Usage: node scripts/capture-screenshots.mjs --env <sandbox|production> --company <guid> ' +
      '[--project <number>] [--week <yyyy-mm-dd>] [--only <name,name>] [--base-url <url>] [--cdp-url <url>]'
  );
  process.exit(0);
}

const environment = (args.env ?? process.env.THYME_ENV ?? 'sandbox').toLowerCase();
const companyId = (args.company ?? process.env.THYME_COMPANY_ID ?? '').toLowerCase();
const projectNumber = args.project ?? process.env.THYME_PROJECT;
const week = args.week ?? process.env.THYME_WEEK;
const only = (args.only ?? process.env.THYME_ONLY ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const baseUrl = (args['base-url'] ?? process.env.THYME_BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  ''
);
const cdpUrl = args['cdp-url'] ?? process.env.CDP_URL ?? 'http://localhost:9222';

if (!['sandbox', 'production'].includes(environment)) {
  console.error(`--env must be "sandbox" or "production", not "${environment}"`);
  process.exit(1);
}
if (!GUID_PATTERN.test(companyId)) {
  console.error(
    '--company (or THYME_COMPANY_ID) must be the Business Central company GUID.\n' +
      'Open the company in Thyme and copy it from the URL: /{environment}/{companyId}/time'
  );
  process.exit(1);
}
if (week && !/^\d{4}-\d{2}-\d{2}$/.test(week)) {
  console.error(`--week must be a date like 2026-10-12, not "${week}"`);
  process.exit(1);
}

const weekQuery = week ? `?week=${week}` : '';

/** Click the first element matching the selector, if there is one. */
async function clickFirst(page, selector) {
  const target = page.locator(selector).first();
  await target.waitFor({ state: 'visible', timeout: 15000 });
  await target.click();
}

/**
 * The shots, in carousel order. `ready` is a selector that's on screen once the page
 * has loaded its data; `prepare` opens whatever the shot needs (expanded rows, popovers).
 */
const shots = [
  {
    name: 'timesheet',
    path: `/time${weekQuery}`,
    ready: 'text=/Week total/i',
  },
  {
    name: 'poppie-suggestions',
    path: `/time${weekQuery}`,
    ready: "text=Poppie's suggestions",
    prepare: async (page) => {
      // Bring Poppie's panel to the top of the viewport
      await page.locator('h3:has-text("Poppie\'s suggestions")').first().scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -80));
    },
  },
  {
    name: 'projects',
    path: projectNumber ? `/projects/${encodeURIComponent(projectNumber)}` : null,
    skipReason: 'pass --project <number> (or THYME_PROJECT) to capture a project page',
    ready: 'text=/vs Budget/i',
  },
  {
    name: 'team',
    path: '/team',
    ready: 'text=/Timesheet completion/i',
  },
  {
    name: 'plan',
    path: '/plan',
    ready: 'button[aria-label="Expand"]',
    prepare: async (page) => {
      // Expand the first person to show their allocations by project and task
      await clickFirst(page, 'button[aria-label="Expand"]');
    },
  },
  {
    name: 'plan-review',
    path: '/plan',
    ready: '[data-testid="plan-review-week-chip"]',
    prepare: async (page) => {
      // Open Poppie's review for the first reviewed week
      await clickFirst(page, '[data-testid="plan-review-week-chip"]');
      await page.locator('[role="dialog"]').first().waitFor({ state: 'visible', timeout: 10000 });
    },
  },
  {
    name: 'approvals',
    path: '/approvals',
    ready: 'button[aria-label="Expand timesheet details"]',
    prepare: async (page) => {
      // Expand the first submitted timesheet to show its entries, days and Poppie's notes
      await clickFirst(page, 'button[aria-label="Expand timesheet details"]');
    },
  },
  {
    name: 'reports',
    path: '/reports',
    ready: 'text=/Hours by Project/i',
  },
];

async function captureScreenshots() {
  const selected = only.length ? shots.filter((shot) => only.includes(shot.name)) : shots;
  const unknown = only.filter((name) => !shots.some((shot) => shot.name === name));
  if (unknown.length) {
    console.error(
      `Unknown screenshot(s): ${unknown.join(', ')}. Choose from: ${shots.map((s) => s.name).join(', ')}`
    );
    process.exit(1);
  }

  let browser;
  try {
    console.log(`Connecting to browser at ${cdpUrl}...`);
    browser = await chromium.connectOverCDP(cdpUrl);
  } catch (err) {
    console.error('Error:', err.message);
    console.log('\nStart Edge with: microsoft-edge --remote-debugging-port=9222 ' + baseUrl);
    process.exit(1);
  }
  console.log('✓ Connected to browser');

  // Reuse the signed-in context, and a Thyme tab if one is open
  const context = browser.contexts()[0];
  let page = context.pages().find((p) => p.url().startsWith(baseUrl));
  if (!page) {
    console.log('Creating new page...');
    page = await context.newPage();
  }

  // Auto-dismiss any dialogs
  page.on('dialog', async (dialog) => {
    console.log(`  Dialog detected: ${dialog.message()}`);
    await dialog.dismiss().catch(() => {});
  });

  await page.setViewportSize(VIEWPORT);
  console.log(`✓ Viewport set to ${VIEWPORT.width}x${VIEWPORT.height}`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  const companyBase = `${baseUrl}/${environment}/${companyId}`;
  const failed = [];
  const skipped = [];

  for (const shot of selected) {
    if (!shot.path) {
      console.log(`\n- Skipping ${shot.name}: ${shot.skipReason}`);
      skipped.push(shot.name);
      continue;
    }

    const url = `${companyBase}${shot.path}`;
    console.log(`\nNavigating to ${shot.name}: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.locator(shot.ready).first().waitFor({ state: 'visible', timeout: 30000 });

      // Let the remaining Business Central requests finish (the app polls, so don't
      // insist on a fully idle network)
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      if (shot.prepare) await shot.prepare(page);

      // Let expand/popover animations finish
      await page.waitForTimeout(1000);

      const filename = `${OUTPUT_DIR}/${shot.name}.png`;
      // scale: 'css' keeps the file at 1280x720 on HiDPI screens
      await page.screenshot({ path: filename, scale: 'css' });
      console.log(`✓ Saved ${filename}`);
    } catch (err) {
      console.error(`✗ ${shot.name}: ${err.message.split('\n')[0]}`);
      failed.push(shot.name);
    }
  }

  // Leave the browser open; we only attached to it
  console.log(`\nScreenshots saved to ${OUTPUT_DIR}/`);
  if (skipped.length) console.log(`Skipped: ${skipped.join(', ')}`);
  if (failed.length) {
    console.log(`Failed: ${failed.join(', ')} (retry with --only ${failed.join(',')})`);
    process.exit(1);
  }
  console.log(
    '✅ All selected screenshots captured. Open each one and check it before committing.'
  );
  process.exit(0);
}

captureScreenshots();
