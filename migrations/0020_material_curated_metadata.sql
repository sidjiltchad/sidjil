-- حقول الوصف التحريري والملخص والاستشهاد البارز
ALTER TABLE materials ADD COLUMN summary TEXT NOT NULL DEFAULT '';
ALTER TABLE materials ADD COLUMN notable_quote TEXT;
ALTER TABLE materials ADD COLUMN quote_page TEXT;
