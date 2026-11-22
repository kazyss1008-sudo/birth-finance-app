import { prisma } from '@/lib/prisma';
import { authorizeRehearsalImage } from '@/lib/rehearsal-image-link';
import { renderDayReportImage, renderRehearsalImage } from '@/lib/rehearsal-image';
import type { SavedReport } from '@/lib/rehearsal-report';

export const maxDuration = 30;

function unavailable() {
  return new Response(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = authorizeRehearsalImage(process.env.SESSION_SECRET ?? '', id, new URL(request.url).searchParams, Date.now());
  if (!access) return unavailable();
  try {
    const delivery = await prisma.lineRehearsalDelivery.findUnique({ where: { id }, select: { pages: true } });
    const report = delivery?.pages as unknown as SavedReport | undefined;
    if (!report) return unavailable();
    if (Array.isArray(report)) {
      const page = report[access.index];
      if (!page) return unavailable();
      const image = await renderRehearsalImage(page, access.size);
      return new Response(await image.arrayBuffer(), { headers: image.headers });
    }
    if (access.index !== 0 || !report.cards.length) return unavailable();
    return await renderDayReportImage(report, access.size);
  } catch {
    console.error('LINE rehearsal image rendering failed');
    return new Response(null, { status: 500, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
