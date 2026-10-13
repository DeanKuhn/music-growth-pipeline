with windowed as (

  select
    artist_id,
    listeners,
    snapshot_date
  
  from {{ ref('stg_artist_snapshots') }}

  where snapshot_date >= '{{ var('panel_start_date', '2026-08-09') }}'::date

),

window_bounds as (
  
  select
    min(snapshot_date) as window_start,
    max(snapshot_date) as window_end,
    count(distinct snapshot_date) as n_weeks

  from windowed

),

per_artist as (

  select
    artist_id,
    (array_agg(listeners order by snapshot_date asc))[1] as start_listeners,
    (array_agg(listeners order by snapshot_date desc))[1] as end_listeners,
    count(distinct snapshot_date) as weeks_present

  from windowed

  group by artist_id

),

final as (

  select
    artist_id,
    start_listeners,
    end_listeners,
    round((end_listeners - start_listeners)::numeric / start_listeners * 100, 2) as pct_growth,
    ntile(5) over (order by start_listeners) as size_quintile,
    window_start,
    window_end,
    n_weeks

  from per_artist
  cross join window_bounds

  where weeks_present = n_weeks and start_listeners > 0

)

select * from final
