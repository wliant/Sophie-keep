# Introduction

## Purpose

Sophie-keep is a household inventory management system. It helps members of a single household track what they own, how much of it they have, where it is kept, and when it expires — so they can quickly answer "do we have X?", "where is X?", and "do we need to buy more X?".

## Audience

This specification is written for:

- Engineers implementing Sophie-keep (or AI assistants doing the same).
- Reviewers evaluating whether the implementation meets requirements.
- Household members authoring change requests (via issues or PR descriptions).

## In scope (v1)

- Adding, modifying, deleting, and searching inventory items.
- Organizing items by **item type** and **storage location**.
- A visual **floor plan** of rooms and storage spots, editable in-app.
- Quantity tracking with low-stock alerts.
- Expiration-date tracking with expiry alerts.
- Photos attached to items.
- Auto-generated shopping list.
- Daily automatic backups with 30-day retention.
- Responsive web UI usable on phone, tablet, and desktop browsers.

## Out of scope (v1)

See `12-future-and-out-of-scope.md` for the full list. Notable non-goals:

- Authentication, per-user accounts, or multi-household tenancy.
- Offline / PWA sync.
- Public-internet exposure.
- Barcode/UPC scanning.
- Native mobile apps.
- Unit conversion (e.g., grams ↔ ounces).
- Recipe integration.

## Glossary

| Term | Definition |
|---|---|
| **Household** | The single group of people sharing the inventory. The system serves exactly one household. |
| **Item** | A physical thing being tracked (e.g., "paprika", "AA batteries"). |
| **Item Type** | A category for items (e.g., "Spice", "Battery"). Used for grouping, defaults, and filtering. |
| **Storage Location** | A specific place where items are kept (e.g., "Spice drawer"). Always belongs to a room. |
| **Room** | A top-level area of the home (e.g., "Kitchen"). Contains storage locations. |
| **Floor Plan** | A 2D visual layout of rooms and storage locations, editable in the UI. One active plan per household. |
| **Quantity** | The numeric count of an item currently on hand, expressed in a **unit**. |
| **Unit** | The unit of measure for an item's quantity (e.g., "pcs", "g", "ml"). |
| **Low-stock threshold** | The quantity at or below which an item is flagged as low-stock. |
| **Expiry / Expiration date** | The date after which an item is considered unsafe or unusable. |
| **Expiring-soon window** | The configurable lookahead (default 7 days) used to classify items as "expiring soon". |
| **Shopping list** | A derived list combining low-stock items, expired items, and manually-added entries. |
| **LAN** | The local-area network (home Wi-Fi / Ethernet) that the server is attached to. Only clients on the LAN can reach Sophie-keep. |

## Conventions

Requirements, acceptance criteria, and open issues carry stable IDs (`FR-*`, `NFR-*`, `AC-*`, `OI-*`). See `CONVENTIONS.md`.
