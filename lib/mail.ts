export async function sendMail(to: string, subject: string, text: string, key: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) throw new Error('メール送信設定が未完了です');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ from, to: [to], subject, text }), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('メールを送信できませんでした');
}
