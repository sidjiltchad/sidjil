-- 0006 — إحداثيات الأماكن الأساسية للخريطة (خريطة سِجِل)
-- Fort-Lamy هي نجامينا حاليًا: 12.1348 N, 15.0557 E
UPDATE places
SET lat = 12.1348, lng = 15.0557, place_confidence = 'confirmed'
WHERE id = 3 AND name_ar = 'فورت لامي' AND kind = 'city'
  AND lat IS NULL AND lng IS NULL;

-- مركز إقليم وداي محسوب من مضلع OCHA (TD14): 13.52400775 N, 21.26719233 E
UPDATE places
SET lat = 13.52400775, lng = 21.26719233, place_confidence = 'confirmed'
WHERE id = 2 AND name_ar = 'وداي' AND kind = 'region'
  AND lat IS NULL AND lng IS NULL;
