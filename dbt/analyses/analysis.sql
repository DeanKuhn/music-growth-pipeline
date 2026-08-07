-- analysis.sql
-- Cross-sectional analysis by size_band (listener-count based), grouped on
-- each artist's latest snapshot. Replaces the retired mainstream/indie
-- chart-page split: chart position reflects recent scrobble activity, not
-- artist size, so a size_band grouping is the honest replacement — see
-- CLAUDE.md and docs/findings.md.


-- QUERY 1: Average listener count and plays-per-listener ratio by size_band
SELECT
    b.size_band,
    ROUND(AVG(s.playcount::numeric / s.listeners), 2) AS avg_plays_per_listener,
    ROUND(AVG(s.listeners), 0) AS avg_listeners,
    COUNT(*) AS artists
FROM (
    SELECT DISTINCT ON (artist_id) artist_id, listeners, playcount
    FROM {{ ref('stg_artist_snapshots') }}
    ORDER BY artist_id, snapshot_date DESC
) s
JOIN {{ ref('int_artist_base') }} b ON s.artist_id = b.artist_id
GROUP BY b.size_band, b.size_band_sort
ORDER BY b.size_band_sort;


-- QUERY 2: Listener count percentile distribution by size_band
SELECT
    b.size_band,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY s.listeners) AS p25_listeners,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY s.listeners) AS median_listeners,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY s.listeners) AS p75_listeners,
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY s.listeners) AS p90_listeners
FROM (
    SELECT DISTINCT ON (artist_id) artist_id, listeners
    FROM {{ ref('stg_artist_snapshots') }}
    ORDER BY artist_id, snapshot_date DESC
) s
JOIN {{ ref('int_artist_base') }} b ON s.artist_id = b.artist_id
GROUP BY b.size_band, b.size_band_sort
ORDER BY b.size_band_sort;


-- QUERY 3: Plays-per-listener ratio percentile distribution by size_band
SELECT
    b.size_band,
    ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (
        ORDER BY s.playcount::numeric / s.listeners)::numeric, 2) AS p25_ratio,
    ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (
        ORDER BY s.playcount::numeric / s.listeners)::numeric, 2) AS median_ratio,
    ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (
        ORDER BY s.playcount::numeric / s.listeners)::numeric, 2) AS p75_ratio
FROM (
    SELECT DISTINCT ON (artist_id) artist_id, listeners, playcount
    FROM {{ ref('stg_artist_snapshots') }}
    ORDER BY artist_id, snapshot_date DESC
) s
JOIN {{ ref('int_artist_base') }} b ON s.artist_id = b.artist_id
GROUP BY b.size_band, b.size_band_sort
ORDER BY b.size_band_sort;
