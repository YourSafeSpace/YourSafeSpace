// Contact-form checks, kept free of Azure and network code so they can be
// tested on their own. The function in functions/contact.js wires them up.

// Every enquiry goes here and nowhere else. The address is never taken from
// the request, so the form cannot be used to send mail to anyone else.
const RECIPIENT = 'silvia@yoursafespace.ch';

// Real people take longer than this to fill in the form; bots usually don't.
const MIN_FILL_MS = 3000;

const MAX_BODY_BYTES = 20000;
const MAX_LINKS = 5;

// Maximum lengths per field. Fields not listed here are ignored.
const LIMITS = {
  vorname: 100,
  nachname: 100,
  email: 254,
  telefon: 40,
  sprache: 20,
  format: 60,
  tag: 100,
  nachricht: 5000,
};
const REQUIRED = ['vorname', 'nachname', 'email'];
const MULTI_LINE = ['nachricht'];

const EMAIL_RE = /^[^\s@<>()",;:\\]+@[^\s@<>()",;:\\]+\.[^\s@<>()",;:\\]+$/;
const LINK_RE = /https?:\/\/|www\./gi;

// Returns { ok: true, fields } for a submission worth sending.
// Otherwise { ok: false, reason, silent }: silent means it looks like a bot,
// and the caller should answer as if it succeeded so the bot learns nothing.
function checkSubmission(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('not-an-object');

  if (body.website) return fail('honeypot', true);
  if (typeof body.elapsedMs !== 'number' || body.elapsedMs < MIN_FILL_MS) return fail('too-fast', true);

  const fields = {};
  for (const [name, max] of Object.entries(LIMITS)) {
    const raw = body[name];
    if (raw === undefined || raw === null) { fields[name] = ''; continue; }
    if (typeof raw !== 'string') return fail('bad-type:' + name);
    const value = raw.trim();
    if (value.length > max) return fail('too-long:' + name);
    if (!MULTI_LINE.includes(name) && /[\r\n]/.test(value)) return fail('newline:' + name);
    fields[name] = value;
  }
  for (const name of REQUIRED) {
    if (!fields[name]) return fail('missing:' + name);
  }
  if (!EMAIL_RE.test(fields.email)) return fail('bad-email');

  const links = Object.values(fields).join(' ').match(LINK_RE);
  if (links && links.length > MAX_LINKS) return fail('too-many-links');

  fields.waOk = body.waOk === true;
  return { ok: true, fields };
}

function fail(reason, silent = false) {
  return { ok: false, reason, silent };
}

function buildEmail(fields, senderAddress) {
  const name = fields.vorname + ' ' + fields.nachname;
  const rows = [
    ['Name', name],
    ['E-Mail', fields.email],
    ['Telefon', fields.telefon],
    ['Kontakt per WhatsApp', fields.telefon ? (fields.waOk ? 'Ja' : 'Nein') : ''],
    ['Sprache', fields.sprache],
    ['Format', fields.format],
    ['Bevorzugter Tag', fields.tag],
    ['Nachricht', fields.nachricht],
  ].filter(([, value]) => value);

  return {
    senderAddress,
    recipients: { to: [{ address: RECIPIENT }] },
    replyTo: [{ address: fields.email, displayName: name }],
    content: {
      subject: 'Terminanfrage über yoursafespace.ch – ' + name,
      plainText: 'Terminanfrage über yoursafespace.ch\n\n'
        + rows.map(([key, value]) => key + ': ' + value).join('\n')
        + '\n\n(Mit "Antworten" geht die Antwort direkt an ' + fields.email + '.)',
    },
    userEngagementTrackingDisabled: true,
  };
}

module.exports = { checkSubmission, buildEmail, RECIPIENT, MAX_BODY_BYTES };
