// ============================================================
// SIDJIL — مساعدات قاعدة البيانات (D1)
// فريق الخلفية — exports ملزمة بموجب docs/API.md §2
// ============================================================

/** رموز الترقيم الأرشيفي لكل نوع مادة */
export const TYPE_CODES = {
  document: 'DOC',
  book: 'BOK',
  manuscript: 'MSS',
  image: 'IMG',
  map: 'MAP',
  press: 'PRS',
  correspondence: 'COR',
  excerpt: 'EXC',
  journal: 'JRN',
  article: 'ART',
};

/** مجلدات R2 لكل نوع مادة (مطابق لـ docs/R2-LAYOUT.md) */
export const TYPE_DIRS = {
  document: 'documents',
  book: 'books',
  manuscript: 'manuscripts',
  image: 'images',
  map: 'maps',
  press: 'press',
  correspondence: 'correspondence',
  excerpt: 'excerpts',
  journal: 'journals',
  article: 'articles',
};

/**
 * توليد الرقم الأرشيفي التالي: ARC-TD-{CODE}-NNNNNN
 * ذري: UPDATE + SELECT داخل batch واحد (معاملة واحدة في D1).
 */
export async function nextArk(db, type) {
  const code = TYPE_CODES[type];
  if (!code) throw new Error('نوع مادة غير معروف: ' + type);
  const results = await db.batch([
    db
      .prepare('UPDATE counters SET next_num = next_num + 1 WHERE type_code = ? RETURNING next_num')
      .bind(code),
  ]);
  const row = results[0] && results[0].results && results[0].results[0];
  if (!row) throw new Error('تعذّر توليد الرقم الأرشيفي');
  const num = row.next_num - 1; // الرقم المحجوز لهذه المادة
  return `ARC-TD-${code}-${String(num).padStart(6, '0')}`;
}

/**
 * المادة الكاملة مع كل علاقاتها — تُستخدم في صفحة المادة و API.
 * @returns {Promise<object|null>}
 */
export async function getMaterialFull(db, ark) {
  const m = await db.prepare('SELECT * FROM materials WHERE ark = ?').bind(ark).first();
  if (!m) return null;

  const [people, places, tags, collections, files, versions, transcriptions, fileTranslations] =
    await Promise.all([
      db
        .prepare(
          `SELECT p.*, mp.role FROM people p
           JOIN material_people mp ON mp.person_id = p.id
           WHERE mp.material_id = ? ORDER BY p.name_ar`
        )
        .bind(m.id)
        .all(),
      db
        .prepare(
          `SELECT pl.*, mpl.relation FROM places pl
           JOIN material_places mpl ON mpl.place_id = pl.id
           WHERE mpl.material_id = ? ORDER BY pl.name_ar`
        )
        .bind(m.id)
        .all(),
      db
        .prepare(
          `SELECT t.* FROM tags t
           JOIN material_tags mt ON mt.tag_id = t.id
           WHERE mt.material_id = ? ORDER BY t.name_ar`
        )
        .bind(m.id)
        .all(),
      db
        .prepare(
          `SELECT c.*, mc.sort_order FROM collections c
           JOIN material_collections mc ON mc.collection_id = c.id
           WHERE mc.material_id = ? ORDER BY mc.sort_order, c.title_ar`
        )
        .bind(m.id)
        .all(),
      db
        .prepare('SELECT * FROM files WHERE material_id = ? ORDER BY id')
        .bind(m.id)
        .all(),
      db
        .prepare(
          `SELECT iv.*, f.filename, f.mime, f.size, f.r2_key
           FROM image_versions iv JOIN files f ON f.id = iv.file_id
           WHERE iv.material_id = ? ORDER BY iv.sort_order, iv.id`
        )
        .bind(m.id)
        .all(),
      db
        .prepare('SELECT * FROM transcriptions WHERE material_id = ? ORDER BY id')
        .bind(m.id)
        .all(),
      // نظائر الترجمة المرفوعة (Word) — تُعرض في القارئ عند اختيار لغة أخرى
      db
        .prepare(
          `SELECT ft.*, f.filename AS translation_filename, f.size AS translation_size
           FROM file_translations ft
           LEFT JOIN files f ON f.id = ft.translation_file_id
           WHERE ft.material_id = ? AND ft.status = 'ready' AND ft.translation_file_id IS NOT NULL
           ORDER BY ft.target_lang`
        )
        .bind(m.id)
        .all(),
    ]);

  // علاقات مادة↔مادة في الاتجاهين
  const relations = await db
    .prepare(
      `SELECT mr.id, mr.relation, mr.note,
              rm.ark, rm.type, rm.title_ar, rm.title_orig, rm.year
       FROM material_relations mr
       JOIN materials rm ON rm.id = CASE WHEN mr.material_a = ? THEN mr.material_b ELSE mr.material_a END
       WHERE mr.material_a = ? OR mr.material_b = ?`
    )
    .bind(m.id, m.id, m.id)
    .all();

  const place = m.place_id
    ? await db.prepare('SELECT * FROM places WHERE id = ?').bind(m.place_id).first()
    : null;
  const source = m.source_id
    ? await db.prepare('SELECT * FROM sources WHERE id = ?').bind(m.source_id).first()
    : null;

  return {
    ...m,
    people: people.results,
    places: places.results,
    tags: tags.results,
    collections: collections.results,
    files: files.results,
    image_versions: versions.results,
    transcriptions: transcriptions.results,
    file_translations: fileTranslations.results,
    relations: relations.results,
    place,
    source,
  };
}

