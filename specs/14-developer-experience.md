# Developer Experience

## Purpose

A developer should be able to clone the repo, run one command, and have Sophie-keep running locally — without name clashes with any other Sophie-keep instance already running on the same machine. This document specifies the local-deployment contract: docker compose layout, environment variables, naming discipline, and common commands.

## Guiding principles

- **One command to run the system.** The documented command in the repo README must bring up a working local instance with sensible defaults.
- **Split concerns across compose files.** External/stateful dependencies sit in one compose file; the application sits in another. A developer working on the app can restart it without restarting dependencies.
- **No hard-coded names or ports.** Everything a second instance could collide on must be parameterized.
- **`.env` is the single source of configuration for local runs.** Developers edit one file to spin up a parallel environment.

## Compose file layout

The repository root (or a dedicated `deploy/` folder) must contain at least:

```
compose.deps.yml       # External dependencies (database, anything stateful)
compose.app.yml        # The Sophie-keep application service(s)
compose.yml            # Optional convenience file that includes both
.env.example           # Documented template (committed)
.env                   # Developer-edited, git-ignored
```

- **FR-DX-001**: `compose.deps.yml` must declare only services that are **external to the application codebase** — typically the database and any future stateful backing services (e.g., a search-index service if added). It must not declare the Sophie-keep server or web services.
- **FR-DX-002**: `compose.app.yml` must declare the Sophie-keep services (server, and web if served separately). It must not duplicate the dependency services.
- **FR-DX-003**: Running `docker compose -f compose.deps.yml -f compose.app.yml up` must bring up a complete local system. The root `compose.yml` (if provided) must be a convenience that includes both.
- **FR-DX-004**: A developer must be able to restart the application (`-f compose.app.yml`) without restarting dependencies, and vice versa.

## Environment variables

All runtime and naming parameters must be surfaced through environment variables, read by docker compose from `.env` (or from the shell). The minimum set:

| Variable | Purpose | Example default | Required |
|---|---|---|---|
| `APP_NAME` | Prefix for container names, volume names, network name. | `sophie-keep` | yes |
| `APP_PORT` | Host port mapped to the app's HTTP listener. | `8080` | yes |
| `DB_PORT` | Host port mapped to the database (if remotely accessible in dev). | `5432` | no |
| `APP_BIND_ADDRESS` | Interface the server binds inside the container. | `0.0.0.0` | yes |
| `PHOTO_ROOT` | Host path bind-mounted into the server for photo storage. | `./data/photos` | yes |
| `BACKUP_ROOT` | Host path bind-mounted for backup files. | `./data/backups` | yes |
| `DB_VOLUME` | Named volume for database data. | `${APP_NAME}-db-data` | yes |
| `TZ` | Timezone for the server container. | `UTC` | yes |
| `LOG_LEVEL` | Log level — `debug`, `info`, `warn`, `error`. | `info` | yes |
| `EXPIRING_SOON_WINDOW_DAYS` | Initial default expiring-soon window. | `7` | no |
| `BACKUP_TIME` | Daily backup local time. | `03:00` | no |

