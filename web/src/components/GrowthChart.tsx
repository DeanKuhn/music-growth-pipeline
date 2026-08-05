'use client';

import { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { TimeseriesPoint } from '@/lib/api';
import { formatListeners, formatDate } from '@/lib/format';

export function GrowthChart({ series }: { series: TimeseriesPoint[] }) {
  const [log, setLog] = useState(false);

  const data = series.map((p) => ({
    date: p.snapshot_date,
    listeners: p.listeners,
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Listener growth</h3>
        <label className="secondary" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={log} onChange={(e) => setLog(e.target.checked)} />
          Log scale
        </label>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
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
            scale={log ? 'log' : 'linear'}
            domain={log ? ['auto', 'auto'] : [0, 'auto']}
            allowDataOverflow={log}
            tickFormatter={(v) => formatListeners(v)}
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length || !payload[0]) return null;
              return (
                <div
                  className="card"
                  style={{ padding: '8px 12px', fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}
                >
                  <div className="muted" style={{ fontSize: 11 }}>
                    {formatDate(label)}
                  </div>
                  <div className="tabular" style={{ fontWeight: 600 }}>
                    {formatListeners(payload[0].value as number)} listeners
                  </div>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="listeners"
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
