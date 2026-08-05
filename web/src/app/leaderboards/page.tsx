import Link from 'next/link';
import type { Metadata } from 'next';
import { getLeaderboard } from '@/lib/api';
import { SIZE_BANDS, LEADERBOARD_SLICE_TYPES } from '@/lib/validation';
import { formatListeners, formatPct, formatTier } from '@/lib/format';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Leaderboards',
  description: 'Fastest-growing artists, biggest listener gains, and most-listened artists by size tier.',
};

const SLICE_LABELS: Record<string, string> = {
  fastest_growing_pct: 'Fastest growing (% change)',
  biggest_listener_gain: 'Biggest listener gain',
  most_listeners: 'Most listeners',
};

const SLICE_KEY_LABELS: Record<string, string> = {
  all: 'All sizes',
  '<10k': 'Under 10k',
  '10k-50k': '10k–50k',
  '50k-100k': '50k–100k',
  '100k-250k': '100k–250k',
  '250k-500k': '250k–500k',
  '500k-1M': '500k–1M',
  '1M+': '1M+',
};

function isSliceType(v: string): v is (typeof LEADERBOARD_SLICE_TYPES)[number] {
  return (LEADERBOARD_SLICE_TYPES as readonly string[]).includes(v);
}

function isSliceKey(v: string): boolean {
  return v === 'all' || (SIZE_BANDS as readonly string[]).includes(v);
}

export default async function LeaderboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ slice_type?: string; slice_key?: string }>;
}) {
  const sp = await searchParams;
  const sliceType = sp.slice_type && isSliceType(sp.slice_type) ? sp.slice_type : 'fastest_growing_pct';
  const sliceKey = sp.slice_key && isSliceKey(sp.slice_key) ? sp.slice_key : 'all';

  const board = await getLeaderboard(sliceType, sliceKey, 50).catch(() => null);

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 40 }}>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>Leaderboards</h1>
      <p className="secondary" style={{ marginBottom: 20 }}>
        Requires the full 13-week window and at least 1,000 starting listeners, so a 3→9 listener jump can&apos;t
        top the percentage board.
      </p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {LEADERBOARD_SLICE_TYPES.map((st) => (
          <Link
            key={st}
            href={`/leaderboards?slice_type=${st}&slice_key=${sliceKey}`}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              border: '1px solid var(--border-strong)',
              background: st === sliceType ? 'var(--series-1)' : 'transparent',
              color: st === sliceType ? '#fff' : 'var(--text-secondary)',
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            {SLICE_LABELS[st]}
          </Link>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
        {['all', ...SIZE_BANDS].map((sk) => (
          <Link
            key={sk}
            href={`/leaderboards?slice_type=${sliceType}&slice_key=${sk}`}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: sk === sliceKey ? 'var(--gridline)' : 'transparent',
              color: 'var(--text-secondary)',
              fontSize: 12,
              textDecoration: 'none',
            }}
          >
            {SLICE_KEY_LABELS[sk] ?? sk}
          </Link>
        ))}
      </div>

      {!board || board.results.length === 0 ? (
        <p className="muted">No results for this slice.</p>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ fontSize: 14 }}>
            <thead>
              <tr className="muted" style={{ fontSize: 12, textAlign: 'left' }}>
                <th style={{ padding: '10px 12px' }}>#</th>
                <th style={{ padding: '10px 12px' }}>Artist</th>
                <th style={{ padding: '10px 12px' }}>Tier</th>
                <th style={{ padding: '10px 12px' }}>Genre</th>
                <th style={{ padding: '10px 12px' }}>Listeners</th>
                <th style={{ padding: '10px 12px' }}>Growth</th>
              </tr>
            </thead>
            <tbody>
              {board.results.map((r) => (
                <tr key={r.artist_id} style={{ borderTop: '1px solid var(--gridline)' }}>
                  <td className="tabular muted" style={{ padding: '10px 12px' }}>
                    {r.rank}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <Link href={`/artist/${r.slug}`} style={{ textDecoration: 'none', fontWeight: 500 }}>
                      {r.display_name}
                    </Link>
                  </td>
                  <td className="secondary" style={{ padding: '10px 12px' }}>
                    {formatTier(r.tier)}
                  </td>
                  <td className="secondary" style={{ padding: '10px 12px' }}>
                    {r.primary_genre ?? '—'}
                  </td>
                  <td className="tabular" style={{ padding: '10px 12px' }}>
                    {formatListeners(r.latest_listeners)}
                  </td>
                  <td className="tabular" style={{ padding: '10px 12px' }}>
                    {sliceType === 'biggest_listener_gain'
                      ? formatListeners(r.total_listener_delta) + ' new'
                      : formatPct(r.total_pct_growth, { signed: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
