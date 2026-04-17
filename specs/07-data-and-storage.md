# Data and Storage

This document describes the **logical** storage model required by the spec. Concrete technology choices (specific DB engine, library versions, etc.) are an implementation decision, except where the spec pins them down for performance or reliability reasons.

## Storage domains

Sophie-keep has two storage domains:

1. **Database**: structured data (items, types, locations, rooms, floor plan, shopping entries, quantity changes, photo metadata).
2. **Photo storage**: binary files (original photos, generated thumbnails, optional floor-plan background).

Backups encompass both domains in a single consistent snapshot (see `04-functional/backup-restore.md`).

## Database requirements

- **FR-DATA-001**: The database must provide transactional writes covering multi-row operations (e.g., merge types, restock, restore).
- **FR-DATA-002**: The database must support case-insensitive uniqueness constraints for:
  - `ItemType.name`
  - `Room.name`
  - `(StorageLocation.room_id, StorageLocation.name)`
- **FR-DATA-003**: The database must support text search fast enough to meet `NFR-PERF-001`. If the chosen engine's default text search cannot meet the target, an auxiliary search index (e.g., FTS extension, inverted index) must be added.
- **FR-DATA-004**: The database must be **embeddable or filesystem-local** to preserve the privacy and LAN-only constraints in `05-non-functional.md`. Remote managed DB services are disallowed by default.
- **FR-DATA-005**: Schema migrations must run on app startup and be idempotent.

## Required indexes

The following logical indexes exist to meet performance targets. Implementations may use composite indexes or native DB features (FTS, GIN) to satisfy them.

| Purpose | Field(s) | Required by |
|---|---|---|
| Item text search | `Item.name`, `Item.notes` (tokenized, case-insensitive) | `NFR-PERF-001`, `FR-SEARCH-001` |
| Filter by type | `Item.item_type_id` | `FR-SEARCH-002` |
| Filter by location | `Item.storage_location_id` | `FR-SEARCH-002` |
| Sort by `updated_at` | `Item.updated_at` | `FR-SEARCH-004` |
| Filter/sort by expiration | `Item.expiration_date` (partial, excluding nulls) | `FR-EXPIRY-005`, `FR-SEARCH-002` |
| Photo lookup | `Photo.owner_kind + Photo.owner_id` | `FR-PHOTOS-010` |
| Quantity history read | `QuantityChange.item_id + QuantityChange.created_at desc` | `FR-ITEMS-024` |
| Type uniqueness | lower(`ItemType.name`) | `FR-TYPES-002` |
| Room uniqueness | lower(`Room.name`) | `FR-LOCS-002` |
| Location uniqueness | (`StorageLocation.room_id`, lower(`StorageLocation.name`)) | `FR-LOCS-011` |

## Referential integrity

- Foreign keys must be enforced at the database layer for every cross-entity reference in `03-domain-model.md`.
- Delete behaviors per `03-domain-model.md#referential-integrity-summary`.

## Photo storage layout

- **FR-DATA-020**: Photos are stored on the server's local filesystem under a dedicated root, configurable in server config.
- **FR-DATA-021**: Directory layout must be stable and deterministic. Recommended layout:

```
<photo_root>/
  items/<first-2-of-photo-id>/<photo-id>/original.<ext>
  items/<first-2-of-photo-id>/<photo-id>/thumb.webp
  floor_plan/<photo-id>/original.<ext>
  floor_plan/<photo-id>/thumb.webp
```

- **FR-DATA-022**: The photo storage layout must be reproducible from the database — restoring a backup must re-create exactly this structure.
- **FR-DATA-023**: Filesystem-level file writes and database writes must be ordered so that, after a crash, there are no orphan files (files with no DB reference) or dangling references (DB rows pointing at missing files). Recommended: write file first, then commit DB row; on startup, scan for orphans and either reconcile or move to a quarantine directory.

## Concurrency

- **FR-DATA-030**: Writes use **last-writer-wins** at the record level via a `updated_at`-based check: if a client submits an update whose base `updated_at` does not match the current row, the server returns `409 Conflict` and the client must reload before retrying.
- **FR-DATA-031**: Quantity increment/decrement must use **atomic DB operations** (not read-modify-write) to prevent lost updates under concurrent use.
- **FR-DATA-032**: Merges (type merge, restock) must execute in a single transaction.

## Durability

- **FR-DATA-040**: Every state-changing API response is returned **after** the underlying transaction has been committed to durable storage.
- **FR-DATA-041**: Photo uploads are considered durable only after the file exists on disk **and** the DB row is committed.

## Schema versioning

- **FR-DATA-050**: The database must carry a `schema_version` integer. The app refuses to start if the DB schema version is greater than the app's maximum supported version.
- **FR-DATA-051**: Backups record the schema version in their manifest (`FR-BACKUP-003`) and are rejected at restore if the version is incompatible (`FR-BACKUP-034`).

## Configuration

- **FR-DATA-060**: Server configuration (bind address, photo root, backup root, backup time, expiring-soon default, DB location) must be read from a single configuration file or environment variables. No hard-coded paths.

## Dependencies

- Entities: `03-domain-model.md`.
- NFR targets: `05-non-functional.md` (performance, reliability, security, privacy).
- Backup semantics: `04-functional/backup-restore.md`.
