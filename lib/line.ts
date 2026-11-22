import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function verifyLineSignature(body: string, signature: string | null, secret: string) {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  const received = Buffer.from(signature, 'base64');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

// LINE accepts a UUID retry key; derive a stable UUID for the persisted daily payload.
export function lineRetryKey(key: string) {
  const bytes = createHash('sha256').update(key).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export function lineMessages(text: string) {
  const link = `\n\nスケジュールの確認\n${process.env.BIRTH_APP_URL || 'https://birth-finance-app.vercel.app'}/performances`; 
  const suffix = '\n\n※変更件数が多いため表示を省略しています。アプリでご確認ください。';
  // One request (up to five text objects); preserve surrogate pairs at chunk boundaries.
  const limit = 24000;
  const content = text.length > limit ? text.slice(0, limit - suffix.length).replace(/[\uD800-\uDBFF]$/, '') + suffix + link : text + link;
  const parts: { type: 'text'; text: string }[] = [];
  let chunk = '';
  for (const character of content) {
    if (chunk.length + character.length > 4900) { parts.push({ type: 'text', text: chunk }); chunk = ''; }
    chunk += character;
  }
  if (chunk) parts.push({ type: 'text', text: chunk });
  return parts;
}

type LineMessage = { type: 'text'; text: string } | { type: 'image'; originalContentUrl: string; previewImageUrl: string };

export function sendLine(target: string, text: string, key: string) {
  return pushLineMessages(target, lineMessages(text), key);
}

export async function pushLineMessages(target: string, messages: LineMessage[], key: string) {
  if (!messages.length || messages.length > 5) throw new Error('LINEメッセージの件数が不正です');
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !/^[UC][0-9a-f]{32}$/.test(target)) throw new Error('LINE連携設定が未完了です');
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Line-Retry-Key': lineRetryKey(key) },
    body: JSON.stringify({ to: target, messages }), signal: AbortSignal.timeout(15000),
  });
  // 409 with this header means LINE has already accepted the same retry key.
  if (response.ok || (response.status === 409 && response.headers.has('x-line-accepted-request-id'))) return;
  throw new Error('LINEへの送信に失敗しました');
}

export async function lineDestinationName(id: string, type: 'user' | 'group') {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error('LINE destination lookup failed', { reason: 'missing_access_token' });
    throw new Error('LINE連携設定が未完了です');
  }
  const path = type === 'group' ? `/v2/bot/group/${id}/summary` : `/v2/bot/profile/${id}`;
  const response = await fetch(`https://api.line.me${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    // Log only the status: response bodies and recipient IDs can contain personal information.
    console.error('LINE destination lookup failed', { status: response.status });
    throw new Error('LINEの通知先を確認できませんでした');
  }
  const data = await response.json();
  const name = type === 'group' ? data.groupName : data.displayName;
  return typeof name === 'string' && name ? name.slice(0, 200) : (type === 'group' ? '運営グループ' : '個人のLINE');
}
