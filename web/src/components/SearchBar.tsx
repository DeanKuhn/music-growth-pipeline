'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { coerceNumericStrings, type SearchResponse } from '@/lib/api';
import { formatListeners, formatTier } from '@/lib/format';

export function SearchBar({ autoFocus = false }: { autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setData(null);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}&limit=8`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json) {
            setData(coerceNumericStrings(json) as SearchResponse);
            setOpen(true);
            setActiveIndex(-1);
          }
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const items: { artist_id: number; slug: string; display_name: string; latest_listeners: number | null; tier?: string | null }[] =
    data && data.found ? data.results : data && !data.found ? data.suggestions : [];

  function go(slug: string) {
    setOpen(false);
    router.push(`/artist/${slug}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const target = items[activeIndex];
      if (target) {
        e.preventDefault();
        go(target.slug);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => data && setOpen(true)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        placeholder="Search an artist…"
        aria-label="Search for an artist"
        aria-autocomplete="list"
        style={{
          width: '100%',
          fontSize: 17,
          padding: '14px 16px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-strong)',
          background: 'var(--surface)',
          color: 'var(--text-primary)',
          outline: 'none',
        }}
      />
      {open && data && (
        <div
          className="card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            maxHeight: 360,
            overflowY: 'auto',
            zIndex: 20,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}
        >
          {items.length === 0 ? (
            <div className="muted" style={{ padding: 16, fontSize: 14 }}>
              No matches.
            </div>
          ) : (
            <>
              {!data.found && (
                <div
                  className="muted"
                  style={{ padding: '10px 16px', fontSize: 13, borderBottom: '1px solid var(--border)' }}
                >
                  No exact match — closest artists we track:
                </div>
              )}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {items.map((item, i) => (
                  <li key={item.artist_id}>
                    <button
                      onClick={() => go(item.slug)}
                      onMouseEnter={() => setActiveIndex(i)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 16px',
                        border: 'none',
                        background: i === activeIndex ? 'var(--gridline)' : 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        font: 'inherit',
                        color: 'inherit',
                      }}
                    >
                      <span>{item.display_name}</span>
                      <span className="muted tabular" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                        {item.tier ? formatTier(item.tier) + ' · ' : ''}
                        {formatListeners(item.latest_listeners)} listeners
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
