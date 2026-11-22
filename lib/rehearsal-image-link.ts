import { createHmac, timingSafeEqual } from 'node:crypto';

export const REHEARSAL_IMAGE_LIFETIME = 48 * 60 * 60 * 1000;
const IMAGE_ORIGIN = process.env.BIRTH_APP_URL || 'https://birth-finance-app.vercel.app';

function signature(secret: string, id: string, index: number, variant: 'full' | 'preview', exp: number) {
  return createHmac('sha256', secret).update(`line-rehearsal-image/v1/${id}/${index}/${variant}/${exp}`).digest();
}

export function rehearsalImageUrl(secret: string, id: string, index: number, variant: 'full' | 'preview', expiresAt: number) {
  const exp = Math.floor(expiresAt / 1000);
  const sig = signature(secret, id, index, variant, exp).toString('base64url');
  return `${IMAGE_ORIGIN}/api/line/rehearsal-image/${id}?page=${index}&size=${variant}&exp=${exp}&sig=${sig}`;
}

export function authorizeRehearsalImage(secret: string, id: string, params: URLSearchParams, now: number): { index: number; size: 'full' | 'preview' } | null {
  const page = params.get('page') ?? '';
  const size = params.get('size');
  const expiry = params.get('exp') ?? '';
  const sig = params.get('sig') ?? '';
  if (!secret || !/^(?:daily-\d{4}-\d{2}-\d{2}|[0-9a-f-]{36})$/.test(id)
    || !/^\d{1,5}$/.test(page) || !/^\d{10}$/.test(expiry)
    || !/^[A-Za-z0-9_-]{43}$/.test(sig) || (size !== 'full' && size !== 'preview')) return null;
  const index = Number(page);
  const exp = Number(expiry);
  const supplied = Buffer.from(sig, 'base64url');
  if (exp * 1000 <= now || !timingSafeEqual(supplied, signature(secret, id, index, size, exp))) return null;
  return { index, size };
}
