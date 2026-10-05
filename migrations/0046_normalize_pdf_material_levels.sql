-- 0046: لا تُعامل أي مادة لها PDF فعلي على أنها تفريغ نصي.
-- المواد التشادية/المقالات يمكن اختيار chadian_publication صراحة من النموذج.
UPDATE materials
SET material_level = 'archival_book_original', updated_at = datetime('now')
WHERE material_level = 'archival_text'
  AND EXISTS (
    SELECT 1 FROM files f
    WHERE f.material_id = materials.id
      AND (lower(f.mime) = 'application/pdf' OR lower(f.filename) LIKE '%.pdf')
  );

UPDATE content_repair_queue
SET status = 'resolved',
    note = 'أُعيد تصنيف المادة إلى كتاب أرشيفي أصيل لوجود PDF فعلي',
    resolved_at = datetime('now'), updated_at = datetime('now')
WHERE status IN ('pending','processing')
  AND issue_type = 'text'
  AND material_id IN (SELECT id FROM materials WHERE material_level <> 'archival_text');
