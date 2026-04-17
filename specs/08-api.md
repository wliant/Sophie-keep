# API Surface

Sophie-keep exposes a JSON-over-HTTP API. This document defines the surface at spec fidelity — exact response shapes may add fields in non-breaking ways, but every endpoint listed here must exist and behave as described.

## Conventions

- Base URL: `/api/v1/…`.
- Requests and responses use `application/json; charset=utf-8`, except photo upload (`multipart/form-data`) and photo download (binary).
- All request and response field names use `snake_case`.
- All timestamps are ISO 8601 UTC with a trailing `Z`.
- All IDs are strings.
- No authentication header is required or accepted (see `01-users-and-context.md`).
- CORS is disabled by default (see `NFR-SEC-006`).

## Pagination

List endpoints accept `page` (1-based, default 1) and `page_size` (default 50, max 200). Responses include:

```json
{
  "items": [...],
  "page": 1,
  "page_size": 50,
  "total": 482,
  "total_pages": 10
}
```

## Error model

Errors return a JSON body:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable summary.",
    "fields": {
      "name": ["must not be empty"]
    },
    "request_id": "01HE…"
  }
}
```

Standard HTTP codes:

| Status | Meaning |
|---|---|
| 200 | Successful read or update. |
| 201 | Successful create. |
| 204 | Successful delete. |
| 400 | Validation error (`VALIDATION_ERROR`). |
| 404 | Not found (`NOT_FOUND`). |
| 409 | Conflict: stale `updated_at`, uniqueness violation, referenced-on-delete (`CONFLICT`). Sub-codes discriminate. |
| 413 | Payload too large (photo upload). |
| 415 | Unsupported MIME type. |
| 422 | Semantic error (e.g., shape outside room). `SEMANTIC_ERROR`. |
| 500 | Unexpected error (`INTERNAL_ERROR`). |

Full error-code taxonomy in `09-validation-and-errors.md`.

## Endpoints

### Items

- `GET    /api/v1/items` — list + search + filter (see Search endpoint, below, for query params).
- `POST   /api/v1/items` — create.
- `GET    /api/v1/items/{id}` — read single item with derived flags and embedded photo URLs and last 10 quantity changes.
- `PATCH  /api/v1/items/{id}` — partial update. Request body must include `base_updated_at` for `FR-DATA-030`.
- `DELETE /api/v1/items/{id}` — delete.
- `POST   /api/v1/items/{id}/quantity` — body: `{ "op": "increment" | "decrement" | "set", "amount": number, "reason": enum }`. Server-side atomic (`FR-DATA-031`).

### Search (and autocomplete)

- `GET /api/v1/items` (same path as list) accepts:
  - `q` — text query (`FR-SEARCH-001`).
  - `item_type_id` — repeatable.
  - `storage_location_id` — repeatable.
  - `room_id` — repeatable.
  - `expires_within_days` — integer.
  - `low_stock_only` — `true` | `false`.
  - `has_photo` — `true` | `false`.
  - `sort` — one of `relevance`, `name_asc`, `name_desc`, `updated_desc`, `expiration_asc`, `quantity_asc`, `quantity_desc`.
  - `page`, `page_size`.

- `GET /api/v1/items/autocomplete?q=…&limit=5` — autocomplete per `FR-SEARCH-020`.

### Item types

- `GET    /api/v1/item-types` — list with reference counts.
- `POST   /api/v1/item-types` — create.
- `GET    /api/v1/item-types/{id}` — read.
- `PATCH  /api/v1/item-types/{id}` — update.
- `DELETE /api/v1/item-types/{id}` — blocked if referenced (`FR-TYPES-004`).
- `POST   /api/v1/item-types/{id}/merge` — body: `{ "target_id": "…" }`. Atomic (`FR-TYPES-006`).

### Rooms

- `GET    /api/v1/rooms`
- `POST   /api/v1/rooms`
- `GET    /api/v1/rooms/{id}`
- `PATCH  /api/v1/rooms/{id}`
- `DELETE /api/v1/rooms/{id}` — blocked if non-empty (`FR-LOCS-004`).

### Storage locations

- `GET    /api/v1/storage-locations` — can be filtered by `room_id`.
- `POST   /api/v1/storage-locations`
- `GET    /api/v1/storage-locations/{id}` — includes a reference count.
- `PATCH  /api/v1/storage-locations/{id}`
- `DELETE /api/v1/storage-locations/{id}` — blocked if referenced (`FR-LOCS-013`).

### Floor plan

- `GET  /api/v1/floor-plan` — returns the single active plan with its dimensions and background reference.
- `PATCH /api/v1/floor-plan` — update `name`, `width`, `height`, `background_image_photo_id`.
- `POST /api/v1/floor-plan/edit-session` — body: a batch of room/location create/update/delete operations. Server validates all (`FR-PLAN-014`) and applies atomically. On validation failure, returns `422` with per-shape error details and does not apply any change.

### Shopping list

- `GET   /api/v1/shopping-list` — returns the merged view of auto entries + manual entries, ordered per `FR-SHOP-020`.
- `POST  /api/v1/shopping-list/entries` — create a manual entry.
- `PATCH /api/v1/shopping-list/entries/{id}` — edit label or `checked`.
- `DELETE /api/v1/shopping-list/entries/{id}` — delete a manual entry.
- `POST  /api/v1/shopping-list/auto-check` — body: `{ "item_id": "…", "checked": true | false }`. Updates the ephemeral auto-check state.
- `POST  /api/v1/shopping-list/confirm-restock` — applies the restock per `FR-SHOP-012`. Body supplies the per-item restock amounts and expiry updates chosen in the UI. Response lists per-item outcomes.
- `POST  /api/v1/shopping-list/clear-checked` — clears all checked states without restocking (`FR-SHOP-014`).

### Photos

- `POST   /api/v1/photos` — multipart upload. Form fields: `owner_kind` (`item` | `floor_plan`), `owner_id`, one or more `file` parts. Returns new photo metadata.
- `GET    /api/v1/photos/{id}` — returns binary; `?variant=thumb` for thumbnail.
- `DELETE /api/v1/photos/{id}` — remove from owner; if owner is an item, also updates `photo_ids`.
- `POST   /api/v1/items/{id}/photos/order` — body: `{ "photo_ids": [...] }`. Reorders `Item.photo_ids` (`FR-PHOTOS-012`).

### Settings

- `GET   /api/v1/settings` — returns `expiring_soon_window_days`, etc.
- `PATCH /api/v1/settings` — update settings.

### Backups

- `GET    /api/v1/backups` — list all retained backups with manifests.
- `POST   /api/v1/backups` — trigger a manual backup.
- `GET    /api/v1/backups/{id}/download` — download backup file.
- `POST   /api/v1/backups/{id}/restore` — trigger restore from a retained backup. Requires `confirm: "REPLACE ALL DATA"` in body.
- `POST   /api/v1/backups/upload-and-restore` — multipart upload of a backup file + restore.
- `GET    /api/v1/backups/status` — last automatic-backup run status (for the UI banner in `FR-UI-112`).

### Health & info

- `GET /api/v1/health` — liveness / readiness probe; returns status + schema version + app version.

## Requirements

- **FR-API-001**: Every endpoint must return the error model defined above on failure; plain-text or HTML error bodies are disallowed.
- **FR-API-002**: Endpoints that mutate state must be idempotent when safe (e.g., PATCH with the same body yields the same result); mutating requests must use distinct HTTP methods (`POST`/`PATCH`/`DELETE`).
- **FR-API-003**: All list endpoints must honor `page` and `page_size` and return the pagination block defined above.
- **FR-API-004**: All mutations of an existing row must accept `base_updated_at` and return `409` on mismatch (`FR-DATA-030`).
- **FR-API-005**: Photo upload must return `413` for size violations (`FR-PHOTOS-003`) and `415` for MIME violations (`FR-PHOTOS-002`).
- **FR-API-006**: The API must set `Cache-Control: no-store` on all dynamic endpoints.
- **FR-API-007**: The API must emit a unique `request_id` per request and include it in both logs and error responses (`FR-UI-111`).

## Dependencies

- Error taxonomy: `09-validation-and-errors.md`.
- Concurrency: `07-data-and-storage.md`.
- Functional specs in `04-functional/`.
