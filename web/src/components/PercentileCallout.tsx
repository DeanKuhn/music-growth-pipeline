import { formatPercentile } from '@/lib/format';

export function PercentileCallout({
  pctRankInSizeBand,
  pctRankInGenre,
  primaryGenre,
}: {
  pctRankInSizeBand: number | null;
  pctRankInGenre: number | null;
  primaryGenre: string | null;
}) {
  const sizeText = formatPercentile(pctRankInSizeBand);
  const genreText = formatPercentile(pctRankInGenre);
  if (!sizeText && !genreText) return null;

  return (
    <div
      className="card"
      style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}
    >
      {sizeText && (
        <span>
          Among artists its size, this artist <strong>{sizeText}</strong>.
        </span>
      )}
      {genreText && primaryGenre && (
        <span>
          Within <strong>{primaryGenre}</strong>, it <strong>{genreText}</strong>.
        </span>
      )}
    </div>
  );
}
