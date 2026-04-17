# Sophie-keep

Household inventory management — a responsive web app for a single household on its LAN.

See [`specs/`](./specs/README.md) for the authoritative specification.

## Architecture

- **Monorepo**: npm workspaces under `packages/`.
  - `@sophie/shared` — types, Zod validators, geometry helpers, error codes.
  - `@sophie/api` — Fastify + better-sqlite3 backend with FTS5 search, photo pipeline (sharp), tarball backups with SHA-256 verification.
  - `@sophie/web` — React + Vite + TanStack Query frontend.
- **Data**: SQLite (WAL mode) + filesystem photo storage, all under `data/` by default.
- **LAN-only by design**: binds to `127.0.0.1` by default; the server logs a warning if configured to bind to a publicly routable address.

## Requirements

- Node.js 20+
- `better-sqlite3` and `sharp` compile native bindings on install; build tools may be required on Linux (`build-essential`, `python3`).

## Develop

```
npm install
npm run dev
```

- API listens on <http://127.0.0.1:3000> (`/api/v1/...`).
- Vite dev server runs on <http://127.0.0.1:5173> and proxies `/api` to the API.
- Press `q` or `n` anywhere in the app to open Quick-add.

## Seed

```
npm run seed
```

Creates sample types, rooms, locations, and items. Control volume via `SOPHIE_SEED_COUNT=10000`.

## Production build

```
npm run build
npm start
```

Builds shared + frontend + API and launches the API, which serves the built frontend from `packages/web/dist` at `/`.

## Configuration

Environment variables (all optional):

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port. |
| `BIND` | `127.0.0.1` | Listen interface. Warn on publicly routable values. |
| `SOPHIE_DATA_DIR` | `./data` | Root for DB, photos, backups, logs. |
| `SOPHIE_DB_PATH` | `$DATA_DIR/sophie.db` | SQLite file. |
| `SOPHIE_PHOTO_ROOT` | `$DATA_DIR/photos` | Photo directory. |
| `SOPHIE_BACKUP_ROOT` | `$DATA_DIR/backups` | Backup directory. |
| `SOPHIE_BACKUP_TIME` | `03:00` | Daily backup time, local. |

## Test

```
npm test
```

Runs vitest (backend integration + unit tests).

## Specs traceability

| Spec area | Implementation |
|---|---|
| `03-domain-model.md` | `packages/api/src/db/migrations/001_init.sql`, `packages/shared/src/types.ts` |
| `07-data-and-storage.md` | `packages/api/src/db/sqlite.ts`, `packages/api/src/services/photo-service.ts` |
| `08-api.md` | `packages/api/src/routes/*.ts` |
| `09-validation-and-errors.md` | `packages/shared/src/zod/index.ts`, `packages/api/src/errors.ts`, `packages/api/src/middleware/error-handler.ts` |
| `04-functional/search.md` | `packages/api/src/services/search-service.ts` (FTS5 + filters + autocomplete) |
| `04-functional/floor-plan.md` | `packages/api/src/services/floor-plan-service.ts`, `packages/web/src/pages/FloorPlanPage.tsx` |
| `04-functional/backup-restore.md` | `packages/api/src/services/backup-service.ts`, `packages/api/src/scheduler/daily-backup.ts` |
| `04-functional/shopping-list.md` | `packages/api/src/services/shopping-service.ts`, `packages/web/src/pages/ShoppingListPage.tsx` |
| `04-functional/photos.md` | `packages/api/src/services/photo-service.ts`, `packages/api/src/routes/photos.ts` |
| `04-functional/expiration-alerts.md` + `low-stock-alerts.md` | `packages/api/src/services/alerts-service.ts` |

## Scope cuts (v1)

- Floor-plan editor creates and edits **rectangles only**; polygon shapes render but aren't editable in-app. See `specs/03-domain-model.md` ("Rectangles are preferred").
- Single floor plan (`OI-003`).
- English-only UI strings (`NFR-I18N` centralized).
