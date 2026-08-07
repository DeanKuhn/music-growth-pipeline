import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { extractArtistIdFromSlug, compareTargetSchema } from '@/lib/validation';
import { badRequest, notFound, serverError } from '@/lib/errors';
import { STANDARD_CACHE_CONTROL } from '@/lib/cache';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'edge';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

async function handler(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const artistId = extractArtistIdFromSlug(slug);
  if (artistId === null) return badRequest();

  const vsParsed = compareTargetSchema.safeParse(req.nextUrl.searchParams.get('vs'));
  if (!vsParsed.success) return badRequest();
  const vs = vsParsed.data;

  let profileRows;
  try {
    profileRows = await sql`
      select artist_id, primary_genre, size_band, weeks_tracked
      from api_artist_profile
      where artist_id = ${artistId}
    `;
  } catch (err) {
    return serverError(err);
  }

  const profile = profileRows[0];
  if (!profile) return notFound();

  let rows;
  try {
    if (vs === 'similar') {
      // api_cohort_weekly has no per-artist grain, so there's no
      // precomputed cohort for "this artist's similar set" — it's computed
      // on the fly from api_artist_similar's (already capped at 20) peers.
      // 20 artists x ~13 weeks is cheap well within the 5s statement_timeout.
      rows = await sql`
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
          ts.snapshot_date,
          ts.week_number,
          ts.listeners,
          ts.listeners_indexed,
          pa.artist_count,
          round(pa.p25_indexed::numeric, 2) as p25_indexed,
          round(pa.median_indexed::numeric, 2) as median_indexed,
          round(pa.p75_indexed::numeric, 2) as p75_indexed
        from api_artist_timeseries ts
        left join peer_agg pa on pa.snapshot_date = ts.snapshot_date
        where ts.artist_id = ${artistId}
        order by ts.snapshot_date asc
      `;
    } else {
      // vs maps 1:1 to api_cohort_weekly.cohort_type ('genre' | 'size_band').
      const cohortKey = vs === 'genre' ? profile.primary_genre : profile.size_band;

      rows = await sql`
        select
          ts.snapshot_date,
          ts.week_number,
          ts.listeners,
          ts.listeners_indexed,
          cw.artist_count,
          cw.p25_indexed,
          cw.median_indexed,
          cw.p75_indexed
        from api_artist_timeseries ts
        left join api_cohort_weekly cw
          on cw.cohort_type = ${vs}
         and cw.cohort_key = ${cohortKey}
         and cw.snapshot_date = ts.snapshot_date
        where ts.artist_id = ${artistId}
        order by ts.snapshot_date asc
      `;
    }
  } catch (err) {
    return serverError(err);
  }

  // No cohort match (e.g. a genre-less artist, or a genre/size_band that
  // dropped below min_cohort_size and was filtered out of api_cohort_weekly)
  // still returns 200 with the artist's own series and null cohort columns —
  // the frontend distinguishes "no comparison available" from "not found".
  const cohortAvailable = rows.some((r) => r.median_indexed !== null);

  const response = NextResponse.json({
    artist_id: artistId,
    vs,
    insufficient_data: (profile.weeks_tracked ?? 0) < 3,
    cohort_available: cohortAvailable,
    series: rows,
  });
  response.headers.set('Cache-Control', STANDARD_CACHE_CONTROL);
  return response;
}

export const GET = withRateLimit(handler);
