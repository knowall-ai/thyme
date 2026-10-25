// Capture the landing page / README screenshots from a running Timmie dev server.
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
//   TIMMIE_ENV, TIMMIE_COMPANY_ID, TIMMIE_PROJECT, TIMMIE_WEEK, TIMMIE_ONLY, TIMMIE_BASE_URL, CDP_URL
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

const environment = (args.env ?? process.env.TIMMIE_ENV ?? 'sandbox').toLowerCase();
const companyId = (args.company ?? process.env.TIMMIE_COMPANY_ID ?? '').toLowerCase();
const projectNumber = args.project ?? process.env.TIMMIE_PROJECT;
const week = args.week ?? process.env.TIMMIE_WEEK;
const only = (args.only ?? process.env.TIMMIE_ONLY ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const baseUrl = (
  args['base-url'] ??
  process.env.TIMMIE_BASE_URL ??
  'http://localhost:3000'
).replace(/\/$/, '');
const cdpUrl = args['cdp-url'] ?? process.env.CDP_URL ?? 'http://localhost:9222';

if (!['sandbox', 'production'].includes(environment)) {
  console.error(`--env must be "sandbox" or "production", not "${environment}"`);
  process.exit(1);
}
if (!GUID_PATTERN.test(companyId)) {
  console.error(
    '--company (or TIMMIE_COMPANY_ID) must be the Business Central company GUID.\n' +
      'Open the company in Timmie and copy it from the URL: /{environment}/{companyId}/time'
  );
  process.exit(1);
}
if (week) {
  // A real calendar date (local components, so no UTC shift), not just the yyyy-mm-dd shape
  const [y, m, d] = (week.match(/^(\d{4})-(\d{2})-(\d{2})$/) || []).slice(1).map(Number);
  const parsed = y ? new Date(y, m - 1, d) : null;
  if (
    !parsed ||
    parsed.getFullYear() !== y ||
    parsed.getMonth() !== m - 1 ||
    parsed.getDate() !== d
  ) {
    console.error(`--week must be a real date like 2026-10-12, not "${week}"`);
    process.exit(1);
  }
  // Team and Reports can only step back from the current period, so a future week can't be shown
  if (parsed > new Date()) {
    console.error(`--week can't be in the future ("${week}"): Team and Reports only go back.`);
    process.exit(1);
  }
}

const weekQuery = week ? `?week=${week}` : '';

/** Monday of the week containing the date, at local midnight. */
function mondayOf(date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

// How many weeks before this one --week is, for pages that don't take ?week= (Team, Reports)
const weeksBack = week
  ? Math.max(
      0,
      Math.round((mondayOf(new Date()) - mondayOf(new Date(`${week}T00:00:00`))) / (7 * 864e5))
    )
  : 0;

// Hide the Next.js dev badge (it lives in the nextjs-portal element)
const HIDE_CSS = 'nextjs-portal { display: none !important; }';

/** Click the first element matching the selector, if there is one. */
async function clickFirst(page, selector) {
  const target = page.locator(selector).first();
  await target.waitFor({ state: 'visible', timeout: 15000 });
  await target.click();
}

/** Click a button `times` times, waiting for the page to settle after each. */
async function clickRepeatedly(page, selector, times) {
  for (let i = 0; i < times; i++) {
    await page.locator(selector).first().click();
    await page.waitForTimeout(300);
  }
  if (times > 0) await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
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
    prepare: async (page) => {
      // Collapse Poppie's review of the week so more of the grid fits
      const hide = page.locator('button[aria-label="Hide Poppie\'s review"]');
      if (await hide.count()) await hide.first().click();
    },
  },
  {
    name: 'poppie-suggestions',
    path: `/time${weekQuery}`,
    ready: "text=Poppie's suggestions",
    prepare: async (page) => {
      // Bring Poppie's panel to the top of the viewport
      await page
        .locator('h3:has-text("Poppie\'s suggestions")')
        .first()
        .evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => window.scrollBy(0, -100));
    },
  },
  {
    name: 'projects',
    path: projectNumber ? `/projects/${encodeURIComponent(projectNumber)}` : null,
    skipReason: 'pass --project <number> (or TIMMIE_PROJECT) to capture a project page',
    ready: 'text=/vs Budget/i',
  },
  {
    name: 'team',
    path: '/team',
    ready: 'text=/Timesheet completion/i',
    prepare: async (page) => {
      // Team has no ?week=, so step back to --week
      await clickRepeatedly(page, 'button:has-text("Previous week")', weeksBack);
    },
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
      // Open the first week Poppie has reviewed (unreviewed weeks show "Ask Poppie")
      await page
        .locator('[data-testid="plan-review-week-chip"]')
        .filter({ hasNotText: 'Ask Poppie' })
        .first()
        .click();
      const dialog = page.locator('[role="dialog"]').first();
      await dialog.waitFor({ state: 'visible', timeout: 10000 });
      // Show a reviewed person's or project's findings and proposed changes. The first
      // one needing attention usually opens already; if none is open, open the first
      if (!(await dialog.locator('button[aria-expanded="true"]').count())) {
        const collapsed = dialog.locator('button[aria-expanded="false"]');
        if (await collapsed.count()) await collapsed.first().click();
      }
    },
  },
  {
    name: 'approvals',
    path: '/approvals',
    ready: 'button[aria-label="Expand timesheet details"]',
    prepare: async (page) => {
      // Expand the first timesheet with hours, to show its entries, days and Poppie's notes
      const index = await page.evaluate(() => {
        const buttons = [
          ...document.querySelectorAll('button[aria-label="Expand timesheet details"]'),
        ];
        return buttons.findIndex((button) => {
          let card = button.parentElement;
          while (card && !/ hours/.test(card.textContent ?? '')) card = card.parentElement;
          return /(^|[^\d.])([1-9]\d*|0?\.\d*[1-9])(\.\d+)? hours/.test(card?.textContent ?? '');
        });
      });
      if (index < 0) throw new Error('No timesheet with hours to expand');
      // A handle, not a locator: once expanded, the button's label changes to "Collapse…"
      const button = await page
        .locator('button[aria-label="Expand timesheet details"]')
        .nth(index)
        .elementHandle();
      await button.click();
      // Wait for its lines to load before scrolling, so the layout has settled
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await button.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => window.scrollBy(0, -40));
    },
  },
  {
    name: 'reports',
    path: '/reports',
    ready: 'text=/Hours by Project/i',
    prepare: async (page) => {
      // Report on the week of --week (Reports has no ?week=)
      if (!week) return;
      await page.selectOption('#report-period', 'thisWeek');
      await page.waitForTimeout(300);
      await clickRepeatedly(page, 'button[aria-label="Previous period"]', weeksBack);
    },
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

  // A fresh tab in the signed-in context. Reusing an open tab can hang: the browser stops
  // painting background tabs, so a screenshot of one waits forever.
  const context = browser.contexts()[0];
  const page = await context.newPage();

  // Keep the "Introducing Timmie Bot" promo banner out of the shots (it stays dismissed,
  // as if you'd closed it)
  await page.addInitScript(() => {
    localStorage.setItem('timmie_teams_bot_banner_dismissed', 'true');
  });

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

      await page.addStyleTag({ content: HIDE_CSS });
      if (shot.prepare) await shot.prepare(page);

      // Let expand/popover animations finish
      await page.waitForTimeout(1000);

      // Bring the tab to the front so the browser paints it (see above)
      await page.bringToFront();
      const filename = `${OUTPUT_DIR}/${shot.name}.png`;
      // scale: 'css' keeps the file at 1280x720 on HiDPI screens
      await page.screenshot({ path: filename, scale: 'css' });
      console.log(`✓ Saved ${filename}`);
    } catch (err) {
      console.error(`✗ ${shot.name}: ${err.message.split('\n')[0]}`);
      failed.push(shot.name);
    }
  }

  await page.close();
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
