import { NextRequest, NextResponse } from 'next/server';
import { searchParamsSchema } from '@/lib/validation';
import { querySearch } from '@/lib/queries';
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

  let result;
  try {
    result = await querySearch(q, limit);
  } catch (err) {
    return serverError(err);
  }

  const response = NextResponse.json(result);
  response.headers.set('Cache-Control', SEARCH_CACHE_CONTROL);
  return response;
}

export const GET = withRateLimit(handler);
