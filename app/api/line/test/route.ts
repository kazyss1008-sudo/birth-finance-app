import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { sendLine } from '@/lib/line';
import { summarizeChanges } from '@/lib/change-summary';
const input = z.object({ requestId: z.string().uuid(), kind: z.enum(['SAMPLE', 'CHANGES']).default('SAMPLE') });
export async function POST(request: Request) {
  if (!await getSessionUser()) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '入力内容を確認してください' }, { status: 400 });
  const settings = await prisma.lineNotificationSetting.findUnique({ where: { id: 1 } });
  if (!settings?.testTargetId) return NextResponse.json({ error: 'テスト用の個人宛先を保存してください' }, { status: 400 });
  const target = await prisma.lineDestination.findUnique({ where: { id: settings.testTargetId } });
  if (!target || target.type !== 'user') return NextResponse.json({ error: 'テストは個人宛にのみ送信できます' }, { status: 400 });
  try {
    let text = '【劇団Birth】LINE通知のテスト\n\n個人宛のテスト通知です。\n本番では、キャストのスケジュール変更を1日1回まとめて運営グループへお知らせします。\n\nこのテストでスケジュールや本番通知の履歴は変更されません。';
    if (parsed.data.kind === 'CHANGES') {
      let digest = await prisma.lineTestDigest.findUnique({ where: { id: parsed.data.requestId } });
      if (digest && digest.recipient !== target.id) return NextResponse.json({ error: 'テスト宛先が変更されています。もう一度送信してください' }, { status: 409 });
      if (!digest) {
        const previous = await prisma.lineTestDigest.findFirst({
          where: { recipient: target.id, sentAt: { not: null } }, orderBy: { throughId: 'desc' },
        });
        const changes = await prisma.scheduleChange.findMany({
          where: previous ? { id: { gt: previous.throughId } } : { notifiedAt: null }, orderBy: { id: 'asc' },
        });
        if (!changes.length) return NextResponse.json({ ok: true, sent: false, count: 0 });
        const summary = summarizeChanges(changes);
        text = summary.count ? `【劇団Birth】スケジュール変更通知（個人宛テスト）\n前回からの差分 ${summary.count}件\n本日分を含みます。本番通知の対象は残ります。\n\n${summary.text}` : '';
        digest = await prisma.lineTestDigest.upsert({ where: { id: parsed.data.requestId }, update: {},
          create: { id: parsed.data.requestId, recipient: target.id, throughId: changes[changes.length - 1].id, text, count: summary.count } });
      }
      if (!digest.sentAt) {
        if (digest.text) await sendLine(target.id, digest.text, `line-changes-test/${parsed.data.requestId}`);
        // Only the test baseline advances; production change/digest records are untouched.
        await prisma.lineTestDigest.update({ where: { id: digest.id }, data: { sentAt: new Date() } });
      }
      return NextResponse.json({ ok: true, sent: !!digest.text, name: target.name, count: digest.count });
    }
    const key = `line-test/${parsed.data.requestId}`;
    await sendLine(target.id, text, key);
    return NextResponse.json({ ok: true, sent: true, name: target.name });
  } catch { return NextResponse.json({ error: 'テスト送信に失敗しました。LINEの連携設定と友だち追加をご確認ください' }, { status: 502 }); }
}
