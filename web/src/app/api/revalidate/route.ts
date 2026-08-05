import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

export const runtime = 'edge';

// Called by the weekly workflow right after generate_stats.py. Today none
// of the api_* routes read through Next's fetch/Data Cache (they hit
// Postgres directly and cache via a manual Cache-Control header instead —
// see lib/cache.ts), so this revalidateTag call currently has nothing to
// invalidate. It's wired up now so the day a route opts into the 'marts'
// tag, this endpoint starts doing real work with no workflow change needed.
// Until then, freshness is bounded by that header's s-maxage (1 hour), not
// "seconds after the pipeline runs."
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const bytesA = new Uint8Array(digestA);
  const bytesB = new Uint8Array(digestB);
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) {
    diff |= bytesA[i]! ^ bytesB[i]!;
  }
  return diff === 0;
}

export async function POST(req: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  const provided = req.nextUrl.searchParams.get('secret') ?? '';
  if (!(await timingSafeEqual(provided, expected))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  revalidateTag('marts');
  return NextResponse.json({ revalidated: true, now: Date.now() });
}
