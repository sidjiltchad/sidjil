// SIDJIL — تجهيز تجريبي ببيانات حقيقية من مدونة الباحث (تشاد)
// الاستخدام: node scripts/seed-demo.mjs   (يتطلب wrangler dev على 8787)
import { readFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8787';
const IMG_DIR = '/home/hatch/workspace/tchad-corpus/anom/images';
let cookie = '';

async function call(path, { method = 'GET', body = null, form = null } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let payload = null;
  if (form) payload = form;
  else if (body !== null) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { _raw: text.slice(0, 200) }; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return { res, data };
}

async function uploadFile(materialId, filePath, filename, kind = 'original') {
  const buf = readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'image/jpeg' }), filename);
  form.append('kind', kind);
  const { data } = await call(`/api/v1/admin/materials/${materialId}/files`, { method: 'POST', form });
  return data; // صف الملف (id, r2_key, sha256...)
}

// استخراج النص الفرنسي من ملف التفريغ (إسقاط الترويسة العربية)
function frenchOnly(p) {
  const lines = readFileSync(p, 'utf8').split('\n');
  const idx = lines.findIndex((l) => /[A-Za-zÀ-ÿ]{4}/.test(l) && !/[\u0600-\u06FF]/.test(l));
  return lines.slice(Math.max(0, idx)).join('\n').trim();
}

