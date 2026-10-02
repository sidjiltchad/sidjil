#!/usr/bin/env node
/*
 * Rebuild provenance for the TCHAD Drive import and turn textual source files
 * into readable, indexed records.  The Drive folder is an ingest location,
 * never a public source citation.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, 'docs', 'tchad-upload-manifest.json');
const STAGING = path.join(ROOT, 'staging', 'tchad');
const OUT = path.join(ROOT, 'migrations', '0014_textual_documents_and_sources.sql');
const BODY_OUT = path.join(ROOT, 'migrations', '0015_textual_document_bodies.sql');

const sql = (value) => value === null || value === undefined || value === ''
  ? 'NULL'
  : `'${String(value).replaceAll("'", "''")}'`;

const sourceMap = {
  'SHDGR_6H_inventaire.pdf': ['https://www.servicehistorique.sga.defense.gouv.fr/sites/default/files/notices_files/SHDGR_6H.pdf', 'Service historique de la Défense (SHD), inventaire GR 6 H'],
  'fournial-frachette-HSM1986.pdf': ['https://www.biusante.parisdescartes.fr/sfhm/hsm/HSM1986x020x004/HSM1986x020x004x0381.pdf', 'BIU Santé / Société française d’histoire de la médecine'],
  'guide-archives-diplomatiques-dameae3606.pdf': ['https://hal.science/hal-05126193v1', 'HAL — guide des Archives diplomatiques'],
  'enseignement-islamique-afrique-noire-gandolfi.pdf': ['https://journals.openedition.org/etudesafricaines/199', 'Cahiers d’études africaines / OpenEdition'],
  'fournial-cazenave-imagesetmemoires.pdf': ['https://www.imagesetmemoires.com/doc/Articles/B43_fournial_cazenave.pdf', 'Images et Mémoires'],
  'Moukhtar_Peuples-Tchad-oriental-Ouaddai-statique_Paris7_1982.pdf': ['https://nubis.bis-sorbonne.fr/ark:/15733/nk65', 'NUBIS, Bibliothèque interuniversitaire de la Sorbonne'],
  'MacMichael_History-of-the-Arabs-in-the-Sudan_v1_Cambridge_1922.pdf': ['https://archive.org/details/historyofarabsin01macmuoft', 'Internet Archive'],
  'Barth_Travels-and-Discoveries_v2_London_1857.pdf': ['https://archive.org/details/travelsdiscoveri21857bart', 'Internet Archive'],
  'Barth_Travels-and-Discoveries_v3_London_1857.pdf': ['https://archive.org/details/travelsdiscoveri03bart_1', 'Internet Archive'],
  'Dangbet_Transhumants-alliances-conflits_Aix-Marseille_2015.pdf': ['https://theses.fr/2015AIXM3105.pdf', 'theses.fr / Aix-Marseille Université'],
  'Doutoum_Colonisation-francaise-question-musulmane-Ouaddai_Paris4_1983.pdf': ['https://nubis.bis-sorbonne.fr/ark:/15733/njtg', 'NUBIS, Bibliothèque interuniversitaire de la Sorbonne'],
  'Roset_Grammar-of-Darfur-Arabic_UvA_2018.pdf': ['https://pure.uva.nl/ws/files/23827872/Thesis.pdf', 'University of Amsterdam repository'],
  'Khayar_Elites-ouaddaiennes_v2_Sorbonne-Nouvelle_1982.pdf': ['https://nubis.bis-sorbonne.fr/ark:/15733/nkj8', 'NUBIS, Bibliothèque interuniversitaire de la Sorbonne'],
  'Khayar_Elites-ouaddaiennes_v1_Sorbonne-Nouvelle_1982.pdf': ['https://nubis.bis-sorbonne.fr/ark:/15733/nkj8', 'NUBIS, Bibliothèque interuniversitaire de la Sorbonne'],
  'Yacoub_Populations-musulmanes-Tchad-pouvoir-politique_1983.pdf': ['https://nubis.bis-sorbonne.fr/ark:/15733/nk8s', 'NUBIS, Bibliothèque interuniversitaire de la Sorbonne'],
  'VanDalen_There-is-no-doubt_Leiden_2015.pdf': ['https://scholarlypublications.universiteitleiden.nl/access/item:2888909/view', 'Leiden University Scholarly Publications'],
  'Assileck_Conquete-coloniale-Tchad_Ngaoundere_2007.pdf': ['https://publication.codesria.org/index.php/pub/catalog/book/1377', 'CODESRIA repository'],
  'Gondeu_Dynamics-National-Integration_UFlorida_2013.pdf': ['https://sahelresearch.africa.ufl.edu/wp-content/uploads/sites/170/Gondeu_NOTES_Final_Eng.pdf', 'University of Florida / Sahel Research'],
  'Bechir_Impact-colonial-legacy_NPS-Monterey_1997.pdf': ['https://archive.org/details/theimpactofcolon1094531919', 'Internet Archive'],
  'Miguel-Addisu-Moyastan_Ecole-bilingue-Tchad_2025.pdf': ['https://hal.science/hal-05616386v1', 'HAL open archive'],
  'Ghali_Adam_MohamedHabib_Tasawwuf-Targumi_HNSJ_2025.pdf': ['https://hnjournal.net', 'مجلة العلوم الإنسانية والطبيعية (HNSJ)'],
  'VanDalen_Sulh-in-Chad_Leiden_2021-draft.pdf': ['https://ascl.asc-test.nl/sites/default/pubfiles/sulh_in_chad_pre-published_draft.pdf', 'African Studies Centre Leiden'],
  'Ibrahim-al-Zain_Daawa-Islamiya-Hayat-Siyasiya-Bagirmi_Majallat-Dirasat-Ifriqiya-Arabiya_2024.pdf': ['https://afroar.com', 'مجلة دراسات إفريقية عربية'],
  'Ismail-Ahmad-Muhammad_Athar-Taawun-Taalimi-Kanem_GFSC_2023.pdf': ['https://search.shamaa.org', 'شمعة — الشبكة العربية للمعلومات التربوية'],
  'Ibrahim-al-Zain-Abd-al-Malik_Daawa-Islamiya-Hayat-Ijtimaiya-Bagirmi_IJSR_2025.pdf': ['https://vsrp.co.uk', 'International Journal of Scientific Research'],
  'Adam_Dhi_Mohamed_Tirailleurs-senegalais_Tchad_HNSJ_2023.pdf': ['https://hnjournal.net', 'مجلة العلوم الإنسانية والطبيعية (HNSJ)'],
  'Haloulou_Tayeb_Arabe-identite-nationale_Qalzam_2022.pdf': ['https://rsbcrsc.net', 'مجلة القلزم للدراسات التاريخية'],
  'Harran_AhmadIbrahim_Langue-arabe-Wadai_Reihan_2022.pdf': ['https://fomlar.org', 'مجلة ريحان للنشر العلمي'],
  'Daoud_JamalEldin_Resistance-nationale_KingFaisal_2023.pdf': ['https://rsbcrsc.net', 'مجلة القلزم للدراسات التاريخية'],
  'Hassan-Adam_Dukhul-wa-Intishar-al-Islam-fi-Tshad_HNSJ_2025.pdf': ['https://hnjournal.net', 'مجلة العلوم الإنسانية والطبيعية (HNSJ)'],
  'Abakar-Maouloud_Al-Insaniya-fi-al-Ashaar-al-Arabiya-al-Tshadiya_HNSJ_2023.pdf': ['https://hnjournal.net', 'مجلة العلوم الإنسانية والطبيعية (HNSJ)'],
  'Daoud_Abdelwahed_Ulama-Wadai-resistance_KingFaisal_2022.pdf': ['https://rsbcrsc.net', 'مجلة القلزم للدراسات التاريخية'],
  'Adam_Assadik_Ouaddai-Empire-ottoman_KingFaisal_2022.pdf': ['https://journals.ajsrp.com', 'المجلة العربية للنشر العلمي'],
  'Sirajudeen-Shittu_Literary-review-Arabic-writings_ESJ_2012.pdf': ['https://eujournal.org/index.php/esj/article/download/628/691', 'European Scientific Journal'],
  'Jibril-Ibrahim_Makhalib-al-Istimar-fi-Ifriqiya_ssrcaw_2023.pdf': [null, 'نسخة أرشيفية مشتقة من HTML؛ المصدر الأصلي غير متاح في الفهرس'],
  'bpt6k62068009_dujarric_vie-du-sultan-rabah_1902.pdf': ['https://gallica.bnf.fr/ark:/12148/bpt6k62068009', 'Gallica — Bibliothèque nationale de France'],
  'bpt6k6461401x_gentil_chute-empire-de-rabah_1902.pdf': ['https://gallica.bnf.fr/ark:/12148/bpt6k6461401x', 'Gallica — Bibliothèque nationale de France'],
  'bpt6k147664h_conference-africaine-francaise-brazzaville_1945.pdf': ['https://gallica.bnf.fr/ark:/12148/bpt6k147664h', 'Gallica — Bibliothèque nationale de France'],
  'bpt6k6541398k_toque_peuple-et-langue-banda_1904.pdf': ['https://gallica.bnf.fr/ark:/12148/bpt6k6541398k', 'Gallica — Bibliothèque nationale de France'],
  'bpt6k1476278_largeau_situation-territoire-militaire-tchad_1913.pdf': ['https://gallica.bnf.fr/ark:/12148/bpt6k1476278', 'Gallica — Bibliothèque nationale de France'],
  'bpt6k57901631_metois_algerie-au-congo-par-le-tchad_1901.pdf': ['https://gallica.bnf.fr/ark:/12148/bpt6k57901631', 'Gallica — Bibliothèque nationale de France'],
  'bpt6k166724n_bruel_occupation-bassin-du-tchad_1902.pdf': ['https://gallica.bnf.fr/ark:/12148/bpt6k166724n', 'Gallica — Bibliothèque nationale de France'],
  'bpt6k6542487f_cornet_au-tchad_senoussistes-ouaddaiens_1910.pdf': ['https://gallica.bnf.fr/ark:/12148/bpt6k6542487f', 'Gallica — Bibliothèque nationale de France'],
  'bpt6k6152175h_quellien_politique-musulmane-aof_1910.pdf': ['https://gallica.bnf.fr/ark:/12148/bpt6k6152175h', 'Gallica — Bibliothèque nationale de France'],
  'bpt6k105878g_delafosse_peuple-et-langue-sara_1897.pdf': ['https://gallica.bnf.fr/ark:/12148/bpt6k105878g', 'Gallica — Bibliothèque nationale de France'],
  'bpt6k6540833n_delafosse_esquisse-generale-langues-afrique_1914.pdf': ['https://gallica.bnf.fr/ark:/12148/bpt6k6540833n', 'Gallica — Bibliothèque nationale de France'],
  'bpt6k5493044j_polignac_france-et-islamisme_1893.pdf': ['https://gallica.bnf.fr/ark:/12148/bpt6k5493044j', 'Gallica — Bibliothèque nationale de France'],
  'bpt6k104249p_behagle_voyage-bassin-du-tchad_1896.pdf': ['https://gallica.bnf.fr/ark:/12148/bpt6k104249p', 'Gallica — Bibliothèque nationale de France'],
  'btv1b10890902z_mangin_projet-occupation-exploration_1907.pdf': ['https://gallica.bnf.fr/ark:/12148/btv1b10890902z', 'Gallica — Bibliothèque nationale de France'],
  'btv1b10890913t_prins_projet-mission-au-ouadai_1907.pdf': ['https://gallica.bnf.fr/ark:/12148/btv1b10890913t', 'Gallica — Bibliothèque nationale de France'],
  'bpt6k1044821_fresnel_memoire-sur-le-waday_1850.pdf': ['https://gallica.bnf.fr/ark:/12148/bpt6k1044821', 'Gallica — Bibliothèque nationale de France'],
  'btv1b53063328n_carte-du-ouadai_meunier_1911.pdf': ['https://gallica.bnf.fr/ark:/12148/btv1b53063328n', 'Gallica — Bibliothèque nationale de France'],
  'btv1b530633471_carte-du-ouadai_largeau_1913.pdf': ['https://gallica.bnf.fr/ark:/12148/btv1b530633471', 'Gallica — Bibliothèque nationale de France'],
  'prins_memoires_etude-delisle_2014.pdf': ['https://www.persee.fr/collection/outre', 'Persée — revue Outre-Mers (notice de collection)'],
  'tilho_documents-scientifiques_t2_1906-1909.pdf': ['https://gallica.bnf.fr/ark:/12148/bpt6k1308731b', 'Gallica — Bibliothèque nationale de France'],
  'tilho_documents-scientifiques_t1_1906-1909.pdf': ['https://gallica.bnf.fr/ark:/12148/bpt6k1308730x', 'Gallica — Bibliothèque nationale de France'],
  'tilho_lettre-massakory_1913-04-05.pdf': ['https://www.persee.fr/doc/crai_0065-0536_1913_num_57_4_73215', 'Persée — Comptes rendus de l’Académie des inscriptions'],
  'tilho_compte-rendu-mission-afrique_1917.pdf': ['https://www.persee.fr/doc/crai_0065-0536_1917_num_61_5_73906', 'Persée — Comptes rendus de l’Académie des inscriptions'],
  'tilho_lettre-mao_1913-08-25.pdf': ['https://www.persee.fr/doc/crai_0065-0536_1913_num_57_7_73279', 'Persée — Comptes rendus de l’Académie des inscriptions'],
  'tilho_lettre-mao_1912-11-04.pdf': ['https://www.persee.fr/doc/crai_0065-0536_1913_num_57_1_73135', 'Persée — Comptes rendus de l’Académie des inscriptions'],
  'pa_ap_399_inventaire_2016-2017.pdf': ['https://archivesdiplomatiques.diplomatie.gouv.fr/ark:/14366/k518lcrwpjbm', 'Archives diplomatiques, Ministère de l’Europe et des Affaires étrangères'],
  'gouraud_zinder-tchad_souvenirs_1944.pdf': ['https://gallica.bnf.fr/ark:/12148/bpt6k993458t', 'Gallica — Bibliothèque nationale de France'],
  'Alexander_From_the_Niger_to_the_Nile_vol1_1907.pdf': ['https://archive.org/details/fromnigernile01alex', 'Internet Archive'],
  'Alexander_From_the_Niger_to_the_Nile_vol2_1907.pdf': ['https://archive.org/details/fromnigernile02alex', 'Internet Archive'],
  'Kumm_From_Hausaland_to_Egypt_1910.pdf': ['https://www.gospelstudies.org.uk/missiology/book_hausaland-to-egypt_kumm.php', 'Gospel Studies — نسخة رقمية لكتاب Kumm'],
};

const manifest = JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
const items = manifest.items || [];
const textExt = /\.(docx?|txt|md)$/i;
const statements = ['-- SIDJIL: تصحيح مصدر مواد TCHAD وتحويل الوثائق النصية إلى نصوص موثقة'];
const bodyStatements = ['-- SIDJIL: محتوى الوثائق النصية الموثقة (مجزأ للالتزام بحد SQLite)'];
statements.push(`UPDATE materials SET source_url=NULL, source_attribution=${sql('مادة محفوظة في سِجِل؛ المصدر الخارجي غير مثبت في الفهرس.')}, description=${sql('مادة رقمية محفوظة في سِجِل؛ بيانات المصدر تحتاج مراجعة.')}, updated_at=datetime('now') WHERE created_via='drive_import' AND (source_url LIKE 'https://docs.google.com/%' OR source_url LIKE 'https://drive.google.com/%');`);

const textRows = [];
for (const item of items) {
  const filename = item.name;
  if (textExt.test(filename)) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const textPath = ext === 'docx' ? path.join(STAGING, 'docx-text', `${item.drive_id}.txt`) : path.join(STAGING, `${item.drive_id}.${ext}`);
    let body = await fs.readFile(textPath, 'utf8');
    body = body.replace(/^\uFEFF/, '').replace(/\0/g, '').trim();
    const lines = body.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    let title = filename.replace(/\.[^.]+$/, '').replaceAll('_', ' ').trim();
    if (item.drive_id === '1-tiBWmPh21_vdJeMgR3ncUbhpG3KIDPM') title = 'المكتبة الأكاديمية التشادية — الفهرس الموحّد';
    else if (item.drive_id === '1ZTYOS1FWlTZsT4gu2tbXaYNBvzL_neWF') title = 'L. Roserot de Melin — في منطقة تشاد مع بعثة Tilho';
    else if (item.drive_id === '11jkJLu3oyx3Oqgeu5fokgG9zFMfht5hw') title = 'أداة البحث الأرشيفية — وصف الملف PA-AP/399';
    else if (lines[0] === 'هندسة القطيعة' && lines[1]) title = `هندسة القطيعة — ${lines[1]}${lines[2] ? ` — ${lines[2]}` : ''}`;
    else if (lines[0] && lines[0].length <= 180 && !/^[-=*_#]+$/.test(lines[0])) title = lines[0].replace(/^#+\s*/, '').trim();
    const textSource = item.drive_id === '1ZTYOS1FWlTZsT4gu2tbXaYNBvzL_neWF'
      ? ['https://fr.wikisource.org/wiki/Livre:Le_Tour_du_monde,_nouvelle_s%C3%A9rie_-_15.djvu', 'OCR مضبوط من نسخة Gallica؛ فهرسة مقابلة مع Wikisource']
      : item.drive_id === '11jkJLu3oyx3Oqgeu5fokgG9zFMfht5hw'
        ? ['https://archivesdiplomatiques.diplomatie.gouv.fr/ark:/14366/k518lcrwpjbm', 'Archives diplomatiques — أداة البحث الرسمية PA-AP/399']
        : [null, 'نص موثق مستخرج من الوثيقة الأصلية؛ يُعرض للقراءة داخل المنصة ولا يُتاح كملف Word أو نص للتنزيل.'];
    // D1 rejects a single SQL statement above its SQLite length limit.  Seed
    // the row, then append the document in bounded chunks (the transaction
    // keeps the final value atomic).
    statements.push(`UPDATE materials SET title_ar=${sql(title)}, full_text='', transcription_status='corrected', description=${sql(textSource[1])}, source_url=${sql(textSource[0])}, source_attribution=${sql(textSource[1])}, updated_at=datetime('now') WHERE ark=${sql(item.ark)};`);
    const chars = Array.from(body);
    for (let offset = 0; offset < chars.length; offset += 4000) {
      bodyStatements.push(`UPDATE materials SET full_text=full_text||${sql(chars.slice(offset, offset + 4000).join(''))} WHERE ark=${sql(item.ark)};`);
    }
    bodyStatements.push(`DELETE FROM transcriptions WHERE material_id=(SELECT id FROM materials WHERE ark=${sql(item.ark)}) AND layer='manual';`);
    bodyStatements.push(`INSERT INTO transcriptions (material_id,layer,lang,text) SELECT id,'manual',${sql(item.language || 'fr')},full_text FROM materials WHERE ark=${sql(item.ark)};`);
    bodyStatements.push(`DELETE FROM materials_fts WHERE ark=${sql(item.ark)};`);
    bodyStatements.push(`INSERT INTO materials_fts (ark,title,body) SELECT ark,title_ar,full_text FROM materials WHERE ark=${sql(item.ark)};`);
    textRows.push({ark:item.ark, name:filename, bytes:Buffer.byteLength(body)});
    continue;
  }
  const mapping = sourceMap[filename];
  if (mapping) {
    const [url, attribution] = mapping;
    statements.push(`UPDATE materials SET source_url=${sql(url)}, source_attribution=${sql(attribution)}, description=${sql(`المصدر الأصلي: ${attribution}${url ? ` — ${url}` : ''}`)}, updated_at=datetime('now') WHERE ark=${sql(item.ark)};`);
  }
}

