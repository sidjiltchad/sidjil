#!/usr/bin/env node
/* Create the nine TCHAD article records that were left only in the import queue. */
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(root, 'docs', 'tchad-upload-manifest.json'), 'utf8'));
const items = manifest.items.filter(item => /^ARC-TD-ART-00000[1-9]$/.test(item.ark));
const textMeta = {
  'ARC-TD-ART-000001': ['هندسة القطيعة — الفصل الأخير: ترميم القطيعة', 'فصل فكري ينتقل من نقد الاستعمار إلى استعادة القدرة على تعريف الذات التشادية من داخل الوثيقة والذاكرة، مع التفريق بين نقد الجرح وإعادة إنتاج التبعية.', 'نص بحثي نقدي يربط الأرشيف الاستعماري بالهوية والذاكرة ويدعو إلى ترميم القطيعة عبر كتابة التاريخ من مصادر متعددة.'],
  'ARC-TD-ART-000002': ['هندسة القطيعة — الفصل الخامس: الاستعمار بعد الاستعمار', 'يفحص الفصل ما بقي من البنى الاستعمارية بعد رحيل الإدارة المباشرة، وكيف تستمر الخريطة واللغة والمؤسسة في تشكيل الدولة والوعي.', 'نص تحليلي عن استمرار آثار الاستعمار في السياسة واللغة والخرائط والعلاقات الاجتماعية بعد الاستقلال.'],
  'ARC-TD-ART-000003': ['هندسة القطيعة — الفصل الرابع: اختراع الانقسام', 'يحلل الفصل صناعة الانقسام واستعمال القبيلة والتصنيفات الاستعمارية لإعادة ترتيب المجتمع التشادي وإضعاف إمكانات التضامن.', 'قراءة نقدية في تحويل الاختلافات الاجتماعية إلى أدوات حكم وصراع، مع ربطها بتاريخ الإدارة الاستعمارية.'],
  'ARC-TD-ART-000004': ['هندسة القطيعة — الفصل الثالث: وأد المعرفة وصناعة البديل', 'يناقش الفصل المدرسة واللغة والدين بوصفها ميادين للصراع على المعرفة، ويشرح كيف صُنعت بدائل استعمارية عن الذاكرة المحلية.', 'دراسة فكرية موسعة لدور التعليم واللغة والدين في إعادة تشكيل المعرفة والهوية في تشاد.'],
  'ARC-TD-ART-000005': ['هندسة القطيعة — الفصل الثاني: من المعرفة إلى الإخضاع (النسخة الموسعة)', 'يتتبع الفصل انتقال المعرفة الاستعمارية من الوصف والقياس إلى الإدارة والإخضاع، وكيف تحولت الخريطة والحليف والتهدئة إلى أدوات سلطة.', 'نسخة موسعة من تحليل تحول المعرفة الجغرافية والإثنوغرافية إلى ممارسة استعمارية للسيطرة.'],
  'ARC-TD-ART-000006': ['هندسة القطيعة — الفصل الثاني: من المعرفة إلى الإخضاع', 'يعرض الفصل كيف سبقت المعرفة الاستعمارية المدفع، وكيف استُخدمت الخرائط والتصنيفات والتحالفات في إخضاع المجال التشادي.', 'نسخة أولى من الفصل الذي يربط إنتاج المعرفة الاستعمارية ببناء أدوات السيطرة السياسية والعسكرية.'],
  'ARC-TD-ART-000007': ['هندسة القطيعة — الفصل الأول: المعرفة التي سبقت المدفع (نسخة موسعة)', 'يفحص الفصل صناعة تشاد موضوعًا للنظر والقياس والتصنيف قبل الاحتلال، ويعيد قراءة لغة الرحلات والتقارير بوصفها مقدمة للفعل الاستعماري.', 'نسخة موسعة من مدخل الكتاب حول الرحلات والخرائط والتصنيف قبل الاحتلال.'],
  'ARC-TD-ART-000008': ['هندسة القطيعة — الفصل الأول: المعرفة التي سبقت المدفع', 'يشرح الفصل كيف صُنعت صورة البلاد في عين المستكشف والإدارة قبل أن تتحول إلى مجال للاحتلال والتنظيم.', 'نسخة مختصرة من الفصل التمهيدي حول المعرفة الاستكشافية والاستعمارية في تشاد.'],
  'ARC-TD-ART-000009': ['هندسة القطيعة — وثيقة التوجيه المنهجي والتحريري', 'وثيقة عمل تضع منهجًا لبناء كتاب نقدي في الاستعمار والتغريب والهوية التشادية، وتحدد دور الباحث في جمع الوثائق وفحصها وتركيب الحجة.', 'دستور تحريري ومنهجي للبحث في تاريخ تشاد، يحدد معايير التوثيق والنقد وبناء الفصول.']
};
const q = value => value === null || value === undefined || value === '' ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const statements = ['-- SIDJIL: استكمال المقالات النصية التي بقيت في طابور الاستيراد دون سجل مادة'];
for (const item of items) {
  const raw = (await fs.readFile(path.join(root, 'staging', 'tchad', 'docx-text', `${item.drive_id}.txt`), 'utf8'))
    .replace(/^\uFEFF/, '').replace(/\0/g, '').trim();
  const [title, summary, description] = textMeta[item.ark];
  statements.push(`INSERT OR IGNORE INTO materials (ark,created_by,type,title_ar,title_orig,description,summary,language,year,date_confidence,archive_ref,source_url,rights,full_text,transcription_status,translation_status,publish_status,created_via,source_attribution,rights_status) VALUES (${q(item.ark)},1,'article',${q(title)},${q(title)},${q(description)},${q(summary)},'ar',NULL,'unknown',NULL,NULL,'unknown','', 'corrected','none','published','drive_import',${q('نص موثق مستخرج من وثيقة TCHAD الأصلية؛ يُعرض للقراءة داخل المنصة ولا يُتاح كملف Word أو نص للتنزيل.')},'unknown');`);
  statements.push(`INSERT OR IGNORE INTO files (material_id,kind,filename,mime,size,sha256,r2_key) SELECT id,'original',${q(item.name)},${q(item.mime)},${Number(item.size) || 0},${q(item.sha256)},${q(item.r2Key)} FROM materials WHERE ark=${q(item.ark)};`);
  statements.push(`INSERT OR IGNORE INTO material_collections (material_id,collection_id,sort_order) SELECT id,3,0 FROM materials WHERE ark=${q(item.ark)};`);
  statements.push(`UPDATE drive_import_items SET status='in_review',material_id=(SELECT id FROM materials WHERE ark=${q(item.ark)}),sha256=${q(item.sha256)},r2_key=${q(item.r2Key)},updated_at=datetime('now') WHERE batch_id=1 AND drive_file_id=${q(item.drive_id)};`);
  statements.push(`UPDATE materials SET title_ar=${q(title)},description=${q(description)},summary=${q(summary)},full_text='',updated_at=datetime('now') WHERE ark=${q(item.ark)};`);
  const chars = Array.from(raw);
  for (let i = 0; i < chars.length; i += 4000) statements.push(`UPDATE materials SET full_text=full_text||${q(chars.slice(i, i + 4000).join(''))} WHERE ark=${q(item.ark)};`);
  statements.push(`DELETE FROM transcriptions WHERE material_id=(SELECT id FROM materials WHERE ark=${q(item.ark)}) AND layer='manual';`);
  statements.push(`INSERT INTO transcriptions (material_id,layer,lang,text) SELECT id,'manual','ar',full_text FROM materials WHERE ark=${q(item.ark)};`);
  statements.push(`DELETE FROM materials_fts WHERE ark=${q(item.ark)};`);
  statements.push(`INSERT INTO materials_fts (ark,title,body) SELECT ark,title_ar,trim(coalesce(description,'')||char(10)||coalesce(summary,'')||char(10)||coalesce(full_text,'')) FROM materials WHERE ark=${q(item.ark)};`);
}
await fs.writeFile(path.join(root, 'migrations', '0022_missing_article_records.sql'), statements.join('\n') + '\n');
console.log(JSON.stringify({records: items.length, migration: '0022_missing_article_records.sql'}, null, 2));
