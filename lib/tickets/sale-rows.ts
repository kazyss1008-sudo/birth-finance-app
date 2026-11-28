import { amount, type Snapshot } from './domain';

type SaleWithLines = {
    id: string;
    ticketCount: number;
    salesAmount: number;
    ticketType: string | null;
    reservation?: { lines: Snapshot[] } | null;
};

// Expand only display rows; the sales ledger and accounting totals stay unchanged.
export function saleDetailRows<T extends SaleWithLines>(sales: T[]): T[] {
    return sales.flatMap(sale => sale.reservation?.lines.length ? sale.reservation.lines.map((line, index) => ({
        ...sale,
        id: `${sale.id}:line:${line.id ?? index}`,
        ticketType: line.name + (line.repeater ? '/リピーター割引' : ''),
        ticketCount: line.quantity,
        salesAmount: amount(line),
    })) : [sale]);
}
