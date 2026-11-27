import nodemailer from 'nodemailer';
import { createHash } from 'node:crypto';

export function mailConfigured() {
  // A partially configured Gmail account must not silently use another sender.
  if (process.env.GMAIL_USER || process.env.GMAIL_APP_PASSWORD) {
    return !!(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, ''));
  }
  return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail(to: string, subject: string, text: string, key: string, html?: string) {
  if (!mailConfigured()) throw new Error('メール送信設定が未完了です');
  if (process.env.GMAIL_USER || process.env.GMAIL_APP_PASSWORD) {
    const user = process.env.GMAIL_USER!.trim();
    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user, pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s/g, '') },
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000,
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
    });
    try {
      const result = await transport.sendMail({
        from: { name: '劇団Birth', address: user }, replyTo: 'tac.birth2003@gmail.com', to, subject, text, ...(html ? { html } : {}),
        // Stable for tracing retries. SMTP itself does not guarantee deduplication.
        messageId: `<${createHash('sha256').update(key).digest('hex')}@gmail.com>`,
      });
      if (!result.accepted?.length || result.rejected?.length) throw new Error('メールを送信できませんでした');
      return;
    } catch (error) {
      // Do not log SMTP responses, addresses, message content or authentication details.
      const code = (error as { code?: string })?.code;
      const category = code === 'EAUTH' ? 'authentication' : code === 'ETIMEDOUT' ? 'timeout' : 'delivery';
      console.error('Gmail send failed', { category });
      throw new Error('メールを送信できませんでした');
    } finally {
      transport.close();
    }
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) throw new Error('メール送信設定が未完了です');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ from, to: [to], subject, text, ...(html ? { html } : {}) }), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('メールを送信できませんでした');
}
