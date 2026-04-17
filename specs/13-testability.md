# Testability

## Purpose

Every subproject must be testable in isolation and together. Tests exist so refactors are safe, regressions are caught before deployment, and the acceptance criteria in `10-acceptance-criteria.md` (and each functional file) are verifiable by machine.

## Overview of test layers

Sophie-keep's test strategy has three layers. Each has a distinct scope, style, and target.

| Layer | Scope | Style | External deps |
|---|---|---|---|
| **Unit tests** | A single module / class / function within one subproject. | **Sociable** — allow real collaborators within the subproject. | Not allowed (stub only what leaves the subproject). |
| **Integration tests** | Multiple modules of a subproject wired together, up to the subproject's boundary. | Realistic within the subproject; exercise adapters. | **Mocked** — any dependency outside the subproject (other services, third-party APIs) is faked. |
| **End-to-end tests** | The assembled, running system. | Black-box against the HTTP API and/or the browser UI. | **Real** — the full deployment, including the database and photo storage. |

### Subprojects

Sophie-keep is expected to split into at least these subprojects (names illustrative):

- `server` — HTTP API, persistence, business logic.
- `web` — browser client (responsive web UI).
- `e2e` — a **dedicated** subproject that runs only end-to-end tests (see below).

Additional subprojects (e.g. shared libraries, a thumbnail worker) must follow the same testability rules.

## Unit tests

- **FR-TEST-001**: Every subproject with executable code must have a unit-test suite runnable via a standard command documented in that subproject's README (e.g., `npm test`, `pytest`, `cargo test`).
- **FR-TEST-002**: Unit tests must follow **sociable** style:
  - Prefer exercising a unit together with its in-subproject collaborators.
  - Replace only collaborators that are **(a)** outside the subproject boundary, **(b)** non-deterministic (clock, random, network), or **(c)** slow enough to violate `NFR-TEST-001`.
  - Do **not** replace a collaborator solely to assert its invocation; prefer asserting on **observable behavior** (return values, emitted events, state at a boundary).
- **FR-TEST-003**: Unit tests must not make real network calls, real filesystem writes outside a sanctioned temp dir, or real database connections.
- **FR-TEST-004**: Unit tests must be deterministic — a suite that passes once must pass every time with the same inputs and environment.
- **FR-TEST-005**: Tests assert on **behavior, not implementation details**. Renaming a private function or reshuffling internal calls must not break a unit test unless the observable behavior changed.
- **FR-TEST-006**: Time-dependent logic (expiration, expiring-soon) must be testable without wall-clock delays — the system must expose a clock abstraction that tests can fix to a chosen instant.

## Integration tests

- **FR-TEST-020**: Every subproject must have an integration-test suite that runs its components together, up to the subproject's natural boundary.
- **FR-TEST-021**: Any dependency **outside** the subproject boundary must be mocked (e.g., a stub HTTP server, a fake client). Concretely:
  - For `server`: the **database** is not an external dependency at the subproject boundary (it is part of the deployment). Integration tests may use a real embedded DB or a containerized DB started by the test harness. Filesystem access for photos is similarly in-scope for the server subproject.
  - For `web`: the **server** is external. Integration tests mock HTTP responses (e.g., MSW).
- **FR-TEST-022**: Integration tests must clean up their state — each test starts from a known, isolated state (fresh DB schema, clean temp dir).
- **FR-TEST-023**: Integration tests must run in parallel-safe isolation — they may be executed concurrently without interfering with each other (via per-test databases, per-test temp dirs, or equivalent).
- **FR-TEST-024**: Integration tests must cover at least:
  - Every HTTP endpoint listed in `08-api.md`, happy path + representative error cases.
  - Every uniqueness / referential / semantic rule in `09-validation-and-errors.md`.
  - Atomic operations (type merge, confirm-restock, floor-plan edit-session).
  - Photo upload validation (size, MIME, magic bytes).

## End-to-end tests (dedicated `e2e` subproject)

- **FR-TEST-040**: The repository must contain an `e2e` subproject that is **independent** — it imports no server or web source code, only the public API contract.
- **FR-TEST-041**: The `e2e` subproject must be **configurable** via environment variables so the same suite can target:
  - A **local** system (e.g., `http://localhost:${APP_PORT}`) started by `docker compose` (see `14-developer-experience.md`).
  - A **deployed** system (e.g., `http://sophie.home.lan`).
  - Any other reachable Sophie-keep instance.
