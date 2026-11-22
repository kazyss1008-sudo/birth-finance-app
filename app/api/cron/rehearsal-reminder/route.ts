import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rehearsalDelivery, sendRehearsalDelivery } from '@/lib/rehearsal-delivery';
import { isEveningDeliveryWindow, japanDay } from '@/lib/rehearsal-report';

export const maxDuration = 60;

export async function GET(request: Request) {
  if (process.env.SCHEDULE_CRON_OWNER !== 'finance') return NextResponse.json({ skipped: true });
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const now = new Date();
  if (!isEveningDeliveryWindow(now)) return NextResponse.json({ ok: true, sent: false, reason: 'outside_window' });
  const day = japanDay(now, 1);
  try {
    await prisma.lineRehearsalDelivery.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 7 * 24 * 3600000) } } });
    const settings = await prisma.lineNotificationSetting.findUnique({ where: { id: 1 } });
    if (settings?.schedulerOwner !== 'finance') return NextResponse.json({ skipped: true });
    const target = settings?.productionTargetId;
    if (!settings?.rehearsalImageEnabled || !target) return NextResponse.json({ ok: true, sent: false });
    const destination = await prisma.lineDestination.findUnique({ where: { id: target } });
    if (destination?.type !== 'group') return NextResponse.json({ error: '本番の通知先グループを確認してください' }, { status: 503 });
    const delivery = await rehearsalDelivery(`daily-${day}`, day, target);
    if (!delivery) return NextResponse.json({ ok: true, sent: false, reason: 'no_rehearsals' });
    if (delivery.recipient !== target) return NextResponse.json({ error: '稽古案内の宛先が変更されました' }, { status: 409 });
    const sent = await sendRehearsalDelivery(delivery, false, async () => {
      const current = await prisma.lineNotificationSetting.findUnique({ where: { id: 1 } });
      return current?.schedulerOwner === 'finance' && !!current?.rehearsalImageEnabled && current.productionTargetId === target && isEveningDeliveryWindow(new Date());
    });
    return NextResponse.json({ ok: true, sent });
  } catch {
    console.error('LINE rehearsal reminder failed');
    return NextResponse.json({ error: '稽古案内を送信できませんでした' }, { status: 502 });
  }
}
