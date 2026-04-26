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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get('all') === '1';
  const categories = await prisma.expenseCategory.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  return NextResponse.json(serializeBigInt(categories));
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());
    const existing = await prisma.expenseCategory.findUnique({ where: { name: body.name } });
    if (existing) {
      if (!existing.isActive) {
        const reactivated = await prisma.expenseCategory.update({ where: { id: existing.id }, data: { isActive: true } });
        return NextResponse.json(serializeBigInt(reactivated));
      }
      return NextResponse.json({ ok: false, message: 'このカテゴリは既に存在します。' }, { status: 409 });
    }
    const max = await prisma.expenseCategory.findFirst({ orderBy: { sortOrder: 'desc' } });
    const next = (max?.sortOrder ?? 0) + 1;
    const cat = await prisma.expenseCategory.create({
      data: { name: body.name, sortOrder: next, isActive: true },
    });
    return NextResponse.json(serializeBigInt(cat), { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, message: 'バリデーションエラー', errors: err.errors }, { status: 400 });
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('ExpenseCategory POST error:', errMsg);
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。', detail: errMsg }, { status: 500 });
  }
}

const updateSchema = z.object({
  categoryId: z.string(),
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PUT(request: Request) {
  try {
    const body = updateSchema.parse(await request.json());
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
    const cat = await prisma.expenseCategory.update({
      where: { id: BigInt(body.categoryId) },
      data,
    });
    return NextResponse.json(serializeBigInt(cat));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, message: 'バリデーションエラー', errors: err.errors }, { status: 400 });
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('ExpenseCategory PUT error:', errMsg);
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。', detail: errMsg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { categoryId } = await request.json();
    if (!categoryId) {
      return NextResponse.json({ ok: false, message: 'カテゴリIDが必要です。' }, { status: 400 });
    }
    // Soft delete: 既存経費の参照を保つため isActive=false にするだけ
    const usedCount = await prisma.expense.count({ where: { expenseCategoryId: BigInt(categoryId) } });
    if (usedCount > 0) {
      // 使用中なら無効化
      await prisma.expenseCategory.update({
        where: { id: BigInt(categoryId) },
        data: { isActive: false },
      });
      return NextResponse.json({ ok: true, softDeleted: true, message: `${usedCount}件の経費で使用中のため、無効化しました。` });
    }
    // 未使用なら物理削除
    await prisma.expenseCategory.delete({ where: { id: BigInt(categoryId) } });
    return NextResponse.json({ ok: true, softDeleted: false });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('ExpenseCategory DELETE error:', errMsg);
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。', detail: errMsg }, { status: 500 });
  }
}