- **FR-TEST-042**: Configuration is surfaced through at least these environment variables (no hard-coded hosts):
  - `SOPHIE_E2E_BASE_URL` (required)
  - `SOPHIE_E2E_SEED_MODE` — `reset` | `append` | `readonly` (default `reset`, meaning the suite may destructively seed and clear state; `readonly` disables any test that mutates state; `append` adds seed data without deletion).
  - `SOPHIE_E2E_BROWSER` — `chromium` | `firefox` | `webkit` (for UI tests).
  - `SOPHIE_E2E_HEADLESS` — `true` | `false`.
  - `SOPHIE_E2E_TIMEOUT_MS` — default per-test timeout.
- **FR-TEST-043**: When `SOPHIE_E2E_SEED_MODE=readonly`, destructive tests must self-skip with a clear message; non-destructive tests must continue.
- **FR-TEST-044**: The `e2e` suite must not require any local source of the server or web; it must work against a compiled/deployed instance reachable only via its HTTP and HTML surface.
- **FR-TEST-045**: The `e2e` suite must cover every cross-cutting acceptance criterion in `10-acceptance-criteria.md` that exercises the running system (performance, quick-add interaction budget, concurrency, backup round-trip, accessibility smoke).
- **FR-TEST-046**: Failing e2e tests must capture and store, under `e2e/artifacts/<test-id>/`:
  - The failing assertion and stack.
  - Server logs captured for the test window (when the target is local; when remote, a note explaining how to correlate by `request_id`).
  - For UI tests: a screenshot and a page HTML snapshot at failure.
- **FR-TEST-047**: E2E tests must tag themselves by concern (`@smoke`, `@performance`, `@accessibility`, `@backup`) so CI can run subsets.

## Coverage and gates

- **NFR-TEST-001**: Unit tests for a subproject must run to completion locally in under 60 s on a developer laptop.
- **NFR-TEST-002**: Integration tests for a subproject must run to completion locally in under 5 minutes on a developer laptop.
- **NFR-TEST-003**: The `@smoke` subset of the e2e suite must run to completion in under 3 minutes against a local deployment.
- **NFR-TEST-004**: Line coverage is **not** a hard gate; it is reported but not required to exceed a specific threshold. Mutation coverage (if added) is preferred because it measures behavior coverage rather than lines touched.
- **FR-TEST-060**: CI must run unit tests and integration tests on every push; the e2e `@smoke` tag must run on every merge into the default branch; full e2e must run nightly.

## Test data

- **FR-TEST-070**: Every subproject must provide a seed helper that can populate a fresh database with a deterministic, named scenario (e.g., `empty`, `small-household`, `ten-k-items`).
- **FR-TEST-071**: Performance-sensitive acceptance criteria (e.g., `AC-CROSS-001`) must use the `ten-k-items` scenario.
- **FR-TEST-072**: Seed data must be idempotent — running the same seed twice produces the same state.

## Reporting

- **FR-TEST-080**: All test runners must emit a machine-readable report (JUnit XML or equivalent) so CI can summarize results uniformly across subprojects.
- **FR-TEST-081**: On failure, tests must produce output that a developer can act on without re-running locally (assertion message + context +, where relevant, suggested seed command).

## Acceptance Criteria

- **AC-TEST-001**: **Given** a developer runs the documented unit-test command in any subproject, **when** the tests complete, **then** no real network request, real external service, or real filesystem write outside the test temp dir occurred (verifiable via a sandboxing check in CI).
- **AC-TEST-002**: **Given** an integration test for `POST /api/v1/items`, **when** it runs, **then** it exercises the real request → validation → persistence → response path using a real (ephemeral) database.
- **AC-TEST-003**: **Given** `SOPHIE_E2E_BASE_URL` is set to a local docker-compose URL, **when** the e2e `@smoke` tag runs, **then** it completes in under 3 minutes with green results.
- **AC-TEST-004**: **Given** `SOPHIE_E2E_BASE_URL` is set to a deployed instance and `SOPHIE_E2E_SEED_MODE=readonly`, **when** the e2e suite runs, **then** destructive tests are skipped with a clear message and no state is modified on the target.
- **AC-TEST-005**: **Given** a failing e2e UI test, **when** the run completes, **then** a screenshot and an HTML snapshot exist under `e2e/artifacts/<test-id>/`.
- **AC-TEST-006**: **Given** a unit test fixes the system clock to 2026-04-17 and sets an item's `expiration_date` to 2026-04-19, **when** the expiring-soon flag is computed, **then** it is `true` (window default 7 days) without any real wait.

## Dependencies

- API surface: `08-api.md`.
- Acceptance criteria sourced from per-feature files and `10-acceptance-criteria.md`.
- Docker compose entry points and env variables: `14-developer-experience.md`.
- Observability (request IDs for log correlation): `15-observability.md`.

## Open Questions

- `OI-020`: Whether to adopt a mutation-testing tool (Stryker/PIT/cargo-mutants). Parked for v1.
