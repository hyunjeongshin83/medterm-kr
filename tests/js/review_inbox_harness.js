#!/usr/bin/env node
/* tools/google_apps_script/review_inbox.gs 를 구글 없이 시험하려고, 구글 서비스(SpreadsheetApp·MailApp·PropertiesService·ScriptApp·LockService·
 * CacheService·HtmlService·Utilities·Session·ContentService)를 흉내 낸 가짜로 갈아 끼워 돌리는 도구입니다. 인터넷에 접속하지 않고 아무것도 보내지 않습니다(메일은 가짜 상자에 쌓이기만 함).
 * 가짜가 진짜 구글처럼 까다롭게 구는 곳: setValues 칸 수가 안 맞으면 오류 · 시트 크기 밖에 쓰면 오류 · 같은 이름 시트는 못 만듦 · undefined/NaN 값은 오류 ·
 * clear() 는 서식도 지움 · 없는 서비스(UrlFetchApp 등)를 부르면 ReferenceError · 웹 앱(doPost)·자동 실행 안에서는 getUi() 오류 ·
 * 캐시는 키 250자·값 100KB·유효 1~21600초(정수)를 넘으면 오류이고 시간이 지나면 사라짐(cacheClear 단계로 일찍 사라지는 경우도 흉내) ·
 * computeDigest 는 구글처럼 부호 있는 바이트 배열을 돌려줌 · google.script.run 흉내(rpc 단계)는 HtmlOutput·TextOutput 을 돌려받지 못함 · 시계는 tick 단계로만 감.
 * 사용: node tests/js/review_inbox_harness.js 시나리오.json  → 표준출력에 결과 JSON.
 *       node tests/js/review_inbox_harness.js --serve 시나리오.json [포트]  → 화면 시험용 작은 서버(연구자 페이지를 열고 google.script.run 호출을 받아 줌; 로컬 127.0.0.1 만).
 * 이 파일에는 이스케이프(백슬래시+u) 글자를 쓰지 않습니다(도구 전달 과정에서 풀려 버릴 수 있음). */
