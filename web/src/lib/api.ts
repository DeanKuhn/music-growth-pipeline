import { extractArtistIdFromSlug } from '@/lib/validation';
import * as queries from '@/lib/queries';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const NUMERIC_STRING = /^-?\d+(\.\d+)?$/;

export function coerceNumericStrings<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => coerceNumericStrings(v)) as unknown as T;
  }
  if (value instanceof Date) {
    return value;
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

function resolveArtistId(slug: string): number {
  const artistId = extractArtistIdFromSlug(slug);
  if (artistId === null) throw new ApiError(400, 'bad slug');
  return artistId;
}

export interface ArtistProfile {
  artist_id: number;
  display_name: string;
  slug: string;
  is_display_safe: boolean;
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
  vs: 'genre' | 'size_band' | 'similar';
  insufficient_data: boolean;
  cohort_available: boolean;
  series: ComparePoint[];
}

export interface SimilarArtist {
  similar_artist_id: number;
  slug: string;
  display_name: string;
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
  small_count: number;
  large_count: number;
  avg_total_pct_growth: number | null;
  median_total_pct_growth: number | null;
  growth_avg_weekly_pct_change: number | null;
}

export interface GenresResponse {
  genres: Genre[];
}

export interface PipelineHealth {
  artists_total: number;
  artists_lt10k: number;
  artists_10k_50k: number;
  artists_50k_100k: number;
  artists_100k_250k: number;
  artists_250k_500k: number;
  artists_500k_1m: number;
  artists_1m_plus: number;
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

export async function getArtistProfile(slug: string): Promise<ArtistProfile> {
  const artistId = resolveArtistId(slug);
  const row = await queries.queryArtistProfile(artistId);
  if (!row) throw new ApiError(404, 'not found');
  return coerceNumericStrings({
    ...row,
    insufficient_data: (row.weeks_tracked ?? 0) < 3,
  }) as ArtistProfile;
}

export async function getArtistTimeseries(slug: string): Promise<TimeseriesResponse> {
  const artistId = resolveArtistId(slug);
  const rows = await queries.queryArtistTimeseries(artistId);
  if (rows.length === 0 && !(await queries.queryArtistExists(artistId))) {
    throw new ApiError(404, 'not found');
  }
  return { artist_id: artistId, series: coerceNumericStrings(rows) as TimeseriesPoint[] };
}

export async function getArtistCompare(
  slug: string,
  vs: 'genre' | 'size_band' | 'similar'
): Promise<CompareResponse> {
  const artistId = resolveArtistId(slug);
  const profile = await queries.queryArtistProfile(artistId);
  if (!profile) throw new ApiError(404, 'not found');

  let rows;
  if (vs === 'similar') {
    rows = await queries.queryArtistCompareSimilar(artistId);
  } else {
    const cohortKey = vs === 'genre' ? profile.primary_genre : profile.size_band;
    rows = await queries.queryArtistCompareCohort(artistId, vs, cohortKey);
  }

  const cohortAvailable = rows.some(
    (r: Record<string, unknown>) => r.median_indexed !== null
  );

  return coerceNumericStrings({
    artist_id: artistId,
    vs,
    insufficient_data: (profile.weeks_tracked ?? 0) < 3,
    cohort_available: cohortAvailable,
    series: rows,
  }) as CompareResponse;
}

export async function getArtistSimilar(slug: string): Promise<SimilarResponse> {
  const artistId = resolveArtistId(slug);
  const rows = await queries.queryArtistSimilar(artistId);
  if (rows.length === 0 && !(await queries.queryArtistExists(artistId))) {
    throw new ApiError(404, 'not found');
  }
  return { artist_id: artistId, similar: coerceNumericStrings(rows) as SimilarArtist[] };
}

export async function search(q: string, limit = 10): Promise<SearchResponse> {
  const result = await queries.querySearch(q, limit);
  return coerceNumericStrings(result) as SearchResponse;
}

export async function getLeaderboard(
  sliceType: string,
  sliceKey: string,
  limit = 20
): Promise<LeaderboardResponse> {
  const rows = await queries.queryLeaderboard(sliceType, sliceKey, limit);
  return {
    slice_type: sliceType,
    slice_key: sliceKey,
    results: coerceNumericStrings(rows) as LeaderboardEntry[],
  };
}

export async function getGenres(): Promise<GenresResponse> {
  const rows = await queries.queryGenres();
  return { genres: coerceNumericStrings(rows) as Genre[] };
}

export async function getStats(): Promise<PipelineHealth> {
  const row = await queries.queryStats();
  if (!row) throw new ApiError(404, 'no stats');
  return coerceNumericStrings(row) as PipelineHealth;
}
