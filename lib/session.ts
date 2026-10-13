// セッションCookieの署名・検証。
// Web Crypto API のみを使うため、middleware (Edge) と Node.js の両方で動く。
// Cookie の値は「<payload>.<署名>」。payload は { u: ログインID, exp: 有効期限(UNIX秒) } を base64url 化したもの。
// 署名は SESSION_SECRET による HMAC-SHA256。値を改ざん・偽造しても署名が合わず拒否される。

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function getKey(): Promise<CryptoKey | null> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null; // 未設定なら常に「未ログイン」扱い (安全側に倒す)
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signSession(loginId: string, maxAgeSec: number): Promise<string> {
  const key = await getKey();
  if (!key) throw new Error('SESSION_SECRET が設定されていません。');
  const payload = toBase64Url(
    encoder.encode(JSON.stringify({ u: loginId, exp: Math.floor(Date.now() / 1000) + maxAgeSec })),
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

/** 正しく署名され、かつ期限内なら loginId を返す。それ以外は null。 */
export async function verifySession(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const key = await getKey();
  if (!key) return null;
  const sig = fromBase64Url(parts[1]);
  if (!sig) return null;
  const ok = await crypto.subtle.verify('HMAC', key, sig as BufferSource, encoder.encode(parts[0]) as BufferSource);
  if (!ok) return null;
  const body = fromBase64Url(parts[0]);
  if (!body) return null;
  try {
    const p = JSON.parse(decoder.decode(body));
    if (typeof p.u !== 'string' || !p.u || typeof p.exp !== 'number') return null;
    if (p.exp < Math.floor(Date.now() / 1000)) return null;
    return p.u;
  } catch {
    return null;
  }
}
