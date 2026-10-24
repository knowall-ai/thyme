<!--
Title format: conventional-commit prefix + short description.
  feat: ...      fix: ...      perf: ...      refactor: ...     (require Fixes #nnn)
  chore: ...     ci: ...       docs: ...      deps: ...
  test: ...      build: ...    style: ...

Body: keep the sections below. Put each `Fixes #nnn` on its own line — one per
issue. GitHub auto-closes those issues when this PR merges.
-->

## Summary

<!-- 1–3 bullets: what changed and why. -->

## Fixes

Fixes #

<!-- One `Fixes #nnn` per issue resolved. Delete this section for chore/ci/docs/deps PRs that aren't tied to an issue. -->

## Test plan

<!--
Step-by-step actions a reviewer or tester can follow, with expected results.
Example:
  1. Sign in with a Business Central account.
  2. Open the Time Tracking page.
  3. **Expected:** today's entries load without errors.
  4. Add a new entry for project X, 30 minutes.
  5. **Expected:** entry appears and totals update.

For pure-refactor / docs / CI / deps PRs with no user-visible change, replace the steps with:

  N/A — <one-line reason, e.g. "internal refactor, covered by existing tests">
-->

## Screenshots

<!--
Required for feat/fix/perf/refactor/style PRs. Add before/after images for UI changes.
- Take them from the Business Central sandbox demo company CRONUS UK Ltd. Never use real client data or £ amounts; if unavoidable, blur them before committing.
- Commit images under docs/images/pr/ and link them with raw.githubusercontent.com URLs pinned to the commit SHA:
  ![After](https://raw.githubusercontent.com/knowall-ai/timmie/<commit-sha>/docs/images/pr/<name>.png)
- If nothing visible changed, replace this with:  N/A — <one-line reason, e.g. "backend only, no UI change">
-->
