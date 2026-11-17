// Sends mail through Microsoft Graph as Silvia's own Microsoft 365 mailbox,
// using an Entra app registration (client credentials, Mail.Send).
//
// App settings: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET.

const GRAPH = 'https://graph.microsoft.com/v1.0';

let cached = { token: '', expires: 0 };

async function accessToken({ tenantId, clientId, clientSecret }) {
  if (cached.token && Date.now() < cached.expires) return cached.token;
  const res = await fetch('https://login.microsoftonline.com/' + encodeURIComponent(tenantId) + '/oauth2/v2.0/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error('token ' + res.status + ' ' + (data.error || ''));
  cached = { token: data.access_token, expires: Date.now() + (Number(data.expires_in) || 3600) * 1000 - 60000 };
  return cached.token;
}

async function sendMail(mailbox, payload, credentials) {
  const token = await accessToken(credentials);
  const res = await fetch(GRAPH + '/users/' + encodeURIComponent(mailbox) + '/sendMail', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status !== 202) {
    if (res.status === 401) cached = { token: '', expires: 0 };
    const err = await res.json().catch(() => ({}));
    throw new Error('sendMail ' + res.status + ' ' + ((err.error && err.error.code) || ''));
  }
}

function resetTokenCache() { cached = { token: '', expires: 0 }; }

module.exports = { sendMail, resetTokenCache };
