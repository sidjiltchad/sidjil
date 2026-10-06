// ============================================================
// SIDJIL — JSON API العام + تقديم الملفات + sitemap
// فريق الخلفية — routeApi(req, env): Promise<Response|null>
// ============================================================

import { getMaterialFull } from './lib/db.js';
import { getSessionUser } from './lib/auth.js';
import { searchMaterials } from './lib/search.js';
import { serveFile } from './lib/r2files.js';
import { buildCitation } from './lib/citation.js';

// ---------- أدوات ----------

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

const err = (message, status = 400) => json({ error: message }, status);

function normPath(pathname) {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

function pageParams(url) {
  const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('perPage'), 10) || 20));
  return { page, perPage, offset: (page - 1) * perPage };
}

async function inQuery(db, table, ids, cols = '*') {
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  const res = await db.prepare(`SELECT ${cols} FROM ${table} WHERE id IN (${ph})`).bind(...ids).all();
  return res.results;
}

// ---------- الموجّه ----------

export async function routeApi(req, env) {
  const url = new URL(req.url);
  const path = normPath(url.pathname);
  if (req.method === 'POST' && path === '/api/v1/translation-requests') return apiTranslationRequest(req, env);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (path.startsWith('/api/v1/') || path.startsWith('/file/') || path.startsWith('/discussion-file/')) {
      return err('الطريقة غير مدعومة', 405);
    }
    return null;
  }

  // ملفات: /file/:id
  let m = path.match(/^\/file\/(\d+)$/);
  if (m) {
    const user = await getSessionUser(req, env);
    return serveFile(env, parseInt(m[1], 10), {
      download: url.searchParams.get('download') === '1',
      // كل تنزيل PDF يمر عبر نسخة تحمل علامة سِجِل المائية.
      watermark: url.searchParams.get('watermark') === '1' || url.searchParams.get('download') === '1',
      // لا يكفي وجود جلسة؛ الباحث لا يتجاوز حالة النشر.
      admin: Boolean(user && (user.role === 'admin' || Number(user.is_super_admin) === 1)),
    });
  }

  m = path.match(/^\/discussion-file\/(\d+)$/);
  if (m) return serveDiscussionImage(env, parseInt(m[1], 10));

  if (path === '/sitemap.xml') return sitemap(req, env);

  if (!path.startsWith('/api/v1/')) return null;
  const rest = path.slice('/api/v1/'.length);

  if (rest === 'search') return apiSearch(req, env, url);
  if (rest === 'stats') return apiStats(env);
  if (rest === 'glossary') return apiGlossary(env, url);
  if (rest === 'map-points') return apiMapPoints(env, url);

  m = rest.match(/^materials\/(\d+)\/translations$/);
  if (m) return apiMaterialTranslations(env, parseInt(m[1], 10));

  m = rest.match(/^materials\/(\d+)\/details$/);
  if (m) return apiMaterialDetails(env, parseInt(m[1], 10));

  m = rest.match(/^document\/([^/]+)\/citation$/);
  if (m) return apiCitation(env, url, decodeURIComponent(m[1]));

  m = rest.match(/^document\/([^/]+)$/);
  if (m) return apiDocument(env, decodeURIComponent(m[1]));

  m = rest.match(/^collections\/(\d+)$/);
  if (m) return apiCollection(env, parseInt(m[1], 10));

  if (['people', 'places', 'sources', 'tags', 'collections'].includes(rest)) {
    return apiList(env, url, rest);
  }

  if (rest.startsWith('document/') || rest.startsWith('collections/')) {
    return err('غير موجود', 404);
  }
  return null; // مسار غير معروف → يتركه للموجه الرئيسي
}

