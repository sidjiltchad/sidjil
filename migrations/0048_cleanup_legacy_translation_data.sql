-- حذف نواتج نظام الترجمة المرحلي القديم بعد أخذ نسخة تشغيلية.
-- لا يمس الملفات الأصلية أو نظائر file_translations أو طلبات الترجمة الجديدة.
DELETE FROM translation_page_segments;
DELETE FROM translation_pages;
DELETE FROM translation_documents;
DELETE FROM manual_translations;
