/* ISA Risk Tracker — single-page, localStorage only. Personal risk-tracking tool, not financial advice. */
(() => {
'use strict';

const KEY = 'isaRiskTracker.v1';
const DEFAULT_SETTINGS = {
  startBalance: null,      // starting cash £
  startDate: null,
  openRiskCap: 8,          // % of equity
  riskC: 0.5, riskB: 0.75, riskA: 1.0,
  rr: 4,
  atrMin: 1.5, atrMax: 4,
  trailTriggerR: 1,
  trailAtr: 4,
  timeStopDays: 60,
  dd1: 6, dd2: 20, pauseDays: 20,
  posCap: 30,
  maxPerSector: 3,
  earningsDays: 5,
  targetMode: 'exit',      // 'exit' = full exit at target, 'trail' = target is informational, let the trail run
  openRiskBasis: 'current',// 'current' = min(entry, close) − stop ; 'entry' = entry − stop
  fractional: false,
};

/* ---------------- state ---------------- */
let state = load();
let ui = {
  view: 'today',
  asOf: todayISO(),
  logSort: { key: 'date', dir: -1 },
  logFilter: { q: '', status: 'all', kind: 'all', grade: 'all' },
  newMode: 'swing',
  draft: null,
};

function blankState() {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, flows: [], trades: [], snapshots: [], pause: null };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blankState();
    return normalise(JSON.parse(raw));
  } catch (e) { console.error(e); return blankState(); }
}
function normalise(s) {
  const b = blankState();
  return {
    version: 1,
    settings: { ...b.settings, ...(s.settings || {}) },
    flows: Array.isArray(s.flows) ? s.flows : [],
    trades: Array.isArray(s.trades) ? s.trades.map(t => ({ closes: {}, ...t })) : [],
    snapshots: Array.isArray(s.snapshots) ? s.snapshots : [],
    pause: s.pause || null,
  };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save — storage full or blocked'); }
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ---------------- utils ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const isNum = v => typeof v === 'number' && isFinite(v);
function gbp(v, dp = 2) {
  if (!isNum(v)) return '—';
  const s = Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return (v < 0 ? '−£' : '£') + s;
}
const gbp0 = v => gbp(v, 0);
function pct(v, dp = 1) { return isNum(v) ? (v < 0 ? '−' : '') + Math.abs(v).toFixed(dp) + '%' : '—'; }
function rfmt(v, dp = 2) { return isNum(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(dp) + 'R' : '—'; }
function px(v) { return isNum(v) ? (+v.toFixed(4)).toLocaleString('en-GB', { maximumFractionDigits: 4 }) : '—'; }
function shareFmt(v) { return isNum(v) ? (+v.toFixed(4)).toLocaleString('en-GB', { maximumFractionDigits: 4 }) : '—'; }
const cls = v => (isNum(v) && v > 0 ? 'pos' : isNum(v) && v < 0 ? 'neg' : '');
function numVal(v) { if (v === '' || v == null) return NaN; const n = parseFloat(String(v).replace(/[£,\s]/g, '')); return isFinite(n) ? n : NaN; }
function tip(text, formula) { return `<span class="tip" data-tip="${esc(formula)}">${text}</span>`; }

/* dates: ISO strings, treated as UTC days */
function todayISO() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
const toD = s => new Date(s + 'T00:00:00Z');
const toS = d => d.toISOString().slice(0, 10);
const isWeekday = d => { const w = d.getUTCDay(); return w !== 0 && w !== 6; };
function tradingDaysBetween(a, b) { // weekdays in (a, b]
  if (!a || !b) return NaN;
  let d = toD(a), end = toD(b), n = 0, sign = 1;
  if (end < d) { [d, end] = [end, d]; sign = -1; }
  while (d < end) { d.setUTCDate(d.getUTCDate() + 1); if (isWeekday(d)) n++; }
  return n * sign;
}
function addTradingDays(a, n) { const d = toD(a); let k = 0; while (k < n) { d.setUTCDate(d.getUTCDate() + 1); if (isWeekday(d)) k++; } return toS(d); }
function niceDate(s) { if (!s) return '—'; return toD(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }); }
function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(toD(s)); }

/* ---------------- core calculations ---------------- */
const S = () => state.settings;
const openTrades = () => state.trades.filter(t => t.status === 'open');
const openSwing = () => openTrades().filter(t => t.kind === 'swing');
const openLong = () => openTrades().filter(t => t.kind === 'long');

function closeDates(t) { return Object.keys(t.closes || {}).sort(); }
function lastClose(t) { const ds = closeDates(t); return ds.length ? t.closes[ds[ds.length - 1]] : t.entry; }
function lastCloseDate(t) { const ds = closeDates(t); return ds.length ? ds[ds.length - 1] : null; }

function swingCalc(t) {
  const R1 = t.entry - t.stop;
  const trigR = t.trailTriggerR ?? S().trailTriggerR;
  const trailAtr = t.trailAtr ?? S().trailAtr;
  const rr = t.rr ?? S().rr;
  const trigger = t.entry + trigR * R1;
  const gap = isNum(t.atr) && t.atr > 0 ? trailAtr * t.atr : NaN;
  let stop = t.stop, hi = -Infinity, trailOn = false;
  for (const d of closeDates(t)) {
    if (d < t.date) continue;
    const c = t.closes[d];
    if (c > hi) hi = c;
    if (hi >= trigger) { trailOn = true; if (isNum(gap)) stop = Math.max(stop, hi - gap); }
  }
  if (isNum(t.manualStop) && t.manualStop > stop) stop = t.manualStop;
  if (hi === -Infinity) hi = NaN;
  const close = lastClose(t);
  const target = t.entry + rr * R1;
  const basis = S().openRiskBasis === 'entry' ? t.entry : Math.min(t.entry, close);
  const openRisk = Math.max(0, t.shares * (basis - stop));
  const mv = t.shares * close;
  const pnl = t.shares * (close - t.entry) - (t.fees || 0);
  const pnlR = R1 > 0 ? (close - t.entry) / R1 : NaN;
  const asOf = lastCloseDate(t) || t.date;
  const days = tradingDaysBetween(t.date, maxDate(asOf, todayISO()));
  return { R1, trigger, gap, stop, hi, trailOn, raised: stop > t.stop, close, target, openRisk, mv, pnl, pnlR, days, rr, trailAtr, trigR };
}
function maxDate(a, b) { return !a ? b : !b ? a : (a > b ? a : b); }

function longCalc(t) {
  const close = lastClose(t);
  const mv = t.shares * close;
  const cost = t.shares * t.entry;
  const pnl = mv - cost - (t.fees || 0);
  return { close, mv, cost, pnl, pnlPct: cost ? (close / t.entry - 1) * 100 : NaN };
}
function mvOf(t) { return t.shares * lastClose(t); }

function netFlows(upTo) {
  return state.flows.filter(f => !upTo || f.date <= upTo).reduce((a, f) => a + (f.type === 'deposit' ? f.amount : -f.amount), 0);
}
function cashNow() {
  let c = (S().startBalance || 0) + netFlows();
  for (const t of state.trades) {
    if (!t.pre) c -= t.shares * t.entry + (t.fees || 0);
    if (t.status === 'closed' && t.exit) c += t.shares * t.exit.price - (t.exit.fees || 0);
  }
  return c;
}
function contributed() { // money put in, at cost
  let c = (S().startBalance || 0) + netFlows();
  for (const t of state.trades) if (t.pre) c += t.shares * t.entry;
  return c;
}

/** Equity history with flow-adjusted peak. points: [{date, equity}] */
function peakSeries(points) {
  const flows = [...state.flows].sort((a, b) => a.date.localeCompare(b.date));
  let peak = null, prev = null, maxDD = 0, fi = 0;
  const out = [];
  for (const p of points) {
    // add flows dated after previous point up to this point to the peak
    while (fi < flows.length && flows[fi].date <= p.date) {
      const f = flows[fi];
      if (prev !== null && f.date > prev && peak !== null) peak += f.type === 'deposit' ? f.amount : -f.amount;
      fi++;
    }
    peak = peak === null ? p.equity : Math.max(peak, p.equity);
    const dd = peak > 0 ? (p.equity / peak - 1) * 100 : 0;
    maxDD = Math.min(maxDD, dd);
    out.push({ ...p, peak, dd });
    prev = p.date;
  }
  return { out, maxDD };
}

function account() {
  const s = S();
  const cash = cashNow();
  const swings = openSwing().map(t => ({ t, c: swingCalc(t) }));
  const longs = openLong().map(t => ({ t, c: longCalc(t) }));
  const mvSwing = swings.reduce((a, x) => a + x.c.mv, 0);
  const mvLong = longs.reduce((a, x) => a + x.c.mv, 0);
  const equity = cash + mvSwing + mvLong;
  const openRisk = swings.reduce((a, x) => a + x.c.openRisk, 0);
  const snaps = [...state.snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const today = maxDate(todayISO(), snaps.length ? snaps[snaps.length - 1].date : null);
  const pts = snaps.filter(p => p.date < today).map(p => ({ date: p.date, equity: p.equity }));
  pts.push({ date: today, equity });
  const ps = peakSeries(pts);
  const cur = ps.out[ps.out.length - 1];
  const peak = cur.peak, dd = cur.dd;
  // pause / halving
  const pause = state.pause;
  let mode = 'normal', pauseEnd = null, needReview = false;
  if (pause && !pause.reviewed) {
    pauseEnd = pause.end;
    if (todayISO() < pause.end) mode = 'paused';
    else { mode = 'review'; needReview = true; }
  } else if (dd <= -s.dd1) mode = 'halved';
  const halved = mode !== 'normal' || dd <= -s.dd1;
  const riskMult = halved ? 0.5 : 1;
  const gradeRisk = g => equity * (s['risk' + g] * riskMult) / 100;
  const capGBP = equity * s.openRiskCap / 100;
  return {
    cash, equity, mvSwing, mvLong, openRisk, openRiskPct: equity > 0 ? openRisk / equity * 100 : 0,
    capGBP, room: capGBP - openRisk, peak, dd, maxDD: ps.maxDD, mode, pauseEnd, needReview, halved, riskMult,
    gradeRisk, swings, longs, invested: equity > 0 ? (mvSwing + mvLong) / equity * 100 : 0,
    to1: equity - peak * (1 - s.dd1 / 100), to2: equity - peak * (1 - s.dd2 / 100),
  };
}

/** trigger the −20% pause when crossed (side effect, persisted) */
function checkPause(a) {
  const s = S();
  if (state.pause && state.pause.reviewed && a.dd > -s.dd2) { state.pause = null; save(); return true; }
  if (!state.pause && a.dd <= -s.dd2) {
    const start = todayISO();
    state.pause = { start, end: addTradingDays(start, s.pauseDays), reviewed: false, ddAt: a.dd };
    save(); return true;
  }
  return false;
}

function sectorCounts() {
  const m = {};
  for (const t of openTrades()) {
    const k = (t.sector || 'Unassigned').trim() || 'Unassigned';
    m[k] = m[k] || { swing: 0, long: 0, mv: 0 };
    m[k][t.kind]++; m[k].mv += mvOf(t);
  }
  return m;
}
function swingInSector(sector, exceptId) {
  const k = (sector || '').trim().toLowerCase();
  if (!k) return 0;
  return openSwing().filter(t => t.id !== exceptId && (t.sector || '').trim().toLowerCase() === k).length;
}

function gradeFromPts(p) { return p >= 4 ? 'A' : p === 3 ? 'B' : p === 2 ? 'C' : 'Skip'; }

function badgesFor(t, c) {
  const s = S(), b = [];
  if (c.close < c.stop) b.push(['bad', 'EXIT: close below stop', `Latest close ${px(c.close)} < current stop ${px(c.stop)}`]);
  if (c.trailOn) b.push(c.raised ? ['good', 'Trail active', `Highest close ${px(c.hi)} ≥ trigger ${px(c.trigger)} (entry + ${c.trigR}R). Stop = max(prev stop, highest − ${c.trailAtr}×ATR) = ${px(c.stop)}`]
    : ['info', 'Trail active (stop not raised yet)', `Trail switched on, but highest − ${c.trailAtr}×ATR = ${px(c.hi - c.gap)} is still below the stop ${px(c.stop)}, so the stop stays put.`]);
  else b.push(['', 'Trail not yet active', `Activates when highest close ≥ ${px(c.trigger)} (entry + ${c.trigR}R)`]);
  if (isNum(c.hi) && c.hi >= c.target) b.push(['good', s.targetMode === 'exit' ? 'Target hit — exit' : 'Target hit — trailing', `Highest close ${px(c.hi)} ≥ target ${px(c.target)} (entry + ${c.rr}R)`]);
  if (c.days >= s.timeStopDays) b.push(['bad', `Time stop: day ${c.days}`, `${c.days} trading days held ≥ ${s.timeStopDays}`]);
  else if (c.days >= s.timeStopDays - 5) b.push(['warn', `Time stop in ${s.timeStopDays - c.days}d`, `${c.days} of ${s.timeStopDays} trading days`]);
  const e = earningsSoon(t);
  if (e !== null) b.push(['warn', 'Earnings within ' + s.earningsDays + ' days', `Earnings ${niceDate(t.earnings)}: ${e} trading day(s) away`]);
  if (!isNum(t.atr) || !(t.atr > 0)) b.push(['warn', 'No ATR — trail off', 'Add ATR(14) at entry via Edit so the trailing stop can work']);
  return b;
}
function earningsSoon(t) {
  if (!t.earnings || !validDate(t.earnings)) return null;
  const today = todayISO();
  if (t.earnings < today) return null;
  const n = tradingDaysBetween(today, t.earnings);
  return n <= S().earningsDays ? n : null;
}
const badgeHTML = b => `<span class="badge ${b[0]} tip" data-tip="${esc(b[2])}">${esc(b[1])}</span>`;

function closedStats(filter) {
  const ts = state.trades.filter(t => t.kind === 'swing' && t.status === 'closed' && (!filter || filter(t)));
  const res = ts.map(t => {
    const R1 = t.entry - t.stop;
    const gbpRes = t.shares * (t.exit.price - t.entry) - (t.fees || 0) - (t.exit.fees || 0);
    return { t, R: R1 > 0 ? (t.exit.price - t.entry) / R1 : 0, gbp: gbpRes, days: tradingDaysBetween(t.date, t.exit.date), fees: (t.fees || 0) + (t.exit.fees || 0) };
  });
  const wins = res.filter(r => r.R > 0), losses = res.filter(r => r.R <= 0);
  const sum = (a, k) => a.reduce((x, r) => x + r[k], 0);
  const avg = (a, k) => a.length ? sum(a, k) / a.length : NaN;
  const grossW = sum(res.filter(r => r.gbp > 0), 'gbp'), grossL = -sum(res.filter(r => r.gbp < 0), 'gbp');
  let streak = 0, longest = 0;
  for (const r of [...res].sort((a, b) => a.t.exit.date.localeCompare(b.t.exit.date))) { if (r.R <= 0) { streak++; longest = Math.max(longest, streak); } else streak = 0; }
  return {
    res, n: res.length, winRate: res.length ? wins.length / res.length * 100 : NaN,
    avgWin: avg(wins, 'R'), avgLoss: avg(losses, 'R'), expectancy: avg(res, 'R'),
    pf: grossL > 0 ? grossW / grossL : (grossW > 0 ? Infinity : NaN), grossW, grossL,
    longest, avgDays: avg(res, 'days'), fees: sum(res, 'fees'), totalGBP: sum(res, 'gbp'),
  };
}
function tradeResult(t) {
  if (t.status !== 'closed' || !t.exit) return { gbp: NaN, R: NaN };
  const R1 = t.entry - t.stop;
  return {
    gbp: t.shares * (t.exit.price - t.entry) - (t.fees || 0) - (t.exit.fees || 0),
    R: t.kind === 'swing' && R1 > 0 ? (t.exit.price - t.entry) / R1 : NaN,
  };
}

/* ---------------- rendering ---------------- */
function render() {
  const a = account();
  if (checkPause(a)) return render();
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === ui.view));
  $$('.view').forEach(v => v.hidden = v.id !== 'view-' + ui.view);
  const v = $('#view-' + ui.view);
  if (ui.view === 'today') v.innerHTML = renderToday(a);
  if (ui.view === 'new') { v.innerHTML = renderNew(a); updateCalc(); }
  if (ui.view === 'history') { v.innerHTML = renderHistory(a); drawCharts(); }
  if (ui.view === 'log') v.innerHTML = renderLog();
  if (ui.view === 'settings') v.innerHTML = renderSettings();
}
const isEmpty = () => !state.trades.length && S().startBalance == null;

