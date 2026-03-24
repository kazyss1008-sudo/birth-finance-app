import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseCp932CsvText } from '@/lib/csvImport';

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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const performanceId = BigInt(id);

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: 'CSVファイルがありません。' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    let text: string;
    try {
      text = new TextDecoder('shift-jis').decode(arrayBuffer);
    } catch {
      text = new TextDecoder('utf-8').decode(arrayBuffer);
    }

    let rows;
    try {
      rows = parseCp932CsvText(text);
    } catch (err) {
      return NextResponse.json({ ok: false, message: `CSV解析エラー: ${err instanceof Error ? err.message : 'Unknown'}` }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, message: 'CSVにデータ行がありません。' }, { status: 400 });
    }

    const casts = await prisma.cast.findMany({ where: { performanceId } });
    const castMap = new Map(casts.map((cast) => [cast.name.trim(), cast]));
    const unmatched = rows.filter((row) => !castMap.has(row.handledCastName));

    if (unmatched.length > 0) {
      return NextResponse.json({
        ok: false,
        message: `キャスト不一致: ${unmatched.length}件。全件ロールバックしました。`,
        unmatchedCount: unmatched.length,
        errors: unmatched.map((row) => ({ rowNo: row.rowNo, castName: row.handledCastName })),
      }, { status: 422 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Delete existing sales for this performance (full replacement)
      await tx.sale.deleteMany({ where: { performanceId } });
      await tx.salesRawRow.deleteMany({
        where: { importHistory: { performanceId } },
      });
      await tx.salesImportHistory.deleteMany({ where: { performanceId } });

      const history = await tx.salesImportHistory.create({
        data: {
          performanceId,
          fileName: file.name,
          fileEncoding: 'CP932',
          importedRowCount: rows.length,
          insertedSalesCount: rows.length,
          status: 'SUCCESS',
        },
      });

      await tx.salesRawRow.createMany({
        data: rows.map((row) => ({
          importHistoryId: history.id,
          rowNo: row.rowNo,
          rawJson: row.raw,
        })),
      });

      await tx.sale.createMany({
        data: rows.map((row) => ({
          performanceId,
          importHistoryId: history.id,
          castId: castMap.get(row.handledCastName)!.id,
          handledCastName: row.handledCastName,
          ticketCount: row.ticketCount,
          salesAmount: row.salesAmount,
          visitedAt: new Date(row.visitedAt),
          sourceRowNo: row.rowNo,
          reservationNo: row.reservationNo,
          ticketType: row.ticketType,
          paymentMethod: row.paymentMethod,
          customerName: row.customerName,
          customerKana: row.customerKana,
          note: row.note,
        })),
      });

      return history;
    });

    return NextResponse.json(serializeBigInt({
      ok: true,
      importHistoryId: result.id,
      importedRowCount: rows.length,
      message: `${rows.length}件の売上データを取り込みました。`,
    }));
  } catch (err) {
    return NextResponse.json({ ok: false, message: `取込エラー: ${err instanceof Error ? err.message : 'Unknown'}` }, { status: 500 });
  }
}
