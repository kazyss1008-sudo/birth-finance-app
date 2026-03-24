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

const expenseSchema = z.object({
  expenseDate: z.string(),
  amount: z.number().int().min(0),
  expenseCategoryId: z.string(),
  itemName: z.string().min(1),
  payee: z.string().optional().default('-'),
  memo: z.string().optional(),
  isProvisional: z.boolean().optional().default(false),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const expenses = await prisma.expense.findMany({
    where: { performanceId: BigInt(id) },
    include: { category: true, creator: { select: { displayName: true } } },
    orderBy: [{ expenseDate: 'desc' }, { id: 'asc' }],
  });
  return NextResponse.json(serializeBigInt(expenses));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: '認証エラー' }, { status: 401 });
    }

    const body = expenseSchema.parse(await request.json());
    const expense = await prisma.expense.create({
      data: {
        performanceId: BigInt(id),
        expenseDate: new Date(body.expenseDate),
        amount: body.amount,
        expenseCategoryId: BigInt(body.expenseCategoryId),
        itemName: body.itemName,
        payee: body.payee,
        memo: body.memo || null,
        isProvisional: body.isProvisional,
        createdBy: user.id,
      },
      include: { category: true, creator: { select: { displayName: true } } },
    });
    return NextResponse.json(serializeBigInt(expense), { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, message: 'バリデーションエラー', errors: err.errors }, { status: 400 });
    }
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { expenseId, isSettled } = body;
    if (!expenseId) {
      return NextResponse.json({ ok: false, message: '経費IDが必要です。' }, { status: 400 });
    }

    // Partial update (isSettled, createdBy, memo)
    if (typeof isSettled === 'boolean' || body.createdBy || body.memo !== undefined || typeof body.isProvisional === 'boolean' || body.amount !== undefined || body.expenseDate) {
      const data: Record<string, unknown> = {};
      if (typeof isSettled === 'boolean') data.isSettled = isSettled;
      if (body.createdBy) data.createdBy = BigInt(body.createdBy);
      if (body.memo !== undefined) data.memo = body.memo || null;
      if (typeof body.isProvisional === 'boolean') data.isProvisional = body.isProvisional;
      if (typeof body.amount === 'number') data.amount = body.amount;
      if (body.expenseDate) data.expenseDate = new Date(body.expenseDate);
      const expense = await prisma.expense.update({
        where: { id: BigInt(expenseId) },
        data,
        include: { category: true, creator: { select: { displayName: true } } },
      });
      return NextResponse.json(serializeBigInt(expense));
    }

    // Full update
    const { expenseId: _id, ...data } = body;
    const parsed = expenseSchema.parse(data);
    const expense = await prisma.expense.update({
      where: { id: BigInt(expenseId) },
      data: {
        expenseDate: new Date(parsed.expenseDate),
        amount: parsed.amount,
        expenseCategoryId: BigInt(parsed.expenseCategoryId),
        itemName: parsed.itemName,
        payee: parsed.payee,
        memo: parsed.memo || null,
      },
      include: { category: true, creator: { select: { displayName: true } } },
    });
    return NextResponse.json(serializeBigInt(expense));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, message: 'バリデーションエラー', errors: err.errors }, { status: 400 });
    }
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { expenseId } = await request.json();
    if (!expenseId) {
      return NextResponse.json({ ok: false, message: '経費IDが必要です。' }, { status: 400 });
    }
    await prisma.expense.delete({ where: { id: BigInt(expenseId) } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}
