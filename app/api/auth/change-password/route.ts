import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { currentLoginId } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const loginId = await currentLoginId();
    if (!loginId) {
      return NextResponse.json({ ok: false, message: 'ログインしてください。' }, { status: 401 });
    }

    const { currentPassword, newPassword, confirmPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ ok: false, message: '現在のパスワードと新しいパスワードを入力してください。' }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ ok: false, message: '新しいパスワードは8文字以上にしてください。' }, { status: 400 });
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ ok: false, message: '新しいパスワードが一致しません。' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { loginId } });
    if (!user || !user.passwordHash) {
      return NextResponse.json({ ok: false, message: 'ユーザーが見つかりません。' }, { status: 404 });
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ ok: false, message: '現在のパスワードが正しくありません。' }, { status: 401 });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { loginId },
      data: { passwordHash: hash },
    });

    return NextResponse.json({ ok: true, message: 'パスワードを変更しました。' });
  } catch {
    return NextResponse.json({ ok: false, message: 'サーバーエラーが発生しました。' }, { status: 500 });
  }
}
