-- 0040: سير اعتماد مساحة الباحث وإشعارات الاعتماد
-- لا نحذف السجلات القديمة؛ نضيف سجلًا مستقلاً قابلًا للتدقيق لكل انتقال حالة.

CREATE TABLE IF NOT EXISTS material_workflow_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  event TEXT NOT NULL CHECK (event IN (
    'submitted', 'in_review', 'approved', 'published',
    'changes_requested', 'rejected', 'hidden', 'restored'
  )),
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_material_workflow_material_created
  ON material_workflow_events(material_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_material_workflow_event_created
  ON material_workflow_events(event, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at DESC, id DESC);

-- فهارس اختيار الملف الأساسي لكل مادة.
CREATE INDEX IF NOT EXISTS idx_files_material_kind_id
  ON files(material_id, kind, id);

CREATE INDEX IF NOT EXISTS idx_files_material_mime_id
  ON files(material_id, mime, id);

-- الحفاظ على الظهور العام للحسابات الموجودة قبل إضافة مفتاح الخصوصية.
UPDATE admin_users SET is_public_profile = 1
WHERE role = 'researcher' AND is_active = 1 AND is_public_profile = 0;

-- ترحيل الاعتمادات التاريخية الموجودة إلى سجل سير العمل.
INSERT INTO material_workflow_events (material_id, actor_id, event, from_status, to_status, created_at)
SELECT m.id, a.user_id, 'approved', 'in_review', 'published', a.created_at
FROM audit_log a
JOIN materials m ON m.ark = a.target
WHERE a.action = 'material.review_approve'
  AND NOT EXISTS (
    SELECT 1 FROM material_workflow_events w
    WHERE w.material_id = m.id AND w.event = 'approved' AND w.created_at = a.created_at
  );

