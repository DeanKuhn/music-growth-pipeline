with panel as (

  select * from {{ ref('artist_growth_panel') }}

),

final as (

  select
    size_quintile,
    count(*) as artist_count,
    min(start_listeners) as band_min,
    max(start_listeners) as band_max,
    round(
      percentile_cont(0.5)
        within group (order by pct_growth)::numeric, 2
    ) as median_pct_growth,
    round(avg(pct_growth), 2) as avg_pct_growth,
    round(
      percentile_cont(0.9)
        within group (order by pct_growth)::numeric, 2
    ) as p90_pct_growth,
    window_start,
    window_end,
    n_weeks

  from panel

  group by size_quintile, window_start, window_end, n_weeks

)

select * from final
