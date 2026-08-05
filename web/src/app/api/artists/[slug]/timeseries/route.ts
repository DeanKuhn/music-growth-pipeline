import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { extractArtistIdFromSlug } from '@/lib/validation';
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

  let rows;
  try {
    rows = await sql`
      select
        snapshot_date,
        week_number,
        listeners,
        playcount,
        listener_delta,
        listener_pct_change,
        listeners_indexed
      from api_artist_timeseries
      where artist_id = ${artistId}
      order by snapshot_date asc
    `;
  } catch (err) {
    return serverError(err);
  }

  // An empty series is legitimate — e.g. an artist whose only snapshot
  // predates series_start_date (2026-05-10, see CLAUDE.md Data History) has
  // a profile but no timeseries rows. Only 404 if the artist doesn't exist
  // at all; otherwise return the (possibly empty) series with 200.
  if (rows.length === 0) {
    let exists;
    try {
      exists = await sql`
        select 1 from api_artist_profile where artist_id = ${artistId} limit 1
      `;
    } catch (err) {
      return serverError(err);
    }
    if (exists.length === 0) return notFound();
  }

  const response = NextResponse.json({ artist_id: artistId, series: rows });
  response.headers.set('Cache-Control', STANDARD_CACHE_CONTROL);
  return response;
}

export const GET = withRateLimit(handler);
