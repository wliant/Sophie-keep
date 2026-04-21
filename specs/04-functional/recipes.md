# Recipes

## Purpose

The recipe book lets a household store recipes (ingredients, steps, tags, timing) and answer the question **"what can we cook with what we have?"** by matching ingredient requirements against current inventory. It also lets the user mark a recipe as cooked, decrementing the consumed items so the inventory stays in sync.

## Scope

- In scope: CRUD for recipes and their ingredients; tagging (free-form JSON list, no separate entity); inventory matching (`makeable` / `partial` / `missing` / `unit_mismatch`); cook action that decrements inventory.
- Out of scope: automatic unit conversion (e.g. `g` ↔ `kg`); nutritional data; per-user ratings; sharing or import from external sites; automatic servings scaling at cook time (deferred — see `OI-RECIPES-001`).

## Requirements

### Entities

- **FR-RECIPES-001**: The system must support a `Recipe` entity with `id`, `name` (1–120 chars, unique case-insensitively), `description` (≤ 2,000 chars), `steps` (ordered list of step strings, each ≤ 2,000 chars, up to 50 steps), `tags` (list of lowercase strings, each 1–40 chars, up to 20 tags, unique), `servings` (optional positive number), `prep_minutes` (optional non-negative integer), `cook_minutes` (optional non-negative integer), `notes` (≤ 2,000 chars), `photo_ids` (up to 10), `created_at`, `updated_at`.
- **FR-RECIPES-002**: The system must support a `RecipeIngredient` entity with `id`, `recipe_id`, `item_type_id` (reference to existing `ItemType`), `required_quantity` (positive number), `required_unit` (same unit regex as items), `optional` (boolean, default false), `note` (≤ 200 chars, e.g. "finely chopped"), and `sort_order` (preserves display order).
- **FR-RECIPES-003**: Deleting a recipe must cascade to its `RecipeIngredient` rows.
- **FR-RECIPES-004**: Deleting an `ItemType` that is referenced by any `RecipeIngredient` must be blocked with `CONFLICT_REFERENCED`, consistent with existing `Item` references.

### Create / read / update / delete

- **FR-RECIPES-010**: The system must allow creating a recipe together with its ingredients in a single request. Validation must reject the whole request if any ingredient is invalid; no partial recipe is persisted.
- **FR-RECIPES-011**: Tag strings must be trimmed, lower-cased, and de-duplicated at write time.
- **FR-RECIPES-012**: The system must allow updating any field of a recipe and replacing its ingredient list in a single request. Optimistic concurrency via `base_updated_at` applies, matching items.
- **FR-RECIPES-013**: The system must allow deleting a recipe. Photos owned by the recipe are deleted.

### Tagging

- **FR-RECIPES-020**: The system must expose an endpoint returning the distinct set of tags across all recipes, for tag-autocomplete in the UI.
- **FR-RECIPES-021**: The recipe list endpoint must support a `tag` filter (single tag). When supplied, only recipes carrying that tag are returned.

### Inventory matching

- **FR-RECIPES-030**: For each recipe, the system must compute a per-ingredient availability status based on current inventory totals grouped by `(item_type_id, unit)`:
  - `ok` — the sum of on-hand quantities with the same item type **and** the same unit as the ingredient is ≥ `required_quantity`.
  - `short` — the sum is > 0 but < `required_quantity`; the `shortfall` (`required_quantity − sum`) must be reported.
  - `missing` — there is no inventory of that item type at all.
  - `unit_mismatch` — inventory exists for the item type but none of it uses the ingredient's `required_unit`.
- **FR-RECIPES-031**: Unit matching must be strict. The system must **not** convert between units (e.g. `g` ↔ `kg`).
- **FR-RECIPES-032**: Optional ingredients (`optional = true`) must not cause the recipe-level status to drop below `makeable`.
- **FR-RECIPES-033**: The recipe-level match status is derived at read time (not stored) and must be:
  - `makeable` when every required (non-optional) ingredient is `ok`.
  - `partial` when every required ingredient is `ok` or `short`, and at least one is `short`.
  - `missing` when any required ingredient is `missing` or `unit_mismatch`.
- **FR-RECIPES-034**: The per-ingredient result must include a `soonest_expiration_date` computed from contributing inventory rows, so the UI can flag recipes that use-up expiring stock.
- **FR-RECIPES-035**: The recipes list endpoint must support a `match_status` filter (`makeable | partial | missing`) and a shorthand `makeable=true`.

### Cook action

