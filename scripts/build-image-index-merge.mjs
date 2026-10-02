#!/usr/bin/env node
/* Move image-index documentation into the image records, then remove the
 * index-only Word records from the public catalogue. */
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(await fs.readFile(path.join(root, 'docs', 'tchad-upload-manifest.json'), 'utf8'));
const items = manifest.items || [];
const byName = new Map(items.map(item => [item.name, item]));
const q = value => value === null || value === undefined || value === '' ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const entries = new Map();
const add = (filename, provenance, sourceUrl = null, attribution = null) => {
  const item = byName.get(filename);
  if (!item || item.type !== 'image') return;
  entries.set(filename, { ark: item.ark, provenance, sourceUrl, attribution });
};

// ANOM Ulysse, 25 images. The accompanying index is the authoritative source
// for the direct URL, cote, and date; the existing Arabic card supplies the
// readable title shown to visitors.
const anomIndex = await fs.readFile(path.join(root, 'staging', 'tchad', 'docx-text', '1CNbmTUuEF64MIS1Ns-gIT9gJmns_fe2l.txt'), 'utf8');
for (const match of anomIndex.matchAll(/Fichier\s*:\s*(\S+?\.jpg)Source\s*:\s*(https?:\S+)/g)) {
  const [, filename, sourceUrl] = match;
  const base = filename.replace(/^.*\//, '');
  const id = base.match(/^(\d+Fi\d+[A-Z]?)-(\d+)_/);
  if (!id) continue;
  const date = (base.match(/_(\d{4}(?:-\d{4})?)\.jpg$/) || [,'غير محدد'])[1];
  const author = base.startsWith('8Fi345H-5_') ? 'المؤلف في بطاقة المصدر: Gramain, Pierre' : 'المؤلف غير مثبت في بطاقة المصدر';
  add(base, `التوثيق المنقول من فهرس ANOM Ulysse: الكوت ${id[1]}/${id[2]} (FR ANOM)؛ التاريخ ${date}؛ ${author}؛ الرابط المباشر محفوظ من بطاقة العرض.`, sourceUrl, 'ANOM Ulysse — Archives nationales d’outre-mer؛ التوثيق المنقول من فهرس الصور');
}

// Bruel (1918), four NYPL images.
const bruelFiles = [
  ['bruel-tata-interieur-abeche-1918.jpg', 'داخل التاتا (سور قصر السلطان) في أبشة؛ يظهر جندي تيرايور على السور.'],
  ['bruel-grande-place-abeche-1918.jpg', 'الساحة الكبرى في أبشة؛ يظهر حشد السوق في المشهد.'],
  ['bruel-ville-vue-poste-abeche-1918.jpg', 'مدينة أبشة من البوست الفرنسي؛ يظهر جناح السلطان علي المبني بالآجر في الخلف.'],
  ['bruel-gaourang-doudmourrah-1918.jpg', 'سلطان وداي دودمورا (1902–1909) مع سلطان باقرمي غاورانغ.']
];
for (const [filename, subject] of bruelFiles) add(filename, `التوثيق المنقول من فهرس كتاب جورج برويل: ${subject} المصدر: Georges Bruel, L’Afrique Équatoriale Française (باريس، 1918)، تصوير الملازم فيراندي؛ تاريخ النشر 1918، والالتقاط الفعلي تقريبي بين 1909 و1913؛ نسخة NYPL ملك عام.`, 'https://digitalcollections.nypl.org/', 'Georges Bruel, L’Afrique Équatoriale Française (1918) — NYPL Digital Collections، ملك عام؛ التوثيق المنقول من فهرس الصور');

// MUNAE glass plates, with the exact museum records captured by the index.
const munae = {
  'ouaddai-sultan-acyl-1913.jpg': ['السلطان أصيل (Acyl) واقفًا أمام أكواخ قشية؛ على حافة اللوح: «Le Sultan Acyl — N° 22»؛ رقم الجرد 0003.00289.22؛ التاريخ 1913.', 'https://www.munae.fr/collections-en-ligne/en/museum/pdf?ids%5B0%5D=mne_62882e3ec07506d9ad8eeddd'],
  'ouaddai-colonel-largeau-1913.jpg': ['الكولونيل لارجو بين وجهاء محليين؛ على حافة اللوح: «Le colonel Largeau — N° 21»؛ رقم الجرد 0003.00289.21؛ التاريخ 1913.', 'https://mne-portail.skin-web.org/fr/museum/pdf?ids%5B0%5D=mne_62882e4ac07506d9ad9063ef'],
  'boullong-puits-1913.jpg': ['شاب عربي عند بئر بولونغ مع ماشية؛ على الحافة: «Jeune arabe au puits de Boullong — N° 24»؛ رقم الجرد 0003.00289.24؛ التاريخ 1913؛ صلة بولونغ بوداي سياقية.', 'https://www.munae.fr/collections-en-ligne/es/museum/pdf?ids%5B0%5D=mne_62882e43c07506d9ad8f8cd6']
};
for (const [filename, [subject, sourceUrl]] of Object.entries(munae)) add(filename, `التوثيق المنقول من فهرس MUNAE: ${subject} السلسلة: «Le Territoire militaire du Tchad au point de vue physique, économique et politique»، محاضرة مصورة للملازم Jean Ferrandi.`, sourceUrl, 'MUNAE — Musée national de l’Éducation؛ بطاقة المجموعة الأصلية');

// The general 24-image inventory: 15 ANOM 30Fi78 images and 9 MUNAE plates.
const anom30fi78 = {
  'abeche-marche-1955.jpg': ['48', '1955'],
  'arabes-khozzam-cuisine-1952.jpg': ['31', '11 فبراير 1952'],
  'arabes-tchad-hippopotame-1930s.jpg': ['67', '1919–1939 تقريبًا'],
  'massakory-marche-forgerons-haddad-1951.jpg': ['54', '14 أبريل 1951'],
  'goumier-tchad-1946.jpg': ['1', '1946'],
  'massakory-arbre-a-palabres-1952.jpg': ['39', '6 فبراير 1952'],
  'massakory-bureau-district-mat-pavillon-1951.jpg': ['80', '13 أبريل 1951'],
  'massakory-poste-vue-pavillon-1952.jpg': ['82', '3 فبراير 1952'],
  'massakory-marche-qanum-1951.jpg': ['47', '15 أبريل 1951'],
  'massakory-marche-marchand-sel-1951.jpg': ['53', '15 أبريل 1951'],
  'fort-lamy-marche-1949.jpg': ['55', '1949'],
  'fort-lamy-route-aviation-1946.jpg': ['79', '1946'],
  'fort-lamy-tresor-1959.jpg': ['84', '1959'],
  'mao-jardin-du-poste-1952.jpg': ['77', '1952'],
  'fort-archambault-gouverneur-bayardelle-1944.jpg': ['40', '17 مارس 1944']
};
for (const [filename, [number, date]] of Object.entries(anom30fi78)) {
  const sourceUrl = `http://anom.archivesnationales.culture.gouv.fr/ulysse/collection/ecran/img/30Fi/30Fi78/DAFANCAOM01_30FI078N${String(number).padStart(3, '0')}_P.JPG`;
  add(filename, `التوثيق المنقول من فهرس «Images et documents photographiés — Tchad colonial»: سلسلة ANOM Ulysse 30Fi78، رقم الحفظ FR_ANOM_30Fi78-${number}؛ التاريخ ${date}؛ العنوان الأصلي محفوظ في بطاقة الفهرس.`, sourceUrl, 'ANOM Ulysse — Archives nationales d’outre-mer؛ سلسلة 30Fi78');
}

const munaeInventory = {
  'abeche-poste-francais-1913.jpg': '0003.00289.8',
  'abeche-rue-du-marche-1913.jpg': '0003.00289.9',
  'abeche-ville-1913.jpg': '0003.00289.7',
  'tisserand-indigene-1913.jpg': '0003.00289.17',
  'kotokos-peche-balancier-1913.jpg': '0003.00289.19',
  'gaourang-sultan-baguirmi-1913.jpg': '0003.00289.23',
  'baguirmi-autruches-1913.jpg': '0003.00289.20',
  'diffa-1913.jpg': '0003.00289.28',
  'territoire-militaire-tchad-titre-1913.jpg': 'غير مرقم'
};
for (const [filename, number] of Object.entries(munaeInventory)) add(filename, `التوثيق المنقول من فهرس MUNAE: السلسلة «Le Territoire militaire du Tchad au point de vue physique, économique et politique» للملازم Jean Ferrandi، سنة 1913؛ رقم الجرد ${number}.`, 'https://www.munae.fr/collections-en-ligne/', 'MUNAE — Musée national de l’Éducation؛ فهرس الألواح الزجاجية 1913');

if (entries.size !== 56) throw new Error(`Expected 56 image entries, got ${entries.size}`);
const statements = ['-- SIDJIL: نقل توثيقات فهارس الصور إلى بطاقات الصور نفسها'];
for (const [filename, entry] of entries) {
  const marker = 'التوثيق المنقول من فهرس';
  statements.push(`UPDATE materials SET description=trim(coalesce(description,'')||char(10)||char(10)||${q(entry.provenance)}), source_url=${q(entry.sourceUrl)}, source_attribution=${q(entry.attribution)}, updated_at=datetime('now') WHERE ark=${q(entry.ark)} AND type='image' AND instr(coalesce(description,''),${q(marker)})=0;`);
}

const docs = ['ARC-TD-DOC-000006','ARC-TD-DOC-000007','ARC-TD-DOC-000008','ARC-TD-DOC-000009'];
const ids = ['1CNbmTUuEF64MIS1Ns-gIT9gJmns_fe2l','15owKzXCCPXomPdClCq1mxPpEiXjSsMgd','1j3dwBGeMunvLa2UQaVwux_tkJ1Bk9QXy','1lWya6X8TOgHbbEk8Vpz3yFycZ_KWwp4U'];
statements.push(`DELETE FROM materials_fts WHERE ark IN (${docs.map(q).join(',')});`);
statements.push(`UPDATE drive_import_items SET status='excluded',material_id=NULL,error_message=${q('فهرس توثيقي دُمج في بطاقات الصور المرتبطة، ولا يمثل مادة تصويرية مستقلة.')},updated_at=datetime('now') WHERE batch_id=1 AND drive_file_id IN (${ids.map(q).join(',')});`);
statements.push(`DELETE FROM materials WHERE ark IN (${docs.map(q).join(',')});`);
await fs.writeFile(path.join(root, 'migrations', '0024_merge_image_index_documentation.sql'), statements.join('\n') + '\n');
console.log(JSON.stringify({images: entries.size, removedDocuments: docs.length, migration: '0024_merge_image_index_documentation.sql'}, null, 2));
