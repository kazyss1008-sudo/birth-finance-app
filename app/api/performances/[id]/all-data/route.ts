import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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

  // Run all queries in parallel
  const [performance, sales, expenses, categories, users, goods, sponsorships] = await Promise.all([
    prisma.performance.findUnique({
      where: { id: performanceId },
      include: {
        stages: { orderBy: { sortOrder: 'asc' } },
        casts: { orderBy: { sortOrder: 'asc' } },
        ticketBackRules: { orderBy: { stepNo: 'asc' } },
        importHistories: { orderBy: { importedAt: 'desc' }, take: 5 },
      },
    }),
    prisma.sale.findMany({
      where: { performanceId },
      orderBy: [{ visitedAt: 'asc' }, { handledCastName: 'asc' }],
    }),
    prisma.expense.findMany({
      where: { performanceId },
      include: { category: true, creator: { select: { displayName: true } } },
      orderBy: { expenseDate: 'desc' },
    }),
    prisma.expenseCategory.findMany({ orderBy: { name: 'asc' } }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true, isActive: true },
    }),
    prisma.goods.findMany({
      where: { performanceId },
      orderBy: { sortOrder: 'asc' },
      include: { sales: { include: { performanceStage: true } } },
    }),
    prisma.sponsorship.findMany({
      where: { performanceId },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  if (!performance) {
    return NextResponse.json({ ok: false, message: '公演が見つかりません。' }, { status: 404 });
  }

  // Auto-update status
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (performance.status === 'PREPARING' && performance.startDate && performance.startDate <= today) {
    await prisma.performance.update({ where: { id: performanceId }, data: { status: 'ACTIVE' } });
    performance.status = 'ACTIVE';
  } else if (performance.status === 'ACTIVE' && performance.endDate && performance.endDate < today) {
    await prisma.performance.update({ where: { id: performanceId }, data: { status: 'CLOSED' } });
    performance.status = 'CLOSED';
  }

  // Compute summary
  const totalSales = sales.reduce((s, r) => s + r.salesAmount, 0);
  const totalTickets = sales.reduce((s, r) => s + r.ticketCount, 0);
  const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0);
  const totalSponsorships = sponsorships.reduce((s, r) => s + r.amount, 0);

  // Goods sales total
  const goodsSalesTotal = goods.reduce((total, g) => {
    const qty = g.sales.reduce((s: number, r: { quantity: number }) => s + r.quantity, 0);
    return total + qty * g.unitPrice;
  }, 0);

  // Cast-level back calculation
  const casts = performance.casts;
  const rules = performance.ticketBackRules;
  let totalGala = 0;
  const castSummaries = casts.filter(c => c.isTicketBackTarget).map(cast => {
    const castSales = sales.filter(s => s.castId === cast.id);
    const soldTickets = castSales.reduce((s, r) => s + r.ticketCount, 0);
    let backTotal = 0;
    for (const rule of rules) {
      const max = rule.maxTicketCount ?? Infinity;
      const applicable = Math.max(Math.min(soldTickets, max) - rule.minTicketCount + 1, 0);
      backTotal += applicable * rule.backUnitPrice;
    }
    const remainingNorma = Math.max(cast.normaTicketCount - soldTickets, 0);
    const normaDeduction = remainingNorma * cast.normaUnitPrice;
    const settlement = backTotal - normaDeduction;
    totalGala += settlement;
    return { castId: cast.id.toString(), name: cast.name, soldTickets, backTotal, normaDeduction, settlement };
  });

  const summary = {
    totalSales,
    totalTickets,
    totalExpenses,
    totalSponsorship: totalSponsorships,
    totalGoodsSales: goodsSalesTotal,
    totalGara: totalGala,
    netBalance: totalSales + totalSponsorships + goodsSalesTotal - totalExpenses - totalGala,
    castDetails: castSummaries,
  };

  return NextResponse.json(serializeBigInt({
    performance,
    sales,
    expenses,
    categories,
    users,
    goods,
    sponsorships,
    summary,
  }));
}
