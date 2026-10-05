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

  // طلب ترجمة من قارئ (زر «اطلب ترجمة هذا الكتاب»)
  if (req.method === 'POST' && path === '/api/v1/translation-requests') {
    return apiTranslationRequest(req, env);
  }

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
      admin: !!user,
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

  m = rest.match(/^document\/([^/]+)\/citation$/);
  if (m) return apiCitation(env, url, decodeURIComponent(m[1]));

  m = rest.match(/^document\/([^/]+)$/);
  if (m) return apiDocument(env, decodeURIComponent(m[1]));

  m = rest.match(/^collections\/(\d+)$/);
  if (m) return apiCollection(env, parseInt(m[1], 10));

  m = rest.match(/^materials\/(\d+)\/translations$/);
  if (m) return apiMaterialTranslations(env, parseInt(m[1], 10));

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

// ---------- طلبات الترجمة من القرّاء ----------

/**
 * POST /api/v1/translation-requests {material_id, source_file_id?, target_lang?}
 * - يرفض الطلب إن وُجد نظير جاهز للملف.
 * - يمنع التكرار (نفس المادة + IP خلال 30 يومًا) ويحد المعدل (5/يوم لكل IP).
 */
async function apiTranslationRequest(req, env) {
  const db = env.DB;
  let body;
  try { body = await req.json(); } catch { return err('طلب غير صالح', 400); }
  const materialId = parseInt(body.material_id, 10);
  const fileId = body.source_file_id != null && body.source_file_id !== '' ? parseInt(body.source_file_id, 10) : null;
  const targetLang = body.target_lang && ['ar', 'fr'].includes(body.target_lang) ? body.target_lang : null;
  if (!Number.isFinite(materialId)) return err('المادة غير محددة', 400);
  const mat = await db
    .prepare("SELECT id FROM materials WHERE id = ? AND publish_status = 'published'")
    .bind(materialId).first();
  if (!mat) return err('المادة غير موجودة', 404);
  if (Number.isFinite(fileId)) {
    const has = await db
      .prepare("SELECT id FROM file_translations WHERE source_file_id = ? AND status = 'ready'")
      .bind(fileId).first();
    if (has) return err('الترجمة متوفرة بالفعل لهذا الملف', 409);
  }
  const ip = req.headers.get('cf-connecting-ip')
    || String(req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || 'unknown';
  const dup = await db.prepare(
    `SELECT id FROM translation_requests
     WHERE material_id = ? AND status = 'new' AND requester_ip = ?
       AND created_at >= datetime('now', '-30 days')
       AND ((source_file_id = ?) OR (source_file_id IS NULL AND ? IS NULL))`
  ).bind(materialId, ip, fileId, fileId).first();
  if (dup) return json({ ok: true, duplicate: true });
  const dayCount = await db.prepare(
    "SELECT COUNT(*) AS c FROM translation_requests WHERE requester_ip = ? AND created_at >= datetime('now', '-1 day')"
  ).bind(ip).first();
  if (Number(dayCount?.c || 0) >= 5) return err('تجاوزت الحد اليومي لطلبات الترجمة', 429);
  let requesterId = null;
  try { const u = await getSessionUser(req, env); requesterId = u?.id || null; } catch {}
  await db.prepare(
    'INSERT INTO translation_requests (material_id, source_file_id, target_lang, requester_id, requester_ip) VALUES (?, ?, ?, ?, ?)'
  ).bind(materialId, Number.isFinite(fileId) ? fileId : null, targetLang, requesterId, ip).run();
  return json({ ok: true }, 201);
}

// ---------- نظائر ترجمة مادة (للقارئ) ----------
async function apiMaterialTranslations(env, materialId) {
  const db = env.DB;
  const mat = await db
    .prepare("SELECT id FROM materials WHERE id = ? AND publish_status = 'published'")
    .bind(materialId).first();
  if (!mat) return err('المادة غير موجودة', 404);
  const rows = await db.prepare(
    `SELECT ft.source_file_id, ft.source_lang, ft.target_lang, ft.translation_file_id,
            f.filename AS translation_filename, f.size AS translation_size
     FROM file_translations ft
     JOIN files f ON f.id = ft.translation_file_id
     WHERE ft.material_id = ? AND ft.status = 'ready'`
  ).bind(materialId).all();
  return json({ items: rows.results || [] });
}

// ---------- البحث العام ----------

async function apiSearch(req, env, url) {
  const sp = url.searchParams;
  const result = await searchMaterials(env.DB, {
    q: sp.get('q') || undefined,
    type: sp.get('type') || undefined,
    fromYear: sp.get('fromYear') || undefined,
    toYear: sp.get('toYear') || undefined,
    region: sp.get('region') || undefined,
    lang: sp.get('lang') || undefined,
    personId: sp.get('personId') || undefined,
    tagId: sp.get('tagId') || undefined,
    sourceId: sp.get('sourceId') || undefined,
    collectionId: sp.get('collectionId') || undefined,
    placeId: sp.get('placeId') || undefined,
    page: sp.get('page') || 1,
    perPage: sp.get('perPage') || 20,
    publishedOnly: true,
  });

  const items = result.items;
  const ids = items.map((i) => i.id);
  const placeMap = new Map((await inQuery(env.DB, 'places', [...new Set(items.map((i) => i.place_id).filter(Boolean))], 'id, name_ar')).map((p) => [p.id, p]));
  const sourceMap = new Map((await inQuery(env.DB, 'sources', [...new Set(items.map((i) => i.source_id).filter(Boolean))], 'id, name_ar, name')).map((s) => [s.id, s]));

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
      ark: i.ark,
      type: i.type,
      title_ar: i.title_ar,
      title_orig: i.title_orig,
      year: i.year,
      date_text: i.date_text,
      place_name: i.place_id && placeMap.get(i.place_id) ? placeMap.get(i.place_id).name_ar : null,
      source_name:
        i.source_id && sourceMap.get(i.source_id)
          ? sourceMap.get(i.source_id).name_ar || sourceMap.get(i.source_id).name
          : null,
      thumb: thumbMap.get(i.id) || null,
    })),
    total: result.total,
    page: result.page,
    perPage: result.perPage,
  });
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
  people: { table: 'people', order: 'name_ar', searchCols: ['name_ar', 'name_orig'] },
  places: { table: 'places', order: 'name_ar', searchCols: ['name_ar', 'name_orig', 'region'] },
  sources: { table: 'sources', order: 'name_ar', searchCols: ['name_ar', 'name'] },
  tags: { table: 'tags', order: 'name_ar', searchCols: ['name_ar', 'name_orig'] },
  collections: { table: 'collections', order: 'sort_order, title_ar', searchCols: ['title_ar', 'title_fr'] },
};

