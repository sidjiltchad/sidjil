# SIDJIL — تنظيم التخزين R2

> الاسم السابق: Archifouna.

الحاوية (التطوير): `archifouna-files` — (الإنتاج): `sidjil-assets`. المبدأ: **الأصل لا يُستبدل أبدًا** — أي نسخة جديدة = مفتاح جديد.

## هيكل المفاتيح

```
originals/
  documents/ARC-TD-DOC-000001/<sha8>-<safe-name>.pdf
  books/ARC-TD-BOK-000002/<sha8>-<safe-name>.pdf
  manuscripts/ARC-TD-MSS-000003/<sha8>-<safe-name>.pdf
  images/ARC-TD-IMG-000152/<sha8>-original.jpg
  maps/ARC-TD-MAP-000004/<sha8>-<safe-name>.jpg
  press/ARC-TD-PRS-000005/<sha8>-<safe-name>.pdf
  correspondence/ARC-TD-COR-000006/<sha8>-<safe-name>.pdf
  excerpts/ARC-TD-EXC-000007/<sha8>-<safe-name>.pdf
derived/
  images/ARC-TD-IMG-000152/restored-<sha8>.jpg
  images/ARC-TD-IMG-000152/colorized-<sha8>.jpg
thumbnails/
  ARC-TD-IMG-000152/thumb-480.jpg
exports/
  backup-2026-10-01/sidjil-prod.json
  backup-2026-10-01/manifest.csv
```

## القواعد

1. **الأصل**: يُرفع مرة واحدة إلى `originals/...` ولا يُكتب فوقه أبدًا. البصمة `sha256` تُحسب عند الرفع وتُحفظ في جدول `files`.
2. **المشتقات**: كل ترميم/تحسين/تلوين/تعليق ملف جديد في `derived/...` وصف جديد في `image_versions` مرتبط بالأصل عبر `material_id` + بيان المعالجة `process_note`.
3. **المصغرات**: تُولَّد عند العرض (أو عند الرفع لاحقًا) في `thumbnails/...`.
4. **الحذف**: حذف مادة يحذف صفوف `files` المرتبطة **ومفاتيح R2** المقابلة (ينفذها `admin-api`).
5. **النسخ الاحتياطي**: `exports/backup-YYYY-MM-DD/` يحوي تفريغ قاعدة البيانات + `manifest.csv` (كل `r2_key` مع `sha256` والحجم) للتحقق من سلامة النسخة.

## التقديم العام

- `GET /file/:id` يقرأ `r2_key` من D1 ثم يبث من R2 مع `Content-Type` الصحيح.
- `?download=1` يضيف `Content-Disposition: attachment; filename="..."`.
- لا تُكشف مفاتيح R2 الخام للزائر أبدًا — فقط `/file/:id`.
