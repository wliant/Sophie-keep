# Item Types

## Purpose

Item types categorize items. They exist so users can filter inventory, supply defaults (unit, low-stock threshold), and visually distinguish categories with icons/colors. Without types, the inventory becomes a flat, hard-to-browse list.

## Scope

- In scope: CRUD, merge, reassign-on-delete, uniqueness.
- Out of scope: hierarchical types (deferred, `OI-004`); automatic classification from item name.

## Requirements

- **FR-TYPES-001**: The system must allow creating an item type with `name`, `default_unit`, and optional `default_low_stock_threshold`, `icon`, `color`.
- **FR-TYPES-002**: `name` must be unique **case-insensitively**. Attempting to create a duplicate must return a validation error.
- **FR-TYPES-003**: The system must allow updating any field of an item type except `id`, `created_at`, `updated_at`.
- **FR-TYPES-004**: The system must allow deleting an item type **only** if no items reference it.
- **FR-TYPES-005**: Attempting to delete a type that is referenced must return an error listing how many items reference it, with a link/affordance to the **reassign** flow.
- **FR-TYPES-006**: The system must provide a **merge** operation: given types `A` and `B`, move every item currently of type `A` to type `B`, then delete `A`. The merge is atomic — if any referential check fails, nothing changes.
- **FR-TYPES-007**: The system must list all item types with counts of referenced items, sorted by name by default.
- **FR-TYPES-008**: Changes to `default_unit` or `default_low_stock_threshold` must **not** retroactively modify existing items' stored fields; they only affect new items and the computed fallback for items whose `low_stock_threshold` is null.

## UX Notes

- Item types are managed on a dedicated **Settings → Item Types** screen.
- Each row shows icon (if set), name, default unit, default threshold, and count of items.
- Row actions: Edit, Merge into…, Delete (disabled with tooltip if referenced).
- Merge UI is a two-step picker: choose the target type, confirm with a preview of the item count that will move.

## Dependencies

- Entity: [ItemType](../03-domain-model.md#itemtype).
- Related: `items.md` (for how defaults propagate at create time).

## Acceptance Criteria

- **AC-TYPES-001**: **Given** no type named "Spice", **when** a user creates one, **then** it appears in the list with count 0.
- **AC-TYPES-002**: **Given** a type named "Spice" exists, **when** a user creates another type named "spice" (lower-case), **then** the request is rejected with a uniqueness error.
- **AC-TYPES-003**: **Given** a type "Spice" has 5 referencing items, **when** a user tries to delete it, **then** deletion is blocked and the error message states "5 items reference this type".
- **AC-TYPES-004**: **Given** types "Spice" (3 items) and "Seasoning" (2 items), **when** a user merges "Spice" into "Seasoning", **then** "Spice" is deleted and "Seasoning" has 5 items.
- **AC-TYPES-005**: **Given** a type whose `default_unit` is `g`, **when** the default is changed to `kg`, **then** existing items of that type keep their original stored unit.

## Open Questions

- `OI-004`: Nested / hierarchical types (e.g., Food → Spice). Deferred.
