// Data changes once a week (the Sunday snapshot), so cache like it. This is
// the primary defence for Neon's cold starts and free-tier compute hours —
// most requests should never reach the database at all.
export const STANDARD_CACHE_CONTROL =
  'public, s-maxage=3600, stale-while-revalidate=86400';

// Search results churn more (autocomplete-as-you-type), so a shorter floor.
export const SEARCH_CACHE_CONTROL =
  'public, s-maxage=600, stale-while-revalidate=86400';

export function withCacheHeaders(response: Response, cacheControl: string): Response {
  response.headers.set('Cache-Control', cacheControl);
  return response;
}
