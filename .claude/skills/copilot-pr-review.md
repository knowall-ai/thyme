# GitHub Copilot PR Review Response

Guidance for responding to GitHub Copilot's automated PR review comments.

## When to Use

Use this skill when addressing GitHub Copilot review comments on pull requests.

## General Philosophy

GitHub Copilot is generally good with its reviews. Work collaboratively with Copilot to improve the quality of the solution. You should aim to resolve all comments unless you have good justification not to.

## Workflow

### 1. Address Each Comment Individually

- Review each Copilot comment one at a time
- Don't batch responses - each comment deserves individual attention
- Use `gh api` to interact with PR comments

### 2. Evaluate the Comment

For each comment, determine:

- **Valid and actionable**: Make the suggested change
- **Valid but needs discussion**: Explain your approach while considering the feedback
- **Disagree**: Push back with clear reasoning
- **New feature request**: Raise a GitHub issue instead

### 3. Response Actions

#### If You Agree and Fix It

1. Make the code change
2. Commit with a clear message referencing the feedback
3. Reply to the comment acknowledging the fix
4. Mark the comment as **Resolved**

```bash
# Reply to a PR review comment
gh api repos/{owner}/{repo}/pulls/{pr}/comments/{comment_id}/replies \
  -f body="Fixed in latest commit. Thanks for catching this!"

# Resolve a review thread (use the thread ID, not comment ID)
gh api graphql -f query='
  mutation {
    resolveReviewThread(input: {threadId: "THREAD_ID"}) {
      thread { isResolved }
    }
  }
'
```

#### If You Disagree

1. Provide clear technical justification for your approach
2. Reference documentation, best practices, or project conventions
3. Be respectful - Copilot's suggestions often have merit
4. Leave the thread open for discussion if needed

Example response:
> "I considered this approach, but [specific reason]. The current implementation [benefits]. Happy to discuss further if you see issues I'm missing."

#### If It's a New Feature

1. Create a GitHub issue for the feature request
2. Reference the issue in your reply to Copilot
3. Mark as **Resolved** (the issue tracks the work)

```bash
# Create an issue
gh issue create --title "Feature: [description]" --body "Raised from PR #X review feedback..."

# Reply referencing the issue
gh api repos/{owner}/{repo}/pulls/{pr}/comments/{comment_id}/replies \
  -f body="Good suggestion! This would be a new feature - I've raised #Y to track this."
```

### 4. Resolution Guidelines

**Mark as Resolved when:**
- You've made the suggested change
- You've created an issue for a feature request
- After discussion, both sides agree on the approach
- The comment is no longer actionable

**Keep Open when:**
- You're pushing back and want reviewer input
- The discussion is ongoing
- You need clarification

## Commands Reference

```bash
# List PR review comments
gh api repos/{owner}/{repo}/pulls/{pr}/comments

# Get a specific PR's reviews
gh pr view {pr} --comments

# Reply to a review comment
gh api repos/{owner}/{repo}/pulls/{pr}/comments/{comment_id}/replies \
  -f body="Your response"

# Get review threads (for resolving)
gh api graphql -f query='
  query {
    repository(owner: "{owner}", name: "{repo}") {
      pullRequest(number: {pr}) {
        reviewThreads(first: 100) {
          nodes {
            id
            isResolved
            comments(first: 1) {
              nodes { body }
            }
          }
        }
      }
    }
  }
'
```

## Quality Checklist

Before marking all Copilot comments as addressed:

- [ ] Each comment reviewed individually
- [ ] Code changes committed with clear messages
- [ ] Replies added to each comment explaining action taken
- [ ] New features tracked as issues
- [ ] Resolved threads marked appropriately
- [ ] Run `npm run check` to verify changes don't break anything
