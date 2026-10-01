// COD-AB admin-1 codes from OCHA. Display names are maintained by SIDJIL.
export const CHAD_PROVINCES = [
  { code: 'TD01', ar: 'البطحة', fr: 'Batha' },
  { code: 'TD02', ar: 'بوركو', fr: 'Borkou' },
  { code: 'TD03', ar: 'شاري باقرمي', fr: 'Chari-Baguirmi' },
  { code: 'TD04', ar: 'قيرا', fr: 'Guéra' },
  { code: 'TD05', ar: 'حجر لميس', fr: 'Hadjer-Lamis' },
  { code: 'TD06', ar: 'كانم', fr: 'Kanem' },
  { code: 'TD07', ar: 'البحيرة', fr: 'Lac' },
  { code: 'TD08', ar: 'لوقون الغربي', fr: 'Logone Occidental' },
  { code: 'TD09', ar: 'لوقون الشرقي', fr: 'Logone Oriental' },
  { code: 'TD10', ar: 'ماندول', fr: 'Mandoul' },
  { code: 'TD11', ar: 'مايو كيبي الشرقية', fr: 'Mayo-Kebbi Est' },
  { code: 'TD12', ar: 'مايو كيبي الغربية', fr: 'Mayo-Kebbi Ouest' },
  { code: 'TD13', ar: 'شاري الأوسط', fr: 'Moyen-Chari' },
  { code: 'TD14', ar: 'وداي', fr: 'Ouaddaï' },
  { code: 'TD15', ar: 'سلامات', fr: 'Salamat' },
  { code: 'TD16', ar: 'تانجلي', fr: 'Tandjilé' },
  { code: 'TD17', ar: 'وادي فيرا', fr: 'Wadi Fira' },
  { code: 'TD18', ar: 'نجامينا', fr: "N'Djamena" },
  { code: 'TD19', ar: 'بحر الغزال', fr: 'Barh-El-Gazel' },
  { code: 'TD20', ar: 'إنيدي الشرقية', fr: 'Ennedi Est' },
  { code: 'TD21', ar: 'سيلا', fr: 'Sila' },
  { code: 'TD22', ar: 'تيبستي', fr: 'Tibesti' },
  { code: 'TD23', ar: 'إنيدي الغربية', fr: 'Ennedi Ouest' },
];

export async function loadMapMaterials(db) {
  const rows = await db.prepare(`
    SELECT m.id, m.ark, m.type, m.title_ar, m.title_orig,
           substr(m.description, 1, 360) AS description,
           m.year, m.date_text, m.place_confidence,
           p.id AS place_id, p.name_ar AS place_ar, p.name_orig AS place_orig,
           p.region AS place_region, p.kind AS place_kind, p.lat, p.lng
    FROM materials m
    LEFT JOIN places p ON p.id = COALESCE(
      m.place_id,
      (SELECT mp.place_id FROM material_places mp
       WHERE mp.material_id = m.id ORDER BY mp.place_id LIMIT 1)
    )
    WHERE m.publish_status = 'published'
    ORDER BY m.year ASC, m.id ASC
  `).all();
  return rows.results || [];
}
