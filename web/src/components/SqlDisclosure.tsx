export function SqlDisclosure({ label, sql }: { label: string; sql: string }) {
  return (
    <details style={{ marginTop: 8 }}>
      <summary
        className="muted"
        style={{ cursor: 'pointer', fontSize: 12, userSelect: 'none' }}
      >
        Show the SQL — {label}
      </summary>
      <pre
        className="tabular"
        style={{
          marginTop: 8,
          padding: 12,
          background: 'var(--page)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12,
          lineHeight: 1.5,
          overflowX: 'auto',
        }}
      >
        <code>{sql.trim()}</code>
      </pre>
    </details>
  );
}
