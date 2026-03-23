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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const goods = await prisma.goods.findMany({
    where: { performanceId: BigInt(id) },
    include: { sales: { include: { performanceStage: true } } },
    orderBy: { sortOrder: 'asc' },
  });
  return NextResponse.json(serializeBigInt(goods));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const { name, unitPrice, sortOrder } = body;
    if (!name || name.trim() === '') {
      return NextResponse.json({ ok: false, message: 'グッズ名は必須です。' }, { status: 400 });
    }
    const goods = await prisma.goods.create({
      data: {
        performanceId: BigInt(id),
        name: name.trim(),
        unitPrice: Number(unitPrice) || 0,
        sortOrder: Number(sortOrder) || 0,
      },
    });
    return NextResponse.json(serializeBigInt(goods), { status: 201 });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      return NextResponse.json({ ok: false, message: '同名のグッズが既に登録されています。' }, { status: 409 });
    }
    console.error('Goods POST error:', err);
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { goodsId, name, unitPrice, sortOrder } = body;
    if (!goodsId) {
      return NextResponse.json({ ok: false, message: 'グッズIDが必要です。' }, { status: 400 });
    }
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name.trim();
    if (unitPrice !== undefined) data.unitPrice = Number(unitPrice);
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);
    const goods = await prisma.goods.update({
      where: { id: BigInt(goodsId) },
      data,
    });
    return NextResponse.json(serializeBigInt(goods));
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      return NextResponse.json({ ok: false, message: '同名のグッズが既に登録されています。' }, { status: 409 });
    }
    console.error('Goods PUT error:', err);
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { goodsId } = await req.json();
    if (!goodsId) {
      return NextResponse.json({ ok: false, message: 'グッズIDが必要です。' }, { status: 400 });
    }
    await prisma.goods.delete({ where: { id: BigInt(goodsId) } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}
