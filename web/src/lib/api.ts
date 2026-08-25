import { extractArtistIdFromSlug } from '@/lib/validation';
import * as queries from '@/lib/queries';
import {
  ApiError,
  coerceNumericStrings,
  type ArtistProfile,
  type TimeseriesPoint,
  type TimeseriesResponse,
  type CompareResponse,
  type SimilarArtist,
  type SimilarResponse,
  type SearchResponse,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type Genre,
  type GenresResponse,
  type PipelineHealth,
} from '@/lib/api-types';

export {
  ApiError,
  coerceNumericStrings,
  type ArtistProfile,
  type TimeseriesPoint,
  type TimeseriesResponse,
  type CompareResponse,
  type SimilarArtist,
  type SimilarResponse,
  type SearchResponse,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type Genre,
  type GenresResponse,
  type PipelineHealth,
} from '@/lib/api-types';

export type { ComparePoint, SearchResult, SearchSuggestion } from '@/lib/api-types';

function resolveArtistId(slug: string): number {
  const artistId = extractArtistIdFromSlug(slug);
  if (artistId === null) throw new ApiError(400, 'bad slug');
  return artistId;
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
