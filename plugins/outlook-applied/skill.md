# outlook-applied — read-only "have I applied?" check for the scan dashboard

Detects application-confirmation emails in your Hotmail/Outlook via Microsoft Graph
and records which tracked companies/roles you've already applied to (with the email
date) into `data/applied-index.json`. The scan dashboard reads that and shows an
**Applied?** column. Best-effort: if it's not set up, the column shows `n/a`.

## Security (why this is safe)
- **Read-only**: scope `Mail.ReadBasic` — subjects/senders/dates only, **never bodies**.
  Cannot send, delete, or modify anything. Enforced server-side by Microsoft.
- **Egress-locked**: runs through the plugin engine's guarded fetch, pinned to
  `login.microsoftonline.com` + `graph.microsoft.com` only.
- **No password stored**: OAuth device-code — you sign in on Microsoft's page; only a
  revocable refresh token is kept, in `.env` + `.token.json` (both gitignored).
- **Reactive**: only runs when you run it (or after a scan). No background process.
- **Revoke anytime**: account.microsoft.com → Privacy → Apps that can access your data.

## One-time setup (FREE — no Azure subscription, no credit card)
1. https://entra.microsoft.com → sign in with your Hotmail account.
2. **App registrations → New registration**
   - Name: `career-ops-mail-read`
   - Supported account types: **Accounts in any org directory and personal Microsoft accounts**
   - Redirect URI: leave blank → **Register**
3. Copy the **Application (client) ID**.
4. **Authentication** → set **Allow public client flows** = **Yes** → Save.
5. **API permissions → Add → Microsoft Graph → Delegated → `Mail.ReadBasic`** → Add.
6. Authorize (device-code, no password seen here):
   ```
   node plugins.local/outlook-applied/auth.mjs <client-id>
   ```
   Open the URL, enter the code, approve. It prints two lines for your `.env`:
   ```
   MSGRAPH_CLIENT_ID=...
   MSGRAPH_REFRESH_TOKEN=...
   ```
7. Enable it in `config/plugins.yml`:
   ```yaml
   outlook-applied:
     enabled: true
     months_back: 12   # first-run backfill window; later runs are incremental
   ```

## Run
```
node plugins.mjs run outlook-applied     # incremental read → updates data/applied-index.json
node output/dashboard/gen.mjs            # rebuild dashboard with Applied? badges
```
Both are local and **zero-token**. After setup, the `dashboard` workflow / a scan run
refreshes this automatically (reactive).

## Notes
- Only records applications to companies already in your `data/scan-history.tsv`, so the
  index always aligns with the dashboard.
- Incremental via `lastSync`; dedup by message id; rotated refresh tokens re-saved to
  `.token.json`. If the token lapses (~90 days idle), re-run `auth.mjs`.
- Entirely user-layer (`plugins.local/`, `config/plugins.yml`, `.env`, `data/`) — survives
  `update-system.mjs` and `git pull`.
