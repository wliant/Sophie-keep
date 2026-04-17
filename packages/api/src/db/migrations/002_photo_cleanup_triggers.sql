-- When an item is deleted, remove any photos owned by it so the photos table
-- can't retain orphan rows. (Polymorphic owner_kind prevents a real FK, so we
-- approximate it with a trigger. File-on-disk cleanup is the service's job.)
CREATE TRIGGER IF NOT EXISTS photos_cascade_on_item_delete
AFTER DELETE ON items
BEGIN
  DELETE FROM photos WHERE owner_kind = 'item' AND owner_id = old.id;
END;

-- Same for the singleton floor_plan (ids are unique across tables via ULID,
-- but a defence-in-depth trigger keeps the invariant explicit).
CREATE TRIGGER IF NOT EXISTS photos_cascade_on_floor_plan_delete
AFTER DELETE ON floor_plan
BEGIN
  DELETE FROM photos WHERE owner_kind = 'floor_plan' AND owner_id = old.id;
END;
