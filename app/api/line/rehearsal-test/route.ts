import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { nextRehearsalDate, rehearsalDelivery, sendRehearsalDelivery } from '@/lib/rehearsal-delivery';
import { japanDay, type SavedReport } from '@/lib/rehearsal-report';

export const maxDuration = 60;
const input = z.object({ requestId: z.string().uuid() });

export async function POST(request: Request) {
  if (!await getSessionUser()) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '入力内容を確認してください' }, { status: 400 });
  const id = parsed.data.requestId.toLowerCase();
  try {
    const settings = await prisma.lineNotificationSetting.findUnique({ where: { id: 1 } });
    if (!settings?.testTargetId) return NextResponse.json({ error: 'テスト用の個人宛先を保存してください' }, { status: 400 });
    const target = await prisma.lineDestination.findUnique({ where: { id: settings.testTargetId } });
    if (target?.type !== 'user') return NextResponse.json({ error: 'テストは個人宛にのみ送信できます' }, { status: 400 });
    let delivery = await prisma.lineRehearsalDelivery.findUnique({ where: { id } });
    if (!delivery) {
      const day = await nextRehearsalDate(japanDay(new Date(), 1));
      if (day) delivery = await rehearsalDelivery(id, day, target.id);
    }
    if (!delivery) return NextResponse.json({ error: '明日以降に予定されている稽古がありません' }, { status: 404 });
    if (delivery.recipient !== target.id) return NextResponse.json({ error: 'テスト宛先が変更されました。もう一度送信してください' }, { status: 409 });
    const report = delivery.pages as unknown as SavedReport;
    if (Array.isArray(report)) return NextResponse.json({ error: '画像の形式が変わりました。もう一度テスト送信してください' }, { status: 409 });
    if (!delivery.sentAt && Date.now() - delivery.createdAt.getTime() >= 24 * 3600000) {
      return NextResponse.json({ error: '前回のテストから時間が経過しました。もう一度テスト送信してください' }, { status: 409 });
    }
    if (!delivery.sentAt && !await sendRehearsalDelivery(delivery, true, async () => {
      const current = await prisma.lineNotificationSetting.findUnique({ where: { id: 1 } });
      return current?.testTargetId === target.id;
    })) return NextResponse.json({ error: 'テスト宛先が変更されました。もう一度送信してください' }, { status: 409 });
    return NextResponse.json({ ok: true, name: target.name, date: report.date });
  } catch {
    console.error('LINE rehearsal test failed');
    return NextResponse.json({ error: '稽古案内のテスト送信に失敗しました。個人宛先とLINE連携設定をご確認ください' }, { status: 502 });
  }
}
