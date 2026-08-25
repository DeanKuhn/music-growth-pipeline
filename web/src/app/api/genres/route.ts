import { NextRequest, NextResponse } from 'next/server';
import { queryGenres } from '@/lib/queries';
import { serverError } from '@/lib/errors';
import { STANDARD_CACHE_CONTROL } from '@/lib/cache';
import { withRateLimit } from '@/lib/rate-limit';

export const runtime = 'edge';

async function handler(_req: NextRequest) {
  let rows;
  try {
    rows = await queryGenres();
  } catch (err) {
    return serverError(err);
  }

  const response = NextResponse.json({ genres: rows });
  response.headers.set('Cache-Control', STANDARD_CACHE_CONTROL);
  return response;
}

export const GET = withRateLimit(handler);
