// _match.mjs — application-confirmation detection + company/role extraction.
//
// VENDORED (copied, not imported) from reply-matcher.mjs so this plugin has zero
// career-ops system-layer imports and survives `update-system.mjs` unchanged.
// Everything here is pure/offline — no network, no email bodies (Mail.ReadBasic
// gives us subject + sender + date only, which is all these functions use).

export function extractDomain(emailStr) {
  if (!emailStr) return null;
  const m = String(emailStr).match(/@([\w.-]+)/);
  return m ? m[1].toLowerCase() : null;
}

export function normalizeStr(s) {
  return (s || '').toLowerCase().replace(/\s+/g, '');
}

// Substring/spacing-tolerant company match (from reply-matcher.checkCompanyMatch).
export function checkCompanyMatch(text, company) {
  if (!company || !text) return false;
  const t = String(text).toLowerCase();
  const c = String(company).toLowerCase();
  if (t.includes(c)) return true;
  const tNorm = normalizeStr(text), cNorm = normalizeStr(company);
  return cNorm.length > 2 && tNorm.includes(cNorm);
}

// ── Application-confirmation signals ──
const SUBJECT_RE = [
  /thank(s| you) for (your interest|applying|your application)/i,
  /we('| ha)?ve received your application/i,
  /your application (to|for|has been|was)/i,
  /application (has been )?(received|submitted|confirmation)/i,
  /received your application/i,
  /applying to/i,
  /application received/i,
];
// ATS / recruiting sender domains — a confirmation from these is high-signal.
const ATS_DOMAINS = [
  'greenhouse.io', 'greenhouse-mail.io', 'ashbyhq.com', 'lever.co', 'hire.lever.co',
  'myworkday.com', 'myworkdayjobs.com', 'myworkdaysite.com', 'icims.com', 'eightfold.ai',
  'smartrecruiters.com', 'workable.com', 'teamtailor.com', 'bamboohr.com', 'taleo.net',
  'successfactors.com', 'jobvite.com', 'breezy.hr', 'rippling.com', 'phenompeople.com',
];

export function isAtsSender(fromAddr) {
  const d = extractDomain(fromAddr) || '';
  return ATS_DOMAINS.some((a) => d === a || d.endsWith('.' + a));
}

/** A message looks like an application confirmation (subject signal, or ATS sender + soft subject). */
export function isConfirmation(subject, fromAddr) {
  const subj = subject || '';
  if (SUBJECT_RE.some((re) => re.test(subj))) return true;
  if (isAtsSender(fromAddr) && /appl(y|ication|ied|ying)|candidate|role|position/i.test(subj)) return true;
  return false;
}

/**
 * Pick which KNOWN company (from the scanned universe) this email is about — so the
 * recorded company always aligns with the dashboard. Checks subject then sender
 * display-name/domain. Returns the canonical company string or null.
 */
export function matchKnownCompany(subject, fromName, fromAddr, knownCompanies) {
  const hay = `${subject || ''} ${fromName || ''}`;
  // Longest names first so "Weights & Biases" wins over a stray short token.
  const sorted = [...knownCompanies].sort((a, b) => b.length - a.length);
  for (const co of sorted) {
    const bare = co.replace(/\s*\(.*\)\s*/g, '').trim();   // drop "(CoreWeave)" etc.
    if (bare.length < 3) continue;
    if (checkCompanyMatch(hay, bare)) return co;
  }
  // Sender-domain fallback: careers@snowflake.com → snowflake
  const dom = extractDomain(fromAddr);
  if (dom && !isAtsSender(fromAddr)) {
    const root = dom.split('.').slice(-2, -1)[0] || '';
    for (const co of sorted) {
      if (root.length >= 3 && normalizeStr(co).includes(root)) return co;
    }
  }
  return null;
}

/** Best-effort role extraction from the subject (for role-level, not just company-level, match). */
export function extractRole(subject) {
  const s = subject || '';
  const pats = [
    /application (?:for|to)(?: the)?\s+(.+?)(?:\s+(?:at|position|role|opening)\b|[.!—-]|$)/i,
    /applying (?:for|to)(?: the)?\s+(.+?)(?:\s+(?:at|position|role)\b|[.!—-]|$)/i,
    /your\s+(.+?)\s+application/i,
    /:\s*(.+?)(?:\s+at\s+|$)/i,
  ];
  for (const re of pats) {
    const m = s.match(re);
    if (m && m[1] && m[1].trim().length > 2 && m[1].trim().length < 90) return m[1].trim();
  }
  return '';
}
