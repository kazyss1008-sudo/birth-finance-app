import { prisma } from '@/lib/prisma';
import { sendMail } from '@/lib/mail';
import { amount, totals, type Snapshot, TicketError } from './domain';
export function mailText(r: {
    customerName: string;
    number: string;
    lines: Snapshot[];
}, p: {
    name: string;
    venue: string;
}, s: {
    stageDate: Date | null;
    startTime: string | null;
}) {
    const date = s.stageDate;
    const stageDate = date ? `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日` : '';
    const stageTime = s.startTime ? `${s.startTime}〜` : '';
    return `${r.customerName}様\nこのたびは劇団Birthの公演をご予約いただき、ありがとうございます。\n\n公演：${p.name}\n日時：${[stageDate, stageTime].filter(Boolean).join(' ')}\n会場：${p.venue}\n予約番号：${r.number}\n申込内容\n${r.lines.map(l => `　${l.name}${l.repeater ? '（リピーター割引）' : ''}：単価${amount({ ...l, quantity: 1 })}円 × ${l.quantity}枚 = ${amount(l)}円`).join('\n')}\n合計金額：${totals(r.lines).amount}円（当日精算・全席自由）\n\n変更・キャンセルをご希望の場合は、予約番号とお名前を添えて、このメールへご返信ください。\n劇団Birth tac.birth2003@gmail.com`;
}
export async function deliverReservationMail(id: string, retry = false, reviewed = false) {
    const mail = await prisma.reservationMail.findUnique({ where: { reservationId: id } });
    if (!mail || mail.state === 'SENT')
        return;
    if (retry && ['SENDING', 'UNKNOWN'].includes(mail.state) && !reviewed)
        throw new TicketError('Gmailの送信済みを確認してから再送してください', 409);
    if (!retry && mail.state !== 'PENDING')
        return;
    // Default off: tests and previews cannot deliver mail even if credentials leak into the environment.
    if (process.env.RESERVATION_MAIL_ENABLED !== 'true' || process.env.GMAIL_USER?.trim() !== 'tac.birth2003@gmail.com' || !process.env.GMAIL_APP_PASSWORD) {
        await prisma.reservationMail.updateMany({ where: { reservationId: id, state: mail.state }, data: { state: 'UNCONFIGURED' } });
        return;
    }
    if (mail.state === 'SENDING' && mail.attemptedAt && Date.now() - mail.attemptedAt.getTime() < 120000)
        throw new TicketError('送信処理中です', 409);
    const claimed = await prisma.reservationMail.updateMany({ where: { reservationId: id, state: mail.state, attempts: mail.attempts }, data: { state: 'SENDING', attempts: { increment: 1 }, attemptedAt: new Date() } });
    if (!claimed.count)
        return;
    try {
        await sendMail(mail.recipient, mail.subject, mail.body, `reservation:${id}`);
        await prisma.reservationMail.update({ where: { reservationId: id }, data: { state: 'SENT', sentAt: new Date() } });
    }
    catch {
        // SMTP acceptance can precede a connection failure. Never automatically retry an ambiguous delivery.
        await prisma.reservationMail.update({ where: { reservationId: id }, data: { state: 'UNKNOWN' } });
    }
}
