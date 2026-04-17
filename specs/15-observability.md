# Observability

## Purpose

When something is worth observing, the system must record it in a form a human or a machine can read later — reliably, without losing the context needed to diagnose. This document specifies the logging contract, the error-propagation contract, and the minimal health/metrics surface. It complements `NFR-OBS-*` in `05-non-functional.md` with operational detail.

## Principles

- **Log when there is something to observe.** Every state-changing request, every background job outcome, every error. Routine read requests may be logged at a lower level or sampled.
- **Logs are structured.** They are consumed by humans and by tools. Both need machine-readable fields.
- **Errors are never silently swallowed.** An error must either be handled explicitly (with a log line recording the decision) or propagated to a boundary where it becomes a user-visible message.
- **Trace errors end-to-end.** A `request_id` connects the user's toast to the server log line to the underlying stack trace.

## Structured logging

### Format

- **FR-OBS-001**: The server emits logs as **one JSON object per line** (NDJSON / JSONL). Multi-line stack traces are serialized into a single `stack` string field.
- **FR-OBS-002**: Every log line must include the following fields:
  - `ts` — ISO 8601 UTC timestamp with millisecond precision, ending in `Z`.
  - `level` — one of `trace`, `debug`, `info`, `warn`, `error`.
  - `msg` — short human-readable message.
  - `event` — stable machine-readable event name in `snake_case` (e.g., `item_created`, `backup_completed`, `auth_rejected_not_applicable`).
  - `service` — logical service name (e.g., `server`, `backup_worker`).
  - `app_name` — the `APP_NAME` configured in `14-developer-experience.md`, so logs from concurrent instances can be disambiguated.
- **FR-OBS-003**: When the log line is produced in the context of a request, it must also include:
  - `request_id` — opaque unique id (see `FR-API-007`).
  - `method`, `path`, `status` — HTTP method, path, status (for request-complete lines only).
  - `duration_ms` — request handling duration in milliseconds.
- **FR-OBS-004**: Additional context is added as top-level fields, not stuffed into `msg`. Field names are `snake_case`.
- **FR-OBS-005**: Sensitive values must never be logged: uploaded photo bytes, raw file paths of user photos (log the `photo_id` instead), and the full `notes` field (log its length only if needed). Item names, types, and location names **may** be logged because the system has no authentication and these are not secrets.

### Levels

- **FR-OBS-010**: The log level is configurable via `LOG_LEVEL` (see `14-developer-experience.md`). Default: `info`.
- **FR-OBS-011**: Level usage:
  - `trace`: very verbose, off by default; per-query timings, per-field validation traces.
  - `debug`: developer diagnostics, off by default in deployments.
  - `info`: normal operations — request completion, state changes, scheduled-job outcomes.
  - `warn`: recoverable anomalies — validation failures, conflict retries, misconfiguration with a sensible fallback, public-bind-address warning (`NFR-SEC-002`).
  - `error`: a request or job failed in a way that warrants attention — unhandled exceptions, backup failures (`FR-BACKUP-006`), restore rollbacks, checksum mismatches.
- **FR-OBS-012**: A request that returns a 4xx validation error is logged at `warn` (not `error`) with the error code; 5xx responses are logged at `error`.

### Events required

The following events must be emitted at `info` or higher. Names are stable — monitoring and dashboards can rely on them.

| Event | When | Level | Required fields |
|---|---|---|---|
| `http_request_completed` | Every HTTP response. | `info` (2xx/3xx), `warn` (4xx), `error` (5xx) | standard + `status`, `duration_ms` |
| `server_startup` | Server has bound and is ready. | `info` | `bind_address`, `schema_version`, `app_version` |
| `public_bind_warning` | Bind address looks publicly routable. | `warn` | `bind_address` |
| `item_created` | POST /items success. | `info` | `item_id`, `item_type_id`, `storage_location_id` |
| `item_deleted` | DELETE /items success. | `info` | `item_id` |
| `quantity_changed` | Any quantity mutation. | `info` | `item_id`, `delta`, `new_quantity`, `reason` |
| `type_merged` | Type merge success. | `info` | `source_type_id`, `target_type_id`, `moved_count` |
| `plan_edit_committed` | Floor-plan edit session applied. | `info` | `room_changes`, `location_changes` |
| `photo_uploaded` | Photo persisted. | `info` | `photo_id`, `owner_kind`, `owner_id`, `mime_type`, `size_bytes` |
| `photo_rejected` | Photo upload rejected. | `warn` | `reason_code`, `declared_mime`, `size_bytes` |
| `backup_started` | Backup run began. | `info` | `trigger` (`scheduled` \| `manual`) |
| `backup_completed` | Backup run finished successfully (including verification). | `info` | `backup_id`, `size_bytes`, `entity_counts`, `checksum` |
| `backup_failed` | Backup run failed. | `error` | `trigger`, `phase`, `error_code`, `stack` |
| `restore_started` | Restore initiated. | `info` | `backup_id`, `pre_restore_snapshot_id` |
| `restore_completed` | Restore finished. | `info` | `backup_id` |
| `restore_rolled_back` | Restore failed and rolled back. | `error` | `backup_id`, `phase`, `error_code`, `stack` |
| `conflict_stale_update` | Stale `updated_at` rejected. | `warn` | `entity`, `entity_id` |

- **FR-OBS-020**: The list above is a minimum; new events may be added. Existing event names are stable contracts — renames require a deprecation cycle.
- **FR-OBS-021**: Read requests (GETs) must emit only `http_request_completed`; they must not emit domain-event lines like `item_read`.

### Log output and rotation

