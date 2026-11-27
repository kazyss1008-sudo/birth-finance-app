const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
const state = { options: [], messages: [], closed: 0 };
Module._load = function(id, ...args) {
  if (id === 'nodemailer') return { createTransport: options => {
    state.options.push(options);
    return {
      sendMail: async message => {
        state.messages.push(message);
        if (state.error) throw state.error;
        return state.rejected ? { accepted: [], rejected: [message.to] } : { accepted: [message.to], rejected: [] };
      },
      close: () => { state.closed++; },
    };
  } };
  return originalLoad.call(this, id, ...args);
};
const { mailConfigured, sendMail } = require('../lib/mail.ts');
for (const key of ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'RESEND_API_KEY', 'MAIL_FROM']) delete process.env[key];

test('Gmail requires both settings and does not fall back when partially configured', () => {
  assert.equal(mailConfigured(), false);
  Object.assign(process.env, { RESEND_API_KEY: 'test', MAIL_FROM: 'sender@example.com' });
  assert.equal(mailConfigured(), true);
  process.env.GMAIL_USER = 'sender@gmail.com';
  assert.equal(mailConfigured(), false);
  process.env.GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop';
  assert.equal(mailConfigured(), true);
});
test('Gmail sends privately over TLS using app password, with stable message ID and cleanup', async () => {
  await sendMail('cast@example.com', '公演案内', '本人用URL', 'request/cast');
  const config = state.options.at(-1);
  assert.equal(config.host, 'smtp.gmail.com');
  assert.equal(config.port, 465);
  assert.equal(config.secure, true);
  assert.equal(config.auth.pass, 'abcdefghijklmnop');
  assert.equal(config.debug, false);
  const message = state.messages.at(-1);
  assert.deepEqual(message.from, { name: '劇団Birth', address: 'sender@gmail.com' });
  assert.equal(message.to, 'cast@example.com');
  assert.equal(message.cc, undefined);
  assert.equal(message.bcc, undefined);
  assert.equal(message.text, '本人用URL');
  await sendMail('cast@example.com', '公演案内', '本人用URL', 'request/cast');
  assert.equal(state.messages.at(-1).messageId, message.messageId);
  assert.equal(state.closed, 2);
});
test('authentication and recipient rejection fail safely and always close transport', async () => {
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args);
  try {
    state.error = Object.assign(new Error('private SMTP details'), { code: 'EAUTH' });
    await assert.rejects(sendMail('cast@example.com', 'subject', 'private body', 'key'), /メールを送信できませんでした/);
    assert.deepEqual(logs, [['Gmail send failed', { category: 'authentication' }]]);
    state.error = null;
    state.rejected = true;
    await assert.rejects(sendMail('cast@example.com', 'subject', 'body', 'key'));
    assert.equal(state.closed, 4);
    assert.equal(JSON.stringify(logs).includes('cast@example.com'), false);
    assert.equal(JSON.stringify(logs).includes('private'), false);
  } finally { console.error = originalError; }
});

test('Gmail sends HTML together with the plain text fallback', async () => {
 state.rejected=false;
 await sendMail('test@example.invalid','予約','会場：会場','html-test','<a href="https://maps.google.com/">会場地図</a>');
 assert.equal(state.messages.at(-1).text,'会場：会場');
 assert.equal(state.messages.at(-1).html,'<a href="https://maps.google.com/">会場地図</a>');
});
