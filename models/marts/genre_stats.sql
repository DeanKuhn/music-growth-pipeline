with latest_snapshots as (
    select distinct on (artist_id)
        artist_id,
        listeners,
        playcount
    from {{ ref('stg_artist_snapshots') }}
    order by artist_id, snapshot_date desc
)

select
    g.genre_id,
    g.genre,
    count(distinct ga.artist_id) as artist_count,
    round(avg(ls.listeners), 0) as avg_listeners,
    round(avg(ls.playcount::numeric / ls.listeners), 2) as avg_plays_per_listener,
    count(distinct case when at.tier = 'mainstream' then ga.artist_id end) as mainstream_count,
    count(distinct case when at.tier = 'indie' then ga.artist_id end) as indie_count
from {{ ref('stg_genres') }} g
join {{ ref('stg_genre_artists') }} ga on g.genre_id = ga.genre_id
join {{ ref('artist_tiers') }} at on ga.artist_id = at.artist_id
join latest_snapshots ls on ga.artist_id = ls.artist_id
group by g.genre_id, g.genre
order by avg_listeners desc