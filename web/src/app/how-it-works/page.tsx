import type { Metadata } from 'next';
import { getStats } from '@/lib/api';
import { ArchitectureDiagram } from '@/components/ArchitectureDiagram';
import { StatTile, StatTileGrid } from '@/components/StatTile';
import { formatDate } from '@/lib/format';
import { repoFile } from '@/lib/repo';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'How it works',
  description: 'Architecture, data pipeline, and methodology behind the growth data.',
};

const DAG_LAYERS: { layer: string; models: { name: string; path: string; note: string }[] }[] = [
  {
    layer: 'staging',
    models: [
      { name: 'stg_artist_snapshots', path: 'dbt/models/staging/stg_artist_snapshots.sql', note: 'one row per artist per week' },
      { name: 'stg_weekly_charts', path: 'dbt/models/staging/stg_weekly_charts.sql', note: 'chart page/rank' },
      { name: 'stg_genre_artists', path: 'dbt/models/staging/stg_genre_artists.sql', note: 'artist ↔ genre tag' },
    ],
  },
  {
    layer: 'intermediate',
    models: [
      { name: 'int_artist_base', path: 'dbt/models/intermediate/int_artist_base.sql', note: 'profanity filter applied once, at the source' },
    ],
  },
  {
    layer: 'marts',
    models: [
      { name: 'artist_growth_summary', path: 'dbt/models/marts/artist_growth_summary.sql', note: 'first/last listener counts, total growth' },
      { name: 'artist_chart_position', path: 'dbt/models/marts/artist_chart_position.sql', note: 'raw chart page/rank stats, left-joined so ~17k uncharted artists still get a profile — not used for size classification' },
      { name: 'listener_growth', path: 'dbt/models/marts/listener_growth.sql', note: 'week-over-week deltas' },
      { name: 'genre_stats', path: 'dbt/models/marts/genre_stats.sql', note: 'per-genre aggregates' },
    ],
  },
  {
    layer: 'api (serving layer)',
    models: [
      { name: 'api_artist_profile', path: 'dbt/models/api/api_artist_profile.sql', note: 'one narrow, pre-joined, pre-indexed row per artist' },
      { name: 'api_artist_timeseries', path: 'dbt/models/api/api_artist_timeseries.sql', note: 'listeners_indexed to 100 at first observation' },
      { name: 'api_cohort_weekly', path: 'dbt/models/api/api_cohort_weekly.sql', note: 'precomputed median/p25/p75 per cohort per week' },
    ],
  },
];

export default async function HowItWorksPage() {
  const stats = await getStats().catch(() => null);

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 40 }}>
      <h1 style={{ fontSize: 26, marginBottom: 20 }}>How it works</h1>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 17, marginBottom: 12 }}>Architecture</h2>
        <div style={{ overflowX: 'auto' }}>
          <ArchitectureDiagram />
        </div>
      </section>

      {stats && (
        <section className="card" style={{ padding: 20, marginBottom: 32 }}>
          <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>Pipeline freshness</h2>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            Live from <code>/api/stats</code>. Measured against the latest snapshot date, not the dbt run — a
            rebuild over failed ingestion still reads as stale.
          </p>
          <StatTileGrid>
            <StatTile
              label="Latest snapshot"
              value={formatDate(stats.latest_snapshot_date)}
              sub={stats.days_since_snapshot > 7 ? `${stats.days_since_snapshot}d ago — overdue` : `${stats.days_since_snapshot}d ago`}
            />
            <StatTile label="Weeks in series" value={String(stats.weeks_in_series)} />
            <StatTile label="Artists tracked" value={String(stats.artists_total)} />
            <StatTile label="Redacted names" value={String(stats.artists_redacted)} sub="profanity-filtered" />
          </StatTileGrid>
        </section>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 17, marginBottom: 12 }}>The dbt DAG</h2>
        <p className="secondary" style={{ fontSize: 14, marginBottom: 16 }}>
          Staging views normalize raw ingestion tables. Marts do the general-purpose analytical joins. The{' '}
          <code>api/</code> layer is narrow, pre-joined, and pre-indexed on purpose — the app never queries the
          marts directly.
        </p>
        {DAG_LAYERS.map((l) => (
          <div key={l.layer} style={{ marginBottom: 16 }}>
            <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
              {l.layer}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
              {l.models.map((m) => (
                <li key={m.name} style={{ marginBottom: 4 }}>
                  <a href={repoFile(m.path)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
                    <code>{m.name}</code>
                  </a>{' '}
                  <span className="secondary">— {m.note}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 17, marginBottom: 12 }}>Methodology &amp; caveats</h2>
        <div className="card" style={{ padding: 20, fontSize: 14, lineHeight: 1.7 }}>
          <p>
            <strong>Listener counts are cumulative all-time</strong>, not active listeners — Last.fm&apos;s{' '}
            <code>artist.getInfo</code> returns a running total, so &quot;growth&quot; here means new scrobblers
            discovering an artist, not a change in how many people are currently listening. This can only go up.
          </p>
          <p>
            <strong>Headline finding:</strong> median 13-week growth falls monotonically with starting listener
            size — 2.67% / 2.46% / 2.10% / 1.76% / 1.71% from smallest to largest quintile, across 22,201 artists.
            An earlier claim that growth increases with chart page depth was retracted after re-analysis — smaller
            starting size, not chart depth, is what predicts higher growth.
          </p>
          <p>
            <strong>Size is measured by listeners, not chart position:</strong> Last.fm&apos;s chart reflects
            recent scrobble activity, not artist size, so a well-known artist can rank low (or not chart at all)
            while a currently-buzzing small artist ranks high. Cohorts and size labels here are built on
            <code>size_band</code> — each artist&apos;s own listener count — never chart position. Raw chart
            page/rank is still tracked (<code>artist_chart_position</code>) but only as a separate stat, not a
            classification. Chart seeding is also incomplete for the deepest pages: the remaining ~17,000 tracked
            artists were seeded via genre tags or the similarity graph and never had a chart position at all.
          </p>
          <p>
            <strong>Self-reported tags:</strong> genres come from Last.fm user tagging, not a curated taxonomy —
            expect noise and overlapping labels.
          </p>
          <p>
            <strong>Two early snapshot dates are excluded from cross-artist aggregates:</strong> 2026-04-27 and
            2026-05-03 cover different, non-overlapping populations of artists rather than a full weekly panel;
            every aggregate here is computed from 2026-05-10 onward.
          </p>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 17, marginBottom: 12 }}>Source</h2>
        <p className="secondary" style={{ fontSize: 14 }}>
          Full repo, including the ingestion scripts, dbt project, and this app, is on{' '}
          <a href="https://github.com/DeanKuhn/music-growth-pipeline" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>
            GitHub
          </a>
          .
        </p>
      </section>
    </div>
  );
}
