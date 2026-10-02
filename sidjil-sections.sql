-- سِجِل — قسمان جديدان + تصنيف المواد التسع الحالية
-- التشغيل: npx wrangler d1 execute SIDJIL --remote --file=sidjil-sections.sql
-- (يُنفَّذ من مجلد المشروع على جهازك)

-- 1) القسم الثامن: المؤلفات التشادية
INSERT INTO collections (title_ar, title_fr, description, kind, sort_order)
SELECT 'المؤلفات التشادية', 'Œuvres tchadiennes',
  'مؤلفات الكتّاب والباحثين التشاديين: كتب ودراسات وأعمال فكرية.',
  'section', 8
WHERE NOT EXISTS (SELECT 1 FROM collections WHERE kind = 'section' AND sort_order = 8);

-- 2) القسم التاسع: المقالات العلمية المحكمة والمنشورة
INSERT INTO collections (title_ar, title_fr, description, kind, sort_order)
SELECT 'المقالات العلمية المحكمة والمنشورة', 'Articles scientifiques évalués par les pairs',
  'مقالات علمية محكمة منشورة في مجلات ودوريات علمية.',
  'section', 9
WHERE NOT EXISTS (SELECT 1 FROM collections WHERE kind = 'section' AND sort_order = 9);

-- 3) تصنيف المواد التسع (إعادة ضبط دقيقة لروابط الأقسام الخاصة بها فقط)
DELETE FROM material_collections
WHERE collection_id IN (SELECT id FROM collections WHERE kind = 'section')
  AND material_id IN (SELECT id FROM materials WHERE ark IN (
    'ARC-TD-BOK-000001','ARC-TD-BOK-000002',
    'ARC-TD-DOC-000001','ARC-TD-DOC-000002','ARC-TD-DOC-000003',
    'ARC-TD-EXC-000001',
    'ARC-TD-IMG-000001','ARC-TD-IMG-000002','ARC-TD-IMG-000003'));

-- أطروحة دوتم (مؤلف تشادي): تاريخي + ديني + مؤلفات تشادية
INSERT OR IGNORE INTO material_collections (material_id, collection_id)
SELECT m.id, c.id FROM materials m, collections c
WHERE m.ark = 'ARC-TD-BOK-000001' AND c.kind = 'section' AND c.sort_order IN (1, 7, 8);

-- التاريخ العسكري لأفريقيا الاستوائية الفرنسية: تاريخي
INSERT OR IGNORE INTO material_collections (material_id, collection_id)
SELECT m.id, c.id FROM materials m, collections c
WHERE m.ark = 'ARC-TD-BOK-000002' AND c.kind = 'section' AND c.sort_order IN (1);

-- وثائق الكلية الفرنسية الإسلامية/العربية (3 وثائق): تاريخي + لغوي + ديني
INSERT OR IGNORE INTO material_collections (material_id, collection_id)
SELECT m.id, c.id FROM materials m, collections c
WHERE m.ark IN ('ARC-TD-DOC-000001','ARC-TD-DOC-000002','ARC-TD-DOC-000003')
  AND c.kind = 'section' AND c.sort_order IN (1, 5, 7);

-- فيلم هوريز (أبشة 1933-1934): تاريخي
INSERT OR IGNORE INTO material_collections (material_id, collection_id)
SELECT m.id, c.id FROM materials m, collections c
WHERE m.ark = 'ARC-TD-EXC-000001' AND c.kind = 'section' AND c.sort_order IN (1);

-- سوق أبشة + بوابة التاتا: تاريخي
INSERT OR IGNORE INTO material_collections (material_id, collection_id)
SELECT m.id, c.id FROM materials m, collections c
WHERE m.ark IN ('ARC-TD-IMG-000001','ARC-TD-IMG-000003')
  AND c.kind = 'section' AND c.sort_order IN (1);

-- المدرسة القرآنية في أبشة: تاريخي + ديني
INSERT OR IGNORE INTO material_collections (material_id, collection_id)
SELECT m.id, c.id FROM materials m, collections c
WHERE m.ark = 'ARC-TD-IMG-000002' AND c.kind = 'section' AND c.sort_order IN (1, 7);

-- 4) تحقق سريع: عدد المواد في كل قسم
SELECT c.sort_order, c.title_ar, COUNT(mc.material_id) AS n
FROM collections c LEFT JOIN material_collections mc ON mc.collection_id = c.id
WHERE c.kind = 'section'
GROUP BY c.id ORDER BY c.sort_order;
