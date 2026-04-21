-- Make item_types hierarchical by adding a self-referencing parent_id.
ALTER TABLE item_types
  ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES item_types(id) ON DELETE RESTRICT;

-- Prevent direct self-reference (deeper cycles are checked in application code).
ALTER TABLE item_types DROP CONSTRAINT IF EXISTS item_types_parent_not_self;
ALTER TABLE item_types ADD CONSTRAINT item_types_parent_not_self
  CHECK (parent_id IS NULL OR parent_id <> id);

CREATE INDEX IF NOT EXISTS ix_item_types_parent ON item_types(parent_id);

-- Seed default hierarchical categories. Idempotent via name_lower uniqueness.
DO $$
DECLARE
  now_iso TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  -- Parents
  INSERT INTO item_types (id, name, name_lower, default_unit, created_at, updated_at)
  VALUES
    ('seed_grocery',  'Grocery',  'grocery',  'pcs', now_iso, now_iso),
    ('seed_clothing', 'Clothing', 'clothing', 'pcs', now_iso, now_iso),
    ('seed_hygiene',  'Hygiene',  'hygiene',  'pcs', now_iso, now_iso)
  ON CONFLICT (name_lower) DO NOTHING;

  -- Children of Grocery
  INSERT INTO item_types (id, name, name_lower, default_unit, parent_id, created_at, updated_at)
  VALUES
    ('seed_meat',       'Meat',       'meat',       'g',   (SELECT id FROM item_types WHERE name_lower = 'grocery'),  now_iso, now_iso),
    ('seed_fruits',     'Fruits',     'fruits',     'pcs', (SELECT id FROM item_types WHERE name_lower = 'grocery'),  now_iso, now_iso),
    ('seed_vegetables', 'Vegetables', 'vegetables', 'g',   (SELECT id FROM item_types WHERE name_lower = 'grocery'),  now_iso, now_iso),
    ('seed_condiments', 'Condiments', 'condiments', 'g',   (SELECT id FROM item_types WHERE name_lower = 'grocery'),  now_iso, now_iso)
  ON CONFLICT (name_lower) DO NOTHING;

  -- Children of Clothing
  INSERT INTO item_types (id, name, name_lower, default_unit, parent_id, created_at, updated_at)
  VALUES
    ('seed_jeans', 'Jeans', 'jeans', 'pcs', (SELECT id FROM item_types WHERE name_lower = 'clothing'), now_iso, now_iso),
    ('seed_shirt', 'Shirt', 'shirt', 'pcs', (SELECT id FROM item_types WHERE name_lower = 'clothing'), now_iso, now_iso)
  ON CONFLICT (name_lower) DO NOTHING;

  -- Children of Hygiene
  INSERT INTO item_types (id, name, name_lower, default_unit, parent_id, created_at, updated_at)
  VALUES
    ('seed_cleaning_supplies',  'Cleaning supplies',  'cleaning supplies',  'pcs', (SELECT id FROM item_types WHERE name_lower = 'hygiene'), now_iso, now_iso),
    ('seed_parts_replacement',  'Parts replacement',  'parts replacement',  'pcs', (SELECT id FROM item_types WHERE name_lower = 'hygiene'), now_iso, now_iso)
  ON CONFLICT (name_lower) DO NOTHING;
END
$$;
