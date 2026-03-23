import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { loginId, password, confirmPassword } = await request.json();

    if (!loginId || !password) {
      return NextResponse.json({ ok: false, message: '入力が不足しています。' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ ok: false, message: 'パスワードは8文字以上にしてください。' }, { status: 400 });
    }
    if (password !== confirmPassword) {
      return NextResponse.json({ ok: false, message: 'パスワードが一致しません。' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { loginId } });
    if (!user) {
      return NextResponse.json({ ok: false, message: 'ユーザーが見つかりません。' }, { status: 404 });
    }
    if (user.passwordHash && !user.mustChangePassword) {
      return NextResponse.json({ ok: false, message: 'パスワードは設定済みです。' }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { loginId },
      data: { passwordHash: hash, mustChangePassword: false },
    });

    return NextResponse.json({ ok: true, message: 'パスワードを設定しました。ログインしてください。' });
  } catch {
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}
