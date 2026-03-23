import Papa from 'papaparse';
import { z } from 'zod';

const requiredHeaders = ['取扱窓口', '枚数', '合計額', '公演日時'] as const;

const csvRowSchema = z.object({
  取扱窓口: z.string(),
  枚数: z.union([z.string(), z.number()]),
  合計額: z.string(),
  公演日時: z.string(),
});

export type ParsedSaleRow = {
  handledCastName: string;
  ticketCount: number;
  salesAmount: number;
  visitedAt: string;
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
      raw: row,
      rowNo: index + 2,
    } satisfies ParsedSaleRow;
  });
}
