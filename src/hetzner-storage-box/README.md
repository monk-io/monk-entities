# Hetzner Storage Box Entity Package

Manages Hetzner Storage Boxes via the Hetzner Robot API (`api.hetzner.com/v1`).

> **Note:** Storage Boxes use the Robot API, not the Cloud API. Configure the Monk Hetzner provider with Robot API credentials.

## Entities

### `hetzner-storage-box/storage-box`

Creates and manages a Hetzner Storage Box. Adopts a pre-existing box by name if one already exists.

Definition:

```ts
interface StorageBoxDefinition {
  name: string;                    // Storage box name
  storage_box_type: string;        // bx11 | bx21 | bx31 | bx41 | bx61
  location: string;                // fsn1 | nbg1 | hel1
  password: string;                // Initial access password
  ssh?: boolean;                   // Enable SSH/SFTP (default: true)
  samba?: boolean;                 // Enable Samba/CIFS (default: false)
  webdav?: boolean;                // Enable WebDAV (default: false)
  external_reachability?: boolean; // Enable external reachability (default: false)
  labels?: Record<string, string>; // Key-value labels
}
```

State:

```ts
interface StorageBoxState {
  id?: number;          // Numeric storage box ID
  username?: string;    // Login username, e.g. u123456
  server?: string;      // Hostname, e.g. u123456.your-storagebox.de
  status?: string;      // active | initializing | ...
  name?: string;        // Storage box name
  disk_size_gb?: number;
  existing?: boolean;   // true if adopted (pre-existing), not deleted on monk delete
}
```

Storage box types:

| Type  | Capacity |
|-------|----------|
| bx11  | 1 TB     |
| bx21  | 2 TB     |
| bx31  | 5 TB     |
| bx41  | 10 TB    |
| bx61  | 20 TB    |

Locations: `fsn1` (Falkenstein), `nbg1` (Nuremberg), `hel1` (Helsinki).

Actions:

- `info` — print current box details (name, status, server, username, disk usage, access settings)
- `list-snapshots` — list all snapshots
- `create-snapshot` — create a snapshot (`--label=<name>` optional)
- `reset-password` — reset access password (`--password=<new_password>`)
- `list-subaccounts` — list sub-accounts
- `create-subaccount` — create a sub-account (`--password=<password>`, `--homedirectory=<path>` optional)

Readiness: polls `GET /storage_boxes/{id}` every 10 s (initial delay 5 s, up to 20 attempts) until `status == "active"`.

Deletion policy: boxes adopted at creation (`state.existing = true`) are never deleted on `monk delete`. Fresh boxes are deleted via the API.

## Secrets

Configure the Monk Hetzner provider with your Robot API token before running:

```bash
monk cluster providers add hetzner --token <ROBOT_API_TOKEN>
```

Generate a Robot API token in the [Hetzner Robot panel](https://robot.hetzner.com/preferences/index) under **Settings → API token**.

## Example template

See `src/hetzner-storage-box/example.yaml`:

```yaml
namespace: hetzner-storage-box-example

my-box:
  defines: hetzner-storage-box/storage-box
  name: monk-storage-box
  storage_box_type: bx11
  location: fsn1
  password: ChangeMe123!
  ssh: true
  samba: false
  webdav: false
  external_reachability: false
  services:
    data:
      protocol: custom
```

```bash
monk load dist/hetzner-storage-box/MANIFEST
monk load src/hetzner-storage-box/example.yaml
monk run -l hetzner-storage-box-example/my-box
monk do  hetzner-storage-box-example/my-box/info
monk do  hetzner-storage-box-example/my-box/list-snapshots
monk do  hetzner-storage-box-example/my-box/create-snapshot --label=my-snapshot
monk do  hetzner-storage-box-example/my-box/reset-password --password=NewPass456!
monk do  hetzner-storage-box-example/my-box/list-subaccounts
monk delete hetzner-storage-box-example/my-box
```

## Build

```bash
INPUT_DIR=./src/hetzner-storage-box/ OUTPUT_DIR=./dist/hetzner-storage-box/ ./monkec.sh compile
```
