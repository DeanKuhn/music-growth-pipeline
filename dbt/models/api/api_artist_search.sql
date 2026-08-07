-- One narrow row per artist, built to be typed against: the autocomplete
-- endpoint matches on name_norm (trigram for typos, prefix for <3-char
-- queries) and orders by latest_listeners. Only artists that have a profile
-- page appear here, so a search hit can never 404. Names failing the
-- profanity filter are excluded outright — see macros/profanity.sql.

{{
    config(
        materialized='table',
        indexes=[
            {'columns': ['artist_id'], 'unique': True},
            {'columns': ['slug'], 'unique': True},
            {'columns': ['name_norm gin_trgm_ops'], 'type': 'gin'},
            {'columns': ['name_norm text_pattern_ops']},
            {'columns': ['latest_listeners']},
        ]
    )
}}

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
