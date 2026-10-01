-- OSM place=city node 150384326, Abéché: 13.8280295 N, 20.8283652 E.
-- City-centre coordinates identify the locality, not a street-level event site.
UPDATE places
SET lat = 13.8280295, lng = 20.8283652
WHERE id = 1 AND name_ar = 'أبشة' AND kind = 'city'
  AND lat IS NULL AND lng IS NULL;
