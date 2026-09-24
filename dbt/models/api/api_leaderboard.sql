{{ config(materialized='table') }}

with candidates as (

    select
        artist_id,
        slug,
        display_name,
        size_band,
        primary_genre,
        weeks_tracked,
        latest_listeners,
        total_listener_delta,
        total_pct_growth
    from {{ ref('api_artist_profile') }}
    where is_display_safe
      and artist_id not in (select artist_id from {{ ref('excluded_artists') }})
      and total_pct_growth is not null
      and starting_listeners >= {{ var('min_leaderboard_listeners', 1000) }}
      and weeks_tracked = (
          select max(weeks_tracked) from {{ ref('api_artist_profile') }}
      )

),

-- Each artist appears once globally and once in its own band.
scoped as (

    select 'all' as slice_key, artist_id, latest_listeners,
           total_listener_delta, total_pct_growth
    from candidates

    union all

    select size_band as slice_key, artist_id, latest_listeners,
           total_listener_delta, total_pct_growth
    from candidates

),

ranked as (

    select
        'fastest_growing_pct' as slice_type,
        slice_key,
        artist_id,
        total_pct_growth as metric_value,
        row_number() over (
            partition by slice_key order by total_pct_growth desc, artist_id
        ) as rank
    from scoped

    union all

    select
        'biggest_listener_gain' as slice_type,
        slice_key,
        artist_id,
        total_listener_delta as metric_value,
        row_number() over (
            partition by slice_key order by total_listener_delta desc, artist_id
        ) as rank
    from scoped

    union all

    select
        'most_listeners' as slice_type,
        slice_key,
        artist_id,
        latest_listeners as metric_value,
        row_number() over (
            partition by slice_key order by latest_listeners desc, artist_id
        ) as rank
    from scoped

),

final as (

    select
        r.slice_type,
        r.slice_key,
        r.rank,
        r.metric_value,

        c.artist_id,
        c.slug,
        c.display_name,
        c.size_band,
        c.primary_genre,
        c.latest_listeners,
        c.total_listener_delta,
        c.total_pct_growth,
        c.weeks_tracked

    from ranked r
    join candidates c using (artist_id)
    where r.rank <= {{ var('leaderboard_size', 50) }}

)

select * from final
