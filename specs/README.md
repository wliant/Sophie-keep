# Sophie-keep Specification

This folder is the **authoritative specification** for Sophie-keep, a household inventory management system. Implementation is derived from these documents.

## One-line description

A responsive web app that lets members of a household quickly add, modify, and search inventory items — organized by item type and visualized on a floor plan of storage locations.

## How to read

Start here, then follow the numbered files. Use `CONVENTIONS.md` as the authoring guide when extending the spec.

## Table of contents

| # | File | Topic |
|---|------|-------|
| — | [CONVENTIONS.md](./CONVENTIONS.md) | How to author and extend the spec |
| 00 | [00-introduction.md](./00-introduction.md) | Purpose, scope, glossary |
| 01 | [01-users-and-context.md](./01-users-and-context.md) | User/trust model, deployment context |
| 02 | [02-use-cases.md](./02-use-cases.md) | Representative user flows |
| 03 | [03-domain-model.md](./03-domain-model.md) | Entities, relationships, invariants |
| 04 | [04-functional/](./04-functional/README.md) | Per-feature functional specs |
| 05 | [05-non-functional.md](./05-non-functional.md) | Performance, reliability, security, scale |
| 06 | [06-ui.md](./06-ui.md) | Screens and interaction requirements |
| 07 | [07-data-and-storage.md](./07-data-and-storage.md) | Logical schema, indexes, photo storage |
| 08 | [08-api.md](./08-api.md) | HTTP API surface, error model |
| 09 | [09-validation-and-errors.md](./09-validation-and-errors.md) | Field constraints, uniqueness, error taxonomy |
| 10 | [10-acceptance-criteria.md](./10-acceptance-criteria.md) | Cross-cutting acceptance tests |
| 11 | [11-open-issues.md](./11-open-issues.md) | Assumptions, constraints, parked questions |
| 12 | [12-future-and-out-of-scope.md](./12-future-and-out-of-scope.md) | Explicit non-goals and future ideas |
| 13 | [13-testability.md](./13-testability.md) | Unit, integration, and e2e testing strategy |
| 14 | [14-developer-experience.md](./14-developer-experience.md) | Docker compose layout, env vars, concurrent local instances |
| 15 | [15-observability.md](./15-observability.md) | Structured logging, error propagation, health/metrics |

## Extension model

Adding a new feature should be a matter of creating a single new file under `04-functional/` and linking it from the functional index. See `CONVENTIONS.md`.
