---
name: pr-loop
description: Continuously watch a PR for CI and review issues, fix them, and re-watch until the PR is green and ready to merge. Combines /pr-watch and /pr-fix in an automated loop. Use when the user says "watch and fix PR", "loop on PR", or wants hands-off PR shepherding.
argument-hint: "[pr-number] [--max-rounds N] - e.g., '174' or '174 --max-rounds 5'"
allowed-tools: Bash(*), Read, Write, Edit, Glob, Grep, Agent
---

# PR Watch-Fix Loop

Continuously watch a PR, fix CI failures and review comments, and re-watch until the PR is clean.

## User prompt

$ARGUMENTS

---

## Configuration

Parse from user prompt:
- `<pr-number>` — PR number, or omit to auto-detect from current branch
- `--max-rounds N` — maximum watch→fix cycles (default: 5, prevents infinite loops)

## Loop

```
Round 1 of N
│
├── WATCH: poll CI checks until complete
│   ├── All checks passed, no review comments → EXIT (ready to merge)
│   ├── Checks failed → continue to FIX
│   └── Review comments found → continue to FIX
│
├── FIX: address all issues
│   ├── Read CI failure logs
│   ├── Read review comments (inline + PR-level)
│   ├── Fix code, commit, push
│   └── Reply to review comments
│
└── Loop back to WATCH for next round
```

### Step 1: Identify the PR

```bash
# Auto-detect or use provided number
gh pr view [number] --json number,title,url,headRefName,state
```

Verify the PR is open. If merged or closed, exit.

### Step 2: Watch (poll CI)

```bash
gh pr checks [number]
```

If checks are pending, poll every 60 seconds until complete:
```bash
sleep 60
gh pr checks [number]
```

Once checks complete, evaluate:
- **All passed** → go to Step 3 (check reviews)
- **Any failed** → go to Step 4 (fix)

### Step 3: Check for reviews

```bash
# Inline code comments
gh api repos/{owner}/{repo}/pulls/{number}/comments --jq '.[] | {path: .path, line: .original_line, body: .body, user: .user.login, id: .id}'

# PR-level reviews
gh pr view [number] --json reviews --jq '.reviews[] | {state: .state, body: .body, author: .author.login}'
```

Evaluate:
- **No comments or all resolved** → EXIT: "PR is ready to merge"
- **New comments or CHANGES_REQUESTED** → go to Step 4

### Step 4: Fix issues

#### For CI failures:
1. Get failed check details:
   ```bash
   gh run view <run-id> --log-failed
   ```
2. Read error output, identify root cause
3. Fix the source code
4. Verify locally if possible (compile, lint)

#### For review comments:
1. Read each comment — file, line, content
2. Fix the code at the indicated location
3. If comment is a question, prepare a reply

#### Commit and push:
```bash
git add <changed-files>
git commit -m "Address PR feedback: <summary>"
git push
```

#### Reply to comments:
```bash
# Reply to inline comments
gh api repos/{owner}/{repo}/pulls/{number}/comments/{comment-id}/replies \
  -f body="Fixed — <description>"

# PR-level comment summarizing all fixes
gh pr comment [number] --body "Addressed feedback:
- <fix 1>
- <fix 2>"
```

### Step 5: Loop back

Increment round counter. If `round > max-rounds`, exit with warning:
"Reached maximum rounds (N). PR may still have issues — check manually."

Otherwise, go back to Step 2.

## Exit conditions

- **Success**: All checks pass AND no unresolved review comments → "PR #N is ready to merge"
- **Max rounds**: Exceeded `--max-rounds` → warn and exit
- **PR closed/merged**: PR is no longer open → exit
- **Unfixable issue**: Can't determine how to fix → ask the user for guidance instead of looping

## Report (on exit)

- Total rounds completed
- Fixes applied per round
- Final CI status
- Final review status
- PR URL
