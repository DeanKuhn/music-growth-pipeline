-- 002_prune_orphan_artists.sql
-- Remove ~76k artists that were pulled in by similarity seeding but never
-- snapshotted, charted, or genre-tagged.  They exist only as similarity-graph
-- nodes and consume ~100-120 MB (artist_similarities + downstream models).
--
-- Safety net: orphan IDs/names dumped to data/orphan_artists_backup.json
-- before running this migration.
--
-- Run inside a transaction so it's all-or-nothing.

BEGIN;

-- Identify orphans once in a temp table so the DELETE joins are fast.
CREATE TEMP TABLE orphan_ids AS
SELECT id FROM artists a
WHERE NOT EXISTS (SELECT 1 FROM artist_snapshots  s WHERE s.artist_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM genre_artists     g WHERE g.artist_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM weekly_charts     w WHERE w.artist_id = a.id);

-- Delete similarity edges that reference any orphan (either side).
DELETE FROM artist_similarities
WHERE artist_id         IN (SELECT id FROM orphan_ids)
   OR similar_artist_id IN (SELECT id FROM orphan_ids);

-- Delete the orphan artists themselves.
DELETE FROM artists
WHERE id IN (SELECT id FROM orphan_ids);

DROP TABLE orphan_ids;

COMMIT;
