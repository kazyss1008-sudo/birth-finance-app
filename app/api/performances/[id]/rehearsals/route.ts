import { getSessionUser } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getSessionUser()) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const { id } = await params;
  const rehearsals = await prisma.rehearsal.findMany({
    where: { performanceId: BigInt(id) },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { sortOrder: 'asc' }],
  });
  return NextResponse.json(rehearsals.map(r => ({
    ...r, id: r.id.toString(), performanceId: r.performanceId.toString(),
    date: r.date.toISOString().slice(0, 10),
  })));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getSessionUser()) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const { id } = await params;
  const { date, startTime, endTime, location, memo } = await req.json();
  if (!date || !startTime || !endTime) return NextResponse.json({ error: '日付・開始時刻・終了時刻は必須です' }, { status: 400 });
  const r = await prisma.rehearsal.create({
    data: {
      performanceId: BigInt(id),
      date: new Date(date),
      startTime,
      endTime,
      location: location ?? '',
      memo: memo || null,
    },
  });
  return NextResponse.json({ id: r.id.toString() });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getSessionUser()) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const { id: _perfId } = await params;
  const { id: rehearsalId, date, startTime, endTime, location, memo } = await req.json();
  if (!rehearsalId) return NextResponse.json({ error: 'IDが必要です' }, { status: 400 });
  const r = await prisma.rehearsal.update({
    where: { id: BigInt(rehearsalId) },
    data: {
      ...(date !== undefined && { date: new Date(date) }),
      ...(startTime !== undefined && { startTime }),
      ...(endTime !== undefined && { endTime }),
      ...(location !== undefined && { location }),
      ...(memo !== undefined && { memo: memo || null }),
    },
  });
  return NextResponse.json({ id: r.id.toString() });
}

export async function DELETE(req: NextRequest) {
  if (!await getSessionUser()) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const { id: rehearsalId } = await req.json();
  if (!rehearsalId) return NextResponse.json({ error: 'IDが必要です' }, { status: 400 });
  await prisma.rehearsal.delete({ where: { id: BigInt(rehearsalId) } });
  return NextResponse.json({ ok: true });
}
