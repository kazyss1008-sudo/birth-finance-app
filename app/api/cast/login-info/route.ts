import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const querySchema = z.object({
  performanceId: z.string().regex(/^[1-9]\d{0,17}$/),
  castId: z.string().regex(/^[1-9]\d{0,17}$/).optional(),
});

// Public login branding only. Cast identity, schedules and credentials stay private.
export async function GET(request: Request) {
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return NextResponse.json({ error: '案内されたURLを確認してください' }, { status: 400 });
  const cast = query.data.castId ? await prisma.cast.findFirst({
    where: { id: BigInt(query.data.castId), performanceId: BigInt(query.data.performanceId) },
    select: { performance: { select: { id: true, name: true } } },
  }) : null;
  const performance = query.data.castId ? cast?.performance : await prisma.performance.findUnique({
    where: { id: BigInt(query.data.performanceId) }, select: { id: true, name: true },
  });
  if (!performance) return NextResponse.json({ error: 'このログインページが見つかりません。劇団へお問い合わせください' }, { status: 404 });
  return NextResponse.json({ performance: { id: String(performance.id), name: performance.name } },
    { headers: { 'Cache-Control': 'no-store' } });
}
