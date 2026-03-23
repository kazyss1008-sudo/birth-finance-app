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

const updateSchema = z.object({
  castId: z.string(),
  name: z.string().min(1).optional(),
  normaTicketCount: z.number().int().min(0).optional(),
  normaUnitPrice: z.number().int().min(0).optional(),
  isTicketBackTarget: z.boolean().optional(),
});

const reorderSchema = z.object({
  order: z.array(z.object({
    castId: z.string(),
    sortOrder: z.number().int().min(0),
  })),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const casts = await prisma.cast.findMany({
    where: { performanceId: BigInt(id) },
    orderBy: { sortOrder: 'asc' },
  });
  return NextResponse.json(serializeBigInt(casts));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = updateSchema.parse(await request.json());
    const { castId, ...data } = body;
    const cast = await prisma.cast.update({
      where: { id: BigInt(castId), performanceId: BigInt(id) },
      data,
    });
    return NextResponse.json(serializeBigInt(cast));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, message: 'バリデーションエラー', errors: err.errors }, { status: 400 });
    }
    console.error('Cast PUT error:', err);
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = reorderSchema.parse(await request.json());
    const performanceId = BigInt(id);
    await prisma.$transaction(
      body.order.map(item =>
        prisma.cast.update({
          where: { id: BigInt(item.castId), performanceId },
          data: { sortOrder: item.sortOrder },
        })
      )
    );
    const casts = await prisma.cast.findMany({
      where: { performanceId },
      orderBy: { sortOrder: 'asc' },
    });
    return NextResponse.json(serializeBigInt(casts));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, message: 'バリデーションエラー', errors: err.errors }, { status: 400 });
    }
    console.error('Cast PATCH error:', err);
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}
