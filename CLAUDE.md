# monk-entities

TypeScript-based entity integration framework for the Monk platform. Each package under `src/` implements cloud resource management (AWS, Azure, GCP, DigitalOcean, SaaS providers) using the MonkEC compiler.

## Project structure

```
src/<package>/          # Entity source code (TypeScript)
dist/<package>/         # Compiled output (YAML + JS) — do not edit
doc/                    # Conventions, guides, reference docs
.claude/skills/         # Claude Code skills for entity development pipeline
```

## Key commands

```bash
# Compile a package
INPUT_DIR=./src/<package>/ OUTPUT_DIR=./dist/<package>/ ./monkec.sh compile

# Build all packages
./build.sh

# Run integration tests (requires sudo for daemon socket)
sudo INPUT_DIR=./src/<package>/ ./monkec.sh test --verbose

# Monk CLI (requires sudo, use -l for local)
sudo monk load dist/<package>/MANIFEST
sudo monk load src/<package>/test/stack-template.yaml
sudo monk run -l <namespace>/<entity>
sudo monk do <namespace>/<entity>/<action>
sudo monk delete --force <namespace>/<entity>
sudo monk ps
sudo monk describe <namespace>/<entity>
sudo monk cluster providers    # verify cloud credentials
```

## Entity development skills

Use these skills for the full integration development pipeline:

| Skill | Purpose |
|-------|---------|
| `/entity-plan` | Research API and produce PLAN.md |
| `/entity-implement` | Write code and compile |
| `/entity-write-tests` | Generate test files from source |
| `/entity-test` | Manual testing against monk daemon |
| `/entity-test-integration` | Automated monkec test runner |
| `/entity-new` | Orchestrator: all of the above |

## Critical conventions

- **MANIFEST REPO line**: must be just the package name (e.g., `REPO aws-route53`), not a URL
- **Reserved property names**: never use `description` or `type` in Definition/State interfaces
- **Cloud builtins** (aws/azure/gcp): use `aws.get()`/`.post()`/etc., NOT `.do()` — `.do()` throws on errors losing the response body
- **All monk commands need `sudo`** and `monk run` needs `-l` flag
- **Integration tests**: use `run` action with `args: tag: "local"` (not `run` on groups)
- **Entity dependencies**: wire with `connection-target("name") entity-state get-member("field")` + `service: default`
- **Cost actions**: every billable entity needs `get-cost-estimate` (human-readable) and `costs` (JSON for billing)

## Key docs

- `doc/entity-conventions.md` — naming, Definition/State patterns
- `doc/scaffold.md` — canonical entity template
- `doc/new-entity-guide.md` — end-to-end authoring workflow
- `doc/common-issues.md` — known pitfalls and fixes
- `doc/testing.md` — test framework reference
- `doc/http-client.md` — HttpClient API
- `doc/cost-estimation.md` — pricing API patterns per provider
