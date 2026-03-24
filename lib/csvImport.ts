import Papa from 'papaparse';
import { z } from 'zod';

const requiredHeaders = ['取扱窓口', '枚数', '合計額', '公演日時'] as const;

const csvRowSchema = z.object({
  取扱窓口: z.string(),
  枚数: z.union([z.string(), z.number()]),
  合計額: z.string(),
  公演日時: z.string(),
  予約No: z.string().optional(),
  チケット名称: z.string().optional(),
  'お支払い方法': z.string().optional(),
  名前: z.string().optional(),
  フリガナ: z.string().optional(),
  備考: z.string().optional(),
});

function extractTicketType(ticketName: string | undefined): string | null {
  if (!ticketName) return null;
  const match = ticketName.match(/\[([^\]]+)\]/);
  return match ? match[1] : null;
}

export type ParsedSaleRow = {
  handledCastName: string;
  ticketCount: number;
  salesAmount: number;
  visitedAt: string;
  reservationNo: string | null;
  ticketType: string | null;
  paymentMethod: string | null;
  customerName: string | null;
  customerKana: string | null;
  note: string | null;
  raw: Record<string, unknown>;
  rowNo: number;
};

export function parseCp932CsvText(csvText: string) {
  const result = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  if (result.errors.length > 0) {
    throw new Error(result.errors.map((e) => `${e.row}: ${e.message}`).join('\n'));
  }

  const headers = result.meta.fields ?? [];
  for (const header of requiredHeaders) {
    if (!headers.includes(header)) {
      throw new Error(`CSVヘッダー不足: ${header}`);
    }
  }

  return result.data.map((row, index) => {
    const parsed = csvRowSchema.parse(row);
    return {
      handledCastName: parsed['取扱窓口'].trim(),
      ticketCount: Number(parsed['枚数']),
      salesAmount: Number(String(parsed['合計額']).replace(/[,円\s]/g, '')),
      visitedAt: String(parsed['公演日時']).slice(0, 10),
      reservationNo: parsed['予約No']?.trim() || null,
      ticketType: extractTicketType(parsed['チケット名称']),
      paymentMethod: parsed['お支払い方法']?.trim() || null,
      customerName: parsed['名前']?.trim() || null,
      customerKana: parsed['フリガナ']?.trim() || null,
      note: parsed['備考']?.trim() || null,
      raw: row,
      rowNo: index + 2,
    } satisfies ParsedSaleRow;
  });
}
