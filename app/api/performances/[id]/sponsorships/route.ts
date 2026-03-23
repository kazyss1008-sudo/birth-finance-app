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

const schema = z.object({
  sponsorName: z.string().min(1),
  amount: z.number().int().min(0),
  memo: z.string().optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sponsorships = await prisma.sponsorship.findMany({
    where: { performanceId: BigInt(id) },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(serializeBigInt(sponsorships));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = schema.parse(await request.json());
    const s = await prisma.sponsorship.create({
      data: {
        performanceId: BigInt(id),
        sponsorName: body.sponsorName,
        amount: body.amount,
        memo: body.memo || null,
      },
    });
    return NextResponse.json(serializeBigInt(s), { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, message: 'バリデーションエラー' }, { status: 400 });
    }
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { sponsorshipId, memo } = body;
    if (!sponsorshipId) {
      return NextResponse.json({ ok: false, message: 'IDが必要です。' }, { status: 400 });
    }
    const data: Record<string, unknown> = {};
    if (memo !== undefined) data.memo = memo || null;
    const s = await prisma.sponsorship.update({
      where: { id: BigInt(sponsorshipId) },
      data,
    });
    return NextResponse.json(serializeBigInt(s));
  } catch {
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { sponsorshipId } = await request.json();
    if (!sponsorshipId) {
      return NextResponse.json({ ok: false, message: 'IDが必要です。' }, { status: 400 });
    }
    await prisma.sponsorship.delete({ where: { id: BigInt(sponsorshipId) } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}
