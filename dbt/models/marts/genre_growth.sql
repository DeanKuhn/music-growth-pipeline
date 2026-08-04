with growth as (

    select * from {{ ref('artist_growth_summary') }}

),

genre_artists as (

    select * from {{ ref('stg_genre_artists') }}

),

genres as (

    select * from {{ ref('stg_genres') }}

),

final as (

    select
        ge.genre,
        count(ga.artist_id) as artist_count,

        round(
            avg(gr.total_pct_growth)::numeric, 2
        ) as avg_total_pct_growth,

        round(
            percentile_cont(0.5) within group
            (order by gr.total_pct_growth)::numeric, 2
        ) as median_total_pct_growth,

        round(
            avg(gr.average_listener_pct)::numeric, 2
        ) as avg_weekly_pct_change,

        round(
            avg(gr.ending_count)::numeric, 2
        ) as avg_listeners

    from growth gr
    join genre_artists ga on gr.artist_id = ga.artist_id
    join genres ge on ga.genre_id = ge.genre_id
    where gr.weeks_tracked >= 6
    group by genre
    having count(*) >= 50

)

select * from final