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
      select *
      from api_artist_profile
      where artist_id = ${artistId}
    `;
  } catch (err) {
    return serverError(err);
  }

  const profile = rows[0];
  if (!profile) return notFound();

  // weeks_tracked < 3 is the insufficient-data state the frontend needs to
  // render distinctly ("comparisons unlock at 4 weeks") — surfaced as an
  // explicit flag so that threshold lives in one place, not duplicated
  // client-side.
  const response = NextResponse.json({
    ...profile,
    insufficient_data: (profile.weeks_tracked ?? 0) < 3,
  });
  response.headers.set('Cache-Control', STANDARD_CACHE_CONTROL);
  return response;
}

export const GET = withRateLimit(handler);
