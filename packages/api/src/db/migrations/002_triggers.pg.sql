-- When an item is deleted, remove any photos owned by it so the photos table
-- can't retain orphan rows. (Polymorphic owner_kind prevents a real FK, so we
-- approximate it with a trigger. S3 key cleanup is the service's job.)
CREATE OR REPLACE FUNCTION photos_cascade_on_item_delete_fn() RETURNS trigger AS $$
BEGIN
  DELETE FROM photos WHERE owner_kind = 'item' AND owner_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS photos_cascade_on_item_delete ON items;
CREATE TRIGGER photos_cascade_on_item_delete
  AFTER DELETE ON items
  FOR EACH ROW EXECUTE FUNCTION photos_cascade_on_item_delete_fn();

-- Same for the singleton floor_plan.
CREATE OR REPLACE FUNCTION photos_cascade_on_floor_plan_delete_fn() RETURNS trigger AS $$
BEGIN
  DELETE FROM photos WHERE owner_kind = 'floor_plan' AND owner_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS photos_cascade_on_floor_plan_delete ON floor_plan;
CREATE TRIGGER photos_cascade_on_floor_plan_delete
  AFTER DELETE ON floor_plan
  FOR EACH ROW EXECUTE FUNCTION photos_cascade_on_floor_plan_delete_fn();