- **FR-OBS-030**: Logs are written to `stdout` by default. A file sink with size-based rotation is offered as a configuration option (`LOG_FILE_PATH`, rotation at 50 MB × 10 files, matching `NFR-OBS-003`).
- **FR-OBS-031**: In containerized deployments (`14-developer-experience.md`), `stdout` is the only required sink; the container runtime handles persistence.
- **FR-OBS-032**: No external log sink (syslog over the network, cloud log services) is used in v1. This preserves the privacy posture (`NFR-PRIV-002`).

## Error propagation

- **FR-OBS-040**: Every error raised within a request handler must be caught at the boundary and converted into the standard error model (`08-api.md`). Unhandled exceptions that escape are bugs.
- **FR-OBS-041**: The server must not return stack traces, framework internals, or database error text to the client. The client-visible error has `code`, `message`, optional `fields`, and `request_id`. Full detail (including `stack`) lives only in server logs.
- **FR-OBS-042**: The `request_id` returned in the error body must match the one logged with `http_request_completed` and with any intermediate error line, so a user's report ("something broke at 14:32, request id 01HE…") maps directly to log entries.
- **FR-OBS-043**: Client-visible error messages must be human-readable, action-guiding, and free of developer jargon ("Can't reach Sophie-keep at `sophie.local`", not "ECONNREFUSED").
- **FR-OBS-044**: Errors that originate inside nested operations (e.g., photo thumbnail generation failing during an item create) must be propagated with enough context that the top-level handler can decide the correct response. Wrapping is preferred — each layer adds context rather than obscuring the origin.
- **FR-OBS-045**: Partial-failure cases (e.g., confirm-restock where 3 of 4 items succeeded, `FR-SHOP-013`) must be reported as a structured response listing per-item outcomes; they must **not** be logged as a single success or a single failure.
- **FR-OBS-046**: Background-job errors (daily backup, thumbnail worker) are **never** silently dropped. They must:
  - Log at `error` with the event names above.
  - Cause the UI to surface a visible signal the next time a client connects (e.g., the banner in `FR-UI-112`).

## Client-side error surfacing

- **FR-OBS-050**: Unexpected client-side errors (JS exceptions, network failures) must render as non-blocking toasts with the `request_id` (when available) and a copy-to-clipboard affordance, per `FR-UI-111`.
- **FR-OBS-051**: Validation errors returned from the server must render inline next to the offending field when the `fields` map is present (per `09-validation-and-errors.md`); otherwise as a toast.
- **FR-OBS-052**: Network failures must render a distinct message identifying the likely cause (server unreachable) rather than a generic "something went wrong".

## Health and metrics

- **FR-OBS-060**: `GET /api/v1/health` (per `08-api.md`) returns a JSON document with:
  - `status` — `ok` or `degraded`.
  - `schema_version` — the DB schema version.
  - `app_version` — the server's build identifier.
  - `last_backup` — `{ id, completed_at, status }` for the most recent backup attempt (succeeded or failed).
  - `uptime_seconds`.
- **FR-OBS-061**: `status: degraded` is returned when any background subsystem is in a persistently-failing state (e.g., last backup failed). It must not be returned for transient conditions.
- **FR-OBS-062**: A minimal metrics surface is maintained in process memory and exposed at `GET /api/v1/metrics` (JSON): counters per event above, per-route request counts, p50/p95 latency per route. No external metrics sink is configured in v1.

## Acceptance Criteria

- **AC-OBS-001**: **Given** a `POST /api/v1/items` request that succeeds, **when** the server's logs are inspected, **then** there is exactly one `item_created` line and exactly one `http_request_completed` line, both with the same `request_id`.
- **AC-OBS-002**: **Given** an upload of a 15 MB PNG, **when** the server responds, **then** a `photo_rejected` line at `warn` is logged with `reason_code=payload_too_large` and the client receives an error body with a `request_id` matching the log line.
- **AC-OBS-003**: **Given** an unhandled exception in a handler, **when** the server responds to the client, **then** the response body has `code=INTERNAL_ERROR` with a generic message and a `request_id`; the server log contains an `error`-level line with the full `stack` and the same `request_id`.
- **AC-OBS-004**: **Given** a daily backup fails at the verification step, **when** the run ends, **then** a `backup_failed` line is logged at `error` with the phase `verify`, and the next client load shows the banner from `FR-UI-112`.
- **AC-OBS-005**: **Given** `LOG_LEVEL=warn`, **when** routine requests complete with 2xx, **then** no `info`-level lines are emitted.
- **AC-OBS-006**: **Given** two concurrent local instances with different `APP_NAME` values, **when** logs from both are collected, **then** lines can be filtered by the `app_name` field to isolate one instance.
- **AC-OBS-007**: **Given** a client-side network failure reaching the server, **when** the UI responds, **then** a toast states that Sophie-keep cannot be reached (not a generic error), with a Retry affordance.
- **AC-OBS-008**: **Given** a confirm-restock where one of four items' updates fails, **when** the server responds, **then** the response lists per-item outcomes (3 success, 1 failure), and server logs contain one `error` line for the failed item plus `quantity_changed` lines for the three that succeeded.

## Dependencies

- API error model: `08-api.md` (standard error body, `request_id`).
- NFR baselines: `05-non-functional.md` (`NFR-OBS-001`..`NFR-OBS-003`, `NFR-PRIV-002`).
- UI surfacing: `06-ui.md` (`FR-UI-110`..`FR-UI-112`).
- Config: `14-developer-experience.md` (`LOG_LEVEL`, `APP_NAME`).

## Open Questions

- `OI-023`: Whether to add OpenTelemetry emission (OTLP to a local collector) as an opt-in. Parked — v1 sticks to stdout JSON logs to keep the stack minimal.
- `OI-024`: Whether the metrics endpoint should expose Prometheus text format in addition to JSON. Parked.
