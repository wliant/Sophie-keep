-- Recipe book with inventory matching.
CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_lower TEXT NOT NULL,
  description TEXT,
  steps TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  servings DOUBLE PRECISION CHECK (servings IS NULL OR servings > 0),
  prep_minutes INTEGER CHECK (prep_minutes IS NULL OR prep_minutes >= 0),
  cook_minutes INTEGER CHECK (cook_minutes IS NULL OR cook_minutes >= 0),
  notes TEXT,
  photo_ids TEXT NOT NULL DEFAULT '[]',
  search_vector tsvector,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_recipes_name_lower ON recipes(name_lower);
CREATE INDEX IF NOT EXISTS ix_recipes_updated ON recipes(updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_recipes_search_vector ON recipes USING GIN(search_vector);

CREATE OR REPLACE FUNCTION recipes_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector(
    'english',
    COALESCE(NEW.name,'') || ' ' ||
    COALESCE(NEW.description,'') || ' ' ||
    COALESCE(NEW.tags,'')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recipes_search_vector_trig ON recipes;
CREATE TRIGGER recipes_search_vector_trig
  BEFORE INSERT OR UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION recipes_search_vector_update();

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  item_type_id TEXT NOT NULL REFERENCES item_types(id) ON DELETE RESTRICT,
  required_quantity DOUBLE PRECISION NOT NULL CHECK (required_quantity > 0),
  required_unit TEXT NOT NULL,
  optional INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  sort_order INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_recipe_ingredients_recipe ON recipe_ingredients(recipe_id, sort_order);
CREATE INDEX IF NOT EXISTS ix_recipe_ingredients_type ON recipe_ingredients(item_type_id);

-- Allow recipes to own photos.
ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_owner_kind_check;
ALTER TABLE photos ADD CONSTRAINT photos_owner_kind_check
  CHECK (owner_kind IN ('item','floor_plan','recipe'));

-- Record cook-from-recipe as a first-class quantity-change reason.
ALTER TABLE quantity_changes DROP CONSTRAINT IF EXISTS quantity_changes_reason_check;
ALTER TABLE quantity_changes ADD CONSTRAINT quantity_changes_reason_check
  CHECK (reason IN ('manual','quick_add','shopping_restock','import','recipe_cooked'));
