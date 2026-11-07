#!/usr/bin/env node
/* tools/google_apps_script/review_inbox.gs 를 구글 없이 시험하려고, 구글 서비스(SpreadsheetApp·MailApp·PropertiesService·ScriptApp·LockService·
 * Utilities·Session·ContentService)를 흉내 낸 가짜로 갈아 끼워 돌리는 도구입니다. 인터넷에 접속하지 않고 아무것도 보내지 않습니다(메일은 가짜 상자에 쌓이기만 함).
 * 가짜가 진짜 구글처럼 까다롭게 구는 곳: setValues 칸 수가 안 맞으면 오류 · 시트 크기 밖에 쓰면 오류 · 같은 이름 시트는 못 만듦 · undefined/NaN 값은 오류 ·
 * clear() 는 서식도 지움 · 없는 서비스(UrlFetchApp 등)를 부르면 ReferenceError · 웹 앱(doPost)·자동 실행 안에서는 getUi() 오류.
 * 사용: node tests/js/review_inbox_harness.js 시나리오.json  → 표준출력에 결과 JSON.
 * 이 파일에는 이스케이프(백슬래시+u) 글자를 쓰지 않습니다(도구 전달 과정에서 풀려 버릴 수 있음). */
'use strict';
const fs = require('fs'), vm = require('vm');
const RealDate = Date;

