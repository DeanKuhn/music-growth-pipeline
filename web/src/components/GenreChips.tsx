import Link from 'next/link';

export function GenreChips({ genres }: { genres: string[] }) {
  if (genres.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {genres.map((g) => (
        <Link
          key={g}
          href={`/genres/${encodeURIComponent(g)}`}
          style={{
            fontSize: 13,
            padding: '4px 10px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            textDecoration: 'none',
            color: 'var(--text-secondary)',
          }}
        >
          {g}
        </Link>
      ))}
    </div>
  );
}
