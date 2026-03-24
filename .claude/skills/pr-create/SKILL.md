---
name: pr-create
description: Create a GitHub pull request linked to Linear issues. Auto-detects related issues from branch name and commits, generates a structured PR description, pushes the branch, creates the PR, and updates Linear issue status. Use when the user wants to create a PR, submit work for review, or says "create PR".
argument-hint: "[issue-id] [options] - e.g., 'ENG-125' or 'ENG-125 ENG-136 --draft'"
allowed-tools: Bash(*), Read, Glob, Grep, Agent
---

# Create Pull Request

Create a GitHub PR linked to Linear issues, with auto-detection of related issues and structured description.

## User prompt

$ARGUMENTS

---

## Step 1: Analyze current state

```bash
# Current branch
git branch --show-current

# Check for uncommitted changes
git status

# Diff against main (staged + unstaged)
git diff main...HEAD --stat

# Recent commits on this branch (not on main)
git log main..HEAD --oneline

# Full diff for PR description
git diff main...HEAD
```

If there are uncommitted changes, warn the user and ask if they want to commit first (suggest `/commit`).

## Step 2: Identify Linear issues

Try these in order:

### A. From user prompt
If the user provided issue IDs (e.g., `ENG-125`, `PRO-456`), use those.

### B. From branch name
Parse the branch name for patterns like `eng-125-*`, `pro-456-*`, or just `ENG-125`:
```bash
git branch --show-current | grep -oiE '(ENG|PRO)-[0-9]+'
```

### C. From commit messages
Search recent commit messages for Linear issue references:
```bash
git log main..HEAD --format="%s %b" | grep -oiE '(ENG|PRO)-[0-9]+' | sort -u
```

### D. Ask the user
If no issues found, ask which Linear issue(s) to link.

### E. Fetch issue details
For each issue ID, fetch the title and current status:
```bash
linear issue view <ISSUE-ID> --json
```

## Step 3: Generate PR title and description

### Title format
```
<ISSUE-ID>: <issue title or concise summary>
```
If multiple issues: use the primary issue ID, mention others in description.
Keep under 70 characters.

### Description format
```markdown
## Summary
<1-3 bullet points describing what changed and why>

## Linear Issues
- [<ISSUE-ID>](https://linear.app/monk-io/issue/<ISSUE-ID>) — <issue title>
- [<ISSUE-ID>](https://linear.app/monk-io/issue/<ISSUE-ID>) — <issue title>

## Changes
<grouped list of files changed, organized by area>

## Test plan
- [ ] <what was tested or needs testing>
```

### Content rules
- **Summary**: focus on the "why", not the "what" — the diff shows what changed
- **Linear Issues**: link each issue with full URL so Linear auto-links the PR
- **Changes**: group by area (e.g., "Entity code", "Skills", "Tests", "Config")
- **Test plan**: include what was tested and what still needs testing

## Step 4: Push and create PR

```bash
# Ensure branch is pushed to remote
git push -u origin <branch-name>

# Create PR using gh CLI
gh pr create --title "<title>" --body "$(cat <<'EOF'
<description>
EOF
)"
```

If the user specified `--draft`, add `--draft` flag.

Set the base branch to `main` unless the user specifies otherwise.

## Step 5: Update Linear issues

For each linked issue, move to "In Review" status and add a comment with the PR URL:

```bash
# Update status
linear issue update <ISSUE-ID> -s "In Review"

# Add comment with PR link
linear issue comment add <ISSUE-ID> -b "PR created: <PR-URL>"
```

## Step 6: Report

Output:
- PR URL
- Issues linked and their new status
- Any warnings (uncommitted changes, missing issues, etc.)

## Options

- `--draft` — create as draft PR
- `--no-linear-update` — skip updating Linear issue status
- `--base <branch>` — set base branch (default: main)
