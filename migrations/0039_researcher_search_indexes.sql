-- 0039: فهارس موجز الباحثين والبحث الحي بناءً على Row Metrics في D1.
CREATE INDEX IF NOT EXISTS idx_materials_publish_updated_id
  ON materials(publish_status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_materials_creator_publish_updated_id
  ON materials(created_by, publish_status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_discussions_status_material
  ON discussions(status, material_id);

CREATE INDEX IF NOT EXISTS idx_collections_kind_sort_id
  ON collections(kind, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_follows_follower_followed
  ON researcher_follows(follower_id, followed_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON notifications(user_id, id DESC);
