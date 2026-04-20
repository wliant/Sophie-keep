-- Schema version bookkeeping
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

-- Singleton settings row
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  expiring_soon_window_days INTEGER NOT NULL DEFAULT 7,
  quick_add_default_type_id TEXT,
  quick_add_default_location_id TEXT,
  quick_add_default_unit TEXT,
  last_backup_status TEXT,
  last_backup_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_lower TEXT NOT NULL,
  default_unit TEXT NOT NULL,
  default_low_stock_threshold DOUBLE PRECISION,
  icon TEXT,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_item_types_name_lower ON item_types(name_lower);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_lower TEXT NOT NULL,
  shape_on_plan TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_rooms_name_lower ON rooms(name_lower);

CREATE TABLE IF NOT EXISTS storage_locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_lower TEXT NOT NULL,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  shape_on_plan TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_locations_room_name_lower ON storage_locations(room_id, name_lower);
CREATE INDEX IF NOT EXISTS ix_locations_room ON storage_locations(room_id);

CREATE TABLE IF NOT EXISTS floor_plan (
  id TEXT PRIMARY KEY CHECK (id = 'singleton'),
  name TEXT NOT NULL,
  width DOUBLE PRECISION NOT NULL,
  height DOUBLE PRECISION NOT NULL,
  background_image_photo_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  item_type_id TEXT NOT NULL REFERENCES item_types(id) ON DELETE RESTRICT,
  storage_location_id TEXT NOT NULL REFERENCES storage_locations(id) ON DELETE RESTRICT,
  quantity DOUBLE PRECISION NOT NULL CHECK (quantity >= 0),
  unit TEXT NOT NULL,
  expiration_date TEXT,
  low_stock_threshold DOUBLE PRECISION CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0),
  notes TEXT,
  photo_ids TEXT NOT NULL DEFAULT '[]',
  search_vector tsvector,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_items_type ON items(item_type_id);
CREATE INDEX IF NOT EXISTS ix_items_location ON items(storage_location_id);
CREATE INDEX IF NOT EXISTS ix_items_updated ON items(updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_items_expiration ON items(expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_items_name_lower ON items(LOWER(name));
CREATE INDEX IF NOT EXISTS ix_items_search_vector ON items USING GIN(search_vector);

CREATE OR REPLACE FUNCTION items_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.name,'') || ' ' || COALESCE(NEW.notes,''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS items_search_vector_trig ON items;
CREATE TRIGGER items_search_vector_trig
  BEFORE INSERT OR UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION items_search_vector_update();

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('item','floor_plan')),
  owner_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_photos_owner ON photos(owner_kind, owner_id);

CREATE TABLE IF NOT EXISTS quantity_changes (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  delta DOUBLE PRECISION NOT NULL,
  new_quantity DOUBLE PRECISION NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('manual','quick_add','shopping_restock','import')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_qc_item_time ON quantity_changes(item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shopping_entries (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auto_entry_check_state (
  item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  checked INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
