{{ config(materialized='table') }}

with base as (

    select * from {{ ref('int_artist_base') }}
    where is_display_safe

),

final as (

    select
        b.artist_id,
        b.slug,
        b.display_name,
        b.name_norm,

        b.size_band,
        b.size_band_sort,

        b.latest_listeners,
        b.listener_percentile,
        b.weeks_tracked

    from base b

)

select * from final
