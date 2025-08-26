# Monk CLI Quick Reference

This guide summarizes common Monk CLI commands used while developing and testing MonkEC entities.

## Loading Repos and Templates

- Load compiled repo MANIFEST from a module directory:
  - `cd dist/<module>/ && monk load MANIFEST`
- Load a specific template file:
  - `monk load path/to/template.yaml`
- List loaded templates:
  - `monk ls`
- Dump a template/entity YAML:
  - `monk dump namespace/name`

## Running and Managing Entities

- Start or update an instance:
  - `monk update namespace/name`
- Stop an instance:
  - `monk stop namespace/name`
- Delete an instance:
  - `monk delete --force namespace/name`
- Show running processes:
  - `monk ps -a`
- Describe instance (state and checks):
  - `monk describe namespace/name`

## Actions

- Run a custom or built-in action with arguments:
  - `monk do namespace/name/<action> [key=value ...]`
  - Examples:
    - `monk do my-app/my-entity/get-info`
    - `monk do my-app/my-entity/backup backupId=abc123`

## Secrets

- Grant access in a template using `permitted-secrets`:
  - ```
    my-entity:
      defines: myns/my-entity
      permitted-secrets:
        api-token: true
    ```
- Add a global secret:
  - `monk secrets add -g api-token='secret'`
- Add a secret scoped to an entity:
  - `monk secrets add -r namespace/name api-token='secret'`
- List secrets:
  - `monk secrets list`

## Stacks (Process Groups)

- Define a stack in a template:
  - ```
    stack:
      defines: process-group
      runnable-list:
        - ns/a
        - ns/b
    ```
- Start a stack by updating each member:
  - `monk update ns/a && monk update ns/b`

## Errors and Debugging

- Decode Monk base64 error strings:
  - `echo '<error>' | monk decode-err`
- Verbose engine logs (depends on environment):
  - `monk logs namespace/name` (if available)

## Tips

- Use absolute names in the form `namespace/name`.
- After changing compiled artifacts, re-`monk load` the `MANIFEST`.
- Prefer `monk do` for ad-hoc operations implemented via `@action()`.
