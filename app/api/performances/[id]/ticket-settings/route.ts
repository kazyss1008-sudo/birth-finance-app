import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { lockPerformance } from '@/lib/tickets/service';
import { TicketError } from '@/lib/tickets/domain';
import { reply, failure, checkOrigin } from '@/lib/tickets/http';
const schema = z.object({
    name: z.string().trim().min(1).max(200), ticketSalesEnabled: z.boolean(), ticketSalesStart: z.string().datetime({ offset: true }).nullable(), venue: z.string().max(500), venueMapUrl: z.union([z.literal(''), z.string().trim().max(2000).url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol), '地図URLはhttpまたはhttpsで入力してください')]).nullish(), repeaterEnabled: z.boolean(), repeaterDiscount: z.number().int().min(0).max(1000000),
    ticketTypes: z.array(z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(100), price: z.number().int().min(0).max(1000000), active: z.boolean() })).max(100),
    stages: z.array(z.object({ id: z.string().regex(/^\d+$/).optional(), stageName: z.string().trim().min(1).max(100), stageDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), capacity: z.number().int().min(0).max(100000) })).max(100)
});
export async function PUT(req: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
        checkOrigin(req);
        if (!await getSessionUser())
            throw new TicketError('ログインしてください', 401);
        const pid = BigInt((await params).id);
        const input = schema.parse(await req.json());
        await prisma.$transaction(async (tx) => {
            await lockPerformance(tx, pid);
            if (input.ticketSalesEnabled && await tx.sale.count({ where: { performanceId: pid, reservationId: null } }))
                throw new TicketError('既存CSV売上のある公演は新規受付を開始できません。既存売上を保持して移行計画を確認してください');
            const { ticketTypes, stages, ...data } = input;
            if (data.ticketSalesEnabled && (!data.ticketSalesStart || !data.venue.trim() || !ticketTypes.some(t => t.active) || !stages.length))
                throw new TicketError('販売開始日時・会場・チケット種別・公演回を設定してください');
            const existing = await tx.performanceStage.findMany({ where: { performanceId: pid } });
            if (new Set(stages.map(s => s.id).filter(Boolean)).size !== stages.filter(s => s.id).length)
                throw new TicketError('公演回が重複しています');
            await tx.performance.update({ where: { id: pid }, data: { ...data, venueMapUrl: data.venueMapUrl?.trim() || null, ticketSalesStart: data.ticketSalesStart ? new Date(data.ticketSalesStart) : null } });
            for (const t of ticketTypes) {
                if (t.id) {
                    const n = await tx.ticketType.updateMany({ where: { id: t.id, performanceId: pid }, data: { name: t.name, price: t.price, active: t.active } });
                    if (!n.count)
                        throw new TicketError('チケット種別がありません');
                }
                else
                    await tx.ticketType.create({ data: { performanceId: pid, name: t.name, price: t.price, active: t.active } });
            }
            let nextNo = Math.max(0, ...existing.map(s => s.stageNo)) + 1;
            for (const s of stages) {
                const date = new Date(s.stageDate + 'T00:00:00Z');
                if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== s.stageDate)
                    throw new TicketError('開催日を確認してください');
                if (s.id) {
                    const old = existing.find(x => String(x.id) === s.id);
                    if (!old)
                        throw new TicketError('公演回がありません');
                    const count = await tx.reservationLine.aggregate({ where: { reservation: { stageId: old.id, cancelled: false } }, _sum: { quantity: true } });
                    if (s.capacity < (count._sum.quantity ?? 0))
                        throw new TicketError('予約済み枚数より少ない定員にはできません');
                    // Keep legacy sale timestamps consistent when an administrator reschedules a stage.
                    await tx.performanceStage.update({ where: { id: old.id }, data: { stageName: s.stageName, stageDate: date, startTime: s.startTime, capacity: s.capacity } });
                    await tx.sale.updateMany({ where: { reservation: { stageId: old.id } }, data: { visitedAt: new Date(`${s.stageDate}T${s.startTime}:00Z`) } });
                }
                else {
                    await tx.performanceStage.create({ data: { performanceId: pid, stageNo: nextNo, sortOrder: nextNo++, stageName: s.stageName, stageDate: date, startTime: s.startTime, capacity: s.capacity } });
                }
            }
            await tx.performance.update({ where: { id: pid }, data: { stageCount: existing.length + stages.filter(s => !s.id).length } });
        }, { timeout: 20000 });
        return reply({ ok: true });
    }
    catch (e) {
        return failure(e);
    }
}

export async function DELETE(req: Request, {params}: {params:Promise<{id:string}>}) {
    try {
        checkOrigin(req);
        if (!await getSessionUser()) throw new TicketError('ログインしてください',401);
        const pid=BigInt((await params).id);
        const {ticketTypeId}=z.object({ticketTypeId:z.string().min(1)}).parse(await req.json());
        await prisma.$transaction(async tx=>{
            await lockPerformance(tx,pid);
            const type=await tx.ticketType.findFirst({where:{id:ticketTypeId,performanceId:pid}});
            if(!type) throw new TicketError('チケット種別がありません',404);
            const used=await tx.reservationLine.count({where:{ticketTypeId}});
            const history=await tx.reservationHistory.findFirst({where:{reservation:{performanceId:pid},OR:[{before:{path:['lines'],array_contains:[{ticketTypeId}]}},{after:{path:['lines'],array_contains:[{ticketTypeId}]}}]},select:{id:true}});
            if(used||history) throw new TicketError('予約で使用されたチケット種別は削除できません。販売を止める場合は「販売中」を外してください。',409);
            const performance=await tx.performance.findUnique({where:{id:pid},select:{ticketSalesEnabled:true}});
            if(performance?.ticketSalesEnabled&&type.active&&await tx.ticketType.count({where:{performanceId:pid,active:true}})<=1) throw new TicketError('受付中の最後のチケット種別は削除できません。先に新規受付を停止してください。',409);
            await tx.ticketType.delete({where:{id:ticketTypeId}});
        });
        return reply({ok:true});
    }catch(e){return failure(e);}
}
