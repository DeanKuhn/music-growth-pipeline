export function formatListeners(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

export function formatPct(n: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (n === null || n === undefined) return '—';
  const sign = opts.signed && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatPercentile(rank: number | null | undefined): string | null {
  if (rank === null || rank === undefined) return null;
  const pct = Math.round(rank * 100);
  return `grew faster than ${pct}% of peers`;
}