'use strict';
const fs = require('fs'), vm = require('vm'), nodeCrypto = require('crypto');
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
    ui: { button: 'OK', text: '' }, context: 'menu', mailThrow: null, active: null, responseNames: [], maxRows: scn.maxRows || 1000, maxCols: scn.maxCols || 26,
    cache: new Map(), serviceUrl: scn.serviceUrl || null, mailQuota: scn.mailQuota || 100, nextTrigger: 7000000001, now: 0
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
        createMenu(name) { const m = { name: name, items: [], subs: [] }; const b = { m: m, addItem(label, fn) { m.items.push([label, fn]); return b; }, addSeparator() { return b; }, addSubMenu(sb) { m.subs.push(sb.m); return b; }, addToUi() { W.menus.push(m); } }; return b; },
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
      if (W.mails.length >= W.mailQuota) throw new Error('Service invoked too many times for one day: email.');
      W.mails.push({ to: m.to, subject: m.subject, body: m.body, htmlBody: m.htmlBody, name: m.name, keys: Object.keys(m).sort() });
    },
    getRemainingDailyQuota() { return Math.max(0, W.mailQuota - W.mails.length); }
  };
  function mkTrigger(spec) {
    const t = { spec: spec, uid: String(W.nextTrigger++) };
    t.api = { getHandlerFunction() { return spec.fn; }, getUniqueId() { return t.uid; } };
    W.triggers.push(t);
    return t;
  }
  const ScriptApp = {
    WeekDay: { MONDAY: 'MONDAY', TUESDAY: 'TUESDAY', WEDNESDAY: 'WEDNESDAY', THURSDAY: 'THURSDAY', FRIDAY: 'FRIDAY', SATURDAY: 'SATURDAY', SUNDAY: 'SUNDAY' },
    getProjectTriggers() { return W.triggers.map((t) => t.api); },
    deleteTrigger(t) { W.triggers = W.triggers.filter((x) => x.api !== t); },
    getService() { return { getUrl() { return W.serviceUrl; } }; },
    newTrigger(fn) {
      const spec = { fn: fn };
      const fin = { create() { return mkTrigger(spec).api; } };
      return {
        forSpreadsheet(ss) { spec.kind = 'spreadsheet'; spec.ss = ss.getId(); return { onFormSubmit() { spec.event = 'onFormSubmit'; return fin; } }; },
        timeBased() { spec.kind = 'time'; return { onWeekDay(d) { spec.weekday = d; return { atHour(h) { spec.hour = h; return fin; } }; }, everyHours(n) { spec.every = 'hours'; spec.n = n; return fin; } }; }
      };
    }
  };
  let seed = (scn.seed === undefined ? 20261107 : scn.seed) >>> 0;
  function rand() {   // 같은 시나리오는 같은 번호가 나오도록 씨앗이 있는 난수
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function hexn(n) { let o = ''; for (let i = 0; i < n; i++) o += Math.floor(rand() * 16).toString(16); return o; }
  const Utilities = {
    DigestAlgorithm: { MD5: 'MD5', SHA_1: 'SHA_1', SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8', US_ASCII: 'US_ASCII' },
    getUuid() { return hexn(8) + '-' + hexn(4) + '-4' + hexn(3) + '-' + '89ab'[Math.floor(rand() * 4)] + hexn(3) + '-' + hexn(12); },
    computeDigest(alg, value, cs) {
      if (alg !== 'SHA_256') throw new Error('가짜 구글은 SHA_256 만 지원합니다: ' + alg);
      if (typeof value !== 'string') throw new Error('computeDigest: 글자여야 합니다');
      if (cs !== 'UTF_8') throw new Error('가짜 구글은 UTF_8 글자 집합만 지원합니다: ' + cs);
      return Array.from(nodeCrypto.createHash('sha256').update(value, 'utf8').digest(), (x) => (x > 127 ? x - 256 : x));   // 구글은 부호 있는 바이트(-128~127)를 돌려준다
    },
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
  const CacheService = {
    getScriptCache() {
      const live = (k) => { const e = W.cache.get(k); if (!e) return null; if (e.exp <= W.now) { W.cache.delete(k); return null; } return e; };
      const okKey = (k) => { if (typeof k !== 'string' || !k.length || k.length > 250) throw new Error('Argument too large: key'); };
      return {
        get(k) { okKey(k); const e = live(k); return e ? e.v : null; },
        put(k, v, ttl) {
          okKey(k);
          if (typeof v !== 'string') throw new Error('put: 값은 글자여야 합니다');
          if (Buffer.byteLength(v, 'utf8') > 100 * 1024) throw new Error('Argument too large: value');
          if (ttl !== undefined && !(Number.isInteger(ttl) && ttl >= 1 && ttl <= 21600)) throw new Error('put: 유효 시간은 1~21600 사이 정수(초)여야 합니다: ' + ttl);
          W.cache.set(k, { v: v, exp: W.now + (ttl === undefined ? 600 : ttl) * 1000 });
        },
        remove(k) { okKey(k); W.cache.delete(k); }
      };
    }
  };
  W.liveCache = () => { const o = []; W.cache.forEach((e, k) => { if (e.exp > W.now) o.push([k, e.v]); }); return o; };
  const HtmlService = {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' },
    createHtmlOutput(html) {
      if (typeof html !== 'string') throw new Error('createHtmlOutput: 글자여야 합니다');
      const o = { html: html, title: '', metas: [], xframe: 'DEFAULT',
        setTitle(t) { o.title = String(t); return o; }, addMetaTag(n, c) { o.metas.push([String(n), String(c)]); return o; },
        setXFrameOptionsMode(m) { o.xframe = m; return o; }, getContent() { return o.html; }, getTitle() { return o.title; } };
      return o;
    }
  };
  const p = scn.today.split('-').map(Number);
  const FIXED = RealDate.UTC(p[0], p[1] - 1, p[2], 3, 0, 0);   // 그날 한국 시각 낮 12시
  W.now = FIXED;
  class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(W.now); else super(...a); } static now() { return W.now; } }
  W.mkTrigger = mkTrigger;
  W.globals = { SpreadsheetApp, PropertiesService, LockService, MailApp, ScriptApp, Utilities, Session, Logger, ContentService, CacheService, HtmlService, Date: FakeDate };
  return W;
}