- **FR-RECIPES-040**: The system must expose a **Cook** action on a recipe that decrements inventory to reflect that the recipe has been prepared.
- **FR-RECIPES-041**: The action must fail with `SEMANTIC_ERROR` if any required (non-optional) ingredient would be decremented below zero, or if any required ingredient is `missing` / `unit_mismatch`. No decrements are applied in that case.
- **FR-RECIPES-042**: For each required ingredient, the system must decrement inventory rows of the same `item_type_id` and `unit` in an order the system chooses (default: expiration_date ASC NULLS LAST, then updated_at ASC) until the required quantity is consumed. Each decrement must emit a `QuantityChange` with `reason = 'recipe_cooked'`.
- **FR-RECIPES-043**: Optional ingredients must be skipped by default. The request may pass a `skip_optional` flag (default `true`) or enumerate them explicitly (future work).
- **FR-RECIPES-044**: The action must support a `dry_run` flag that computes and returns the planned decrements without writing anything.
- **FR-RECIPES-045**: The full cook operation must run in a single database transaction.

### Photos

- **FR-RECIPES-050**: Photos uploaded with `owner_kind = 'recipe'` must be associated with a recipe. Deletion of a recipe removes its photos.

## UX Notes

- A **Recipes** entry appears in the primary navigation next to Inventory.
- **Recipes list**: search box, tag chips (click to filter), a "Can make now" toggle, cards showing name, top tags, servings/time, and a match-status badge (`Makeable` green, `Partial` amber, `Missing` red, `Unit mismatch` grey).
- **Recipe detail**: header (name, tags, servings, prep/cook time), ingredients panel (each row: required qty + unit, on-hand sum, per-ingredient status pill, expiration warning if applicable), steps list (numbered), notes, photos, and a primary **Cook this** button. A "Dry-run" option in the cook modal shows the planned decrements before applying.
- **Recipe edit form**: powered by the existing `FormField` component; the ingredient picker reuses the item-type selector; the tag input offers suggestions from `/api/v1/recipes/tags`.
- When the match badge is `unit_mismatch` the UI explains: "You have flour in kg but the recipe needs it in g — add the correct unit to an inventory row or edit the recipe."

## Dependencies

- Entities: [Recipe](../03-domain-model.md#recipe), [RecipeIngredient](../03-domain-model.md#recipeingredient), [ItemType](../03-domain-model.md#itemtype), [QuantityChange](../03-domain-model.md#quantitychange).
- Related features: `items.md` (inventory source), `item-types.md` (referenced by ingredients), `photos.md` (recipe photos reuse the same pipeline).

## Acceptance Criteria

- **AC-RECIPES-001**: **Given** item types `Flour`, `Egg`, `Milk` each with enough inventory in `g` / `pcs` / `ml`, **when** I create a recipe "Pancakes" needing 200 g flour, 2 pcs egg, 300 ml milk and fetch the list, **then** the recipe card shows `match_status = makeable`.
- **AC-RECIPES-002**: **Given** a recipe that requires 300 g flour **and** the household has only 100 g flour, **when** the list is fetched, **then** the recipe's status is `partial` and the detail view reports a `shortfall` of 200 g for flour.
- **AC-RECIPES-003**: **Given** a recipe requiring 200 g flour and the household has flour only in `kg`, **when** the detail is fetched, **then** the flour ingredient's status is `unit_mismatch` and the recipe-level status is `missing`.
- **AC-RECIPES-004**: **Given** a recipe whose only short ingredient is marked `optional = true`, **when** the list is fetched, **then** the recipe-level status is `makeable`.
- **AC-RECIPES-005**: **Given** two inventory rows of the same item type and unit in different locations summing to 500 g, **when** a recipe requires 400 g, **then** the ingredient is `ok` (the match sums across locations).
- **AC-RECIPES-006**: **Given** a makeable recipe, **when** I POST to `/recipes/:id/cook`, **then** the required ingredient quantities are decremented across the chosen inventory rows, `QuantityChange` rows with `reason = 'recipe_cooked'` are created, and the recipe's status flips to `partial` or `missing` if inventory fell below thresholds.
- **AC-RECIPES-007**: **Given** a non-makeable recipe, **when** I POST to `/recipes/:id/cook`, **then** the request fails with `SEMANTIC_ERROR` and no `QuantityChange` rows are created.
- **AC-RECIPES-008**: **Given** a recipe, **when** I POST to `/recipes/:id/cook` with `dry_run = true`, **then** I get the planned decrements back and no inventory changes are persisted.
- **AC-RECIPES-009**: **Given** an item type referenced by a recipe ingredient, **when** I delete the item type, **then** the request fails with `CONFLICT_REFERENCED` (HTTP 409).
- **AC-RECIPES-010**: **Given** two recipes tagged `["quick","breakfast"]` and `["dinner"]`, **when** I GET `/recipes?tag=breakfast`, **then** only the first is returned.

## Open Questions

- `OI-RECIPES-001`: Scaling servings at cook time (multiply decrements by N / original servings). Parked for v2.
- `OI-RECIPES-002`: Sharing recipes across households or exporting them as JSON/Markdown. Deferred.
