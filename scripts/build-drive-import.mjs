#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const INVENTORY = path.join(ROOT, 'docs', 'tchad-inventory.csv');
const STAGING = path.join(ROOT, 'staging', 'tchad');
const OUT_MANIFEST = path.join(ROOT, 'docs', 'tchad-upload-manifest.json');
const OUT_SQL = path.join(ROOT, 'docs', 'tchad-materials.sql');
const BATCH_ID = 1;
// هذه الملفات خاصة ولا تدخل في أرشيف سِجِل العام.
const PRIVATE_EXCLUDED_ARCS = new Set([
  'ARC-TD-ART-000001','ARC-TD-ART-000002','ARC-TD-ART-000003',
  'ARC-TD-ART-000004','ARC-TD-ART-000005','ARC-TD-ART-000006',
  'ARC-TD-ART-000007','ARC-TD-ART-000008','ARC-TD-ART-000009'
]);

function parseCsv(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(value); value = ''; }
    else if (ch === '\n') { row.push(value); rows.push(row); row = []; value = ''; }
    else if (ch !== '\r') value += ch;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const headers = rows.shift();
  return rows.filter(function(r){ return r.length && r.some(Boolean); }).map(function(r){
    return Object.fromEntries(headers.map(function(h, i){ return [h, r[i] || '']; }));
  });
}
function sql(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  return "'" + String(v).replaceAll("'", "''") + "'";
}
function safeName(name) {
  let s = String(name || '').split(/[\\/]/).pop().trim();
  s = s.normalize('NFD').replace(/[̀-ًͯ-ٰٟ]/g, '')
    .replace(/[^\p{L}\p{N}._()\- ]/gu, '_')
    .replace(/\s+/g, '-').replace(/_+/g, '_').replace(/-+/g, '-')
    .replace(/^[.\-_]+|[.\-_]+$/g, '');
  return (s || 'file').slice(0, 120);
}
function typeDir(type) {
  return ({document:'documents',book:'books',manuscript:'manuscripts',image:'images',map:'maps',article:'articles'})[type] || 'documents';
}
function typeCode(type) {
  return ({document:'DOC',book:'BOK',manuscript:'MSS',image:'IMG',map:'MAP',article:'ART'})[type] || 'DOC';
}
function isTextualFilename(name) {
  return /\.(docx?|txt|md)$/i.test(String(name || ''));
}
function yearOf(name) {
  const m = String(name).match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : null;
}
function sectionFor(item) {
  if (item.path.indexOf('TCHAD/Thèses et recherches') === 0) return 11;
  if (item.path.indexOf('/') === -1) return 6;
  return 3;
}
function collectionIds(item) {
  const s = (item.name + ' ' + item.path).toLowerCase();
  const out = [];
  if (/ab[eé]ch|abeche/.test(s)) out.push(1);
  if (/ouadd|ouadda|waday/.test(s)) out.push(2);
  return out;
}

const rows = parseCsv(await fs.readFile(INVENTORY, 'utf8'));
const stagedNames = new Set(await fs.readdir(STAGING));
const counters = {ART:1, BOK:38, DOC:6, IMG:6, MAP:1, MSS:1};
const items = [], missing = [];

for (const row of rows) {
  const ext = (row.name.match(/\.([^.]+)$/) || [,'bin'])[1].toLowerCase().replace(/[^a-z0-9]/g, '');
  const filename = row.drive_id + '.' + ext;
  const filePath = path.join(STAGING, filename);
  if (!stagedNames.has(filename)) { missing.push(Object.assign({}, row, {filename: filename})); continue; }
  const bytes = await fs.readFile(filePath);
  let textualBody = '';
  if (isTextualFilename(row.name)) {
    const textExt = ext === 'docx' ? path.join(STAGING, 'docx-text', row.drive_id + '.txt') : filePath;
    try { textualBody = (await fs.readFile(textExt, 'utf8')).replace(/^\uFEFF/, '').replace(/\0/g, '').trim(); } catch (e) { textualBody = ''; }
  }
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const type = row.classification || 'document';
  const code = typeCode(type);
  const num = counters[code] || 1;
  counters[code] = num + 1;
  const ark = 'ARC-TD-' + code + '-' + String(num).padStart(6, '0');
  const baseTitle = row.name.replace(/\.[^.]+$/, '').replaceAll('_', ' ').trim();
  const year = yearOf(row.name);
  const language = /[\u0600-\u06ff]/.test(baseTitle) ? 'ar' : 'fr';
  const r2Key = 'originals/' + typeDir(type) + '/' + ark + '/' + sha256.slice(0, 8) + '-' + safeName(row.name);
  items.push(Object.assign({}, row, {type:type, ark:ark, title_ar:baseTitle, title_orig:baseTitle, year:year, language:language, filePath:filePath, size:bytes.length, sha256:sha256, r2Key:r2Key, sectionId:sectionFor(row), collectionIds:collectionIds(row)}));
}

