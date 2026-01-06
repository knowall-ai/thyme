# GitHub Copilot PR Review Response

Guidance for responding to GitHub Copilot's automated PR review comments.

## When to Use

Use this skill when:
- A PR has Copilot review comments that need addressing
- User asks to "respond to Copilot comments" or similar

## General Philosophy

GitHub Copilot reviews are generally good and should normally be resolved. Work collaboratively with Copilot to improve code quality. Aim to resolve ALL comments unless you have strong justification not to.

## Workflow

### 1. Fetch All Copilot Comments

```bash
# Get all review comments on a PR
gh api repos/{owner}/{repo}/pulls/{pr}/comments \
  --jq '.[] | select(.user.login == "Copilot") | {id: .id, path: .path, line: .line, body: .body}'
```

### 2. Address Each Comment Individually

For EACH comment:
1. Read and understand the suggestion
2. Evaluate whether to accept, modify, or decline
3. Make code changes if needed
4. Commit changes (reference will be used in response)
5. Reply to the comment with action taken

### 3. Response Actions

#### If You Agree and Fix It (Most Common)

1. Make the code change
2. Commit with clear message
3. Reply referencing the commit:

```bash
# Reply to a PR review comment (use in_reply_to, NOT the /replies endpoint)
gh api repos/{owner}/{repo}/pulls/{pr}/comments \
  -f body="Fixed! [Description of change]. See commit abc1234." \
  -F in_reply_to={comment_id}
```

Example responses:
- "Fixed! Added null check as suggested."
- "Fixed! Updated to use `Array.from()` for proper Unicode handling."
- "Fixed! Now caching the null result to prevent repeated API calls."

#### If You Disagree (Justify Why)

Provide clear technical reasoning:

```bash
gh api repos/{owner}/{repo}/pulls/{pr}/comments \
  -f body="Valid concern, but acceptable for current scope because [reason]. The current approach [benefits]. We can revisit if [condition]." \
  -F in_reply_to={comment_id}
```

Example:
- "Valid concern, but acceptable for MVP. The 30-minute cache duration keeps memory usage reasonable for single-user scope. We can optimize further if memory becomes an issue in production."

#### If It's Out of Scope (Create Issue)

For good suggestions that are larger features:

```bash
# Create an issue
gh issue create \
  --title "Enhancement: [description]" \
  --body "Raised from Copilot review on PR #X.

## Suggestion
[Copilot's suggestion]

## Context
[Why this is out of scope for current PR but worth tracking]"

# Reply referencing the issue
gh api repos/{owner}/{repo}/pulls/{pr}/comments \
  -f body="Good suggestion! This would be a larger enhancement - created #Y to track this." \
  -F in_reply_to={comment_id}
```

### 4. Commit Message Format

When fixing Copilot review items, use clear commit messages:

```
fix: Address Copilot review feedback

- [Change 1 description]
- [Change 2 description]
- [Change 3 description]
```

### 5. Resolution

After replying to all comments:
- Verify all Copilot comments have responses
- Run `npm run check` to ensure changes don't break anything
- Push the changes

## Commands Reference

```bash
# List all Copilot review comments on a PR
gh api repos/{owner}/{repo}/pulls/{pr}/comments \
  --jq '.[] | select(.user.login == "Copilot") | {id, path, line, body}'

# Reply to a specific comment
gh api repos/{owner}/{repo}/pulls/{pr}/comments \
  -f body="Your response here" \
  -F in_reply_to={comment_id}

# Get PR number from current branch
gh pr view --json number --jq '.number'

# View all comments with context
gh api repos/{owner}/{repo}/pulls/{pr}/comments \
  --jq '.[] | "\(.id): \(.path):\(.line) - \(.body[0:100])..."'
```

## Quality Checklist

Before marking Copilot review as complete:

- [ ] Fetched ALL Copilot comments
- [ ] Each comment reviewed individually
- [ ] Code changes made where appropriate
- [ ] Changes committed with clear messages
- [ ] Reply added to EACH comment explaining action taken
- [ ] Out-of-scope features tracked as GitHub issues
- [ ] Run `npm run check` passes
- [ ] Changes pushed to remote

## Important Notes

- Always respond to EVERY Copilot comment - don't leave any unanswered
- Reference commits when describing fixes
- Be specific in responses (not just "Fixed" - say what was fixed)
- Copilot suggestions are usually good - default to accepting them
- When declining, provide clear technical justification