function dump(W) {
  // 단계 사이에 여러 번 부르면 그때그때의 모습이어야 하므로 복사해 돌려준다(원본을 그대로 주면 마지막 모습만 보임).
  const out = { mails: W.mails.slice(), props: Object.assign({}, W.props), alerts: W.alerts.slice(), logs: W.logs.slice(), menus: JSON.parse(JSON.stringify(W.menus)), lock: { acquired: W.lockAcquired, released: W.lockReleased, held: W.lockHeld },
    triggers: W.triggers.map((t) => Object.assign({}, t.spec)), cache: W.liveCache(), now: new RealDate(W.now).toISOString(), spreadsheets: {} };
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

const TRIGGER_FNS = ['onFormSubmitCheck', 'weeklySummary', 'hourlyCheck'];
const TICK_MS = { ms: 1, seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 };

// 시나리오 → 가짜 세상 + 스크립트 올림 + 응답 시트 채움
function boot(scn) {
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
  return { scn, W, ctx, tokens: [] };
}

// 스크립트가 올린 ‘밖에서 부를 수 있는’ 함수 이름(이름 끝에 밑줄이 없는 함수 = google.script.run 으로 누구나 부를 수 있음)
function exposedNames(B) {
  return Object.keys(B.ctx).filter((k) => !(k in B.W.globals) && typeof B.ctx[k] === 'function' && !k.endsWith('_')).sort();
}

// 단계 안의 글에 {{code}}(가장 최근 인증 메일의 6자리 번호) · {{code#N}}(N번째 인증 메일) · {{token}}(가장 최근 로그인 토큰) · {{token#N}} 을 쓰면 앞 단계의 결과로 바꿔 준다.
// 사람이 메일에서 번호를 보고 화면에 적는 일, 로그인 뒤 받은 토큰으로 이어서 부르는 일을 한 시나리오 안에서 시험하려는 것이다.
function subst(B, v) {
  if (typeof v === 'string') {
    return v.replace(/\{\{(code|token)(?:#(\d+))?\}\}/g, (m, kind, idx) => {
      let list;
      if (kind === 'token') list = B.tokens;
      else list = B.W.mails.filter((x) => String(x.subject || '').indexOf('인증 번호') >= 0).map((x) => { const f = /(?:^|[^0-9])([0-9]{6})(?![0-9])/.exec(x.body || ''); return f ? f[1] : null; }).filter((x) => x);
      const val = idx === undefined ? list[list.length - 1] : list[+idx];
      if (val === undefined) throw new Error('{{' + kind + (idx === undefined ? '' : '#' + idx) + '}} 로 바꿀 값이 아직 없습니다');
      return val;
    });
  }
  if (Array.isArray(v)) return v.map((x) => subst(B, x));
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach((k) => { o[k] = subst(B, v[k]); }); return o; }
  return v;
}

function runStep(B, step) {
  const { scn, W, ctx } = B;
  step = subst(B, step);
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
      // 구글이 자동 실행을 돌릴 때는 그 자동 실행의 번호(triggerUid)가 든 이벤트를 넘긴다. 인수를 안 적은 시험은 그 이벤트를 대신 만들어 준다(설치된 자동 실행이 없으면 부르는 동안만 있는 임시 자동 실행).
      let args = step.args, tmp = null;
      if (!args && W.context === 'trigger' && TRIGGER_FNS.indexOf(step.fn) >= 0) {
        let t = W.triggers.find((x) => x.spec.fn === step.fn);
        if (!t) { t = W.mkTrigger({ fn: step.fn, kind: 'temporary' }); tmp = t; }
        args = [{ triggerUid: t.uid, authMode: 'FULL' }];
      }
      let v;
      try { v = f.apply(null, args || []); } finally { W.context = 'menu'; if (tmp) W.triggers = W.triggers.filter((x) => x !== tmp); }
      if (v && typeof v === 'object' && v.summary) return step.full ? v : { mailSent: v.mailSent, mailNote: v.mailNote, mailCount: v.mailCount, intake: v.summary.intake, records: v.records.length };
      return v === undefined ? null : v;
    }
    case 'fire': {   // 설치된 자동 실행을 구글이 돌리는 것처럼(그 자동 실행의 번호를 이벤트에 담아)
      const t = W.triggers.find((x) => x.spec.fn === step.fn);
      if (!t) throw new Error('설치된 자동 실행이 없습니다: ' + step.fn);
      W.context = 'trigger';
      try { ctx[step.fn]({ triggerUid: t.uid, authMode: 'FULL' }); } finally { W.context = 'menu'; }
      return null;
    }
    case 'rpc': {    // 웹 앱 화면의 google.script.run.함수(인수) 흉내: 인수는 JSON 으로 오가고, 돌려받는 값도 JSON 이어야 함
      const f = ctx[step.fn];
      if (typeof f !== 'function' || String(step.fn).endsWith('_') || step.fn in W.globals) throw new Error('google.script.run 이 부를 수 없는 이름입니다: ' + step.fn);
      W.context = 'webapp';
      let v;
      try { v = f.apply(null, JSON.parse(JSON.stringify(step.args || []))); } finally { W.context = 'menu'; }
      if (v && typeof v === 'object' && typeof v.getContent === 'function') throw new Error('Failed due to illegal value in property: 0 (HtmlOutput/TextOutput 은 google.script.run 으로 돌려받을 수 없음)');
      let parsed = null;
      if (typeof v === 'string') { try { parsed = JSON.parse(v); } catch (e) { /* JSON 이 아니면 null */ } }
      if (parsed && typeof parsed.token === 'string') B.tokens.push(parsed.token);
      return { value: v === undefined ? null : JSON.parse(JSON.stringify(v === undefined ? null : v)), parsed: parsed };
    }
    case 'eval': { return vm.runInContext(step.code, ctx); }
    case 'setup': { W.ui.button = step.button || 'OK'; W.ui.text = step.text === undefined ? '' : step.text; ctx.setup(); return null; }
    case 'menu': { W.ui.button = step.button || 'OK'; W.ui.text = step.text === undefined ? '' : step.text; W.context = 'menu'; const f = ctx[step.fn]; if (typeof f !== 'function') throw new Error('그런 함수가 없습니다: ' + step.fn); f(); return null; }
    case 'setProp': { W.props[step.key] = String(step.value); return null; }
    case 'delProp': { delete W.props[step.key]; return null; }
    case 'mailThrow': { W.mailThrow = step.message || null; return null; }
    case 'mailQuota': { W.mailQuota = step.n; return null; }
    case 'tick': { let ms = 0; Object.keys(TICK_MS).forEach((u) => { if (step[u] !== undefined) ms += step[u] * TICK_MS[u]; }); if (!(ms > 0)) throw new Error('tick: 시간이 필요합니다'); W.now += ms; return new RealDate(W.now).toISOString(); }
    case 'cacheClear': { W.cache.clear(); return null; }
    case 'setServiceUrl': { W.serviceUrl = step.url === undefined ? null : step.url; return null; }
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
      try {
        out = step.do === 'doPost'
          ? ctx.doPost(step.noEvent ? undefined : (step.noPostData ? {} : { postData: { contents: step.body, type: 'text/plain' } }))
          : ctx.doGet(step.noEvent ? undefined : { parameter: step.params || {}, parameters: Object.fromEntries(Object.entries(step.params || {}).map(([k, v]) => [k, [v]])) });
      } finally { W.context = 'menu'; }
      if (out && typeof out.html === 'string') return { html: out.html, title: out.title, metas: out.metas, xframe: out.xframe, mime: 'HTML' };
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

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--serve') return serve(args[1], +(args[2] || 0));
  const scn = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  const B = boot(scn);
  const results = [];
  (scn.steps || []).forEach((step) => {
    let r;
    try { r = runStep(B, step); } catch (e) { r = { error: String(e && e.message ? e.message : e), name: e && e.name }; }
    results.push(r);
  });
  process.stdout.write(JSON.stringify({ steps: results, final: dump(B.W), exposed: exposedNames(B),
    globalsDefined: ['onOpen', 'setup', 'onFormSubmitCheck', 'weeklySummary', 'hourlyCheck', 'refreshNow', 'sendSummaryNow', 'openIntake', 'closeIntake', 'intakeStatus', 'doPost', 'doGet',
      'addResearcher', 'removeResearcher', 'removeRecipient', 'researcherStatus', 'researcherApi'].map((f) => [f, typeof B.ctx[f]]) }));
}

// 화면 시험용 서버: 연구자 페이지(GET /)를 내주고, 페이지의 google.script.run 흉내(POST /__rpc)를 가짜 구글에 연결한다. 127.0.0.1 에서만 듣는다.
function serve(file, port) {
  const http = require('http');
  const scn = JSON.parse(fs.readFileSync(file, 'utf8'));
  const B = boot(scn);
  const { W, ctx } = B;
  const send = (res, code, type, body) => { res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(body); };
  const readBody = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e6) req.destroy(); }); req.on('end', () => ok(b)); });
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && u.pathname === '/') {
        W.context = 'webapp';
        let out;
        try { out = ctx.doGet({ parameter: Object.fromEntries(u.searchParams.entries()) }); } finally { W.context = 'menu'; }
        return typeof out.html === 'string' ? send(res, 200, 'text/html', out.html) : send(res, 200, 'application/json', out.getContent());
      }
      if (req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}');
        if (u.pathname === '/__rpc') {
          try { return send(res, 200, 'application/json', JSON.stringify({ ok: true, r: runStep(B, { do: 'rpc', fn: body.fn, args: body.args }).value })); }
          catch (e) { return send(res, 200, 'application/json', JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) })); }
        }
        if (u.pathname === '/__step') { return send(res, 200, 'application/json', JSON.stringify({ ok: true, r: runStep(B, body) })); }
      }
      send(res, 404, 'text/plain', 'not found');
    } catch (e) { send(res, 500, 'text/plain', String(e && e.message ? e.message : e)); }
  });
  server.listen(port, '127.0.0.1', () => { process.stdout.write(JSON.stringify({ listening: server.address().port }) + '\n'); });
}
main();
