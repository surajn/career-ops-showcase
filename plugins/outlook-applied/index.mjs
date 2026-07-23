// @ts-check
// outlook-applied — read-only Hotmail/Outlook "have I applied?" detector.
//
// Runs through the career-ops plugin engine, so its network is HARD-LOCKED by the
// manifest's allowedHosts (login.microsoftonline.com + graph.microsoft.com) via the
// guarded ctx.fetch (plugins/_net.mjs). Scope is Mail.ReadBasic — subjects/senders/
// dates only, NEVER bodies, and it can never send/delete/modify. Output is written
// to data/applied-index.json (the scan dashboard reads it); NOTHING is added to the
// pipeline (the ingest hook returns []).
//
// Persistent + incremental: keeps `lastSync` in the index and only queries mail
// received since then (first run backfills `months_back`, default 12). Dedup by
// message id. Rotated refresh tokens are re-saved to a gitignored .token.json.
//
// Setup: see skill.md. Run: node plugins.mjs run outlook-applied

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { isConfirmation, matchKnownCompany, extractRole } from './_match.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH = 'https://graph.microsoft.com/v1.0/me/messages';
const SCOPE = 'https://graph.microsoft.com/Mail.ReadBasic offline_access';
const INDEX_PATH = 'data/applied-index.json';
const TOKEN_STATE = join(HERE, '.token.json'); // inside plugins.local/ → gitignored

function loadJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}
function saveIndex(idx) {
  mkdirSync('data', { recursive: true });
  writeFileSync(INDEX_PATH, JSON.stringify(idx, null, 2));
}

/** Exchange the long-lived refresh token for a short-lived access token (read-only scope). */
async function getAccessToken({ clientId, clientSecret, refreshToken }, fetchFn) {
  const form = {
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPE,
  };
  if (clientSecret) form.client_secret = clientSecret;
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
  if (!res.ok) throw new Error(`outlook-applied: token refresh failed ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('outlook-applied: token refresh returned no access_token');
  return { accessToken: data.access_token, refreshToken: data.refresh_token || refreshToken };
}

/** The companies the dashboard cares about — from the scan history TSV (col 5). */
function knownCompanies() {
  const set = new Set();
  try {
    for (const line of readFileSync('data/scan-history.tsv', 'utf8').split('\n')) {
      const c = line.split('\t');
      if (!c[4] || (c[0] === 'url' && c[1] === 'first_seen')) continue;
      set.add(c[4]);
    }
  } catch { /* no history yet */ }
  return [...set];
}

/** @type {{ ingest: (ctx: any) => Promise<object[]> }} */
export default {
  async ingest(ctx) {
    const clientId = ctx?.env?.MSGRAPH_CLIENT_ID;
    const clientSecret = ctx?.env?.MSGRAPH_CLIENT_SECRET;
    const tokenState = loadJson(TOKEN_STATE, {});
    const refreshToken = tokenState.refreshToken || ctx?.env?.MSGRAPH_REFRESH_TOKEN;
    if (!clientId || !refreshToken) {
      throw new Error('outlook-applied: missing MSGRAPH_CLIENT_ID / MSGRAPH_REFRESH_TOKEN in .env — run: node plugins.local/outlook-applied/auth.mjs');
    }

    const monthsBack = Number(ctx?.settings?.months_back ?? 12);
    const idx = loadJson(INDEX_PATH, { lastSync: '', applications: [] });
    if (!Array.isArray(idx.applications)) idx.applications = [];
    const seen = new Set(idx.applications.map((a) => a.messageId).filter(Boolean));
    const sinceIso = idx.lastSync || new Date(Date.now() - monthsBack * 30 * 864e5).toISOString();

    const { accessToken, refreshToken: rotated } = await getAccessToken(
      { clientId, clientSecret, refreshToken }, ctx.fetch);
    if (rotated && rotated !== refreshToken) {
      try { writeFileSync(TOKEN_STATE, JSON.stringify({ refreshToken: rotated }, null, 2)); }
      catch (e) { ctx.log(`outlook-applied: could not persist rotated token — ${e.message}`); }
    }
    const auth = { Authorization: `Bearer ${accessToken}` };
    const known = knownCompanies();

    let url = `${GRAPH}?$select=subject,from,receivedDateTime&$top=50&$orderby=receivedDateTime desc`
      + `&$filter=receivedDateTime ge ${sinceIso}`;
    let scanned = 0, added = 0;
    while (url) {
      const data = await (await ctx.fetch(url, { headers: auth })).json();
      for (const m of (data.value || [])) {
        scanned++;
        if (seen.has(m.id)) continue;
        const subject = m.subject || '';
        const fromAddr = m.from?.emailAddress?.address || '';
        const fromName = m.from?.emailAddress?.name || '';
        if (!isConfirmation(subject, fromAddr)) continue;
        const company = matchKnownCompany(subject, fromName, fromAddr, known);
        if (!company) continue; // only record applications to companies you actually track
        idx.applications.push({
          company,
          role: extractRole(subject),
          date: (m.receivedDateTime || '').slice(0, 10),
          subject,
          source: 'email',
          messageId: m.id,
        });
        seen.add(m.id);
        added++;
      }
      url = data['@odata.nextLink'] || '';
    }

    idx.lastSync = new Date().toISOString();
    saveIndex(idx);
    ctx.log(`outlook-applied: checked ${scanned} email(s) since ${sinceIso.slice(0, 10)} → +${added} application(s); ${idx.applications.length} total in ${INDEX_PATH}.`);
    return []; // output is applied-index.json, not pipeline leads
  },
};
