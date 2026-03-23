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

  // Aggregate expenses by user (createdBy) SEPARATELY
  const expensesByUser = await prisma.expense.groupBy({
    by: ['createdBy'],
    where: { performanceId },
    _sum: { amount: true },
    _count: true,
  });

  // Aggregate settlements by user SEPARATELY
  const settlementsByUser = await prisma.settlement.groupBy({
    by: ['userId'],
    where: { performanceId },
    _sum: { amount: true },
    _count: true,
  });

  // Get all users who have either expenses or settlements
  const userIds = new Set<bigint>();
  expensesByUser.forEach(e => userIds.add(e.createdBy));
  settlementsByUser.forEach(s => userIds.add(s.userId));

  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(userIds) } },
    select: { id: true, displayName: true, loginId: true },
  });

  // Build per-user summary by left-joining
  const expenseMap = new Map(expensesByUser.map(e => [e.createdBy.toString(), { total: e._sum.amount ?? 0, count: e._count }]));
  const settlementMap = new Map(settlementsByUser.map(s => [s.userId.toString(), { total: s._sum.amount ?? 0, count: s._count }]));

  const result = users.map(user => {
    const exp = expenseMap.get(user.id.toString()) ?? { total: 0, count: 0 };
    const stl = settlementMap.get(user.id.toString()) ?? { total: 0, count: 0 };
    return {
      userId: user.id,
      displayName: user.displayName,
      loginId: user.loginId,
      expenseTotal: exp.total,
      expenseCount: exp.count,
      settlementTotal: stl.total,
      settlementCount: stl.count,
      balance: exp.total - stl.total,
    };
  });

  return NextResponse.json(serializeBigInt(result));
}
