#!/usr/bin/env node
/**
 * output/dashboard/gen.mjs — career-ops scan dashboard generator (USER-LAYER).
 *
 * Renders data/scan-history.tsv into a single self-contained, offline HTML page
 * you browse by scan date (latest first). Two tiers per date (Director & above /
 * Senior Manager & below), live job links, Bay-Area/Remote/US tags, and a
 * MANUAL per-role Status you set yourself (Interested / Applied / Interviewing /
 * Offer / Not a fit / Not interested / Rejected).
 *
 * STATUS PERSISTENCE (no server, no tokens):
 *   - Saved in your browser (localStorage, keyed by job URL) → survives page
 *     reloads AND scan regenerations automatically.
 *   - "Export statuses" downloads role-status.json; drop it at data/role-status.json
 *     and this generator re-seeds from it on every rebuild — a durable, file-level
 *     record that survives even a browser reset. localStorage overrides the seed.
 *
 * DURABILITY: this file + its output live under output/ (gitignored, in the
 * updater's USER_PATHS never-touch list); data/role-status.json is gitignored too.
 * Zero imports from career-ops system code, so updates can't break it.
 *
 * Run:  node output/dashboard/gen.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));      // output/dashboard/
const ROOT = resolve(HERE, '../../');                       // repo root
const HISTORY = join(ROOT, 'data', 'scan-history.tsv');
const STATUS_FILE = join(ROOT, 'data', 'role-status.json');
const OUT = join(HERE, 'index.html');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Seniority split: Director & above vs Senior Manager & below ──
const isDirectorPlus = (title) =>
  /\bdirector\b|\bvp\b|\bvice president\b|\bhead of\b|\bhead,|\bchief\b/i.test(title || '');

// ── Location tag. Bay-Area cities only get "bay"; \bca\b avoids matching "Canada". ──
const BAY_CITIES = ['bay area', 'san francisco', 'san jose', 'menlo park', 'palo alto',
  'santa clara', 'sunnyvale', 'mountain view', 'san mateo', 'redwood city', 'oakland',
  'fremont', 'foster city', 'milpitas', 'los gatos', 'cupertino', 'pleasanton',
  'emeryville', 'burlingame', 'san ramon', 'south san francisco'];
function geo(loc) {
  const l = (loc || '').toLowerCase();
  if (BAY_CITIES.some((c) => l.includes(c))) return 'bay';
  if (l.includes('remote')) return 'remote';
  if (l.includes('california') || /\bca\b/.test(l) || l.includes('united states')
      || l.includes('usa') || /\bus\b/.test(l)) return 'us';
  return 'elsewhere';
}
const GEO_LABEL = { bay: 'Bay Area', remote: 'Remote', us: 'US', elsewhere: 'Other' };

// ── Manual status options (value → label). Extend this list any time. ──
const STATUSES = [
  ['', '— set status —'],
  ['interested', 'Interested'],
  ['applied', 'Applied'],
  ['interviewing', 'Interviewing'],
  ['offer', 'Offer'],
  ['notfit', 'Not a fit'],
  ['notinterested', 'Not interested'],
  ['rejected', 'Rejected'],
];
const STATUS_OPTIONS = STATUSES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');

// Durable seed from data/role-status.json (localStorage overrides it in-browser).
function loadStatusSeed() {
  try { return JSON.parse(readFileSync(STATUS_FILE, 'utf8')).statuses || {}; }
  catch { return {}; }
}
const STATUS_SEED = loadStatusSeed();

// ── Parse scan-history.tsv → rows added, grouped by first_seen date ──
function loadByDate() {
  let raw;
  try { raw = readFileSync(HISTORY, 'utf8'); }
  catch { return { byDate: new Map(), total: 0 }; }
  const byDate = new Map();
  let total = 0;
  for (const line of raw.split('\n').filter(Boolean)) {
    const c = line.split('\t');   // url, first_seen, portal, title, company, status, location, ...
    if (c[0] === 'url' && c[1] === 'first_seen') continue;
    const [url, date, , title, company, status, location] = c;
    if (status !== 'added' || !date || !url || !title) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({ url, title: title || '', company: company || '', location: location || '' });
    total++;
  }
  return { byDate, total };
}

function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function rowHtml(r, i) {
  const g = geo(r.location);
  const search = (r.company + ' ' + r.title + ' ' + r.location).toLowerCase();
  return `<tr data-s="${esc(search)}" data-status="" data-i="${i}"><td class="c-co">${esc(r.company)}</td>`
    + `<td class="c-role"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}`
    + `<span class="ext" aria-hidden="true">↗</span></a></td>`
    + `<td class="c-loc"><span class="geo geo-${g}">${GEO_LABEL[g]}</span>`
    + `<span class="loc-txt">${esc(r.location) || '—'}</span></td>`
    + `<td class="c-st"><select class="stsel" data-url="${esc(r.url)}" aria-label="Set status for ${esc(r.title)}">${STATUS_OPTIONS}</select></td></tr>`;
}

function tierTable(title, rows) {
  if (!rows.length) return '';
  const body = rows
    .sort((a, b) => a.company.localeCompare(b.company) || a.title.localeCompare(b.title))
    .map((r, i) => rowHtml(r, i)).join('');
  const cls = title.startsWith('Director') ? 'tier-dir' : 'tier-mgr';
  return `<div class="tier ${cls}"><div class="tier-head"><h3>${title}</h3>`
    + `<span class="tier-count">${rows.length}</span></div>`
    + `<div class="tw"><table><thead><tr><th class="c-co">Company</th>`
    + `<th class="c-role">Role</th><th class="c-loc">Location</th><th class="c-st">Status</th></tr></thead>`
    + `<tbody>${body}</tbody></table></div></div>`;
}

const { byDate, total } = loadByDate();
const dates = [...byDate.keys()].sort().reverse();

const railHtml = dates.map((d, i) => {
  const rows = byDate.get(d);
  const dir = rows.filter((r) => isDirectorPlus(r.title)).length;
  const bay = rows.filter((r) => geo(r.location) === 'bay').length;
  return `<button class="rail-item${i === 0 ? ' active' : ''}" data-date="${esc(d)}">`
    + `<span class="rail-date">${esc(fmtDate(d))}</span>`
    + `<span class="rail-meta"><span class="rail-n">${rows.length}</span> roles`
    + `${dir ? ` · ${dir} dir` : ''}${bay ? ` · ${bay} bay` : ''}</span></button>`;
}).join('');

const selectHtml = dates.map((d, i) =>
  `<option value="${esc(d)}"${i === 0 ? ' selected' : ''}>${esc(fmtDate(d))} — ${byDate.get(d).length} roles</option>`
).join('');

const daysHtml = dates.map((d, i) => {
  const rows = byDate.get(d);
  const dir = rows.filter((r) => isDirectorPlus(r.title));
  const mgr = rows.filter((r) => !isDirectorPlus(r.title));
  const bay = rows.filter((r) => geo(r.location) === 'bay').length;
  return `<section class="day${i === 0 ? '' : ' hidden'}" data-date="${esc(d)}">
    <div class="day-head"><h2>${esc(fmtDate(d))}</h2>
      <div class="chips"><span class="chip">${rows.length} roles</span>
      <span class="chip chip-dir">${dir.length} Director+</span>
      <span class="chip chip-bay">${bay} Bay Area</span>
      <span class="chip chip-st" hidden></span></div></div>
    ${tierTable('Director &amp; above', dir)}
    ${tierTable('Senior Manager &amp; below', mgr)}
    <p class="day-empty" hidden>No roles match on this date.</p>
  </section>`;
}).join('\n');

const statusFilterOptions = ['<option value="">All statuses</option>',
  '<option value="__set">Any status set</option>', '<option value="__none">No status</option>']
  .concat(STATUSES.filter(([v]) => v).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`)).join('');

const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>career-ops · scan dashboard</title>
<style>
:root{
  --ground:#f5f6f8;--surface:#fff;--surface-2:#fafbfc;--ink:#1a1e27;--muted:#5c6473;
  --faint:#8b93a2;--border:#e3e6ec;--accent:#3a49d0;--accent-weak:#edeffc;--gold:#9a6b12;
  --bay:#0f7a4f;--bay-bg:#e4f3ea;--remote:#6b5cc9;--remote-bg:#ecebfa;
  --us:#2b6aa8;--us-bg:#e6f0f9;--else:#9a6a12;--else-bg:#f6eddb;--danger:#b3261e;--danger-bg:#fbe9e7;
  --shadow:0 1px 2px rgba(20,25,40,.05),0 4px 16px rgba(20,25,40,.05);
  --sans:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
@media (prefers-color-scheme:dark){:root{
  --ground:#101217;--surface:#191c22;--surface-2:#1e222a;--ink:#e7e9ef;--muted:#9aa2b1;
  --faint:#6b7382;--border:#2a2e38;--accent:#8f9dff;--accent-weak:#20243a;--gold:#e0ad55;
  --bay:#5cd39a;--bay-bg:#123023;--remote:#a9a0ff;--remote-bg:#221f3a;
  --us:#79b2e6;--us-bg:#152838;--else:#e0ad55;--else-bg:#32270f;--danger:#f2b8b5;--danger-bg:#3a1614;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 4px 18px rgba(0,0,0,.35);
}}
:root[data-theme="light"]{--ground:#f5f6f8;--surface:#fff;--surface-2:#fafbfc;--ink:#1a1e27;--muted:#5c6473;--faint:#8b93a2;--border:#e3e6ec;--accent:#3a49d0;--accent-weak:#edeffc;--gold:#9a6b12;--bay:#0f7a4f;--bay-bg:#e4f3ea;--remote:#6b5cc9;--remote-bg:#ecebfa;--us:#2b6aa8;--us-bg:#e6f0f9;--else:#9a6a12;--else-bg:#f6eddb;--danger:#b3261e;--danger-bg:#fbe9e7;}
:root[data-theme="dark"]{--ground:#101217;--surface:#191c22;--surface-2:#1e222a;--ink:#e7e9ef;--muted:#9aa2b1;--faint:#6b7382;--border:#2a2e38;--accent:#8f9dff;--accent-weak:#20243a;--gold:#e0ad55;--bay:#5cd39a;--bay-bg:#123023;--remote:#a9a0ff;--remote-bg:#221f3a;--us:#79b2e6;--us-bg:#152838;--else:#e0ad55;--else-bg:#32270f;--danger:#f2b8b5;--danger-bg:#3a1614;}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased;}
.wrap{max-width:1180px;margin:0 auto;padding:32px 22px 72px;}
header{margin-bottom:20px;}
.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);font-weight:600;margin:0 0 7px;}
h1{font-size:26px;letter-spacing:-.02em;margin:0 0 4px;font-weight:700;}
.sub{color:var(--muted);margin:0;font-size:14px;}
.layout{display:grid;grid-template-columns:236px 1fr;gap:24px;margin-top:22px;align-items:start;}
.rail{position:sticky;top:16px;display:flex;flex-direction:column;gap:6px;}
.rail-lab{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);font-weight:600;margin:0 0 4px 2px;}
.rail-item{text-align:left;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 13px;cursor:pointer;color:var(--ink);display:flex;flex-direction:column;gap:2px;font-family:inherit;transition:border-color .12s,background .12s;}
.rail-item:hover{border-color:var(--accent);}
.rail-item.active{border-color:var(--accent);background:var(--accent-weak);box-shadow:var(--shadow);}
.rail-date{font-weight:600;font-size:14px;}
.rail-meta{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;}
.rail-n{color:var(--accent);font-weight:600;}
.mobile-nav{display:none;}
.toolbar{display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap;}
#q{flex:1;min-width:180px;font-family:inherit;font-size:14px;color:var(--ink);background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 13px;outline:none;}
#q:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-weak);}
#stfilter,#sortsel{font-family:inherit;font-size:13px;color:var(--ink);background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:8px 11px;cursor:pointer;}
.chip-st{color:var(--accent);background:var(--accent-weak);border-color:transparent;}
.btn{font-family:inherit;font-size:13px;font-weight:600;color:var(--ink);background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:8px 13px;cursor:pointer;white-space:nowrap;}
.btn:hover{border-color:var(--accent);color:var(--accent);}
.savednote{font-size:12px;color:var(--faint);margin:-6px 0 16px;}
.day-head{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:14px;}
.day-head h2{font-size:20px;margin:0;letter-spacing:-.01em;}
.chips{display:flex;gap:7px;flex-wrap:wrap;}
.chip{font-size:12px;font-weight:600;color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:2px 11px;font-variant-numeric:tabular-nums;}
.chip-dir{color:var(--gold);}.chip-bay{color:var(--bay);}
.tier{margin-bottom:24px;}
.tier-head{display:flex;align-items:center;gap:10px;margin-bottom:9px;}
.tier-head h3{font-size:15px;margin:0;font-weight:700;letter-spacing:-.01em;}
.tier-count{font-size:12px;font-weight:600;color:var(--accent);background:var(--accent-weak);border-radius:20px;padding:1px 9px;}
.tier-dir .tier-head h3{color:var(--gold);} .tier-dir .tier-count{color:var(--gold);background:var(--else-bg);}
.tw{overflow-x:auto;border:1px solid var(--border);border-radius:12px;background:var(--surface);box-shadow:var(--shadow);}
table{width:100%;border-collapse:collapse;font-size:14px;min-width:640px;}
thead th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);font-weight:600;padding:10px 15px;border-bottom:1px solid var(--border);background:var(--surface-2);}
tbody tr{border-bottom:1px solid var(--border);}
tbody tr:last-child{border-bottom:none;}
tbody tr:hover{background:var(--surface-2);}
td{padding:10px 15px;vertical-align:top;}
.c-co{font-weight:600;white-space:nowrap;width:1%;}
.c-role a{color:var(--ink);text-decoration:none;font-weight:500;}
.c-role a:hover{color:var(--accent);text-decoration:underline;text-underline-offset:2px;}
.c-role a:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px;}
.ext{color:var(--faint);font-size:12px;margin-left:5px;}
.c-role a:hover .ext{color:var(--accent);}
.c-loc{white-space:nowrap;}
.geo{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:2px 7px;border-radius:5px;margin-right:9px;vertical-align:1px;}
.geo-bay{color:var(--bay);background:var(--bay-bg);}.geo-remote{color:var(--remote);background:var(--remote-bg);}
.geo-us{color:var(--us);background:var(--us-bg);}.geo-elsewhere{color:var(--else);background:var(--else-bg);}
.loc-txt{color:var(--muted);font-size:13px;}
.c-st{white-space:nowrap;width:1%;}
.stsel{font-family:inherit;font-size:12px;font-weight:600;border:1px solid var(--border);border-radius:7px;padding:4px 8px;background:var(--surface);color:var(--faint);cursor:pointer;max-width:160px;}
.stsel:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-weak);}
.st-interested{color:var(--bay);border-color:var(--bay);background:var(--bay-bg);}
.st-applied{color:var(--accent);border-color:var(--accent);background:var(--accent-weak);}
.st-interviewing{color:var(--remote);border-color:var(--remote);background:var(--remote-bg);}
.st-offer{color:var(--gold);border-color:var(--gold);background:var(--else-bg);}
.st-notfit,.st-notinterested{color:var(--faint);background:var(--surface-2);}
.st-rejected{color:var(--danger);border-color:var(--danger);background:var(--danger-bg);}
.hidden{display:none;}
.day-empty{color:var(--muted);padding:18px 2px;}
footer{margin-top:38px;color:var(--faint);font-size:12px;border-top:1px solid var(--border);padding-top:14px;}
tr[hidden]{display:none;}
@media (max-width:760px){
  .layout{grid-template-columns:1fr;}
  .rail{display:none;}
  .mobile-nav{display:block;}
  #dsel{width:100%;font-family:inherit;font-size:14px;padding:9px 12px;border-radius:9px;border:1px solid var(--border);background:var(--surface);color:var(--ink);}
}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <p class="eyebrow">career-ops · scan dashboard</p>
    <h1>Engineering leadership roles by scan date</h1>
    <p class="sub">${total} roles across ${dates.length} scan date${dates.length === 1 ? '' : 's'} · rebuilt from data/scan-history.tsv · generated ${esc(generatedAt)}</p>
  </header>
  <div class="mobile-nav"><select id="dsel" aria-label="Select scan date">${selectHtml}</select></div>
  <div class="layout">
    <nav class="rail" aria-label="Scan dates">
      <p class="rail-lab">Scan dates</p>
      ${railHtml || '<p class="sub">No scans recorded yet.</p>'}
    </nav>
    <main>
      <div class="toolbar">
        <input id="q" type="search" placeholder="Filter this date by company, role, or location…" autocomplete="off" aria-label="Filter roles">
        <select id="stfilter" aria-label="Filter by status">${statusFilterOptions}</select>
        <select id="sortsel" aria-label="Sort roles"><option value="status" selected>Sort: Status first</option><option value="company">Sort: Company</option></select>
        <button id="exportBtn" class="btn" type="button" title="Download role-status.json — save it as data/role-status.json for a durable, backed-up copy">Export statuses</button>
        <label class="btn" for="importFile">Import<input id="importFile" type="file" accept="application/json" hidden></label>
      </div>
      <p class="savednote">Statuses save in this browser automatically and survive scans. <strong>Export</strong> → save as <code>data/role-status.json</code> to keep a durable, file-level copy.</p>
      ${daysHtml || '<p class="sub">Run a scan to populate this dashboard.</p>'}
    </main>
  </div>
  <footer>Local, offline dashboard · statuses are yours (browser + data/role-status.json) · nothing here is an application.</footer>
</div>
<script>window.__SEED=${JSON.stringify({ statuses: STATUS_SEED })};</script>
<script>
(function(){
  var rail=[].slice.call(document.querySelectorAll('.rail-item'));
  var days=[].slice.call(document.querySelectorAll('.day'));
  var sel=document.getElementById('dsel'), q=document.getElementById('q');
  var stfilter=document.getElementById('stfilter');
  var sortsel=document.getElementById('sortsel');
  var selects=[].slice.call(document.querySelectorAll('.stsel'));
  var STORE_KEY='cops-role-status';
  var RANK={offer:0,interviewing:1,applied:2,interested:3,'':4,notfit:5,notinterested:6,rejected:7};
  var STLABEL={interested:'Interested',applied:'Applied',interviewing:'Interviewing',offer:'Offer',notfit:'Not a fit',notinterested:'Not interested',rejected:'Rejected'};
  var STORDER=['offer','interviewing','applied','interested','notfit','notinterested','rejected'];
  function visibleDay(){ return days.filter(function(d){return !d.classList.contains('hidden');})[0]; }
  function sortRows(day){
    if(!day) return;
    var mode=sortsel?sortsel.value:'status';
    [].slice.call(day.querySelectorAll('tbody')).forEach(function(tb){
      var rows=[].slice.call(tb.querySelectorAll('tr'));
      rows.sort(function(a,b){
        var ai=+a.getAttribute('data-i'), bi=+b.getAttribute('data-i');
        if(mode==='status'){
          var ra=RANK[a.getAttribute('data-status')||'']; if(ra==null)ra=4;
          var rb=RANK[b.getAttribute('data-status')||'']; if(rb==null)rb=4;
          if(ra!==rb) return ra-rb;
        }
        return ai-bi;
      });
      rows.forEach(function(r){ tb.appendChild(r); });
    });
  }
  function updateSummary(day){
    if(!day) return;
    var counts={};
    [].slice.call(day.querySelectorAll('tbody tr')).forEach(function(r){
      var st=r.getAttribute('data-status')||''; if(st) counts[st]=(counts[st]||0)+1;
    });
    var parts=STORDER.filter(function(k){return counts[k];}).map(function(k){return counts[k]+' '+STLABEL[k];});
    var chip=day.querySelector('.chip-st');
    if(chip){ if(parts.length){ chip.textContent=parts.join(' · '); chip.hidden=false; } else { chip.hidden=true; } }
  }
  function refresh(){ var d=visibleDay(); sortRows(d); updateSummary(d); filter(); }

  function loadStore(){
    var seed=(window.__SEED&&window.__SEED.statuses)||{}, ls={};
    try{ ls=JSON.parse(localStorage.getItem(STORE_KEY)||'{}'); }catch(e){}
    return Object.assign({}, seed, ls);      // localStorage (your live edits) wins
  }
  function saveStore(){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(store)); }catch(e){} }
  var store=loadStore();

  function paint(s){
    var url=s.getAttribute('data-url'), v=store[url]||'';
    s.value=v; s.className='stsel st-'+(v||'none');
    var tr=s.closest('tr'); if(tr) tr.setAttribute('data-status', v);
  }
  selects.forEach(function(s){
    paint(s);
    s.addEventListener('change', function(){
      var url=s.getAttribute('data-url');
      if(s.value) store[url]=s.value; else delete store[url];
      saveStore(); paint(s); refresh();
    });
  });

  function show(date){
    days.forEach(function(d){ d.classList.toggle('hidden', d.getAttribute('data-date')!==date); });
    rail.forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-date')===date); });
    if(sel) sel.value=date;
    refresh();
  }
  function filter(){
    var t=(q.value||'').trim().toLowerCase(), sf=stfilter?stfilter.value:'';
    var day=days.filter(function(d){return !d.classList.contains('hidden');})[0];
    if(!day) return;
    var shown=0;
    [].slice.call(day.querySelectorAll('tbody tr')).forEach(function(r){
      var st=r.getAttribute('data-status')||'';
      var stOk = !sf || (sf==='__set'? st!=='' : sf==='__none'? st==='' : st===sf);
      var m=(!t||r.getAttribute('data-s').indexOf(t)>-1)&&stOk;
      r.hidden=!m; if(m)shown++;
    });
    [].slice.call(day.querySelectorAll('.tier')).forEach(function(ti){
      ti.style.display=ti.querySelectorAll('tbody tr:not([hidden])').length?'':'none';
    });
    var empty=day.querySelector('.day-empty'); if(empty) empty.hidden=shown>0;
  }

  rail.forEach(function(b){ b.addEventListener('click',function(){ show(b.getAttribute('data-date')); }); });
  if(sel) sel.addEventListener('change',function(){ show(sel.value); });
  q.addEventListener('input',filter);
  if(stfilter) stfilter.addEventListener('change',filter);
  if(sortsel) sortsel.addEventListener('change',refresh);

  var exportBtn=document.getElementById('exportBtn');
  if(exportBtn) exportBtn.addEventListener('click',function(){
    var blob=new Blob([JSON.stringify({version:1, updated:new Date().toISOString(), statuses:store}, null, 2)],{type:'application/json'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='role-status.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
  });
  var importFile=document.getElementById('importFile');
  if(importFile) importFile.addEventListener('change',function(){
    var f=importFile.files&&importFile.files[0]; if(!f) return;
    var rd=new FileReader();
    rd.onload=function(){
      try{ var j=JSON.parse(rd.result); var st=j.statuses||j;
        Object.keys(st).forEach(function(k){ if(st[k]) store[k]=st[k]; });
        saveStore(); selects.forEach(paint); refresh();
      }catch(e){ alert('Could not read that file as a status export.'); }
      importFile.value='';
    };
    rd.readAsText(f);
  });

  refresh();
})();
</script>
</body>
</html>`;

writeFileSync(OUT, html);
const dirTotal = dates.reduce((n, d) => n + byDate.get(d).filter((r) => isDirectorPlus(r.title)).length, 0);
console.log(`✅ scan dashboard written: ${OUT}`);
console.log(`   ${total} roles · ${dates.length} scan dates · ${dirTotal} Director+ · latest ${dates[0] || '—'}`);
console.log(`   seed: ${Object.keys(STATUS_SEED).length} saved status(es) from data/role-status.json`);
console.log(`   open: file://${OUT}`);
