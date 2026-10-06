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
    level,
    placeId,
    publishedOnly = true,
    cursor: cursorToken,
    metricsRoute = '/api/v1/search',
    metricsSampleRate = 0.1,
    includeCount = true,
  } = params;

  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(params.perPage, 10) || 20));
  const cursor = decodeCursor(cursorToken);
  const offset = cursor ? 0 : (page - 1) * perPage;

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
  if (level) {
    where.push('m.material_level = ?');
    binds.push(String(level));
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

  // ---- استعلام FTS5 / بحث Unicode احتياطي ----
  // FTS5 في SQLite/D1 لا يتعامل بثبات مع جميع صيغ Unicode العربية. نستخدم
  // العمود search_blob المطبع عند وجود العربية، حتى لا يتحول البحث العربي إلى
  // 400 فارغة بسبب MATCH غير صالح.
  let ftsQuery = null;
  let likeSearch = false;
  if (q && String(q).trim()) {
    const normalizedQuery = normalizeText(q);
    const hasArabic = /[\u0600-\u06ff]/u.test(String(q));
    if (hasArabic) {
      const tokens = normalizedQuery.split(/\s+/).filter(Boolean).slice(0, 12);
      const rawTokens = String(q).trim().split(/\s+/).filter(Boolean).slice(0, 12);
      if (tokens.length) {
        likeSearch = true;
        const tokenClauses = tokens.map((token, index) => {
          const rawToken = rawTokens[index] || token;
          return `(
            m.search_blob LIKE ? OR m.title_ar LIKE ? OR m.title_orig LIKE ? OR m.title_fr LIKE ? OR m.description_fr LIKE ? OR m.summary_fr LIKE ? OR m.notable_quote_fr LIKE ?
            OR EXISTS (SELECT 1 FROM transcriptions trq WHERE trq.material_id = m.id AND trq.text LIKE ?)
            OR EXISTS (SELECT 1 FROM translation_pages tpq JOIN translation_documents tdq ON tdq.id = tpq.document_id WHERE tdq.material_id = m.id AND tpq.status IN ('queued','processing','completed','reviewed','approved') AND tpq.translated_text LIKE ?)
            OR EXISTS (SELECT 1 FROM file_translations ftq JOIN files tfq ON tfq.id = ftq.translation_file_id WHERE ftq.material_id = m.id AND ftq.status = 'ready' AND tfq.filename LIKE ?)
          )`;
        });
        where.push(`(${tokenClauses.join(' AND ')})`);
        for (const [index, token] of tokens.entries()) {
          const normalizedPattern = `%${token}%`;
          const rawPattern = `%${rawTokens[index] || token}%`;
          binds.push(normalizedPattern, rawPattern, rawPattern, rawPattern, rawPattern, rawPattern, rawPattern, rawPattern, rawPattern, rawPattern);
        }
      }
    } else {
      ftsQuery = buildFtsQuery(q);
    }
    if (ftsQuery) {
      joins.push('LEFT JOIN materials_fts ON materials_fts.ark = m.ark');
      const tokens = normalizeText(q).split(/\s+/).map((token) => token.replace(/["*:()]/g, '')).filter(Boolean).slice(0, 12);
      const rawTokens = String(q).trim().split(/\s+/).map((token) => token.replace(/["*:()]/g, '')).filter(Boolean).slice(0, 12);
      const directClauses = tokens.map((token, index) => `(
        m.title_ar LIKE ? OR m.title_orig LIKE ? OR m.title_fr LIKE ? OR m.search_blob LIKE ?
        OR EXISTS (SELECT 1 FROM transcriptions trq WHERE trq.material_id = m.id AND trq.text LIKE ?)
        OR EXISTS (SELECT 1 FROM translation_pages tpq JOIN translation_documents tdq ON tdq.id = tpq.document_id WHERE tdq.material_id = m.id AND tpq.status IN ('queued','processing','completed','reviewed','approved') AND tpq.translated_text LIKE ?)
        OR EXISTS (SELECT 1 FROM file_translations ftq JOIN files tfq ON tfq.id = ftq.translation_file_id WHERE ftq.material_id = m.id AND ftq.status = 'ready' AND tfq.filename LIKE ?)
      )`).join(' AND ');
      where.push(`(m.ark IN (SELECT fts.ark FROM materials_fts fts WHERE materials_fts MATCH ?)${directClauses ? ` OR (${directClauses})` : ''})`);
      binds.push(ftsQuery);
      for (const [index, token] of tokens.entries()) {
        const normalizedPattern = `%${token}%`;
        const rawPattern = `%${rawTokens[index] || token}%`;
        binds.push(rawPattern, rawPattern, rawPattern, normalizedPattern, rawPattern, rawPattern, rawPattern);
      }
    }
  }

  const countBinds = binds.slice();
  const countWhere = where.slice();

  // مؤشر ثابت للنتائج التالية. في البحث النصي نحتفظ بدرجة FTS ثم نكسر التعادل
  // بالتاريخ والمعرّف، وفي القوائم العادية نستخدم التاريخ والمعرّف فقط.
  if (cursor) {
    if (ftsQuery && Number.isFinite(Number(cursor.relevance)) && cursor.updated_at !== undefined && cursor.id !== undefined) {
      const rankExpr = 'bm25(materials_fts, 0.0, 8.0, 1.0)';
      where.push(`(${rankExpr} > ? OR (${rankExpr} = ? AND (m.updated_at < ? OR (m.updated_at = ? AND m.id < ?))))`);
      binds.push(Number(cursor.relevance), Number(cursor.relevance), cursor.updated_at || '', cursor.updated_at || '', Number(cursor.id));
    } else if (!ftsQuery && cursor.updated_at !== undefined && cursor.id !== undefined) {
      where.push('(m.updated_at < ? OR (m.updated_at = ? AND m.id < ?))');
      binds.push(cursor.updated_at || '', cursor.updated_at || '', Number(cursor.id));
    }
  }

  const joinSql = joins.length ? ' ' + joins.join(' ') : '';
  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';

  // ملاحظة: bm25(materials_fts, 0.0, 8.0, 1.0) — الوزن 8.0 للعنوان (العمود 1)
  // و1.0 للمتن (العمود 2)؛ العمود 0 (ark) غير مفهرس فوزنه 0.0 بلا أثر.
  // (العقد كتب bm25(..., 8.0, 1.0) لكن الوزن الأول كان سيقع على ark لا على العنوان)
  const orderSql = ftsQuery
    ? 'ORDER BY bm25(materials_fts, 0.0, 8.0, 1.0), m.updated_at DESC, m.id DESC'
    : 'ORDER BY m.updated_at DESC, m.id DESC';

  const snippetSql = ftsQuery
    ? `, CASE WHEN materials_fts.ark IS NOT NULL THEN snippet(materials_fts, 2, '<mark>', '</mark>', '…', 30) ELSE NULL END AS snippet, CASE WHEN materials_fts.ark IS NOT NULL THEN bm25(materials_fts, 0.0, 8.0, 1.0) ELSE 999999 END AS relevance`
    : `, NULL AS snippet`;

  const limit = perPage + 1;
  // The limit is normalized above; keeping it as a literal preserves the
  // look-ahead row on D1 and lets cursor requests avoid OFFSET entirely.
  const limitSql = ` LIMIT ${limit}${cursor ? '' : ` OFFSET ${offset}`}`;

  const itemsSql =
    `SELECT m.*${snippetSql} FROM materials m${joinSql}${whereSql} ${orderSql}${limitSql}`;
  const itemsStarted = Date.now();
  let itemsRes;
  try {
    itemsRes = await db.prepare(itemsSql).bind(...binds).all();
    await recordQueryMetric(db, metricsRoute, ftsQuery ? 'search.materials.fts' : likeSearch ? 'search.materials.like' : 'search.materials.list', Date.now() - itemsStarted, Number(itemsRes.meta?.rows_read ?? itemsRes.results?.length ?? 0), false, metricsSampleRate);
  } catch (error) {
    await recordQueryMetric(db, metricsRoute, ftsQuery ? 'search.materials.fts' : likeSearch ? 'search.materials.like' : 'search.materials.list', Date.now() - itemsStarted, 0, true, metricsSampleRate);
    throw error;
  }

  let countRow = { c: null };
  if (includeCount) {
    const countWhereSql = countWhere.length ? ' WHERE ' + countWhere.join(' AND ') : '';
    const countSql = `SELECT COUNT(DISTINCT m.id) AS c FROM materials m${joinSql}${countWhereSql}`;
    const countStarted = Date.now();
    try {
      const countRes = await db.prepare(countSql).bind(...countBinds).all();
      countRow = countRes.results?.[0] || { c: 0 };
      await recordQueryMetric(db, metricsRoute, 'search.materials.count', Date.now() - countStarted, Number(countRes.meta?.rows_read ?? 1), false, metricsSampleRate);
    } catch (error) {
      await recordQueryMetric(db, metricsRoute, 'search.materials.count', Date.now() - countStarted, 0, true, metricsSampleRate);
      throw error;
    }
  }

  const rawItems = itemsRes.results || [];
  const items = rawItems.slice(0, perPage);
  const tail = items[items.length - 1];
  const nextCursor = rawItems.length > perPage && tail
    ? encodeCursor({ relevance: ftsQuery ? Number(tail.relevance) : undefined, updated_at: tail.updated_at || '', id: tail.id })
    : null;
  return {
    items,
    total: countRow ? countRow.c : 0,
    page,
    perPage,
    nextCursor,
    hasMore: Boolean(nextCursor),
    paginationMode: cursor ? 'cursor' : 'page',
  };
}

async function recordQueryMetric(db, route, queryKey, durationMs, rows, failed, sampleRate) {
  const rate = Number(sampleRate);
  if (!(rate > 0) || Math.random() > Math.min(1, rate)) return;
  const day = new Date().toISOString().slice(0, 10);
  try {
    await db.prepare(`INSERT INTO query_metrics_daily
      (day, route, query_key, calls, errors, total_duration_ms, max_duration_ms, total_rows)
      VALUES (?, ?, ?, 1, ?, ?, ?, ?)
      ON CONFLICT(day, route, query_key) DO UPDATE SET
        calls = calls + 1,
        errors = errors + excluded.errors,
        total_duration_ms = total_duration_ms + excluded.total_duration_ms,
        max_duration_ms = max(max_duration_ms, excluded.max_duration_ms),
        total_rows = total_rows + excluded.total_rows`)
      .bind(day, String(route || '/unknown').slice(0, 120), queryKey, failed ? 1 : 0, Math.max(0, Number(durationMs) || 0), Math.max(0, Number(durationMs) || 0), Math.max(0, Number(rows) || 0)).run();
  } catch (_) { /* القياس لا يعطل البحث إذا كانت migration غير مطبقة */ }
}

function encodeCursor(value) {
  try { return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch { return null; }
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const padded = String(value).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(value).length + 3) % 4);
    const parsed = JSON.parse(atob(padded));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
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
