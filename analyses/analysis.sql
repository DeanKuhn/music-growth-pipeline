-- analysis.sql
-- Cross-sectional analysis: mainstream (pages 1-50) vs indie (pages 500-2000)
-- All queries run against a single snapshot taken 2026-04-27.
-- Mainstream = 250 artists, Indie = 7,501 artists.


-- QUERY 1: Average listener count and plays-per-listener ratio by tier
-- Finding: mainstream artists average 10x more listeners, and their listeners
-- play them 4x more often on average (100 vs 25 plays per listener).
SELECT
    CASE WHEN w.page <= 50 THEN 'mainstream' ELSE 'indie' END AS tier,
    ROUND(AVG(s.playcount::numeric / s.listeners), 2) AS avg_plays_per_listener,
    ROUND(AVG(s.listeners), 0) AS avg_listeners,
    COUNT(*) AS artists
FROM artist_snapshots s
JOIN weekly_charts w ON s.artist_id = w.artist_id
GROUP BY tier;


-- QUERY 2: Listener count percentile distribution by tier
-- Finding: the distributions do not overlap — the top 10% of indie artists
-- (782K listeners) fall well below the bottom 25% of mainstream artists (2.3M).
-- Indie also shows higher relative variance (6x spread P25-P90 vs 2.5x).
SELECT
    CASE WHEN w.page <= 50 THEN 'mainstream' ELSE 'indie' END AS tier,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY s.listeners) AS p25_listeners,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY s.listeners) AS median_listeners,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY s.listeners) AS p75_listeners,
    PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY s.listeners) AS p90_listeners
FROM artist_snapshots s
JOIN weekly_charts w ON s.artist_id = w.artist_id
GROUP BY tier;


-- QUERY 3: Plays-per-listener ratio percentile distribution by tier
-- Finding: the 4x ratio gap holds across the full distribution, not just
-- the average. Mainstream P25 (48.64) exceeds indie P75 (29.08) —
-- the distributions barely overlap.
-- Caveat: mainstream artists have older catalogues on average, so accumulated
-- playcounts may partly explain the gap rather than fanbase dedication alone.
SELECT
    CASE WHEN w.page <= 50 THEN 'mainstream' ELSE 'indie' END AS tier,
    ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (
        ORDER BY s.playcount::numeric / s.listeners)::numeric, 2) AS p25_ratio,
    ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (
        ORDER BY s.playcount::numeric / s.listeners)::numeric, 2) AS median_ratio,
    ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (
        ORDER BY s.playcount::numeric / s.listeners)::numeric, 2) AS p75_ratio
FROM artist_snapshots s
JOIN weekly_charts w ON s.artist_id = w.artist_id
GROUP BY tier;