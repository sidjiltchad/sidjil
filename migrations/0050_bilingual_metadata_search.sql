-- سِجِل: بيانات العرض الفرنسية وفهرسة النصوص الثنائية.
-- الحقول الجديدة مستقلة عن العنوان الأصلي حتى لا نغيّر نص المصدر.
ALTER TABLE materials ADD COLUMN title_fr TEXT;
ALTER TABLE materials ADD COLUMN description_fr TEXT;
ALTER TABLE materials ADD COLUMN summary_fr TEXT;
ALTER TABLE materials ADD COLUMN notable_quote_fr TEXT;
ALTER TABLE materials ADD COLUMN date_text_fr TEXT;

ALTER TABLE people ADD COLUMN name_fr TEXT;
ALTER TABLE places ADD COLUMN name_fr TEXT;
ALTER TABLE sources ADD COLUMN name_fr TEXT;
ALTER TABLE tags ADD COLUMN name_fr TEXT;

CREATE INDEX IF NOT EXISTS idx_materials_publish_title_fr
  ON materials(publish_status, title_fr);
CREATE INDEX IF NOT EXISTS idx_materials_publish_type_updated
  ON materials(publish_status, type, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_materials_publish_language_updated
  ON materials(publish_status, language, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_transcriptions_material_lang
  ON transcriptions(material_id, lang, layer);
CREATE INDEX IF NOT EXISTS idx_translations_material_target_status
  ON translations(material_id, target_lang, status);
CREATE INDEX IF NOT EXISTS idx_file_translations_material_target_status
  ON file_translations(material_id, target_lang, status);

-- إعادة بناء فهرس البحث مرة واحدة حتى تدخل العناوين الفرنسية والترجمات
-- الموجودة قبل هذه الهجرة ضمن الفهرس دون انتظار تعديل المادة يدويًا.
DELETE FROM materials_fts;
INSERT INTO materials_fts (ark, title, body)
SELECT ark,
       trim(coalesce(title_ar, '') || char(10) || coalesce(title_fr, '') || char(10) || coalesce(title_orig, '')),
       trim(coalesce(search_blob, '') || char(10) || coalesce(title_fr, '') || char(10) ||
            coalesce(description_fr, '') || char(10) || coalesce(summary_fr, '') || char(10) || coalesce(notable_quote_fr, '') || char(10) ||
            coalesce((SELECT group_concat(text, ' ') FROM transcriptions WHERE material_id = materials.id), '') || char(10) ||
            coalesce((SELECT group_concat(text, ' ') FROM translations WHERE material_id = materials.id AND status IN ('machine','in_review','reviewed','approved')), ''))
FROM materials;
