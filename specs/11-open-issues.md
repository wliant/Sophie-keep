# Open Issues

Items parked during spec authoring. Each has a stable `OI-NNN` id. Resolution updates the referenced spec files and moves the item to a closed section below (keeping the id).

## Open

- **OI-001**: **LAN trust model limits.** The "no auth, LAN-only" posture assumes every device on the LAN is trusted. Homes with untrusted smart devices (rentable guest Wi-Fi, IoT on the same VLAN, children's devices) violate this assumption. Revisit whether a passphrase-based shared-secret or device-allow-list is worth adding as a v1.1.
- **OI-002**: **Unit conversions.** v1 stores a free-text `unit`. Converting between units (g ↔ kg, oz ↔ g) is out of scope. Decide on a unit model (enum vs. library like `units`) before enabling conversion.
- **OI-003**: **Multi-floor / multi-plan households.** v1 supports exactly one `FloorPlan`. Multi-floor homes currently require either a combined plan image or a suboptimal layout. Design a multi-plan model if demand emerges.
- **OI-005**: **Collaborative editing beyond last-writer-wins.** `FR-DATA-030` uses stale-read conflict detection. For floor-plan edits across multiple devices, a CRDT or operational-transform model may be warranted.
- **OI-010**: **Split stock.** Dividing one item record into two (same item in two locations) — see `items.md`. Parked.
- **OI-011**: **Fuzzy search.** Typo tolerance via Levenshtein or trigram matching. Parked — current prefix + substring is acceptable.
- **OI-012**: **Zero-quantity without threshold.** Currently, an item with quantity 0 but no threshold is not flagged as low-stock (`AC-STOCK-004`). Revisit whether zero should auto-flag regardless of threshold.
- **OI-013**: **Restock default per-item.** Should the "amount to restock" default be editable per-item? v1 always computes. Parked.
- **OI-014**: **HEIC uploads.** iPhone default format is HEIC. v1 requires browser/OS conversion on upload. If native HEIC decoding becomes easy, allow it.
- **OI-015**: **Backup encryption.** v1 backups are plaintext tarballs. A passphrase-based encryption step would protect backups copied off-server. Parked.
- **OI-017**: **"Who changed what."** No per-user attribution because there are no users. If OI-001 is resolved with per-device auth, revisit.

## Closed

- **OI-004**: **Hierarchical item types.** Implemented — `ItemType` now has `parent_id`; depth ≤ 10 enforced, cycles blocked at DB layer. See `04-functional/item-types.md` (FR-TYPES-009–013) and `03-domain-model.md#itemtype`.
- **OI-016**: **Off-site backup destinations / photo storage.** Resolved — MinIO (S3-compatible) object store replaces local filesystem for photo storage. Bucket, endpoint, and credentials are configurable. See `07-data-and-storage.md`.
- **OI-018**: **Recipe / meal-plan integration.** Implemented — full recipe book with ingredient matching and a cook action that decrements inventory. See `04-functional/recipes.md` and `03-domain-model.md#recipe`.
