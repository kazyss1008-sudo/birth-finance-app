import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
const input = z.array(z.object({
  castId: z.string().regex(/^\d+$/),
  email: z.string().trim().toLowerCase().email().max(254).or(z.literal('')),
  password: z.string().min(8).max(72).refine(s => Buffer.byteLength(s, 'utf8') <= 72).or(z.literal('')),
})).min(1).max(200);
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user?.isActive) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const { id } = await params;
  const casts = await prisma.cast.findMany({ where: { performanceId: BigInt(id) }, orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, email: true, schedulePasswordHash: true } });
  return NextResponse.json(casts.map(c => ({ id: String(c.id), name: c.name, email: c.email || '', hasPassword: !!c.schedulePasswordHash })));
}
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user?.isActive) return NextResponse.json({ error: 'ログインしてください' }, { status: 401 });
  const { id } = await params;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'メールアドレスとパスワード（8文字以上・72バイト以内）を確認してください' }, { status: 400 });
  const items = parsed.data;
  if (new Set(items.map(c => c.castId)).size !== items.length) return NextResponse.json({ error: 'キャストが重複しています' }, { status: 400 });
  // Hash before the transaction to keep row locks short.
  const hashes = await Promise.all(items.map(async c => c.password ? bcrypt.hash(c.password, 12) : null));
  try {
    await prisma.$transaction(async tx => {
      // Serialize account edits per performance, including partial bulk saves.
      await tx.$queryRaw`SELECT id FROM performances WHERE id = ${BigInt(id)} FOR NO KEY UPDATE`;
      const all = await tx.cast.findMany({ where: { performanceId: BigInt(id) }, select: { id: true, email: true } });
      const nextEmails = new Map(all.map(c => [String(c.id), c.email?.trim().toLowerCase() || '']));
      for (const item of items) nextEmails.set(item.castId, item.email);
      const used = new Set<string>();
      for (const email of nextEmails.values()) {
        if (email && used.has(email)) throw new Error('duplicate-email');
        if (email) used.add(email);
      }
      for (const [index, item] of items.entries()) {
        await tx.$queryRaw`SELECT id FROM casts WHERE id = ${BigInt(item.castId)} FOR UPDATE`;
        const cast = await tx.cast.findFirst({ where: { id: BigInt(item.castId), performanceId: BigInt(id) } });
        if (!cast) throw new Error('cast');
        const changed = cast.email !== (item.email || null) || !!hashes[index];
        await tx.cast.update({ where: { id: cast.id }, data: {
          email: item.email || null, ...(hashes[index] ? { schedulePasswordHash: hashes[index] } : {}),
          ...(changed ? { scheduleAuthVersion: { increment: 1 } } : {}),
        } });
      }
    }, { timeout: 15000 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'duplicate-email') return NextResponse.json({
      error: '同じ公演でメールアドレスが重複しています。キャストごとに異なるメールアドレスを登録してください',
    }, { status: 400 });
    return NextResponse.json({ error: '保存に失敗しました。再読み込みしてお試しください' }, { status: 400 });
  }
}
