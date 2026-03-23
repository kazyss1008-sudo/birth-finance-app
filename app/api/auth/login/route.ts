import { NextResponse } from 'next/server';
import { createSession, verifyLogin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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

    // Check if user needs initial password setup
    const user = await prisma.user.findUnique({ where: { loginId } });
    if (user && !user.passwordHash && user.mustChangePassword) {
      return NextResponse.json({ ok: false, message: 'パスワードが未設定です。初回パスワード設定を行ってください。', needsSetup: true }, { status: 403 });
    }

    const verified = await verifyLogin(loginId, password);
    if (!verified) {
      return NextResponse.json({ ok: false, message: 'ログインIDまたはパスワードが正しくありません。' }, { status: 401 });
    }

    await createSession(verified.loginId);
    return NextResponse.json({ ok: true, redirectTo: '/performances' });
  } catch {
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}
