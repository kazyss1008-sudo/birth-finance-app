import type { LineRehearsalDelivery } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { pushLineMessages } from '@/lib/line';
import { makeDayReport, type SavedReport } from '@/lib/rehearsal-report';
import { rehearsalImageUrl, REHEARSAL_IMAGE_LIFETIME } from '@/lib/rehearsal-image-link';

const upcoming = { performance: { status: { in: ['ACTIVE', 'PREPARING'] as ('ACTIVE' | 'PREPARING')[] } } };

export async function nextRehearsalDate(from: string) {
  const next = await prisma.rehearsal.findFirst({
    where: { ...upcoming, date: { gte: new Date(from) } }, orderBy: { date: 'asc' }, select: { date: true },
  });
  return next?.date.toISOString().slice(0, 10);
}

export async function rehearsalDelivery(id: string, day: string, target: string) {
  const existing = await prisma.lineRehearsalDelivery.findUnique({ where: { id } });
  if (existing) return existing;
  const rehearsals = await prisma.rehearsal.findMany({
    where: { ...upcoming, date: new Date(day) },
    orderBy: [{ performanceId: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
    select: {
      date: true, startTime: true, endTime: true, location: true, memo: true,
      performance: { select: { name: true, casts: { select: { id: true, name: true, roleName: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } } },
      castSchedules: { select: { castId: true, status: true, availableFrom: true, availableTo: true, memo: true } },
    },
  });
  if (!rehearsals.length) return null;
  const pages = makeDayReport(day, rehearsals.map(r => ({
    performance: r.performance.name, date: day, startTime: r.startTime, endTime: r.endTime, location: r.location, memo: r.memo,
    casts: r.performance.casts.map(c => ({ ...c, id: String(c.id) })),
    schedules: r.castSchedules.map(s => ({ ...s, castId: String(s.castId) })),
  })));
  return prisma.lineRehearsalDelivery.upsert({ where: { id }, create: { id, recipient: target, pages }, update: {} });
}

export async function sendRehearsalDelivery(
  delivery: LineRehearsalDelivery, test: boolean, stillAllowed: () => Promise<boolean>,
) {
  if (delivery.sentAt) return false;
  const secret = process.env.SESSION_SECRET;
  if (!secret || !(test ? /^U[0-9a-f]{32}$/ : /^C[0-9a-f]{32}$/).test(delivery.recipient)) {
    throw new Error('LINE画像通知の設定が未完了です');
  }
  const expiresAt = delivery.createdAt.getTime() + REHEARSAL_IMAGE_LIFETIME;
  if (expiresAt <= Date.now()) throw new Error('画像の有効期限が切れています');
  const report = delivery.pages as unknown as SavedReport;
  // Older signed image links keep working, but do not resend their potentially partial multipart delivery.
  if (Array.isArray(report) || !await stillAllowed()) return false;
  await pushLineMessages(delivery.recipient, [
    { type: 'text', text: '明日の稽古の出欠状況です！' },
    {
      type: 'image',
      originalContentUrl: rehearsalImageUrl(secret, delivery.id, 0, 'full', expiresAt),
      previewImageUrl: rehearsalImageUrl(secret, delivery.id, 0, 'preview', expiresAt),
    },
  ], `line-rehearsal/${delivery.id}/0`);
  await prisma.lineRehearsalDelivery.update({ where: { id: delivery.id }, data: { sentAt: new Date() } });
  return true;
}
