# GCP Cloud Tasks Queue — Plan

## Entity

| Entity | API | Description |
|--------|-----|-------------|
| `gcp/cloud-tasks-queue` | Cloud Tasks REST v2 | Manage Cloud Tasks queues for HTTP task dispatch |

## API

- **Base URL:** `https://cloudtasks.googleapis.com/v2`
- **Auth:** GCP builtin (`gcp.get()`, `gcp.post()`, etc.)
- **CRUD:** Synchronous (no long-running operations)
- **Queue name format:** `projects/{project}/locations/{location}/queues/{name}`

## Definition Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Queue name |
| `location` | string | yes | GCP region (e.g., us-central1) |
| `max_dispatches_per_second` | number | no | Max dispatch rate (default 500) |
| `max_burst_size` | number | no | Max burst size (default 100) |
| `max_concurrent_dispatches` | number | no | Max concurrent dispatches (default 1000) |
| `max_attempts` | number | no | Max retry attempts (-1 = unlimited, default 100) |
| `min_backoff` | string | no | Min retry backoff (e.g., "0.100s") |
| `max_backoff` | string | no | Max retry backoff (e.g., "3600s") |
| `max_doublings` | number | no | Exponential backoff doublings (default 16) |
| `max_retry_duration` | string | no | Total retry window |
| `log_level` | string | no | Stackdriver log level |

## State Fields

| Field | Type | Description |
|-------|------|-------------|
| `queue_name` | string | Full resource name |
| `queue_state` | string | RUNNING, PAUSED, or DISABLED |

## Actions

| Action | Description |
|--------|-------------|
| `get-info` | Display queue configuration |
| `pause` | Pause task dispatch |
| `resume` | Resume task dispatch |
| `purge-tasks` | Delete all tasks in queue |
| `create-task` | Create HTTP task (args: url, method, body, schedule_time) |
| `list-tasks` | List tasks in queue |
| `get-cost-estimate` | Human-readable cost |
| `costs` | JSON cost for billing |

## Pricing

- $0.40 per million operations (first 1M free)
- Each API call = 1+ operation; tasks chunked at 32KB

## Required Permissions

- `cloudtasks.queues.create`, `.get`, `.update`, `.delete`, `.list`, `.pause`, `.resume`, `.purge`
- `cloudtasks.tasks.create`, `.get`, `.list`
- `monitoring.timeSeries.list` (cost estimation)

## Progress

- [x] Plan — approved 2026-04-08
- [x] Implement — 1 entity, compiled clean
- [x] Tests — 13 test steps covering full lifecycle
- [x] Manual testing — create/ready/actions/delete all pass
- [x] Integration tests — 13/13 passed (95s)
- [ ] PR
- [ ] Merged

## Issues Found

- `purge` is a reserved action name in monk — renamed to `purge-tasks`
- Cloud Tasks queues have a 3-day tombstone after deletion — use unique names in tests
- Test runner `--test-file` mode doesn't set working directory — template load paths must be `input/<pkg>/test/...`
