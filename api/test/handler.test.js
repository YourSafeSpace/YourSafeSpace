// Runs the real handler with Turnstile and Communication Services mocked out.
const test = require('node:test');
const assert = require('node:assert');

const functions = require('@azure/functions');
let handler;
functions.app.http = (name, options) => { handler = options.handler; };

const sent = [];
const emailPath = require.resolve('@azure/communication-email');
require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: {
  EmailClient: class {
    async beginSend(message) {
      sent.push(message);
      return { pollUntilDone: async () => ({ status: 'Succeeded' }) };
    }
  },
} };

require('../src/functions/contact');

let turnstileOk = true;
global.fetch = async () => ({ json: async () => ({ success: turnstileOk }) });

const context = { log() {}, error() {} };
const post = (body) => handler({
  text: async () => JSON.stringify(body),
  headers: new Map([['x-forwarded-for', '203.0.113.7:51234']]),
}, context);
const enquiry = {
  vorname: 'Anna', nachname: 'Muster', email: 'anna@example.ch', nachricht: 'Hallo',
  website: '', elapsedMs: 9000, turnstileToken: 'token',
};

test.beforeEach(() => {
  sent.length = 0;
  turnstileOk = true;
  Object.assign(process.env, { ACS_CONNECTION_STRING: 'endpoint=https://x/;accesskey=y', MAIL_FROM: 'kontakt@yoursafespace.ch', TURNSTILE_SECRET: 's' });
});

test('sends a valid enquiry', async () => {
  const res = await post(enquiry);
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].recipients.to[0].address, 'silvia@yoursafespace.ch');
});

test('refuses when Turnstile fails', async () => {
  turnstileOk = false;
  const res = await post(enquiry);
  assert.equal(res.status, 403);
  assert.equal(sent.length, 0);
});

test('pretends success for bots but sends nothing', async () => {
  const res = await post({ ...enquiry, website: 'spam' });
  assert.equal(res.status, 200);
  assert.equal(sent.length, 0);
});

test('rejects invalid input and missing config', async () => {
  assert.equal((await post({ ...enquiry, email: 'nope' })).status, 400);
  delete process.env.TURNSTILE_SECRET;
  assert.equal((await post(enquiry)).status, 500);
  assert.equal(sent.length, 0);
});
