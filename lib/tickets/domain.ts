import { z } from 'zod';
export const lineInput = z.object({ id: z.string().optional(), ticketTypeId: z.string(), quantity: z.number().int().min(1).max(100), repeater: z.boolean() });
export const bookingInput = z.object({
    requestKey: z.string().uuid(), version: z.number().int().positive().optional(),
    stageId: z.string().regex(/^\d+$/), castId: z.string().regex(/^\d+$/).nullable().optional(),
    source: z.string().trim().min(1).max(60).default('代理予約'), externalNumber: z.string().trim().max(100).optional(),
    customerName: z.string().trim().min(1).max(200), email: z.union([z.string().email().max(254), z.literal('')]),
    phone: z.string().max(50).default(''), note: z.string().max(2000).default(''),
    lines: z.array(lineInput).min(1).max(30), cancelled: z.boolean().default(false),
});
export type BookingInput = z.infer<typeof bookingInput>;
export type Snapshot = {
    id?: string;
    ticketTypeId: string | null;
    name: string;
    basePrice: number;
    discount: number;
    repeater: boolean;
    quantity: number;
};
export class TicketError extends Error {
    constructor(message: string, public status = 422) { super(message); }
}
export function amount(line: Snapshot) { return Math.max(line.basePrice - (line.repeater ? line.discount : 0), 0) * line.quantity; }
export function totals(lines: Snapshot[]) { return { quantity: lines.reduce((s, l) => s + l.quantity, 0), amount: lines.reduce((s, l) => s + amount(l), 0) }; }
// stageDate is a DATE, not an instant. Never use the host timezone.
export function cutoff(stageDate: Date | null) {
    if (!stageDate)
        throw new TicketError('公演回の開催日を設定してください');
    return new Date(stageDate.toISOString().slice(0, 10) + 'T00:00:00+09:00');
}
export function assertWindow(admin: boolean, start: Date | null, dates: (Date | null)[], now = new Date()) {
    if (admin)
        return;
    if (!start || now < start)
        throw new TicketError('販売開始前です');
    if (dates.some(d => now >= cutoff(d)))
        throw new TicketError('受付は終了しました。劇団へメールでご連絡ください');
}
export function snapshotLines(input: BookingInput['lines'], old: Snapshot[], types: {
    id: string;
    name: string;
    price: number;
    active: boolean;
}[], enabled: boolean, discount: number): Snapshot[] {
    const used = new Set<string>();
    return input.map(l => {
        if (l.id) {
            if (used.has(l.id))
                throw new TicketError('同じ明細を重複して保存できません');
            used.add(l.id);
            const saved = old.find(o => o.id === l.id);
            if (!saved || (saved.ticketTypeId ?? "") !== l.ticketTypeId)
                throw new TicketError('既存明細の券種は変更できません。削除して新しいカードを追加してください');
            return { ...saved, quantity: l.quantity, repeater: l.repeater };
        }
        const type = types.find(t => t.id === l.ticketTypeId && t.active);
        if (!type)
            throw new TicketError('販売中の券種を選んでください');
        if (l.repeater && !enabled)
            throw new TicketError('この公演ではリピーター割引を設定できません');
        return { ticketTypeId: type.id, name: type.name, basePrice: type.price, discount: enabled ? discount : 0, repeater: l.repeater, quantity: l.quantity };
    });
}
export function jsonValue<T>(v: T): T { return JSON.parse(JSON.stringify(v, (_, x) => typeof x === 'bigint' ? String(x) : x)); }