async function serveDiscussionImage(env, id) {
  const file = await env.DB.prepare(
    `SELECT f.r2_key, f.mime FROM discussion_files f
     JOIN discussions d ON d.id = f.discussion_id
     WHERE f.id = ? AND d.status = 'published'`
  ).bind(id).first();
  if (!file) return err('الصورة غير موجودة', 404);
  const object = await env.FILES.get(file.r2_key);
  if (!object) return err('الصورة غير موجودة', 404);
  const headers = new Headers({
    'Content-Type': file.mime || 'image/jpeg',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  if (object.size != null) headers.set('Content-Length', String(object.size));
  return new Response(object.body, { headers });
}

// ---------- طلبات نظائر الترجمة اليدوية ----------
async function apiTranslationRequest(req, env) {
  const db = env.DB;
  let body;
  try { body = await req.json(); } catch { return err('طلب غير صالح', 400); }
  const materialId = parseInt(body.material_id, 10);
  const rawFileId = body.source_file_id;
  const fileId = rawFileId !== undefined && rawFileId !== '' ? parseInt(rawFileId, 10) : null;
  const targetLang = ['ar', 'fr'].includes(body.target_lang) ? body.target_lang : null;
  if (!Number.isFinite(materialId)) return err('المادة غير محددة', 400);
  const mat = await db.prepare("SELECT id FROM materials WHERE id = ? AND publish_status = 'published'").bind(materialId).first();
  if (!mat) return err('المادة غير موجودة', 404);
  if (Number.isFinite(fileId)) {
    const ready = await db.prepare("SELECT id FROM file_translations WHERE source_file_id = ? AND status = 'ready'").bind(fileId).first().catch(() => null);
    if (ready) return err('الترجمة متوفرة بالفعل لهذا الملف', 409);
  }
  let requester = null;
  try { requester = await getSessionUser(req, env); } catch {}
  const requesterName = String(requester?.display_name || requester?.username || body.requester_name || '').trim().slice(0, 120);
  const requesterEmail = String(requester?.email || body.requester_email || '').trim().slice(0, 160).toLowerCase();
  if (!requesterName) return err('اكتب اسم طالب الترجمة', 400);
  // الباحث الموثق يرسل الطلب مباشرة حتى إن لم يكن بريده محفوظًا في الحساب؛
  // أما زائر الموقع العام فيلزم أن يترك بريدًا صالحًا لمتابعة الطلب.
  if (!requester && (!requesterEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail))) return err('اكتب بريدًا إلكترونيًا صالحًا', 400);
  if (requesterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) return err('اكتب بريدًا إلكترونيًا صالحًا', 400);
  const ip = req.headers.get('cf-connecting-ip') || String(req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const safeFileId = Number.isFinite(fileId) ? fileId : null;
  const duplicate = await db.prepare(`SELECT id FROM translation_requests WHERE material_id = ? AND status = 'new' AND requester_ip = ? AND created_at >= datetime('now','-30 days') AND ((source_file_id = ?) OR (source_file_id IS NULL AND ? IS NULL))`).bind(materialId, ip, safeFileId, safeFileId).first().catch(() => null);
  if (duplicate) return json({ ok: true, duplicate: true });
  const count = await db.prepare("SELECT COUNT(*) AS c FROM translation_requests WHERE requester_ip = ? AND created_at >= datetime('now','-1 day')").bind(ip).first().catch(() => ({ c: 0 }));
  if (Number(count?.c || 0) >= 5) return err('تجاوزت الحد اليومي لطلبات الترجمة', 429);
  await db.prepare('INSERT INTO translation_requests (material_id, source_file_id, target_lang, requester_id, requester_ip, requester_name, requester_email) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(materialId, safeFileId, targetLang, requester?.id || null, ip, requesterName, requesterEmail).run();
  return json({ ok: true }, 201);
}

async function apiMaterialTranslations(env, materialId) {
  const mat = await env.DB.prepare("SELECT id FROM materials WHERE id = ? AND publish_status = 'published'").bind(materialId).first();
  if (!mat) return err('المادة غير موجودة', 404);
  const rows = await env.DB.prepare(`SELECT ft.source_file_id, ft.source_lang, ft.target_lang, ft.translation_file_id, f.filename AS translation_filename, f.mime AS translation_mime, f.size AS translation_size FROM file_translations ft JOIN files f ON f.id = ft.translation_file_id WHERE ft.material_id = ? AND ft.status = 'ready'`).bind(materialId).all().catch(() => ({ results: [] }));
  return json({ items: rows.results || [] });
}

// تفاصيل مادة مخصصة لمساحة الباحث. لا نعيد مفاتيح R2 أو بيانات الإدارة؛
// يكتفي العميل بمعرفات الملفات التي يمر طلبها عبر /file/:id.
async function apiMaterialDetails(env, materialId) {
  const row = await env.DB.prepare("SELECT ark FROM materials WHERE id = ? AND publish_status = 'published'").bind(materialId).first();
  const material = row?.ark ? await getMaterialFull(env.DB, row.ark) : null;
  if (!material || material.publish_status !== 'published') return err('المادة غير موجودة', 404);
  const files = (material.files || []).map(file => ({
    id: file.id, filename: file.filename, mime: file.mime, kind: file.kind, size: file.size,
  }));
  const fileTranslations = (material.file_translations || []).map(item => ({
    id: item.id, material_id: item.material_id, source_file_id: item.source_file_id,
    source_lang: item.source_lang, target_lang: item.target_lang, translation_file_id: item.translation_file_id,
    translation_filename: item.translation_filename, translation_mime: item.translation_mime, translation_size: item.translation_size,
  }));
  return json({
    id: material.id, ark: material.ark, type: material.type, material_level: material.material_level,
    title_ar: material.title_ar, title_fr: material.title_fr || null, title_orig: material.title_orig, language: material.language,
    year: material.year, date_text: material.date_text, date_text_fr: material.date_text_fr || null, author: material.author, photographer: material.photographer,
    archive_ref: material.archive_ref, description: material.description, description_fr: material.description_fr || '', summary: material.summary, summary_fr: material.summary_fr || '',
    full_text: material.full_text, source_name_ar: material.source?.name_ar || '', place_name: material.place?.name_ar || '',
    source: material.source ? { name_ar: material.source.name_ar, name_fr: material.source.name_fr, name: material.source.name } : null,
    place: material.place ? { name_ar: material.place.name_ar, name_fr: material.place.name_fr, name_orig: material.place.name_orig } : null,
    files, file_translations: fileTranslations,
  }, 200, { 'Cache-Control': 'private, no-store' });
}

// ---------- البحث العام ----------

async function apiSearch(req, env, url) {
  const sp = url.searchParams;
  const lang = sp.get('lang') === 'fr' ? 'fr' : 'ar';
  let result;
  try {
    result = await searchMaterials(env.DB, {
    q: sp.get('q') || undefined,
    type: sp.get('type') || undefined,
    fromYear: sp.get('fromYear') || undefined,
    toYear: sp.get('toYear') || undefined,
    region: sp.get('region') || undefined,
    lang: sp.get('language') || undefined,
    personId: sp.get('personId') || undefined,
    tagId: sp.get('tagId') || undefined,
    sourceId: sp.get('sourceId') || undefined,
    collectionId: sp.get('collectionId') || undefined,
    translationStatus: sp.get('translationStatus') || undefined,
    level: sp.get('level') || undefined,
    placeId: sp.get('placeId') || undefined,
    page: sp.get('page') || 1,
    perPage: sp.get('perPage') || 20,
    cursor: sp.get('cursor') || undefined,
    metricsRoute: '/api/v1/search',
    metricsSampleRate: env.QUERY_METRICS_SAMPLE_RATE || 0.1,
      includeCount: sp.get('count') !== '0',
      publishedOnly: true,
    });
  } catch (error) {
    console.error('api search failed', error && error.message ? error.message : error);
    return err('تعذر تنفيذ البحث الآن. حاول مرة أخرى.', 500);
  }

  const items = result.items;
  const ids = items.map((i) => i.id);
  const placeMap = new Map((await inQuery(env.DB, 'places', [...new Set(items.map((i) => i.place_id).filter(Boolean))], 'id, name_ar, name_fr, name_orig')).map((p) => [p.id, p]));
  const sourceMap = new Map((await inQuery(env.DB, 'sources', [...new Set(items.map((i) => i.source_id).filter(Boolean))], 'id, name_ar, name_fr, name')).map((s) => [s.id, s]));

  // المصغرات/أول صورة لكل مادة
  let thumbMap = new Map();
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const fres = await env.DB
      .prepare(
        `SELECT id, material_id, kind, mime FROM files
         WHERE material_id IN (${ph}) AND (kind IN ('thumbnail', 'cover') OR mime LIKE 'image/%')
         ORDER BY material_id, CASE kind WHEN 'cover' THEN 0 WHEN 'thumbnail' THEN 1 ELSE 2 END, id`
      )
      .bind(...ids)
      .all();
    for (const f of fres.results) {
      if (!thumbMap.has(f.material_id)) thumbMap.set(f.material_id, `/file/${f.id}`);
    }
  }

  return json({
    items: items.map((i) => ({
      id: i.id,
      ark: i.ark,
      type: i.type,
      material_level: i.material_level || null,
      title_ar: i.title_ar,
      title_fr: i.title_fr || null,
      title_orig: i.title_orig,
      description: i.description || '',
      description_fr: i.description_fr || '',
      summary: i.summary || '',
      summary_fr: i.summary_fr || '',
      snippet: i.snippet || null,
      title: lang === 'fr' ? (i.title_fr || i.title_orig || i.title_ar || i.ark) : (i.title_ar || i.title_orig || i.ark),
      year: i.year,
      date_text: i.date_text,
      date_text_fr: i.date_text_fr || null,
      place_name: i.place_id && placeMap.get(i.place_id) ? placeMap.get(i.place_id).name_ar : null,
      place_name_localized: i.place_id && placeMap.get(i.place_id)
        ? (lang === 'fr'
          ? (placeMap.get(i.place_id).name_fr || placeMap.get(i.place_id).name_orig || placeMap.get(i.place_id).name_ar)
          : (placeMap.get(i.place_id).name_ar || placeMap.get(i.place_id).name_orig))
        : null,
      source_name:
        i.source_id && sourceMap.get(i.source_id)
          ? sourceMap.get(i.source_id).name_ar || sourceMap.get(i.source_id).name
          : null,
      source_name_localized:
        i.source_id && sourceMap.get(i.source_id)
          ? (lang === 'fr'
            ? (sourceMap.get(i.source_id).name_fr || sourceMap.get(i.source_id).name || sourceMap.get(i.source_id).name_ar)
            : (sourceMap.get(i.source_id).name_ar || sourceMap.get(i.source_id).name))
          : null,
      thumb: thumbMap.get(i.id) || null,
    })),
    total: result.total,
    page: result.page,
    perPage: result.perPage,
    nextCursor: result.nextCursor || null,
    hasMore: Boolean(result.hasMore),
    paginationMode: result.paginationMode || 'page',
  }, 200, { 'Cache-Control': 'no-store, max-age=0' });
}

// ---------- مادة واحدة ----------

async function apiDocument(env, ark) {
  const m = await getMaterialFull(env.DB, ark);
  if (!m || m.publish_status !== 'published') return err('المادة غير موجودة', 404);
  return json(m);
}

async function apiCitation(env, url, ark) {
  const lang = url.searchParams.get('lang') === 'fr' ? 'fr' : 'ar';
  const m = await getMaterialFull(env.DB, ark);
  if (!m || m.publish_status !== 'published') return err('المادة غير موجودة', 404);
  return json({ citation: buildCitation(m, lang) });
}

// ---------- القوائم ----------

const LIST_CONFIG = {
  // IDs provide a collation independent keyset for Arabic and French names.
  // The public lists remain deterministic and can now advance past a page on
  // every D1 region without re-including rows because of text collation.
  people: { table: 'people', order: 'id', cursor: ['id'], searchCols: ['name_ar', 'name_orig'] },
  places: { table: 'places', order: 'id', cursor: ['id'], searchCols: ['name_ar', 'name_orig', 'region'] },
  sources: { table: 'sources', order: 'id', cursor: ['id'], searchCols: ['name_ar', 'name'] },
  tags: { table: 'tags', order: 'id', cursor: ['id'], searchCols: ['name_ar', 'name_orig'] },
  // Keep the cursor key numeric. Arabic title comparison depends on the
  // database collation and can make a valid title cursor re-include the same
  // row; sort_order + id preserves the intended grouping without that risk.
  collections: { table: 'collections', order: 'sort_order, id', cursor: ['sort_order', 'id'], searchCols: ['title_ar', 'title_fr'] },
};

function encodeListCursor(value) {
  try { return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } catch { return null; }
}

function decodeListCursor(value) {
  if (!value) return null;
  try { const token = String(value); const padded = token.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((token.length + 3) % 4); const row = JSON.parse(atob(padded)); return row && typeof row === 'object' ? row : null; } catch { return null; }
}

async function apiList(env, url, key) {
  const cfg = LIST_CONFIG[key];
  const { page, perPage } = pageParams(url);
  const cursor = decodeListCursor(url.searchParams.get('cursor'));
  const offset = cursor ? 0 : (page - 1) * perPage;
  const q = (url.searchParams.get('q') || '').trim();
  const where = [];
  const binds = [];
  if (q) {
    where.push(`(${cfg.searchCols.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    for (const _ of cfg.searchCols) binds.push(`%${q}%`);
  }
  const countWhereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const countBinds = binds.slice();
  if (cursor && cfg.cursor.every(column => cursor[column] !== undefined)) {
    if (cfg.cursor.length === 1) {
      const [id] = cfg.cursor;
      where.push(`${id} > ?`);
      binds.push(Number(cursor[id]));
    } else if (cfg.cursor.length === 2) {
      const [value, id] = cfg.cursor;
      where.push(`(${value} > ? OR (${value} = ? AND id > ?))`);
      binds.push(cursor[value], cursor[value], Number(cursor[id]));
    } else {
      const [first, second, id] = cfg.cursor;
      where.push(`(${first} > ? OR (${first} = ? AND (${second} > ? OR (${second} = ? AND id > ?))))`);
      binds.push(cursor[first], cursor[first], cursor[second], cursor[second], Number(cursor[id]));
    }
  }
  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  // Keep LIMIT/OFFSET as validated integer literals. D1/SQLite can legally
  // bind these values, but doing so has produced inconsistent page sizes on
  // older edge runtimes (the look-ahead row was dropped, which hid nextCursor).
  // All user input is normalized by pageParams before interpolation.
  const limitSql = `LIMIT ${perPage + 1}`;
  const offsetSql = cursor ? '' : ` OFFSET ${offset}`;
  const [itemsRes, countRow] = await Promise.all([
    env.DB.prepare(`SELECT * FROM ${cfg.table}${whereSql} ORDER BY ${cfg.order} ${limitSql}${offsetSql}`)
      .bind(...binds)
      .all(),
    env.DB.prepare(`SELECT COUNT(*) AS c FROM ${cfg.table}${countWhereSql}`).bind(...countBinds).first(),
  ]);
  const rawItems = itemsRes.results || [];
  const items = rawItems.slice(0, perPage);
  const tail = items[items.length - 1];
  const nextCursor = rawItems.length > perPage && tail ? encodeListCursor(Object.fromEntries(cfg.cursor.map(column => [column, tail[column]]))) : null;
  return json({ items, total: countRow.c, page, perPage, nextCursor, hasMore: Boolean(nextCursor), paginationMode: cursor ? 'cursor' : 'page' });
}

// ---------- نقاط الخريطة (خريطة سِجِل) ----------
// GET /api/v1/map-points?region=وداي&kind=city
// يُرجع الأماكن ذات الإحداثيات مع موادها المنشورة (كل مادة = حدث/نقطة)

async function apiMapPoints(env, url) {
  const sp = url.searchParams;
  const region = (sp.get('region') || '').trim();
  const kind = (sp.get('kind') || '').trim(); // city | region | site

  const where = ['p.lat IS NOT NULL', 'p.lng IS NOT NULL'];
  const binds = [];
  if (region) { where.push('p.region = ?'); binds.push(region); }
  if (kind) { where.push('p.kind = ?'); binds.push(kind); }
  const whereSql = ' WHERE ' + where.join(' AND ');

  const placesRes = await env.DB.prepare(
    `SELECT p.id, p.name_ar, p.name_orig, p.region, p.kind, p.lat, p.lng, p.place_confidence
     FROM places p${whereSql} ORDER BY p.name_ar`
  ).bind(...binds).all();

  const places = placesRes.results || [];
  const out = [];
  for (const p of places) {
    const mats = await env.DB.prepare(
      `SELECT DISTINCT m.id, m.ark, m.type, m.title_ar, m.title_orig,
              m.description, m.year, m.date_text
       FROM materials m
       LEFT JOIN material_places mp ON mp.material_id = m.id
       WHERE m.publish_status = 'published' AND (mp.place_id = ? OR m.place_id = ?)
       ORDER BY m.year, m.id`
    ).bind(p.id, p.id).all();
    out.push({
      id: p.id,
      name_ar: p.name_ar,
      name_orig: p.name_orig,
      region: p.region,
      kind: p.kind,
      lat: p.lat,
      lng: p.lng,
      confidence: p.place_confidence,
      materials: (mats.results || []).map((m) => ({
        id: m.id,
        ark: m.ark,
        type: m.type,
        title_ar: m.title_ar,
        title_orig: m.title_orig,
        summary: (m.description || '').slice(0, 220),
        year: m.year,
        date_text: m.date_text,
      })),
    });
  }
  return json({ places: out });
}

async function apiCollection(env, id) {
  const col = await env.DB.prepare('SELECT * FROM collections WHERE id = ?').bind(id).first();
  if (!col) return err('المجموعة غير موجودة', 404);
  const mats = await env.DB
    .prepare(
      `SELECT m.ark, m.type, m.title_ar, m.title_orig, m.year, m.date_text
       FROM materials m JOIN material_collections mc ON mc.material_id = m.id
       WHERE mc.collection_id = ? AND m.publish_status = 'published'
       ORDER BY mc.sort_order, m.updated_at DESC`
    )
    .bind(id)
    .all();
  return json({ ...col, materials: mats.results });
}

// ---------- القاموس ----------

async function apiGlossary(env, url) {
  const term = (url.searchParams.get('term') || '').trim();
  if (!term) return err('حدد المصطلح المراد البحث عنه', 400);
  const like = `%${term}%`;
  const res = await env.DB
    .prepare(
      `SELECT * FROM glossary
       WHERE term_orig LIKE ? OR term_ar LIKE ?
       ORDER BY term_orig LIMIT 50`
    )
    .bind(like, like)
    .all();
  return json({ items: res.results, total: res.results.length });
}

// ---------- الإحصاءات ----------

async function apiStats(env) {
  const [mats, images, documents, people, places] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS c FROM materials WHERE publish_status = 'published'").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM materials WHERE publish_status = 'published' AND type = 'image'").first(),
    env.DB.prepare("SELECT COUNT(*) AS c FROM materials WHERE publish_status = 'published' AND type = 'document'").first(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM people').first(),
    env.DB.prepare('SELECT COUNT(*) AS c FROM places').first(),
  ]);
  return json({
    materials: mats.c,
    images: images.c,
    documents: documents.c,
    people: people.c,
    places: places.c,
  });
}

// ---------- خريطة الموقع ----------

async function sitemap(req, env) {
  const base = (env.SITE_URL || new URL(req.url).origin).replace(/\/$/, '');
  const statics = [
    '/',
    '/archive',
    '/search',
    '/advanced-search',
    '/categories',
    '/places',
    '/people',
    '/sources',
    '/collections',
    '/about',
    '/methodology',
  ];
  const mats = await env.DB
    .prepare(
      "SELECT ark, updated_at FROM materials WHERE publish_status = 'published' ORDER BY updated_at DESC"
    )
    .all();

  const localizedUrl = (path, lang) => `${base}${path}${path.includes('?') ? '&' : '?'}lang=${lang}`;
  const urls = [
    ...statics.flatMap((p) => ['ar', 'fr'].map((lang) => `  <url><loc>${localizedUrl(p, lang)}</loc></url>`)),
    ...mats.results.flatMap((r) => ['ar', 'fr'].map((lang) =>
      `  <url><loc>${localizedUrl(`/document/${encodeURIComponent(r.ark)}`, lang)}</loc><lastmod>${String(r.updated_at).slice(0, 10)}</lastmod></url>`
    )),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join('\n') +
    `\n</urlset>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
