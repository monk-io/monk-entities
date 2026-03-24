---
name: pr-watch
description: Watch a GitHub PR for CI checks to complete, then report status. Use after /pr-create to wait for builds, or when the user says "watch PR", "wait for CI", "check build status". Auto-triggers /pr-fix if reviews are found.
argument-hint: "[pr-number] - e.g., '42' or omit to auto-detect from current branch"
allowed-tools: Bash(*), Read, Agent
---

# Watch PR for CI and Reviews

Poll a GitHub PR until CI checks complete, then check for review comments.

## User prompt

$ARGUMENTS

---

## Step 1: Identify the PR

```bash
# From user prompt, or auto-detect from current branch
gh pr view --json number,title,url,statusCheckRollup,reviews,state 2>/dev/null
```

If no PR found on current branch, check if the user provided a PR number:
```bash
gh pr view <number> --json number,title,url,statusCheckRollup,reviews,state
```

## Step 2: Check current status

```bash
# Get check status
gh pr checks

# Get review status
gh pr view --json reviews,reviewRequests
```

If checks are already complete and no pending reviews, report and exit.

## Step 3: Poll for CI completion

```bash
# Wait for checks — gh pr checks will show status
gh pr checks --watch --fail-fast
```

If `--watch` is not available, poll manually:
```bash
gh pr checks
```

Report the result:
- **All checks passed** — ready for review or merge
- **Some checks failed** — list which ones, suggest `/pr-fix` to address
- **Checks still running** — report current state

## Step 4: Check for reviews

After CI passes (or if CI already passed):

```bash
# Get review comments
gh pr view --json reviews,comments
gh api repos/{owner}/{repo}/pulls/{number}/comments
```

If there are review comments or requested changes:
- Summarize each review comment (file, line, reviewer, content)
- Suggest running `/pr-fix <pr-number>` to address them

## Step 5: Report

Output:
- CI status (passed/failed/running)
- Failed checks with details (if any)
- Review comments summary (if any)
- Suggested next action:
  - All green, no reviews → "Ready to merge"
  - CI failed → "Run `/pr-fix <number>` to fix CI failures"
  - Reviews with comments → "Run `/pr-fix <number>` to address review comments"
