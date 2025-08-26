# Monk ArrowScript Context

This repository focuses on TypeScript-authored entities compiled by MonkEC into YAML/JS for the Monk runtime. It does not include ArrowScript templates directly.

## What is ArrowScript?

ArrowScript is Monk's higher-level scripting/templating language used to express orchestration logic, data flows, and procedural steps within Monk blueprints. It complements entity-based workflows by enabling:

- Declarative orchestration of steps and dependencies
- Data passing between steps
- Conditional and iterative logic

Refer to the official Monk documentation for complete ArrowScript reference and examples.

## How it relates here

- Entities here are implemented in TypeScript as classes extending `MonkEntity` and compiled with MonkEC.
- Templates (YAML) in `src/*/example.yaml` or `test/stack-template.yaml` bind instances to compiled entities via `defines`.
- If you maintain ArrowScript-based blueprints, you can mix them in your Monk environment alongside compiled entities. Typical patterns include:
  - Use ArrowScript to orchestrate calls to `monk do <namespace/name>/<action>` for entities that expose operational actions via `@action()`.
  - Use stacks (`process-group`) to stage entities and call ArrowScript flows that depend on their readiness.

## Migration notes

- Prefer TypeScript entities for complex integrations requiring type safety, reusable utilities, and testability.
- Keep ArrowScript for orchestration flows or quick procedural logic.
- Gradually move heavy business logic from ArrowScript into entity actions for better reuse and testing.

## Pointers

- See `doc/templates.md` for templates, stacks, and secrets (entity side).
- See `doc/monk-cli.md` for invoking actions with `monk do` from flows.
- See `doc/new-entity-guide.md` to author new entities that your ArrowScript can orchestrate.