// ── CSV(RFC 4180) 읽기 ──
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], cell = '', q = false, i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; }
      cell += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ',') { row.push(cell); cell = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
    cell += c; i++;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
// '2026. 10. 14 오전 9:00:00'(한국 시각) → Date. 구글 폼의 ‘타임스탬프’ 칸은 시트에서 날짜 값으로 읽히기 때문에 그 모양도 시험한다.
function koTs(s) {
  const m = /^(\d{4})\. (\d{1,2})\. (\d{1,2}) (오전|오후) (\d{1,2}):(\d{2}):(\d{2})$/.exec(s);
  if (!m) return s;
  let h = (+m[5]) % 12;
  if (m[4] === '오후') h += 12;
  return new RealDate(RealDate.UTC(+m[1], +m[2] - 1, +m[3], h - 9, +m[6], +m[7]));
}

// ── 가짜 구글 ──
function makeWorld(scn) {
  const W = {
    mails: [], alerts: [], logs: [], menus: [], triggers: [], props: Object.assign({}, scn.props || {}), spreadsheets: {}, nextId: 1, order: [],
    lockHeld: false, lockAcquired: 0, lockReleased: 0, me: 'owner@example.org', otherEditors: ['coeditor@example.org'],
    ui: { button: 'OK', text: '' }, context: 'menu', mailThrow: null, active: null, responseNames: [], maxRows: scn.maxRows || 1000, maxCols: scn.maxCols || 26
  };
  const pad = (n) => String(n).padStart(2, '0');

  function cellKey(r, c) { return r + ',' + c; }
  function gridOf(st) {
    let lr = 0, lc = 0;
    st.cells.forEach((v, k) => { const p = k.split(','); lr = Math.max(lr, +p[0]); lc = Math.max(lc, +p[1]); });
    if (!lr) return [['']];
    const g = [];
    for (let r = 1; r <= lr; r++) { const row = []; for (let c = 1; c <= lc; c++) { const v = st.cells.get(cellKey(r, c)); row.push(v === undefined ? '' : v); } g.push(row); }
    return g;
  }
  function mkSheet(ss, name, maxR, maxC) {
    const st = { name: name, maxR: maxR, maxC: maxC, cells: new Map(), fmts: new Map(), frozen: 0, prots: [], risk: [], isResponse: false };
    const api = {
      getName() { return st.name; },
      setName(n) { if (ss.sheets.some((s) => s !== st && s.name === n)) throw new Error('같은 이름의 시트가 이미 있습니다: ' + n); st.name = n; return api; },
      getMaxRows() { return st.maxR; },
      getMaxColumns() { return st.maxC; },
      getLastRow() { let lr = 0; st.cells.forEach((v, k) => { lr = Math.max(lr, +k.split(',')[0]); }); return lr; },
      insertRowsAfter(pos, n) { if (!(n >= 1)) throw new Error('insertRowsAfter: 줄 수가 1 이상이어야 합니다'); st.maxR += n; },
      insertColumnsAfter(pos, n) { if (!(n >= 1)) throw new Error('insertColumnsAfter: 칸 수가 1 이상이어야 합니다'); st.maxC += n; },
      clear() { st.cells.clear(); st.fmts.clear(); return api; },
      setFrozenRows(n) { if (!(n >= 0 && n <= st.maxR)) throw new Error('setFrozenRows 범위 밖'); st.frozen = n; },
      getDataRange() { return { getValues() { return gridOf(st).map((r) => r.slice()); } }; },
      getRange(r, c, nr, nc) {
        nr = nr === undefined ? 1 : nr; nc = nc === undefined ? 1 : nc;
        if (![r, c, nr, nc].every((x) => Number.isInteger(x) && x >= 1)) throw new Error('getRange: 번호는 1 이상의 정수여야 합니다');
        if (r + nr - 1 > st.maxR || c + nc - 1 > st.maxC) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
        const rg = {
          setNumberFormat(f) { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) st.fmts.set(cellKey(r + i, c + j), f); return rg; },
          setValues(v) {
            if (!Array.isArray(v) || v.length !== nr || v.some((row) => !Array.isArray(row) || row.length !== nc)) throw new Error('The number of rows or columns in the data does not match the range (' + nr + 'x' + nc + ').');
            for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
              let x = v[i][j];
              if (x === null) x = '';
              if (x === undefined) throw new Error('setValues: undefined 값 (' + (r + i) + ',' + (c + j) + ')');
              const t = typeof x;
              if (t === 'number' && !Number.isFinite(x)) throw new Error('setValues: 유한하지 않은 숫자 (' + (r + i) + ',' + (c + j) + ')');
              if (!(t === 'string' || t === 'number' || t === 'boolean' || Object.prototype.toString.call(x) === '[object Date]')) throw new Error('setValues: 쓸 수 없는 값 종류 ' + t + ' (' + (r + i) + ',' + (c + j) + ')');
              if (t === 'string' && x.length > 50000) throw new Error('setValues: 한 칸에 5만 자를 넘게 쓸 수 없습니다 (' + (r + i) + ',' + (c + j) + ')');
              if (t === 'string' && x.charAt(0) === '=' && st.fmts.get(cellKey(r + i, c + j)) !== '@') st.risk.push([r + i, c + j]);
              if (x === '') st.cells.delete(cellKey(r + i, c + j)); else st.cells.set(cellKey(r + i, c + j), x);
            }
            return rg;
          }
        };
        return rg;
      },
      getProtections(type) { return st.prots.map((p) => p.api); },
      protect() {
        const p = { desc: '', editors: [W.me].concat(W.otherEditors), domain: true };
        p.api = {
          setDescription(d) { p.desc = d; return p.api; },
          addEditor(u) { const e = typeof u === 'string' ? u : u.getEmail(); if (p.editors.indexOf(e) < 0) p.editors.push(e); return p.api; },
          removeEditors(us) { if (!Array.isArray(us)) throw new Error('removeEditors: 배열이어야 합니다'); const rm = us.map((u) => (typeof u === 'string' ? u : u.getEmail())); if (rm.indexOf(W.me) >= 0) throw new Error('소유자는 뺄 수 없습니다'); p.editors = p.editors.filter((e) => rm.indexOf(e) < 0); return p.api; },
          getEditors() { return p.editors.map((e) => ({ getEmail: () => e })); },
          canDomainEdit() { return true; },
          setDomainEdit(b) { p.domain = !!b; return p.api; }
        };
        st.prots.push(p);
        return p.api;
      }
    };
    st.api = api;
    return st;
  }
  function mkSpreadsheet(name, firstName) {
    const ss = { id: 'SS' + (W.nextId++), name: name, sheets: [] };
    ss.api = {
      getId() { return ss.id; },
      getName() { return ss.name; },
      getFormUrl() { return ss.formUrl || null; },
      getSheets() { return ss.sheets.map((s) => s.api); },
      getSheetByName(n) { const s = ss.sheets.find((x) => x.name === n); return s ? s.api : null; },
      insertSheet(n) { if (ss.sheets.some((x) => x.name === n)) throw new Error('같은 이름의 시트가 이미 있습니다: ' + n); const s = mkSheet(ss, n, W.maxRows, W.maxCols); ss.sheets.push(s); return s.api; }
    };
    if (firstName) ss.sheets.push(mkSheet(ss, firstName, W.maxRows, W.maxCols));
    W.spreadsheets[ss.id] = ss; W.order.push(ss.id);
    return ss;
  }
  W.mkSpreadsheet = mkSpreadsheet;
  W.gridOf = gridOf;

  const SpreadsheetApp = {
    ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
    getActiveSpreadsheet() { return W.active.api; },
    create(name) { return mkSpreadsheet(name, 'Sheet1').api; },
    openById(id) { const s = W.spreadsheets[id]; if (!s) throw new Error('문서를 열 수 없습니다: ' + id); return s.api; },
    getUi() {
      if (W.context === 'trigger' || W.context === 'webapp') throw new Error('Cannot call SpreadsheetApp.getUi() from this context.');
      const ui = {
        Button: { OK: 'OK', CANCEL: 'CANCEL' }, ButtonSet: { OK_CANCEL: 'OK_CANCEL' },
        createMenu(name) { const m = { name: name, items: [] }; const b = { addItem(label, fn) { m.items.push([label, fn]); return b; }, addSeparator() { return b; }, addToUi() { W.menus.push(m); } }; return b; },
        prompt(title, text, buttons) { W.alerts.push('[prompt] ' + title + ' | ' + text); return { getSelectedButton() { return W.ui.button; }, getResponseText() { return W.ui.text; } }; },
        alert(msg) { W.alerts.push(String(msg)); }
      };
      return ui;
    }
  };
  const PropertiesService = {
    getScriptProperties() {
      return {
        getProperty(k) { return Object.prototype.hasOwnProperty.call(W.props, k) ? W.props[k] : null; },
        setProperty(k, v) { W.props[k] = String(v); },
        deleteProperty(k) { delete W.props[k]; }
      };
    }
  };
  const LockService = {
    getScriptLock() {
      return {
        waitLock(ms) { if (W.lockHeld) throw new Error('Lock timeout: another process was holding the lock for too long.'); W.lockHeld = true; W.lockAcquired++; },
        releaseLock() { W.lockHeld = false; W.lockReleased++; }
      };
    }
  };
  const MailApp = {
    sendEmail(m) {
      if (W.mailThrow) throw new Error(W.mailThrow);
      if (!m || typeof m !== 'object') throw new Error('sendEmail: 메시지 객체가 필요합니다');
      W.mails.push({ to: m.to, subject: m.subject, body: m.body, htmlBody: m.htmlBody, name: m.name, keys: Object.keys(m).sort() });
    }
  };
  const ScriptApp = {
    WeekDay: { MONDAY: 'MONDAY', TUESDAY: 'TUESDAY', WEDNESDAY: 'WEDNESDAY', THURSDAY: 'THURSDAY', FRIDAY: 'FRIDAY', SATURDAY: 'SATURDAY', SUNDAY: 'SUNDAY' },
    getProjectTriggers() { return W.triggers.map((t) => t.api); },
    deleteTrigger(t) { W.triggers = W.triggers.filter((x) => x.api !== t); },
    newTrigger(fn) {
      const spec = { fn: fn };
      const fin = { create() { const t = { spec: spec, api: { getHandlerFunction() { return spec.fn; } } }; W.triggers.push(t); return t.api; } };
      return {
        forSpreadsheet(ss) { spec.kind = 'spreadsheet'; spec.ss = ss.getId(); return { onFormSubmit() { spec.event = 'onFormSubmit'; return fin; } }; },
        timeBased() { spec.kind = 'time'; return { onWeekDay(d) { spec.weekday = d; return { atHour(h) { spec.hour = h; return fin; } }; }, everyHours(n) { spec.every = 'hours'; spec.n = n; return fin; } }; }
      };
    }
  };
  const Utilities = {
    formatDate(d, tz, f) {
      if (tz !== 'Asia/Seoul') throw new Error('가짜 구글은 Asia/Seoul 만 지원합니다: ' + tz);
      const u = new RealDate(d.getTime() + 9 * 3600 * 1000);
      return f.replace('yyyy', String(u.getUTCFullYear())).replace('MM', pad(u.getUTCMonth() + 1)).replace('dd', pad(u.getUTCDate())).replace('HH', pad(u.getUTCHours())).replace('mm', pad(u.getUTCMinutes())).replace('ss', pad(u.getUTCSeconds()));
    }
  };
  const Session = { getScriptTimeZone() { return 'Asia/Seoul'; }, getEffectiveUser() { return { getEmail() { return W.me; } }; } };
  const Logger = { log(x) { W.logs.push(String(x)); } };
  const ContentService = {
    MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
    createTextOutput(s) {
      if (typeof s !== 'string') throw new Error('createTextOutput: 글자여야 합니다');
      const o = { content: s, mime: 'TEXT', setMimeType(m) { o.mime = m; return o; }, getContent() { return o.content; }, getMimeType() { return o.mime; } };
      return o;
    }
  };
  const p = scn.today.split('-').map(Number);
  const FIXED = RealDate.UTC(p[0], p[1] - 1, p[2], 3, 0, 0);   // 그날 한국 시각 낮 12시
  class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); } static now() { return FIXED; } }
  W.globals = { SpreadsheetApp, PropertiesService, LockService, MailApp, ScriptApp, Utilities, Session, Logger, ContentService, Date: FakeDate };
  return W;
}

