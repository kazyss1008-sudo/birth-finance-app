import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
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

const createSchema = z.object({
  loginId: z.string().min(1).max(100),
  displayName: z.string().min(1).max(100),
  password: z.string().min(8),
});

const updateSchema = z.object({
  userId: z.string(),
  displayName: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export async function GET() {
  const users = await prisma.user.findMany({
    select: { id: true, loginId: true, displayName: true, isActive: true, mustChangePassword: true, createdAt: true },
    orderBy: { id: 'asc' },
  });
  return NextResponse.json(serializeBigInt(users));
}

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());

    const existing = await prisma.user.findUnique({ where: { loginId: body.loginId } });
    if (existing) {
      return NextResponse.json({ ok: false, message: 'このログインIDは既に使用されています。' }, { status: 409 });
    }

    const hash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: {
        loginId: body.loginId,
        displayName: body.displayName,
        passwordHash: hash,
        mustChangePassword: false,
      },
      select: { id: true, loginId: true, displayName: true, isActive: true, mustChangePassword: true, createdAt: true },
    });
    return NextResponse.json(serializeBigInt(user), { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, message: 'バリデーションエラー', errors: err.errors }, { status: 400 });
    }
    console.error('User POST error:', err);
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = updateSchema.parse(await request.json());
    const data: Record<string, unknown> = {};
    if (body.displayName !== undefined) data.displayName = body.displayName;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, 10);

    const user = await prisma.user.update({
      where: { id: BigInt(body.userId) },
      data,
      select: { id: true, loginId: true, displayName: true, isActive: true, mustChangePassword: true, createdAt: true },
    });
    return NextResponse.json(serializeBigInt(user));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, message: 'バリデーションエラー', errors: err.errors }, { status: 400 });
    }
    console.error('User PUT error:', err);
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ ok: false, message: 'ユーザーIDが必要です。' }, { status: 400 });
    }
    // Don't allow deleting admin (id=1)
    if (BigInt(userId) === BigInt(1)) {
      return NextResponse.json({ ok: false, message: '管理者アカウントは削除できません。' }, { status: 403 });
    }
    await prisma.user.update({
      where: { id: BigInt(userId) },
      data: { isActive: false },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}
