import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const checks = [
  ['src/views.js', 'hideHeaderSearch: true', 'الصفحة الرئيسية تخفي حقل رأس الصفحة'],
  ['src/views.js', 'data-live-search-input', 'حقل البحث الحي موجود'],
  ['src/views.js', 'title_fr', 'العنوان الفرنسي حاضر في العرض'],
  ['src/views.js', 'displayEntityName', 'أسماء الكيانات تعتمد اللغة'],
  ['src/api.js', 'includeCount: sp.get(\'count\') !== \'0\'', 'البحث الحي لا ينفذ COUNT'],
  ['src/lib/db.js', 'translations WHERE material_id', 'نصوص الترجمات تدخل الفهرس'],
  ['migrations/0050_bilingual_metadata_search.sql', 'DELETE FROM materials_fts', 'إعادة بناء فهرس البحث الثنائي'],
  ['public/js/home-search.js', 'trimmed.length < 3', 'الحد الأدنى ثلاثة أحرف'],
];
const failures = checks.filter(([path, needle]) => !read(path).includes(needle));
if (failures.length) {
  console.error(failures.map(([path, needle, label]) => `FAIL ${label}: ${path} ← ${needle}`).join('\n'));
  process.exit(1);
}
console.log(`bilingual-search-check: ${checks.length} checks passed`);
