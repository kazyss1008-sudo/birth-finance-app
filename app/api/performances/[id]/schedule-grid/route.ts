import { getSessionUser } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getSessionUser()) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const { id } = await params;
  const perfId = BigInt(id);

  const [performance, rehearsals, casts, schedules] = await Promise.all([
    prisma.performance.findUnique({ where: { id: perfId } }),
    prisma.rehearsal.findMany({ where: { performanceId: perfId }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] }),
    prisma.cast.findMany({ where: { performanceId: perfId }, orderBy: { sortOrder: 'asc' } }),
    prisma.castSchedule.findMany({ where: { performanceId: perfId } }),
  ]);

  if (!performance) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    performance: {
      ...performance, id: performance.id.toString(),
      startDate: performance.startDate?.toISOString().slice(0, 10) ?? null,
      endDate: performance.endDate?.toISOString().slice(0, 10) ?? null,
    },
    rehearsals: rehearsals.map(r => ({
      ...r, id: r.id.toString(), performanceId: r.performanceId.toString(),
      date: r.date.toISOString().slice(0, 10),
    })),
    casts: casts.map(c => ({
      id: c.id.toString(), performanceId: c.performanceId.toString(), name: c.name, roleName: c.roleName, sortOrder: c.sortOrder,
    })),
    schedules: schedules.map(s => ({
      ...s, id: s.id.toString(), castId: s.castId.toString(),
      rehearsalId: s.rehearsalId.toString(), performanceId: s.performanceId.toString(),
    })),
  });
}
