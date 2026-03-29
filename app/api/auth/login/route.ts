import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET = warmup (same function as POST so cold start is shared)
export async function GET() {
  await prisma.$queryRawUnsafe('SELECT 1');
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    let loginId: string, password: string;

    if (contentType.includes('application/json')) {
      const body = await request.json();
      loginId = String(body.loginId ?? '');
      password = String(body.password ?? '');
    } else {
      const formData = await request.formData();
      loginId = String(formData.get('loginId') ?? '');
      password = String(formData.get('password') ?? '');
    }

    if (!loginId || !password) {
      return NextResponse.json({ ok: false, message: 'ログインIDとパスワードを入力してください。' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { loginId } });

    if (!user) {
      return NextResponse.json({ ok: false, message: 'ログインIDまたはパスワードが正しくありません。' }, { status: 401 });
    }

    if (!user.passwordHash && user.mustChangePassword) {
      return NextResponse.json({ ok: false, message: 'パスワードが未設定です。初回パスワード設定を行ってください。', needsSetup: true }, { status: 403 });
    }

    if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return NextResponse.json({ ok: false, message: 'ログインIDまたはパスワードが正しくありません。' }, { status: 401 });
    }

    await createSession(user.loginId);
    return NextResponse.json({ ok: true, redirectTo: '/performances' });
  } catch {
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}
