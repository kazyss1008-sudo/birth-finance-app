'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';

// Module-level flag: warm up the all-data function once per page load
let globalWarmed = false;

export function PerformanceCardPrefetcher({ id, children, first }: { id: string; children: React.ReactNode; first?: boolean }) {
  const warmed = useRef(false);

  // First card: warm up immediately on mount (covers mobile where no hover)
  useEffect(() => {
    if (first && !globalWarmed) {
      globalWarmed = true;
      fetch(`/api/performances/${id}/all-data`).catch(() => {});
    }
  }, [first, id]);

  const handleWarmup = useCallback(() => {
    if (warmed.current) return;
    warmed.current = true;
    fetch(`/api/performances/${id}/all-data`).catch(() => {});
  }, [id]);

  return (
    <Link
      href={`/performances/${id}`}
      className="card"
      style={{ transition: 'box-shadow 0.2s', cursor: 'pointer' }}
      onMouseEnter={handleWarmup}
      onTouchStart={handleWarmup}
    >
      {children}
    </Link>
  );
}
