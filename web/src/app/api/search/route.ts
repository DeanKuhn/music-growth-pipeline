import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { searchParamsSchema } from '@/lib/validation';
import { badRequest, serverError } from '@/lib/errors';
import { SEARCH_CACHE_CONTROL } from '@/lib/cache';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'edge';

async function handler(req: NextRequest) {
  const parsed = searchParamsSchema.safeParse({
    q: req.nextUrl.searchParams.get('q') ?? undefined,
    limit: req.nextUrl.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) return badRequest();

  const { q, limit } = parsed.data;

  let rows;
  try {
    // `name_norm % $1` is the index-accelerated predicate (ix_search_trgm,
    // a GIN index — see the plan's verification query) and rides on
    // pg_trgm.similarity_threshold, which defaults to 0.3 but is a session
    // GUC nobody here sets explicitly. ANDing an explicit
    // similarity(...) > 0.3 pins the floor regardless of that default ever
    // changing, without giving up the index scan — `%` still does the
    // heavy lifting, the AND just narrows its output. Prefix match is OR'd
    // in separately since queries under 3 chars produce no trigrams at all.
    rows = await sql`
      select
        artist_id,
        slug,
        display_name,
        size_band,
        latest_listeners,
        listener_percentile,
        weeks_tracked,
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
  } catch (err) {
    return serverError(err);
  }

  if (rows.length > 0) {
    const response = NextResponse.json({ found: true, results: rows });
    response.headers.set('Cache-Control', SEARCH_CACHE_CONTROL);
    return response;
  }

  let suggestions;
  try {
    suggestions = await sql`
      select
        artist_id,
        slug,
        display_name,
        latest_listeners
      from api_artist_search
      where similarity(name_norm, ${q}) > 0.15
      order by similarity(name_norm, ${q}) desc, latest_listeners desc
      limit 5
    `;
  } catch (err) {
    return serverError(err);
  }

  const response = NextResponse.json({ found: false, suggestions });
  response.headers.set('Cache-Control', SEARCH_CACHE_CONTROL);
  return response;
}

export const GET = withRateLimit(handler);
