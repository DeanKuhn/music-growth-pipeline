import Link from 'next/link';
import type { Metadata } from 'next';
import { SearchBar } from '@/components/SearchBar';

// A dynamically-rendered notFound() call is known to stream with a 200
// status on self-hosted `next start` (the response headers flush before the
// error is caught) — see PROGRESS notes. noindex is a defense against that:
// crawlers won't index this page as content even if the status code is
// wrong. Confirm the actual status on Vercel during Stage E verification.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="container" style={{ paddingTop: 64, paddingBottom: 40, textAlign: 'center' }}>
      <h1 style={{ fontSize: 26, marginBottom: 8 }}>We don&apos;t have that one</h1>
      <p className="secondary" style={{ marginBottom: 24 }}>
        Either the artist doesn&apos;t exist on Last.fm, or it hasn&apos;t been seeded into this dataset yet — the
        universe here is built from chart, tag, and similarity crawls, not a live lookup. Try a search:
      </p>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <SearchBar />
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 24 }}>
        <Link href="/" style={{ textDecoration: 'underline' }}>
          Back to the homepage
        </Link>
      </p>
    </div>
  );
}
