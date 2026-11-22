import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyLineSignature, lineDestinationName } from '@/lib/line';

const payload = z.object({ events: z.array(z.object({
  type: z.string(), source: z.object({ type: z.string(), userId: z.string().optional(), groupId: z.string().optional() }).optional(),
  message: z.object({ type: z.string(), text: z.string().optional() }).optional(),
})).max(100) });

export async function POST(request: Request) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return NextResponse.json({ error: 'LINE連携の初期設定が必要です' }, { status: 503 });
  const body = await request.text();
  if (!verifyLineSignature(body, request.headers.get('x-line-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  let json: unknown;
  try { json = JSON.parse(body); } catch { return NextResponse.json({ error: 'Invalid payload' }, { status: 400 }); }
  const parsed = payload.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  let stage: 'profile_lookup' | 'destination_save' = 'profile_lookup';
  try {
    for (const event of parsed.data.events) {
      // Never retain conversations. Only explicit registration messages discover a destination.
      if (event.type !== 'message' || event.message?.type !== 'text' || event.message.text?.trim() !== '通知登録') continue;
      const source = event.source;
      const type = source?.type;
      if (type !== 'user' && type !== 'group') continue;
      const id = type === 'user' ? source?.userId : source?.groupId;
      if (!id || !(type === 'user' ? /^U[0-9a-f]{32}$/ : /^C[0-9a-f]{32}$/).test(id)) continue;
      stage = 'profile_lookup';
      const name = await lineDestinationName(id, type);
      stage = 'destination_save';
      await prisma.lineDestination.upsert({ where: { id },
        create: { id, type, name }, update: { name, lastSeenAt: new Date() } });
    }
    return NextResponse.json({ ok: true });
  } catch {
    console.error('LINE registration failed', { stage });
    return NextResponse.json({ error: '通知先の登録に失敗しました。もう一度「通知登録」と送信してください' }, { status: 500 });
  }
}
