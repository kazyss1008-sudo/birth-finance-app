'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { performanceSubtitle } from '@/lib/display-date';

export function PerformanceSubtitle({ fallback }: { fallback?: string }) {
  const path = usePathname();
  const match = path.match(/^\/performances\/(\d+)(?:\/|$)/);
  const id = match?.[1];
  const cast = /^\/performances\/\d+\/cast(?:\/|$)/.test(path);
  const [heading, setHeading] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let active = true;
    fetch(`/api/performances/${id}/heading${cast ? '?scope=cast' : ''}`).then(async r => {
      if (!r.ok) return;
      const p = await r.json();
      if (active) setHeading({ id, text: performanceSubtitle(p) });
    }).catch(() => {});
    return () => { active = false; };
  }, [id, cast]);
  return <p className="subtitle">{id ? (heading?.id === id ? heading.text : '') : fallback}</p>;
}
