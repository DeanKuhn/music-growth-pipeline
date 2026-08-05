import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  ApiError,
  getArtistProfile,
  getArtistTimeseries,
  getArtistCompare,
  getArtistSimilar,
  getLeaderboard,
  type CompareResponse,
} from '@/lib/api';
import { StatTile, StatTileGrid } from '@/components/StatTile';
import { GrowthChart } from '@/components/GrowthChart';
import { CompareChart } from '@/components/CompareChart';
import { SimilarTable } from '@/components/SimilarTable';
import { GenreChips } from '@/components/GenreChips';
import { PercentileCallout } from '@/components/PercentileCallout';
import { InsufficientData } from '@/components/InsufficientData';
import { SqlDisclosure } from '@/components/SqlDisclosure';
import {
  SQL_PROFILE,
  SQL_TIMESERIES,
  SQL_COMPARE_GENRE_TIER,
  SQL_COMPARE_SIMILAR,
  SQL_SIMILAR,
} from '@/lib/sql-snippets';
import { formatListeners, formatPct, formatTier, formatDate } from '@/lib/format';

export const revalidate = 3600;

export async function generateStaticParams() {
  try {
    const board = await getLeaderboard('most_listeners', 'all', 100);
    return board.results.map((r) => ({ slug: r.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const profile = await getArtistProfile(slug);
    return {
      title: profile.display_name,
      description: `Listener growth for ${profile.display_name} on Last.fm — ${formatListeners(
        profile.latest_listeners
      )} listeners, ${formatTier(profile.tier)} tier.`,
    };
  } catch {
    return { title: 'Artist' };
  }
}

export default async function ArtistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let profile;
  try {
    profile = await getArtistProfile(slug);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const [timeseries, similar, compareGenre, compareTier, compareSimilar] = await Promise.all([
    getArtistTimeseries(slug).catch(() => ({ artist_id: profile.artist_id, series: [] })),
    getArtistSimilar(slug).catch(() => ({ artist_id: profile.artist_id, similar: [] })),
    getArtistCompare(slug, 'genre').catch((): CompareResponse | null => null),
    getArtistCompare(slug, 'tier').catch((): CompareResponse | null => null),
    getArtistCompare(slug, 'similar').catch((): CompareResponse | null => null),
  ]);

  const compareData = { genre: compareGenre, tier: compareTier, similar: compareSimilar };

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 40 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, margin: '0 0 6px' }}>{profile.display_name}</h1>
        <div className="secondary" style={{ fontSize: 14, marginBottom: 10 }}>
          {formatTier(profile.tier)}
          {profile.size_band && <> · {profile.size_band} listeners</>}
          {profile.global_rank && <> · chart rank #{profile.global_rank}</>}
        </div>
        <GenreChips genres={profile.genres} />
      </div>

      <StatTileGrid>
        <StatTile label="Listeners" value={formatListeners(profile.latest_listeners)} />
        <StatTile
          label="13-week growth"
          value={formatPct(profile.total_pct_growth, { signed: true })}
          sub={profile.total_listener_delta !== null ? `${formatListeners(profile.total_listener_delta)} new` : undefined}
        />
        <StatTile label="Weeks tracked" value={String(profile.weeks_tracked)} sub={`since ${formatDate(profile.series_start_date)}`} />
        <StatTile label="Avg weekly change" value={formatPct(profile.avg_weekly_pct_change, { signed: true })} />
      </StatTileGrid>

      {profile.insufficient_data && (
        <div style={{ marginTop: 24 }}>
          <InsufficientData weeksTracked={profile.weeks_tracked} seriesStartDate={profile.series_start_date} />
        </div>
      )}

      {!profile.insufficient_data && (
        <>
          <section className="card" style={{ padding: 20, marginTop: 24 }}>
            <GrowthChart series={timeseries.series} />
            <SqlDisclosure label="listener growth" sql={SQL_TIMESERIES} />
          </section>

          <section className="card" style={{ padding: 20, marginTop: 20 }}>
            <h2 style={{ fontSize: 17, margin: '0 0 12px' }}>Compared to its peers</h2>
            <CompareChart data={compareData} />
            <SqlDisclosure
              label="cohort comparison"
              sql={compareData.similar?.series.length ? SQL_COMPARE_SIMILAR : SQL_COMPARE_GENRE_TIER}
            />
          </section>

          <div style={{ marginTop: 20 }}>
            <PercentileCallout
              pctRankInSizeBand={profile.pct_rank_in_size_band}
              pctRankInGenre={profile.pct_rank_in_genre}
              primaryGenre={profile.primary_genre}
            />
          </div>
        </>
      )}

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 17, margin: '0 0 12px' }}>Similar artists</h2>
        <SimilarTable similar={similar.similar} />
        <SqlDisclosure label="similar artists" sql={SQL_SIMILAR} />
      </section>

      <section style={{ marginTop: 28 }}>
        <SqlDisclosure label="this artist's profile" sql={SQL_PROFILE} />
      </section>
    </div>
  );
}
