import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Music Growth — does charting predict listener growth?',
    template: '%s — Music Growth',
  },
  description:
    'Longitudinal listener growth for independent artists on Last.fm — search an artist, compare it to its genre, size band, or similar artists.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
