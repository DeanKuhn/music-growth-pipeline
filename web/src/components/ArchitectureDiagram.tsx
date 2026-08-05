const STAGES = [
  { label: 'Last.fm API', sub: 'chart, tag, similarity, geo' },
  { label: 'Python ingestion', sub: 'pipeline/*.py' },
  { label: 'Postgres (Neon)', sub: 'raw tables' },
  { label: 'dbt', sub: 'staging → marts → api' },
  { label: 'Next.js API', sub: '/api/* route handlers' },
  { label: 'Frontend', sub: 'this app' },
];

export function ArchitectureDiagram() {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 0,
      }}
    >
      {STAGES.map((s, i) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center' }}>
          <div
            className="card"
            style={{
              padding: '12px 16px',
              minWidth: 140,
              textAlign: 'center',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 14 }}>{s.label}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {s.sub}
            </div>
          </div>
          {i < STAGES.length - 1 && (
            <span className="muted" style={{ padding: '0 8px', fontSize: 18 }} aria-hidden>
              →
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
