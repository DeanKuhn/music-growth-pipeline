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
