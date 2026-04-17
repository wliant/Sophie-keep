# Non-Functional Requirements

Every requirement here is measurable — either a number, a percentile, or a binary check.

## Performance

- **NFR-PERF-001**: Search and filter requests must return results in under **300 ms at p95** for inventories of up to 10,000 items and 500 storage locations.
- **NFR-PERF-002**: The quick-add flow must be completable in **≤ 3 user interactions** from the dashboard for the common path (existing item + default count). See `04-functional/items.md`.
- **NFR-PERF-003**: Quick-add autocomplete must return results in under **150 ms at p95**.
- **NFR-PERF-004**: Page loads for primary screens (Dashboard, Inventory list, Floor Plan view) must achieve **Largest Contentful Paint ≤ 2.0 s** on a mid-range mobile device on a LAN.
- **NFR-PERF-005**: Photo thumbnail generation must complete within 2 s at p95 for a 10 MB source image. The original upload is acknowledged to the client before thumbnail generation completes.

## Reliability

- **NFR-REL-001**: The system must create a successful automatic backup **every 24 hours**, with 30-day retention. See `04-functional/backup-restore.md`.
- **NFR-REL-002**: Restore from any retained backup must complete successfully with verified checksums.
- **NFR-REL-003**: A crash or forced shutdown of the server must not cause data corruption — on restart, the system must come up with either the pre-crash committed state or the last completed transaction.
- **NFR-REL-004**: All state-changing operations must be durable before returning success to the client (no silent in-memory-only writes).

## Availability

- **NFR-AVAIL-001**: There is no uptime SLO — the system runs on a home server and is considered best-effort.
- **NFR-AVAIL-002**: A failure to reach the server must produce a clear, actionable error in the UI (e.g., "Can't reach Sophie-keep at `sophie.local`") rather than a silent hang.

## Security posture

- **NFR-SEC-001**: The server must be deployable on a LAN without any authentication configuration.
- **NFR-SEC-002**: The server must log a warning on startup if its configured bind address is publicly routable.
- **NFR-SEC-003**: All user-supplied text fields must be validated against the constraints in `09-validation-and-errors.md` before persistence.
- **NFR-SEC-004**: All user-supplied text that is rendered in the UI must be output-encoded so that script content cannot execute (XSS prevention). This applies even under the LAN trust model.
- **NFR-SEC-005**: Uploaded files must be validated by both MIME type and magic-byte sniffing; files whose content doesn't match their claimed type must be rejected.
- **NFR-SEC-006**: The server must not include any CORS configuration that would enable cross-origin requests from the public internet. By default, CORS must be disabled or restricted to the configured LAN origin.
- **NFR-SEC-007**: The server must not ship with UPnP, port-forwarding, or reverse-tunnel features.

## Privacy

- **NFR-PRIV-001**: No item data, photo, or backup may leave the home server at runtime. This excludes strictly user-initiated exports (see `04-functional/backup-restore.md`) and user-initiated downloads.
- **NFR-PRIV-002**: The server must not make network requests to the public internet at runtime except those required to fetch static vendor assets during build/install (documented in the implementation README).
- **NFR-PRIV-003**: Uploaded photo EXIF must be stripped of non-orientation metadata before persistence (`FR-PHOTOS-006`).

## Usability

- **NFR-USA-001**: All primary screens must be usable on viewports from 320 px wide (small phone) to 1920 px wide (desktop) with no horizontal scrolling.
- **NFR-USA-002**: Interactive targets must be **at least 44 × 44 px** on touch devices.
- **NFR-USA-003**: All functionality must be reachable with keyboard only (Tab/Shift-Tab, Enter, Esc, arrow keys where applicable).
- **NFR-USA-004**: Color must not be the sole signal for any state (expiring, expired, low stock, error). Icons, text, or shape must reinforce.
- **NFR-USA-005**: All interactive controls must have accessible labels usable by screen readers.
- **NFR-USA-006**: The app must meet WCAG 2.1 AA contrast ratios for text and essential UI (4.5:1 for body text, 3:1 for large text and UI chrome).

## Observability

- **NFR-OBS-001**: All HTTP requests must be logged with timestamp, method, path, status, and duration.
- **NFR-OBS-002**: All errors thrown in request handlers must be logged with stack traces (server-side only, never returned to the client verbatim).
- **NFR-OBS-003**: Logs must be kept on the local filesystem with size-based rotation (default 50 MB × 10 files). No external telemetry.

## Internationalization

- **NFR-I18N-001**: v1 ships with English copy only.
- **NFR-I18N-002**: All user-visible strings must be organized so they can be externalized (e.g., centralized message tables); hard-coded inline strings in views are disallowed.
- **NFR-I18N-003**: Dates must be rendered in a locale-appropriate format using the browser's locale; stored dates remain ISO 8601.

## Scale

- **NFR-SCALE-001**: The system must support up to **10,000 items** and **500 storage locations** per household while meeting `NFR-PERF-001`.
- **NFR-SCALE-002**: A single photo upload must not exceed **10 MB**; an item may have up to **10 photos**.
- **NFR-SCALE-003**: The backup directory size is bounded by the daily-backup-size × 30 days. The Backups screen must display cumulative storage used.

## Compatibility

- **NFR-COMPAT-001**: Server must run on Linux, macOS, and Windows.
- **NFR-COMPAT-002**: Clients listed in `01-users-and-context.md` are the minimum supported set.

## Compliance

- **NFR-COMP-001**: v1 makes no regulated-compliance claims (no HIPAA, GDPR processor role, etc.), consistent with single-household LAN deployment.
