import { NextRequest, NextResponse } from 'next/server';
import { leaderboardParamsSchema } from '@/lib/validation';
import { queryLeaderboard } from '@/lib/queries';
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
    rows = await queryLeaderboard(slice_type, slice_key, limit);
  } catch (err) {
    return serverError(err);
  }

  const response = NextResponse.json({ slice_type, slice_key, results: rows });
  response.headers.set('Cache-Control', STANDARD_CACHE_CONTROL);
  return response;
}

export const GET = withRateLimit(handler);