function dump(W) {
  // 단계 사이에 여러 번 부르면 그때그때의 모습이어야 하므로 복사해 돌려준다(원본을 그대로 주면 마지막 모습만 보임).
  const out = { mails: W.mails.slice(), props: Object.assign({}, W.props), alerts: W.alerts.slice(), logs: W.logs.slice(), menus: JSON.parse(JSON.stringify(W.menus)), lock: { acquired: W.lockAcquired, released: W.lockReleased, held: W.lockHeld },
    triggers: W.triggers.map((t) => Object.assign({}, t.spec)), spreadsheets: {} };
  W.order.forEach((id) => {
    const ss = W.spreadsheets[id];
    if (!ss) { return; }
    out.spreadsheets[id] = { id: id, name: ss.name, active: ss === W.active, sheets: ss.sheets.map((st) => {
      const g = W.gridOf(st);
      const cellN = st.cells.size;
      let textN = 0;
      st.cells.forEach((v, k) => { if (st.fmts.get(k) === '@') textN++; });
      return { name: st.name, isResponse: st.isResponse, rows: st.isResponse ? g.slice(0, 1) : g, nrows: g.length, ncols: g[0].length, frozen: st.frozen, maxR: st.maxR, maxC: st.maxC,
        cells: cellN, textCells: textN, risk: st.risk, prots: st.prots.map((p) => ({ description: p.desc, editors: p.editors.slice(), domainEdit: p.domain })) };
    }) };
  });
  return out;
}

