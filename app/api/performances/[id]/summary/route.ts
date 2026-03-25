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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const performanceId = BigInt(id);

  // Fetch all needed data
  const [salesAgg, expenseAgg, sponsorAgg, casts, rules, salesByCast, goodsWithSales] = await Promise.all([
    prisma.sale.aggregate({
      where: { performanceId },
      _sum: { salesAmount: true, ticketCount: true },
    }),
    prisma.expense.aggregate({
      where: { performanceId },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.sponsorship.aggregate({
      where: { performanceId },
      _sum: { amount: true },
    }),
    prisma.cast.findMany({ where: { performanceId } }),
    prisma.ticketBackRule.findMany({ where: { performanceId }, orderBy: { stepNo: 'asc' } }),
    prisma.sale.groupBy({
      by: ['castId'],
      where: { performanceId },
      _sum: { ticketCount: true, salesAmount: true },
    }),
    prisma.goods.findMany({
      where: { performanceId },
      include: { sales: true },
    }),
  ]);

  const totalSales = salesAgg._sum.salesAmount ?? 0;
  const totalTickets = salesAgg._sum.ticketCount ?? 0;
  const totalExpenses = expenseAgg._sum.amount ?? 0;
  const totalSponsorship = sponsorAgg._sum.amount ?? 0;
  const expenseCount = expenseAgg._count;

  // Confirmed vs provisional expenses
  const [confirmedAgg, provisionalAgg] = await Promise.all([
    prisma.expense.aggregate({ where: { performanceId, isProvisional: false }, _sum: { amount: true } }),
    prisma.expense.aggregate({ where: { performanceId, isProvisional: true }, _sum: { amount: true } }),
  ]);
  const confirmedExpenses = confirmedAgg._sum.amount ?? 0;
  const provisionalExpenses = provisionalAgg._sum.amount ?? 0;

  // Calculate total goods sales
  const totalGoodsSales = goodsWithSales.reduce((sum, goods) => {
    const goodsTotal = goods.sales.reduce((s, sale) => s + sale.quantity * goods.unitPrice, 0);
    return sum + goodsTotal;
  }, 0);

  // Calculate cast settlements (back - norma for each cast)
  const castSalesMap = new Map(salesByCast.filter(s => s.castId !== null).map(s => [s.castId!.toString(), { tickets: s._sum.ticketCount ?? 0, sales: s._sum.salesAmount ?? 0 }]));
  const webSales = salesByCast.find(s => s.castId === null);
  const webTickets = webSales?._sum.ticketCount ?? 0;
  const webAmount = webSales?._sum.salesAmount ?? 0;

  let totalGara = 0;
  const castDetails = casts.map(cast => {
    const castSales = castSalesMap.get(cast.id.toString()) ?? { tickets: 0, sales: 0 };
    const backTotal = cast.isTicketBackTarget
      ? calculateTicketBack(castSales.tickets, rules.map(r => ({ minTicketCount: r.minTicketCount, maxTicketCount: r.maxTicketCount, backUnitPrice: r.backUnitPrice })))
      : 0;
    const remainingNorma = Math.max(cast.normaTicketCount - castSales.tickets, 0);
    const normaDeduction = remainingNorma * cast.normaUnitPrice;
    const settlement = backTotal - normaDeduction;
    totalGara += settlement;
    return {
      castId: cast.id,
      castName: cast.name,
      ticketCount: castSales.tickets,
      salesAmount: castSales.sales,
      backTotal,
      normaDeduction,
      settlement,
      normaTicketCount: cast.normaTicketCount,
      normaUnitPrice: cast.normaUnitPrice,
      isTicketBackTarget: cast.isTicketBackTarget,
    };
  });

  // 劇団Birthを末尾に追加
  if (webTickets > 0 || webAmount > 0) {
    castDetails.push({
      castId: BigInt(0),
      castName: '劇団Birth',
      ticketCount: webTickets,
      salesAmount: webAmount,
      backTotal: 0,
      normaDeduction: 0,
      settlement: 0,
      normaTicketCount: 0,
      normaUnitPrice: 0,
      isTicketBackTarget: false,
    });
  }

  const netBalance = totalSales + totalSponsorship + totalGoodsSales - totalExpenses - totalGara;

  return NextResponse.json(serializeBigInt({
    totalSales,
    totalTickets,
    totalExpenses,
    confirmedExpenses,
    provisionalExpenses,
    totalSponsorship,
    totalGoodsSales,
    expenseCount,
    totalGara,
    netBalance,
    castDetails,
  }));
}
