// Static mirrors of the actual queries in src/app/api/**/route.ts, for the
// "show the SQL" disclosure on the artist page. Keep these in sync by hand —
// there's no runtime link back to the route source, so a query edit there
// must be copied here too.

export const SQL_PROFILE = `
select *
from api_artist_profile
where artist_id = $1
`;

export const SQL_TIMESERIES = `
select
  snapshot_date, week_number, listeners, playcount,
  listener_delta, listener_pct_change, listeners_indexed
from api_artist_timeseries
where artist_id = $1
order by snapshot_date asc
`;

export const SQL_COMPARE_GENRE_TIER = `
select
  ts.snapshot_date, ts.week_number, ts.listeners, ts.listeners_indexed,
  cw.artist_count, cw.p25_indexed, cw.median_indexed, cw.p75_indexed
from api_artist_timeseries ts
left join api_cohort_weekly cw
  on cw.cohort_type = $2         -- 'genre' or 'size_band'
 and cw.cohort_key = $3          -- primary_genre or size_band
 and cw.snapshot_date = ts.snapshot_date
where ts.artist_id = $1
order by ts.snapshot_date asc
`;

export const SQL_COMPARE_SIMILAR = `
with peers as (
  select similar_artist_id as artist_id
  from api_artist_similar
  where artist_id = $1
),
peer_agg as (
  select
    ts.snapshot_date,
    count(*) as artist_count,
    percentile_cont(0.25) within group (order by ts.listeners_indexed) as p25_indexed,
    percentile_cont(0.5)  within group (order by ts.listeners_indexed) as median_indexed,
    percentile_cont(0.75) within group (order by ts.listeners_indexed) as p75_indexed
  from api_artist_timeseries ts
  join peers p on p.artist_id = ts.artist_id
  group by ts.snapshot_date
)
select ts.*, pa.artist_count, pa.p25_indexed, pa.median_indexed, pa.p75_indexed
from api_artist_timeseries ts
left join peer_agg pa on pa.snapshot_date = ts.snapshot_date
where ts.artist_id = $1
order by ts.snapshot_date asc
`;

export const SQL_SIMILAR = `
select
  similar_artist_id, slug, display_name, tier, size_band,
  latest_listeners, total_pct_growth, weeks_tracked, similarity_score, rank
from api_artist_similar
where artist_id = $1
order by rank asc
`;

export const SQL_SEARCH = `
select artist_id, slug, display_name, tier, size_band,
       latest_listeners, listener_percentile, weeks_tracked,
       similarity(name_norm, $1) as score
from api_artist_search
where (name_norm % $1 and similarity(name_norm, $1) > 0.3)
   or name_norm like $1 || '%'
order by
  (name_norm = $1) desc,
  (name_norm like $1 || '%') desc,
  similarity(name_norm, $1) desc,
  latest_listeners desc
limit $2
`;
