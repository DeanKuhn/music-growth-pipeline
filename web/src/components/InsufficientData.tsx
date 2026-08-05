import { formatDate } from '@/lib/format';

export function InsufficientData({
  weeksTracked,
  seriesStartDate,
}: {
  weeksTracked: number;
  seriesStartDate: string | null;
}) {
  return (
    <div
      className="card"
      style={{ padding: '16px 18px', fontSize: 14, borderStyle: 'dashed' }}
    >
      <strong>Not enough history yet.</strong>{' '}
      <span className="secondary">
        Tracking since {formatDate(seriesStartDate)} — {weeksTracked} week{weeksTracked === 1 ? '' : 's'} of
        data so far. Growth charts and comparisons unlock once an artist has at least 3 weeks tracked.
      </span>
    </div>
  );
}
