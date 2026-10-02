-- لا تعرض معرّفات مجلد الاستيراد الخاص كمرجع أرشيفي للزائر
UPDATE materials
SET archive_ref=NULL, updated_at=datetime('now')
WHERE created_via='drive_import' AND archive_ref LIKE 'DRIVE:%';