function main() {
  const scn = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const W = makeWorld(scn);
  const src = fs.readFileSync(scn.gs, 'utf8');
  const ctx = vm.createContext(Object.assign({}, W.globals));
  vm.runInContext(src, ctx, { filename: 'review_inbox.gs' });
  // 응답 시트
  W.active = W.mkSpreadsheet(scn.sheetName || '응답 시트 파일', null);
  if (scn.form) W.active.formUrl = 'https://docs.google.com/forms/d/FAKE/viewform';
  (scn.sheets || []).forEach((sh) => {
    const ssh = W.active.api.insertSheet(sh.name);
    let rows = sh.rows;
    if (sh.csv) rows = parseCsv(fs.readFileSync(sh.csv, 'utf8'));
    if (sh.typed) rows = rows.map((r, i) => (i === 0 ? r : r.map((c, j) => (j === 0 ? koTs(c) : (/면허/.test(rows[0][j] || '') ? (c === 'Y') : c)))));
    const st = W.active.sheets.find((x) => x.name === sh.name);
    st.isResponse = true;
    const nc = Math.max(...rows.map((r) => r.length));
    if (st.maxC < nc) st.maxC = nc;
    if (st.maxR < rows.length) st.maxR = rows.length;
    ssh.getRange(1, 1, rows.length, nc).setValues(rows.map((r) => r.concat(Array(nc - r.length).fill(''))));
  });
  const results = [];
  (scn.steps || []).forEach((step) => {
    let r;
    try { r = runStep(step); } catch (e) { r = { error: String(e && e.message ? e.message : e), name: e && e.name }; }
    results.push(r);
  });
  function runStep(step) {
    switch (step.do) {
      case 'pure': {
        const rd = ctx.readResponses_(W.active.api);
        const res = ctx.RI.analyze(rd.recs, ctx.MANIFEST, scn.today, { gates: step.gates !== false, demo: !!step.demo });
        return { cols: rd.cols, sheetName: rd.sheetName, nrecs: rd.recs.length, recs: rd.recs.map((x) => ({ ts: x.ts, consent: x.consent, license: x.license, row: x.row, len: (x.text || '').length })),
          summary: res.summary, records: res.records, ratings: res.ops.ratings, link: res.ops.link, memos: res.ops.memos, secrets: res.ops.secrets,
          emailText: ctx.RI.emailText(res.summary), emailHtml: ctx.RI.emailHtml(res.summary), emailSubject: ctx.RI.emailSubject(res.summary) };
      }
      case 'analyze': {
        const res = ctx.RI.analyze(step.recs, ctx.MANIFEST, scn.today, { gates: step.gates !== false, demo: !!step.demo });
        return { summary: res.summary, records: res.records, ratings: res.ops.ratings, link: res.ops.link, memos: res.ops.memos, secrets: res.ops.secrets, emailText: ctx.RI.emailText(res.summary), emailSubject: ctx.RI.emailSubject(res.summary) };
      }
      case 'call': {
        const f = ctx[step.fn];
        if (typeof f !== 'function') throw new Error('그런 함수가 없습니다: ' + step.fn);
        W.context = step.context || 'menu';
        let v;
        try { v = f.apply(null, step.args || []); } finally { W.context = 'menu'; }
        if (v && typeof v === 'object' && v.summary) return step.full ? v : { mailSent: v.mailSent, mailNote: v.mailNote, intake: v.summary.intake, records: v.records.length };
        return v === undefined ? null : v;
      }
      case 'eval': { return vm.runInContext(step.code, ctx); }
      case 'setup': { W.ui.button = step.button || 'OK'; W.ui.text = step.text === undefined ? '' : step.text; ctx.setup(); return null; }
      case 'menu': { W.ui.button = step.button || 'OK'; W.ui.text = step.text === undefined ? '' : step.text; W.context = 'menu'; const f = ctx[step.fn]; if (typeof f !== 'function') throw new Error('그런 함수가 없습니다: ' + step.fn); f(); return null; }
      case 'setProp': { W.props[step.key] = String(step.value); return null; }
      case 'delProp': { delete W.props[step.key]; return null; }
      case 'mailThrow': { W.mailThrow = step.message || null; return null; }
      case 'deleteSpreadsheet': { const id = W.props.ANALYSIS_SSID; delete W.spreadsheets[id]; return id; }
      case 'addRow': {
        const st = W.active.sheets.find((x) => x.name === step.sheet);
        const g = W.gridOf(st), nc = Math.max(g[0].length, step.cells.length);
        if (st.maxR < g.length + 1) st.maxR = g.length + 1;
        if (st.maxC < nc) st.maxC = nc;
        st.api.getRange(g.length + 1, 1, 1, step.cells.length).setValues([step.cells]);
        return g.length + 1;
      }
      case 'doPost':
      case 'doGet': {
        W.context = 'webapp';
        let out;
        try { out = step.do === 'doPost' ? ctx.doPost(step.noEvent ? undefined : (step.noPostData ? {} : { postData: { contents: step.body, type: 'text/plain' } })) : ctx.doGet({}); } finally { W.context = 'menu'; }
        let parsed = null;
        try { parsed = JSON.parse(out.getContent()); } catch (e) { /* 글자가 JSON 이 아니면 null */ }
        return { content: out.getContent(), mime: out.getMimeType(), parsed: parsed };
      }
      case 'holdLock': { W.lockHeld = true; return null; }
      case 'releaseLock': { W.lockHeld = false; return null; }
      case 'dump': return dump(W);
      default: throw new Error('모르는 단계: ' + step.do);
    }
  }
  process.stdout.write(JSON.stringify({ steps: results, final: dump(W), globalsDefined: ['onOpen', 'setup', 'onFormSubmitCheck', 'weeklySummary', 'hourlyCheck', 'refreshNow', 'sendSummaryNow', 'openIntake', 'closeIntake', 'intakeStatus', 'doPost', 'doGet'].map((f) => [f, typeof ctx[f]]) }));
}
main();
