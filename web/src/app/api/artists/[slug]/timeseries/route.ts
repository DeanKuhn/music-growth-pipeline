import { NextRequest, NextResponse } from 'next/server';
import { extractArtistIdFromSlug } from '@/lib/validation';
import { queryArtistTimeseries, queryArtistExists } from '@/lib/queries';
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
    rows = await queryArtistTimeseries(artistId);
  } catch (err) {
    return serverError(err);
  }

  if (rows.length === 0) {
    let exists;
    try {
      exists = await queryArtistExists(artistId);
    } catch (err) {
      return serverError(err);
    }
    if (!exists) return notFound();
  }

  const response = NextResponse.json({ artist_id: artistId, series: rows });
  response.headers.set('Cache-Control', STANDARD_CACHE_CONTROL);
  return response;
}

export const GET = withRateLimit(handler);
