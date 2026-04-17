# Spec Authoring Conventions

These rules exist so the specification stays coherent as it grows.

## Filesystem layout

- Top-level files are numbered (`00-`, `01-`, …) to encode reading order. If a new topic belongs between two existing numbers, use a suffix (e.g. `03a-…`) rather than renumbering.
- Per-feature specs live under `04-functional/` — one file per feature area. Adding a feature = adding a file (plus a link in `04-functional/README.md`).
- Filenames are kebab-case, lowercase, `.md`.

## Requirement IDs

Every requirement carries a stable ID so cross-document references survive edits and file reorgs.

- Functional: `FR-<AREA>-NNN` — e.g. `FR-ITEMS-001`
- Non-functional: `NFR-<CATEGORY>-NNN` — e.g. `NFR-PERF-001`
- Acceptance criteria: `AC-<AREA>-NNN` — e.g. `AC-SEARCH-003`
- Open issues: `OI-NNN`

`<AREA>` is short and uppercase (`ITEMS`, `TYPES`, `LOCS`, `PLAN`, `SEARCH`, `EXPIRY`, `STOCK`, `SHOP`, `PHOTOS`, `BACKUP`).

Numbers are not reused when a requirement is removed — mark the line `[RETIRED]` and keep the ID.

## File template for `04-functional/*.md`

```markdown
# <Feature Name>

## Purpose
One paragraph: why this feature exists, what user need it serves.

## Scope
- In scope: …
- Out of scope: …

## Requirements
- FR-<AREA>-001: <testable statement>
- FR-<AREA>-002: …

## UX Notes
Screens, interactions, empty states, errors — at spec (not design) fidelity.

## Dependencies
Links to other spec files (entities in `03-domain-model.md`, other features, NFRs).

## Acceptance Criteria
- AC-<AREA>-001: Given … When … Then …

## Open Questions
Any parked items, cross-linked to `11-open-issues.md`.
```

Non-functional and cross-cutting files use the same template minus `UX Notes`.

## Cross-document links

- Use **relative** links (e.g. `../03-domain-model.md#item`) — do not include file extensions on anchors.
- Reference requirements by ID in prose (e.g. "…must meet `NFR-PERF-001`.") rather than by page-relative text.

## Change process

- Edit the **smallest** file that covers the change. Touching unrelated files is a review red flag.
- When a change spans files, update them in one commit and note the affected IDs in the commit message.
- Retired requirements are kept with `[RETIRED]` + a short reason; do not delete lines.
- When adding a new functional feature, the only required edits are: the new file under `04-functional/` and a link in `04-functional/README.md`. If a new entity is introduced, also update `03-domain-model.md`.

## Markdown style

- GitHub-flavored Markdown.
- ATX headings (`#`, `##`, …), sentence-case titles.
- Lists use `-`; do not mix `*` and `-`.
- Tables for enumerations longer than three items.
- No HTML except `<br>` in table cells when strictly necessary.

## Writing style

- Prefer **testable** statements. "The system must respond quickly" is wrong; "the system must return search results in under 300 ms for inventories up to 10,000 items" is right.
- Prefer **must / must not / may / should** (RFC 2119 sense).
- Avoid implementation detail (frameworks, languages) in spec text — put those in `07-data-and-storage.md` only as _placeholders_.
