import { NextRequest, NextResponse } from 'next/server';
import { extractArtistIdFromSlug, compareTargetSchema } from '@/lib/validation';
import {
  queryArtistProfile,
  queryArtistCompareSimilar,
  queryArtistCompareCohort,
} from '@/lib/queries';
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

  let profile;
  try {
    profile = await queryArtistProfile(artistId);
  } catch (err) {
    return serverError(err);
  }
  if (!profile) return notFound();

  let rows;
  try {
    if (vs === 'similar') {
      rows = await queryArtistCompareSimilar(artistId);
    } else {
      const cohortKey = vs === 'genre' ? profile.primary_genre : profile.size_band;
      rows = await queryArtistCompareCohort(artistId, vs, cohortKey);
    }
  } catch (err) {
    return serverError(err);
  }

  const cohortAvailable = rows.some((r: Record<string, unknown>) => r.median_indexed !== null);

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
