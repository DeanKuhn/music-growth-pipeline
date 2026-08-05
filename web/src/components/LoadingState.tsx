'use client';

import { useEffect, useState } from 'react';

// Neon's free tier autosuspends after ~5min idle, so the first request after
// a while genuinely takes a couple seconds. Rather than let a skeleton run
// forever with no explanation, swap to an honest "waking up" message once
// it's run long enough to plausibly be a cold start rather than routing.
export function LoadingState({ skeleton }: { skeleton: React.ReactNode }) {
  const [coldStart, setColdStart] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setColdStart(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div>
      {coldStart && (
        <div
          className="card secondary"
          style={{ padding: '10px 16px', marginBottom: 16, fontSize: 13, textAlign: 'center' }}
        >
          Waking up the free-tier database… this can take a few seconds.
        </div>
      )}
      {skeleton}
    </div>
  );
}

export function Skeleton({ height = 20, width = '100%' }: { height?: number; width?: string | number }) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius: 6,
        background: 'var(--gridline)',
        opacity: 0.6,
      }}
    />
  );
}
