# Items

## Purpose

Items are the core entity of Sophie-keep. This feature covers full item lifecycle — creation (including the headline **quick-add** flow), reading, updating, deleting, and adjusting quantity — plus the audit trail of quantity changes.

## Scope

- In scope: CRUD; quick-add; quantity increment/decrement/set; last-change history.
- Out of scope: photo upload (see `photos.md`); search (see `search.md`); auto shopping list (see `shopping-list.md`); barcode scanning (deferred).

## Requirements

### Create / read / update / delete

- **FR-ITEMS-001**: The system must allow creating an item with `name`, `item_type_id`, `storage_location_id`; `quantity`, `unit`, `expiration_date`, `low_stock_threshold`, `notes`, and `photo_ids` are optional at create time.
- **FR-ITEMS-002**: On create, if `unit` is omitted, the system must set it to the item type's `default_unit`.
- **FR-ITEMS-003**: On create, if `low_stock_threshold` is omitted, the system must leave the item's stored threshold as `null` (the effective threshold falls back to the item type's default at read time — see `low-stock-alerts.md`).
- **FR-ITEMS-004**: On create, if `quantity` is omitted, the system must set it to `0`.
- **FR-ITEMS-005**: The system must allow updating any field of an existing item except `id`, `created_at`, and `updated_at`.
- **FR-ITEMS-006**: The system must allow deleting an item. Deletion cascades to that item's photos and quantity-change history.
- **FR-ITEMS-007**: The system must reject create/update requests that reference a non-existent `item_type_id` or `storage_location_id` with a validation error (see `09-validation-and-errors.md`).

### Quick-add

- **FR-ITEMS-010**: The system must provide a **Quick-add** entry point reachable from every screen via a persistent button.
- **FR-ITEMS-011**: Quick-add must complete in **≤ 3 user interactions** from the moment the quick-add button is tapped: (1) tap Quick-add, (2) type/select a name, (3) tap Save. Autocomplete and defaults must make the "select" step optional.
- **FR-ITEMS-012**: As the user types a name, the system must search existing items by name prefix and substring (case-insensitive) and surface up to 5 matches.
- **FR-ITEMS-013**: If the user selects an existing match in quick-add and taps Save, the system must **increment** that item's quantity by 1 (default increment; see `FR-ITEMS-014`).
- **FR-ITEMS-014**: Quick-add must expose an optional numeric "count" field (default 1). Changing this field does not count against the 3-interaction budget if the default is used.
- **FR-ITEMS-015**: If the user types a name that matches no existing item and taps Save, the system must create a new item. The item type, storage location, and unit must be pre-filled from the user's **most-recent quick-add** values. If there is no recent value, the system must show the field inline so the user can set it before saving; in that case the interaction budget may rise to 4 for this invocation, and the system must remember the chosen defaults for subsequent quick-adds.
- **FR-ITEMS-016**: Quick-add must be usable with keyboard only (Tab, Enter).

### Quantity operations

- **FR-ITEMS-020**: The system must expose increment (`+1`), decrement (`-1`), and set (arbitrary non-negative value) operations on an item's `quantity`.
- **FR-ITEMS-021**: Decrementing below 0 must be rejected with a validation error; the item remains at its previous quantity.
- **FR-ITEMS-022**: Every quantity change must create a `QuantityChange` record with the delta, the resulting quantity, and a `reason` (`manual`, `quick_add`, `shopping_restock`, or `import`).
- **FR-ITEMS-023**: Only the most recent 100 `QuantityChange` records per item are retained; older records are pruned on write.
- **FR-ITEMS-024**: The item detail view must show the last 10 `QuantityChange` records.

## UX Notes

### Quick-add

- A floating action button labeled **+** is pinned to the bottom-right on mobile and top-right on desktop, visible on every primary screen.
- Tapping the button opens a modal with a single visible field (item name) focused for typing. An optional "count" stepper sits next to the Save button.
- Below the name field, up to 5 autocomplete matches render as tappable rows showing name, type, location, and current quantity.
- If no match is chosen, an inline row beneath the field shows the current defaults (type, location, unit) with small "change" affordances. These defaults come from the most-recent quick-add.
- Errors (missing type on first use, invalid name length, etc.) render inline below the field without closing the modal.

### Inventory list row

Each row shows: name, type (chip), location, quantity + unit, **–** and **+** buttons, a badge cluster (expiring-soon, low-stock), and a tap-affordance that opens item detail.

### Item detail

- Header: name (editable), type, location, quantity with `-`/`+`/set controls.
- Body: expiration date, low-stock threshold (with inherited-default indicator when null), notes, photos grid.
- History: last 10 `QuantityChange` records — timestamp, delta, reason.
- Actions: Delete (with confirm), Move (storage location), Change type.

## Dependencies

- Entities in `../03-domain-model.md`: [Item](../03-domain-model.md#item), [ItemType](../03-domain-model.md#itemtype), [StorageLocation](../03-domain-model.md#storagelocation), [QuantityChange](../03-domain-model.md#quantitychange).
- Photos: `photos.md`.
- Search & autocomplete: `search.md`.
- NFR performance targets: `../05-non-functional.md` (`NFR-PERF-001`, `NFR-PERF-002`).

## Acceptance Criteria

- **AC-ITEMS-001**: **Given** no existing items, **when** the user opens Quick-add, types "paprika", sets type=Spice + location=Spice drawer, and taps Save, **then** a new item "paprika" with quantity 1 and unit `g` (inherited from Spice) is created.
- **AC-ITEMS-002**: **Given** an item "paprika" exists with quantity 3, **when** the user opens Quick-add, types "paprika", selects the match, and taps Save, **then** the item's quantity becomes 4 and a `QuantityChange(delta=+1, reason=quick_add)` is recorded.
- **AC-ITEMS-003**: **Given** no prior quick-add defaults exist, **when** the user completes Quick-add for the first time, **then** the chosen type, location, and unit are saved as defaults for subsequent quick-adds.
- **AC-ITEMS-004**: **Given** an item with quantity 0, **when** the user taps the `-` control, **then** the system returns a validation error and the quantity remains 0.
- **AC-ITEMS-005**: **Given** an `ItemType` referenced by one or more items, **when** a user attempts to delete that type, **then** the delete is rejected with a message naming the referencing items (see `item-types.md`).
- **AC-ITEMS-006**: **Given** Quick-add is used with only a name (existing match) and Save, **when** measuring interactions, **then** exactly 3 interactions are required: open, type/pick, save.
- **AC-ITEMS-007**: **Given** an item has had 101 quantity changes, **when** the 101st change is written, **then** the oldest change is pruned and exactly 100 changes remain.

## Open Questions

- `OI-010`: Whether to offer a "split stock" operation (divide one item into two distinct items in different locations) in v1. Parked.
