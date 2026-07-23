#!/usr/bin/env node
// auth.mjs — one-time device-code login to get a READ-ONLY Microsoft Graph refresh
// token. You sign in on Microsoft's own page; your password is never seen here.
// Talks ONLY to login.microsoftonline.com (hardcoded). No local web server.
//
// Usage:
//   node plugins.local/outlook-applied/auth.mjs <client-id>
//   (or)  MSGRAPH_CLIENT_ID=<id> node plugins.local/outlook-applied/auth.mjs
//
// Get <client-id> by registering a FREE app in Microsoft Entra — see skill.md.

import { writeFileSync } from 'fs';

const CLIENT_ID = process.argv[2] || process.env.MSGRAPH_CLIENT_ID;
if (!CLIENT_ID) {
  console.error('Missing client id.\n  node plugins.local/outlook-applied/auth.mjs <client-id>\n  (register a free app in Microsoft Entra first — see skill.md)');
  process.exit(1);
}

const SCOPE = 'https://graph.microsoft.com/Mail.ReadBasic offline_access';
const DEVICE_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/devicecode';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

const form = (o) => new URLSearchParams(o);

const dcRes = await fetch(DEVICE_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: form({ client_id: CLIENT_ID, scope: SCOPE }),
});
const dc = await dcRes.json();
if (!dc.device_code) {
  console.error(`Device-code request failed: ${dc.error || dcRes.status} — ${dc.error_description || ''}`);
  process.exit(1);
}

console.log('\n──────────────────────────────────────────────');
console.log('1) Open:  ' + dc.verification_uri);
console.log('2) Enter code:  ' + dc.user_code);
console.log('   Sign in with your Hotmail account and approve READ-ONLY mail access.');
console.log('   (Your password goes only to Microsoft — never to this script.)');
console.log('──────────────────────────────────────────────\n');

const interval = (dc.interval || 5) * 1000;
const deadline = Date.now() + (dc.expires_in || 900) * 1000;

while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, interval));
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({
      client_id: CLIENT_ID,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: dc.device_code,
    }),
  });
  const t = await res.json();
  if (t.access_token && t.refresh_token) {
    writeFileSync(new URL('./.token.json', import.meta.url), JSON.stringify({ refreshToken: t.refresh_token }, null, 2));
    console.log('✅ Authorized (read-only). Token saved to plugins.local/outlook-applied/.token.json (gitignored).\n');
    console.log('Add these two lines to your .env (bootstrap + engine gate):\n');
    console.log('  MSGRAPH_CLIENT_ID=' + CLIENT_ID);
    console.log('  MSGRAPH_REFRESH_TOKEN=' + t.refresh_token + '\n');
    console.log('Then enable in config/plugins.yml and run:  node plugins.mjs run outlook-applied');
    process.exit(0);
  }
  if (t.error && t.error !== 'authorization_pending' && t.error !== 'slow_down') {
    console.error(`Auth failed: ${t.error} — ${t.error_description || ''}`);
    process.exit(1);
  }
}
console.error('Timed out waiting for authorization. Re-run to try again.');
process.exit(1);
