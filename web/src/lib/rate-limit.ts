import { NextRequest, NextResponse } from 'next/server';
import { assertReadonlyRole } from './db';
import { serverError } from './errors';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

interface LimitResult {
  success: boolean;
  remaining: number;
  reset: number; // epoch ms
  limit: number;
}

interface RateLimiter {
  limit(key: string): Promise<LimitResult>;
}

// In-memory sliding window. Per-instance and trivially bypassed by
// concurrency on a horizontally-scaled runtime — the plan calls this a
// fallback, not the real limiter. Upstash is the real one; this is what we
// run until that account exists (2026-08-05 decision).
class MemoryLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  async limit(key: string): Promise<LimitResult> {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;
    const existing = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    existing.push(now);
    this.hits.set(key, existing);

    // Bound memory: an unbounded Map on a long-lived instance is its own
    // small DoS surface. Cheap periodic sweep piggybacked on request traffic.
    if (this.hits.size > 10_000) {
      for (const [k, timestamps] of this.hits) {
        if (timestamps.every((t) => t <= windowStart)) this.hits.delete(k);
      }
    }

    const remaining = Math.max(0, MAX_REQUESTS - existing.length);
    return {
      success: existing.length <= MAX_REQUESTS,
      remaining,
      reset: windowStart + WINDOW_MS,
      limit: MAX_REQUESTS,
    };
  }
}

const memoryLimiter = new MemoryLimiter();

// Single swap point for Upstash: once UPSTASH_REDIS_REST_URL/TOKEN exist,
// replace this function's body with an @upstash/ratelimit-backed limiter
// (sliding window, 30/60s) and wrap its .limit() call in the same try/catch
// pattern used in withRateLimit below, so a Redis error still falls open to
// memoryLimiter rather than taking the site down.
function getLimiter(): RateLimiter {
  return memoryLimiter;
}

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

async function hashIp(ip: string): Promise<string> {
  const salt = process.env.IP_HASH_SALT ?? '';
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ctx is typed `any` here, not `unknown`: Next's generated route-handler
// types (per-route `{ params: {...} }` shapes) are stricter than this
// generic wrapper can express, and `unknown` would make every wrapped
// handler fail assignability under strictFunctionTypes.
type RouteHandler = (req: NextRequest, ctx: any) => Promise<NextResponse>;

// Wraps every route so none can forget rate limiting. A limiter error (a
// thrown exception from getLimiter().limit()) fails OPEN — the request is
// allowed through unlimited rather than the site going down because Redis
// hiccuped. This matters more once getLimiter() returns an Upstash-backed
// limiter that can actually fail over the network; the memory limiter today
// doesn't throw, but the wrapper is written for the limiter it will become.
export function withRateLimit(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    // Fails CLOSED, unlike the rate limiter below — a role mismatch means
    // this instance may be holding write credentials, which is worse than
    // downtime. See db.ts: catches a wrong-but-different connection string
    // that the literal DATABASE_URL_READONLY === DATABASE_URL check can't.
    try {
      await assertReadonlyRole();
    } catch (err) {
      return serverError(err);
    }

    const ip = getClientIp(req);
    const key = await hashIp(ip);

    let result: LimitResult;
    try {
      result = await getLimiter().limit(key);
    } catch (err) {
      console.error('rate limiter error, failing open', err);
      result = { success: true, remaining: MAX_REQUESTS, reset: Date.now() + WINDOW_MS, limit: MAX_REQUESTS };
    }

    if (!result.success) {
      const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSeconds),
            'X-RateLimit-Limit': String(result.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(result.reset),
          },
        }
      );
    }

    const response = await handler(req, ctx);
    response.headers.set('X-RateLimit-Limit', String(result.limit));
    response.headers.set('X-RateLimit-Remaining', String(result.remaining));
    response.headers.set('X-RateLimit-Reset', String(result.reset));
    return response;
  };
}