/* ---- Today: dashboard + positions ---- */
function renderToday(a) {
  if (isEmpty()) return renderEmpty();
  const s = S();
  const statusTxt = {
    normal: ['normal', 'Normal', `Full risk levels. Drawdown ${pct(a.dd)} from peak.`],
    halved: ['halved', `Risk halved (−${s.dd1}%)`, `Drawdown ${pct(a.dd)} ≤ −${s.dd1}%: every risk level is halved until equity recovers above ${gbp0(a.peak * (1 - s.dd1 / 100))}.`],
    paused: ['paused', `Paused until ${niceDate(a.pauseEnd)} (−${s.dd2}%)`, `Drawdown hit −${s.dd2}% — new swing trades are blocked for ${s.pauseDays} trading days.`],
    review: ['paused', 'Review before resuming', `The ${s.pauseDays}-day pause has ended. Review your trades and rules, then resume.`],
  }[a.mode];
  const gaugePct = s.openRiskCap > 0 ? Math.min(100, a.openRiskPct / s.openRiskCap * 100) : 0;
  const gcls = gaugePct >= 100 ? 'bad' : gaugePct >= 75 ? 'warn' : '';
  const sectors = sectorCounts();
  const lastSnap = [...state.snapshots].sort((x, y) => y.date.localeCompare(x.date))[0];

  const alerts = [];
  for (const { t, c } of a.swings) for (const b of badgesFor(t, c)) if (b[0] === 'bad' || (b[0] === 'good' && /Target/.test(b[1])) || b[0] === 'warn' && !/ATR/.test(b[1])) alerts.push(`<div class="msg ${b[0] === 'bad' ? 'block' : b[0] === 'good' ? 'ok' : 'warn'}"><b>${esc(t.ticker)}</b> — ${esc(b[1])} <span class="small">(${esc(b[2])})</span></div>`);
  for (const { t } of a.longs) { const e = earningsSoon(t); if (e !== null) alerts.push(`<div class="msg warn"><b>${esc(t.ticker)}</b> (long hold) — earnings in ${e} trading day(s)</div>`); }

  return `
  <div class="status ${statusTxt[0]}">
    <div class="big">${statusTxt[1]}</div>
    <div class="small">${esc(statusTxt[2])}</div>
    <div class="small" style="margin-left:auto">
      ${tip(`To −${s.dd1}%: <b>${gbp0(Math.max(0, a.to1))}</b>`, `Equity − peak × (1 − ${s.dd1}%)\n= ${gbp(a.equity)} − ${gbp(a.peak)} × ${(1 - s.dd1 / 100).toFixed(2)}`)} ·
      ${tip(`To −${s.dd2}%: <b>${gbp0(Math.max(0, a.to2))}</b>`, `Equity − peak × (1 − ${s.dd2}%)\n= ${gbp(a.equity)} − ${gbp(a.peak)} × ${(1 - s.dd2 / 100).toFixed(2)}`)}
    </div>
    ${a.needReview ? `<button class="btn primary sm" data-act="resume">I've reviewed — resume trading</button>` : ''}
  </div>

  <div class="grid kpis">
    <div class="kpi"><div class="label">${tip('Equity', `Cash + market value of open positions at latest closes\n= ${gbp(a.cash)} + ${gbp(a.mvSwing)} (swing) + ${gbp(a.mvLong)} (long)`)}</div>
      <div class="value">${gbp(a.equity)}</div><div class="sub">Swing ${gbp0(a.mvSwing)} · Long ${gbp0(a.mvLong)}</div></div>
    <div class="kpi"><div class="label">${tip('Peak · drawdown', `Peak = high-water mark of equity, adjusted +/− for deposits and withdrawals\nDrawdown = equity ÷ peak − 1 = ${gbp(a.equity)} ÷ ${gbp(a.peak)} − 1`)}</div>
      <div class="value ${cls(a.dd)}">${pct(a.dd, 2)}</div><div class="sub">Peak ${gbp0(a.peak)} · Max DD ${pct(a.maxDD, 2)}</div></div>
    <div class="kpi"><div class="label">${tip('Open risk vs cap', `Σ open risk of swing positions = ${gbp(a.openRisk)}\n÷ equity = ${pct(a.openRiskPct, 2)}\nCap = ${s.openRiskCap}% × equity = ${gbp(a.capGBP)}\nLong-term holds are excluded.`)}</div>
      <div class="value">${pct(a.openRiskPct, 2)} <span class="small muted">/ ${s.openRiskCap}%</span></div>
      <div class="gauge ${gcls}"><div style="width:${gaugePct.toFixed(1)}%"></div></div>
      <div class="sub">${gbp0(a.openRisk)} used · ${tip(`room ${gbp0(Math.max(0, a.room))}`, `Room = cap − open risk = ${gbp(a.capGBP)} − ${gbp(a.openRisk)}`)}</div></div>
    <div class="kpi"><div class="label">${tip('Cash', `Starting cash + deposits − withdrawals − cost of buys + proceeds of sells`)}</div>
      <div class="value">${gbp(a.cash)}</div><div class="sub">${tip(pct(a.invested) + ' invested', `(swing + long market value) ÷ equity`)}</div></div>
    <div class="kpi"><div class="label">${tip('Risk per trade now', `Grade % × equity${a.halved ? ' × 0.5 (risk halved)' : ''}\nC ${s.riskC}% · B ${s.riskB}% · A ${s.riskA}%`)}</div>
      <div class="value small" style="font-size:1rem;line-height:1.6">C ${gbp0(a.gradeRisk('C'))} · B ${gbp0(a.gradeRisk('B'))} · A ${gbp0(a.gradeRisk('A'))}</div>
      <div class="sub">${a.halved ? 'Halved by the drawdown rule' : 'Full risk'}</div></div>
  </div>

  ${alerts.length ? `<div class="card" style="margin-top:1rem"><h2>Alerts</h2><div class="alert-list">${alerts.join('')}</div></div>` : ''}

  <div class="card" style="margin-top:1rem">
    <div class="spread">
      <h2 style="margin:0">Evening update</h2>
      <div class="row">
        <label class="small muted" for="asof">Closes for</label>
        <input type="date" id="asof" value="${esc(ui.asOf)}" style="width:auto">
        <button class="btn primary" data-act="save-closes">Save closes &amp; snapshot</button>
      </div>
    </div>
    <p class="small muted" style="margin:.4rem 0 .8rem">Type today's close for each position (press Enter to jump to the next). Blank = keep the last close.
      ${lastSnap ? `Last snapshot: ${niceDate(lastSnap.date)}.` : 'No snapshots yet.'}</p>
    ${renderSwingTable(a)}
  </div>

  <div class="card">
    <div class="spread"><h2 style="margin:0">Long-term holds <span class="muted small">— outside the swing rules, counted in equity</span></h2></div>
    ${renderLongTable(a)}
  </div>

  <div class="card">
    <h2>${tip('Exposure by sector', `Swing count is limited to ${s.maxPerSector} open positions per sector. Long holds are shown but don't count toward the limit.\n% = market value ÷ equity`)}</h2>
    ${Object.keys(sectors).length ? `<div class="tbl-wrap"><table>
      <thead><tr><th>Sector</th><th class="num">Swing</th><th class="num">Long</th><th class="num">Value</th><th class="num">% equity</th></tr></thead><tbody>
      ${Object.entries(sectors).sort((x, y) => y[1].mv - x[1].mv).map(([k, v]) => `<tr class="${v.swing > s.maxPerSector ? 'hl' : ''}">
        <td>${esc(k)} ${v.swing > s.maxPerSector ? '<span class="badge bad">Over limit</span>' : v.swing === s.maxPerSector ? '<span class="badge warn">At limit</span>' : ''}</td>
        <td class="num">${v.swing} / ${s.maxPerSector}</td><td class="num">${v.long}</td><td class="num">${gbp0(v.mv)}</td><td class="num">${pct(v.mv / a.equity * 100)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">No open positions.</p>'}
  </div>`;
}

function renderEmpty() {
  return `<div class="card empty">
    <h1>Track your ISA risk</h1>
    <p>Enter your trades by hand, type in closing prices each evening, and the app keeps your stops, open risk and drawdown rules in check. Everything stays in this browser.</p>
    <div class="start grid">
      <label class="field"><span>Starting cash balance (£)</span><input type="number" id="start-bal" min="0" step="0.01" inputmode="decimal" placeholder="e.g. 19000"></label>
      <label class="field"><span>Start date</span><input type="date" id="start-date" value="${todayISO()}"></label>
      <div class="small muted">Positions you already hold can be added with "Import existing holding" — their cost won't be taken from this cash.</div>
    </div>
    <div class="row" style="justify-content:center">
      <button class="btn primary lg" data-act="first-trade">Add your first trade</button>
      <button class="btn" data-act="sample">Load sample data</button>
    </div>
  </div>`;
}

function renderSwingTable(a) {
  if (!a.swings.length) return `<p class="muted">No open swing positions. <button class="btn sm" data-act="go-new">Add a trade</button></p>`;
  const s = S();
  const rows = a.swings.sort((x, y) => x.t.ticker.localeCompare(y.t.ticker)).map(({ t, c }) => {
    const exit = c.close < c.stop;
    const posPct = c.mv / a.equity * 100;
    return `<tr class="${exit ? 'hl' : ''}">
      <td class="tk" data-l="Ticker">${esc(t.ticker)} <span class="badge grade">${esc(t.grade || '—')}</span>${t.pre ? ' <span class="badge">imported</span>' : ''}</td>
      <td data-l="Close"><input class="close-in" type="number" step="any" min="0" inputmode="decimal" data-id="${t.id}" placeholder="${px(c.close)}" value="${t.closes[ui.asOf] ?? ''}" aria-label="Close for ${esc(t.ticker)}"></td>
      <td class="num" data-l="Last / high">${px(c.close)} <span class="muted small">/ ${px(c.hi)}</span></td>
      <td class="num" data-l="Stop">${tip(px(c.stop), `Current stop = max(previous stop, highest close − ${c.trailAtr} × ATR) once highest ≥ entry + ${c.trigR}R\nInitial ${px(t.stop)} · highest ${px(c.hi)} · trail gap ${px(c.gap)} · trigger ${px(c.trigger)}`)}</td>
      <td class="num" data-l="Take profit">${tip(`${px(c.target)} <span class="muted small">${c.target > 0 ? '+' + pct((c.target / t.entry - 1) * 100) : ''}</span>`, `Target = entry + ${c.rr} × initial 1R = ${px(t.entry)} + ${c.rr} × ${px(c.R1)}
Profit if hit: ${gbp(t.shares * (c.target - t.entry))}`)}</td>
      <td class="num" data-l="Open risk">${tip(gbp0(c.openRisk), s.openRiskBasis === 'entry' ? `max(0, shares × (entry − stop))\n= max(0, ${shareFmt(t.shares)} × (${px(t.entry)} − ${px(c.stop)}))` : `max(0, shares × (min(entry, close) − stop))\n= max(0, ${shareFmt(t.shares)} × (${px(Math.min(t.entry, c.close))} − ${px(c.stop)}))`)}</td>
      <td class="num ${cls(c.pnl)}" data-l="P&amp;L">${tip(`${gbp0(c.pnl)} <span class="small">${rfmt(c.pnlR)}</span>`, `£ = shares × (close − entry) − entry fees\n= ${shareFmt(t.shares)} × (${px(c.close)} − ${px(t.entry)}) − ${gbp(t.fees || 0)}\nR = (close − entry) ÷ 1R = (${px(c.close)} − ${px(t.entry)}) ÷ ${px(c.R1)}`)}</td>
      <td class="num" data-l="Days">${tip(String(c.days), `Trading days (Mon–Fri) since ${niceDate(t.date)}. Time stop at ${s.timeStopDays}.`)}</td>
      <td class="num" data-l="% equity">${tip(pct(posPct), `shares × close ÷ equity = ${gbp(c.mv)} ÷ ${gbp(a.equity)}`)}</td>
      <td class="full" data-l="Status">${badgesFor(t, c).map(badgeHTML).join('')}</td>
      <td class="full" data-l=""><div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="close" data-id="${t.id}">Close trade</button><button class="btn sm ghost" data-act="edit" data-id="${t.id}">Edit</button></div></td>
    </tr>`;
  }).join('');
  return `<div class="tbl-wrap"><table class="rtable"><thead><tr>
    <th>Ticker</th><th>Close ${niceDate(ui.asOf)}</th><th class="num">Last / high</th><th class="num">Stop</th><th class="num">Take profit</th><th class="num">Open risk</th><th class="num">Unrealised</th><th class="num">Days</th><th class="num">% eq</th><th>Status</th><th></th>
  </tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderLongTable(a) {
  if (!a.longs.length) return `<p class="muted small">None. Add long-term holds from New trade → "Long-term hold" or "Import existing holding".</p>`;
  const rows = a.longs.sort((x, y) => y.c.mv - x.c.mv).map(({ t, c }) => `<tr>
    <td class="tk" data-l="Ticker">${esc(t.ticker)}${t.pre ? ' <span class="badge">imported</span>' : ''}</td>
    <td data-l="Close"><input class="close-in" type="number" step="any" min="0" inputmode="decimal" data-id="${t.id}" placeholder="${px(c.close)}" value="${t.closes[ui.asOf] ?? ''}" aria-label="Close for ${esc(t.ticker)}"></td>
    <td class="num" data-l="Shares × avg">${shareFmt(t.shares)} × ${px(t.entry)}</td>
    <td class="num" data-l="Value">${tip(gbp0(c.mv), `shares × last close = ${shareFmt(t.shares)} × ${px(c.close)}`)}</td>
    <td class="num ${cls(c.pnl)}" data-l="P&amp;L">${tip(`${gbp0(c.pnl)} <span class="small">${pct(c.pnlPct)}</span>`, `value − cost − fees = ${gbp(c.mv)} − ${gbp(c.cost)} − ${gbp(t.fees || 0)}`)}</td>
    <td class="num" data-l="% equity">${pct(c.mv / a.equity * 100)}</td>
    <td class="full" data-l=""><div class="row" style="flex-wrap:nowrap"><button class="btn sm" data-act="close" data-id="${t.id}">Sell</button><button class="btn sm ghost" data-act="edit" data-id="${t.id}">Edit</button></div></td>
  </tr>`).join('');
  return `<div class="tbl-wrap"><table class="rtable"><thead><tr><th>Ticker</th><th>Close ${niceDate(ui.asOf)}</th><th class="num">Shares × avg</th><th class="num">Value</th><th class="num">Unrealised</th><th class="num">% eq</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ---- New trade ---- */
const GRADE_ITEMS = [
  'Clean channel, with at least 2 touches on each line',
  'Relative volume ≥ 2× the 20-day average on the trigger day',
  'RSI turning up from near 40',
  'Sector or index above its 50-day moving average',
];
const ENTRY_ITEMS = [
  'Price in a channel, in its lower half',
  'Close above the 50-day MA',
  'RSI(14) between 40 and 50',
  'Volume dry-up, then relative volume ≥ 1.3–1.5×',
  'No earnings within 5 trading days',
  'Spread < 0.5% and liquid',
  'No major resistance before the target',
  'Stop-loss order will be placed at the same time as the entry',
];

function blankDraft() {
  return { date: todayISO(), ticker: '', market: 'UK', sector: '', entry: '', stop: '', atr: '', earnings: '', fees: '', notes: '', shares: '', close: '', grade: [false, false, false, false], checks: ENTRY_ITEMS.map(() => false), kind: 'swing', pre: true, gradeManual: '' };
}
function renderNew(a) {
  if (!ui.draft) ui.draft = blankDraft();
  const d = ui.draft, m = ui.newMode;
  const sectorsList = [...new Set(state.trades.map(t => t.sector).filter(Boolean))];
  const f = (id, label, type = 'number', extra = '') => `<label class="field"><span>${label}</span><input type="${type}" data-f="${id}" value="${esc(d[id])}" ${type === 'number' ? 'step="any" min="0" inputmode="decimal"' : ''} ${extra}><small class="err" data-err="${id}"></small></label>`;
  const common = `
    ${f('date', 'Date', 'date')}
    ${f('ticker', 'Ticker', 'text', 'autocapitalize="characters" placeholder="e.g. LLOY"')}
    <label class="field"><span>Market</span><select data-f="market">${['UK', 'US', 'Other'].map(x => `<option ${d.market === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label class="field"><span>Sector</span><input type="text" data-f="sector" list="sector-list" value="${esc(d.sector)}" placeholder="e.g. Banks"><datalist id="sector-list">${sectorsList.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>`;
  const modeSeg = `<div class="seg" role="tablist">
    <button data-mode="swing" class="${m === 'swing' ? 'on' : ''}">Swing trade</button>
    <button data-mode="import" class="${m === 'import' ? 'on' : ''}">Import existing holding</button>
    <button data-mode="long" class="${m === 'long' ? 'on' : ''}">Long-term hold</button></div>`;

  if (m === 'swing') {
    if (a.mode === 'paused' || a.mode === 'review') {
      // still show the form, block message appears in calc
    }
    return `<div class="card"><div class="spread"><h2 style="margin:0">New swing trade</h2>${modeSeg}</div>
      <p class="small muted">Prices in £ (UK shares: pounds, not pence — 1.234 not 123.4p).</p>
      <div class="form-grid">${common}
        ${f('entry', 'Entry price (£)')}
        ${f('stop', 'Technical stop (£)')}
        ${f('atr', 'ATR(14) at entry (£)')}
        ${f('earnings', 'Next earnings (optional)', 'date')}
        ${f('fees', 'Fees (£, entry)')}
        <label class="field wide"><span>Notes</span><textarea data-f="notes">${esc(d.notes)}</textarea></label>
      </div></div>
    <div class="grid two">
      <div class="card"><h2>Setup grade <span id="grade-out" class="badge grade"></span></h2>
        <div class="checks">${GRADE_ITEMS.map((t, i) => `<label class="check ${d.grade[i] ? 'on' : ''}"><input type="checkbox" data-g="${i}" ${d.grade[i] ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>
        <p class="small muted">4 = A · 3 = B · 2 = C · 0–1 = Skip</p></div>
      <div class="card"><h2>Entry checklist <span id="check-out" class="badge"></span></h2>
        <div class="checks">${ENTRY_ITEMS.map((t, i) => `<label class="check ${d.checks[i] ? 'on' : ''}"><input type="checkbox" data-c="${i}" ${d.checks[i] ? 'checked' : ''}><span>${esc(t.replace('5', S().earningsDays))}</span></label>`).join('')}</div></div>
    </div>
    <div class="card"><h2>Sizing &amp; rule check</h2><div id="calc"></div>
      <div class="form-grid" style="margin-top:.8rem">
        <label class="field"><span>Shares (blank = suggested)</span><input type="number" data-f="shares" step="any" min="0" inputmode="decimal" value="${esc(d.shares)}"></label>
      </div>
      <div id="msgs" class="msgs"></div>
      <div class="row" style="margin-top:1rem"><button class="btn primary lg" id="save-trade" data-act="save-trade" disabled>Save trade</button><button class="btn ghost" data-act="reset-draft">Clear form</button></div>
    </div>`;
  }
  // import / long
  const isImport = m === 'import';
  return `<div class="card"><div class="spread"><h2 style="margin:0">${isImport ? 'Import existing holding' : 'New long-term hold'}</h2>${modeSeg}</div>
    <p class="small muted">${isImport ? 'For positions you already own. No checklist. Swing positions need a stop so open risk can be measured; long-term holds are outside the swing rules but still count in equity.' : 'Long-term holds skip the swing rules (no stop, grade or open-risk check) but count in equity, cash and drawdown.'}</p>
    <div class="form-grid">
      ${isImport ? `<label class="field"><span>Type</span><select data-f="kind"><option value="swing" ${d.kind === 'swing' ? 'selected' : ''}>Swing (rules apply)</option><option value="long" ${d.kind === 'long' ? 'selected' : ''}>Long-term hold</option></select></label>` : ''}
      ${common}
      ${f('shares', 'Shares')}
      ${f('entry', isImport ? 'Average price (£)' : 'Buy price (£)')}
      ${(isImport && d.kind === 'swing') ? f('stop', 'Stop (£)') + f('atr', 'ATR(14) (£, optional)') + `<label class="field"><span>Grade (optional)</span><select data-f="gradeManual">${['', 'A', 'B', 'C'].map(x => `<option value="${x}" ${d.gradeManual === x ? 'selected' : ''}>${x || '—'}</option>`).join('')}</select></label>` : ''}
      ${f('earnings', 'Next earnings (optional)', 'date')}
      ${f('fees', 'Fees (£)')}
      ${f('close', 'Latest close (£, optional)')}
      ${isImport ? `<label class="field wide check ${d.pre ? 'on' : ''}" style="flex-direction:row"><input type="checkbox" data-f="pre" ${d.pre ? 'checked' : ''}><span>Bought before my starting cash balance (don't take the cost out of cash)</span></label>` : ''}
      <label class="field wide"><span>Notes</span><textarea data-f="notes">${esc(d.notes)}</textarea></label>
    </div>
    <div id="calc" style="margin-top:.8rem"></div>
    <div id="msgs" class="msgs"></div>
    <div class="row" style="margin-top:1rem"><button class="btn primary lg" id="save-trade" data-act="save-trade" disabled>${isImport ? 'Add holding' : 'Save long-term hold'}</button><button class="btn ghost" data-act="reset-draft">Clear form</button></div>
  </div>`;
}

/** Compute plan for the swing draft. Returns {calc, blocks, warns, errs, shares, ...} */
function planSwing(d, a) {
  const s = S();
  const entry = numVal(d.entry), stop = numVal(d.stop), atr = numVal(d.atr), fees = numVal(d.fees) || 0;
  const errs = {}, blocks = [], warns = [];
  if (!validDate(d.date)) errs.date = 'Enter a date';
  if (!d.ticker.trim()) errs.ticker = 'Required';
  if (!(entry > 0)) errs.entry = 'Must be a positive price';
  if (!(stop > 0)) errs.stop = 'Must be a positive price';
  else if (entry > 0 && stop >= entry) errs.stop = 'Stop must be below entry';
  if (!(atr > 0)) errs.atr = 'Must be positive';
  if (d.fees !== '' && !(numVal(d.fees) >= 0)) errs.fees = 'Must be 0 or more';
  if (d.earnings && !validDate(d.earnings)) errs.earnings = 'Invalid date';
  const pts = d.grade.filter(Boolean).length, grade = gradeFromPts(pts);
  const R1 = entry - stop;
  const ok = entry > 0 && stop > 0 && R1 > 0;
  const atrMult = ok && atr > 0 ? R1 / atr : NaN;
  const target = ok ? entry + s.rr * R1 : NaN;
  const trigger = ok ? entry + s.trailTriggerR * R1 : NaN;
  const gap = atr > 0 ? s.trailAtr * atr : NaN;
  const gPct = grade === 'Skip' ? 0 : s['risk' + grade] * a.riskMult;
  const riskBudget = a.equity * gPct / 100;
  let sugg = NaN, capped = [];
  const round = v => s.fractional ? Math.floor(v * 100) / 100 : Math.floor(v);
  if (ok && grade !== 'Skip') {
    sugg = round(riskBudget / R1);
    const capPos = round(a.equity * s.posCap / 100 / entry);
    const capCash = round(Math.max(0, a.cash - fees) / entry);
    if (capPos < sugg) { sugg = capPos; capped.push(`${s.posCap}% position cap`); }
    if (capCash < sugg) { sugg = capCash; capped.push('available cash'); }
  }
  const override = numVal(d.shares);
  const shares = d.shares !== '' && override >= 0 ? override : sugg;
  const riskGBP = ok && isNum(shares) ? shares * R1 : NaN;
  const posVal = isNum(shares) && entry > 0 ? shares * entry : NaN;
  const room = a.room;
  const costPct = riskGBP > 0 ? (fees * 2) / riskGBP * 100 : NaN;
  const profitT = isNum(shares) && ok ? shares * s.rr * R1 - fees * 2 : NaN;
  const sectorN = swingInSector(d.sector);
  const fitRoom = ok && room > 0 ? round(room / R1) : 0;

  // blocks
  if (a.mode === 'paused') blocks.push(`Paused by the −${s.dd2}% drawdown rule until ${niceDate(a.pauseEnd)}.`);
  if (a.mode === 'review') blocks.push('Pause over — confirm your review on the Today tab before new trades.');
  if (grade === 'Skip') blocks.push(`Setup grade is Skip (${pts} point${pts === 1 ? '' : 's'}) — needs at least 2.`);
  if (d.sector.trim() && sectorN >= s.maxPerSector) blocks.push(`${d.sector.trim()} already has ${sectorN} open swing positions (max ${s.maxPerSector}).`);
  if (!d.sector.trim()) errs.sector = 'Required for the sector limit';
  if (isNum(riskGBP) && riskGBP > room + 0.005) blocks.push(`Planned risk ${gbp(riskGBP)} is more than the open-risk room ${gbp(Math.max(0, room))}.` + (fitRoom > 0 ? ` Override to ${shareFmt(fitRoom)} shares or fewer to fit.` : ''));
  if (isNum(posVal) && posVal + fees > a.cash + 0.005) blocks.push(`Position ${gbp(posVal + fees)} (incl. fees) is more than available cash ${gbp(a.cash)}.`);
  if (isNum(shares) && shares <= 0 && grade !== 'Skip' && ok) blocks.push('Share count is 0 — the stop is too wide for the risk budget or cash.');
  const unticked = d.checks.filter(c => !c).length;
  // warns
  if (isNum(atrMult) && (atrMult < s.atrMin || atrMult > s.atrMax)) warns.push(`Stop distance is ${atrMult.toFixed(2)} × ATR — outside ${s.atrMin}–${s.atrMax}.`);
  if (isNum(costPct) && costPct > 10) warns.push(`Costs (entry + estimated exit fees) are ${costPct.toFixed(1)}% of the £ risk — over 10%.`);
  if (d.earnings && validDate(d.earnings) && d.earnings >= d.date && tradingDaysBetween(d.date, d.earnings) <= s.earningsDays) warns.push(`Earnings ${niceDate(d.earnings)} are within ${s.earningsDays} trading days.`);
  if (d.shares !== '' && isNum(override) && ok) {
    if (riskGBP > riskBudget + 0.005) warns.push(`Override: risk ${gbp(riskGBP)} is above the ${grade} budget ${gbp(riskBudget)}.`);
    if (posVal > a.equity * s.posCap / 100) warns.push(`Override: position ${gbp(posVal)} is ${pct(posVal / a.equity * 100)} of equity — above the ${s.posCap}% cap.`);
  }
  if (a.halved && a.mode === 'halved') warns.push(`Risk halved: drawdown ${pct(a.dd)} is past −${s.dd1}%.`);
  return { entry, stop, atr, fees, errs, blocks, warns, pts, grade, R1, ok, atrMult, target, trigger, gap, gPct, riskBudget, sugg, capped, shares, riskGBP, posVal, room, costPct, profitT, unticked, sectorN };
}

function updateCalc() {
  const box = $('#calc'); if (!box) return;
  const a = account(), d = ui.draft, s = S();
  const saveBtn = $('#save-trade');
  $$('[data-err]').forEach(e => e.textContent = '');
  $$('[data-f]').forEach(e => e.classList?.remove('invalid'));
  const showErrs = errs => { for (const [k, v] of Object.entries(errs)) { const e = $(`[data-err="${k}"]`); if (e) e.textContent = v; const i = $(`[data-f="${k}"]`); if (i && touched.has(k)) i.classList.add('invalid'); else if (e && !touched.has(k)) e.textContent = ''; } };

  if (ui.newMode === 'swing') {
    const p = planSwing(d, a);
    $('#grade-out').textContent = `${p.pts}/4 · ${p.grade}`;
    $('#grade-out').className = 'badge grade ' + (p.grade === 'Skip' ? 'bad' : p.grade === 'A' ? 'good' : 'info');
    const co = $('#check-out'); co.textContent = `${8 - p.unticked}/8`; co.className = 'badge ' + (p.unticked ? 'warn' : 'good');
    const it = (l, v, f) => `<div class="item"><div class="l">${f ? tip(l, f) : l}</div><div class="v">${v}</div></div>`;
    box.innerHTML = `<div class="calc">
      ${it('1R per share', px(p.R1), `entry − stop = ${px(p.entry)} − ${px(p.stop)}`)}
      ${it('Stop distance', isNum(p.atrMult) ? `<span class="${p.atrMult < s.atrMin || p.atrMult > s.atrMax ? 'neg' : ''}">${p.atrMult.toFixed(2)} × ATR</span>` : '—', `1R ÷ ATR = ${px(p.R1)} ÷ ${px(p.atr)}\nAllowed ${s.atrMin}–${s.atrMax}`)}
      ${it('Take profit (target)', px(p.target), `entry + ${s.rr} × 1R = ${px(p.entry)} + ${s.rr} × ${px(p.R1)}`)}
      ${it('Trail trigger', px(p.trigger), `entry + ${s.trailTriggerR}R = ${px(p.entry)} + ${px(p.R1 * s.trailTriggerR)}`)}
      ${it('Trail gap', px(p.gap), `${s.trailAtr} × ATR = ${s.trailAtr} × ${px(p.atr)}`)}
      ${it('Risk budget', p.grade === 'Skip' ? '—' : `${gbp(p.riskBudget)} <span class="small muted">(${p.gPct}%)</span>`, `${p.grade} ${p.grade === 'Skip' ? '' : s['risk' + p.grade] + '%'} × equity ${gbp(a.equity)}${a.halved ? ' × 0.5 (risk halved)' : ''}`)}
      ${it('Suggested shares', isNum(p.sugg) ? shareFmt(p.sugg) + (p.capped.length ? ` <span class="small muted">capped by ${p.capped.join(' & ')}</span>` : '') : '—', `floor(risk £ ÷ 1R) = floor(${gbp(p.riskBudget)} ÷ ${px(p.R1)})\nthen ≤ ${s.posCap}% × equity ÷ entry, and ≤ cash ÷ entry`)}
      ${it('Actual £ risk', isNum(p.riskGBP) ? `${gbp(p.riskGBP)} <span class="small muted">(${pct(p.riskGBP / a.equity * 100, 2)})</span>` : '—', `shares × 1R = ${shareFmt(p.shares)} × ${px(p.R1)}`)}
      ${it('Position value', isNum(p.posVal) ? `${gbp0(p.posVal)} <span class="small muted">(${pct(p.posVal / a.equity * 100)})</span>` : '—', `shares × entry; cap ${s.posCap}% = ${gbp0(a.equity * s.posCap / 100)}`)}
      ${it('Open-risk room', gbp(Math.max(0, p.room)), `${s.openRiskCap}% cap − open risk = ${gbp(a.capGBP)} − ${gbp(a.openRisk)}`)}
      ${it('Profit at target', isNum(p.profitT) ? `<span class="pos">${gbp0(p.profitT)}</span> <span class="small">${rfmt(s.rr, 1)}</span>` : '—', `shares × ${s.rr} × 1R − entry & exit fees (exit fee assumed = entry fee)`)}
      ${it('Costs vs risk', isNum(p.costPct) ? `<span class="${p.costPct > 10 ? 'neg' : ''}">${p.costPct.toFixed(1)}%</span>` : '—', `(entry fees × 2) ÷ £ risk = ${gbp(p.fees * 2)} ÷ ${gbp(p.riskGBP)}\nWarn above 10%`)}
      ${it('Sector', d.sector.trim() ? `${p.sectorN} / ${s.maxPerSector} open` : '—', `Open swing positions in this sector`)}
    </div>`;
    showErrs(p.errs);
    const hasErr = Object.keys(p.errs).length > 0;
    const msgs = [...p.blocks.map(m => `<div class="msg block">⛔ ${esc(m)}</div>`), ...p.warns.map(m => `<div class="msg warn">⚠ ${esc(m)}</div>`)];
    if (p.unticked) msgs.push(`<div class="msg info">Tick all ${ENTRY_ITEMS.length} entry checklist items to enable Save (${p.unticked} left).</div>`);
    if (hasErr && touched.size) msgs.push(`<div class="msg info">Fill in or fix: ${Object.keys(p.errs).join(', ')}.</div>`);
    if (!p.blocks.length && !p.unticked && !hasErr) msgs.push(`<div class="msg ok">✓ ${p.warns.length ? 'No blocking rules — check the warnings above.' : 'All rules pass.'}</div>`);
    $('#msgs').innerHTML = msgs.join('');
    saveBtn.disabled = hasErr || p.blocks.length > 0 || p.unticked > 0 || !(p.shares > 0);
    return;
  }
  // import / long
  const p = planOther(d, a);
  showErrs(p.errs);
  const it = (l, v, f) => `<div class="item"><div class="l">${f ? tip(l, f) : l}</div><div class="v">${v}</div></div>`;
  box.innerHTML = `<div class="calc">
    ${it('Cost', gbp(p.cost), `shares × price = ${shareFmt(p.shares)} × ${px(p.entry)}`)}
    ${it('Value now', gbp(p.mv), `shares × latest close`)}
    ${it('% of equity', isNum(p.mv) ? pct(p.mv / (a.equity + (p.pre ? p.mv : 0)) * 100) : '—', 'value ÷ equity after adding')}
    ${p.kind === 'swing' ? it('1R per share', px(p.R1), 'entry − stop') + it('Take profit', px(p.entry + S().rr * p.R1), `entry + ${S().rr} × 1R`) + it('Open risk', gbp(p.openRisk), S().openRiskBasis === 'entry' ? 'shares × (entry − stop)' : 'shares × (min(entry, close) − stop)') + it('Stop distance', isNum(p.atrMult) ? p.atrMult.toFixed(2) + ' × ATR' : '—', '1R ÷ ATR') : ''}
  </div>`;
  const msgs = p.warns.map(m => `<div class="msg warn">⚠ ${esc(m)}</div>`);
  if (Object.keys(p.errs).length && touched.size) msgs.push(`<div class="msg info">Fill in or fix: ${Object.keys(p.errs).join(', ')}.</div>`);
  $('#msgs').innerHTML = msgs.join('');
  saveBtn.disabled = Object.keys(p.errs).length > 0;
}

function planOther(d, a) {
  const s = S(), m = ui.newMode;
  const kind = m === 'long' ? 'long' : d.kind;
  const pre = m === 'import' && d.pre;
  const shares = numVal(d.shares), entry = numVal(d.entry), stop = numVal(d.stop), atr = numVal(d.atr), fees = numVal(d.fees) || 0, close = numVal(d.close);
  const errs = {}, warns = [];
  if (!validDate(d.date)) errs.date = 'Enter a date';
  if (!d.ticker.trim()) errs.ticker = 'Required';
  if (!(shares > 0)) errs.shares = 'Must be positive';
  if (!(entry > 0)) errs.entry = 'Must be a positive price';
  if (d.close !== '' && !(close > 0)) errs.close = 'Must be a positive price';
  if (d.fees !== '' && !(numVal(d.fees) >= 0)) errs.fees = 'Must be 0 or more';
  const cur = close > 0 ? close : entry;
  let R1 = NaN, openRisk = NaN, atrMult = NaN;
  if (kind === 'swing') {
    if (!(stop > 0)) errs.stop = 'Swing positions need a stop';
    else if (entry > 0 && stop >= entry) errs.stop = 'Stop must be below the average price (use Edit → raise stop for a trailed stop)';
    if (d.atr !== '' && !(atr > 0)) errs.atr = 'Must be positive';
    if (!d.sector.trim()) errs.sector = 'Required for the sector limit';
    R1 = entry - stop; atrMult = atr > 0 ? R1 / atr : NaN;
    const basis = s.openRiskBasis === 'entry' ? entry : Math.min(entry, cur);
    openRisk = Math.max(0, shares * (basis - stop));
    if (isNum(openRisk) && openRisk > a.room) warns.push(`This adds ${gbp(openRisk)} of open risk — more than the room ${gbp(Math.max(0, a.room))}. New swing trades will be blocked until risk comes down.`);
    if (stop > 0 && cur < stop) warns.push(`Latest close ${px(cur)} is already below the stop — this will show as EXIT.`);
    if (d.sector.trim() && swingInSector(d.sector) >= s.maxPerSector) warns.push(`${d.sector.trim()} already has ${s.maxPerSector}+ swing positions.`);
    if (!(atr > 0)) warns.push('Without ATR the trailing stop cannot move. You can add it later via Edit.');
    else if (isNum(atrMult) && (atrMult < s.atrMin || atrMult > s.atrMax)) warns.push(`Stop is ${atrMult.toFixed(2)} × ATR below the average price — outside your ${s.atrMin}–${s.atrMax} range.`);
  }
  if (!pre && entry > 0 && shares > 0 && shares * entry + fees > a.cash + 0.005) {
    if (m === 'long') errs.shares = 'More than available cash';
    else warns.push('Cost is more than available cash — tick "bought before my starting cash" if it was.');
  }
  return { kind, pre, shares, entry, stop, atr, fees, close, cost: shares * entry, mv: shares * cur, R1, openRisk, atrMult, errs, warns };
}

const touched = new Set();
function saveDraft() {
  const a = account(), d = ui.draft, s = S();
  let t;
  if (ui.newMode === 'swing') {
    const p = planSwing(d, a);
    if (Object.keys(p.errs).length || p.blocks.length || p.unticked || !(p.shares > 0)) return;
    t = {
      id: uid(), kind: 'swing', status: 'open', date: d.date, ticker: d.ticker.trim().toUpperCase(), market: d.market, sector: d.sector.trim(),
      entry: p.entry, stop: p.stop, atr: p.atr, earnings: d.earnings || null, fees: p.fees, notes: d.notes.trim(),
      grade: p.grade, gradePts: p.pts, gradeItems: [...d.grade], shares: p.shares,
      riskGBP: p.riskGBP, riskPct: p.riskGBP / a.equity * 100, equityAtEntry: a.equity,
      rr: s.rr, trailAtr: s.trailAtr, trailTriggerR: s.trailTriggerR, target: p.target,
      openRiskAfter: a.openRisk + p.riskGBP, openRiskAfterPct: (a.openRisk + p.riskGBP) / a.equity * 100,
      overridden: d.shares !== '', closes: {}, created: new Date().toISOString(),
    };
  } else {
    const p = planOther(d, a);
    if (Object.keys(p.errs).length) return;
    t = {
      id: uid(), kind: p.kind, status: 'open', date: d.date, ticker: d.ticker.trim().toUpperCase(), market: d.market, sector: d.sector.trim(),
      entry: p.entry, stop: p.kind === 'swing' ? p.stop : null, atr: p.kind === 'swing' && p.atr > 0 ? p.atr : null,
      earnings: d.earnings || null, fees: p.fees, notes: d.notes.trim(), grade: p.kind === 'swing' ? (d.gradeManual || '—') : '',
      shares: p.shares, pre: p.pre, imported: ui.newMode === 'import',
      rr: s.rr, trailAtr: s.trailAtr, trailTriggerR: s.trailTriggerR, closes: {}, created: new Date().toISOString(),
    };
    if (p.kind === 'swing') {
      t.target = p.entry + s.rr * p.R1; t.riskGBP = p.shares * p.R1; t.riskPct = t.riskGBP / a.equity * 100;
      t.openRiskAfter = a.openRisk + p.openRisk; t.openRiskAfterPct = t.openRiskAfter / a.equity * 100;
    }
    if (p.close > 0) t.closes[maxDate(d.date, todayISO())] = p.close;
  }
  if (S().startBalance == null) { S().startBalance = 0; S().startDate = d.date; }
  state.trades.push(t);
  save();
  ui.draft = null; touched.clear();
  toast(`${t.ticker} saved`);
  ui.view = 'today'; render();
}

/* ---- History ---- */
function renderHistory(a) {
  const s = S();
  const st = closedStats();
  const grades = ['A', 'B', 'C'].map(g => ({ g, ...closedStats(t => t.grade === g) }));
  const reasons = ['stop', 'trail', 'target', 'time', 'manual'].map(r => ({ r, ...closedStats(t => t.exit.reason === r) }));
  const days = s.startDate ? (toD(todayISO()) - toD(s.startDate)) / 864e5 : NaN;
  const contrib = contributed();
  const totRet = contrib > 0 ? a.equity / contrib - 1 : NaN;
  const ann = days >= 1 && isNum(totRet) ? (Math.pow(1 + totRet, 365 / days) - 1) * 100 : NaN;
  const stat = (l, v, f) => `<div class="kpi"><div class="label">${tip(l, f)}</div><div class="value" style="font-size:1.15rem">${v}</div></div>`;
  let gradeFlag = '';
  if (st.n >= 50) {
    const A = grades[0], C = grades[2];
    if (A.n && C.n) gradeFlag = A.expectancy > C.expectancy
      ? `<div class="msg ok">✓ A-grades (${rfmt(A.expectancy)}) are beating C-grades (${rfmt(C.expectancy)}) over ${st.n} trades — grade-based sizing is earning its keep.</div>`
      : `<div class="msg warn">⚠ A-grades (${rfmt(A.expectancy)}) are not beating C-grades (${rfmt(C.expectancy)}) over ${st.n} trades. Consider switching to a flat risk per trade (same % for every grade).</div>`;
    else gradeFlag = `<div class="msg info">Need closed trades in both A and C grades to compare.</div>`;
  } else gradeFlag = `<div class="msg info">The A vs C check runs once you have 50 closed swing trades (${st.n} so far).</div>`;

  const snaps = [...state.snapshots].sort((x, y) => y.date.localeCompare(x.date));
  return `
  <div class="card"><h2>Equity curve</h2><div class="legend"><span><i style="border-color:var(--series-1)"></i>Equity</span><span><i class="dash" style="border-color:var(--peak)"></i>Peak (high-water mark)</span></div><div class="chart" id="ch-equity"></div></div>
  <div class="grid two">
    <div class="card"><h2>Drawdown (underwater)</h2><div class="legend"><span><i style="border-color:var(--loss)"></i>Drawdown</span><span><i class="dash" style="border-color:var(--line-warn)"></i>−${s.dd1}% halve</span><span><i class="dash" style="border-color:var(--line-crit)"></i>−${s.dd2}% pause</span></div><div class="chart" id="ch-dd"></div></div>
    <div class="card"><h2>Total open risk %</h2><div class="legend"><span><i style="border-color:var(--series-1)"></i>Open risk</span><span><i class="dash" style="border-color:var(--line-crit)"></i>${s.openRiskCap}% cap</span></div><div class="chart" id="ch-risk"></div></div>
  </div>
  <div class="card"><h2>Closed swing trades — results in R</h2><div class="chart" id="ch-hist"></div></div>

  <div class="card"><h2>Statistics <span class="small muted">— closed swing trades</span></h2>
    <div class="grid stats">
      ${stat('Trades', st.n, 'Closed swing trades')}
      ${stat('Win rate', pct(st.winRate), 'Trades with R > 0 ÷ all trades')}
      ${stat('Average win', rfmt(st.avgWin), 'Mean R of winning trades')}
      ${stat('Average loss', rfmt(st.avgLoss), 'Mean R of losing / flat trades')}
      ${stat('Expectancy', rfmt(st.expectancy), 'Average R per trade = Σ R ÷ trades')}
      ${stat('Profit factor', isNum(st.pf) ? (st.pf === Infinity ? '∞' : st.pf.toFixed(2)) : '—', `Gross £ wins ÷ gross £ losses = ${gbp0(st.grossW)} ÷ ${gbp0(st.grossL)}`)}
      ${stat('Longest losing streak', st.n ? st.longest : '—', 'Consecutive trades with R ≤ 0, by exit date')}
      ${stat('Avg days held', isNum(st.avgDays) ? st.avgDays.toFixed(1) : '—', 'Mean trading days from entry to exit')}
      ${stat('Total fees', gbp(st.fees), 'Entry + exit fees on closed swing trades')}
      ${stat('Realised P&L', `<span class="${cls(st.totalGBP)}">${gbp0(st.totalGBP)}</span>`, 'Σ result £ of closed swing trades (after fees)')}
      ${stat('Annualised return', `<span class="${cls(ann)}">${pct(ann)}</span>`, `Whole account since ${niceDate(s.startDate)}:\n(equity ÷ money in)^(365 ÷ days) − 1\nmoney in = starting cash + imported holdings at cost + deposits − withdrawals = ${gbp(contrib)}\nequity ${gbp(a.equity)} · ${isNum(days) ? Math.round(days) : '—'} days`)}
    </div></div>

  <div class="grid two">
    <div class="card"><h2>Grade check</h2>
      <table><thead><tr><th>Grade</th><th class="num">Trades</th><th class="num">Win rate</th><th class="num">Avg R</th><th class="num">Result £</th></tr></thead><tbody>
      ${grades.map(g => `<tr><td><span class="badge grade">${g.g}</span></td><td class="num">${g.n}</td><td class="num">${pct(g.winRate)}</td><td class="num ${cls(g.expectancy)}">${rfmt(g.expectancy)}</td><td class="num ${cls(g.totalGBP)}">${gbp0(g.totalGBP)}</td></tr>`).join('')}
      </tbody></table><div class="msgs">${gradeFlag}</div></div>
    <div class="card"><h2>Exit reasons</h2>
      <table><thead><tr><th>Reason</th><th class="num">Trades</th><th class="num">Share</th><th class="num">Avg R</th></tr></thead><tbody>
      ${reasons.map(r => `<tr><td>${r.r}</td><td class="num">${r.n}</td><td class="num">${st.n ? pct(r.n / st.n * 100, 0) : '—'}</td><td class="num ${cls(r.expectancy)}">${rfmt(r.expectancy)}</td></tr>`).join('')}
      </tbody></table></div>
  </div>

  <div class="card"><details><summary>Daily snapshots (${snaps.length})</summary>
    ${snaps.length ? `<div class="tbl-wrap"><table style="margin-top:.6rem"><thead><tr><th>Date</th><th class="num">Equity</th><th class="num">Peak</th><th class="num">DD</th><th class="num">Open risk</th><th class="num">Open pos.</th><th class="num">Cash</th><th></th></tr></thead><tbody>
    ${withPeaks(snaps.slice().reverse()).reverse().map(p => `<tr><td>${niceDate(p.date)}</td><td class="num">${gbp0(p.equity)}</td><td class="num">${gbp0(p.peak)}</td><td class="num ${cls(p.dd)}">${pct(p.dd, 2)}</td><td class="num">${pct(p.openRiskPct, 2)}</td><td class="num">${p.openCount}</td><td class="num">${pct(p.cashPct)}</td><td><button class="btn sm ghost danger" data-act="del-snap" data-date="${p.date}">Delete</button></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Save closes on the Today tab to record a snapshot.</p>'}
  </details></div>`;
}
function withPeaks(snapsAsc) { return peakSeries(snapsAsc.map(p => ({ ...p }))).out; }

/* ---- charts (hand-rolled SVG) ---- */
function drawCharts() {
  const s = S();
  const snaps = withPeaks([...state.snapshots].sort((a, b) => a.date.localeCompare(b.date)));
  lineChart($('#ch-equity'), snaps, [
    { key: 'equity', color: 'var(--series-1)', label: 'Equity', fmt: gbp0 },
    { key: 'peak', color: 'var(--peak)', label: 'Peak', fmt: gbp0, dash: true },
  ], { yfmt: v => '£' + compact(v) });
  lineChart($('#ch-dd'), snaps, [{ key: 'dd', color: 'var(--loss)', label: 'Drawdown', fmt: v => pct(v, 2), area: true }],
    { yfmt: v => v.toFixed(0) + '%', yMax: 0, yMin: Math.min(-s.dd2 - 2, ...snaps.map(p => p.dd)), hlines: [{ y: -s.dd1, color: 'var(--line-warn)', label: `−${s.dd1}%` }, { y: -s.dd2, color: 'var(--line-crit)', label: `−${s.dd2}%` }] });
  lineChart($('#ch-risk'), snaps, [{ key: 'openRiskPct', color: 'var(--series-1)', label: 'Open risk', fmt: v => pct(v, 2) }],
    { yfmt: v => (+v.toFixed(1)) + '%', yMin: 0, yMax: Math.max(s.openRiskCap + 2, ...snaps.map(p => p.openRiskPct || 0)), hlines: [{ y: s.openRiskCap, color: 'var(--line-crit)', label: `${s.openRiskCap}% cap` }] });
  histogram($('#ch-hist'), closedStats().res.map(r => r.R));
}
function compact(v) { const a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(1) + 'm' : a >= 1e3 ? (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k' : v.toFixed(0); }
function niceTicks(min, max, n = 4) {
  if (min === max) { min -= 1; max += 1; }
  const step0 = (max - min) / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(st => st >= step0);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(10));
  return out;
}
function lineChart(el, data, series, o = {}) {
  if (!el) return;
  if (data.length < 2) { el.innerHTML = `<p class="muted small">Save closes on at least 2 days to see this chart.</p>`; return; }
  const W = Math.max(280, Math.round(el.clientWidth || 640)), H = 220, L = 48, R = 12, T = 10, B = 26;
  const vals = data.flatMap(p => series.map(sr => p[sr.key])).filter(isNum);
  let yMin = o.yMin ?? Math.min(...vals), yMax = o.yMax ?? Math.max(...vals);
  if (o.yMin == null && o.yMax == null) { const pad = (yMax - yMin) * 0.08 || Math.abs(yMax) * 0.02 || 1; yMin -= pad; yMax += pad; }
  const ticks = niceTicks(yMin, yMax);
  yMin = Math.min(yMin, ticks[0]); yMax = Math.max(yMax, ticks[ticks.length - 1]);
  if (o.yMax === 0) yMax = 0;
  const t0 = toD(data[0].date).getTime(), t1 = toD(data[data.length - 1].date).getTime();
  const x = d => L + (toD(d).getTime() - t0) / ((t1 - t0) || 1) * (W - L - R);
  const y = v => T + (yMax - v) / ((yMax - yMin) || 1) * (H - T - B);
  const xt = [0, Math.floor((data.length - 1) / 2), data.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s => s.label).join(', '))} over time">`;
  svg += `<g class="axis">${ticks.filter(v => v >= yMin - 1e-9 && v <= yMax + 1e-9).map(v => `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${esc(o.yfmt(v))}</text>`).join('')}
    ${xt.map(i => `<text x="${x(data[i].date)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}">${esc(niceDate(data[i].date))}</text>`).join('')}</g>`;
  for (const h of o.hlines || []) if (h.y >= yMin && h.y <= yMax) svg += `<line x1="${L}" x2="${W - R}" y1="${y(h.y)}" y2="${y(h.y)}" stroke="${h.color}" stroke-width="1.5" stroke-dasharray="5 4"/><text class="hint" x="${W - R - 2}" y="${y(h.y) - 4}" text-anchor="end">${esc(h.label)}</text>`;
  for (const sr of series) {
    const pts = data.filter(p => isNum(p[sr.key])).map(p => `${x(p.date).toFixed(1)},${y(p[sr.key]).toFixed(1)}`);
    if (sr.area) svg += `<polygon points="${x(data[0].date)},${y(0)} ${pts.join(' ')} ${x(data[data.length - 1].date)},${y(0)}" fill="${sr.color}" opacity=".15"/>`;
    svg += `<polyline class="ln" points="${pts.join(' ')}" stroke="${sr.color}" ${sr.dash ? 'stroke-dasharray="5 4" stroke-width="1.5"' : ''}/>`;
  }
  svg += `<line class="xhair" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>`;
  svg += series.map((sr, i) => `<circle class="dot" data-i="${i}" r="4" fill="${sr.color}" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>`).join('');
  svg += `<rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" class="hit"/></svg><div class="chart-tip" hidden></div>`;
  el.innerHTML = svg;
  const sv = $('svg', el), tipEl = $('.chart-tip', el), xh = $('.xhair', el), dots = $$('.dot', el);
  const move = ev => {
    const r = sv.getBoundingClientRect(), sx = (ev.clientX - r.left) / r.width * W;
    let best = 0, bd = Infinity;
    data.forEach((p, i) => { const dd = Math.abs(x(p.date) - sx); if (dd < bd) { bd = dd; best = i; } });
    const p = data[best], px_ = x(p.date);
    xh.setAttribute('x1', px_); xh.setAttribute('x2', px_); xh.setAttribute('visibility', 'visible');
    series.forEach((sr, i) => { if (isNum(p[sr.key])) { dots[i].setAttribute('cx', px_); dots[i].setAttribute('cy', y(p[sr.key])); dots[i].setAttribute('visibility', 'visible'); } });
    tipEl.textContent = '';
    const h = document.createElement('div'); h.style.fontWeight = '650'; h.textContent = niceDate(p.date); tipEl.append(h);
    for (const sr of series) { const d = document.createElement('div'); d.textContent = `${sr.label}: ${sr.fmt(p[sr.key])}`; tipEl.append(d); }
    tipEl.hidden = false;
    const left = px_ / W * r.width;
    tipEl.style.left = Math.min(r.width - tipEl.offsetWidth, Math.max(0, left + 10)) + 'px';
    tipEl.style.top = '0px';
  };
  const leave = () => { tipEl.hidden = true; xh.setAttribute('visibility', 'hidden'); dots.forEach(d => d.setAttribute('visibility', 'hidden')); };
  sv.addEventListener('pointermove', move); sv.addEventListener('pointerdown', move); sv.addEventListener('pointerleave', leave);
}
function histogram(el, rs) {
  if (!el) return;
  if (!rs.length) { el.innerHTML = '<p class="muted small">No closed swing trades yet.</p>'; return; }
  const lo = Math.max(-3, Math.min(-2, Math.floor(Math.min(...rs) * 2) / 2)), hi = Math.min(6, Math.max(4.5, Math.ceil(Math.max(...rs) * 2) / 2 + 0.5));
  const bins = [];
  for (let v = lo; v < hi; v += 0.5) bins.push({ a: v, b: v + 0.5, n: 0 });
  if (!bins.length) bins.push({ a: lo, b: lo + 0.5, n: 0 });
  for (const r of rs) {
    let i = Math.floor((r - lo) / 0.5); i = Math.max(0, Math.min(bins.length - 1, i));
    bins[i].n++;
  }
  const W = Math.max(280, Math.round(el.clientWidth || 640)), H = 200, L = 30, R = 8, T = 10, B = 28, maxN = Math.max(...bins.map(b => b.n));
  const bw = (W - L - R) / bins.length;
  const y = n => T + (1 - n / maxN) * (H - T - B);
  const ticks = niceTicks(0, maxN, Math.min(4, maxN)).filter(v => Number.isInteger(v) && v <= maxN);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Histogram of trade results in R"><g class="axis">`;
  svg += ticks.map(v => `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  bins.forEach((b, i) => { if (i % (W < 500 ? 2 : 1) === 0) svg += `<text x="${L + i * bw}" y="${H - 8}" text-anchor="middle">${b.a > 0 ? '+' : ''}${b.a}R</text>`; });
  svg += `</g>`;
  bins.forEach((b, i) => {
    if (!b.n) return;
    const x0 = L + i * bw + 1, w = bw - 2, y0 = y(b.n), h = H - B - y0;
    const lbl = `${b.a === lo && lo === -3 ? '≤ ' : ''}${b.a}R to ${b.b}R${b.b === hi && hi === 6 ? '+' : ''}: ${b.n} trade${b.n > 1 ? 's' : ''}`;
    svg += `<path class="bar tip" data-tip="${esc(lbl)}" d="M${x0},${H - B} V${y0 + Math.min(4, h)} q0,-4 4,-4 h${w - 8} q4,0 4,4 V${H - B} Z" fill="${b.a < 0 ? 'var(--loss)' : 'var(--win)'}"/>`;
  });
  svg += `<line x1="${L + (0 - lo) / 0.5 * bw}" x2="${L + (0 - lo) / 0.5 * bw}" y1="${T}" y2="${H - B}" stroke="var(--muted)" stroke-dasharray="3 3"/></svg>`;
  el.innerHTML = `<div class="legend"><span><i style="border-color:var(--loss);border-top-width:8px"></i>Loss</span><span><i style="border-color:var(--win);border-top-width:8px"></i>Win</span><span class="muted">Bins of 0.5R. Hover a bar for the count.</span></div>` + svg;
}

/* ---- Trade log ---- */
const LOG_COLS = [
  ['date', 'Date'], ['kind', 'Type'], ['ticker', 'Ticker'], ['sector', 'Sector'], ['grade', 'Grade'], ['entry', 'Entry'], ['stop', 'Stop'], ['atr', 'ATR'],
  ['R1', '1R'], ['shares', 'Shares'], ['riskGBP', 'Risk £'], ['riskPct', 'Risk %'], ['target', 'Target'], ['openRiskAfter', 'Open risk after'],
  ['exitDate', 'Exit date'], ['exitPrice', 'Exit price'], ['exitReason', 'Exit reason'], ['resGBP', 'Result £'], ['resR', 'Result R'], ['feesAll', 'Fees'], ['notes', 'Notes'],
];
function logRow(t) {
  const r = tradeResult(t);
  return {
    t, date: t.date, kind: t.kind === 'swing' ? 'Swing' : 'Long', ticker: t.ticker, sector: t.sector, grade: t.grade || '', entry: t.entry,
    stop: t.stop, atr: t.atr, R1: t.kind === 'swing' ? t.entry - t.stop : NaN, shares: t.shares, riskGBP: t.riskGBP, riskPct: t.riskPct,
    target: t.target, openRiskAfter: t.openRiskAfter, exitDate: t.exit?.date || '', exitPrice: t.exit?.price, exitReason: t.exit?.reason || (t.status === 'open' ? 'open' : ''),
    resGBP: r.gbp, resR: r.R, feesAll: (t.fees || 0) + (t.exit?.fees || 0), notes: t.notes || '', status: t.status,
  };
}
function filteredLog() {
  const f = ui.logFilter, q = f.q.trim().toLowerCase();
  let rows = state.trades.map(logRow).filter(r =>
    (f.status === 'all' || r.status === f.status) && (f.kind === 'all' || r.t.kind === f.kind) && (f.grade === 'all' || r.grade === f.grade) &&
    (!q || [r.ticker, r.sector, r.notes, r.exitReason].join(' ').toLowerCase().includes(q)));
  const { key, dir } = ui.logSort;
  rows.sort((a, b) => {
    const x = a[key], y = b[key];
    if (typeof x === 'number' || typeof y === 'number') return ((isNum(x) ? x : -Infinity) - (isNum(y) ? y : -Infinity)) * dir;
    return String(x ?? '').localeCompare(String(y ?? '')) * dir;
  });
  return rows;
}
function renderLog() {
  const f = ui.logFilter, rows = filteredLog();
  const cell = (k, r) => {
    const v = r[k];
    if (['entry', 'stop', 'atr', 'R1', 'target', 'exitPrice'].includes(k)) return `<td class="num">${px(v)}</td>`;
    if (['riskGBP', 'openRiskAfter', 'feesAll'].includes(k)) return `<td class="num">${gbp(v)}</td>`;
    if (k === 'resGBP') return `<td class="num ${cls(v)}">${gbp(v)}</td>`;
    if (k === 'resR') return `<td class="num ${cls(v)}">${rfmt(v)}</td>`;
    if (k === 'riskPct') return `<td class="num">${pct(v, 2)}</td>`;
    if (k === 'shares') return `<td class="num">${shareFmt(v)}</td>`;
    if (k === 'date' || k === 'exitDate') return `<td>${v ? niceDate(v) : ''}</td>`;
    if (k === 'notes') return `<td style="white-space:normal;min-width:160px">${esc(v)}</td>`;
    return `<td>${esc(v)}</td>`;
  };
  const sel = (id, opts) => `<select data-lf="${id}" style="width:auto">${opts.map(([v, l]) => `<option value="${v}" ${f[id] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return `<div class="card">
    <div class="spread"><h2 style="margin:0">Trade log <span class="muted small">${rows.length} of ${state.trades.length}</span></h2>
      <div class="row">
        <input type="text" data-lf="q" placeholder="Search ticker, sector, notes" value="${esc(f.q)}" style="width:210px">
        ${sel('status', [['all', 'All'], ['open', 'Open'], ['closed', 'Closed']])}
        ${sel('kind', [['all', 'Swing + long'], ['swing', 'Swing'], ['long', 'Long']])}
        ${sel('grade', [['all', 'All grades'], ['A', 'A'], ['B', 'B'], ['C', 'C']])}
        <button class="btn" data-act="csv">Export CSV</button>
      </div></div>
    <div class="tbl-wrap" style="margin-top:.8rem"><table class="log-table"><thead><tr>
      ${LOG_COLS.map(([k, l]) => `<th class="sortable ${['entry', 'stop', 'atr', 'R1', 'shares', 'riskGBP', 'riskPct', 'target', 'openRiskAfter', 'exitPrice', 'resGBP', 'resR', 'feesAll'].includes(k) ? 'num' : ''}" data-sort="${k}">${l}${ui.logSort.key === k ? (ui.logSort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}<th></th>
    </tr></thead><tbody>
      ${rows.map(r => `<tr>${LOG_COLS.map(([k]) => cell(k, r)).join('')}<td><div class="row" style="flex-wrap:nowrap"><button class="btn sm ghost" data-act="edit" data-id="${r.t.id}">Edit</button>${r.status === 'closed' ? `<button class="btn sm ghost" data-act="reopen" data-id="${r.t.id}">Reopen</button>` : ''}<button class="btn sm ghost danger" data-act="del-trade" data-id="${r.t.id}">Delete</button></div></td></tr>`).join('') || `<tr><td colspan="${LOG_COLS.length + 1}" class="muted">No trades match.</td></tr>`}
    </tbody></table></div></div>`;
}
function csvExport() {
  const rows = filteredLog();
  const q = v => { const s = v == null || (typeof v === 'number' && !isFinite(v)) ? '' : typeof v === 'number' ? String(+v.toFixed(6)) : String(v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) && isNaN(+s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
  const lines = [LOG_COLS.map(c => c[1]).join(',')].concat(rows.map(r => LOG_COLS.map(([k]) => q(r[k])).join(',')));
  download(`isa-trade-log-${todayISO()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
}

/* ---- Settings ---- */
const SETTING_FIELDS = [
  ['Account', [['startBalance', 'Starting cash balance (£)'], ['startDate', 'Start date', 'date']]],
  ['Risk', [['openRiskCap', 'Total open-risk cap (% of equity)'], ['riskC', 'Risk per trade — C (%)'], ['riskB', 'Risk per trade — B (%)'], ['riskA', 'Risk per trade — A (%)'], ['posCap', 'Position size cap (% of equity)'], ['maxPerSector', 'Max open swing positions per sector']]],
  ['Stops & targets', [['rr', 'Take-profit RR'], ['atrMin', 'Min stop distance (× ATR)'], ['atrMax', 'Max stop distance (× ATR)'], ['trailTriggerR', 'Trail activates at (R)'], ['trailAtr', 'Trail gap (× ATR at entry)'], ['timeStopDays', 'Time stop (trading days)'], ['earningsDays', 'Earnings warning (trading days)']]],
  ['Drawdown rules', [['dd1', 'Halve risk at drawdown (%)'], ['dd2', 'Pause at drawdown (%)'], ['pauseDays', 'Pause length (trading days)']]],
];
function renderSettings() {
  const s = S();
  const flows = [...state.flows].sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="card"><h2>Settings</h2>
    <p class="small muted">Changes apply to new trades. Open trades keep the RR, trail trigger and trail gap they were opened with, so their stops never move down.</p>
    ${SETTING_FIELDS.map(([h, fs]) => `<h3 style="margin-top:1rem">${h}</h3><div class="form-grid">${fs.map(([k, l, type]) => `<label class="field"><span>${l}</span><input type="${type || 'number'}" ${type ? '' : 'step="any" min="0" inputmode="decimal"'} data-s="${k}" value="${esc(s[k] ?? '')}"></label>`).join('')}</div>`).join('')}
    <h3 style="margin-top:1rem">Behaviour</h3>
    <div class="form-grid">
      <label class="field"><span>At the target</span><select data-s="targetMode"><option value="exit" ${s.targetMode === 'exit' ? 'selected' : ''}>Full exit (alert "Target hit — exit")</option><option value="trail" ${s.targetMode === 'trail' ? 'selected' : ''}>Keep trailing (target is a marker)</option></select></label>
      <label class="field"><span>Open risk measured from</span><select data-s="openRiskBasis"><option value="current" ${s.openRiskBasis === 'current' ? 'selected' : ''}>min(entry, latest close) − stop</option><option value="entry" ${s.openRiskBasis === 'entry' ? 'selected' : ''}>entry − stop</option></select></label>
      <label class="field"><span>Share sizing</span><select data-s="fractional"><option value="false" ${!s.fractional ? 'selected' : ''}>Whole shares</option><option value="true" ${s.fractional ? 'selected' : ''}>Fractional (0.01)</option></select></label>
    </div>
    <div class="row" style="margin-top:1rem"><button class="btn primary" data-act="save-settings">Save settings</button><button class="btn ghost" data-act="default-settings">Restore defaults</button></div>
  </div>

  <div class="card"><h2>Deposits &amp; withdrawals</h2>
    <p class="small muted">Recorded so they change cash and the peak, not your gains or losses.</p>
    <div class="form-grid">
      <label class="field"><span>Date</span><input type="date" id="fl-date" value="${todayISO()}"></label>
      <label class="field"><span>Type</span><select id="fl-type"><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option></select></label>
      <label class="field"><span>Amount (£)</span><input type="number" id="fl-amt" step="0.01" min="0" inputmode="decimal"></label>
      <label class="field"><span>Note</span><input type="text" id="fl-note"></label>
    </div>
    <div class="row" style="margin-top:.7rem"><button class="btn" data-act="add-flow">Add</button><span class="err" id="fl-err"></span></div>
    ${flows.length ? `<div class="tbl-wrap"><table style="margin-top:.8rem"><thead><tr><th>Date</th><th>Type</th><th class="num">Amount</th><th>Note</th><th></th></tr></thead><tbody>
      ${flows.map(f => `<tr><td>${niceDate(f.date)}</td><td>${f.type}</td><td class="num ${f.type === 'deposit' ? 'pos' : 'neg'}">${gbp(f.amount)}</td><td>${esc(f.note)}</td><td><button class="btn sm ghost danger" data-act="del-flow" data-id="${f.id}">Delete</button></td></tr>`).join('')}
    </tbody></table></div>` : ''}
  </div>

  <div class="card"><h2>Data</h2>
    <p class="small muted">Everything is stored in this browser only (localStorage). Export a JSON backup regularly.</p>
    <div class="row">
      <button class="btn" data-act="export">Export JSON backup</button>
      <label class="btn" for="file-import">Import JSON backup</label>
      <button class="btn" data-act="sample">Load sample data</button>
      <button class="btn danger" data-act="wipe">Delete all data</button>
    </div>
  </div>`;
}

/* ---------------- modals ---------------- */
function modal(html, onMount) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const bg = $('.modal-bg', root);
  bg.addEventListener('click', e => { if (e.target === bg) closeModal(); });
  onMount && onMount($('.modal', root));
  setTimeout(() => $('.modal input, .modal select', root)?.focus(), 30);
}
function closeModal() { $('#modal-root').innerHTML = ''; }

function closeTradeModal(t) {
  const swing = t.kind === 'swing';
  const c = swing ? swingCalc(t) : longCalc(t);
  let reason = 'manual';
  if (swing) {
    if (c.close < c.stop) reason = c.raised ? 'trail' : 'stop';
    else if (c.hi >= c.target) reason = 'target';
    else if (c.days >= S().timeStopDays) reason = 'time';
  }
  modal(`<h2>${swing ? 'Close trade' : 'Sell'} — ${esc(t.ticker)}</h2>
    <div class="form-grid">
      <label class="field"><span>Exit date</span><input type="date" id="x-date" value="${maxDate(lastCloseDate(t), todayISO())}"></label>
      <label class="field"><span>Exit price (£)</span><input type="number" id="x-price" step="any" min="0" inputmode="decimal" value="${swing && reason !== 'manual' && reason !== 'time' && reason !== 'target' ? +c.stop.toFixed(4) : +c.close.toFixed(4)}"></label>
      <label class="field"><span>Fees (£)</span><input type="number" id="x-fees" step="any" min="0" inputmode="decimal" value="${t.fees || 0}"></label>
      <label class="field"><span>Reason</span><select id="x-reason">${['stop', 'trail', 'target', 'time', 'manual'].map(r => `<option ${r === reason ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    </div>
    <div id="x-out" class="msgs"></div>
    <div class="actions"><button class="btn ghost" data-m="cancel">Cancel</button><button class="btn primary" data-m="ok">${swing ? 'Close trade' : 'Sell'}</button></div>`, m => {
    const upd = () => {
      const p = numVal($('#x-price', m).value), f = numVal($('#x-fees', m).value) || 0;
      const res = t.shares * (p - t.entry) - (t.fees || 0) - f, R = swing ? (p - t.entry) / (t.entry - t.stop) : NaN;
      $('#x-out', m).innerHTML = p > 0 ? `<div class="msg ${res >= 0 ? 'ok' : 'warn'}">${tip('Result', `shares × (exit − entry) − entry fees − exit fees\n= ${shareFmt(t.shares)} × (${px(p)} − ${px(t.entry)}) − ${gbp(t.fees || 0)} − ${gbp(f)}`)}: <b>${gbp(res)}</b>${swing ? ` · ${tip(rfmt(R), `(exit − entry) ÷ initial 1R = (${px(p)} − ${px(t.entry)}) ÷ ${px(t.entry - t.stop)}`)}` : ''} · frees ${gbp(t.shares * p - f)} cash</div>` : `<div class="msg block">Enter a positive exit price</div>`;
    };
    $$('input', m).forEach(i => i.addEventListener('input', upd)); upd();
    $('[data-m=cancel]', m).onclick = closeModal;
    $('[data-m=ok]', m).onclick = () => {
      const d = $('#x-date', m).value, p = numVal($('#x-price', m).value), f = numVal($('#x-fees', m).value) || 0;
      if (!validDate(d) || d < t.date) return toast('Exit date must be on or after the entry date');
      if (!(p > 0)) return toast('Exit price must be positive');
      if (f < 0) return toast('Fees cannot be negative');
      t.status = 'closed'; t.exit = { date: d, price: p, fees: f, reason: $('#x-reason', m).value };
      save(); closeModal(); toast(`${t.ticker} closed`); render();
    };
  });
}

function editModal(t) {
  const swing = t.kind === 'swing';
  const c = swing ? swingCalc(t) : null;
  modal(`<h2>Edit — ${esc(t.ticker)}</h2>
    <div class="form-grid">
      <label class="field"><span>Ticker</span><input type="text" id="e-ticker" value="${esc(t.ticker)}"></label>
      <label class="field"><span>Sector</span><input type="text" id="e-sector" value="${esc(t.sector)}"></label>
      <label class="field"><span>Market</span><select id="e-market">${['UK', 'US', 'Other'].map(x => `<option ${t.market === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="field"><span>Type</span><select id="e-kind"><option value="swing" ${swing ? 'selected' : ''}>Swing</option><option value="long" ${!swing ? 'selected' : ''}>Long-term hold</option></select></label>
      <label class="field"><span>Next earnings</span><input type="date" id="e-earn" value="${esc(t.earnings || '')}"></label>
      ${swing ? `<label class="field"><span>ATR(14) at entry (£)</span><input type="number" id="e-atr" step="any" min="0" value="${t.atr ?? ''}"></label>
      <label class="field"><span>Raise stop to (£)</span><input type="number" id="e-mstop" step="any" min="0" placeholder="current ${px(c.stop)}" value="${t.manualStop ?? ''}"></label>` : ''}
      ${!swing ? `<label class="field"><span>Initial stop (£, if switching to swing)</span><input type="number" id="e-stop" step="any" min="0" value="${t.stop ?? ''}"></label>` : ''}
      <label class="field wide"><span>Notes</span><textarea id="e-notes">${esc(t.notes)}</textarea></label>
    </div>
    <p class="small muted">Stops only move up: a manual stop below the current stop is ignored. Entry, initial stop and shares are fixed — delete and re-enter the trade to change them.</p>
    <div id="e-err" class="err"></div>
    <div class="actions"><button class="btn ghost danger" data-m="del" style="margin-right:auto">Delete</button><button class="btn ghost" data-m="cancel">Cancel</button><button class="btn primary" data-m="ok">Save</button></div>`, m => {
    $('[data-m=cancel]', m).onclick = closeModal;
    $('[data-m=del]', m).onclick = () => { closeModal(); deleteTrade(t); };
    $('[data-m=ok]', m).onclick = () => {
      const tk = $('#e-ticker', m).value.trim().toUpperCase();
      if (!tk) return ($('#e-err', m).textContent = 'Ticker is required');
      const kind = $('#e-kind', m).value;
      const earn = $('#e-earn', m).value;
      if (kind === 'swing' && !swing) {
        const st = numVal($('#e-stop', m).value);
        if (!(st > 0) || st >= t.entry) return ($('#e-err', m).textContent = 'Swing positions need a stop below the entry price');
        t.stop = st; t.grade = t.grade || '—'; t.rr = t.rr ?? S().rr; t.trailAtr = t.trailAtr ?? S().trailAtr; t.trailTriggerR = t.trailTriggerR ?? S().trailTriggerR;
        t.target = t.entry + t.rr * (t.entry - st); t.riskGBP = t.shares * (t.entry - st);
      }
      if (swing) {
        const atr = numVal($('#e-atr', m).value), ms = numVal($('#e-mstop', m).value);
        if ($('#e-atr', m).value !== '' && !(atr > 0)) return ($('#e-err', m).textContent = 'ATR must be positive');
        t.atr = atr > 0 ? atr : null;
        if ($('#e-mstop', m).value === '') delete t.manualStop;
        else if (!(ms > 0)) return ($('#e-err', m).textContent = 'Stop must be positive');
        else t.manualStop = ms;
      }
      t.ticker = tk; t.sector = $('#e-sector', m).value.trim(); t.market = $('#e-market', m).value; t.kind = kind;
      t.earnings = validDate(earn) ? earn : null; t.notes = $('#e-notes', m).value.trim();
      save(); closeModal(); render();
    };
  });
}
function deleteTrade(t) {
  if (!confirm(`Delete ${t.ticker} (${t.kind}, ${t.status}, entered ${niceDate(t.date)})? This cannot be undone.`)) return;
  state.trades = state.trades.filter(x => x.id !== t.id); save(); toast(`${t.ticker} deleted`); render();
}

/* ---------------- actions ---------------- */
function saveCloses() {
  const date = ui.asOf;
  if (!validDate(date)) return toast('Pick a valid date');
  const inputs = $$('#view-today input.close-in');
  let bad = false, n = 0;
  for (const i of inputs) {
    i.classList.remove('invalid');
    if (i.value === '') continue;
    const v = numVal(i.value);
    if (!(v > 0)) { i.classList.add('invalid'); bad = true; continue; }
    const t = state.trades.find(x => x.id === i.dataset.id);
    if (t) { if (date < t.date) { i.classList.add('invalid'); bad = true; continue; } t.closes[date] = v; n++; }
  }
  if (bad) return toast('Fix the highlighted prices (positive, on/after entry date)');
  const a = account();
  const snap = { date, equity: a.equity, openRiskPct: a.openRiskPct, openCount: openTrades().length, openSwing: openSwing().length, cashPct: a.equity > 0 ? a.cash / a.equity * 100 : 0 };
  state.snapshots = state.snapshots.filter(s => s.date !== date).concat(snap);
  // store peak & dd in the snapshot for export
  const ps = withPeaks([...state.snapshots].sort((x, y) => x.date.localeCompare(y.date)));
  for (const p of ps) { const s = state.snapshots.find(x => x.date === p.date); s.peak = +p.peak.toFixed(2); s.dd = +p.dd.toFixed(4); }
  save(); toast(`Saved ${n} close${n === 1 ? '' : 's'} and snapshot for ${niceDate(date)}`); render();
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function exportJSON() { download(`isa-risk-backup-${todayISO()}.json`, JSON.stringify({ app: 'isa-risk-tracker', exported: new Date().toISOString(), ...state }, null, 2), 'application/json'); }
function importJSON(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d || typeof d !== 'object' || !Array.isArray(d.trades) || !d.settings) throw new Error('Not a backup file');
      if (!confirm(`Replace all current data with this backup (${d.trades.length} trades, ${(d.snapshots || []).length} snapshots)?`)) return;
      state = normalise(d); save(); toast('Backup imported'); ui.view = 'today'; render();
    } catch (e) { alert('Could not import: ' + e.message); }
  };
  r.readAsText(file);
}

function loadSample() {
  if ((state.trades.length || state.snapshots.length) && !confirm('Replace all current data with sample data? Export a backup first if you want to keep it.')) return;
  const T = todayISO();
  const back = n => { const d = toD(T); let k = 0; while (k < n) { d.setUTCDate(d.getUTCDate() - 1); if (isWeekday(d)) k++; } return toS(d); };
  const st = blankState();
  st.settings.startBalance = 20000; st.settings.startDate = back(45);
  st.flows = [{ id: uid(), date: back(20), type: 'deposit', amount: 1000, note: 'Monthly ISA top-up' }];
  const mk = (o) => ({ id: uid(), status: 'open', market: 'UK', closes: {}, rr: 4, trailAtr: 4, trailTriggerR: 1, created: new Date().toISOString(), ...o });
  // Trade 1: A-grade, ran up, trail active
  const t1 = mk({ kind: 'swing', date: back(40), ticker: 'BARC', sector: 'Banks', entry: 2.10, stop: 1.98, atr: 0.06, fees: 0, grade: 'A', gradePts: 4, shares: 1666, notes: 'Sample: channel bounce, strong volume', earnings: null });
  // Trade 2: B-grade, fresh
  const t2 = mk({ kind: 'swing', date: back(6), ticker: 'RR', sector: 'Aerospace', entry: 5.40, stop: 5.10, atr: 0.15, fees: 0, grade: 'B', gradePts: 3, shares: 500, notes: 'Sample: RSI turning from 41', earnings: addTradingDays(T, 3) });
  // Trade 3: C-grade, closed at stop
  const t3 = mk({ kind: 'swing', date: back(30), ticker: 'TSCO', sector: 'Retail', entry: 3.50, stop: 3.35, atr: 0.08, fees: 0, grade: 'C', gradePts: 2, shares: 666, notes: 'Sample: lost the channel', earnings: null, status: 'closed', exit: { date: back(22), price: 3.34, fees: 0, reason: 'stop' } });
  const p1 = [2.10, 2.12, 2.15, 2.14, 2.20, 2.24, 2.28, 2.27, 2.33, 2.38, 2.41, 2.39, 2.45, 2.48, 2.44, 2.50, 2.53, 2.49, 2.55, 2.58, 2.56, 2.60, 2.57, 2.62, 2.59, 2.64, 2.61, 2.66, 2.63, 2.67, 2.64, 2.68];
  const p2 = [5.40, 5.38, 5.46, 5.52, 5.49, 5.55];
  const p3 = [3.50, 3.48, 3.45, 3.47, 3.41, 3.39, 3.36, 3.34];
  const allDates = []; for (let i = 32; i >= 0; i--) allDates.push(back(i));
  st.trades = [t1, t2, t3];
  // build closes + snapshots day by day (account() reads the global state)
  state = st;
  allDates.forEach((d, k) => {
    const idx1 = k - (allDates.length - p1.length);
    if (idx1 >= 0 && d >= t1.date) t1.closes[d] = p1[idx1];
    const idx2 = k - (allDates.length - p2.length);
    if (idx2 >= 0 && d >= t2.date) t2.closes[d] = p2[idx2];
    const idx3 = tradingDaysBetween(t3.date, d);
    if (idx3 >= 0 && idx3 < p3.length && d <= t3.exit.date) t3.closes[d] = p3[idx3];
    // snapshot as if trades opened/closed when they did
    const hidden = st.trades.filter(t => t.date > d);
    st.trades = st.trades.filter(t => t.date <= d);
    const closedLater = st.trades.filter(t => t.status === 'closed' && t.exit.date > d);
    closedLater.forEach(t => { t.status = 'open'; t._ex = t.exit; delete t.exit; });
    const flowsLater = st.flows.filter(f => f.date > d); st.flows = st.flows.filter(f => f.date <= d);
    const a = account();
    st.snapshots.push({ date: d, equity: a.equity, openRiskPct: a.openRiskPct, openCount: openTrades().length, openSwing: openSwing().length, cashPct: a.cash / a.equity * 100 });
    closedLater.forEach(t => { t.status = 'closed'; t.exit = t._ex; delete t._ex; });
    st.flows = st.flows.concat(flowsLater);
    st.trades = st.trades.concat(hidden);
  });
  st.trades.sort((a, b) => a.date.localeCompare(b.date));
  const ps = withPeaks([...st.snapshots]);
  ps.forEach((p, i) => { st.snapshots[i].peak = +p.peak.toFixed(2); st.snapshots[i].dd = +p.dd.toFixed(4); });
  // compute entry-time fields
  for (const t of st.trades) { const R1 = t.entry - t.stop; t.target = t.entry + 4 * R1; t.riskGBP = t.shares * R1; t.riskPct = t.riskGBP / 20000 * 100; t.equityAtEntry = 20000; t.openRiskAfter = t.riskGBP; t.openRiskAfterPct = t.riskPct; }
  save(); ui.view = 'today'; ui.asOf = todayISO(); toast('Sample data loaded'); render();
}

/* ---------------- events ---------------- */
document.addEventListener('click', e => {
  const tab = e.target.closest('#tabs button');
  if (tab) { ui.view = tab.dataset.view; render(); window.scrollTo({ top: 0 }); return; }
  const modeBtn = e.target.closest('[data-mode]');
  if (modeBtn) { ui.newMode = modeBtn.dataset.mode; touched.clear(); render(); return; }
  const sortTh = e.target.closest('th[data-sort]');
  if (sortTh) { const k = sortTh.dataset.sort; ui.logSort = ui.logSort.key === k ? { key: k, dir: -ui.logSort.dir } : { key: k, dir: 1 }; render(); return; }
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act, t = btn.dataset.id ? state.trades.find(x => x.id === btn.dataset.id) : null;
  switch (act) {
    case 'first-trade': {
      const bal = numVal($('#start-bal')?.value), sd = $('#start-date')?.value;
      if (!(bal >= 0)) { $('#start-bal').classList.add('invalid'); $('#start-bal').focus(); return toast('Enter your starting cash balance first'); }
      S().startBalance = bal; S().startDate = validDate(sd) ? sd : todayISO(); save();
      ui.view = 'new'; render(); break;
    }
    case 'go-new': ui.view = 'new'; render(); break;
    case 'sample': loadSample(); break;
    case 'save-closes': saveCloses(); break;
    case 'resume':
      if (confirm('Confirm you have reviewed your recent trades and rules before resuming new trades?')) { state.pause.reviewed = true; state.pause.reviewedOn = todayISO(); save(); render(); }
      break;
    case 'close': if (t) closeTradeModal(t); break;
    case 'edit': if (t) editModal(t); break;
    case 'del-trade': if (t) deleteTrade(t); break;
    case 'reopen':
      if (t && confirm(`Reopen ${t.ticker}? The exit (${niceDate(t.exit.date)} at ${px(t.exit.price)}) will be removed.`)) { t.status = 'open'; delete t.exit; save(); render(); }
      break;
    case 'save-trade': saveDraft(); break;
    case 'reset-draft': if (confirm('Clear the form?')) { ui.draft = null; touched.clear(); render(); } break;
    case 'csv': csvExport(); break;
    case 'export': exportJSON(); break;
    case 'save-settings': saveSettings(); break;
    case 'default-settings':
      if (confirm('Restore default rule settings? Your starting balance and start date are kept.')) { const { startBalance, startDate } = S(); state.settings = { ...DEFAULT_SETTINGS, startBalance, startDate }; save(); render(); toast('Defaults restored'); }
      break;
    case 'add-flow': {
      const d = $('#fl-date').value, amt = numVal($('#fl-amt').value);
      if (!validDate(d)) return ($('#fl-err').textContent = 'Enter a date');
      if (!(amt > 0)) return ($('#fl-err').textContent = 'Amount must be positive');
      state.flows.push({ id: uid(), date: d, type: $('#fl-type').value, amount: amt, note: $('#fl-note').value.trim() });
      save(); render(); toast('Recorded'); break;
    }
    case 'del-flow': {
      const f = state.flows.find(x => x.id === btn.dataset.id);
      if (f && confirm(`Delete the ${f.type} of ${gbp(f.amount)} on ${niceDate(f.date)}?`)) { state.flows = state.flows.filter(x => x !== f); save(); render(); }
      break;
    }
    case 'del-snap':
      if (confirm(`Delete the snapshot for ${niceDate(btn.dataset.date)}? Closing prices entered that day are kept.`)) { state.snapshots = state.snapshots.filter(s => s.date !== btn.dataset.date); save(); render(); }
      break;
    case 'wipe':
      if (confirm('Delete ALL data (trades, snapshots, deposits, settings)? This cannot be undone. Export a backup first if unsure.') && confirm('Really delete everything?')) { localStorage.removeItem(KEY); state = blankState(); ui.draft = null; ui.view = 'today'; render(); toast('All data deleted'); }
      break;
  }
});

function saveSettings() {
  const s = { ...S() };
  const errs = [];
  for (const el of $$('[data-s]')) {
    const k = el.dataset.s;
    el.classList.remove('invalid');
    if (k === 'targetMode' || k === 'openRiskBasis') { s[k] = el.value; continue; }
    if (k === 'fractional') { s[k] = el.value === 'true'; continue; }
    if (k === 'startDate') { if (el.value && !validDate(el.value)) { errs.push('Start date'); el.classList.add('invalid'); } else s[k] = el.value || null; continue; }
    const v = numVal(el.value);
    if (k === 'startBalance' && el.value === '') { s[k] = null; continue; }
    if (!(v >= 0) || (k !== 'startBalance' && v === 0 && !['maxPerSector'].includes(k))) { errs.push(k); el.classList.add('invalid'); continue; }
    s[k] = ['maxPerSector', 'timeStopDays', 'earningsDays', 'pauseDays'].includes(k) ? Math.round(v) : v;
  }
  if (s.atrMin > s.atrMax) errs.push('ATR range');
  if (s.dd1 >= s.dd2) errs.push('Halve threshold must be smaller than the pause threshold');
  if (errs.length) return toast('Check: ' + errs.join(', '));
  state.settings = s; save(); toast('Settings saved'); render();
}

document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.f && ui.draft) {
    const k = el.dataset.f;
    ui.draft[k] = el.type === 'checkbox' ? el.checked : el.value;
    touched.add(k);
    if (k === 'kind') { render(); return; }
    if (el.type === 'checkbox') el.closest('.check')?.classList.toggle('on', el.checked);
    updateCalc();
  } else if (el.dataset.g != null && ui.draft) {
    ui.draft.grade[+el.dataset.g] = el.checked; el.closest('.check').classList.toggle('on', el.checked); updateCalc();
  } else if (el.dataset.c != null && ui.draft) {
    ui.draft.checks[+el.dataset.c] = el.checked; el.closest('.check').classList.toggle('on', el.checked); updateCalc();
  } else if (el.dataset.lf) {
    ui.logFilter[el.dataset.lf] = el.value;
    const pos = el.selectionStart; render();
    if (el.dataset.lf === 'q') { const n = $('[data-lf="q"]'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} }
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'asof') { if (validDate(el.value)) { ui.asOf = el.value; render(); } }
  if (el.id === 'file-import' && el.files[0]) { importJSON(el.files[0]); el.value = ''; }
  if (el.dataset.f && el.tagName === 'SELECT' && ui.draft) { ui.draft[el.dataset.f] = el.value; if (el.dataset.f === 'kind') render(); else updateCalc(); }
  if (el.dataset.f && ui.draft) { touched.add(el.dataset.f); updateCalc(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); hideTip(); }
  if (e.key === 'Enter' && e.target.classList?.contains('close-in')) {
    e.preventDefault();
    const all = $$('input.close-in'), i = all.indexOf(e.target);
    if (i < all.length - 1) { all[i + 1].focus(); all[i + 1].select(); } else $('[data-act="save-closes"]')?.focus();
  }
});
$('#btn-export').addEventListener('click', exportJSON);

/* formula tooltips: hover on desktop, tap on touch */
const tipEl = $('#tip');
let tipFor = null;
function showTip(el) {
  tipFor = el; tipEl.textContent = el.dataset.tip; tipEl.hidden = false;
  const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  let left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
  let top = r.top - h - 8; if (top < 8) top = r.bottom + 8;
  tipEl.style.left = left + 'px'; tipEl.style.top = top + 'px';
}
function hideTip() { tipEl.hidden = true; tipFor = null; }
document.addEventListener('pointerover', e => { if (e.pointerType === 'touch') return; const el = e.target.closest('[data-tip]'); if (el) showTip(el); });
document.addEventListener('pointerout', e => { if (e.pointerType === 'touch') return; const el = e.target.closest('[data-tip]'); if (el && !el.contains(e.relatedTarget)) hideTip(); });
document.addEventListener('pointerup', e => {
  if (e.pointerType !== 'touch') return;
  const el = e.target.closest('[data-tip]');
  if (el && el !== tipFor) showTip(el); else hideTip();
});
window.addEventListener('scroll', hideTip, { passive: true });
let rzT, lastW = window.innerWidth;
window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (ui.view === 'history' && window.innerWidth !== lastW) { lastW = window.innerWidth; drawCharts(); } }, 150); });

let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }

render();
})();