- **FR-DX-010**: Every port, volume name, and container name referenced in compose files must be a variable resolved from `.env`. No bare literals like `8080:8080` or `container_name: sophie-server`.
- **FR-DX-011**: `.env.example` must be committed and document every variable with a comment. `.env` must be gitignored.
- **FR-DX-012**: Missing required variables must cause compose to fail fast with a clear message (use compose's default-or-empty operator only for optional variables).

## Naming discipline (for concurrent instances)

To allow two or more environments on a single machine without collision:

- **FR-DX-020**: Every compose service must set `container_name: ${APP_NAME}-<role>` (e.g., `${APP_NAME}-server`, `${APP_NAME}-db`). Never rely on compose's default naming, which also changes with the project directory.
- **FR-DX-021**: Volumes must be named `${APP_NAME}-<role>-data` (e.g., `${APP_NAME}-db-data`). External, unnamed volumes are disallowed.
- **FR-DX-022**: Compose networks must be named `${APP_NAME}-net`. Services reach each other via container name on this network; **service-to-service ports are not published to the host**.
- **FR-DX-023**: Only ports a developer needs from the host (the app port, optionally the DB port for debugging) are published. Publishing is always `${APP_PORT}:<internal-port>` so the host side is configurable.
- **FR-DX-024**: Bind-mounted host paths (`PHOTO_ROOT`, `BACKUP_ROOT`) must be configurable per instance and must default to paths under the project directory so two checkouts don't share data.
- **FR-DX-025**: The compose **project name** must be set from `APP_NAME` (e.g., `COMPOSE_PROJECT_NAME=${APP_NAME}` in `.env`) so `docker compose ls` distinguishes parallel environments clearly.

## Running concurrent environments

- **FR-DX-030**: Two developers on the same machine (or one developer running two instances) must be able to bring up both by:
  1. Cloning the repo to two directories.
  2. Setting different `APP_NAME`, `APP_PORT`, `DB_PORT`, `PHOTO_ROOT`, `BACKUP_ROOT` in each `.env`.
  3. Running the standard up command in each.
- **FR-DX-031**: Tearing down one instance must not affect the other — names, networks, and volumes are fully namespaced by `APP_NAME`.

## Common developer commands

The repo must provide scripts or make targets (developer's choice of tool; naming below is illustrative) documented in the root README:

- `dev up` — brings up deps + app.
- `dev down` — stops everything in the current `APP_NAME` project.
- `dev down --volumes` — also removes the DB and backup volumes (destructive; explicit flag).
- `dev logs <service>` — tails logs.
- `dev restart-app` — restarts only the app service(s) without touching deps.
- `dev db-shell` — opens a shell into the database container.
- `dev seed <scenario>` — runs the seed helper (see `13-testability.md`).
- `dev migrate` — applies pending migrations.
- `dev backup-now` — triggers a manual backup via the running server.

- **FR-DX-040**: Each documented command must work from a freshly-cloned repo after `cp .env.example .env` and editing any required values.
- **FR-DX-041**: Commands that are destructive must require an explicit flag (`--volumes`, `--force`).

## First-run flow

- **FR-DX-050**: On first `dev up` after clone, the server must run migrations automatically (`FR-DATA-005`), so the app is reachable at `http://localhost:${APP_PORT}` without extra steps.
- **FR-DX-051**: If the database is empty, the server must come up with an empty household (no items, no rooms); seeding is optional and explicit.

## Documentation requirements

- **FR-DX-060**: The root `README.md` must contain a **Quick start** section listing: prerequisites (Docker), the clone command, the `.env` copy step, and the single up command.
- **FR-DX-061**: `.env.example` must be self-documenting — each variable has a comment line above it.
- **FR-DX-062**: Every subproject's README must document how to run its tests (see `13-testability.md`).

## Acceptance Criteria

- **AC-DX-001**: **Given** a fresh clone with `cp .env.example .env` and no edits, **when** the developer runs the single documented up command, **then** the Sophie-keep UI is reachable at `http://localhost:${APP_PORT}` and the Dashboard loads.
- **AC-DX-002**: **Given** one instance is running with `APP_NAME=sophie-a, APP_PORT=8080`, **when** a second clone runs with `APP_NAME=sophie-b, APP_PORT=8081` and different bind-mount paths, **then** both instances are reachable concurrently and `docker compose ls` shows two distinct projects.
- **AC-DX-003**: **Given** a running instance, **when** the developer runs `dev restart-app`, **then** only the application container(s) restart; the database and its volume are untouched.
- **AC-DX-004**: **Given** required env vars are missing, **when** compose is invoked, **then** it fails with an error naming the missing variable, not a cryptic port collision.
- **AC-DX-005**: **Given** a running instance, **when** the developer runs `dev down` followed by `dev up`, **then** inventory data persists across the restart (named DB volume preserved).
- **AC-DX-006**: **Given** a developer reviews `compose.deps.yml`, **when** they run it alone (`docker compose -f compose.deps.yml up`), **then** only dependencies start and the app does not.

## Dependencies

- Data and storage conventions: `07-data-and-storage.md` (photo root, backup root, schema migrations).
- Testability: `13-testability.md` (e2e `SOPHIE_E2E_BASE_URL` points at `http://localhost:${APP_PORT}` in the default flow).
- Observability: `15-observability.md` (`LOG_LEVEL`, log format).

## Open Questions

- `OI-021`: Whether to offer a non-Docker dev path (direct `npm run dev` / native run) as a supported alternative. v1: Docker is the documented path. Parked.
- `OI-022`: Whether to provide a `compose.prod.yml` with hardened defaults. Deferred until deployment patterns emerge.
