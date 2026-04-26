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

// GET: 指定公演の情報・ユーザー一覧・カテゴリ一覧
export async function GET(_request: Request, { params }: { params: Promise<{ performanceId: string }> }) {
  const { performanceId } = await params;
  try {
    const [performance, users, categories] = await Promise.all([
      prisma.performance.findUnique({
        where: { id: BigInt(performanceId) },
        select: { id: true, name: true, status: true, startDate: true, endDate: true },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' },
        select: { id: true, displayName: true },
      }),
      prisma.expenseCategory.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true },
      }),
    ]);
    if (!performance) {
      return NextResponse.json({ ok: false, message: '公演が見つかりません。' }, { status: 404 });
    }
    return NextResponse.json(serializeBigInt({ performance, users, categories }));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。', detail: errMsg }, { status: 500 });
  }
}

const schema = z.object({
  userId: z.string(),
  expenseDate: z.string(),
  amount: z.number().int().min(0),
  expenseCategoryId: z.string(),
  itemName: z.string().min(1),
  memo: z.string().optional(),
  isProvisional: z.boolean().optional().default(false),
});

export async function POST(request: Request, { params }: { params: Promise<{ performanceId: string }> }) {
  const { performanceId } = await params;
  try {
    const body = schema.parse(await request.json());
    const expense = await prisma.expense.create({
      data: {
        performanceId: BigInt(performanceId),
        expenseDate: new Date(body.expenseDate),
        amount: body.amount,
        expenseCategoryId: BigInt(body.expenseCategoryId),
        itemName: body.itemName,
        payee: '-',
        memo: body.memo || null,
        isProvisional: body.isProvisional,
        createdBy: BigInt(body.userId),
      },
      include: { category: true, creator: { select: { displayName: true } } },
    });
    return NextResponse.json(serializeBigInt(expense), { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, message: 'バリデーションエラー', errors: err.errors }, { status: 400 });
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('QuickExpense POST error:', errMsg);
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。', detail: errMsg }, { status: 500 });
  }
}
