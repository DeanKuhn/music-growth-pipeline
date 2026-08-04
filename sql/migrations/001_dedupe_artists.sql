BEGIN;


CREATE TEMP TABLE dupe_map AS
SELECT id AS loser_id,
    min(id) over (PARTITION BY lower(btrim(name))) AS survivor_id
FROM artists;
DELETE FROM dupe_map WHERE loser_id = survivor_id;

UPDATE artist_similarities s
SET similar_artist_id = survivor_id
FROM dupe_map d
WHERE s.similar_artist_id = d.loser_id;

DELETE FROM artist_snapshots WHERE artist_id IN (SELECT loser_id FROM dupe_map);

DELETE FROM artists WHERE id IN (SELECT loser_id FROM dupe_map);


COMMIT;


