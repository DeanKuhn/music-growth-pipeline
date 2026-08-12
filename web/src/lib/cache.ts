export const STANDARD_CACHE_CONTROL =
  'public, s-maxage=86400, stale-while-revalidate=604800';

export const SEARCH_CACHE_CONTROL =
  'public, s-maxage=3600, stale-while-revalidate=86400';

export function withCacheHeaders(response: Response, cacheControl: string): Response {
  response.headers.set('Cache-Control', cacheControl);
  return response;
}
