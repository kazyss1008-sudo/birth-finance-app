import { getSessionUser } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getSessionUser()) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const { id } = await params;
  const schedules = await prisma.castSchedule.findMany({
    where: { performanceId: BigInt(id) },
  });
  return NextResponse.json(schedules.map(s => ({
    ...s,
    id: s.id.toString(),
    castId: s.castId.toString(),
    rehearsalId: s.rehearsalId.toString(),
    performanceId: s.performanceId.toString(),
  })));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getSessionUser()) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const { id } = await params;
  const { castId, rehearsalId, status, availableFrom, availableTo, memo } = await req.json();
  if (!castId || !rehearsalId) return NextResponse.json({ error: 'castIdとrehearsalIdが必要です' }, { status: 400 });

  const s = await prisma.castSchedule.upsert({
    where: { castId_rehearsalId: { castId: BigInt(castId), rehearsalId: BigInt(rehearsalId) } },
    create: {
      castId: BigInt(castId),
      rehearsalId: BigInt(rehearsalId),
      performanceId: BigInt(id),
      status: status ?? 'UNDECIDED',
      availableFrom: availableFrom || null,
      availableTo: availableTo || null,
      memo: memo || null,
    },
    update: {
      status: status ?? 'UNDECIDED',
      availableFrom: availableFrom || null,
      availableTo: availableTo || null,
      memo: memo || null,
    },
  });
  return NextResponse.json({ id: s.id.toString() });
}

// Staff bulk save
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await getSessionUser()) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const { id } = await params;
  const items: Array<{ castId: string; rehearsalId: string; status: string; availableFrom?: string; availableTo?: string; memo?: string }> = await req.json();

  for (const item of items) {
    await prisma.castSchedule.upsert({
      where: { castId_rehearsalId: { castId: BigInt(item.castId), rehearsalId: BigInt(item.rehearsalId) } },
      create: {
        castId: BigInt(item.castId),
        rehearsalId: BigInt(item.rehearsalId),
        performanceId: BigInt(id),
        status: item.status as 'UNDECIDED' | 'OK' | 'NG' | 'TIME_LIMITED',
        availableFrom: item.availableFrom || null,
        availableTo: item.availableTo || null,
        memo: item.memo || null,
      },
      update: {
        status: item.status as 'UNDECIDED' | 'OK' | 'NG' | 'TIME_LIMITED',
        availableFrom: item.availableFrom || null,
        availableTo: item.availableTo || null,
        memo: item.memo || null,
      },
    });
  }
  return NextResponse.json({ ok: true });
}
