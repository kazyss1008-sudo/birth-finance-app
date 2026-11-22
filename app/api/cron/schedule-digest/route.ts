import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendLine } from '@/lib/line';
import { summarizeChanges } from '@/lib/change-summary';
export const maxDuration = 60;
export async function GET(request: Request) {
  if (process.env.SCHEDULE_CRON_OWNER !== 'finance') return NextResponse.json({ skipped: true });
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const settings = await prisma.lineNotificationSetting.findUnique({ where: { id: 1 } });
    if (settings?.schedulerOwner !== 'finance') return NextResponse.json({ skipped: true });
  // Test mode never sends real changes or consumes the production notification backlog.
  if (!settings || settings.mode !== 'PRODUCTION') return NextResponse.json({ ok: true, sent: false, mode: 'TEST' });
  const target = settings.productionTargetId;
  if (!target || !process.env.LINE_CHANNEL_ACCESS_TOKEN) return NextResponse.json({ error: 'LINE連携設定が未完了です' }, { status: 503 });
  const destination = await prisma.lineDestination.findUnique({ where: { id: target } });
  if (!destination || destination.type !== 'group') return NextResponse.json({ error: '本番の通知先グループを確認してください' }, { status: 503 });
  const recipient = `line:${target}`;
  // All changes through the previous JST calendar day, including undelivered older changes.
  const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const cutoff = new Date(`${day}T00:00:00+09:00`);
  try {
    await prisma.castLoginAttempt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    let digest = await prisma.scheduleDigest.findUnique({ where: { day } });
    if (digest?.sentAt) return NextResponse.json({ ok: true, sent: false });
    if (!digest) {
      const changes = await prisma.scheduleChange.findMany({ where: { notifiedAt: null, createdAt: { lt: cutoff } }, orderBy: { id: 'asc' } });
      if (changes.length === 0) return NextResponse.json({ ok: true, sent: false });
      const summary = summarizeChanges(changes);
      const text = summary.count ? `劇団Birth スケジュール変更通知\n${day} 配信（前日までの差分）\n変更 ${summary.count}件\n\n${summary.text}` : '';
      // Keep one immutable recipient and payload for daily retry deduplication.
      digest = await prisma.scheduleDigest.upsert({ where: { day }, update: {},
        create: { day, text, recipient, changeIds: changes.map(c => String(c.id)) } });
    }
    if (digest.recipient !== recipient) return NextResponse.json({ error: '未送信通知の宛先が変更されています。設定をご確認ください' }, { status: 409 });
    // Recheck mode immediately before sending in case an operator paused during preparation.
    const current = await prisma.lineNotificationSetting.findUnique({ where: { id: 1 } });
    if (current?.schedulerOwner !== 'finance' || current?.mode !== 'PRODUCTION' || current.productionTargetId !== target) return NextResponse.json({ ok: true, sent: false });
    // Reverted edits still advance the production baseline, without sending an empty message.
    if (digest.text) await sendLine(target, digest.text, `schedule-digest/${day}`);
    const ids = (digest.changeIds as string[]).map(BigInt);
    await prisma.$transaction([
      prisma.scheduleChange.updateMany({ where: { id: { in: ids }, notifiedAt: null }, data: { notifiedAt: new Date() } }),
      prisma.scheduleDigest.update({ where: { day }, data: { sentAt: new Date() } }),
    ]);
    return NextResponse.json({ ok: true, sent: !!digest.text });
  } catch {
    return NextResponse.json({ error: '通知の送信に失敗しました。未通知の変更は保持されています' }, { status: 500 });
  }
}
