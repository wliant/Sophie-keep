# Backup & Restore

## Purpose

Household data is hard to replace. A dropped phone is fine; a corrupted database means re-photographing every item in the house. Backup & restore exist so a single command (or click) can recover the last 30 days of state.

## Scope

- In scope: daily automatic backup, 30-day rolling retention, manual export, manual restore, verification.
- Out of scope: off-site backups (no external services in v1); incremental / WAL-based backups; snapshot scheduling beyond daily.

## Requirements

### Automatic backup

- **FR-BACKUP-001**: The system must create a backup once per day at a configurable local time (default 03:00).
- **FR-BACKUP-002**: A backup is a single file (e.g., tarball) containing: a JSON export of all database entities AND the contents of the photo storage root.
- **FR-BACKUP-003**: Each backup file must include a manifest with: timestamp, schema version, entity counts, photo count, and a checksum (SHA-256) over the content.
- **FR-BACKUP-004**: Backups must be stored in a dedicated backup directory on the server's local filesystem.
- **FR-BACKUP-005**: Backups older than **30 days** must be deleted. Deletion runs as part of the same daily job after the new backup is verified.
- **FR-BACKUP-006**: If a daily backup fails, the system must log the error and emit a visible banner in the UI the next time any client loads; the existing backup set must not be pruned on a failed run.

### Verification

- **FR-BACKUP-010**: After writing a backup, the system must re-read it, recompute the checksum, and compare it to the manifest. A mismatch must cause the run to be treated as failed (no pruning).

### Manual export

- **FR-BACKUP-020**: The **Settings → Backups** screen must allow triggering a manual backup.
- **FR-BACKUP-021**: The same screen must allow downloading any existing backup file to the browser's device.

### Manual restore

- **FR-BACKUP-030**: The screen must allow selecting one of the existing backups (or uploading a previously downloaded file) and triggering a restore.
- **FR-BACKUP-031**: Restore must be guarded by a double-confirmation that states it will **replace all current data**, naming the item count of the current state and the item count in the target backup.
- **FR-BACKUP-032**: Before replacing state, the system must create a safety snapshot labeled `pre_restore_<timestamp>` that is exempt from the 30-day prune until the next successful daily backup.
- **FR-BACKUP-033**: Restore must be atomic: either the restore completes fully or the original state is preserved. On failure, the pre-restore snapshot is used to roll back.
- **FR-BACKUP-034**: Restore must reject backups with an incompatible schema version, naming the mismatch. Migration between schema versions is an implementation detail but must never silently corrupt data.

## UX Notes

- Backups screen lists each backup with timestamp, size, entity counts, verification status (OK / checksum mismatch), and actions: Download, Restore, Delete.
- Restore opens a modal showing a diff summary ("Current: 482 items, 12 types; This backup: 470 items, 11 types") and the double-confirm affordance (typed phrase or two-tap).
- A persistent banner appears if the most recent automatic backup failed, linking to logs.

## Dependencies

- Entities: all.
- Photo storage layout: `../07-data-and-storage.md`.

## Acceptance Criteria

- **AC-BACKUP-001**: **Given** the system has been running for 40 days with daily backups, **when** the user opens the Backups screen, **then** exactly 30 backup files are listed (most recent first).
- **AC-BACKUP-002**: **Given** a scheduled backup runs, **when** the checksum verification fails, **then** the failed backup file is moved aside and older backups are **not** pruned.
- **AC-BACKUP-003**: **Given** the user triggers a restore of yesterday's backup, **when** a mid-restore error occurs, **then** the database and photo store match the pre-restore state and a pre-restore snapshot exists.
- **AC-BACKUP-004**: **Given** the user uploads a backup with an incompatible schema version, **when** restore is attempted, **then** it is rejected with a specific schema-mismatch error and the current state is untouched.
- **AC-BACKUP-005**: **Given** an automatic backup fails, **when** any client loads the app the next day, **then** a banner is shown linking to the Backups screen.
- **AC-BACKUP-006**: **Given** a successful manual export, **when** the downloaded file is re-uploaded and restored, **then** entity counts and photo counts match the manifest.

## Open Questions

- `OI-015`: Whether to offer backup encryption. v1: no. Parked.
- `OI-016`: Off-site backup destinations (S3, Backblaze, etc.). Deferred.
