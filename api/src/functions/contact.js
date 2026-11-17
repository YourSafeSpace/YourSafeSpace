// POST /api/contact: sends a contact-form enquiry to Silvia by e-mail,
// from and to her own Microsoft 365 mailbox via Microsoft Graph.
//
// App settings (Static Web App > Environment variables):
//   GRAPH_TENANT_ID      Entra tenant (directory) ID
//   GRAPH_CLIENT_ID      app registration's application (client) ID
//   GRAPH_CLIENT_SECRET  app registration's client secret
//   TURNSTILE_SECRET     Cloudflare Turnstile secret key
//
// Never log the submitted fields: enquiries can contain health information.

const { app } = require('@azure/functions');
const { checkSubmission, buildEmail, RECIPIENT, MAX_BODY_BYTES } = require('../contact');
const { sendMail } = require('../graph');

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

app.http('contact', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, TURNSTILE_SECRET } = process.env;
    if (!GRAPH_TENANT_ID || !GRAPH_CLIENT_ID || !GRAPH_CLIENT_SECRET || !TURNSTILE_SECRET) {
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
      await sendMail(RECIPIENT, buildEmail(check.fields), {
        tenantId: GRAPH_TENANT_ID, clientId: GRAPH_CLIENT_ID, clientSecret: GRAPH_CLIENT_SECRET,
      });
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
