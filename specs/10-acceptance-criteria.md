# Cross-Cutting Acceptance Criteria

Per-feature acceptance criteria live in the corresponding files under `04-functional/`. The tests here are **cross-cutting** — they span multiple features or verify non-functional promises. Each is directly testable.

## Performance

- **AC-CROSS-001**: **Given** an inventory of 10,000 items seeded across 50 types and 500 locations, **when** a search with the text query "tea" and a type filter fires, **then** the response returns in under 300 ms at p95 over 100 trials (`NFR-PERF-001`).
- **AC-CROSS-002**: **Given** an inventory of 10,000 items, **when** the Dashboard is loaded, **then** LCP is at most 2.0 s on a mid-range mobile device on the LAN (`NFR-PERF-004`).
- **AC-CROSS-003**: **Given** 5,000 items whose names begin with the letter "p", **when** Quick-add autocomplete fires with `q="p"`, **then** it returns up to 5 results in under 150 ms at p95 (`NFR-PERF-003`).

## Quick-add interaction budget

- **AC-CROSS-010**: **Given** defaults are already recorded and an existing item named "paprika" exists, **when** a user performs the quick-add sequence (1) Quick-add button, (2) type "pap", tap autocomplete match, (3) tap Save, **then** the item's quantity is incremented. The verified interaction count is 3 (`NFR-PERF-002`).
- **AC-CROSS-011**: **Given** no quick-add defaults exist, **when** a user performs the quick-add for the first time, **then** the interaction count may be 4 (adding a type/location choice), and the defaults are recorded so a second quick-add completes in 3 interactions.

## Reliability and backup round-trip

- **AC-CROSS-020**: **Given** a running system with ≥ 1 day of data, **when** a manual backup is triggered, downloaded, and then uploaded on a fresh install for restore, **then** item counts, type counts, location counts, and photo checksums match the source.
- **AC-CROSS-021**: **Given** the server is killed mid-write of a quantity change, **when** the server restarts, **then** the item's quantity is either the pre-change value or the post-change value — never a partial or corrupted state. (`NFR-REL-003`)
- **AC-CROSS-022**: **Given** the daily backup job runs successfully for 35 consecutive days, **when** the Backups screen is loaded on day 35, **then** exactly 30 backups are listed (`NFR-REL-001`, `FR-BACKUP-005`).

## Security & privacy

- **AC-CROSS-030**: **Given** a clean install, **when** starting the server with a public-internet-routable bind address, **then** a warning line appears in the log on startup (`NFR-SEC-002`).
- **AC-CROSS-031**: **Given** a user types `<script>alert(1)</script>` as an item name and saves, **when** that item is rendered in the Inventory list and Item detail, **then** the literal text is displayed and no alert fires (`NFR-SEC-004`, `FR-VAL-001`).
- **AC-CROSS-032**: **Given** a user uploads a JPEG containing GPS EXIF, **when** the stored file is inspected, **then** GPS EXIF is absent, while orientation has been applied and then removed (`NFR-PRIV-003`, `FR-PHOTOS-006`).
- **AC-CROSS-033**: **Given** an uploaded file whose declared MIME is `image/jpeg` but whose content is a PNG, **when** the upload is submitted, **then** the request is rejected with `MAGIC_BYTES_MISMATCH` (`NFR-SEC-005`).

## Concurrency

- **AC-CROSS-040**: **Given** two clients open the same item and client A increments quantity, **when** client B issues a PATCH with its original `base_updated_at`, **then** the PATCH returns `409 CONFLICT_STALE` and client B must reload (`FR-DATA-030`).
- **AC-CROSS-041**: **Given** two clients concurrently issue increment-by-1 against the same item whose initial quantity is 0, **when** both requests complete, **then** the final quantity is exactly 2 (`FR-DATA-031`).
- **AC-CROSS-042**: **Given** the user starts a plan edit session from one client, **when** another client saves changes during that session and the first client then saves, **then** the second save is applied last-write-wins at the per-shape level without crashing (`FR-PLAN-020`).

## Accessibility

- **AC-CROSS-050**: **Given** a keyboard-only user, **when** they press Tab from the Dashboard, **then** they can reach every primary screen and complete the Quick-add flow using only the keyboard (`NFR-USA-003`).
- **AC-CROSS-051**: **Given** a screen reader (e.g., VoiceOver, NVDA), **when** it scans the Inventory list, **then** every row announces item name, quantity + unit, and applicable badges (`NFR-USA-005`).
- **AC-CROSS-052**: **Given** the Dashboard in the default theme, **when** contrast is measured, **then** body text meets 4.5:1 against its background (`NFR-USA-006`).

## Responsiveness

- **AC-CROSS-060**: **Given** the app is loaded at 320 px viewport width, **when** the primary screens are navigated, **then** no horizontal scrollbar appears (`NFR-USA-001`).
- **AC-CROSS-061**: **Given** the Quick-add modal is open on a small phone, **when** the keyboard slides in, **then** the Save button remains visible (not obscured by the keyboard).

## Shopping-list end-to-end

- **AC-CROSS-070**: **Given** 2 low-stock items and 1 expired item, **when** the user opens the shopping list, checks all three, chooses default restock for the two low-stock, updates the expired item's date, and confirms restock, **then** each item has a corresponding `QuantityChange` (where applicable) and the expired item's `expiration_date` is updated. The shopping list re-renders without any auto entries.

## Floor plan end-to-end

- **AC-CROSS-080**: **Given** a fresh install, **when** the user creates a room "Kitchen" and a storage location "Spice drawer" from the floor-plan editor, then runs Quick-add for "paprika", **then** the Inventory list filtered by the "Spice drawer" location shows the new item.
