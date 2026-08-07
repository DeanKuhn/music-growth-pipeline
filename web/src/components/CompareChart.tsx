'use client';

import { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import type { CompareResponse } from '@/lib/api';
import { formatDate } from '@/lib/format';

const TABS: { key: 'genre' | 'size_band' | 'similar'; label: string }[] = [
  { key: 'genre', label: 'vs Genre' },
  { key: 'size_band', label: 'vs Size band' },
  { key: 'similar', label: 'vs Similar artists' },
];

export function CompareChart({
  data,
}: {
  data: Record<'genre' | 'size_band' | 'similar', CompareResponse | null>;
}) {
  const available = TABS.filter((t) => data[t.key] && data[t.key]!.series.length > 0);
  const [active, setActive] = useState<'genre' | 'size_band' | 'similar'>(available[0]?.key ?? 'genre');
  const current = data[active];

  if (available.length === 0) return null;

  const chartData =
    current?.series.map((p) => ({
      date: p.snapshot_date,
      artist: p.listeners_indexed,
      p25: p.p25_indexed,
      band: p.p75_indexed !== null && p.p25_indexed !== null ? p.p75_indexed - p.p25_indexed : null,
      median: p.median_indexed,
    })) ?? [];

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const hasData = data[t.key] && data[t.key]!.series.length > 0;
          if (!hasData) return null;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                border: '1px solid var(--border-strong)',
                background: active === t.key ? 'var(--series-1)' : 'transparent',
                color: active === t.key ? '#fff' : 'var(--text-secondary)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {current && !current.cohort_available && (
        <p className="muted" style={{ fontSize: 13 }}>
          No comparison cohort available for this artist yet — showing its own indexed series only.
        </p>
      )}

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--gridline)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => formatDate(d).replace(/, \d{4}/, '')}
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            axisLine={{ stroke: 'var(--baseline)' }}
            tickLine={false}
            minTickGap={30}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <ReferenceLine y={100} stroke="var(--baseline)" strokeDasharray="3 3" />
          <Tooltip
            content={({ active: hovering, payload, label }) => {
              if (!hovering || !payload?.length) return null;
              const p = payload[0]?.payload;
              return (
                <div
                  className="card"
                  style={{ padding: '8px 12px', fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}
                >
                  <div className="muted" style={{ fontSize: 11 }}>
                    {formatDate(label)}
                  </div>
                  <div className="tabular" style={{ color: 'var(--series-1)' }}>
                    This artist: {p.artist?.toFixed(1)}
                  </div>
                  {p.median !== null && p.median !== undefined && (
                    <div className="tabular" style={{ color: 'var(--series-2)' }}>
                      Cohort median: {p.median?.toFixed(1)}
                    </div>
                  )}
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {current?.cohort_available && (
            <>
              <Area
                dataKey="p25"
                stackId="band"
                stroke="none"
                fill="transparent"
                legendType="none"
                isAnimationActive={false}
              />
              <Area
                dataKey="band"
                stackId="band"
                stroke="none"
                fill="var(--series-2)"
                fillOpacity={0.12}
                name="Cohort p25–p75"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="median"
                stroke="var(--series-2)"
                strokeWidth={2}
                dot={false}
                name="Cohort median"
              />
            </>
          )}
          <Line
            type="monotone"
            dataKey="artist"
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={false}
            name="This artist"
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        Indexed to 100 at each series&apos; first observation.
      </p>
    </div>
  );
}