async function apiList(env, url, key) {
  const cfg = LIST_CONFIG[key];
  const { page, perPage, offset } = pageParams(url);
  const q = (url.searchParams.get('q') || '').trim();
  const where = [];
  const binds = [];
  if (q) {
    where.push(`(${cfg.searchCols.map((c) => `${c} LIKE ?`).join(' OR ')})`);
    for (const _ of cfg.searchCols) binds.push(`%${q}%`);
  }
  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const [itemsRes, countRow] = await Promise.all([
    env.DB.prepare(`SELECT * FROM ${cfg.table}${whereSql} ORDER BY ${cfg.order} LIMIT ? OFFSET ?`)
      .bind(...binds, perPage, offset)
      .all(),
    env.DB.prepare(`SELECT COUNT(*) AS c FROM ${cfg.table}${whereSql}`).bind(...binds).first(),
  ]);
  return json({ items: itemsRes.results, total: countRow.c, page, perPage });
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

  const urls = [
    ...statics.map((p) => `  <url><loc>${base}${p}</loc></url>`),
    ...mats.results.map(
      (r) =>
        `  <url><loc>${base}/document/${r.ark}</loc><lastmod>${String(r.updated_at).slice(0, 10)}</lastmod></url>`
    ),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join('\n') +
    `\n</urlset>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
