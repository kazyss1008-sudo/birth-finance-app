import { NextResponse } from 'next/server';
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

// Upsert goods sales - accepts array of { goodsId, performanceStageId, quantity }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await params; // consume params
  try {
    const { records } = await req.json() as { records: { goodsId: string; performanceStageId: string; quantity: number }[] };
    if (!Array.isArray(records)) {
      return NextResponse.json({ ok: false, message: 'records配列が必要です。' }, { status: 400 });
    }

    const results = await prisma.$transaction(
      records.map(r =>
        prisma.goodsSale.upsert({
          where: {
            goodsId_performanceStageId: {
              goodsId: BigInt(r.goodsId),
              performanceStageId: BigInt(r.performanceStageId),
            },
          },
          update: { quantity: Number(r.quantity) || 0 },
          create: {
            goodsId: BigInt(r.goodsId),
            performanceStageId: BigInt(r.performanceStageId),
            quantity: Number(r.quantity) || 0,
          },
        })
      )
    );
    return NextResponse.json(serializeBigInt(results));
  } catch (err) {
    console.error('GoodsSales POST error:', err);
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}
