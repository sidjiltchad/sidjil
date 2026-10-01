// ============================================================
// SIDJIL — بناء الاستشهاد الجاهز — فريق الخلفية
// ============================================================

/**
 * buildCitation(m, lang='ar')
 * «{title_ar}»، سِجِل، رقم {ark}، المصدر الأصلي: {...}، المرجع: {...}.
 * تُحذف الأجزاء الفارغة. lang='fr' تُنتج الصيغة الفرنسية.
 */
export function buildCitation(m, lang = 'ar') {
  const fr = lang === 'fr';
  const siteName = fr ? 'SIDJIL' : 'سِجِل';
  const title = fr
    ? m.title_orig || m.title_ar || ''
    : m.title_ar || m.title_orig || '';
  const sourceName =
    m.source_name ||
    (m.source && (fr ? m.source.name || m.source.name_ar : m.source.name_ar || m.source.name)) ||
    '';
  const ref = m.archive_ref || '';

  const parts = [`«${title}»`, siteName];
  if (m.ark) parts.push(fr ? `n° ${m.ark}` : `رقم ${m.ark}`);
  if (sourceName) parts.push(fr ? `source originale : ${sourceName}` : `المصدر الأصلي: ${sourceName}`);
  if (ref) parts.push(fr ? `référence : ${ref}` : `المرجع: ${ref}`);

  return parts.join(fr ? ', ' : '، ') + '.';
}
