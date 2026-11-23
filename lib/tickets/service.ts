import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';
import { getCastSession } from '@/lib/cast-auth';
import { bookingInput, assertWindow, TicketError, snapshotLines, totals, jsonValue, type Snapshot } from './domain';
import { mailText } from './notification';
export type Actor = {
    kind: 'admin' | 'cast' | 'public';
    id: string;
    castId: bigint | null;
    version?: number;
};
export async function actorFor(performanceId: bigint, publicCast?: string, castOnly = false): Promise<Actor> {
    if (publicCast !== undefined)
        return { kind: 'public', id: 'public', castId: publicCast === 'birth' ? null : /^\d+$/.test(publicCast) ? BigInt(publicCast) : (() => { throw new TicketError('予約ページがありません', 404); })() };
    const admin = castOnly ? null : await getSessionUser();
    if (admin)
        return { kind: 'admin', id: String(admin.id), castId: null };
    const cast = await getCastSession();
    if (!cast || cast.performanceId !== performanceId)
        throw new TicketError('ログインしてください', 401);
    return { kind: 'cast', id: String(cast.id), castId: cast.id, version: cast.scheduleAuthVersion };
}
export async function lockPerformance(tx: Prisma.TransactionClient, id: bigint) {
    await tx.$queryRaw `SELECT id FROM performances WHERE id = ${id} FOR UPDATE`;
}
export async function saveBooking(performanceId: bigint, actor: Actor, raw: unknown, reservationId?: string) {
    const input = bookingInput.parse(raw);
    if (actor.kind === 'public' && !input.email)
        throw new TicketError('メールアドレスを入力してください');
    if (actor.kind !== 'admin') {
        input.castId = actor.castId ? String(actor.castId) : null;

        input.externalNumber = undefined;
    }
    input.source = actor.kind === 'public' ? '予約ページ' : '管理ページ';
    input.externalNumber = undefined;
    if(actor.kind !== 'public') input.email = '';
    const hash = createHash('sha256').update(JSON.stringify({ performanceId: String(performanceId), actor, input }, (_, v) => typeof v === 'bigint' ? String(v) : v)).digest('hex');
    return prisma.$transaction(async (tx) => {
        await lockPerformance(tx, performanceId);
        return mutateBooking(tx, performanceId, actor, input, hash, reservationId);
    }, { maxWait: 10000, timeout: 20000 });
}
export async function mutateBooking(tx: Prisma.TransactionClient, performanceId: bigint, actor: Actor, input: ReturnType<typeof bookingInput.parse>, hash: string, reservationId?: string, imported?: {
    source: string;
    lines: Snapshot[];
}) {
    const perf = await tx.performance.findUnique({ where: { id: performanceId }, include: { ticketTypes: true } });
    if (!perf)
        throw new TicketError('公演がありません', 404);
    if (actor.kind === 'cast') {
        await tx.$queryRaw `SELECT id FROM casts WHERE id = ${actor.castId!} FOR UPDATE`;
        const cast = await tx.cast.findUnique({ where: { id: actor.castId! } });
        if (!cast?.email || !cast.schedulePasswordHash || cast.performanceId !== performanceId || cast.scheduleAuthVersion !== actor.version)
            throw new TicketError('再ログインしてください', 401);
    }
    const old = reservationId ? await tx.reservation.findUnique({ where: { id: reservationId }, include: { lines: true, stage: true } }) : null;
    if (reservationId && (!old || old.performanceId !== performanceId || actor.kind === 'public' || (actor.kind === 'cast' && old.castId !== actor.castId)))
        throw new TicketError('予約がありません', 404);
    if (!reservationId) {
        const duplicate = await tx.reservation.findUnique({ where: { requestKey: input.requestKey } });
        if (duplicate) {
            if (duplicate.requestHash !== hash)
                throw new TicketError('送信済みの内容と異なります。予約一覧をご確認ください', 409);
            return duplicate;
        }
        if (input.cancelled)
            throw new TicketError('新規予約をキャンセル状態で登録できません');
    }
    if (actor.kind === 'public' && (process.env.TICKETS_PUBLIC_ENABLED !== 'true' || !perf.ticketSalesEnabled))
        throw new TicketError('現在受付を停止しています', 403);
    if (old && old.version !== input.version)
        throw new TicketError('他の操作で更新されました。再読み込みしてください', 409);
    const stage = await tx.performanceStage.findFirst({ where: { id: BigInt(input.stageId), performanceId } });
    if (!stage?.stageDate || !stage.startTime || stage.capacity === null)
        throw new TicketError('公演回の日時・定員を設定してください');
    assertWindow(actor.kind === 'admin', perf.ticketSalesStart, old ? [old.stage.stageDate, stage.stageDate] : [stage.stageDate]);
    if (actor.kind === 'cast' && !old && !perf.ticketSalesEnabled)
        throw new TicketError('現在受付を停止しています');
    if (!old && !imported && await tx.sale.count({ where: { performanceId, reservationId: null } }))
        throw new TicketError('既存CSV売上のある公演への予約追加には移行確認が必要です');
    const castId = actor.kind === 'admin' ? (input.castId ? BigInt(input.castId) : null) : actor.castId;
    const cast = castId ? await tx.cast.findFirst({ where: { id: castId, performanceId } }) : null;
    if (castId && !cast)
        throw new TicketError('取扱キャストがありません');
    const lines = imported?.lines ?? snapshotLines(input.lines, old?.lines ?? [], perf.ticketTypes, perf.repeaterEnabled, perf.repeaterDiscount);
    const sum = totals(lines);
    if (sum.quantity > 100 || sum.amount > 2147483647)
        throw new TicketError('予約枚数または金額が上限を超えています');
    if (!input.cancelled) {
        const count = await tx.reservationLine.aggregate({ where: { reservation: { stageId: stage.id, cancelled: false, ...(old ? { id: { not: old.id } } : {}) } }, _sum: { quantity: true } });
        if ((count._sum.quantity ?? 0) + sum.quantity > stage.capacity)
            throw new TicketError('残席が不足しています', 409);
    }
    const source = old?.source ?? (imported ? 'CSV' : actor.kind === 'public' ? '予約ページ' : '管理ページ');
    const externalKey = old?.externalKey ?? (input.externalNumber ? `${performanceId}:${imported?.source ?? source}:${input.externalNumber}` : null);
    if (!old && externalKey && await tx.reservation.findUnique({ where: { externalKey } }))
        throw new TicketError('同じ経路・外部予約番号が登録済みです', 409);
    const data = { ...(imported ? { importSource: imported.source } : {}), stageId: stage.id, castId, source, externalKey, customerName: input.customerName, email: !imported && actor.kind !== 'public' ? (old?.email ?? '') : input.email, phone: input.phone, note: input.note, cancelled: input.cancelled };
    if (old)
        await tx.reservationLine.deleteMany({ where: { reservationId: old.id } });
    const cleanLines = lines.map(l => ({ ticketTypeId: l.ticketTypeId, name: l.name, basePrice: l.basePrice, discount: l.discount, repeater: l.repeater, quantity: l.quantity }));
    const saved = old ? await tx.reservation.update({ where: { id: old.id }, data: { ...data, version: { increment: 1 }, lines: { create: cleanLines } }, include: { lines: true } }) : await tx.reservation.create({ data: { ...data, performanceId, number: `BIRTH-${randomUUID()}`, requestKey: input.requestKey, requestHash: hash, lines: { create: cleanLines } }, include: { lines: true } });
    // Recheck the time after lock waits and data work, immediately before recording results.
    assertWindow(actor.kind === 'admin', perf.ticketSalesStart, old ? [old.stage.stageDate, stage.stageDate] : [stage.stageDate]);
    await tx.reservationHistory.create({ data: { reservationId: saved.id, actor: `${actor.kind}:${actor.id}`, ...(old ? { before: jsonValue(old) as unknown as Prisma.InputJsonValue } : {}), after: jsonValue(saved) as unknown as Prisma.InputJsonValue } });
    if (saved.cancelled)
        await tx.sale.deleteMany({ where: { reservationId: saved.id } });
    else {
        // Existing finance displays wall-clock timestamps via UTC getters; preserve that convention here.
        const visitedAt = new Date(`${stage.stageDate.toISOString().slice(0, 10)}T${stage.startTime}:00Z`);
        const sale = { performanceId, castId, handledCastName: cast?.name ?? '劇団Birth', ticketCount: sum.quantity, salesAmount: sum.amount, visitedAt, sourceRowNo: 0, reservationNo: saved.number, ticketType: [...new Set(lines.map(l => l.name + (l.repeater ? '/リピーター割引' : '')))].join('・').slice(0, 100), paymentMethod: '当日精算', customerName: saved.customerName, note: saved.note };
        await tx.sale.upsert({ where: { reservationId: saved.id }, create: { ...sale, reservationId: saved.id }, update: sale });
    }
    if (!old && !imported && saved.email)
        await tx.reservationMail.create({ data: { reservationId: saved.id, recipient: saved.email, subject: `【劇団Birth】ご予約ありがとうございます｜${perf.name} ${saved.number}`, body: mailText(saved, perf, stage) } });
    assertWindow(actor.kind === 'admin', perf.ticketSalesStart, old ? [old.stage.stageDate, stage.stageDate] : [stage.stageDate]);
    return saved;
}
