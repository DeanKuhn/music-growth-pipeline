export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div className="tabular" style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>
        {value}
      </div>
      {sub && (
        <div className="secondary" style={{ fontSize: 13, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function StatTileGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}
