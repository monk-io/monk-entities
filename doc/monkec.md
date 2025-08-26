# Monkec Documentation

Welcome to the Monkec documentation! This directory contains comprehensive guides and examples for using the Monkec entity compiler and its utilities.

## Overview

Monkec is an entity compiler that translates TypeScript entity code into JavaScript and YAML definitions that run on the Monk engine using the Goja runtime.

## Library Components (Pointers)

- Base class typings: `../lib/src/base.d.ts`
- HTTP client: `doc/http-client.md`
- Testing framework: `doc/testing.md`
- Built-in runtime modules: `src/lib/builtins/`

### Lifecycle Hooks

All entities inherit from `MonkEntity` and can override these lifecycle methods:

- `before()` - Called before any action execution (perfect for setup)
- `after()` - Called after action execution (useful for cleanup)
- `create()` - Entity creation/initialization
- `start()` - Start the entity
- `stop()` - Stop the entity
- `update()` - Update the entity
- `delete()` - Clean up and delete the entity
- `checkReadiness()` - Check if entity is ready for operations

Note: Implementing `checkReadiness()` will auto-generate a `checks.readiness` block in the compiled YAML; you can customize polling via a static `readiness` property.

### Utilities

- **HttpClient** - Wraps the builtin `http` module with a clean API
- **Type definitions** - Comprehensive TypeScript interfaces for all components

## Getting Started

### Entity File Structure

Entity source files should follow these conventions:

- **Entity TypeScript file** - Main entity implementation (e.g., `person.ts`)
- **Definition interface** - Immutable configuration properties
- **State interface** - Mutable runtime state properties
- **Entity class** - Extends `MonkEntity<Definition, State>`
- **MANIFEST file** (optional) - Defines namespace and metadata

See `doc/new-entity-guide.md` for a complete authoring example.

### MANIFEST File (Optional)

Include a `MANIFEST` in a module directory to set namespace/metadata. The compiler preserves custom fields and appends `LOAD`/`RESOURCES`.

Example:

```
REPO my-custom-namespace
DESCRIPTION Entities for My Service
AUTHOR your-name
VERSION 1.0.0
TAGS demo,entities
```

### Basic Entity Structure

See the authoring walkthrough in `doc/new-entity-guide.md` for a complete example (definition/state with JSDoc, lifecycle, and actions).

### Compiling and Testing with the Wrapper

Use the repository's wrapper to run the MonkEC Docker image for compile and test:

```bash
# Compile a module
INPUT_DIR=./src/<module>/ OUTPUT_DIR=./dist/<module>/ ./monkec.sh compile

# Test a module
sudo INPUT_DIR=./src/<module>/ ./monkec.sh test --verbose
```

The wrapper mounts input/output directories and the Monk socket/token for tests.

## Authoring and Usage

See these docs:
- `doc/new-entity-guide.md` (authoring)
- `doc/http-client.md` (HTTP)
- `doc/templates.md` (templates, stacks)
- `doc/testing.md` (tests)
- `doc/monk-cli.md` (CLI)

## Further Reading

- Examples: `examples/`
- Built-in module typings: `src/lib/builtins/`

## Build and Test

- Build modules: `./build.sh`
- Compile one: `INPUT_DIR=./src/<module>/ OUTPUT_DIR=./dist/<module>/ ./monkec.sh compile`
- Test a module: `sudo INPUT_DIR=./src/<module>/ ./monkec.sh test --verbose`

### Extending the Library

If you want to add new utilities to the monkec library, see the [Authoring Utilities Guide](./authoring-utilities.md) for comprehensive instructions on creating new utilities that integrate seamlessly with the entity development workflow.

## Best Practices

- See `doc/new-entity-guide.md` for recommended patterns and gotchas.

## API Reference

- [HttpClient](./http-client.md) - Complete HTTP client documentation with examples
- [Authoring Utilities](./authoring-utilities.md) - Guide for creating new utilities in the lib/ directory
- [Built-in Modules](../lib/builtins/) - TypeScript declarations for all runtime modules

 
