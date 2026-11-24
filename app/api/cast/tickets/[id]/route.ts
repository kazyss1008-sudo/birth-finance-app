import { prisma } from '@/lib/prisma';
import { actorFor, saveBooking, cancelBooking, deleteCancelledBooking } from '@/lib/tickets/service';
import { z } from 'zod';
import { reply, failure, checkOrigin } from '@/lib/tickets/http';
import { TicketError } from '@/lib/tickets/domain';
import { deliverReservationMail } from '@/lib/tickets/notification';
type Context = {
    params: Promise<{
        id: string;
    }>;
};
const mutationTarget = z.object({ id: z.string().uuid(), version: z.number().int().positive() });
export async function GET(_req: Request, { params }: Context) {
    try {
        const { id } = await params;
        const pid = BigInt(id);
        const actor = await actorFor(pid, undefined, new URL(_req.url).searchParams.get('scope') === 'cast');
        const performance = await prisma.performance.findUnique({ where: { id: pid }, select: { id:true,name:true,venue:true,ticketSalesEnabled:true,ticketSalesStart:true,repeaterEnabled:true,repeaterDiscount:true,ticketTypes: true, stages: { orderBy: { sortOrder: 'asc' } } } });
        if (!performance) throw new TicketError('公演がありません',404);
        const reservations = await prisma.reservation.findMany({ where: { performanceId: pid, deletedAt: null, ...(actor.kind === 'cast' ? { castId: actor.castId } : {}) }, include: { lines: true, stage: true, mail: { select: { state: true, attemptedAt: true, sentAt: true } }, history: actor.kind === 'admin' }, orderBy: { createdAt: 'desc' } });
        const casts = actor.kind === 'admin' ? await prisma.cast.findMany({ where: { performanceId: pid }, select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } }) : [];
        return reply({ performance, reservations, casts, actor });
    }
    catch (e) {
        return failure(e);
    }
}
export async function POST(req: Request, { params }: Context) {
    try {
        checkOrigin(req);
        const { id } = await params;
        const pid = BigInt(id);
        const actor = await actorFor(pid, undefined, new URL(req.url).searchParams.get('scope') === 'cast');
        const body = await req.json();
        if (body.action === 'cancel') {
            const target = mutationTarget.parse(body);
            return reply(await cancelBooking(pid, actor, target.id, target.version));
        }
        if (body.action === 'resend') {
            if (actor.kind !== 'admin')
                throw new TicketError('管理者のみ再送できます', 403);
            const r = await prisma.reservation.findFirst({ where: { id: body.id, performanceId: pid, deletedAt: null } });
            if (!r)
                throw new TicketError('予約がありません', 404);
            if (r.cancelled) throw new TicketError('キャンセル済み予約の受付メールは再送できません',409);
            await deliverReservationMail(r.id, true, body.reviewed === true);
            return reply({ ok: true });
        }
        const r = await saveBooking(pid, actor, body, body.id);
        try {
            if (!body.id) await deliverReservationMail(r.id);
        }
        catch { }
        return reply(r);
    }
    catch (e) {
        return failure(e);
    }
}

export async function DELETE(req: Request, { params }: Context) {
    try {
        checkOrigin(req);
        const pid = BigInt((await params).id);
        const actor = await actorFor(pid, undefined, new URL(req.url).searchParams.get('scope') === 'cast');
        const target = mutationTarget.parse(await req.json());
        await deleteCancelledBooking(pid, actor, target.id, target.version);
        return reply({ ok: true });
    } catch (e) { return failure(e); }
}
