# Expiration Alerts

## Purpose

Expiration alerts prevent waste and unsafe use. Users should see at a glance which items are expired or expiring soon, both on the dashboard and inline with any item they encounter.

## Scope

- In scope: per-item expiration date; dashboard widget; per-item badges; configurable expiring-soon window; inclusion in the auto-generated shopping list.
- Out of scope: push notifications (no external services in v1); per-item-type expiry defaults; rolling expiry based on "opened date".

## Requirements

- **FR-EXPIRY-001**: The system must allow setting, changing, and clearing an `expiration_date` on any item.
- **FR-EXPIRY-002**: The system must expose a household-wide **expiring-soon window** in days. Default: **7**. Configurable in Settings, range 1–90.
- **FR-EXPIRY-003**: An item is `is_expired` when `expiration_date` is non-null and strictly before today (server local date).
- **FR-EXPIRY-004**: An item is `is_expiring_soon` when `expiration_date` is non-null and within `[today, today + window_days]`, inclusive.
- **FR-EXPIRY-005**: The **Dashboard** must include an "Expiring soon" widget listing every item that is `is_expiring_soon`, sorted by `expiration_date` ascending, grouped as "Today", "Tomorrow", "In N days".
- **FR-EXPIRY-006**: The Dashboard must include an "Expired" widget listing every `is_expired` item, sorted by `expiration_date` ascending (earliest expired first).
- **FR-EXPIRY-007**: Inventory list rows and item detail must render a visible badge when an item is `is_expiring_soon` or `is_expired`, with distinct styling so the two are not confused.
- **FR-EXPIRY-008**: Expired and expiring-soon items must automatically appear on the shopping list (see `shopping-list.md`).
- **FR-EXPIRY-009**: The server must compute `is_expired` and `is_expiring_soon` at request time; it must **not** persist stale booleans. (Tomorrow's "today" must reclassify without a cron.)
- **FR-EXPIRY-010**: Clearing an `expiration_date` must remove any expiry-related badges and exclude the item from the expiry widgets on the next load.

## UX Notes

- Dashboard widgets collapse when empty — "Nothing expiring in the next 7 days" is shown as a quiet confirmation state, not an empty card.
- Badges use color + icon + accessible label ("expiring in 2 days"). Color alone must not be the sole signal (see `../05-non-functional.md` accessibility).
- Tapping an expiring-soon row opens item detail with the quantity controls already in view.

## Dependencies

- Entity: [Item](../03-domain-model.md#item).
- Shopping list integration: `shopping-list.md`.

## Acceptance Criteria

- **AC-EXPIRY-001**: **Given** today is 2026-04-17 and an item's `expiration_date` is 2026-04-19 with the default 7-day window, **when** the dashboard loads, **then** the item appears in "Expiring soon" under "In 2 days".
- **AC-EXPIRY-002**: **Given** today is 2026-04-17 and an item's `expiration_date` is 2026-04-10, **when** the dashboard loads, **then** the item appears in "Expired", not in "Expiring soon".
- **AC-EXPIRY-003**: **Given** the window is changed from 7 to 3 days, **when** the dashboard reloads, **then** items with expiry 4–7 days out disappear from the widget.
- **AC-EXPIRY-004**: **Given** an item with an expiration date, **when** its date is cleared, **then** its expiry badge disappears on the next fetch.
- **AC-EXPIRY-005**: **Given** an item is expiring soon or expired, **when** the shopping list is loaded, **then** the item is included in the auto-derived entries.

## Open Questions

- None in v1.