// ---------- الدخول ----------
// كلمة المرور تُقرأ من البيئة فقط — لا تُكتب صريحة في الكود أبدًا.
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;
if (!SEED_ADMIN_PASSWORD) {
  throw new Error('SEED_ADMIN_PASSWORD غير مضبوطة — عيّنها في البيئة قبل تشغيل البذر.');
}
{
  const res = await fetch(BASE + '/api/v1/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: SEED_ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error('فشل الدخول: ' + (await res.text()).slice(0, 200));
  cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  console.log('✓ دخول المدير');
}

// ---------- الكيانات ----------
const S = {};
for (const s of [
  { name: 'Archives nationales d\u2019outre-mer', name_ar: 'الأرشيف الوطني لما وراء البحار', kind: 'archive', website: 'https://www.archives-nationales.culture.gouv.fr/anom', notes: 'Aix-en-Provence — السلاسل GG AEF و8Fi و30Fi' },
  { name: 'Gallica \u2013 Biblioth\u00e8que nationale de France', name_ar: 'غاليكا \u2013 المكتبة الوطنية الفرنسية', kind: 'library', website: 'https://gallica.bnf.fr' },
  { name: 'ECPAD / ImagesD\u00e9fense', name_ar: 'مؤسسة الاتصال والإنتاج السمعي البصري للدفاع', kind: 'archive', website: 'https://imagesdefense.gouv.fr' },
  { name: 'Biblioth\u00e8que interuniversitaire de la Sorbonne (NuBIS)', name_ar: 'مكتبة السوربون الجامعية المشتركة', kind: 'library', website: 'https://nubis.bis-sorbonne.fr' },
]) {
  const { data } = await call('/api/v1/admin/sources', { method: 'POST', body: s });
  S[data.name_ar] = data.id;
}
console.log('✓ المصادر:', Object.keys(S).length);

const P = {};
for (const p of [
  { name_ar: 'أبشة', name_orig: 'Ab\u00e9ch\u00e9', region: 'وداي', kind: 'city', place_confidence: 'confirmed', notes: 'عاصمة سلطنة وداي' },
  { name_ar: 'وداي', name_orig: 'Ouadda\u00ef', region: 'وداي', kind: 'region', place_confidence: 'confirmed' },
  { name_ar: 'فورت لامي', name_orig: 'Fort-Lamy', region: 'شاري', kind: 'city', place_confidence: 'confirmed', notes: 'نجامينا حاليًا' },
]) {
  const { data } = await call('/api/v1/admin/places', { method: 'POST', body: p });
  P[data.name_ar] = data.id;
}
console.log('✓ الأماكن:', Object.keys(P).length);

const PE = {};
for (const p of [
  { name_ar: 'السلطان دود مرة', name_orig: 'Doudmourrah', bio: 'سلطان وداي (1902\u20131909)، أُخضع سنة 1911 وبقي رهن الإقامة الجبرية حتى وفاته 1928.', identity_confidence: 'confirmed' },
  { name_ar: 'المبنغ قاورانغ', name_orig: 'Mbang Gaourang', bio: 'مبنغ باقرمي، وقّع اتفاق فورت لامي 1906 مع الكولونيل غورو.', identity_confidence: 'confirmed' },
]) {
  const { data } = await call('/api/v1/admin/people', { method: 'POST', body: p });
  PE[data.name_ar] = data.id;
}
console.log('✓ الشخصيات:', Object.keys(PE).length);

const T = {};
for (const name_ar of ['التعليم العربي', 'سلطنة وداي', 'صور استعمارية', 'المدرسة القرآنية', 'الكلية الفرنسية العربية']) {
  const { data } = await call('/api/v1/admin/tags', { method: 'POST', body: { name_ar } });
  T[name_ar] = data.id;
}
console.log('✓ الوسوم:', Object.keys(T).length);

const C = {};
for (const c of [
  { title_ar: 'أبشة في الأرشيف الفرنسي', title_fr: 'Ab\u00e9ch\u00e9 dans les archives fran\u00e7aises', description: 'وثائق وصور ومقتطفات سمعية بصرية عن أبشة عاصمة وداي في الأرشيفات الفرنسية.', sort_order: 1 },
  { title_ar: 'سلطنة وداي', title_fr: 'Le sultanat du Ouadda\u00ef', description: 'مواد عن سلطنة وداي: الاستعمار، التعليم، والسلاطين.', sort_order: 2 },
]) {
  const { data } = await call('/api/v1/admin/collections', { method: 'POST', body: c });
  C[data.title_ar] = data.id;
}
console.log('✓ المجموعات:', Object.keys(C).length);

for (const g of [
  ['Ouadda\u00ef', 'وداي', 'أسماء الأماكن'], ['Ab\u00e9ch\u00e9', 'أبشة', 'أسماء الأماكن'],
  ['Fort-Lamy', 'فورت لامي', 'أسماء الأماكن'], ['Baguirmi', 'باقرمي', 'أسماء الأماكن'],
  ['Affaires musulmanes', 'الشؤون الإسلامية', 'مصطلحات إدارية'], ['Commandant de cercle', 'قائد الدائرة', 'مصطلحات إدارية'],
  ['Djellabas', 'الجلابة', 'فئات اجتماعية'], ['faqih', 'فقيه', 'مصطلحات دينية'],
]) {
  await call('/api/v1/admin/glossary', { method: 'POST', body: { term_orig: g[0], term_ar: g[1], domain: g[2] } });
}
console.log('✓ القاموس: 8 مصطلحات');

// ---------- المواد: وثائق الكلية (GG AEF 5D 269) ----------
const anom = S['الأرشيف الوطني لما وراء البحار'];
const abeche = P['أبشة'], ouaddai = P['وداي'];
const colAbeche = C['أبشة في الأرشيف الفرنسي'], colOuaddai = C['سلطنة وداي'];
const docArks = [];
const docs = [
  {
    title_ar: 'رسالة حاكم تشاد إلى الحاكم العام: إلحاق الكلية الفرنسية الإسلامية بأبشة بمكتب الشؤون الإسلامية',
    title_orig: 'Rattachement du coll\u00e8ge franco-musulman d\u2019Ab\u00e9ch\u00e9 au Cabinet du Gouverneur (Affaires musulmanes) \u2014 10 ao\u00fbt 1951',
    description: 'رسالة من حاكم تشاد إلى الحاكم العام لأفريقيا الاستوائية الفرنسية يعلن فيها إلحاق الكلية الفرنسية الإسلامية (المدرسة) في أبشة مباشرة بمكتبه (الشؤون الإسلامية) بدل تبعيتها لمصلحة التعليم، على خلفية التوتر بين الودايين والجلابة حول الفقيه أوليش، وقرار الاستغناء عنه واستقدام معلم مسلم من شمال أفريقيا. وثيقة أساسية لفهم السياسة الفرنسية تجاه التعليم العربي الإسلامي في وداي. (النص منشور لدى برنامج «التعليم والمواطنة والمستعمرات» بجامعة بواتييه؛ الأصل غير مرقمن ويُطالع حضوريًا في إيكس).',
    year: 1951, date_text: '10 أغسطس 1951', author: 'Gouverneur du Tchad \u2014 حاكم تشاد',
    archive_ref: 'GG AEF 5D 269', txt: '/tmp/college/doc1.txt',
  },
  {
    title_ar: 'مذكرة 25 أكتوبر 1951 إلى حاكم تشاد بشأن الكلية الفرنسية الإسلامية بأبشة',
    title_orig: 'Note du 25 octobre 1951 au Gouverneur du Tchad relative au coll\u00e8ge franco-musulman d\u2019Ab\u00e9ch\u00e9',
    description: 'مذكرة إدارية إلى حاكم تشاد تتناول ترتيبات الكلية الفرنسية الإسلامية في أبشة بعد قرار إلحاقها بمكتب الشؤون الإسلامية. (النص منشور لدى جامعة بواتييه؛ الأصل: ANOM، إيكس).',
    year: 1951, date_text: '25 أكتوبر 1951', archive_ref: 'GG AEF 5D 269', txt: '/tmp/college/doc2.txt',
  },
  {
    title_ar: 'مذكرة 23 أبريل 1954 حول الكلية الفرنسية العربية بوداي',
    title_orig: 'Note du 23 avril 1954 sur le coll\u00e8ge franco-arabe du Ouadda\u00ef',
    description: 'مذكرة إدارية حول الكلية الفرنسية العربية بوداي سنة 1954، ضمن ملف GG AEF 5D 269. (النص منشور لدى جامعة بواتييه؛ الأصل غير مرقمن).',
    year: 1954, date_text: '23 أبريل 1954', archive_ref: 'GG AEF 5D 269', txt: '/tmp/college/doc3.txt',
  },
];
for (const d of docs) {
  const { data } = await call('/api/v1/admin/materials', {
    method: 'POST',
    body: {
      type: 'document', title_ar: d.title_ar, title_orig: d.title_orig, description: d.description,
      language: 'fr', year: d.year, date_text: d.date_text, date_confidence: 'confirmed',
      author: d.author || null, place_id: abeche, place_confidence: 'confirmed',
      source_id: anom, archive_ref: d.archive_ref, publish_status: 'draft',
      transcription_status: 'corrected',
      placeIds: [abeche], tagIds: [T['التعليم العربي'], T['الكلية الفرنسية العربية']],
      collectionIds: [colAbeche, colOuaddai],
    },
  });
  await call(`/api/v1/admin/materials/${data.id}/text`, {
    method: 'PUT', body: { transcriptionManual: frenchOnly(d.txt) },
  });
  docArks.push(data.ark);
  console.log('✓ وثيقة:', data.ark);
}
// علاقات بين الوثائق الثلاث
await call(`/api/v1/admin/materials/${docArks[0]}/relations`, { method: 'POST', body: { relatedArk: docArks[1], relation: 'وثائق الملف نفسه', note: 'GG AEF 5D 269' } });
await call(`/api/v1/admin/materials/${docArks[1]}/relations`, { method: 'POST', body: { relatedArk: docArks[2], relation: 'وثائق الملف نفسه', note: 'GG AEF 5D 269' } });
console.log('✓ علاقات الوثائق');

// ---------- المواد: صور أبشة (ANOM) ----------
const imgDefs = [
  { file: '8Fi345A-23_marche-abecher_1930-1940.jpg', title_ar: 'سوق أبشة', title_orig: 'March\u00e9 d\u2019Ab\u00e9ch\u00e9', ref: '8Fi345A-23', desc: 'منظر لسوق أبشة عاصمة سلطنة وداي في ثلاثينيات القرن العشرين، من مجموعة الصور الاستعمارية (أفضل دقة عامة متاحة: 600 بكسل).', tags: ['صور استعمارية'] },
  { file: '8Fi345H-5_ecole-coranique-abecher_1930-1940.jpg', title_ar: 'المدرسة القرآنية في أبشة', title_orig: '\u00c9cole coranique \u00e0 Ab\u00e9ch\u00e9', ref: '8Fi345H-5', desc: 'صورة لمدرسة قرآنية في أبشة (1930\u20131940)، شاهد على التعليم العربي الإسلامي قبل الكلية الفرنسية العربية.', tags: ['المدرسة القرآنية', 'التعليم العربي'] },
  { file: '8Fi345A-19_porte-tata-abecher_1930-1940.jpg', title_ar: 'بوابة التاتا في أبشة', title_orig: 'Porte du tata d\u2019Ab\u00e9ch\u00e9', ref: '8Fi345A-19', desc: 'بوابة تاتا (السور الطيني) أبشة في ثلاثينيات القرن العشرين.', tags: ['صور استعمارية'] },
];
const imgArks = [];
for (const im of imgDefs) {
  const { data } = await call('/api/v1/admin/materials', {
    method: 'POST',
    body: {
      type: 'image', title_ar: im.title_ar, title_orig: im.title_orig, description: im.desc,
      language: 'fr', year: 1935, date_text: 'نحو 1935 (1930\u20131940)', date_confidence: 'approximate',
      place_id: abeche, place_confidence: 'confirmed', source_id: anom, archive_ref: im.ref,
      publish_status: 'draft', placeIds: [abeche], tagIds: im.tags.map((t) => T[t]),
      collectionIds: [colAbeche],
    },
  });
  const f = await uploadFile(data.id, `${IMG_DIR}/${im.file}`, im.file, 'original');
  // تسجيل النسخة الأصلية في مدير النسخ
  await call(`/api/v1/admin/materials/${data.id}/versions`, {
    method: 'POST', body: { fileId: f.id, versionType: 'original', processNote: 'الملف كما ورد من المصدر (ANOM) دون أي تعديل.' },
  });
  imgArks.push({ ark: data.ark, id: data.id });
  console.log('✓ صورة:', data.ark, 'sha256:', String(f.sha256 || '').slice(0, 12) + '…');
}
// نسخة محسّنة (بأمانة: تحسين تباين تلقائي) لصورة السوق — لعرض المقارنة قبل/بعد
{
  const m = imgArks[0];
  const f = await uploadFile(m.id, '/tmp/marche-abecher_enhanced.jpg', 'marche-abecher_enhanced.jpg', 'attachment');
  await call(`/api/v1/admin/materials/${m.id}/versions`, {
    method: 'POST',
    body: { fileId: f.id, versionType: 'enhanced', processNote: 'نسخة محسّنة: تحسين تلقائي للتباين والحدة فقط، دون إضافة عناصر أو حذفها من المشهد.' },
  });
  console.log('✓ نسخة محسّنة لصورة السوق');
}

// ---------- كتب ودراسات ومقتطفات ----------
const sorbonne = S['مكتبة السوربون الجامعية المشتركة'];
const gallica = S['غاليكا \u2013 المكتبة الوطنية الفرنسية'];
const ecpad = S['مؤسسة الاتصال والإنتاج السمعي البصري للدفاع'];
const books = [
  {
    type: 'book', title_ar: 'الاستعمار الفرنسي والمسألة الإسلامية في تشاد: مثال سلطنة وداي (1895\u20131946)',
    title_orig: 'Le colonialisme fran\u00e7ais et la question islamique au Tchad : l\u2019exemple du sultanat du Ouadda\u00ef (1895-1946)',
    description: 'أطروحة دكتوراه لمحمد آدم دوتم (جامعة باريس الرابعة \u2013 السوربون، 1983، بإشراف دومينيك شوفاليي)، 304 صفحات. من أهم المراجع عن السياسة الفرنسية تجاه الإسلام في وداي. (النسخة الرقمية الكاملة محفوظة في مكتبة الباحث الخاصة).',
    language: 'fr', year: 1983, date_text: '1983', date_confidence: 'confirmed', author: 'محمد آدم دوتم (Mohamed Adam Dotem)',
    place_id: ouaddai, source_id: sorbonne, personIds: [PE['السلطان دود مرة']], placeIds: [ouaddai, abeche],
    tagIds: [T['سلطنة وداي']], collectionIds: [colOuaddai],
  },
  {
    type: 'book', title_ar: 'التاريخ العسكري لأفريقيا الاستوائية الفرنسية، الجزء السابع',
    title_orig: 'Histoire militaire de l\u2019Afrique \u00e9quatoriale fran\u00e7aise, t. 7',
    description: 'يتناول استسلام السلطان دود مرة سنة 1911. متاح مجانًا على غاليكا.',
    language: 'fr', year: 1931, date_text: '1931', date_confidence: 'confirmed', author: 'Denis & Viraud',
    source_id: gallica, source_url: 'https://gallica.bnf.fr/ark:/12148/bpt6k5658822n',
    personIds: [PE['السلطان دود مرة']], placeIds: [ouaddai], tagIds: [T['سلطنة وداي']], collectionIds: [colOuaddai],
  },
  {
    type: 'excerpt', title_ar: 'بكرة هوريز 5/8: مشاهد من أبشة (1933\u20131934)',
    title_orig: 'Bobine 5/8 \u2014 \u00ab Autruches Ab\u00e9ch\u00e9 Lamy \u00bb (film 9,5 mm, 1933-1934)',
    description: 'بكرة من أفلام مارسيل هوريز (9.5 مم، رُقمنت 2011)؛ أول لقطات سينمائية مؤكدة لأبشة وفق وصف المخطوط الأصلي. المعاينة متاحة على موقع ECPAD.',
    language: 'fr', year: 1934, date_text: 'نحو 1934', date_confidence: 'approximate',
    author: 'Marcel Houriez \u2014 مارسيل هوريز', place_id: abeche, source_id: ecpad, archive_ref: 'FA 99-5',
    source_url: 'https://imagesdefense.gouv.fr', placeIds: [abeche], tagIds: [T['صور استعمارية']], collectionIds: [colAbeche],
  },
];
for (const b of books) {
  const { data } = await call('/api/v1/admin/materials', { method: 'POST', body: { ...b, publish_status: 'draft' } });
  console.log('✓ مادة:', data.ark, '—', b.title_ar.slice(0, 40));
  docArks.push(data.ark);
}

// ---------- النشر ----------
const allIds = [];
{
  const { data } = await call('/api/v1/admin/materials?perPage=100');
  for (const m of data.items) {
    await call(`/api/v1/admin/materials/${m.id}/publish`, { method: 'POST', body: { status: 'published' } });
    allIds.push(m.ark);
  }
}
console.log('✓ نُشرت المواد:', allIds.length);
console.log('\nالأرقام الأرشيفية:', allIds.join('، '));
