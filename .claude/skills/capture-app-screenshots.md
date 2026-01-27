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
microsoft-edge --remote-debugging-port=9222 http://localhost:3001
# or
google-chrome --remote-debugging-port=9222 http://localhost:3001
```

## Screenshot Script

The script is located at `scripts/capture-screenshots.mjs`:

```bash
node scripts/capture-screenshots.mjs
```

### Configuration

Edit the script to customize:

- `BASE_URL`: The app URL (default: `http://localhost:3001`)
- `WEEK`: The week parameter for timesheet views
- `screenshots` array: Pages to capture with their paths and filenames

### Output

Screenshots are saved to `public/screenshots/` at 1280x720 pixels (AppSource requirement).

## Required Screenshots for AppSource

| Filename        | Page         | Description                         |
| --------------- | ------------ | ----------------------------------- |
| `dashboard.png` | `/`          | Main dashboard with weekly overview |
| `timesheet.png` | `/`          | Weekly timesheet with time entries  |
| `projects.png`  | `/projects`  | Projects list                       |
| `reports.png`   | `/reports`   | Reports and analytics               |
| `approvals.png` | `/approvals` | Approval workflow                   |
| `team.png`      | `/team`      | Team management                     |

## Usage in App

Screenshots are displayed in:

- **Landing page carousel**: `src/components/landing/ScreenshotCarousel.tsx`
- **AppSource listing**: Marketing materials for Microsoft store

## Troubleshooting

### "ECONNREFUSED" error

Browser wasn't started with debug port. Kill all instances and restart:

```bash
killall -9 msedge && microsoft-edge --remote-debugging-port=9222
```

### "Opening in existing browser session"

Browser is already running. Must kill all instances first before starting with debug flag.

### Dialog errors

The script auto-dismisses dialogs. If issues persist, close any open modals in the app before running.

## Manual Alternative

If automation fails:

1. Open app in browser
2. Use DevTools (F12) > Device toolbar to set viewport to 1280x720
3. Use browser's screenshot tool or OS screenshot utility
4. Save as PNG to `public/screenshots/`
