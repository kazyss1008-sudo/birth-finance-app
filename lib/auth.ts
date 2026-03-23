import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function verifyLogin(loginId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { loginId } });
  if (!user || !user.passwordHash) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export async function createSession(loginId: string) {
  const store = await cookies();
  store.set(process.env.SESSION_COOKIE_NAME ?? 'birth_finance_session', loginId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(process.env.SESSION_COOKIE_NAME ?? 'birth_finance_session');
}

export async function currentLoginId() {
  const store = await cookies();
  return store.get(process.env.SESSION_COOKIE_NAME ?? 'birth_finance_session')?.value ?? null;
}

export async function getSessionUser() {
  const loginId = await currentLoginId();
  if (!loginId) return null;
  return prisma.user.findUnique({ where: { loginId } });
}
