#!/usr/bin/env node
/* Add the textual ingest items that were left without a material row by the
 * first Drive import, then repopulate all 28 textual records consistently. */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const STAGING = path.join(ROOT, 'staging', 'tchad');
const items = JSON.parse(await fs.readFile(path.join(ROOT, 'docs', 'tchad-upload-manifest.json'), 'utf8')).items;
const textItems = items.filter(x => /\.(docx?|txt|md)$/i.test(x.name));
const q = v => v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`;
const yearOf = name => { const m = String(name).match(/\b(1[5-9]\d{2}|20\d{2})\b/); return m ? Number(m[1]) : null; };
const sectionFor = item => item.path.includes('TCHAD/Thèses et recherches') ? 11 : item.path.includes('/') ? 3 : 6;

function contentFor(item) {
  const ext = item.name.split('.').pop().toLowerCase();
  const p = ext === 'docx' ? path.join(STAGING, 'docx-text', `${item.drive_id}.txt`) : path.join(STAGING, `${item.drive_id}.${ext}`);
  return fs.readFile(p, 'utf8').then(raw => {
    const body = raw.replace(/^\uFEFF/, '').replace(/\0/g, '').trim();
    const lines = body.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    let title = item.name.replace(/\.[^.]+$/, '').replaceAll('_', ' ').trim();
    if (item.drive_id === '1-tiBWmPh21_vdJeMgR3ncUbhpG3KIDPM') title = 'المكتبة الأكاديمية التشادية — الفهرس الموحّد';
    else if (item.drive_id === '1ZTYOS1FWlTZsT4gu2tbXaYNBvzL_neWF') title = 'L. Roserot de Melin — في منطقة تشاد مع بعثة Tilho';
    else if (item.drive_id === '11jkJLu3oyx3Oqgeu5fokgG9zFMfht5hw') title = 'أداة البحث الأرشيفية — وصف الملف PA-AP/399';
    else if (lines[0] === 'هندسة القطيعة' && lines[1]) title = `هندسة القطيعة — ${lines[1]}${lines[2] ? ` — ${lines[2]}` : ''}`;
    else if (lines[0] && lines[0].length <= 180 && !/^[-=*_#]+$/.test(lines[0])) title = lines[0].replace(/^#+\s*/, '').trim();
    const src = item.drive_id === '1ZTYOS1FWlTZsT4gu2tbXaYNBvzL_neWF'
      ? ['https://fr.wikisource.org/wiki/Livre:Le_Tour_du_monde,_nouvelle_s%C3%A9rie_-_15.djvu', 'OCR مضبوط من نسخة Gallica؛ فهرسة مقابلة مع Wikisource']
      : item.drive_id === '11jkJLu3oyx3Oqgeu5fokgG9zFMfht5hw'
        ? ['https://archivesdiplomatiques.diplomatie.gouv.fr/ark:/14366/k518lcrwpjbm', 'Archives diplomatiques — أداة البحث الرسمية PA-AP/399']
        : [null, 'نص موثق مستخرج من الوثيقة الأصلية؛ يُعرض للقراءة داخل المنصة ولا يُتاح كملف Word أو نص للتنزيل.'];
    return { item, body, title, sourceUrl:src[0], sourceAttribution:src[1] };
  });
}

const records = await Promise.all(textItems.map(contentFor));
const metadata = ['-- SIDJIL: إنشاء سجلات الوثائق النصية التي لم تُنشأ في الاستيراد الأول'];
const bodies = ['-- SIDJIL: استكمال نصوص الوثائق النصية بعد إنشاء السجلات الناقصة'];
for (const {item, body, title, sourceUrl, sourceAttribution} of records) {
  const description = sourceAttribution;
  const year = yearOf(item.name);
  const type = item.type || 'document';
  metadata.push(`INSERT OR IGNORE INTO materials (ark,created_by,type,title_ar,title_orig,description,language,year,date_confidence,archive_ref,source_url,rights,full_text,transcription_status,translation_status,publish_status,created_via,source_attribution,rights_status) VALUES (${q(item.ark)},1,${q(type)},${q(title)},${q(title)},${q(description)},${q(item.language || 'fr')},${year === null ? 'NULL' : year},${q(year ? 'approximate' : 'unknown')},NULL,${q(sourceUrl)},'unknown','', 'corrected','none','in_review','drive_import',${q(sourceAttribution)},'unknown');`);
  metadata.push(`INSERT OR IGNORE INTO files (material_id,kind,filename,mime,size,sha256,r2_key) SELECT id,'original',${q(item.name)},${q(item.mime)},${Number(item.size) || 0},${q(item.sha256)},${q(item.r2Key)} FROM materials WHERE ark=${q(item.ark)};`);
  metadata.push(`INSERT OR IGNORE INTO material_collections (material_id,collection_id,sort_order) SELECT id,${sectionFor(item)},0 FROM materials WHERE ark=${q(item.ark)};`);
  metadata.push(`UPDATE drive_import_items SET status='in_review',material_id=(SELECT id FROM materials WHERE ark=${q(item.ark)}),sha256=${q(item.sha256)},r2_key=${q(item.r2Key)},updated_at=datetime('now') WHERE batch_id=1 AND drive_file_id=${q(item.drive_id)};`);
  const chars = Array.from(body);
  bodies.push(`UPDATE materials SET title_ar=${q(title)}, full_text='', transcription_status='corrected', description=${q(description)}, source_url=${q(sourceUrl)}, source_attribution=${q(sourceAttribution)}, updated_at=datetime('now') WHERE ark=${q(item.ark)};`);
  for (let i = 0; i < chars.length; i += 4000) bodies.push(`UPDATE materials SET full_text=full_text||${q(chars.slice(i, i + 4000).join(''))} WHERE ark=${q(item.ark)};`);
  bodies.push(`DELETE FROM transcriptions WHERE material_id=(SELECT id FROM materials WHERE ark=${q(item.ark)}) AND layer='manual';`);
  bodies.push(`INSERT INTO transcriptions (material_id,layer,lang,text) SELECT id,'manual',${q(item.language || 'fr')},full_text FROM materials WHERE ark=${q(item.ark)};`);
  bodies.push(`DELETE FROM materials_fts WHERE ark=${q(item.ark)};`);
  bodies.push(`INSERT INTO materials_fts (ark,title,body) SELECT ark,title_ar,full_text FROM materials WHERE ark=${q(item.ark)};`);
}
await fs.writeFile(path.join(ROOT, 'migrations', '0016_missing_text_records.sql'), metadata.join('\n') + '\n');
await fs.writeFile(path.join(ROOT, 'migrations', '0017_missing_text_bodies.sql'), bodies.join('\n') + '\n');
console.log(JSON.stringify({textualRecords:records.length, migrations:['0016_missing_text_records.sql','0017_missing_text_bodies.sql']}, null, 2));
