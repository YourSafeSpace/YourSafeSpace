// POST /api/contact: sends a contact-form enquiry to Silvia by e-mail
// through Azure Communication Services.
//
// App settings (Static Web App > Environment variables):
//   ACS_CONNECTION_STRING  Communication Services resource connection string
//   MAIL_FROM              verified sender, e.g. kontakt@yoursafespace.ch
//   TURNSTILE_SECRET       Cloudflare Turnstile secret key
//
// Never log the submitted fields: enquiries can contain health information.

const { app } = require('@azure/functions');
const { EmailClient } = require('@azure/communication-email');
const { checkSubmission, buildEmail, MAX_BODY_BYTES } = require('../contact');

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

let emailClient;

app.http('contact', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { ACS_CONNECTION_STRING, MAIL_FROM, TURNSTILE_SECRET } = process.env;
    if (!ACS_CONNECTION_STRING || !MAIL_FROM || !TURNSTILE_SECRET) {
      context.error('contact: missing app settings');
      return reply(500, 'not-configured');
    }

    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return reply(413, 'too-large');
    let body;
    try { body = JSON.parse(text); } catch { return reply(400, 'invalid'); }

    const check = checkSubmission(body);
    if (!check.ok) {
      context.log('contact: rejected (' + check.reason + ')');
      return check.silent ? reply(200) : reply(400, 'invalid');
    }

    const ip = clientIp(request);
    if (!(await turnstilePasses(body.turnstileToken, ip, TURNSTILE_SECRET, context))) {
      context.log('contact: rejected (turnstile)');
      return reply(403, 'captcha');
    }

    try {
      emailClient ??= new EmailClient(ACS_CONNECTION_STRING);
      const poller = await emailClient.beginSend(buildEmail(check.fields, MAIL_FROM));
      const result = await poller.pollUntilDone();
      if (result.status !== 'Succeeded') throw new Error('status ' + result.status);
    } catch (err) {
      context.error('contact: send failed: ' + (err && err.message));
      return reply(502, 'send-failed');
    }

    context.log('contact: sent');
    return reply(200);
  },
});

async function turnstilePasses(token, ip, secret, context) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set('remoteip', ip);
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body: form });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    context.error('contact: turnstile check failed: ' + (err && err.message));
    return false;
  }
}

function clientIp(request) {
  const header = request.headers.get('x-azure-clientip') || request.headers.get('x-forwarded-for') || '';
  return header.split(',')[0].trim().replace(/:\d+$/, '');
}

function reply(status, error) {
  return { status, jsonBody: error ? { ok: false, error } : { ok: true } };
}
