import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { sendMail } from '@/lib/mail';
export const maxDuration = 60;
const schema = z.object({ castIds: z.array(z.string().regex(/^\d+$/)).min(1).max(50), requestId: z.string().uuid() });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user?.isActive) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '送信対象を確認してください（1回50名まで）' }, { status: 400 });
  const origin = process.env.SCHEDULE_APP_URL;
  if (!origin || !process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return NextResponse.json({ error: 'メール送信設定が未完了です' }, { status: 503 });
  let base: URL;
  try { base = new URL(origin); if (base.protocol !== 'https:') throw new Error(); }
  catch { return NextResponse.json({ error: 'スケジュールアプリのURL設定を確認してください' }, { status: 503 }); }
  const casts = await prisma.cast.findMany({ where: { performanceId: BigInt(id), id: { in: parsed.data.castIds.map(BigInt) } }, include: { performance: { select: { name: true } } } });
  const results: { id: string; name: string; ok: boolean; message: string }[] = [];
  if (casts.length !== new Set(parsed.data.castIds).size || casts.some(c => !c.email || !c.schedulePasswordHash)) {
    return NextResponse.json({ error: '送信対象全員のメールアドレスとパスワードを登録してください' }, { status: 400 });
  }
  const deadline = Date.now() + 35000;
  for (const cast of casts) {
    if (Date.now() > deadline) {
      results.push({ id: String(cast.id), name: cast.name, ok: false, message: '未送信（時間切れのため再送してください）' });
      continue;
    }
    try {
      const url = new URL(`/performances/${id}/cast/${cast.id}`, base).toString();
      await sendMail(cast.email!, `【劇団Birth】${cast.performance.name} スケジュール登録のご案内`,
        `${cast.name} 様\n\nスケジュールの登録・変更は次のページからお願いします。\n${url}\n\nログインメールアドレス: ${cast.email}\nパスワード: 劇団から別途ご案内したものをご利用ください。\n\nご自身のOK・NG・参加可能時間を登録できます。\nパスワードが不明な場合は劇団へお問い合わせください。`,
        `cast-invite/${parsed.data.requestId}/${cast.id}`);
      results.push({ id: String(cast.id), name: cast.name, ok: true, message: '送信済み' });
    } catch {
      results.push({ id: String(cast.id), name: cast.name, ok: false, message: '送信失敗（再送できます）' });
    }
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  return NextResponse.json({ results });
}
