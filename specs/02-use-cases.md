# Use Cases

These narratives anchor the requirements. Each references the functional specs it exercises.

## UC-1: Quick-add after a grocery run

**Actor**: A household member who just bought groceries.

**Trigger**: Puts away bags, grabs phone.

**Flow**:

1. Opens Sophie-keep on phone.
2. Taps the prominent **Quick-add** button.
3. Types "paprika", the system autocompletes and pre-fills the item type (Spice), unit (g), and last-known storage location (Spice drawer).
4. Taps **Save**.

The item either increments its quantity (if it already exists) or is created new.

**Success criteria**: End-to-end flow completes in **≤ 3 interactions** from the dashboard per `NFR-PERF-002` (see `05-non-functional.md`). Detailed requirements in `04-functional/items.md`.

## UC-2: Decrement quantity on consumption

**Actor**: A household member using up an item.

**Flow**:

1. Opens Sophie-keep, taps the search or Inventory list.
2. Finds the item.
3. Taps the **–** (decrement) control on its row.

**Success criteria**: Quantity decreases by one unit. If it hits the low-stock threshold, the item immediately appears on the dashboard's low-stock widget.

## UC-3: Ad-hoc search — "do we have paprika?"

**Actor**: A household member standing at the stove, wondering whether to add paprika to the shopping list.

**Flow**:

1. Opens Sophie-keep.
2. Types "paprika" into the search box.
3. Sees the item, its storage location ("Spice drawer"), and current quantity.

**Success criteria**: Results render in under **300 ms** per `NFR-PERF-001`. See `04-functional/search.md`.

## UC-4: Edit the floor plan to add a new shelf

**Actor**: A household member who just installed a new shelf in the garage.

**Flow**:

1. Opens the **Floor Plan** screen.
2. Switches to **Edit** mode.
3. Selects the Garage room, drags a rectangle to draw the new shelf, labels it "Garage — Shelf 3".
4. Saves.

**Success criteria**: The new storage location is immediately selectable from the Item form and appears as a filter on the Inventory list. See `04-functional/floor-plan.md`.

## UC-5: Review expiring-soon items before shopping

**Actor**: A household member planning meals for the week.

**Flow**:

1. Opens the **Dashboard**.
2. Sees the **Expiring soon** widget listing items within the configured window.
3. Optionally clicks an item to update its quantity or mark it consumed.

**Success criteria**: Widget shows every item whose expiration date is within the expiring-soon window (default 7 days). See `04-functional/expiration-alerts.md`.

## UC-6: Generate a shopping list

**Actor**: A household member before going to the store.

**Flow**:

1. Opens the **Shopping list** screen.
2. Sees the auto-composed list: every low-stock item + every expired item.
3. Optionally adds free-text entries ("birthday candles").
4. At the store, checks items off as they're purchased.
5. On return, taps **Confirm restock**; the system bumps quantities of the checked-off items.

**Success criteria**: The list re-computes whenever underlying inventory changes. Manual entries persist until checked off. See `04-functional/shopping-list.md`.

## UC-7: Restore from backup after data loss

**Actor**: A household member (or admin) recovering from a disk failure or accidental mass-delete.

**Flow**:

1. Opens the **Settings / Backups** screen.
2. Selects a backup from the last 30 days.
3. Confirms restore.

**Success criteria**: Inventory and photos are restored to the chosen point. See `04-functional/backup-restore.md`.
