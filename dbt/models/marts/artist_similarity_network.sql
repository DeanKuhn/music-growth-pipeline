{{ config(materialized='view') }}

with final as (

    select
        sim.artist_id,
        src.artist_name as artist_name,
        src.size_band as artist_size_band,
        sim.similar_artist_id,
        sim.similar_name,
        tgt.size_band as similar_artist_size_band,
        sim.similarity_score,
        case when src.size_band != tgt.size_band
            then 'cross_band'
            else 'same_band'
            end as pair_type
    from {{ ref('stg_artist_similarities') }} sim
    join {{ ref('int_artist_base') }} src on sim.artist_id = src.artist_id
    join {{ ref('int_artist_base') }} tgt on sim.similar_artist_id = tgt.artist_id
    where sim.similar_artist_id is not null

)

select * from final
