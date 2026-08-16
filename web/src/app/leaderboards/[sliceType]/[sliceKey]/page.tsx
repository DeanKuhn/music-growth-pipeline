import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getLeaderboard } from '@/lib/api';
import { SIZE_BANDS, LEADERBOARD_SLICE_TYPES, LEADERBOARD_SLICE_KEYS } from '@/lib/validation';
import { formatListeners, formatPct } from '@/lib/format';

export const revalidate = 86400;

export async function generateStaticParams() {
  const params = [];
  for (const sliceType of LEADERBOARD_SLICE_TYPES) {
    for (const sliceKey of LEADERBOARD_SLICE_KEYS) {
      params.push({ sliceType, sliceKey });
    }
  }
  return params;
}

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sliceType: string; sliceKey: string }>;
}): Promise<Metadata> {
  const { sliceType, sliceKey } = await params;
  const label = SLICE_LABELS[sliceType] ?? sliceType;
  const keyLabel = SLICE_KEY_LABELS[sliceKey] ?? sliceKey;
  return {
    title: `Leaderboards — ${label}`,
    description: `${label} for ${keyLabel} artists on the Last.fm chart.`,
  };
}

export default async function LeaderboardPage({
  params,
}: {
  params: Promise<{ sliceType: string; sliceKey: string }>;
}) {
  const { sliceType, sliceKey } = await params;

  // Guard against invalid segments (e.g. direct URL manipulation)
  if (
    !(LEADERBOARD_SLICE_TYPES as readonly string[]).includes(sliceType) ||
    !(LEADERBOARD_SLICE_KEYS as readonly string[]).includes(sliceKey)
  ) {
    redirect('/leaderboards/fastest_growing_pct/all');
  }

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
            href={`/leaderboards/${encodeURIComponent(st)}/${encodeURIComponent(sliceKey)}`}
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
        {(['all', ...SIZE_BANDS] as const).map((sk) => (
          <Link
            key={sk}
            href={`/leaderboards/${encodeURIComponent(sliceType)}/${encodeURIComponent(sk)}`}
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
