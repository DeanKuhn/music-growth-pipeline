-- Single row of "is this thing alive and how big is it" for GET /api/stats and
-- the how-it-works page. Freshness is measured against the snapshot date, not
-- the dbt run: the weekly Actions job could rebuild these models perfectly
-- while the ingestion step failed, and that is exactly the failure worth
-- surfacing.

{{ config(materialized='table') }}

with snapshots as (

    select
        count(distinct artist_id) as artists_with_history,
        count(distinct snapshot_date) as snapshot_dates,
        max(snapshot_date) as latest_snapshot_date,
        min(snapshot_date) as first_snapshot_date,
        count(*) as snapshot_rows
    from {{ ref('stg_artist_snapshots') }}

),

artists as (

    select
        count(*) as artists_total,
        count(*) filter (where size_band = '<10k') as artists_lt10k,
        count(*) filter (where size_band = '10k-50k') as artists_10k_50k,
        count(*) filter (where size_band = '50k-100k') as artists_50k_100k,
        count(*) filter (where size_band = '100k-250k') as artists_100k_250k,
        count(*) filter (where size_band = '250k-500k') as artists_250k_500k,
        count(*) filter (where size_band = '500k-1M') as artists_500k_1m,
        count(*) filter (where size_band = '1M+') as artists_1m_plus
    from {{ ref('int_artist_base') }}

),

coverage as (

    select
        (select count(*) from {{ ref('api_artist_search') }})
            as artists_searchable,
        (select count(*) from {{ ref('api_artist_profile') }})
            as artists_with_profile,
        (select count(*) from {{ ref('api_artist_profile') }}
            where not is_display_safe) as artists_redacted,
        (select count(distinct artist_id) from {{ ref('stg_genre_artists') }})
            as artists_with_genre,
        (select count(distinct artist_id) from {{ ref('api_artist_similar') }})
            as artists_with_similar,
        (select count(*) from {{ ref('stg_genres') }}) as genres_total

),

final as (

    select
        a.artists_total,
        a.artists_lt10k,
        a.artists_10k_50k,
        a.artists_50k_100k,
        a.artists_100k_250k,
        a.artists_250k_500k,
        a.artists_500k_1m,
        a.artists_1m_plus,

        c.artists_with_profile,
        c.artists_searchable,
        c.artists_redacted,
        c.artists_with_genre,
        c.artists_with_similar,
        c.genres_total,

        s.artists_with_history,
        s.snapshot_rows,
        s.snapshot_dates,
        s.first_snapshot_date,
        s.latest_snapshot_date,

        -- The weekly job runs Sundays; > 7 means a run was missed.
        (current_date - s.latest_snapshot_date) as days_since_snapshot,

        -- Analysis window, which starts later than first_snapshot_date —
        -- the first two dates are partial populations (see Data History).
        (select count(distinct snapshot_date)
            from {{ ref('api_artist_timeseries') }}) as weeks_in_series,
        (select min(snapshot_date)
            from {{ ref('api_artist_timeseries') }}) as series_start_date,

        current_timestamp as built_at

    from artists a
    cross join coverage c
    cross join snapshots s

)

select * from final
