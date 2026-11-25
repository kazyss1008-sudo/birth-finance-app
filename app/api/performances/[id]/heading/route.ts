import { prisma } from '@/lib/prisma';
import { actorFor } from '@/lib/tickets/service';
import { reply, failure } from '@/lib/tickets/http';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = BigInt((await params).id);
    await actorFor(id, undefined, new URL(req.url).searchParams.get('scope') === 'cast');
    return reply(await prisma.performance.findUnique({ where: { id }, select: { status: true, startDate: true, endDate: true } }));
  } catch (error) { return failure(error); }
}
