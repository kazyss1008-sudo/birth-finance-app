import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { TicketError, jsonValue } from './domain';
export const reply = (data: unknown) => NextResponse.json(jsonValue(data), {headers:{'Cache-Control':'no-store'}});
export function failure(e: unknown) {
    if (e instanceof TicketError)
        return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError)
        return NextResponse.json({ error: '入力内容を確認してください', fields: e.issues.map(i => i.path.join('.')) }, { status: 422 });
    return NextResponse.json({ error: '処理を完了できませんでした。予約一覧をご確認のうえ再試行してください' }, { status: 503 });
}
export function checkOrigin(req: Request) {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin)
        throw new TicketError('この送信元は許可されていません', 403);
}
