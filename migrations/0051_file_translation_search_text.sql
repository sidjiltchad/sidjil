-- فهرسة نص نظائر Word حتى يشمل البحث الكلمات الموجودة داخل الترجمة نفسها.
ALTER TABLE file_translations ADD COLUMN search_text TEXT NOT NULL DEFAULT '';
