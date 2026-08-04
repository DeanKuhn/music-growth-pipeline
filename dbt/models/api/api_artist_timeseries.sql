{{
    config(
        materialized='table',
        indexes=[
            {'columns': ['artist_id', 'snapshot_date'], 'unique': True},
            {'columns': ['snapshot_date']},
        ]
    )
}}

with snapshots as (

    select * from {{ ref('stg_artist_snapshots') }}

),

observed as (

    select
        artist_id,
        snapshot_date,
        listeners,
        playcount
    from snapshots
    where snapshot_date >= '{{ var("series_start_date", "2026-05-10") }}'::date

),

windowed as (

    select
        artist_id,
        snapshot_date,
        listeners,
        playcount,

        lag(listeners) over w as previous_listeners,

        first_value(listeners) over w as baseline_listeners,

        row_number() over w as week_number

    from observed
    window w as (partition by artist_id order by snapshot_date)

),

final as (

    select
        artist_id,
        snapshot_date,
        week_number,

        listeners,
        playcount,

        listeners - previous_listeners as listener_delta,

        round(
            (listeners - previous_listeners)::numeric /
            nullif(previous_listeners, 0) * 100, 2
        ) as listener_pct_change,

        round(
            100.0 * listeners / nullif(baseline_listeners, 0), 2
        ) as listeners_indexed

    from windowed

)

select * from final
