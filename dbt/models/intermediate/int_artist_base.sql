{% set profanity_pattern = env_var('PROFANITY_PATTERN', '') %}

with artists as (

    select * from {{ ref('stg_artists') }}

),

snapshots as (

    select * from {{ ref('stg_artist_snapshots') }}

),

snapshot_agg as (

    select
        artist_id,

        min(snapshot_date) as first_snapshot_date,
        max(snapshot_date) as latest_snapshot_date,
        count(distinct snapshot_date) as weeks_tracked,

        (array_agg(listeners order by snapshot_date asc))[1]
            as starting_listeners,

        (array_agg(listeners order by snapshot_date desc))[1]
            as latest_listeners,

        (array_agg(playcount order by snapshot_date desc))[1]
            as latest_playcount

    from snapshots
    group by artist_id

),

derived as (

    select
        a.artist_id,
        a.artist_name,
        a.mbid,

        s.first_snapshot_date,
        s.latest_snapshot_date,
        s.weeks_tracked,
        s.starting_listeners,
        s.latest_listeners,
        s.latest_playcount,

        lower(unaccent(btrim(a.artist_name))) as name_norm,

        a.artist_id || '-' || coalesce(
            nullif(
                regexp_replace(
                    regexp_replace(lower(unaccent(btrim(a.artist_name))),
                    '[^[:alnum:]]+', '-', 'g'), '^-+|-+$', '', 'g'
                ),
            ''),
        'artist') as slug,

        case
            when s.starting_listeners >= 1000000 then '1M+'
            when s.starting_listeners >=  500000 then '500k-1M'
            when s.starting_listeners >=  250000 then '250k-500k'
            when s.starting_listeners >=  100000 then '100k-250k'
            when s.starting_listeners >=   50000 then '50k-100k'
            when s.starting_listeners >=   10000 then '10k-50k'
            else                                      '<10k'
        end as size_band,

        case
            when s.starting_listeners >= 1000000 then 7
            when s.starting_listeners >=  500000 then 6
            when s.starting_listeners >=  250000 then 5
            when s.starting_listeners >=  100000 then 4
            when s.starting_listeners >=   50000 then 3
            when s.starting_listeners >=   10000 then 2
            else                                      1
        end as size_band_sort,

        {% if profanity_pattern %}
            not (a.artist_name ~* '{{ profanity_pattern }}') as is_display_safe
        {% else %}
            true as is_display_safe
        {% endif %}

    from artists a
    join snapshot_agg s on a.artist_id = s.artist_id

),


final as (

    select
        artist_id,
        artist_name,
        mbid,
        name_norm,
        slug,

        first_snapshot_date,
        latest_snapshot_date,
        weeks_tracked,
        starting_listeners,
        latest_listeners,
        latest_playcount,

        size_band,
        size_band_sort,
        is_display_safe,

        round((percent_rank() over (order by latest_listeners))::numeric, 4)
            as listener_percentile

    from derived

)

select * from final
