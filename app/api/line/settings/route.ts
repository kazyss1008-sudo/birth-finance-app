import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

const input = z.object({ schedulerOwner: z.enum(['schedule','finance']).optional(), mode: z.enum(['TEST', 'PRODUCTION']),
  testTargetId: z.string().regex(/^U[0-9a-f]{32}$/).nullable(),
  productionTargetId: z.string().regex(/^C[0-9a-f]{32}$/).nullable(),
  rehearsalImageEnabled: z.boolean().optional(),
}).refine(v => (v.mode !== 'PRODUCTION' && !v.rehearsalImageEnabled) || !!v.productionTargetId);

export async function GET() {
  if (!await getSessionUser()) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const [settings, destinations] = await Promise.all([
    prisma.lineNotificationSetting.findUnique({ where: { id: 1 } }),
    prisma.lineDestination.findMany({ orderBy: { lastSeenAt: 'desc' }, select: { id: true, name: true, type: true } }),
  ]);
  return NextResponse.json({ settings: settings || { mode: 'TEST', testTargetId: null, productionTargetId: null, rehearsalImageEnabled: false }, destinations,
    connected: !!process.env.LINE_CHANNEL_ACCESS_TOKEN && !!process.env.LINE_CHANNEL_SECRET }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function PUT(request: Request) {
  if (!await getSessionUser()) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '通知先を確認してください。運営グループへの通知にはグループの指定が必要です' }, { status: 400 });
  const data = { ...parsed.data, ...(!parsed.data.productionTargetId ? { rehearsalImageEnabled: false } : {}) };
  const targets = await prisma.lineDestination.findMany({ where: { id: { in: [data.testTargetId, data.productionTargetId].filter((id): id is string => !!id) } } });
  if ((data.testTargetId && !targets.some(t => t.id === data.testTargetId && t.type === 'user')) ||
      (data.productionTargetId && !targets.some(t => t.id === data.productionTargetId && t.type === 'group'))) {
    return NextResponse.json({ error: 'LINEから「通知登録」を送ってから選択してください' }, { status: 400 });
  }
  await prisma.lineNotificationSetting.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  return NextResponse.json({ ok: true });
}
