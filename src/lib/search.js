// ============================================================
// SIDJIL — البحث النصي الكامل (FTS5) — فريق الخلفية
// ============================================================

import { normalizeText } from './db.js';

/**
 * searchMaterials(db, params)
 * params = { q, type, fromYear, toYear, region, lang, personId, tagId,
 *            sourceId, collectionId, translationStatus, placeId,
 *            page, perPage, publishedOnly=true }
 * @returns {Promise<{items, total, page, perPage}>}
 * كل عنصر: صف materials + snippet (مميز بـ <mark> عند وجود q)
 */
export async function searchMaterials(db, params = {}) {
  const {
    q,
    type,
    fromYear,
    toYear,
    region,
    lang,
    personId,
    tagId,
    sourceId,
    collectionId,
    translationStatus,
    placeId,
    publishedOnly = true,
  } = params;

  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(params.perPage, 10) || 20));
  const offset = (page - 1) * perPage;

  const joins = [];
  const where = [];
  const binds = [];

  if (publishedOnly) {
    where.push('m.publish_status = ?');
    binds.push('published');
  }
  if (type) {
    where.push('m.type = ?');
    binds.push(type);
  }
  if (fromYear !== undefined && fromYear !== null && fromYear !== '') {
    where.push('m.year >= ?');
    binds.push(parseInt(fromYear, 10));
  }
  if (toYear !== undefined && toYear !== null && toYear !== '') {
    where.push('m.year <= ?');
    binds.push(parseInt(toYear, 10));
  }
  if (lang) {
    where.push('m.language = ?');
    binds.push(lang);
  }
  if (translationStatus) {
    where.push('m.translation_status = ?');
    binds.push(translationStatus);
  }
  if (sourceId) {
    where.push('m.source_id = ?');
    binds.push(parseInt(sourceId, 10));
  }
  // روابط أحادية (PK مركب يضمن صفًا واحدًا لكل مادة)
  if (personId) {
    joins.push('JOIN material_people mp ON mp.material_id = m.id');
    where.push('mp.person_id = ?');
    binds.push(parseInt(personId, 10));
  }
  if (tagId) {
    joins.push('JOIN material_tags mt ON mt.material_id = m.id');
    where.push('mt.tag_id = ?');
    binds.push(parseInt(tagId, 10));
  }
  if (collectionId) {
    joins.push('JOIN material_collections mc ON mc.material_id = m.id');
    where.push('mc.collection_id = ?');
    binds.push(parseInt(collectionId, 10));
  }
  // المكان: الرئيسي أو المرتبط
  if (placeId) {
    const pid = parseInt(placeId, 10);
    where.push(
      '(m.place_id = ? OR EXISTS (SELECT 1 FROM material_places mpl WHERE mpl.material_id = m.id AND mpl.place_id = ?))'
    );
    binds.push(pid, pid);
  }
  // المنطقة: تطابق places.region
  if (region) {
    where.push(
      `(EXISTS (SELECT 1 FROM places pl WHERE pl.id = m.place_id AND pl.region = ?)
        OR EXISTS (SELECT 1 FROM material_places mpl2 JOIN places pl2 ON pl2.id = mpl2.place_id
                   WHERE mpl2.material_id = m.id AND pl2.region = ?))`
    );
    binds.push(region, region);
  }

  // ---- استعلام FTS5 ----
  let ftsQuery = null;
  if (q && String(q).trim()) {
    ftsQuery = buildFtsQuery(q);
    if (ftsQuery) {
      joins.push('JOIN materials_fts ON materials_fts.ark = m.ark');
      where.push('materials_fts MATCH ?');
      binds.push(ftsQuery);
    }
  }

  const joinSql = joins.length ? ' ' + joins.join(' ') : '';
  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';

  // ملاحظة: bm25(materials_fts, 0.0, 8.0, 1.0) — الوزن 8.0 للعنوان (العمود 1)
  // و1.0 للمتن (العمود 2)؛ العمود 0 (ark) غير مفهرس فوزنه 0.0 بلا أثر.
  // (العقد كتب bm25(..., 8.0, 1.0) لكن الوزن الأول كان سيقع على ark لا على العنوان)
  const orderSql = ftsQuery
    ? 'ORDER BY bm25(materials_fts, 0.0, 8.0, 1.0)'
    : 'ORDER BY m.updated_at DESC, m.id DESC';

  const snippetSql = ftsQuery
    ? `, snippet(materials_fts, 2, '<mark>', '</mark>', '…', 30) AS snippet`
    : `, NULL AS snippet`;

  const itemsSql =
    `SELECT m.*${snippetSql} FROM materials m${joinSql}${whereSql} ${orderSql} LIMIT ? OFFSET ?`;
  const itemsRes = await db
    .prepare(itemsSql)
    .bind(...binds, perPage, offset)
    .all();

  const countSql = `SELECT COUNT(DISTINCT m.id) AS c FROM materials m${joinSql}${whereSql}`;
  const countRow = await db
    .prepare(countSql)
    .bind(...binds)
    .first();

  return {
    items: itemsRes.results,
    total: countRow ? countRow.c : 0,
    page,
    perPage,
  };
}

/**
 * بناء استعلام FTS5 آمن من نص المستخدم:
 * - تطبيع (نفس تطبيع الفهرسة)
 * - إزالة الرموز الخاصة `"*:()` من الرموز
 * - كل رمز بصيغة "tok"* (بحث بادئة داخل title و body معًا)
 */
function buildFtsQuery(q) {
  const tokens = normalizeText(q)
    .split(/\s+/)
    .map((t) => t.replace(/["*:()]/g, ''))
    .filter((t) => t.length > 0)
    .slice(0, 12); // حد أقصى لعدد الرموز
  if (!tokens.length) return null;
  return tokens.map((t) => `"${t}"*`).join(' ');
}
