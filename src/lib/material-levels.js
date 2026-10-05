// التصنيف التحريري الأساسي لمواد سِجِل.
// يبقى type هو رمز المادة الأرشيفي (DOC/BOK/IMG...)، بينما material_level
// يحدد طريقة عرض المادة ومتطلبات اكتمالها في الموقع ومساحة الباحثين.

export const MATERIAL_LEVELS = Object.freeze({
  archival_image: {
    ar: 'صورة أرشيفية',
    fr: 'Image d’archive',
    description_ar: 'الصورة هي المادة الأصلية، ويشرحها وصف موثق.',
  },
  archival_text: {
    ar: 'مادة أرشيفية مفرغة',
    fr: 'Document d’archive transcrit',
    description_ar: 'مادة مفرغة من مصدر أرشيفي وتعرض كنص موثق داخل المنصة.',
  },
  archival_book_original: {
    ar: 'كتاب أرشيفي أصيل متاح',
    fr: 'Livre d’archive disponible',
    description_ar: 'ملف PDF أصلي مع غلاف ووصف توثيقي.',
  },
  archival_book_unavailable: {
    ar: 'كتاب أرشيفي غير متاح للتحميل',
    fr: 'Livre d’archive indisponible au téléchargement',
    description_ar: 'عنوان الكتاب وغلافه ووصفه دون إتاحة ملف PDF.',
  },
  chadian_publication: {
    ar: 'كتاب أو مؤلف تشادي',
    fr: 'Livre ou œuvre tchadienne',
    description_ar: 'مؤلف تشادي يعرض غلافه ووصفه، مع PDF إذا كان متاحًا.',
  },
});

export const MATERIAL_LEVEL_VALUES = Object.freeze(Object.keys(MATERIAL_LEVELS));

export function materialLevelLabel(level, lang = 'ar') {
  const item = MATERIAL_LEVELS[level];
  return item ? (lang === 'fr' ? item.fr : item.ar) : (level || 'مادة');
}

export function materialLevelDescription(level, lang = 'ar') {
  const item = MATERIAL_LEVELS[level];
  if (!item) return '';
  return lang === 'fr' ? item.fr : item.description_ar;
}

