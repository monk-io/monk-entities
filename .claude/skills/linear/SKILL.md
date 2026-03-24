---
name: linear
description: Create, update, list, and triage Linear issues. Use when the user mentions Linear issues, tickets, bugs, tasks, triage, or wants to create/update work items. Also triggers on issue IDs like ENG-123 or PRO-456.
argument-hint: "[action] [details] - e.g., 'create ENG bug: login fails on Safari' or 'list ENG started' or 'triage'"
allowed-tools: Bash(*), Read, Write, Glob, Grep, Agent, WebFetch
---

# Linear Issue Management

You manage Linear issues for the monk-io workspace using the `linear` CLI (https://github.com/schpet/linear-cli).

## User request

$ARGUMENTS

---

## Organization Structure

### Teams
| Team | Key | Purpose |
|------|-----|---------|
| Engineering | `ENG` | Core engineering work: integrations, platform, bugs, improvements |
| Product | `PRO` | Product work, external feedback triage, UX research |

### Initiatives (group projects)
| Initiative | Scope |
|------------|-------|
| **Reduce Friction** | UX improvements, error reduction, new/improved integrations |
| **Fix the Funnel** | Telemetry, PostHog dashboards, reporting, process improvements |

### Key URLs
- Engineering board: https://linear.app/monk-io/team/ENG/all
- Product board: https://linear.app/monk-io/team/PRO/all
- Triage inbox: https://linear.app/monk-io/team/PRO/triage
- Release QA: https://linear.app/monk-io/project/release-qa-testing-95ec5480cfa8

### Workflow
- External issues (Featurebase, Slack, in-product bug reports) land in **PRO triage**
- AI dedupe runs on triage automatically
- You (Claude) primarily work on **ENG** but can view and triage **PRO** issues too
- Bugs noticed during testing go to triage (manually or via `/linear` in Slack threads)
- After each release, QA test suggestions go to the Release QA Testing project

---

## CLI Reference

### Prerequisites
Ensure `linear` CLI is installed and authenticated:
```bash
# Check if installed
which linear || echo "Install with: brew install schpet/tap/linear"

# Check auth
linear auth whoami
```

### Creating Issues

Think before creating:
1. **Which team?** ENG for engineering work, PRO for product/external feedback
2. **Which project?** Match to an existing project under the right initiative
3. **Write a clear title** — imperative, specific, actionable
4. **Write a useful description** — context, acceptance criteria, reproduction steps for bugs

```bash
# Basic issue
linear issue create --team ENG -t "Title here" -d "Description here"

# Full issue with project, priority, labels, assignee
linear issue create --team ENG \
  -t "Fix login timeout on Safari" \
  --description-file /tmp/desc.md \
  -p 2 \
  -l bug \
  --project "Project Name" \
  -a self

# For longer descriptions, write to a temp file first
cat > /tmp/desc.md << 'EOF'
## Problem
Users on Safari experience login timeouts after 30s.

## Steps to Reproduce
1. Open Safari 17+
2. Navigate to login page
3. Enter credentials
4. Wait — timeout after 30s

## Expected
Login completes within 5s.

## Acceptance Criteria
- [ ] Login works on Safari 17+
- [ ] No timeout under normal conditions
EOF
linear issue create --team ENG -t "Fix login timeout on Safari" --description-file /tmp/desc.md -p 2 -l bug
```

**Priority scale:** 1=urgent, 2=high, 3=medium, 4=low
**Assignee:** `self` for current user, or a name/username
**Multiple labels:** repeat `-l`: `-l bug -l frontend`

### Updating Issues

```bash
# Change state
linear issue update ENG-123 -s "In Progress"

# Change priority and add label
linear issue update ENG-123 -p 1 -l urgent

# Reassign
linear issue update ENG-123 -a "username"

# Update description from file
linear issue update ENG-123 --description-file /tmp/updated.md
```

### Listing Issues

```bash
# Your unstarted issues (default)
linear issue list --team ENG

# Started issues
linear issue list --team ENG -s started

# All states, all assignees
linear issue list --team ENG --all-states -A

# Filter by project
linear issue list --team ENG --project "Project Name"

# Triage queue
linear issue list --team PRO -s triage

# By priority
linear issue list --team ENG --sort priority -s started -s unstarted
```

### Viewing Issues

```bash
linear issue view ENG-123
linear issue view ENG-123 --json     # structured output
linear issue url ENG-123             # get URL
```

### Comments

```bash
# Add comment
linear issue comment add ENG-123 -b "Comment text"

# From file (preferred for longer comments)
linear issue comment add ENG-123 --body-file /tmp/comment.md

# List comments
linear issue comment list ENG-123
```

### Relations

```bash
linear issue relation add ENG-123 blocks ENG-456
linear issue relation add ENG-123 related ENG-456
linear issue relation add ENG-123 blocked-by ENG-100
```

### Projects and Teams

```bash
linear project list                    # list all projects
linear team list                       # list all teams
linear team members ENG                # list ENG team members
linear initiative list                 # list initiatives
```

### Search (via GraphQL)

```bash
linear api --variable term="search text" <<'GRAPHQL'
query($term: String!) {
  searchIssues(term: $term, first: 20) {
    nodes { identifier title state { name } team { key } }
  }
}
GRAPHQL
```

---

## Guidelines for Issue Quality

### Titles
- Use imperative mood: "Fix X", "Add Y", "Update Z"
- Be specific: "Fix entity readiness timeout for Azure PostgreSQL" not "Fix bug"
- Include the component/area when relevant

### Descriptions
For **bugs:**
- Problem statement
- Steps to reproduce
- Expected vs actual behavior
- Environment details if relevant
- Acceptance criteria as checklist

For **features/improvements:**
- Context / motivation
- Proposed solution (brief)
- Acceptance criteria as checklist
- Links to related issues

For **integration tasks:**
- Provider and resource types
- API documentation links
- Priority and scope

### Project Assignment
- **New/improved integrations** → find or create a project under "Reduce Friction"
- **UX improvements, error handling** → project under "Reduce Friction"
- **Telemetry, dashboards, reporting** → project under "Fix the Funnel"
- **QA bugs found during testing** → PRO triage (will be triaged by Ivan)
- When unsure, ask the user which project fits

---

## Common Workflows

### Triage PRO issues
```bash
# View triage queue
linear issue list --team PRO -s triage -A

# View a specific issue
linear issue view PRO-123

# Move to ENG with proper categorization
linear issue update PRO-123 --team ENG --project "Project Name" -s "Backlog"
```

### Create issue from current work
When you find a bug or improvement opportunity while coding:
```bash
# Quick bug report
linear issue create --team ENG -t "Brief title" -d "Found while working on X: description" -l bug -p 3

# Or add to triage for later prioritization
linear issue create --team PRO -t "Brief title" -d "Description" -s triage
```

### Link issue to branch
```bash
# Start work on an issue (creates branch, marks started)
linear issue start ENG-123

# Get issue ID from current branch
linear issue id
```