const manifest = {batchId:BATCH_ID, generatedAt:new Date().toISOString(), sourceFolder:'TCHAD', total:rows.length, ready:items.length, missing:missing, items:items};
await fs.writeFile(OUT_MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');

const statements = ['BEGIN TRANSACTION;'], counts = {};
for (const item of items) {
  counts[item.type] = (counts[item.type] || 0) + 1;
  if (PRIVATE_EXCLUDED_ARCS.has(item.ark)) {
    statements.push(
      'UPDATE materials SET publish_status=' + sql('hidden') + ',review_note=' + sql('مادة خاصة مستثناة من أرشيف سِجِل بناءً على توجيه الإدارة.') + ',updated_at=datetime(\'now\') WHERE ark=' + sql(item.ark) + ';',
      'UPDATE drive_import_items SET status=' + sql('excluded') + ',error_message=' + sql('ملف خاص مستثنى من أرشيف سِجِل بناءً على توجيه الإدارة.') + ',updated_at=datetime(\'now\') WHERE batch_id=' + BATCH_ID + ' AND drive_file_id=' + sql(item.drive_id) + ';'
    );
    continue;
  }
  const description = isTextualFilename(item.name)
    ? 'نص موثق مستخرج من الوثيقة الأصلية؛ يُعرض للقراءة داخل المنصة ولا يُتاح كملف Word أو نص للتنزيل.'
    : 'مادة رقمية محفوظة في سِجِل؛ بيانات المصدر الخارجي تُراجع قبل النشر.';
  statements.push(
    'INSERT OR IGNORE INTO materials (ark,created_by,type,title_ar,title_orig,description,language,year,date_confidence,archive_ref,source_url,rights,publish_status,created_via,source_attribution,rights_status) VALUES (' + [sql(item.ark),1,sql(item.type),sql(item.title_ar),sql(item.title_orig),sql(description),sql(item.language),item.year === null ? 'NULL' : item.year,sql(item.year ? 'approximate' : 'unknown'),'NULL','NULL','NULL',sql('draft'),sql('drive_import'),sql(isTextualFilename(item.name) ? 'نص موثق مستخرج من الوثيقة الأصلية' : 'المصدر الخارجي قيد التحقق قبل النشر'),sql('unknown')].join(',') + ');',
    'INSERT OR IGNORE INTO materials_fts (ark,title,body) VALUES (' + [sql(item.ark),sql(item.title_ar),sql(description)].join(',') + ');',
    'INSERT OR IGNORE INTO files (material_id,kind,filename,mime,size,sha256,r2_key) SELECT id,' + [sql('original'),sql(item.name),sql(item.mime),item.size,sql(item.sha256),sql(item.r2Key)].join(',') + ' FROM materials WHERE ark=' + sql(item.ark) + ';',
    'UPDATE drive_import_items SET status=' + sql('imported') + ',material_id=(SELECT id FROM materials WHERE ark=' + sql(item.ark) + '),sha256=' + sql(item.sha256) + ',r2_key=' + sql(item.r2Key) + ',metadata_json=' + sql(JSON.stringify({title:item.title_ar,type:item.type,year:item.year,language:item.language,sectionId:item.sectionId,collectionIds:item.collectionIds})) + ',updated_at=datetime(\'now\') WHERE batch_id=' + BATCH_ID + ' AND drive_file_id=' + sql(item.drive_id) + ';'
  );
  statements.push('INSERT OR IGNORE INTO material_collections (material_id,collection_id,sort_order) SELECT id,' + item.sectionId + ',0 FROM materials WHERE ark=' + sql(item.ark) + ';');
  item.collectionIds.forEach(function(id, i){ statements.push('INSERT OR IGNORE INTO material_collections (material_id,collection_id,sort_order) SELECT id,' + id + ',' + (i+1) + ' FROM materials WHERE ark=' + sql(item.ark) + ';'); });
  if (item.type === 'image') statements.push('INSERT OR IGNORE INTO image_versions (material_id,version_type,file_id,process_note) SELECT material_id,' + sql('original') + ',id,' + sql('النسخة الأصلية المحفوظة في سِجِل') + ' FROM files WHERE r2_key=' + sql(item.r2Key) + ';');
  if (textualBody) {
    statements.push('UPDATE materials SET full_text=\'\',transcription_status=\'corrected\' WHERE ark=' + sql(item.ark) + ';');
    const chars = Array.from(textualBody);
    for (let offset = 0; offset < chars.length; offset += 4000) statements.push('UPDATE materials SET full_text=full_text||' + sql(chars.slice(offset, offset + 4000).join('')) + ' WHERE ark=' + sql(item.ark) + ';');
    statements.push('DELETE FROM transcriptions WHERE material_id=(SELECT id FROM materials WHERE ark=' + sql(item.ark) + ') AND layer=\'manual\';');
    statements.push('INSERT INTO transcriptions (material_id,layer,lang,text) SELECT id,\'manual\',' + sql(item.language || 'fr') + ',full_text FROM materials WHERE ark=' + sql(item.ark) + ';');
    statements.push('DELETE FROM materials_fts WHERE ark=' + sql(item.ark) + ';');
    statements.push('INSERT INTO materials_fts (ark,title,body) SELECT ark,title_ar,full_text FROM materials WHERE ark=' + sql(item.ark) + ';');
  }
}
for (const type of Object.keys(counts)) statements.push('UPDATE counters SET next_num=next_num+' + counts[type] + ' WHERE type_code=' + sql(typeCode(type)) + ';');
statements.push('UPDATE drive_import_batches SET status=' + sql('imported') + ',processed_files=' + items.length + ',imported_files=' + items.length + ',failed_files=' + missing.length + ',updated_at=datetime(\'now\') WHERE id=' + BATCH_ID + ';');
statements.push('COMMIT;');
await fs.writeFile(OUT_SQL, statements.join('\n') + '\n', 'utf8');
console.log(JSON.stringify({total:rows.length, ready:items.length, missing:missing.length, counts:counts, manifest:OUT_MANIFEST, sql:OUT_SQL}, null, 2));
