select
    a.artist_id,
    a.artist_name,
    a.mbid,
    min(wc.page) as min_page,
    case
        when min(wc.page) <= 50 then 'mainstream'
        else 'indie'
    end as tier
from {{ ref('stg_artists') }} a
join {{ ref('stg_weekly_charts') }} wc on a.artist_id = wc.artist_id
group by a.artist_id, a.artist_name, a.mbid