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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const performance = await prisma.performance.findUnique({
    where: { id: BigInt(id) },
    include: {
      stages: { orderBy: { sortOrder: 'asc' } },
      casts: { orderBy: { sortOrder: 'asc' } },
      ticketBackRules: { orderBy: { stepNo: 'asc' } },
      importHistories: { orderBy: { importedAt: 'desc' }, take: 5 },
    },
  });

  if (!performance) {
    return NextResponse.json({ ok: false, message: '公演が見つかりません。' }, { status: 404 });
  }

  return NextResponse.json(serializeBigInt(performance));
}
