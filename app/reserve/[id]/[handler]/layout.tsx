import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { BOOKING_ORIGIN } from '@/lib/booking-url';
import { prisma } from '@/lib/prisma';
import { actorFor } from '@/lib/tickets/service';

export async function generateMetadata({ params }: { params: Promise<{ id: string; handler: string }> }): Promise<Metadata> {
  const { id, handler } = await params;
  const url = `${BOOKING_ORIGIN}/reserve/${id}/${handler}`;
  let title = '劇団Birth チケット予約';
  try {
    if (process.env.TICKETS_PUBLIC_ENABLED === 'true') {
      await actorFor(BigInt(id), handler);
      const p = await prisma.performance.findUnique({ where: { id: BigInt(id) }, select: { name: true } });
      if (p) title = `${p.name} 予約ページ`;
    }
  } catch { }
  const description = '劇団Birthの公演チケット予約ページです。全席自由・当日精算。';
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: 'website' }, twitter: { card: 'summary', title, description } };
}

export default function ReservationLayout({ children }: { children: ReactNode }) { return children; }
