// Server components fetch the app's own /api/* routes rather than querying
// api_* tables directly — the route handlers are the single source of truth
// for each query (and what the "show the SQL" panel mirrors), so pages don't
// duplicate that SQL.

function getBaseUrl(): string {
  // SITE_URL, not VERCEL_URL: Vercel's Deployment Protection blocks
  // unauthenticated requests to every *.vercel.app hostname by default —
  // custom domains are exempt, but VERCEL_URL always points to a protected
  // one. A self-fetch through it gets redirected to Vercel's login page
  // instead of the JSON it asked for, and JSON.parse() on that HTML throws.
  // Set SITE_URL to the public custom domain in Vercel's env vars.
  if (process.env.SITE_URL) return process.env.SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const NUMERIC_STRING = /^-?\d+(\.\d+)?$/;

// The Neon HTTP driver returns Postgres bigint/numeric columns as JSON
// strings (to avoid silent precision loss on huge bigints), not JS numbers.
// Every route handler passes rows straight through, so every numeric-typed
// column in api_* arrives client-side as a string. Chart components call
// .toFixed()/scale math on these values, so coerce them back to numbers
// once here rather than defensively in every consumer. Date strings
// ("2026-05-10") and slugs ("7512-radiohead") don't match the pattern and
// pass through unchanged.
export function coerceNumericStrings<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => coerceNumericStrings(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = coerceNumericStrings(v);
    }
    return out as T;
  }
  if (typeof value === 'string' && NUMERIC_STRING.test(value)) {
    return Number(value) as unknown as T;
  }
  return value;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    // Server-side fetch already inherits the route's own Cache-Control on
    // the client; this just tells Next's fetch cache to behave the same way
    // for prerendering/ISR of these pages.
    next: { revalidate: 3600 },
  });
  if (res.status === 404) throw new ApiError(404, 'not found');
  if (!res.ok) throw new ApiError(res.status, `upstream ${res.status}`);
  const json = await res.json();
  return coerceNumericStrings(json) as T;
}

export interface ArtistProfile {
  artist_id: number;
  display_name: string;
  slug: string;
  is_display_safe: boolean;
  tier: string | null;
  min_page: number | null;
  global_rank: number | null;
  size_band: string | null;
  listener_percentile: number | null;
  genres: string[];
  primary_genre: string | null;
  weeks_tracked: number;
  series_start_date: string | null;
  series_end_date: string | null;
  starting_listeners: number | null;
  latest_listeners: number | null;
  latest_playcount: number | null;
  total_listener_delta: number | null;
  total_pct_growth: number | null;
  avg_weekly_pct_change: number | null;
  pct_rank_in_size_band: number | null;
  pct_rank_in_genre: number | null;
  insufficient_data: boolean;
}

export interface TimeseriesPoint {
  snapshot_date: string;
  week_number: number;
  listeners: number;
  playcount: number;
  listener_delta: number | null;
  listener_pct_change: number | null;
  listeners_indexed: number;
}

export interface TimeseriesResponse {
  artist_id: number;
  series: TimeseriesPoint[];
}

export interface ComparePoint {
  snapshot_date: string;
  week_number: number;
  listeners: number;
  listeners_indexed: number;
  artist_count: number | null;
  p25_indexed: number | null;
  median_indexed: number | null;
  p75_indexed: number | null;
}

export interface CompareResponse {
  artist_id: number;
  vs: 'genre' | 'tier' | 'similar';
  insufficient_data: boolean;
  cohort_available: boolean;
  series: ComparePoint[];
}

export interface SimilarArtist {
  similar_artist_id: number;
  slug: string;
  display_name: string;
  tier: string | null;
  size_band: string | null;
  latest_listeners: number | null;
  total_pct_growth: number | null;
  weeks_tracked: number;
  similarity_score: number;
  rank: number;
}

export interface SimilarResponse {
  artist_id: number;
  similar: SimilarArtist[];
}

export interface SearchResult {
  artist_id: number;
  slug: string;
  display_name: string;
  tier: string | null;
  size_band: string | null;
  latest_listeners: number | null;
  listener_percentile: number | null;
  weeks_tracked: number;
  score: number;
}

export interface SearchSuggestion {
  artist_id: number;
  slug: string;
  display_name: string;
  latest_listeners: number | null;
}

export type SearchResponse =
  | { found: true; results: SearchResult[] }
  | { found: false; suggestions: SearchSuggestion[] };

export interface LeaderboardEntry {
  rank: number;
  metric_value: number;
  artist_id: number;
  slug: string;
  display_name: string;
  tier: string | null;
  size_band: string | null;
  primary_genre: string | null;
  latest_listeners: number | null;
  total_listener_delta: number | null;
  total_pct_growth: number | null;
  weeks_tracked: number;
}

export interface LeaderboardResponse {
  slice_type: string;
  slice_key: string;
  results: LeaderboardEntry[];
}

export interface Genre {
  genre_id: number;
  genre: string;
  artist_count: number;
  avg_listeners: number | null;
  avg_plays_per_listener: number | null;
  mainstream_count: number;
  indie_count: number;
  avg_total_pct_growth: number | null;
  median_total_pct_growth: number | null;
  growth_avg_weekly_pct_change: number | null;
}

export interface GenresResponse {
  genres: Genre[];
}

export interface PipelineHealth {
  artists_total: number;
  artists_mainstream: number;
  artists_indie: number;
  artists_unranked: number;
  artists_with_profile: number;
  artists_searchable: number;
  artists_redacted: number;
  artists_with_genre: number;
  artists_with_similar: number;
  genres_total: number;
  artists_with_history: number;
  snapshot_rows: number;
  snapshot_dates: number;
  first_snapshot_date: string;
  latest_snapshot_date: string;
  days_since_snapshot: number;
  weeks_in_series: number;
  series_start_date: string;
  built_at: string;
}

export function getArtistProfile(slug: string) {
  return getJson<ArtistProfile>(`/api/artists/${slug}`);
}

export function getArtistTimeseries(slug: string) {
  return getJson<TimeseriesResponse>(`/api/artists/${slug}/timeseries`);
}

export function getArtistCompare(slug: string, vs: 'genre' | 'tier' | 'similar') {
  return getJson<CompareResponse>(`/api/artists/${slug}/compare?vs=${vs}`);
}

export function getArtistSimilar(slug: string) {
  return getJson<SimilarResponse>(`/api/artists/${slug}/similar`);
}

export function search(q: string, limit = 10) {
  return getJson<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`);
}

export function getLeaderboard(sliceType: string, sliceKey: string, limit = 20) {
  return getJson<LeaderboardResponse>(
    `/api/leaderboards?slice_type=${sliceType}&slice_key=${sliceKey}&limit=${limit}`
  );
}

export function getGenres() {
  return getJson<GenresResponse>('/api/genres');
}

export function getStats() {
  return getJson<PipelineHealth>('/api/stats');
}
