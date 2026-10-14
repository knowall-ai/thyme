# Capture App Screenshots

Capture screenshots of web applications for marketing materials, AppSource listings, or documentation.

## Prerequisites

1. **Edge/Chrome with remote debugging**: The browser must be started with `--remote-debugging-port=9222`
2. **Playwright installed**: Already included in project dev dependencies
3. **App running**: Dev server must be running (e.g., `bun run dev`)

## Starting Browser with Debug Port

```bash
# Close all existing browser instances first
killall -9 msedge  # or: killall -9 chrome

# Start fresh with debug port
microsoft-edge --remote-debugging-port=9222 http://localhost:3000
# or
google-chrome --remote-debugging-port=9222 http://localhost:3000
```

Sign in to Thyme in that browser and open the demo company before running the script. The script reuses the signed-in session.

## Demo data only

This repository is public. Capture from the Business Central demo company **CRONUS UK Ltd.** in a sandbox environment, populated with the projects, timesheets, plan allocations and Poppie reviews each shot needs. Never capture a real company's client names or monetary amounts. Open every image and check it before committing.

## Screenshot Script

The script is located at `scripts/capture-screenshots.mjs`. Pages live under `/{environment}/{companyId}/…`, so pass both:

```bash
node scripts/capture-screenshots.mjs --env sandbox --company <company-guid> --project <project-number>

# Only retake some shots, for a particular week
node scripts/capture-screenshots.mjs --env sandbox --company <company-guid> --week 2026-10-12 --only plan,plan-review
```

Copy the company GUID from the Thyme URL (`/sandbox/<company-guid>/time`).

### Options

| Option       | Environment variable | Default                 | Purpose                                                  |
| ------------ | -------------------- | ----------------------- | -------------------------------------------------------- |
| `--env`      | `THYME_ENV`          | `sandbox`               | Business Central environment (`sandbox` or `production`) |
| `--company`  | `THYME_COMPANY_ID`   | (required)              | Business Central company GUID                            |
| `--project`  | `THYME_PROJECT`      | (none: skips Projects)  | Project number for the project page shot                 |
| `--week`     | `THYME_WEEK`         | current week            | Week (`yyyy-mm-dd`) for the Time page shots              |
| `--only`     | `THYME_ONLY`         | all                     | Comma-separated shot names to capture                    |
| `--base-url` | `THYME_BASE_URL`     | `http://localhost:3000` | Thyme URL                                                |
| `--cdp-url`  | `CDP_URL`            | `http://localhost:9222` | Browser remote debugging URL                             |

The script exits non-zero if any shot fails, and prints the `--only` list to retry.

### Output

Screenshots are saved to `public/screenshots/` at 1280x720 pixels (AppSource requirement). The viewport is set to 1280x720 and captured in CSS pixels, so HiDPI screens still produce 1280x720 files.

## Screenshots

In carousel order (`src/components/landing/ScreenshotCarousel.tsx`). The README shows the six page shots.

| Filename                 | Page                 | What it must show                                                                                           |
| ------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `timesheet.png`          | `/time`              | A filled-in week with each day's and the week's billable % against target                                   |
| `poppie-suggestions.png` | `/time` (scrolled)   | Poppie's suggestions panel with a few suggestions grouped by day                                            |
| `projects.png`           | `/projects/{number}` | Project page: estimate, spend to date, forecast with finish date, Spend vs Budget chart                     |
| `team.png`               | `/team`              | Team table with hours by stage, timesheet completion and billable % against target                          |
| `plan.png`               | `/plan`              | First person expanded to allocations by project and task; ideally a red and an amber day                    |
| `plan-review.png`        | `/plan`              | Poppie's verdict chip in a week header, popover open on a finding with a proposed change                    |
| `approvals.png`          | `/approvals`         | First submitted timesheet expanded: one row per entry with its day, daily hours, billable %, Poppie's notes |
| `reports.png`            | `/reports`           | Period picker, client/project filters, Hours by Project split by stage                                      |

`dashboard.png` is an older AppSource shot and isn't captured by the script.

The script expands what each shot needs: the first person on the Plan (`button[aria-label="Expand"]`), the first timesheet on Approvals (`button[aria-label="Expand timesheet details"]`) and the first plan-review chip (`[data-testid="plan-review-week-chip"]`). Poppie's plan review only appears once the plan-review APIs are deployed and she has reviewed a week in view.

## Usage in App

Screenshots are displayed in:

- **Landing page carousel**: `src/components/landing/ScreenshotCarousel.tsx`
- **README**: the Screenshots table
- **AppSource listing**: Marketing materials for Microsoft store

## Troubleshooting

### "ECONNREFUSED" error

Browser wasn't started with debug port. Kill all instances and restart:

```bash
killall -9 msedge && microsoft-edge --remote-debugging-port=9222
```

### "Opening in existing browser session"

Browser is already running. Must kill all instances first before starting with debug flag.

### A shot times out waiting for the page

Each shot waits up to 30 seconds for something that only appears once the data has loaded (for example "Timesheet completion" on Team). Check the browser is still signed in and the company has the data the shot needs, then retry it with `--only <name>`.

### Dialog errors

The script auto-dismisses dialogs. If issues persist, close any open modals in the app before running.

## Manual Alternative

If automation fails:

1. Open app in browser
2. Use DevTools (F12) > Device toolbar to set viewport to 1280x720
3. Use browser's screenshot tool or OS screenshot utility
4. Save as PNG to `public/screenshots/`