/** تحديث updated_at للمادة */
export async function touchMaterial(db, id) {
  await db
    .prepare("UPDATE materials SET updated_at = datetime('now') WHERE id = ?")
    .bind(id)
    .run();
}

/**
 * إعادة بناء النص المطبّع للفهرسة وصف materials_fts.
 * المصادر: العناوين، الوصف، full_text، نصوص التفريغ،
 * أسماء الأشخاص/الأماكن/الوسوم/المصدر، المرجع الأرشيفي.
 */
export async function rebuildSearchBlob(db, materialId) {
  const m = await db.prepare('SELECT * FROM materials WHERE id = ?').bind(materialId).first();
  if (!m) return;

  const [trRows, pRows, plRows, tRows, srcRow] = await Promise.all([
    db.prepare('SELECT text FROM transcriptions WHERE material_id = ?').bind(materialId).all(),
    db
      .prepare(
        `SELECT p.name_ar, p.name_orig FROM people p
         JOIN material_people mp ON mp.person_id = p.id WHERE mp.material_id = ?`
      )
      .bind(materialId)
      .all(),
    db
      .prepare(
        `SELECT pl.name_ar, pl.name_orig FROM places pl
         JOIN material_places mpl ON mpl.place_id = pl.id WHERE mpl.material_id = ?`
      )
      .bind(materialId)
      .all(),
    db
      .prepare(
        `SELECT t.name_ar, t.name_orig FROM tags t
         JOIN material_tags mt ON mt.tag_id = t.id WHERE mt.material_id = ?`
      )
      .bind(materialId)
      .all(),
    m.source_id
      ? db.prepare('SELECT name, name_ar FROM sources WHERE id = ?').bind(m.source_id).first()
      : Promise.resolve(null),
  ]);

  const names = (rows, a, b) =>
    rows.results.map((r) => `${r[a] || ''} ${r[b] || ''}`).join(' ');

  const parts = [
    m.title_ar,
    m.title_orig,
    m.description,
    m.full_text,
    trRows.results.map((r) => r.text).join(' '),
    names(pRows, 'name_ar', 'name_orig'),
    names(plRows, 'name_ar', 'name_orig'),
    names(tRows, 'name_ar', 'name_orig'),
    srcRow ? `${srcRow.name || ''} ${srcRow.name_ar || ''}` : '',
    m.archive_ref,
    m.author,
    m.photographer,
  ];

  const blob = normalizeText(parts.filter(Boolean).join(' '));
  const title = normalizeText(`${m.title_ar || ''} ${m.title_orig || ''}`);

  await db.batch([
    db.prepare('UPDATE materials SET search_blob = ? WHERE id = ?').bind(blob, materialId),
    db.prepare('DELETE FROM materials_fts WHERE ark = ?').bind(m.ark),
    db.prepare('INSERT INTO materials_fts (ark, title, body) VALUES (?, ?, ?)').bind(m.ark, title, blob),
  ]);
}

/** تسجيل عملية إدارية في audit_log — الفشل هنا لا يجب أن يكسر العملية الأصلية أبدًا */
export async function audit(db, { userId = null, action, target = null, detail = null, ip = null }) {
  try {
    await db
      .prepare('INSERT INTO audit_log (user_id, action, target, detail, ip) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, action, target, detail, ip)
      .run();
  } catch (e) {
    console.error('audit_log insert failed:', e && e.message ? e.message : e);
  }
}

/**
 * تطبيع النص للفهرسة والبحث:
 * عربي: إزالة التشكيل والتطويل، أإآٱ→ا، ة→ه، ى→ي، ؤ→و، ئ→ي
 * فرنسي/لاتيني: تصغير + إزالة علامات التشكيل (accents)
 */
export function normalizeText(s) {
  if (s === null || s === undefined) return '';
  let t = String(s);
  // إزالة التشكيل العربي والتطويل
  t = t.replace(/[ً-ٰٟ]/g, ''); // U+064B–U+065F + U+0670
  t = t.replace(/ـ/g, ''); // U+0640
  // توحيد الحروف العربية
  t = t.replace(/[أإآٱ]/g, 'ا');
  t = t.replace(/ة/g, 'ه');
  t = t.replace(/ى/g, 'ي');
  t = t.replace(/ؤ/g, 'و');
  t = t.replace(/ئ/g, 'ي');
  // تصغير + إزالة accents اللاتينية
  t = t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // U+0300–U+036F
  // تقليص المسافات
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}
