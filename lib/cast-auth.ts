import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { signSession, verifySession } from '@/lib/session';

export const CAST_COOKIE = 'birth_cast_session';
export async function createCastSession(id: bigint, version: number) {
  const token = await signSession(`cast:${id}:${version}`, 60 * 60 * 8);
  (await cookies()).set(CAST_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8,
  });
}
export async function getCastSession() {
  const principal = await verifySession((await cookies()).get(CAST_COOKIE)?.value);
  const match = principal?.match(/^cast:(\d+):(\d+)$/);
  if (!match) return null;
  const cast = await prisma.cast.findUnique({ where: { id: BigInt(match[1]) } });
  if (!cast?.email || !cast.schedulePasswordHash || cast.scheduleAuthVersion !== Number(match[2])) return null;
  return cast;
}
