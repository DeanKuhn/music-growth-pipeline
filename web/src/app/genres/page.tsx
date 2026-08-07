import Link from 'next/link';
import type { Metadata } from 'next';
import { getGenres } from '@/lib/api';
import { formatListeners, formatPct } from '@/lib/format';

// Not statically prerendered: a build has no live deployment yet for this
// page's self-fetch (getGenres -> /api/genres) to hit, unlike
// /artist/[slug] and /genres/[g] whose generateStaticParams falls back to
// [] on that same failure. Rendered per-request instead; the underlying
// fetch still carries next:{revalidate:3600} (see lib/api.ts) and the
// /api/genres route's own Cache-Control, so this doesn't add real load.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Genres',
  description: 'Artist counts, average listeners, and growth by genre.',
};

export default async function GenresPage() {
  const { genres } = await getGenres();

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 40 }}>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>Genres</h1>
      <p className="secondary" style={{ marginBottom: 20 }}>
        {genres.length} genres, ranked by average listener count.
      </p>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ fontSize: 14 }}>
          <thead>
            <tr className="muted" style={{ fontSize: 12, textAlign: 'left' }}>
              <th style={{ padding: '10px 12px' }}>Genre</th>
              <th style={{ padding: '10px 12px' }}>Artists</th>
              <th style={{ padding: '10px 12px' }}>Avg listeners</th>
              <th style={{ padding: '10px 12px' }}>Mainstream / Indie</th>
              <th style={{ padding: '10px 12px' }}>Median 13-wk growth</th>
            </tr>
          </thead>
          <tbody>
            {genres.map((g) => (
              <tr key={g.genre_id} style={{ borderTop: '1px solid var(--gridline)' }}>
                <td style={{ padding: '10px 12px' }}>
                  <Link
                    href={`/genres/${encodeURIComponent(g.genre)}`}
                    style={{ textDecoration: 'none', fontWeight: 500 }}
                  >
                    {g.genre}
                  </Link>
                </td>
                <td className="tabular" style={{ padding: '10px 12px' }}>
                  {g.artist_count}
                </td>
                <td className="tabular" style={{ padding: '10px 12px' }}>
                  {formatListeners(g.avg_listeners)}
                </td>
                <td className="tabular secondary" style={{ padding: '10px 12px' }}>
                  {g.mainstream_count} / {g.indie_count}
                </td>
                <td className="tabular" style={{ padding: '10px 12px' }}>
                  {formatPct(g.median_total_pct_growth, { signed: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
