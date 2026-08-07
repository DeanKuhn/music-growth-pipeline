import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getGenres } from '@/lib/api';
import { StatTile, StatTileGrid } from '@/components/StatTile';
import { formatListeners, formatPct } from '@/lib/format';

export const revalidate = 3600;

export async function generateStaticParams() {
  try {
    const { genres } = await getGenres();
    return genres.map((g) => ({ g: g.genre }));
  } catch {
    return [];
  }
}

async function findGenre(g: string) {
  const { genres } = await getGenres();
  return genres.find((x) => x.genre.toLowerCase() === decodeURIComponent(g).toLowerCase()) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ g: string }>;
}): Promise<Metadata> {
  const { g } = await params;
  const genre = await findGenre(g);
  return { title: genre ? genre.genre : 'Genre' };
}

export default async function GenrePage({ params }: { params: Promise<{ g: string }> }) {
  const { g } = await params;
  const genre = await findGenre(g);
  if (!genre) notFound();

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 40 }}>
      <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
        <Link href="/genres" style={{ textDecoration: 'underline' }}>
          Genres
        </Link>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 20, textTransform: 'capitalize' }}>{genre.genre}</h1>

      <StatTileGrid>
        <StatTile label="Artists" value={String(genre.artist_count)} />
        <StatTile label="Avg listeners" value={formatListeners(genre.avg_listeners)} />
        <StatTile label="Small (<250k)" value={String(genre.small_count)} />
        <StatTile label="Large (≥250k)" value={String(genre.large_count)} />
      </StatTileGrid>

      <div className="card" style={{ padding: 20, marginTop: 20 }}>
        <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Growth</h2>
        {genre.median_total_pct_growth !== null ? (
          <StatTileGrid>
            <StatTile label="Median 13-wk growth" value={formatPct(genre.median_total_pct_growth, { signed: true })} />
            <StatTile label="Average 13-wk growth" value={formatPct(genre.avg_total_pct_growth, { signed: true })} />
            <StatTile
              label="Avg weekly change"
              value={formatPct(genre.growth_avg_weekly_pct_change, { signed: true })}
            />
          </StatTileGrid>
        ) : (
          <p className="muted" style={{ fontSize: 14 }}>
            Not enough qualifying artists yet (needs ≥6 weeks tracked and ≥50 artists) for a growth figure.
          </p>
        )}
      </div>

      <p className="muted" style={{ fontSize: 13, marginTop: 20 }}>
        Search for an artist and check its genre chips to browse within {genre.genre}.
      </p>
    </div>
  );
}
