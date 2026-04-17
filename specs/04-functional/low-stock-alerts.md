# Low-Stock Alerts

## Purpose

Low-stock alerts tell users what to buy before they run out. The threshold must be expressible per-item (because some items have unique patterns) while also supporting a type-level default (so a user sets "always reorder spices at 10 g" once).

## Scope

- In scope: per-item threshold; per-type default threshold; dashboard widget; per-item badges; inclusion on the shopping list.
- Out of scope: trend-based forecasting ("you usually run out every 3 weeks"); reorder quantity suggestion beyond a fixed default.

## Requirements

- **FR-STOCK-001**: The system must allow setting, changing, and clearing an item's `low_stock_threshold`.
- **FR-STOCK-002**: The system must allow setting, changing, and clearing an item type's `default_low_stock_threshold`.
- **FR-STOCK-003**: An item's **effective threshold** is `Item.low_stock_threshold` when non-null, otherwise `ItemType.default_low_stock_threshold`, otherwise undefined.
- **FR-STOCK-004**: An item is `is_low_stock` when its effective threshold is defined and `quantity <= effective_threshold`.
- **FR-STOCK-005**: The **Dashboard** must include a "Low stock" widget listing every `is_low_stock` item, sorted by `quantity` ascending then `name` ascending.
- **FR-STOCK-006**: Inventory list rows and item detail must render a low-stock badge when `is_low_stock` is true.
- **FR-STOCK-007**: Low-stock items must automatically appear on the shopping list (see `shopping-list.md`).
- **FR-STOCK-008**: The server must compute `is_low_stock` at request time; it must not persist stale booleans.
- **FR-STOCK-009**: Item detail must show how the effective threshold resolves (e.g., "20 g (inherited from type Spice)" vs "20 g (set on this item)").

## UX Notes

- The widget collapses to "No items are low on stock" when empty.
- A per-item row on the shopping list indicates the reason ("Low stock: 1 left", "Expired 3 days ago") so the user understands why each line is there.
- Editing the threshold on item detail offers a "Use type default" toggle that clears the stored value and re-renders the inherited display.

## Dependencies

- Entities: [Item](../03-domain-model.md#item), [ItemType](../03-domain-model.md#itemtype).
- Shopping list integration: `shopping-list.md`.

## Acceptance Criteria

- **AC-STOCK-001**: **Given** an item with `low_stock_threshold=5` and `quantity=6`, **when** the dashboard loads, **then** the item is not in the low-stock widget.
- **AC-STOCK-002**: **Given** the same item's quantity is decremented to 5, **when** the dashboard reloads, **then** the item appears in the low-stock widget.
- **AC-STOCK-003**: **Given** an item whose `low_stock_threshold` is null and whose type has `default_low_stock_threshold=10`, **when** quantity is 8, **then** the item is `is_low_stock`.
- **AC-STOCK-004**: **Given** an item with no per-item threshold and a type with no default, **when** quantity is 0, **then** the item is **not** `is_low_stock` (no threshold is defined).
- **AC-STOCK-005**: **Given** a low-stock item, **when** the shopping list loads, **then** the item appears with reason "Low stock: `quantity` `unit` left".

## Open Questions

- `OI-012`: Should `is_low_stock` also be true when `quantity == 0` regardless of threshold? v1 says no — zero-quantity items without a threshold are silent. Parked for revisit.
