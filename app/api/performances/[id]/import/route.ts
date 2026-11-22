import { createHash } from 'node:crypto';
import { getSessionUser } from '@/lib/auth';
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
  if (!await getSessionUser()) return NextResponse.json({message:'ログインしてください'}, {status:401});
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

    // 取扱窓口がこれらに該当する場合は「劇団Birth売上」として扱う (castId=null、バック対象外)
    const HOUSE_CAST_NAMES = new Set(['Web', '劇団Birth']);
    const casts = await prisma.cast.findMany({ where: { performanceId } });
    const castMap = new Map(casts.map((cast) => [cast.name.trim(), cast]));
    const unmatched = rows.filter((row) => !HOUSE_CAST_NAMES.has(row.handledCastName) && !castMap.has(row.handledCastName));

    if (unmatched.length > 0) {
      return NextResponse.json({
        ok: false,
        message: `キャスト名が一致しない行が ${unmatched.length}件 あります。取り込みは中止しました。（※「Web」「劇団Birth」は劇団売上として自動処理されます）`,
        unmatchedCount: unmatched.length,
        errors: unmatched.map((row) => ({ rowNo: row.rowNo, castName: row.handledCastName })),
      }, { status: 422 });
    }

    if (rows.some(r=>!Number.isInteger(r.ticketCount)||r.ticketCount<1||!Number.isInteger(r.salesAmount)||r.salesAmount<0||!Number.isFinite(new Date(r.visitedAt).getTime()))) return NextResponse.json({message:'枚数・金額・日時を確認してください'},{status:422});
    const duplicateKeys = rows.map(r=>r.reservationNo ? JSON.stringify([r.reservationNo,r.visitedAt,r.ticketType,r.handledCastName]) : null).filter(Boolean);
    if (new Set(duplicateKeys).size !== duplicateKeys.length) return NextResponse.json({message:'同じ予約・券種の重複行があります。確認してください'},{status:422});
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM performances WHERE id = ${performanceId} FOR UPDATE`;
      const perf = await tx.performance.findUnique({where:{id:performanceId}});
      if (perf?.ticketSalesEnabled || await tx.reservation.count({where:{performanceId}})) throw new Error('予約方式の公演ではチケット管理の予約CSV取込を使用してください');
      const previous = await tx.sale.findMany({where:{performanceId},orderBy:{id:'asc'}});
      const previewToken=createHash('sha256').update(JSON.stringify(serializeBigInt({rows,previous}))).digest('hex');
      if (!formData.get('confirmation')) return {previewToken};
      if (formData.get('confirmation')!==previewToken) throw new Error('売上が変更されました。もう一度取込前確認を行ってください');
      // Delete existing sales for this performance (full replacement)
      await tx.sale.deleteMany({ where: { performanceId, reservationId: null } });
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
          castId: HOUSE_CAST_NAMES.has(row.handledCastName) ? null : castMap.get(row.handledCastName)!.id,
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

    if ('previewToken' in result) return NextResponse.json({previewToken:result.previewToken,importedRowCount:rows.length,ticketCount:rows.reduce((s,r)=>s+r.ticketCount,0),salesAmount:rows.reduce((s,r)=>s+r.salesAmount,0)});
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
