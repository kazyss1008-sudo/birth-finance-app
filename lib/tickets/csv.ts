import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { parseCp932CsvText } from '@/lib/csvImport';
import { TicketError, type Snapshot, totals, jsonValue } from './domain';
import { lockPerformance, mutateBooking, type Actor } from './service';
export async function importTicketCsv(pid: bigint, actor: Actor, text: string, source: string, confirmation?: string) {
    source = source.trim();
    if (!source.trim() || source.length > 60)
        throw new TicketError('取込元の名称を指定してください');
    const rows = parseCp932CsvText(text);
    if (!rows.length || rows.length > 1000)
        throw new TicketError('1〜1000行のCSVを指定してください');
    return prisma.$transaction(async (tx) => {
        await lockPerformance(tx, pid);
        if (await tx.sale.count({ where: { performanceId: pid, reservationId: null } }))
            throw new TicketError('この公演には従来CSV売上があります。従来のCSV取込を利用してください');
        const stages = await tx.performanceStage.findMany({ where: { performanceId: pid } });
        const casts = await tx.cast.findMany({ where: { performanceId: pid } });
        const groups = new Map<string, {
            number: string;
            stageId: string;
            castId: string | null;
            name: string;
            email: string;
            note: string;
            lines: Snapshot[];
        }>();
        const seenRows = new Set<string>();
        for (const r of rows) {
            const fingerprint = JSON.stringify({ ...r, rowNo: undefined, raw: undefined });
            if (seenRows.has(fingerprint))
                throw new TicketError(`${r.rowNo}行：同一行が重複しています`);
            seenRows.add(fingerprint);
            if (r.reservationNo?.startsWith('BIRTH-'))
                throw new TicketError(`${r.rowNo}行：自前予約はCSVで再登録できません`);
            if (!r.reservationNo)
                throw new TicketError(`${r.rowNo}行：予約Noが必要です`);
            if (!Number.isInteger(r.ticketCount) || r.ticketCount < 1 || !Number.isInteger(r.salesAmount) || r.salesAmount < 0)
                throw new TicketError(`${r.rowNo}行：枚数・合計額を確認してください`);
            const date = r.visitedAt.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})/);
            if (!date)
                throw new TicketError(`${r.rowNo}行：公演日時を確認してください`);
            const day = `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}`, time = `${date[4].padStart(2, '0')}:${date[5]}`;
            const matches = stages.filter(s => s.stageDate?.toISOString().slice(0, 10) === day && s.startTime === time);
            if (matches.length !== 1)
                throw new TicketError(`${r.rowNo}行：公演回を一意に照合できません`);
            const cast = ['Web', '劇団Birth'].includes(r.handledCastName) ? null : casts.find(c => c.name === r.handledCastName);
            if (cast === undefined)
                throw new TicketError(`${r.rowNo}行：取扱窓口が一致しません`);
            const key = `${pid}:${source}:${r.reservationNo}`;
            const g = groups.get(key) ?? { number: r.reservationNo, stageId: String(matches[0].id), castId: cast ? String(cast.id) : null, name: r.customerName ?? 'お名前未登録', email: String(r.raw['メールアドレス'] ?? '').trim(), note: r.note ?? '', lines: [] };
            if (g.stageId !== String(matches[0].id) || g.castId !== (cast ? String(cast.id) : null) || g.name !== (r.customerName ?? 'お名前未登録'))
                throw new TicketError(`${r.rowNo}行：同じ予約Noの公演回・取扱・名前が異なります`);
            // Legacy CSV has no reliable base price/discount fields. Preserve the exact total;
            // remainder yen become a separate card, never infer discount from a ticket name.
            const explicit = ['基本単価', '割引額', 'リピーター割引'].some(k => r.raw[k] !== undefined);
            if (explicit) {
                const basePrice = Number(r.raw['基本単価']), discount = Number(r.raw['割引額']), flag = String(r.raw['リピーター割引'] ?? '');
                if (!Number.isInteger(basePrice) || basePrice < 0 || !Number.isInteger(discount) || discount < 0 || !['有', '無'].includes(flag))
                    throw new TicketError(`${r.rowNo}行：基本単価・割引額・リピーター割引（有/無）を確認してください`);
                const l = { ticketTypeId: null, name: r.ticketType ?? 'CSV取込券', basePrice, discount, repeater: flag === '有', quantity: r.ticketCount };
                if (totals([l]).amount !== r.salesAmount)
                    throw new TicketError(`${r.rowNo}行：明細計算と合計額が一致しません`);
                g.lines.push(l);
            }
            else {
                const unit = Math.floor(r.salesAmount / r.ticketCount), remainder = r.salesAmount % r.ticketCount;
                const base = { ticketTypeId: null, name: r.ticketType ?? 'CSV取込券', basePrice: unit, discount: 0, repeater: false };
                if (r.ticketCount - remainder)
                    g.lines.push({ ...base, quantity: r.ticketCount - remainder });
                if (remainder)
                    g.lines.push({ ...base, basePrice: unit + 1, quantity: remainder });
            }
            groups.set(key, g);
        }
        const plan = [];
        for (const [key, g] of groups) {
            const old = await tx.reservation.findUnique({ where: { externalKey: key } });
            if (old && old.importSource !== source)
                throw new TicketError(`予約No ${g.number} は手入力済みです。二重取込を中止しました`);
            plan.push({ key, ...g, id: old?.id, version: old?.version, cancelled: old?.cancelled ?? false, action: old?.cancelled ? '更新（キャンセル維持）' : old ? '更新' : '追加', ...totals(g.lines) });
        }
        const token = createHash('sha256').update(JSON.stringify(jsonValue(plan))).digest('hex');
        if (!confirmation)
            return { preview: plan, token };
        if (confirmation !== token)
            throw new TicketError('取込内容または予約が変わりました。もう一度確認してください', 409);
        for (const g of plan) {
            await mutateBooking(tx, pid, actor, { requestKey: randomUUID(), version: g.version, stageId: g.stageId, castId: g.castId, source, externalNumber: g.number, customerName: g.name, email: g.email, phone: '', note: g.note, lines: [], cancelled: g.cancelled }, token, g.id, { source, lines: g.lines });
        }
        return { ok: true, count: plan.length };
    }, { maxWait: 10000, timeout: 60000 });
}
