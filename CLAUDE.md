# Claude Code Instructions for Thyme

## Project Overview

Thyme is a time tracking application that integrates with Microsoft Dynamics 365 Business Central. Built with Next.js 16, MSAL authentication, and Tailwind CSS 4.

**Company**: KnowAll AI SAS de CV (El Salvador). NIT: 0623-070525-121-2 | NRC: 362963-0

## Key Directories

- `src/app/` - Next.js App Router pages
- `src/components/` - React components
- `src/services/auth/` - MSAL authentication
- `src/services/bc/` - Business Central API client
- `docs/` - Documentation (AsciiDoc format)

## Development Commands

```bash
bun run dev          # Start dev server
bun run build        # Production build
bun run test         # Run tests
bun run lint         # Lint code
bun run lint:fix     # Auto-fix lint issues
bun run format       # Format code with Prettier
bun run format:check # Verify formatting
bun run typecheck    # TypeScript type checking
bun run check        # Run all checks (format, lint, typecheck, build)
```

## Branch Switching

**Important**: After switching git branches, you must restart the dev server:

```bash
rm -rf .next && bun run dev
```

The Next.js dev server caches compiled code in `.next/`. When switching branches, many files change simultaneously and the webpack cache becomes stale, causing module loading errors (e.g., "Initializing..." stuck, chunk load failures). A fresh restart rebuilds from scratch.

## Code Quality

**Before committing changes**, run all checks:

```bash
bun run check
```

This validates:

- Prettier formatting (`bun run format:check`)
- ESLint rules (`bun run lint`)
- TypeScript types (`bun run typecheck`)
- Production build (`bun run build`)

CI/CD runs these checks automatically on every PR via GitHub Actions.

## Release Workflow

The app version is displayed in the footer (from `package.json` via `NEXT_PUBLIC_APP_VERSION`).

To create a release:

```bash
npm version patch   # Bug fix: 1.2.0 → 1.2.1
npm version minor   # New feature: 1.2.0 → 1.3.0
npm version major   # Breaking change: 1.2.0 → 2.0.0

git push && git push --tags  # Deploy to production
```

The `npm version` command updates `package.json`, creates a commit, and creates a git tag. Pushing the tag triggers the production deployment workflow.

## Troubleshooting Documentation

**Important**: When encountering and resolving issues that admins or users might face, add them to `docs/TROUBLESHOOTING.adoc`.

The troubleshooting doc uses a simple 2-column table format:

```asciidoc
| Problem | Solution

| Description of the problem the user sees
| Step-by-step solution to resolve it
```

### When to Add Entries

Add troubleshooting entries when:

- Fixing a bug that users might encounter
- Resolving configuration issues
- Debugging authentication or API problems
- Solving environment-specific issues

### Entry Guidelines

1. **Problem**: Describe what the user sees/experiences (error messages, unexpected behavior)
2. **Solution**: Provide clear, actionable steps to resolve the issue

Keep entries concise but complete enough for someone unfamiliar with the codebase to follow.

## Business Central Integration

- API endpoint: `/projects` for projects (not `/jobs`)
- Employees endpoint: `/employees`
- Company info: `/companyInformation`
- All API calls go through `src/services/bc/bcClient.ts`

## Authentication

Uses MSAL with redirect flow (not popup). Key files:

- `src/services/auth/AuthProvider.tsx` - MSAL setup and hooks
- `src/services/auth/msalConfig.ts` - Configuration
- `src/services/auth/tokenService.ts` - Token acquisition

### Azure AD Redirect URIs

The redirect URI is determined dynamically using `window.location.origin`, so it works on any port. The Azure AD app registration (Thyme - Time Tracking) must have the redirect URI registered as a SPA redirect.

**Registered SPA Redirect URIs:**

- `http://localhost:3000` - Default local dev
- `http://localhost:3001` - Alternate local dev port
- `https://getthyme.ai` - Production
- `https://slot1-4.thyme.knowall.ai` - Staging slots

To check or update redirect URIs:

```bash
# View current redirect URIs
az ad app show --id "44c618b5-89c3-4673-92ec-f7afb4e403bf" --query "spa.redirectUris"

# Add a new redirect URI (replace with full list)
az ad app update --id "44c618b5-89c3-4673-92ec-f7afb4e403bf" --spa-redirect-uris "http://localhost:3000" "http://localhost:3001" "https://getthyme.ai"
```

## Adding UI Components

This project is configured for shadcn/ui. To add a new component:

```bash
bunx shadcn@latest add [component-name]
```

Components will be added to `src/components/ui/`.
