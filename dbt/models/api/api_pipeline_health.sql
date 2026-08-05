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
        count(*) filter (where tier = 'mainstream') as artists_mainstream,
        count(*) filter (where tier = 'indie') as artists_indie,
        count(*) filter (where tier = 'unranked') as artists_unranked
    from {{ ref('artist_tiers') }}

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
        a.artists_mainstream,
        a.artists_indie,
        a.artists_unranked,

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
