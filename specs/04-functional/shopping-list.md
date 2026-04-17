# Shopping List

## Purpose

The shopping list turns "we're low on / we've expired" signals into an actionable list for a grocery run, and closes the loop by letting users restock quantities in-app on return. It reduces friction between Sophie-keep and the physical act of shopping.

## Scope

- In scope: auto-derived entries from low-stock and expired items; manual free-text entries; check-off flow; restock confirmation.
- Out of scope: sharing the list to third-party apps; delivery-service integration; price tracking.

## Requirements

### Composition

- **FR-SHOP-001**: The shopping list is the union of:
  - **Auto entries**: one derived entry for each item that is `is_low_stock` OR `is_expired` (see `low-stock-alerts.md`, `expiration-alerts.md`).
  - **Manual entries**: free-text `ShoppingListEntry` rows.
- **FR-SHOP-002**: Auto entries are computed at read time and are **not** persisted (matches `FR-EXPIRY-009`, `FR-STOCK-008`).
- **FR-SHOP-003**: Each auto entry must display a **reason** ("Low stock: 1 pcs left", "Expired 2 days ago").
- **FR-SHOP-004**: If the same item qualifies as both low-stock and expired, the list must show a single entry whose reason combines both states.
- **FR-SHOP-005**: Manual entries must have a `label` (1–120 chars) and a `checked` boolean.

### Interactions

- **FR-SHOP-010**: The system must allow creating, editing the label of, and deleting manual entries.
- **FR-SHOP-011**: The system must allow toggling the `checked` state of **any** entry, auto or manual. For auto entries, `checked` is stored ephemerally per-session on the server — a successful **Confirm restock** or page dismissal resets it. Implementation note: store a lightweight `auto_entry_check_state` table keyed by `item_id` that is cleared on restock or after 24 hours.
- **FR-SHOP-012**: The **Confirm restock** action must:
  1. For each checked auto entry whose source item is low-stock: increment the item's quantity by a restock amount supplied inline (default: amount needed to reach `effective_threshold + 1`, minimum 1).
  2. For each checked auto entry whose source item is expired: prompt the user inline to either update the expiration date to a new value (and optionally change quantity) or delete the item.
  3. For each checked manual entry: delete the manual entry.
  4. Emit `QuantityChange` records with `reason=shopping_restock` for every quantity modification.
- **FR-SHOP-013**: Confirm restock must be atomic at the record level — a failure during restock must not leave half-applied changes. If one item's update fails, the others must still apply, but the failure must be surfaced clearly.
- **FR-SHOP-014**: The system must allow clearing all checked entries without confirming a restock (for users who prefer to manage quantities elsewhere).

### Sorting and grouping

- **FR-SHOP-020**: The list must be ordered: unchecked entries first, then checked; within each group, sorted by item type, then name.
- **FR-SHOP-021**: The UI must group by item type with collapsible headers.

## UX Notes

- The Shopping list screen has: a header with counts ("12 to buy · 3 checked"), an Add-manual-entry input, the grouped list, a **Confirm restock** button, and a secondary **Clear checked** action.
- Tap-and-hold on an auto entry opens the underlying item detail for one-off edits.
- On small screens, the inline restock prompts for expired items open as bottom sheets.
- After a successful restock, the UI shows a toast summarizing what happened ("Updated 4 quantities, kept 1 as expired").

## Dependencies

- Sources: `low-stock-alerts.md`, `expiration-alerts.md`.
- Entity: [ShoppingListEntry](../03-domain-model.md#shoppinglistentry), [QuantityChange](../03-domain-model.md#quantitychange).

## Acceptance Criteria

- **AC-SHOP-001**: **Given** 3 low-stock items and 2 expired items (distinct), **when** the shopping list loads, **then** it shows 5 auto entries with appropriate reasons.
- **AC-SHOP-002**: **Given** one item that is both low-stock and expired, **when** the list loads, **then** it appears as a single entry with a combined reason.
- **AC-SHOP-003**: **Given** a manual entry "birthday candles", **when** a user checks it and confirms restock, **then** the manual entry is deleted from the list.
- **AC-SHOP-004**: **Given** a low-stock item with threshold 5 and quantity 2, **when** a user confirms restock with the default amount, **then** the item's quantity becomes `threshold + 1 = 6` and a `QuantityChange(delta=+4, reason=shopping_restock)` is recorded.
- **AC-SHOP-005**: **Given** an expired item is checked, **when** a user confirms restock and chooses "update expiration to 2026-05-01", **then** the item's `expiration_date` is updated and it no longer appears in the auto list.
- **AC-SHOP-006**: **Given** auto-entry check states exist, **when** 24 hours pass with no activity, **then** those check states are cleared.

## Open Questions

- `OI-013`: Whether to persist the restock "default amount" as a per-item preference. v1: always computed. Parked.