// Extract the exact ANOM Ulysse URLs from the accompanying Word inventory.
const anomText = await fs.readFile(path.join(STAGING, 'docx-text', '1CNbmTUuEF64MIS1Ns-gIT9gJmns_fe2l.txt'), 'utf8');
for (const match of anomText.matchAll(/Fichier\s*:\s*(\S+?\.jpg)Source\s*:\s*(https?:\S+)/g)) {
  const [, filename, url] = match;
  const item = items.find(x => x.name === filename);
  if (item) statements.push(`UPDATE materials SET source_url=${sql(url)}, source_attribution=${sql('ANOM Ulysse — Archives nationales d’outre-mer')}, description=${sql(`الصورة الأصلية من ANOM Ulysse — ${url}`)}, updated_at=datetime('now') WHERE ark=${sql(item.ark)};`);
}
const bruelAttribution = 'Georges Bruel, L’Afrique Équatoriale Française (1918) — NYPL Digital Collections، ملك عام';
for (const filename of ['bruel-tata-interieur-abeche-1918.jpg','bruel-grande-place-abeche-1918.jpg','bruel-ville-vue-poste-abeche-1918.jpg','bruel-gaourang-doudmourrah-1918.jpg']) {
  const item = items.find(x => x.name === filename);
  if (item) statements.push(`UPDATE materials SET source_url='https://digitalcollections.nypl.org/', source_attribution=${sql(bruelAttribution)}, description=${sql(`الصورة من ${bruelAttribution}`)}, updated_at=datetime('now') WHERE ark=${sql(item.ark)};`);
}

await fs.writeFile(OUT, statements.join('\n') + '\n', 'utf8');
await fs.writeFile(BODY_OUT, bodyStatements.join('\n') + '\n', 'utf8');

const pdfs = items.filter(x => /\.pdf$/i.test(x.name));
const unmappedPdfs = pdfs.filter(x => !sourceMap[x.name]).map(x => x.name);
const images = items.filter(x => /\.(jpe?g|png|webp|tiff?)$/i.test(x.name));
console.log(JSON.stringify({migration:OUT, bodyMigration:BODY_OUT, items:items.length, textual:textRows.length, textBytes:textRows.reduce((n,x)=>n+x.bytes,0), mappedPdfs:pdfs.length-unmappedPdfs.length, unmappedPdfs, images:images.length}, null, 2));
