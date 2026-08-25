import { sql } from '@/lib/db';

export async function queryArtistProfile(artistId: number) {
  const rows = await sql`
    select * from api_artist_profile where artist_id = ${artistId}
  `;
  return rows[0] ?? null;
}

export async function queryArtistTimeseries(artistId: number) {
  return sql`
    select
      snapshot_date, week_number, listeners, playcount,
      listener_delta, listener_pct_change, listeners_indexed
    from api_artist_timeseries
    where artist_id = ${artistId}
    order by snapshot_date asc
  `;
}

export async function queryArtistExists(artistId: number) {
  const rows = await sql`
    select 1 from api_artist_profile where artist_id = ${artistId} limit 1
  `;
  return rows.length > 0;
}

export async function queryArtistCompareSimilar(artistId: number) {
  return sql`
    with peers as (
      select similar_artist_id as artist_id
      from api_artist_similar
      where artist_id = ${artistId}
    ),
    peer_agg as (
      select
        ts.snapshot_date,
        count(*) as artist_count,
        percentile_cont(0.25) within group (order by ts.listeners_indexed) as p25_indexed,
        percentile_cont(0.5) within group (order by ts.listeners_indexed) as median_indexed,
        percentile_cont(0.75) within group (order by ts.listeners_indexed) as p75_indexed
      from api_artist_timeseries ts
      join peers p on p.artist_id = ts.artist_id
      group by ts.snapshot_date
    )
    select
      ts.snapshot_date, ts.week_number, ts.listeners, ts.listeners_indexed,
      pa.artist_count,
      round(pa.p25_indexed::numeric, 2) as p25_indexed,
      round(pa.median_indexed::numeric, 2) as median_indexed,
      round(pa.p75_indexed::numeric, 2) as p75_indexed
    from api_artist_timeseries ts
    left join peer_agg pa on pa.snapshot_date = ts.snapshot_date
    where ts.artist_id = ${artistId}
    order by ts.snapshot_date asc
  `;
}

export async function queryArtistCompareCohort(
  artistId: number,
  vs: string,
  cohortKey: string | null
) {
  return sql`
    select
      ts.snapshot_date, ts.week_number, ts.listeners, ts.listeners_indexed,
      cw.artist_count, cw.p25_indexed, cw.median_indexed, cw.p75_indexed
    from api_artist_timeseries ts
    left join api_cohort_weekly cw
      on cw.cohort_type = ${vs}
     and cw.cohort_key = ${cohortKey}
     and cw.snapshot_date = ts.snapshot_date
    where ts.artist_id = ${artistId}
    order by ts.snapshot_date asc
  `;
}

export async function queryArtistSimilar(artistId: number) {
  return sql`
    select
      similar_artist_id, slug, display_name, size_band,
      latest_listeners, total_pct_growth, weeks_tracked,
      similarity_score, rank
    from api_artist_similar
    where artist_id = ${artistId}
    order by rank asc
  `;
}

export async function queryGenres() {
  return sql`
    select
      genre_id, genre, artist_count, avg_listeners, avg_plays_per_listener,
      small_count, large_count, avg_total_pct_growth, median_total_pct_growth,
      growth_avg_weekly_pct_change
    from api_genres
    order by avg_listeners desc
  `;
}

export async function queryLeaderboard(
  sliceType: string,
  sliceKey: string,
  limit: number
) {
  return sql`
    select
      rank, metric_value, artist_id, slug, display_name, size_band,
      primary_genre, latest_listeners, total_listener_delta,
      total_pct_growth, weeks_tracked
    from api_leaderboard
    where slice_type = ${sliceType} and slice_key = ${sliceKey}
    order by rank asc
    limit ${limit}
  `;
}

export async function querySearch(q: string, limit: number) {
  const rows = await sql`
    select
      artist_id, slug, display_name, size_band, latest_listeners,
      listener_percentile, weeks_tracked,
      similarity(name_norm, ${q}) as score
    from api_artist_search
    where (name_norm % ${q} and similarity(name_norm, ${q}) > 0.3)
       or name_norm like ${q} || '%'
    order by
      (name_norm = ${q}) desc,
      (name_norm like ${q} || '%') desc,
      similarity(name_norm, ${q}) desc,
      latest_listeners desc
    limit ${limit}
  `;

  if (rows.length > 0) {
    return { found: true as const, results: rows };
  }

  const suggestions = await sql`
    select artist_id, slug, display_name, latest_listeners
    from api_artist_search
    where similarity(name_norm, ${q}) > 0.15
    order by similarity(name_norm, ${q}) desc, latest_listeners desc
    limit 5
  `;

  return { found: false as const, suggestions };
}

export async function queryStats() {
  const rows = await sql`select * from api_pipeline_health`;
  return rows[0] ?? null;
}
