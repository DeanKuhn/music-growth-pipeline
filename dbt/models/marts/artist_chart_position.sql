with final as (

    select
        a.artist_id,
        a.artist_name,
        a.mbid,
        min(wc.page) as min_page,
        min((wc.page - 1) * 5 + wc.rank) as global_rank

    from {{ ref('stg_artists') }} a
    left join {{ ref('stg_weekly_charts') }} wc on a.artist_id = wc.artist_id
    group by a.artist_id, a.artist_name, a.mbid

)

select * from final
