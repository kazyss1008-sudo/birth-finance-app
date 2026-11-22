import { NextResponse } from 'next/server';
import { getCastSession } from '@/lib/cast-auth';
import { prisma } from '@/lib/prisma';
export async function GET(request: Request) {
  const cast = await getCastSession();
  if (!cast) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const query = new URL(request.url).searchParams;
  if ((query.has('castId') && query.get('castId') !== String(cast.id)) || query.get('performanceId') !== String(cast.performanceId)) {
    return NextResponse.json({ error: 'このページへのアクセス権がありません' }, { status: 403 });
  }
  const [performance, rehearsals, schedules] = await Promise.all([
    prisma.performance.findUnique({ where: { id: cast.performanceId }, select: { id: true, name: true } }),
    prisma.rehearsal.findMany({ where: { performanceId: cast.performanceId }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] }),
    prisma.castSchedule.findMany({ where: { performanceId: cast.performanceId, castId: cast.id } }),
  ]);
  return new NextResponse(JSON.stringify({
    performance,
    casts: [{ id: cast.id, performanceId: cast.performanceId, name: cast.name, roleName: cast.roleName }],
    rehearsals: rehearsals.map(r => ({ id: r.id, date: r.date.toISOString().slice(0, 10), startTime: r.startTime, endTime: r.endTime, location: r.location })),
    schedules,
  }, (_, value) => typeof value === 'bigint' ? String(value) : value), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
