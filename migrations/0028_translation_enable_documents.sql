-- تفعيل مسارات ترجمة المستندات بعد تركيب خدمة المعالجة الداخلية.
UPDATE translation_settings
SET document_enabled = 1,
    ocr_enabled = 1,
    updated_at = datetime('now')
WHERE id = 1;
