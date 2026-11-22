import { z } from 'zod';
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional().or(z.literal(''));
export const scheduleInput = z.object({
  castId: z.string().regex(/^\d+$/), rehearsalId: z.string().regex(/^\d+$/),
  status: z.enum(['UNDECIDED', 'OK', 'NG', 'TIME_LIMITED']), availableFrom: time, availableTo: time,
  memo: z.string().max(2000).nullable().optional(),
}).refine(v => v.status !== 'TIME_LIMITED' || !v.availableFrom || !v.availableTo || v.availableFrom < v.availableTo,
  { message: '参加可能時間の終了は開始より後にしてください' });
export function scheduleValues(input: z.infer<typeof scheduleInput>) {
  return { status: input.status, availableFrom: input.status === 'TIME_LIMITED' ? input.availableFrom || null : null,
    availableTo: input.status === 'TIME_LIMITED' ? input.availableTo || null : null, memo: input.memo || null };
}
