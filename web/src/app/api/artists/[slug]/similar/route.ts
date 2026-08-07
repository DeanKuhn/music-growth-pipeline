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
        similar_artist_id,
        slug,
        display_name,
        size_band,
        latest_listeners,
        total_pct_growth,
        weeks_tracked,
        similarity_score,
        rank
      from api_artist_similar
      where artist_id = ${artistId}
      order by rank asc
    `;
  } catch (err) {
    return serverError(err);
  }

  // No edges is legitimate (thin part of the similarity graph — see issue
  // #5 in findings.md) as long as the artist itself exists. Only 404 for a
  // nonexistent artist_id.
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

  const response = NextResponse.json({ artist_id: artistId, similar: rows });
  response.headers.set('Cache-Control', STANDARD_CACHE_CONTROL);
  return response;
}

export const GET = withRateLimit(handler);
