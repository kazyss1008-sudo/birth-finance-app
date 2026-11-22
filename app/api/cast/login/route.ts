import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createCastSession } from '@/lib/cast-auth';
import { createHash } from 'node:crypto';
const schema = z.object({
  performanceId: z.string().regex(/^[1-9]\d{0,17}$/), castId: z.string().regex(/^[1-9]\d{0,17}$/).optional(),
  email: z.string().trim().email().max(254).transform(s => s.toLowerCase()), password: z.string().min(1).max(72),
});
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  const denied = () => NextResponse.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, { status: 401 });
  if (!parsed.success) return denied();
  const { performanceId, castId, email, password } = parsed.data;
  // Same account limit for common and legacy URLs; never retain raw email in the key.
  const window = Math.floor(Date.now() / (15 * 60 * 1000));
  const key = `cast-login:${performanceId}:${createHash('sha256').update(email).digest('hex').slice(0, 32)}:${window}`;
  const attempt = await prisma.castLoginAttempt.upsert({
    where: { key },
    create: { key, expiresAt: new Date((window + 1) * 15 * 60 * 1000) },
    update: { count: { increment: 1 } },
  });
  if (attempt.count > 10) return NextResponse.json({ error: '試行回数が多いため、15分ほど待ってからお試しください' }, { status: 429 });
  const matches = await prisma.cast.findMany({ where: { ...(castId ? { id: BigInt(castId) } : {}),
    performanceId: BigInt(performanceId), email: { equals: email, mode: 'insensitive' } }, take: 2 });
  // Never pick an arbitrary cast when the same email has been registered twice.
  const cast = matches.length === 1 ? matches[0] : null;
  if (!cast?.schedulePasswordHash) return denied();
  if (!await bcrypt.compare(password, cast.schedulePasswordHash)) return denied();
  await createCastSession(cast.id, cast.scheduleAuthVersion);
  return NextResponse.json({ ok: true });
}
