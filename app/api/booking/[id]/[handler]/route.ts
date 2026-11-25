import { prisma } from '@/lib/prisma';
import { actorFor, saveBooking } from '@/lib/tickets/service';
import { TicketError } from '@/lib/tickets/domain';
import { reply, failure, checkOrigin } from '@/lib/tickets/http';
import { deliverReservationMail } from '@/lib/tickets/notification';
type Context = {
    params: Promise<{
        id: string;
        handler: string;
    }>;
};
export async function GET(_req: Request, { params }: Context) {
    try {
        if (process.env.TICKETS_PUBLIC_ENABLED !== 'true')
            throw new TicketError('現在受付を停止しています', 404);
        const { id, handler } = await params;
        const actor = await actorFor(BigInt(id), handler);
        const p = await prisma.performance.findUnique({ where: { id: BigInt(id) }, select: { id: true, name: true, venue: true, venueMapUrl: true, ticketSalesEnabled: true, ticketSalesStart: true, repeaterEnabled: true, repeaterDiscount: true, ticketTypes: { where: { active: true } }, stages: { orderBy: { sortOrder: 'asc' } } } });
        if (!p)
            throw new TicketError('予約ページがありません', 404);
        const cast = actor.castId ? await prisma.cast.findFirst({ where: { id: actor.castId, performanceId: p.id }, select: { name: true } }) : null;
        if (actor.castId && !cast)
            throw new TicketError('予約ページがありません', 404);
        return reply({ ...p, handlerName: cast?.name ?? '劇団Birth' });
    }
    catch (e) {
        return failure(e);
    }
}
export async function POST(req: Request, { params }: Context) {
    try {
        checkOrigin(req);
        const { id, handler } = await params;
        const r = await saveBooking(BigInt(id), await actorFor(BigInt(id), handler), await req.json());
        // A committed booking must remain a success even when delivery or its status update fails.
        try {
            await deliverReservationMail(r.id);
        }
        catch { }
        const mail = await prisma.reservationMail.findUnique({ where: { reservationId: r.id }, select: { state: true } }).catch(() => null);
        return reply({ number: r.number, mailState: mail?.state ?? 'UNKNOWN' });
    }
    catch (e) {
        return failure(e);
    }
}
