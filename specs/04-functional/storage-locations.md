# Storage Locations

## Purpose

Storage locations tell users **where** an item lives. Every item references exactly one location, and every location belongs to exactly one room. Locations also anchor the floor-plan UI — the visual plan is the set of rooms and locations rendered spatially.

## Scope

- In scope: CRUD for rooms and storage locations; management both from a list view and from the floor-plan editor (see `floor-plan.md`); uniqueness rules.
- Out of scope: the plan-editing interactions themselves — those live in `floor-plan.md`.

## Requirements

### Rooms

- **FR-LOCS-001**: The system must allow creating a room with `name` and `shape_on_plan`.
- **FR-LOCS-002**: Room `name` must be unique **case-insensitively**.
- **FR-LOCS-003**: The system must allow renaming a room and modifying its `shape_on_plan`.
- **FR-LOCS-004**: The system must allow deleting a room **only** if it contains no storage locations.
- **FR-LOCS-005**: Attempting to delete a non-empty room must return an error listing the contained locations.

### Storage Locations

- **FR-LOCS-010**: The system must allow creating a storage location with `name`, `room_id`, and `shape_on_plan`.
- **FR-LOCS-011**: Location `name` must be unique **within its room** (case-insensitively). Two rooms may each have a "Shelf 1".
- **FR-LOCS-012**: The system must allow updating any field of a location except `id`, `created_at`, `updated_at`. Moving a location to a different `room_id` is allowed if the new room's uniqueness rule is satisfied.
- **FR-LOCS-013**: The system must allow deleting a storage location **only** if no items reference it.
- **FR-LOCS-014**: Attempting to delete a referenced location must return an error with a count of referencing items and a link to the **reassign** flow.
- **FR-LOCS-015**: A `shape_on_plan` for a storage location must lie entirely within its room's `shape_on_plan`. Requests that violate this must be rejected with a validation error naming the offending bound.

### List management

- **FR-LOCS-020**: The system must provide a list view grouped by room, showing each location's name, item count, and an Edit affordance.
- **FR-LOCS-021**: The list view must offer the same create/edit/delete actions as the floor-plan editor.

## UX Notes

- The **Locations** screen shows rooms as collapsible groups; under each group, the locations are listed with item counts.
- Each row has Edit and Delete affordances; Delete is disabled with a tooltip when blocked by references.
- Creating a location from this screen opens a form that lets the user pick the room and enter the name. The `shape_on_plan` defaults to a small rectangle placed in an empty area of the room; the user can fine-tune from the floor-plan editor.
- The floor-plan editor (see `floor-plan.md`) exposes the same underlying CRUD operations.

## Dependencies

- Entities: [Room](../03-domain-model.md#room), [StorageLocation](../03-domain-model.md#storagelocation).
- Floor-plan editor: `floor-plan.md`.
- Items referencing locations: `items.md`.

## Acceptance Criteria

- **AC-LOCS-001**: **Given** a room "Kitchen" with no locations, **when** a user creates a location "Spice drawer" in it, **then** the location appears nested under "Kitchen" with item count 0.
- **AC-LOCS-002**: **Given** a "Kitchen" already has a "Spice drawer", **when** a user tries to create another "spice drawer" (lower-case) in the same room, **then** the request is rejected as a duplicate.
- **AC-LOCS-003**: **Given** "Kitchen" has a "Spice drawer" and "Pantry" has no locations, **when** a user creates "Spice drawer" in "Pantry", **then** the request succeeds (uniqueness is per-room).
- **AC-LOCS-004**: **Given** a storage location referenced by 3 items, **when** a user tries to delete it, **then** deletion is blocked with a message naming the 3 items.
- **AC-LOCS-005**: **Given** a room shape of a rectangle (0,0,200,100), **when** a user attempts to create a location with shape (150,50,100,100), **then** the request is rejected because the shape extends past the room's right edge.
- **AC-LOCS-006**: **Given** a non-empty room, **when** a user tries to delete it, **then** deletion is blocked with a message listing its storage locations.

## Open Questions

- None in v1.
