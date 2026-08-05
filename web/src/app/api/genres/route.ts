import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { serverError } from '@/lib/errors';
import { STANDARD_CACHE_CONTROL } from '@/lib/cache';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'edge';

async function handler(_req: NextRequest) {
  let rows;
  try {
    rows = await sql`
      select
        genre_id,
        genre,
        artist_count,
        avg_listeners,
        avg_plays_per_listener,
        mainstream_count,
        indie_count,
        avg_total_pct_growth,
        median_total_pct_growth,
        growth_avg_weekly_pct_change
      from api_genres
      order by avg_listeners desc
    `;
  } catch (err) {
    return serverError(err);
  }

  const response = NextResponse.json({ genres: rows });
  response.headers.set('Cache-Control', STANDARD_CACHE_CONTROL);
  return response;
}

export const GET = withRateLimit(handler);
