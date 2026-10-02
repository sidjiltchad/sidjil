-- استثناء ملفات «هندسة/صناعة القطيعة» الخاصة من الأرشيف العام.
-- تبقى مخفية وقابلة للمراجعة الداخلية، ولا تظهر للزوار أو في طابور الاعتماد.
UPDATE materials
SET publish_status='hidden',
    review_note='مادة خاصة مستثناة من أرشيف سِجِل بناءً على توجيه الإدارة.',
    updated_at=datetime('now')
WHERE created_via='drive_import' AND ark IN (
  'ARC-TD-ART-000001','ARC-TD-ART-000002','ARC-TD-ART-000003',
  'ARC-TD-ART-000004','ARC-TD-ART-000005','ARC-TD-ART-000006',
  'ARC-TD-ART-000007','ARC-TD-ART-000008','ARC-TD-ART-000009'
);

UPDATE drive_import_items
SET status='excluded',
    error_message='ملف خاص مستثنى من أرشيف سِجِل بناءً على توجيه الإدارة.',
    updated_at=datetime('now')
WHERE batch_id=1 AND drive_file_id IN (
  '1TpNHcPtWU-zV8y7ovT0zU0zAbhjLPjEM','1uAxKJ_BBeeZQRI2jk2svjSJS8QUrInIS',
  '1qQE0k_MzFwQMupMbP_R9YkswwFqEhpc5','1hVfSSuiZsbWF5XebTN9hDoD6gVtYbyt1',
  '130H1TsQGJEJzHapUWBfkenjAzHwklikG','1Tac_2e0dHDafvHTE4dh76Qa_Z_mJApHQ',
  '18XF80CObyz4Qeh7YmmB-S-mpZGz3KB1J','1Aqoxztx39RDGEQdZ9x2zcjD76VCeUUFE',
  '179Djam1AXoAfjXkozEdPQl4fjV94s0LU'
);
