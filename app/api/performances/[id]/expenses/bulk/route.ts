import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

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

const rowSchema = z.object({
  expenseDate: z.string().min(1),
  amount: z.number().int().min(0),
  expenseCategoryId: z.string().min(1),
  userId: z.string().min(1),
  itemName: z.string().min(1),
  memo: z.string().optional(),
  isProvisional: z.boolean().optional().default(false),
});

const bulkSchema = z.object({
  rows: z.array(rowSchema).min(1),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const performanceId = BigInt(id);

  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ ok: false, message: '認証エラー' }, { status: 401 });
    }

    const parsed = bulkSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({
        ok: false,
        message: 'バリデーションエラー',
        errors: parsed.error.errors.map(e => ({ path: e.path.join('.'), message: e.message })),
      }, { status: 400 });
    }

    const { rows } = parsed.data;

    // Pre-validate FK targets so we can give friendly per-row errors instead of P2003
    const userIds = [...new Set(rows.map(r => r.userId))];
    const categoryIds = [...new Set(rows.map(r => r.expenseCategoryId))];

    const [validUsers, validCategories, performance] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds.map(s => BigInt(s)) }, isActive: true },
        select: { id: true },
      }),
      prisma.expenseCategory.findMany({
        where: { id: { in: categoryIds.map(s => BigInt(s)) }, isActive: true },
        select: { id: true },
      }),
      prisma.performance.findUnique({ where: { id: performanceId }, select: { id: true } }),
    ]);

    if (!performance) {
      return NextResponse.json({ ok: false, message: '公演が見つかりません。' }, { status: 404 });
    }

    const validUserIds = new Set(validUsers.map(u => u.id.toString()));
    const validCategoryIds = new Set(validCategories.map(c => c.id.toString()));

    const rowErrors: { row: number; reason: string }[] = [];
    rows.forEach((r, i) => {
      if (!validUserIds.has(r.userId)) {
        rowErrors.push({ row: i + 1, reason: '担当者が無効または存在しません' });
      }
      if (!validCategoryIds.has(r.expenseCategoryId)) {
        rowErrors.push({ row: i + 1, reason: 'カテゴリが無効または存在しません' });
      }
      // Date sanity check
      const d = new Date(r.expenseDate);
      if (isNaN(d.getTime())) {
        rowErrors.push({ row: i + 1, reason: `日付フォーマットが不正です: ${r.expenseDate}` });
      }
    });

    if (rowErrors.length > 0) {
      return NextResponse.json({
        ok: false,
        message: `${rowErrors.length}件のエラーがあります。登録は行われませんでした。`,
        errors: rowErrors,
      }, { status: 422 });
    }

    // All-or-nothing transactional bulk insert
    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.createMany({
        data: rows.map(r => ({
          performanceId,
          expenseDate: new Date(r.expenseDate),
          amount: r.amount,
          expenseCategoryId: BigInt(r.expenseCategoryId),
          itemName: r.itemName,
          payee: '-',
          memo: r.memo || null,
          isProvisional: r.isProvisional ?? false,
          createdBy: BigInt(r.userId),
        })),
      });
      return created;
    });

    return NextResponse.json(serializeBigInt({
      ok: true,
      insertedCount: result.count,
      message: `${result.count}件の経費を登録しました。`,
    }), { status: 201 });
  } catch (err) {
    console.error('Bulk expense POST error:', err);
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。', detail: errMsg }, { status: 500 });
  }
}
