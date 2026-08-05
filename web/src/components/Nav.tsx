import Link from 'next/link';

export function Nav() {
  return (
    <header
      style={{
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        background: 'var(--page)',
        zIndex: 10,
      }}
    >
      <div
        className="container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 60,
        }}
      >
        <Link href="/" style={{ fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>
          music growth
        </Link>
        <nav style={{ display: 'flex', gap: 20, fontSize: 14 }}>
          <Link href="/leaderboards" style={{ textDecoration: 'none' }} className="secondary">
            Leaderboards
          </Link>
          <Link href="/genres" style={{ textDecoration: 'none' }} className="secondary">
            Genres
          </Link>
          <Link href="/how-it-works" style={{ textDecoration: 'none' }} className="secondary">
            How it works
          </Link>
        </nav>
      </div>
    </header>
  );
}
