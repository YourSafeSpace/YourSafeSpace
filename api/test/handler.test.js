// Runs the real handler with Turnstile, the Entra token endpoint and Graph
// mocked out through global.fetch.
const test = require('node:test');
const assert = require('node:assert');

const functions = require('@azure/functions');
let handler;
functions.app.http = (name, options) => { handler = options.handler; };
require('../src/functions/contact');
const { resetTokenCache } = require('../src/graph');

let turnstileOk = true;
let graphStatus = 202;
const sent = [];
const tokenCalls = [];
global.fetch = async (url, init) => {
  if (url.includes('challenges.cloudflare.com')) return { json: async () => ({ success: turnstileOk }) };
  if (url.includes('login.microsoftonline.com')) {
    tokenCalls.push(url);
    return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
  }
  if (url.startsWith('https://graph.microsoft.com/')) {
    sent.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) });
    return { status: graphStatus, json: async () => ({ error: { code: 'ErrorAccessDenied' } }) };
  }
  throw new Error('unexpected fetch ' + url);
};

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
  tokenCalls.length = 0;
  turnstileOk = true;
  graphStatus = 202;
  resetTokenCache();
  Object.assign(process.env, { GRAPH_TENANT_ID: 't', GRAPH_CLIENT_ID: 'c', GRAPH_CLIENT_SECRET: 's', TURNSTILE_SECRET: 's' });
});

test('sends a valid enquiry from and to Silvia\'s mailbox', async () => {
  const res = await post(enquiry);
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://graph.microsoft.com/v1.0/users/silvia%40yoursafespace.ch/sendMail');
  assert.equal(sent[0].auth, 'Bearer tok');
  assert.equal(sent[0].body.message.toRecipients[0].emailAddress.address, 'silvia@yoursafespace.ch');
  assert.equal(sent[0].body.message.replyTo[0].emailAddress.address, 'anna@example.ch');
});

test('reuses the access token', async () => {
  await post(enquiry);
  await post(enquiry);
  assert.equal(sent.length, 2);
  assert.equal(tokenCalls.length, 1);
});

test('reports a Graph failure', async () => {
  graphStatus = 403;
  const res = await post(enquiry);
  assert.equal(res.status, 502);
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
  delete process.env.GRAPH_CLIENT_SECRET;
  assert.equal((await post(enquiry)).status, 500);
  assert.equal(sent.length, 0);
});
