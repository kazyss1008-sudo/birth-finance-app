import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateTicketBack } from '@/lib/ticketBack';

function serializeBigInt(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; castId: string }> }) {
  const { id, castId } = await params;
  const performanceId = BigInt(id);
  const castIdBig = BigInt(castId);

  const [cast, performance, rules, sales] = await Promise.all([
    prisma.cast.findUnique({ where: { id: castIdBig } }),
    prisma.performance.findUnique({ where: { id: performanceId }, select: { name: true } }),
    prisma.ticketBackRule.findMany({ where: { performanceId }, orderBy: { stepNo: 'asc' } }),
    prisma.sale.findMany({ where: { performanceId, castId: castIdBig }, orderBy: { visitedAt: 'asc' } }),
  ]);

  if (!cast || !performance) {
    return NextResponse.json({ ok: false, message: 'データが見つかりません。' }, { status: 404 });
  }

  const totalTickets = sales.reduce((sum, s) => sum + s.ticketCount, 0);
  const totalSalesAmount = sales.reduce((sum, s) => sum + s.salesAmount, 0);

  const rulesInput = rules.map(r => ({ minTicketCount: r.minTicketCount, maxTicketCount: r.maxTicketCount, backUnitPrice: r.backUnitPrice }));
  const backTotal = cast.isTicketBackTarget ? calculateTicketBack(totalTickets, rulesInput) : 0;
  const remainingNorma = Math.max(cast.normaTicketCount - totalTickets, 0);
  const normaDeduction = remainingNorma * cast.normaUnitPrice;
  const settlementAmount = backTotal - normaDeduction;

  // Back rule breakdown
  const backBreakdown = rules.map(rule => {
    const max = rule.maxTicketCount ?? totalTickets;
    const applicable = Math.max(Math.min(totalTickets, max) - rule.minTicketCount + 1, 0);
    return {
      stepNo: rule.stepNo,
      minTicketCount: rule.minTicketCount,
      maxTicketCount: rule.maxTicketCount,
      backUnitPrice: rule.backUnitPrice,
      applicableCount: applicable,
      subtotal: applicable * rule.backUnitPrice,
    };
  });

  // Sales by stage date
  const salesByDate = new Map<string, { ticketCount: number; salesAmount: number }>();
  for (const sale of sales) {
    const d = sale.visitedAt;
    const dateKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
    const existing = salesByDate.get(dateKey) ?? { ticketCount: 0, salesAmount: 0 };
    existing.ticketCount += sale.ticketCount;
    existing.salesAmount += sale.salesAmount;
    salesByDate.set(dateKey, existing);
  }

  return NextResponse.json(serializeBigInt({
    cast: {
      id: cast.id,
      name: cast.name,
      normaTicketCount: cast.normaTicketCount,
      normaUnitPrice: cast.normaUnitPrice,
      isTicketBackTarget: cast.isTicketBackTarget,
    },
    performanceName: performance.name,
    totalTickets,
    totalSalesAmount,
    backTotal,
    normaDeduction,
    settlementAmount,
    backBreakdown,
    salesByDate: Array.from(salesByDate.entries()).map(([date, data]) => ({ date, ...data })),
  }));
}
