const test = require('node:test');
const assert = require('node:assert');
const { checkSubmission, buildEmail, RECIPIENT } = require('../src/contact');

const valid = () => ({
  vorname: 'Anna', nachname: 'Muster', email: 'anna@example.ch',
  telefon: '+41 79 000 00 00', waOk: true, sprache: 'Deutsch', format: 'Vor Ort',
  tag: '', nachricht: 'Hallo\nIch hätte gern einen Termin.',
  website: '', elapsedMs: 12000, turnstileToken: 'x',
});

test('accepts a normal enquiry', () => {
  const r = checkSubmission(valid());
  assert.equal(r.ok, true);
  assert.equal(r.fields.vorname, 'Anna');
  assert.equal(r.fields.waOk, true);
});

test('silently drops honeypot and too-fast submissions', () => {
  assert.deepEqual(checkSubmission({ ...valid(), website: 'http://spam' }), { ok: false, reason: 'honeypot', silent: true });
  assert.equal(checkSubmission({ ...valid(), elapsedMs: 800 }).silent, true);
  assert.equal(checkSubmission({ ...valid(), elapsedMs: '9000' }).silent, true);
});

test('rejects missing, oversized and malformed fields', () => {
  for (const body of [
    null, [], 'text',
    { ...valid(), vorname: '' },
    { ...valid(), email: 'not-an-email' },
    { ...valid(), email: 'a@b.ch\nBcc: x@y.z' },
    { ...valid(), nachname: 'Muster\r\nSubject: hi' },
    { ...valid(), nachricht: 'x'.repeat(5001) },
    { ...valid(), tag: 42 },
    { ...valid(), nachricht: 'http://a http://b http://c www.d www.e https://f' },
  ]) {
    const r = checkSubmission(body);
    assert.equal(r.ok, false, JSON.stringify(body));
    assert.equal(r.silent, false);
  }
});

test('always sends to the fixed recipient, whatever the request says', () => {
  const r = checkSubmission({ ...valid(), to: 'victim@example.com', recipient: 'x@y.z' });
  const msg = buildEmail(r.fields, 'kontakt@yoursafespace.ch');
  assert.deepEqual(msg.recipients, { to: [{ address: RECIPIENT }] });
  assert.equal(msg.replyTo[0].address, 'anna@example.ch');
  assert.match(msg.content.plainText, /Nachricht: Hallo\nIch hätte/);
  assert.match(msg.content.plainText, /Kontakt per WhatsApp: Ja/);
});
