import { z } from 'zod';

// --- Frozen whitelists ------------------------------------------------
// Identifiers and ORDER BY targets can't be parameterised in tagged-template
// SQL, so every value that ends up in a sort key or a WHERE-clause enum goes
// through one of these maps instead of a free-form string. Values below are
// taken from the actual dbt model output, not the plan prose — see
// dbt/models/api/*.sql and CLAUDE.md's size_band cut points.

export const SIZE_BANDS = [
  '<10k',
  '10k-50k',
  '50k-100k',
  '100k-250k',
  '250k-500k',
  '500k-1M',
  '1M+',
] as const;

export const LEADERBOARD_SLICE_TYPES = [
  'fastest_growing_pct',
  'biggest_listener_gain',
  'most_listeners',
] as const;

// api_leaderboard.slice_key is 'all' or a size_band.
export const LEADERBOARD_SLICE_KEYS = ['all', ...SIZE_BANDS] as const;

// GET /artists/[slug]/compare?vs= — 'genre' and 'size_band' map 1:1 to
// api_cohort_weekly.cohort_type. 'similar' doesn't touch api_cohort_weekly at
// all — it's a different query against api_artist_similar, branched on in the
// route handler.
export const COMPARE_TARGETS = ['genre', 'size_band', 'similar'] as const;

// --- Shared primitives --------------------------------------------------

// Missing param -> fallback default. Present-but-invalid (non-numeric, out
// of range) -> validation failure, so the route 400s instead of silently
// clamping. The plan's checklist depends on this: `?limit=99999` must 400,
// not quietly serve the fallback.
export const limitSchema = (max: number, fallback: number) =>
  z.coerce.number().int().positive().max(max).optional().default(fallback);

export const offsetSchema = z.coerce.number().int().nonnegative().optional().default(0);

export const artistIdSchema = z.coerce.number().int().positive();

// % and _ are LIKE metacharacters and this string gets interpolated into
// `name_norm LIKE ${q} || '%'` — letting them through changes the query's
// semantics (e.g. `q='%'` degrades toward a full scan) rather than just
// failing to match. Reject them outright instead of escaping, since they're
// never meaningful in an artist name search.
export const searchQuerySchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .refine((s) => !/[%_]/.test(s), 'query must not contain wildcard characters');

export const sizeBandSchema = z.enum(SIZE_BANDS);
export const leaderboardSliceTypeSchema = z.enum(LEADERBOARD_SLICE_TYPES);
export const leaderboardSliceKeySchema = z.enum(LEADERBOARD_SLICE_KEYS);
export const compareTargetSchema = z.enum(COMPARE_TARGETS);

// Slugs are `{id}-{name-slugified}`; lookups always go by the integer PK, so
// only the leading digits matter and the rest of the slug is cosmetic.
export function extractArtistIdFromSlug(slug: string): number | null {
  const match = /^(\d+)(?:-.*)?$/.exec(slug);
  if (!match) return null;
  const parsed = artistIdSchema.safeParse(match[1]);
  return parsed.success ? parsed.data : null;
}

// --- Per-route schemas ----------------------------------------------------

export const searchParamsSchema = z.object({
  q: searchQuerySchema,
  limit: limitSchema(25, 10),
});

export const timeseriesParamsSchema = z.object({
  slug: z.string().min(1),
});

export const compareParamsSchema = z.object({
  slug: z.string().min(1),
  vs: compareTargetSchema,
});

export const similarParamsSchema = z.object({
  slug: z.string().min(1),
});

export const leaderboardParamsSchema = z.object({
  slice_type: leaderboardSliceTypeSchema,
  slice_key: leaderboardSliceKeySchema.default('all'),
  limit: limitSchema(50, 20),
});
