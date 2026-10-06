# Contributing to Thyme

## Before you open a pull request

Run all checks:

```bash
bun run check
```

Each PR needs:

- a title starting with `feat:`, `fix:`, `perf:`, `refactor:`, `chore:`, `ci:`, `docs:`, `deps:`, `test:`, `build:` or `style:`
- a `Fixes #nnn` line (for `feat`/`fix`/`perf`/`refactor`)
- a `## Test plan` section

UI changes need before/after screenshots.

## No client data, anywhere

**This repository is public.** Never include real client or customer data in PR titles or descriptions, issues, commit messages, code comments, test data, docs, or screenshots.

That includes customer names, project names and descriptions, client-identifying task names, and contact names.

- Take screenshots from the Business Central demo company **CRONUS UK Ltd.** in a sandbox environment, adding the demo projects, timesheets and allocations you need. For written examples, use **Contoso**.
- If a screenshot has to come from a real company, blur every client-identifying area before committing it, then look at the image to confirm nothing is readable.
- If client data is pushed by mistake, rewrite the branch history so the original never appears, then force-push. A follow-up commit isn't enough. Then ask GitHub Support to purge the old commits, which stay reachable by SHA.
