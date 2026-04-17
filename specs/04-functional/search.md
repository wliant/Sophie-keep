# Search

## Purpose

Search is how a household member answers "do we have X?" in seconds, and it's the autocomplete engine behind Quick-add. It must feel instant on phones and tablets, and must cover the attributes users actually think in: name, type, location, expiry, stock status.

## Scope

- In scope: full-text over name and notes; structured filters; sorting; pagination; autocomplete.
- Out of scope: fuzzy/typo-tolerant search; synonym dictionaries; semantic search.

## Requirements

### Query behavior

- **FR-SEARCH-001**: The system must support a text query that matches case-insensitively against `Item.name` and `Item.notes` using substring **and** prefix-per-word semantics (e.g., "pap" matches "paprika" and "Hungarian paprika"; "pa pri" matches "Hungarian paprika").
- **FR-SEARCH-002**: The system must support filtering by:
  - `item_type_id` (one or more),
  - `storage_location_id` (one or more),
  - `room_id` (one or more; expanded to all its locations),
  - `expires_within_days` (number, includes items already expired),
  - `low_stock_only` (boolean),
  - `has_photo` (boolean).
- **FR-SEARCH-003**: Text query and filters must combine with AND semantics.
- **FR-SEARCH-004**: The system must support sorting by: relevance (default when a text query is present), `name` (asc/desc), `updated_at` (desc default when no text query), `expiration_date` (nulls last), `quantity`.
- **FR-SEARCH-005**: The system must paginate results with a default page size of 50 and a maximum page size of 200.

### Performance

- **FR-SEARCH-010**: Search and autocomplete must meet `NFR-PERF-001` — results in under 300 ms at the 95th percentile for up to 10,000 items. The underlying indexes are specified in `../07-data-and-storage.md`.

### Autocomplete

- **FR-SEARCH-020**: The Quick-add autocomplete must use the same search endpoint, restricted to name matches, returning the top 5 items sorted by: exact name match first, then prefix match, then `updated_at` desc.
- **FR-SEARCH-021**: Autocomplete must return in under 150 ms at the 95th percentile (`NFR-PERF-003`) so typing feels responsive.

### Result payload

- **FR-SEARCH-030**: Each result row must include enough information to render an Inventory list row without a follow-up fetch: item id, name, type name, room name, location name, quantity, unit, expiration_date, low-stock flag, expiring-soon flag, expired flag, thumbnail photo URL (if any).

### Empty states and errors

- **FR-SEARCH-040**: When there are no results, the system must render an empty-state suggesting possible next actions (Clear filters, Quick-add "X" as a new item).
- **FR-SEARCH-041**: Invalid filter values (e.g., non-numeric `expires_within_days`) must return a validation error without performing a partial search.

## UX Notes

- The main Search screen shows the text input, a row of active filter chips (dismissable), and the result list.
- Mobile: filters open in a full-screen sheet; desktop: filters are a side panel.
- The Quick-add modal reuses the autocomplete result shape but renders a compressed row (name + type + location + current quantity).
- Typing is debounced at 120 ms before firing a query.

## Dependencies

- Entity: [Item](../03-domain-model.md#item).
- Performance NFRs: `../05-non-functional.md` (`NFR-PERF-001`, `NFR-PERF-003`).
- Storage indexes: `../07-data-and-storage.md`.

## Acceptance Criteria

- **AC-SEARCH-001**: **Given** 10,000 items with the word "paprika" in one of them, **when** the user searches "paprika", **then** that item is in the result list and the response completes in under 300 ms at p95.
- **AC-SEARCH-002**: **Given** items "Hungarian paprika" and "Paper towels", **when** the user searches "pap", **then** both appear (name matches "paprika" and "Paper").
- **AC-SEARCH-003**: **Given** the user sets filter `low_stock_only=true`, **when** the query runs, **then** only items where `quantity <= effective_low_stock_threshold` are returned.
- **AC-SEARCH-004**: **Given** no text query and no filters, **when** the search loads, **then** the first page of up to 50 items ordered by `updated_at` desc is returned.
- **AC-SEARCH-005**: **Given** quick-add autocomplete for "pa", **when** typing completes, **then** up to 5 name-matching items are returned and the response completes in under 150 ms at p95.
- **AC-SEARCH-006**: **Given** `expires_within_days=7`, **when** the query runs, **then** the results include every item whose `expiration_date` is today, past, or up to 7 days in the future.

## Open Questions

- `OI-011`: Fuzzy matching for typos (e.g., "papirka" → "paprika"). Parked.
