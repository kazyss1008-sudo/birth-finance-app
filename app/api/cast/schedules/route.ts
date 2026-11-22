import { NextResponse } from 'next/server';
import { getCastSession } from '@/lib/cast-auth';
import { prisma } from '@/lib/prisma';
import { scheduleInput, scheduleValues } from '@/lib/schedule-input';
export const maxDuration = 60;
export async function POST(request: Request) {
  try { return await saveSchedule(request); }
  catch (error) {
    const code = (error as { code?: unknown })?.code;
    console.error('Cast schedule save failed', { code: typeof code === 'string' && /^P\d{4}$/.test(code) ? code : 'unknown' });
    return NextResponse.json({ error: '保存できませんでした。画面を閉じずに「再保存」を押してください' }, { status: 503 });
  }
}
async function saveSchedule(request: Request) {
  const cast = await getCastSession();
  if (!cast) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const parsed = scheduleInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '入力内容を確認してください' }, { status: 400 });
  const item = parsed.data;
  if (item.castId !== String(cast.id)) return NextResponse.json({ error: '変更権限がありません' }, { status: 403 });
  const values = scheduleValues(item);
  const result = await prisma.$transaction(async tx => {
    // Serialize changes to this cast, and recheck credentials after taking the lock.
    const locked = await tx.$queryRaw<{ scheduleAuthVersion: number }[]>`SELECT schedule_auth_version AS "scheduleAuthVersion" FROM casts WHERE id = ${cast.id} FOR UPDATE`;
    const current = locked[0];
    if (!current || current.scheduleAuthVersion !== cast.scheduleAuthVersion) return 'unauthorized';
    const rehearsal = await tx.rehearsal.findFirst({ where: { id: BigInt(item.rehearsalId), performanceId: cast.performanceId }, include: { performance: { select: { name: true } } } });
    if (!rehearsal) return 'missing';
    const old = await tx.castSchedule.findUnique({ where: { castId_rehearsalId: { castId: cast.id, rehearsalId: rehearsal.id } } });
    const before = old ? { status: old.status, availableFrom: old.availableFrom, availableTo: old.availableTo, memo: old.memo }
      : { status: 'UNDECIDED', availableFrom: null, availableTo: null, memo: null };
    if (JSON.stringify(before) === JSON.stringify(values)) return 'ok';
    await tx.castSchedule.upsert({
      where: { castId_rehearsalId: { castId: cast.id, rehearsalId: rehearsal.id } },
      create: { castId: cast.id, rehearsalId: rehearsal.id, performanceId: cast.performanceId, ...values }, update: values,
    });
    const performance = rehearsal.performance;
    const label = (v: typeof before) => `${v.status}${v.status === 'TIME_LIMITED' ? ` (${v.availableFrom || '未指定'}〜${v.availableTo || '未指定'})` : ''}${v.memo ? ` / ${v.memo}` : ''}`;
    await tx.scheduleChange.create({ data: {
      details: `${performance?.name} / ${cast.name}\n${rehearsal.date.toISOString().slice(0,10)} ${rehearsal.startTime}〜${rehearsal.endTime}\n変更前: ${label(before)}\n変更後: ${label(values)}`,
      payload: { version: 1, castId: String(cast.id), rehearsalId: String(rehearsal.id), performanceId: String(cast.performanceId),
        castName: cast.name, performanceName: performance?.name || '', date: rehearsal.date.toISOString().slice(0,10),
        startTime: rehearsal.startTime, endTime: rehearsal.endTime, before, after: values },
    } });
    return 'ok';
  }, { maxWait: 10000, timeout: 20000 });
  if (result === 'unauthorized') return NextResponse.json({ error: '再ログインしてください' }, { status: 401 });
  if (result === 'missing') return NextResponse.json({ error: '稽古日程が見つかりません' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
