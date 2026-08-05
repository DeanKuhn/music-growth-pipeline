export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', marginTop: 64 }}>
      <div
        className="container secondary"
        style={{ padding: '24px 20px', fontSize: 13, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}
      >
        <span>
          Data from{' '}
          <a
            href="https://www.last.fm/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'underline' }}
          >
            Last.fm
          </a>
          . Listener counts are cumulative all-time, not active listeners.
        </span>
        <a href="/how-it-works" style={{ textDecoration: 'underline' }}>
          Methodology &amp; caveats
        </a>
      </div>
    </footer>
  );
}
