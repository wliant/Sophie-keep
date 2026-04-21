# Floor Plan

## Purpose

The floor plan is the visual, spatial way to navigate inventory. Rather than a flat list of "Kitchen — Spice drawer", a household member sees a diagram of their home and taps the actual location to drill in. The plan is editable because homes change — shelves get added, rooms get rearranged — and users must be able to update the spatial model without a developer's help.

## Scope

- In scope: viewing the plan, navigating by tapping a location, and editing the plan (rooms, locations, labels, background image, door placement).
- Out of scope: multi-floor plans (deferred, `OI-003`); version history of the plan; collaborative real-time editing.

## Requirements

### View mode

- **FR-PLAN-001**: The system must render the single active `FloorPlan` on the **Floor Plan** screen, drawn from `Room.shape_on_plan` and `StorageLocation.shape_on_plan` values in the shared coordinate system (see `../03-domain-model.md#shape-on-plan-coordinate-system`).
- **FR-PLAN-002**: The plan must support pan and zoom (touch: pinch + drag; desktop: wheel + drag).
- **FR-PLAN-003**: Tapping a storage location must navigate to the Inventory list filtered to that location.
- **FR-PLAN-004**: Tapping a room (in a space not covered by a storage location) must navigate to the Inventory list filtered to any location in that room.
- **FR-PLAN-005**: Each location and each room must render its name as a label at a legible minimum size regardless of zoom; when a shape is too small to display a label, the label must be elided and revealed on hover/tap.
- **FR-PLAN-006**: Locations with one or more items flagged `is_expired`, `is_expiring_soon`, or `is_low_stock` must render a visual badge (e.g., a colored dot in the corner of the shape).

### Edit mode

- **FR-PLAN-010**: The system must provide an **Edit** toggle that switches the plan into an editable state. A non-edit-mode user must never be able to accidentally move a shape.
- **FR-PLAN-011**: In edit mode, users must be able to:
  - Create a new room by drawing a rectangle on an empty area of the plan.
  - Rename a room.
  - Resize a room by dragging its handles.
  - Move a room by dragging its body.
  - Delete a room (subject to `FR-LOCS-004`).
- **FR-PLAN-012**: In edit mode, users must be able to:
  - Create a new storage location by drawing a rectangle inside a room.
  - Rename a location.
  - Resize or move a location within its room.
  - Move a location to a different room by dragging it across room borders (implemented as atomic `room_id` change plus `shape_on_plan` update).
  - Delete a location (subject to `FR-LOCS-013`).
- **FR-PLAN-013**: Edits must be **applied on commit** via a Save action, not live, so an unsaved session can be discarded.
- **FR-PLAN-014**: The system must validate every edit against invariants at save time:
  - Room shapes fit within the plan bounds.
  - Location shapes fit within their room's shape.
  - Name uniqueness rules (see `storage-locations.md`).
  Violations must be reported inline with the offending shape highlighted.
- **FR-PLAN-015**: The system must allow uploading a **background image** for the plan (e.g., a scanned blueprint). The background is a reference only — shapes are still explicit `shape_on_plan` values.
- **FR-PLAN-016**: The system must allow setting the plan's logical `width` and `height`. Changing these must not cause any existing shape to fall outside the new bounds; if any would, the save is rejected.

### Doors

- **FR-PLAN-017**: In edit mode, users must be able to add, move, and remove doors. A door belongs to exactly one room and sits on one of that room's four walls.
- **FR-PLAN-018**: A door is defined by its `room_id`, `wall` (`north` | `south` | `east` | `west`), normalised position `t ∈ [0, 1]` along the wall, and `width` in logical units. The door must fit within the wall — i.e., the implied segment must not exceed the room boundary.
- **FR-PLAN-019**: Doors are saved as part of the floor-plan edit session and are included in the `GET /api/v1/floor-plan` response under `doors[]`.

### Concurrency

- **FR-PLAN-020**: If two clients edit the plan simultaneously, the last save wins at the record level (per-room and per-location). There is no plan-wide lock in v1. Open issue: `OI-005`.

## UX Notes

- The **Floor Plan** screen has two primary states: **View** and **Edit**, with a clearly labeled toggle.
- Snap-to-grid (e.g., 10 logical units) is enabled by default in edit mode; a toggle disables it.
- Long-press on a shape in view mode opens a quick menu: View items here / Edit this location.
- The plan must remain usable on a phone — edit controls (handles, labels) must have touch targets ≥ 44 px even when shapes are small.
- If no plan is defined yet (first-run), the system must show an **empty-state prompt** inviting the user to draw rooms.

## Dependencies

- Entities: [FloorPlan](../03-domain-model.md#floorplan), [Room](../03-domain-model.md#room), [StorageLocation](../03-domain-model.md#storagelocation).
- Validation rules from `storage-locations.md`.
- Photo storage for background image: `photos.md`.

## Acceptance Criteria

- **AC-PLAN-001**: **Given** the plan has no rooms, **when** the user opens the Floor Plan screen, **then** an empty-state prompt invites them to enter edit mode and draw a room.
- **AC-PLAN-002**: **Given** edit mode is off, **when** the user drags a shape, **then** the shape does not move and no change is recorded.
- **AC-PLAN-003**: **Given** a room with three storage locations, **when** the user taps a location in view mode, **then** the Inventory list opens filtered to that location.
- **AC-PLAN-004**: **Given** a location overlapping its room's boundary, **when** the user attempts to save, **then** save is rejected and the offending shape is highlighted with an explanatory message.
- **AC-PLAN-005**: **Given** an unsaved editing session, **when** the user discards the session, **then** the server state is unchanged on reload.
- **AC-PLAN-006**: **Given** an item in a room with an expired item, **when** the user views the plan, **then** a badge renders on that location's shape.

## Open Questions

- `OI-003`: Multi-floor / multi-plan households.
- `OI-005`: Collaborative editing model beyond last-writer-wins.
