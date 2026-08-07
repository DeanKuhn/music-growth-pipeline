import Link from 'next/link';
import { SearchBar } from '@/components/SearchBar';
import { StatTile, StatTileGrid } from '@/components/StatTile';
import { getStats } from '@/lib/api';
import { formatListeners, formatDate } from '@/lib/format';

export const revalidate = 3600;

export default async function HomePage() {
  const stats = await getStats().catch(() => null);

  return (
    <div className="container" style={{ paddingTop: 56, paddingBottom: 40 }}>
      <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 34, lineHeight: 1.2, margin: '0 0 12px' }}>
          Does charting predict listener growth?
        </h1>
        <p className="secondary" style={{ fontSize: 16, margin: '0 0 28px' }}>
          Longitudinal Last.fm listener data for {stats ? formatListeners(stats.artists_total) : 'thousands of'}{' '}
          independent artists. Search one, and see it compared to its genre, its size band, and artists like it.
        </p>
        <SearchBar autoFocus />
      </div>

      <div style={{ maxWidth: 640, margin: '40px auto 0' }}>
        <p className="muted" style={{ fontSize: 13, textAlign: 'center', margin: '0 0 12px' }}>
          Try one of these, or browse{' '}
          <Link href="/leaderboards" style={{ textDecoration: 'underline' }}>
            leaderboards
          </Link>{' '}
          and{' '}
          <Link href="/genres" style={{ textDecoration: 'underline' }}>
            genres
          </Link>
          .
        </p>
      </div>

      {stats && (
        <div style={{ maxWidth: 760, margin: '48px auto 0' }}>
          <StatTileGrid>
            <StatTile label="Artists tracked" value={formatListeners(stats.artists_total)} />
            <StatTile label="Genres" value={String(stats.genres_total)} />
            <StatTile
              label="Weeks in series"
              value={String(stats.weeks_in_series)}
              sub={`since ${formatDate(stats.series_start_date)}`}
            />
            <StatTile
              label="Latest snapshot"
              value={formatDate(stats.latest_snapshot_date)}
              sub={stats.days_since_snapshot > 7 ? 'update overdue' : 'up to date'}
            />
          </StatTileGrid>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 48 }}>
        Headline finding: median 13-week growth falls monotonically with starting listener size. Read the{' '}
        <Link href="/how-it-works" style={{ textDecoration: 'underline' }}>
          methodology
        </Link>
        .
      </p>
    </div>
  );
}
