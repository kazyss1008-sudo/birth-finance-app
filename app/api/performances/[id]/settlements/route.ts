import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

function serializeBigInt(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}

const settlementSchema = z.object({
  userId: z.string(),
  amount: z.number().int(),
  settledAt: z.string(),
  memo: z.string().optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const settlements = await prisma.settlement.findMany({
    where: { performanceId: BigInt(id) },
    include: { user: { select: { displayName: true, loginId: true } } },
    orderBy: { settledAt: 'desc' },
  });
  return NextResponse.json(serializeBigInt(settlements));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = settlementSchema.parse(await request.json());
    const settlement = await prisma.settlement.create({
      data: {
        performanceId: BigInt(id),
        userId: BigInt(body.userId),
        amount: body.amount,
        settledAt: new Date(body.settledAt),
        memo: body.memo || null,
      },
      include: { user: { select: { displayName: true, loginId: true } } },
    });
    return NextResponse.json(serializeBigInt(settlement), { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, message: 'バリデーションエラー', errors: err.errors }, { status: 400 });
    }
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { settlementId } = await request.json();
    if (!settlementId) {
      return NextResponse.json({ ok: false, message: '精算IDが必要です。' }, { status: 400 });
    }
    await prisma.settlement.delete({ where: { id: BigInt(settlementId) } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}
