# Claude Code Instructions for Thyme

## Project Overview

Thyme is a time tracking application that integrates with Microsoft Dynamics 365 Business Central. Built with Next.js 14, MSAL authentication, and Tailwind CSS.

## Key Directories

- `src/app/` - Next.js App Router pages
- `src/components/` - React components
- `src/services/auth/` - MSAL authentication
- `src/services/bc/` - Business Central API client
- `docs/` - Documentation (AsciiDoc format)

## Development Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run test         # Run tests
npm run lint         # Lint code
npm run lint:fix     # Auto-fix lint issues
npm run format       # Format code with Prettier
npm run format:check # Verify formatting
npm run typecheck    # TypeScript type checking
npm run check        # Run all checks (format, lint, typecheck, build)
```

## Code Quality

**Before committing changes**, run all checks:

```bash
npm run check
```

This validates:

- Prettier formatting (`npm run format:check`)
- ESLint rules (`npm run lint`)
- TypeScript types (`npm run typecheck`)
- Production build (`npm run build`)

CI/CD runs these checks automatically on every PR via GitHub Actions.

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
