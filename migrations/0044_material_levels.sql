-- SIDJIL — التصنيف التحريري الموحد للمواد
-- type يبقى رمزًا أرشيفيًا، وmaterial_level يحدد نموذج العرض والاكتمال.

ALTER TABLE materials ADD COLUMN material_level TEXT NOT NULL DEFAULT 'archival_text';
CREATE INDEX IF NOT EXISTS idx_materials_level ON materials(material_level);

-- الصور والخرائط مواد بصرية؛ يعرض الوصف تفسيرًا للمادة.
UPDATE materials
SET material_level = 'archival_image'
WHERE type IN ('image', 'map');

-- الوثائق والمراسلات والمقالات النصية تعرض كنص موثق.
UPDATE materials
SET material_level = 'archival_text'
WHERE type IN ('document', 'manuscript', 'press', 'correspondence', 'excerpt');

-- القسم الثامن مخصص للمؤلفات التشادية. نربط المستوى بالقسم لا بتخمين اسم المؤلف.
UPDATE materials
SET material_level = 'chadian_publication'
WHERE EXISTS (
  SELECT 1
  FROM material_collections mc
  JOIN collections c ON c.id = mc.collection_id
  WHERE mc.material_id = materials.id
    AND c.kind = 'section'
    AND c.sort_order = 8
);

-- القسم التاسع للمقالات العلمية؛ المقالات التي لا تدخل ضمن المؤلفات التشادية
-- تبقى مادة نصية أرشيفية.
UPDATE materials
SET material_level = 'chadian_publication'
WHERE type IN ('article', 'journal')
  AND EXISTS (
    SELECT 1
    FROM material_collections mc
    JOIN collections c ON c.id = mc.collection_id
    WHERE mc.material_id = materials.id
      AND c.kind = 'section'
      AND c.sort_order = 9
  );

-- الكتب المتبقية تفرق بحسب وجود PDF فعلي مرتبط بها.
UPDATE materials
SET material_level = 'archival_book_original'
WHERE type = 'book'
  AND material_level NOT IN ('chadian_publication')
  AND EXISTS (
    SELECT 1 FROM files f
    WHERE f.material_id = materials.id
      AND (lower(f.mime) = 'application/pdf' OR lower(f.filename) LIKE '%.pdf')
  );

UPDATE materials
SET material_level = 'archival_book_unavailable'
WHERE type = 'book'
  AND material_level NOT IN ('chadian_publication', 'archival_book_original');

-- وسم عناصر الإصلاح القديمة غير المنطبقة بدل حذف سجل التدقيق والطابور.
UPDATE content_repair_queue
SET status = 'resolved', note = COALESCE(note, '') || ' — أُغلق تلقائيًا بعد اعتماد نموذج مستويات المواد.'
WHERE status NOT IN ('resolved', 'blocked')
  AND issue_type = 'pdf'
  AND material_id IN (SELECT id FROM materials WHERE material_level <> 'archival_book_original');

UPDATE content_repair_queue
SET status = 'resolved', note = COALESCE(note, '') || ' — أُغلق تلقائيًا بعد اعتماد نموذج مستويات المواد.'
WHERE status NOT IN ('resolved', 'blocked')
  AND issue_type = 'text'
  AND material_id IN (SELECT id FROM materials WHERE material_level <> 'archival_text');

