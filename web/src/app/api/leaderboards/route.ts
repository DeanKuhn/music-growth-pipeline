import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { leaderboardParamsSchema } from '@/lib/validation';
import { badRequest, serverError } from '@/lib/errors';
import { STANDARD_CACHE_CONTROL } from '@/lib/cache';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'edge';

async function handler(req: NextRequest) {
  const parsed = leaderboardParamsSchema.safeParse({
    slice_type: req.nextUrl.searchParams.get('slice_type') ?? undefined,
    slice_key: req.nextUrl.searchParams.get('slice_key') ?? undefined,
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) return badRequest();

  const { slice_type, slice_key, limit } = parsed.data;

  let rows;
  try {
    rows = await sql`
      select
        rank,
        metric_value,
        artist_id,
        slug,
        display_name,
        size_band,
        primary_genre,
        latest_listeners,
        total_listener_delta,
        total_pct_growth,
        weeks_tracked
      from api_leaderboard
      where slice_type = ${slice_type}
        and slice_key = ${slice_key}
      order by rank asc
      limit ${limit}
    `;
  } catch (err) {
    return serverError(err);
  }

  const response = NextResponse.json({ slice_type, slice_key, results: rows });
  response.headers.set('Cache-Control', STANDARD_CACHE_CONTROL);
  return response;
}

export const GET = withRateLimit(handler);
