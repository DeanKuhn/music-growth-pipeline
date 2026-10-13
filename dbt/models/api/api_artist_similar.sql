{{ config(materialized='table') }}

with edges as (

    select
        artist_id,
        similar_artist_id,
        similarity_score
    from {{ ref('stg_artist_similarities') }}
    where similar_artist_id is not null
      and similar_artist_id != artist_id

),

undirected as (

    select artist_id, similar_artist_id, similarity_score from edges

    union all

    select similar_artist_id as artist_id,
           artist_id as similar_artist_id,
           similarity_score
    from edges

),

deduped as (

    select
        artist_id,
        similar_artist_id,
        max(similarity_score) as similarity_score
    from undirected
    group by artist_id, similar_artist_id

),

-- Both ends must have a profile page: the source so the endpoint can find the
-- row, the neighbour so its link resolves. Unsafe names are excluded rather
-- than redacted — a table of '[redacted]' rows is worse than a shorter table.
joined as (

    select
        d.artist_id,
        d.similar_artist_id,
        d.similarity_score,

        p.slug,
        p.display_name,
        p.size_band,
        p.latest_listeners,
        p.total_pct_growth,
        p.weeks_tracked

    from deduped d
    join {{ ref('api_artist_profile') }} p
        on d.similar_artist_id = p.artist_id
    join {{ ref('api_artist_search') }} src
        on d.artist_id = src.artist_id
    where p.is_display_safe

),

ranked as (

    select
        *,
        row_number() over (
            partition by artist_id
            order by similarity_score desc, latest_listeners desc
        ) as rank
    from joined

)

select * from ranked
where rank <= {{ var('max_similar_per_artist', 20) }}
