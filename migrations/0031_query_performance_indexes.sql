-- SIDJIL: indexes for measured D1 query hot paths.
CREATE INDEX IF NOT EXISTS idx_material_collections_collection_material
  ON material_collections(collection_id, material_id);

CREATE INDEX IF NOT EXISTS idx_audit_action_target_created
  ON audit_log(action, target, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_materials_publish_created
  ON materials(publish_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_materials_creator_updated_id
  ON materials(created_by, updated_at DESC, id DESC);
