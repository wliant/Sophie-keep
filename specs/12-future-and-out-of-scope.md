# Future and Out-of-Scope

These items are explicitly **not** in v1. Listing them here keeps v1 focused and prevents scope creep during implementation. Each line is a placeholder for a future spec addition — when any of these is taken on, it should be added under `04-functional/` (or a new top-level section) following `CONVENTIONS.md`.

## Explicit non-goals for v1

- **Authentication and authorization.** See `01-users-and-context.md`. The LAN-only trust model is a conscious choice.
- **Multi-household SaaS.** A single deployment serves a single household.
- **Public-internet exposure.** The app is designed to be reached only on the LAN.
- **Offline / PWA sync.** The app is online-only against the LAN server.
- **Native mobile apps.** Responsive web is the only client for v1.
- **Barcode / UPC scanning.**
- **Image recognition or auto-tagging.**
- **Unit conversion.**
- **Recipe and meal-planning integration.**
- **Shopping-service integrations** (Instacart, Amazon Fresh, etc.).
- **Price tracking / budgeting.**
- **Per-user profiles and activity history.**
- **Push notifications.**
- **Off-site / encrypted backups.**

## Likely future directions

These are natural extensions once v1 is stable. Each is linked to the open-issue id where relevant.

- **Per-device or passphrase auth** (OI-001).
- **Unit conversion and a structured unit model** (OI-002).
- **Multi-floor / multi-plan households** (OI-003).
- **Hierarchical item types** (OI-004).
- **Fuzzy search** (OI-011).
- **Barcode scanning** with on-device lookup tables (requires design of an item-database ingestion pipeline).
- **Off-site backups** with opt-in encryption (OI-015, OI-016).
- **Native iOS/Android app** sharing the web client's API.
- **Email/Matrix/Slack notifications** (would break the "no external services" posture — revisit then).
- **Meal-planning** that consumes inventory (OI-018).

## How to promote a future item into v2

1. Open a new file under `04-functional/` (or a new top-level section if cross-cutting).
2. Reference the relevant open-issue id; mark that id as resolved in `11-open-issues.md`.
3. Update `03-domain-model.md` only if new entities or fields are introduced.
4. Add acceptance criteria. Add NFR targets if any.
5. Remove the line from this file.
