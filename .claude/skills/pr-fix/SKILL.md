---
name: pr-fix
description: Fix issues found in a GitHub PR — CI failures, review comments, or requested changes. Reads the PR, identifies all issues, fixes the code, commits, and pushes. Use after /pr-watch reports problems, or when the user says "fix PR", "address comments", "fix CI".
argument-hint: "[pr-number] - e.g., '42' or omit to auto-detect from current branch"
allowed-tools: Bash(*), Read, Write, Edit, Glob, Grep, Agent
---

# Fix PR Issues

Read PR review comments and CI failures, fix the code, commit, and push.

## User prompt

$ARGUMENTS

---

## Step 1: Identify the PR and gather all issues

```bash
# Get PR details
gh pr view --json number,title,url,headRefName,baseRefName,body,state

# Get CI check results
gh pr checks

# Get review comments (inline code comments)
gh api repos/{owner}/{repo}/pulls/{number}/comments --jq '.[] | {path: .path, line: .original_line, body: .body, user: .user.login, id: .id}'

# Get PR-level review comments
gh pr view --json reviews --jq '.reviews[] | {state: .state, body: .body, author: .author.login}'

# Get conversation comments
gh api repos/{owner}/{repo}/issues/{number}/comments --jq '.[] | {body: .body, user: .user.login, id: .id}'
```

## Step 2: Categorize issues

Group all issues into:

### CI Failures
```bash
# Get details of failed checks
gh pr checks --json name,status,conclusion,detailsUrl
```

For each failed check:
- Read the check name and conclusion
- If it's a build failure, read the build logs:
  ```bash
  gh run view <run-id> --log-failed
  ```

### Review Comments (code-level)
For each inline review comment:
- Note the file path and line number
- Read the comment content
- Read the surrounding code context

### Review Comments (PR-level)
For each PR-level review:
- Note the reviewer and their state (APPROVED, CHANGES_REQUESTED, COMMENTED)
- Read the comment body

## Step 3: Fix each issue

### For CI failures:
1. Read the error output from the failed check
2. Identify the root cause (compilation error, test failure, lint issue)
3. Fix the source code
4. Verify locally if possible (compile, run tests)

### For review comments:
1. Read the file at the commented line
2. Understand what the reviewer is asking for
3. Apply the fix
4. If the comment is a question (not a change request), prepare a reply

## Step 4: Commit and push

```bash
# Stage changed files (specific files, not -A)
git add <file1> <file2> ...

# Commit with descriptive message referencing the PR
git commit -m "$(cat <<'EOF'
Address PR review comments

- <summary of fix 1>
- <summary of fix 2>
- <summary of fix 3>
EOF
)"

# Push to the PR branch
git push
```

## Step 5: Reply to review comments

For each addressed comment, reply on the PR:

```bash
# Reply to inline review comment
gh api repos/{owner}/{repo}/pulls/{number}/comments/{comment-id}/replies \
  -f body="Fixed — <brief description of what was changed>"

# Or for PR-level comments
gh pr comment <number> --body "Addressed review comments:
- <fix 1>
- <fix 2>"
```

For questions that don't need code changes, reply with an explanation.

## Step 6: Verify

```bash
# Check that the push triggered new CI checks
gh pr checks

# Verify PR is up to date
gh pr view --json commits --jq '.commits[-1].messageHeadline'
```

## Step 7: Report

Output:
- Issues found and fixed (list each)
- Files modified
- Commit SHA
- Comments replied to
- Remaining issues (if any couldn't be fixed automatically)
- Suggest `/pr-watch <number>` to monitor the new CI run
