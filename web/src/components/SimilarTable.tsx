import Link from 'next/link';
import type { SimilarArtist } from '@/lib/api';
import { formatListeners, formatPct } from '@/lib/format';

// A true per-row sparkline needs that artist's own weekly series — 20 extra
// timeseries queries per page view, which defeats the point of a serving
// layer sized for a 5s statement_timeout on free-tier Neon. total_pct_growth
// is already on api_artist_similar, so a growth bar (signed, capped at
// +/-50% for legibility) gives the same "who's moving" read for one column
// read instead of twenty queries.
function GrowthBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="muted">—</span>;
  const capped = Math.max(-50, Math.min(50, pct));
  const width = Math.abs(capped) / 50 * 50; // % of half-track
  const positive = pct >= 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 70, height: 6, background: 'var(--gridline)', borderRadius: 3, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: positive ? '50%' : `${50 - width}%`,
            width: `${width}%`,
            background: positive ? 'var(--good-status)' : 'var(--critical)',
            borderRadius: 3,
          }}
        />
        <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: 'var(--baseline)' }} />
      </div>
      <span className="tabular" style={{ fontSize: 13, color: positive ? 'var(--good)' : 'var(--critical)' }}>
        {formatPct(pct, { signed: true })}
      </span>
    </div>
  );
}

export function SimilarTable({ similar }: { similar: SimilarArtist[] }) {
  if (similar.length === 0) {
    return (
      <p className="muted" style={{ fontSize: 14 }}>
        No similar artists on file yet for this one.
      </p>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ fontSize: 14 }}>
        <thead>
          <tr className="muted" style={{ fontSize: 12, textAlign: 'left' }}>
            <th style={{ padding: '6px 8px' }}>Artist</th>
            <th style={{ padding: '6px 8px' }}>Size band</th>
            <th style={{ padding: '6px 8px' }}>Listeners</th>
            <th style={{ padding: '6px 8px' }}>13-week growth</th>
          </tr>
        </thead>
        <tbody>
          {similar.map((s) => (
            <tr key={s.similar_artist_id} style={{ borderTop: '1px solid var(--gridline)' }}>
              <td style={{ padding: '8px' }}>
                <Link href={`/artist/${s.slug}`} style={{ textDecoration: 'none', fontWeight: 500 }}>
                  {s.display_name}
                </Link>
              </td>
              <td style={{ padding: '8px' }} className="secondary">
                {s.size_band ?? '—'}
              </td>
              <td style={{ padding: '8px' }} className="tabular">
                {formatListeners(s.latest_listeners)}
              </td>
              <td style={{ padding: '8px' }}>
                <GrowthBar pct={s.total_pct_growth} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
