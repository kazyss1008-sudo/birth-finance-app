import { NextResponse } from 'next/server';
import { z } from 'zod';
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

const stageSchema = z.object({
  stageNo: z.number().int().min(1),
  stageName: z.string().min(1),
  stageDate: z.string().nullable().optional(),
  sortOrder: z.number().int(),
});

const castSchema = z.object({
  name: z.string().min(1),
  normaTicketCount: z.number().int().min(0),
  normaUnitPrice: z.number().int().min(0),
  isTicketBackTarget: z.boolean(),
});

const ruleSchema = z.object({
  stepNo: z.number().int().min(1),
  minTicketCount: z.number().int().min(0),
  maxTicketCount: z.number().int().nullable(),
  backUnitPrice: z.number().int().min(0),
});

const createSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  stageCount: z.number().int().min(0).default(0),
  defaultNormaUnitPrice: z.number().int().min(0).default(0),
  stages: z.array(stageSchema).default([]),
  casts: z.array(castSchema).default([]),
  ticketBackRules: z.array(ruleSchema).default([]),
});

export async function GET() {
  // Auto-update status based on dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.performance.updateMany({
    where: { status: 'PREPARING', startDate: { lte: today } },
    data: { status: 'ACTIVE' },
  });
  await prisma.performance.updateMany({
    where: { status: 'ACTIVE', endDate: { lt: today } },
    data: { status: 'CLOSED' },
  });

  const performances = await prisma.performance.findMany({
    orderBy: { startDate: 'desc' },
  });
  return NextResponse.json(serializeBigInt(performances));
}

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());

    const result = await prisma.$transaction(async (tx) => {
      const performance = await tx.performance.create({
        data: {
          name: body.name,
          startDate: body.startDate ? new Date(body.startDate) : null,
          endDate: body.endDate ? new Date(body.endDate) : null,
          stageCount: body.stageCount,
          defaultNormaUnitPrice: body.defaultNormaUnitPrice,
        },
      });

      if (body.stages.length > 0) {
        await tx.performanceStage.createMany({
          data: body.stages.map((s) => ({
            performanceId: performance.id,
            stageNo: s.stageNo,
            stageName: s.stageName,
            stageDate: s.stageDate ? new Date(s.stageDate) : null,
            sortOrder: s.sortOrder,
          })),
        });
      }

      if (body.casts.length > 0) {
        await tx.cast.createMany({
          data: body.casts.map((c, i) => ({
            performanceId: performance.id,
            name: c.name,
            normaTicketCount: c.normaTicketCount,
            normaUnitPrice: c.normaUnitPrice,
            isTicketBackTarget: c.isTicketBackTarget,
            sortOrder: i,
          })),
        });
      }

      if (body.ticketBackRules.length > 0) {
        await tx.ticketBackRule.createMany({
          data: body.ticketBackRules.map((r) => ({
            performanceId: performance.id,
            stepNo: r.stepNo,
            minTicketCount: r.minTicketCount,
            maxTicketCount: r.maxTicketCount,
            backUnitPrice: r.backUnitPrice,
          })),
        });
      }

      return performance;
    });

    return NextResponse.json(serializeBigInt(result), { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, message: 'バリデーションエラー', errors: err.errors }, { status: 400 });
    }
    console.error('Performance POST error:', err);
    return NextResponse.json({ ok: false, message: `サーバーエラー: ${err instanceof Error ? err.message : 'Unknown'}` }, { status: 500 });
  }
}
