// 약사 검수 참여(검수 2·3단계) — 화면 쪽 자료 읽기 · 이 기기에 판정 보관 · 확인서 내보내기·불러오기.
// 검수 항목과 현황은 빌드가 담은 window.MEDTERM_REVIEW(build/review_lib.py 가 계산)에서 읽는다. 이 파일은 현황을 계산하지 않는다:
// 약사가 이 화면에서 만든 확인서는 운영자가 약사 면허를 따로 확인해 병합 도구(tools/merge_pharmacist_reviews.py)로 합친 뒤 다음 빌드에서 현황에 나타난다.
// 곧, 앱 안에서 스스로 ‘검수 완료’를 만들 길이 없다.
// 네트워크 요청: 기본은 없다(약사가 확인서 파일을 직접 전달한다). 동의서와 접수 주소가 담긴 독립 실행·설치형 웹앱 빌드에서만, 약사가 ‘MedIT로 보내기’를 누를 때 한 번 운영자의 구글 시트로 보낸다(sendToIntake).
// 동의서 값·판·접수 주소는 빌드가 담는다(reviewIntake.js). 동의서가 준비되지 않은 판에서는 확인서를 내보내지도 보내지도 못한다(동의 없이 개인정보를 받지 않는다).
import { layers } from './mt.js';
import { getIntake } from './reviewIntake.js';
import { APP_VERSION } from './version.js';

export const SCHEMA = 'medterm-kr-review/1'; //                         내보내는 파일 형식(build/review_lib.py 의 SCHEMA 와 같아야 함 — tests/review_ui.cjs 가 확인)
export const STORE_KEY = 'medterm-kr-review-v1';
export const MAX = { name: 40, org: 80, note: 200, other: 80, file: 1000000 }; // 파이썬 쪽 한도(40·80·300·80·1,000,000)보다 같거나 작게
export const VERDICTS = [['ok', '맞다'], ['diff', '다르다'], ['unsure', '모르겠다']];
export const REFS = [['health.kr', '약학정보원(health.kr)'], ['mfds', '식약처 의약품안전나라'], ['book', '약학정보 책'], ['law', '법제처 약사법 본문'], ['other', '기타']];
const VSET = new Set(VERDICTS.map(([v]) => v));
const RSET = new Set(REFS.map(([k]) => k));
const ID_OK = /^[A-Z]-[A-Za-z0-9_-]{1,50}$/; //                       항목 id(N-161 · B-161-d2cc30 · L-2_1). 이 모양이 아닌 열쇠는 받지 않는다(__proto__ 같은 이름 방지).

/* ── 글자 정리: 파이썬 쪽 검사(제어 문자·보이지 않는 글자 거부)와 같은 글자를 공백으로 바꾸고, 글자 수는 코드 포인트로 센다 ── */
// eslint-disable-next-line no-control-regex
const BAD = /[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
export const clean = (s, max) => Array.from(String(s == null ? '' : s).normalize('NFC').replace(BAD, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('');
const cut = (s, max) => Array.from(String(s == null ? '' : s)).slice(0, max).join(''); // 입력하는 중에는 공백을 건드리지 않고 길이만 자른다

/* ── 빌드가 담은 검수 항목·현황. 자료를 읽는 곳은 여기 하나이며 처음 쓰는 순간 한 번 읽는다(빌드가 읽지 않는 덩어리로 담고 window 전역은 게터다). ── */
let cache;
/** 담긴 자료의 모양을 확인한다. 하나라도 어긋나면 ‘검수 자료 없음’으로 보고(참여 화면을 그리지 않고 검수 상태는 예전 모양) 앱이 멈추지 않게 한다. */
function wellFormed(r) {
  if (!r || r.schema !== 1 || !r.scopes || typeof r.scopes !== 'object' || !r.items || typeof r.items !== 'object' || !r.status || typeof r.status !== 'object') return false;
  const ids = Object.keys(r.scopes);
  if (!ids.length) return false;
  return ids.every((id) => {
    const s = r.scopes[id]; const list = r.items[id];
    return /^[a-z]{1,12}$/.test(id) && s && typeof s === 'object' && typeof s.label === 'string' && Number.isFinite(s.n) && typeof s.hash === 'string'
      && Array.isArray(list) && list.every((it) => it && typeof it === 'object' && typeof it.id === 'string' && typeof it.h === 'string')
      && (!r.status[id] || (typeof r.status[id] === 'object' && (r.status[id].reviewers === undefined || (Array.isArray(r.status[id].reviewers) && r.status[id].reviewers.every((p) => p && typeof p === 'object')))));
  });
}
export function getReview() {
  if (cache === undefined) {
    try { const r = window.MEDTERM_REVIEW; cache = wellFormed(r) ? r : null; } catch (e) { cache = null; }
  }
  return cache;
}

/** 이 화면에서 약사가 검수할 수 있는 범위. 성분 한글명·상품명은 항상, 약사법 쉬운 풀이는 약무·제도 층이 이 화면에 있을 때만(없는 층의 항목을 판정하게 하지 않는다). */
export function availableScopes() {
  const R = getReview();
  if (!R) return [];
  return Object.keys(R.scopes).filter((s) => (s === 'law' ? !!(layers && layers.hasLaw) : true));
}

/* ── 이 기기(브라우저)에 보관: 입력한 판정이 사라지지 않게 한다. 저장소를 못 쓰면(개인정보 보호 모드·WebView 설정) 열려 있는 동안만 쓰는 대체 보관으로 돌아선다. ── */
// att(확인서 동의) · c1(개인정보 수집·이용 동의) · c2(연구 이용 동의)는 보관하지 않는다: 내보내거나 보낼 때마다 새로 표시한다.
const blank = () => ({ v: 1, rev: { name: '', org: '', pub: false, lic: false }, refs: [], other: '', att: false, c1: false, c2: false, scope: '', ans: {} });
const noteKept = (v, m) => (v === 'ok' || !m ? {} : { m: cut(m, MAX.note) });

function sane(o) {
  const b = blank();
  if (!o || typeof o !== 'object') return b;
  const r = o.rev && typeof o.rev === 'object' ? o.rev : {};
  b.rev = { name: cut(r.name, MAX.name), org: cut(r.org, MAX.org), pub: r.pub === true, lic: r.lic === true };
  b.refs = Array.isArray(o.refs) ? o.refs.filter((k) => RSET.has(k)) : [];
  b.other = cut(o.other, MAX.other);
  b.scope = typeof o.scope === 'string' && /^[a-z]{1,12}$/.test(o.scope) ? o.scope : '';
  if (o.ans && typeof o.ans === 'object') {
    for (const [sid, m] of Object.entries(o.ans)) {
      if (!/^[a-z]{1,12}$/.test(sid) || !m || typeof m !== 'object') continue;
      const out = {};
      for (const [id, a] of Object.entries(m)) {
        if (ID_OK.test(id) && a && typeof a === 'object' && VSET.has(a.v) && typeof a.h === 'string' && a.h.length >= 1 && a.h.length <= 20) out[id] = { v: a.v, h: a.h, ...noteKept(a.v, a.m) };
      }
      b.ans[sid] = out;
    }
  }
  return b; // att·c1·c2(동의 표시)는 보관하지 않는다: 내보낼 때마다 새로 표시한다.
}
let mem = null;
export function loadStore() {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw && raw.length < 2000000) { const o = JSON.parse(raw); if (o && o.v === 1) return sane(o); }
  } catch (e) { /* 저장소를 못 쓰거나 내용이 깨졌으면 아래 */ }
  return mem ? sane(mem) : blank();
}
/** 저장했으면 true. 저장소를 못 쓰면 false(이 창이 열려 있는 동안만 남는다). */
export function saveStore(s) {
  mem = s;
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify({ ...s, att: false, c1: false, c2: false })); return true; } catch (e) { return false; }
}
export function clearStore() {
  mem = null;
  try { window.localStorage.removeItem(STORE_KEY); } catch (e) { /* 무시 */ }
  return blank();
}

/* ── 판정 세기: 지금 화면 자료의 항목과 내용이 같은(내용 표시 h 가 같은) 판정만 센다. 사전 내용이 바뀐 항목의 지난 판정은 ‘다시 확인 필요’다. ── */
export function liveAnswers(R, scope, ans) {
  const live = {};
  let stale = 0;
  for (const it of R.items[scope] || []) {
    const a = ans && Object.prototype.hasOwnProperty.call(ans, it.id) ? ans[it.id] : null;
    if (!a) continue;
    if (a.h === it.h && VSET.has(a.v)) live[it.id] = a; else stale++;
  }
  return { live, stale };
}
export function tally(items, live) {
  const t = { n: items.length, done: 0, ok: 0, diff: 0, unsure: 0 };
  for (const it of items) { const a = live[it.id]; if (a) { t.done++; t[a.v]++; } }
  return t;
}
/** 목록에서 afterId 다음의 아직 판정하지 않은 항목(끝까지 없으면 처음부터). 모두 판정했으면 null. */
export function nextTodo(items, live, afterId) {
  const i0 = Math.max(0, items.findIndex((it) => it.id === afterId) + 1);
  for (let k = 0; k < items.length; k++) { const it = items[(i0 + k) % items.length]; if (!live[it.id]) return it; }
  return null;
}

/* ── 확인서 내보내기 ── */
export const todayStr = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

/** 내보내기 전에 빠진 것(비어 있으면 내보낼 수 있다). */
export function exportProblems(R, scope, st) {
  const p = [];
  const I = getIntake();
  if (!I.ready) p.push('이 앱 판은 동의서가 아직 준비되지 않아 확인서를 내보내거나 보낼 수 없습니다. 이 앱을 알려 드린 MedIT 담당자에게 문의해 주세요(판정은 이 기기에 저장되어 있습니다).');
  if (!clean(st.rev.name, MAX.name)) p.push('검수자 이름을 적어 주세요.');
  if (!st.rev.lic) p.push('‘약사 면허를 가지고 있습니다’에 표시해 주세요.');
  if (!Object.keys(liveAnswers(R, scope, st.ans[scope]).live).length) p.push('판정한 항목이 아직 없습니다.');
  if (st.refs.includes('other') && !clean(st.other, MAX.other)) p.push('‘기타’를 고르셨다면 참고한 자료의 이름을 적어 주세요.');
  if (I.ready && !st.c1) p.push('‘개인정보 수집·이용 동의(필수)’에 동의해 주세요.');
  return p;
}

/** 확인서(제출 파일) 객체. 항목마다 { v: 판정, h: 내용 표시, m?: 메모(다르다·모르겠다일 때) }. 면허번호·연락처는 담지 않는다. */
export function buildExport(R, scope, st) {
  const { live } = liveAnswers(R, scope, st.ans[scope]);
  const answers = {};
  for (const it of R.items[scope]) {
    const a = live[it.id];
    if (!a) continue;
    const o = { v: a.v, h: it.h };
    const m = a.v === 'ok' ? '' : clean(a.m, MAX.note);
    if (m) o.m = m;
    answers[it.id] = o;
  }
  const refs = REFS.map(([k]) => k).filter((k) => st.refs.includes(k));
  const I = getIntake();
  return {
    schema: SCHEMA,
    scope,
    scope_hash: R.scopes[scope].hash,
    app: APP_VERSION,
    created: todayStr(),
    reviewer: { name: clean(st.rev.name, MAX.name), affiliation: clean(st.rev.org, MAX.org), public: !!st.rev.pub, license_claimed: !!st.rev.lic },
    refs,
    refs_other: refs.includes('other') ? clean(st.other, MAX.other) : '',
    attested: !!st.att,
    // 동의 기록: 동의서가 준비된 판에서만 담는다(준비 안 된 판은 내보내지 못한다). version = 약사가 읽은 동의서의 판, research = 연구 이용(선택) 동의 여부 — 연구 이용을 묻지 않는 판은 false.
    ...(I.ready ? { consent: { version: I.version, collect: !!st.c1, research: !!(I.research && st.c2), date: todayStr() } } : {}),
    answers,
  };
}
export const exportText = (obj) => JSON.stringify(obj, null, 1) + '\n';
export const exportFileName = (scope) => `medterm-kr-review-${scope}-${todayStr()}.json`;

/** 파일로 저장(브라우저가 내려받기를 막으면 조용히 안 될 수 있어, 화면은 ‘복사하기’와 글 상자도 함께 둔다). 시도했으면 true. */
export function saveAsFile(name, text) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) { /* 무시 */ } }, 4000);
    return true;
  } catch (e) { return false; }
}
/** 클립보드에 복사. 권한이 없으면(file:// 주소·WebView 등) 글 상자가 그려진 뒤 그것을 선택해 복사 명령을 시도한다(getBox: 글 상자를 돌려주는 함수). 복사했으면 true. */
export async function copyText(text, getBox) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* 아래 방법으로 */ }
  try {
    await new Promise((r) => setTimeout(r, 60));
    const box = getBox && getBox();
    if (box) { box.focus(); box.select(); if (document.execCommand && document.execCommand('copy')) return true; }
  } catch (e) { /* 무시 */ }
  return false;
}

/* ── 보내기: 확인서를 운영자의 구글 시트(앱 스크립트 웹 앱)로 보낸다. 동의서와 접수 주소가 담긴 독립 실행·설치형 웹앱 빌드에서만 쓰며, 단추를 누를 때 한 번 요청이 나간다. ──
   본문은 text/plain 으로 보낸다(브라우저가 사전 확인 요청을 먼저 보내지 않게 — 앱 스크립트 웹 앱은 그 요청을 받지 못한다). 쿠키·참조 주소는 보내지 않는다.
   돌려주는 값: { kind, code, msg } — 예외를 던지지 않는다. kind: 'ok'(받았다는 답을 읽음) · 'rejected'(운영자 쪽이 받지 않음) · 'unknown'(받았는지 확인하지 못함: 답을 읽지 못함·시간 초과) · 'offline'(연결 없음 — 보내지 않음).
   글은 운영자가 정한 문구만 쓴다(서버가 돌려준 글을 화면에 옮기지 않는다). */
export const SEND_TIMEOUT_MS = 25000;
const LATER = '다시 눌러 보내셔도 됩니다(같은 분의 같은 범위는 가장 나중 것만 반영됩니다). 계속 안 되면 ‘파일로 저장’으로 만들어 이 앱을 알려 드린 MedIT 담당자에게 전달해 주세요.';
const FILE_ROUTE = '‘파일로 저장’으로 만들어 이 앱을 알려 드린 MedIT 담당자에게 전달해 주세요.';
export const SEND_MSG = {
  ok: '보냈습니다. 운영자(MedIT)가 약사 면허를 확인한 뒤 확인서를 합칩니다. 합친 다음 판의 ‘검수 상태’에 반영되며, 그 전에는 ‘검수 상태’가 바뀌지 않습니다.',
  offline: '인터넷에 연결되어 있지 않아 보내지 못했습니다. 연결한 뒤 다시 눌러 주세요(입력한 내용은 이 기기에 남아 있습니다).',
  unknown: `받았다는 답을 확인하지 못했습니다. 운영자가 받았을 수도, 못 받았을 수도 있습니다. ${LATER}`,
  timeout: `시간이 오래 걸려 중단했습니다. 운영자가 받았을 수도, 못 받았을 수도 있습니다. ${LATER}`,
  closed: `지금은 앱으로 확인서를 받지 않는 중입니다. ${FILE_ROUTE}`,
  version: '이 앱의 동의서가 운영자가 받는 동의서와 달라 받지 못했습니다. 앱을 새로 고쳐 최신 판으로 열고, 동의서를 다시 읽고 동의한 뒤 보내 주세요.',
  no_consent: '동의 표시가 확인되지 않아 받지 못했습니다. 동의서를 다시 읽고 동의 표시를 한 뒤 보내 주세요.',
  draft: '동의서가 확정되기 전의 확인서라 받지 못했습니다. 앱을 새로 고쳐 최신 판으로 열어 주세요.',
  invalid: `확인서가 운영자의 형식 검사를 통과하지 못했습니다. 앱을 새로 고친 뒤 다시 시도하고, 계속 안 되면 ${FILE_ROUTE}`,
  too_large: `확인서가 너무 커서 받지 못했습니다. ${FILE_ROUTE}`,
  full: '운영자의 접수 칸이 가득 차서 받지 못했습니다. 이 앱을 알려 드린 MedIT 담당자에게 알려 주세요.',
  busy: '다른 확인서를 처리하는 중이라 받지 못했습니다. 잠시 뒤 다시 눌러 주세요.',
  server: `운영자 쪽 오류로 받지 못했습니다. 잠시 뒤 다시 눌러 보고, 계속 안 되면 ${FILE_ROUTE}`,
  other: `받지 못했습니다(알 수 없는 응답). ${FILE_ROUTE}`,
  no_endpoint: `이 앱 판에는 보내기 주소가 없습니다. ${FILE_ROUTE}`,
};
SEND_MSG.bad_request = SEND_MSG.invalid;
const SERVER_CODES = ['closed', 'bad_request', 'too_large', 'invalid', 'no_consent', 'draft', 'version', 'full', 'busy', 'server']; // 앱 스크립트(review_inbox.gs)가 돌려주는 거부 코드

export async function sendToIntake(text) {
  const I = getIntake();
  if (!I.canSend) return { kind: 'rejected', code: 'no_endpoint', msg: SEND_MSG.no_endpoint };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { kind: 'offline', code: 'offline', msg: SEND_MSG.offline };
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => { try { if (ctl) ctl.abort(); } catch (e) { /* 무시 */ } }, SEND_TIMEOUT_MS);
  let raw = '';
  try {
    const res = await fetch(I.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ kind: 'medterm-kr-submit/1', text }),
      redirect: 'follow', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', ...(ctl ? { signal: ctl.signal } : {}),
    });
    raw = await res.text();
  } catch (e) {
    const to = !!(ctl && ctl.signal.aborted);
    return { kind: 'unknown', code: to ? 'timeout' : 'network', msg: to ? SEND_MSG.timeout : SEND_MSG.unknown };
  } finally { clearTimeout(timer); }
  let j = null;
  try { j = JSON.parse(raw); } catch (e) { j = null; }
  if (j && typeof j === 'object' && j.ok === true) return { kind: 'ok', code: 'ok', msg: SEND_MSG.ok };
  if (j && typeof j === 'object' && j.ok === false) {
    const code = SERVER_CODES.includes(j.code) ? j.code : 'other';
    return { kind: 'rejected', code, msg: SEND_MSG[code] };
  }
  return { kind: 'unknown', code: 'unreadable', msg: SEND_MSG.unknown };
}

/* ── 불러오기: 이 앱이 내보낸 확인서(진행 상황) 글을 읽어 판정을 합친다. 확인서 동의(attested)와 개인정보 수집·이용 동의(c1·c2)는 가져오지 않는다(내보낼 때마다 다시 표시). ── */
export function parseImport(text, R, avail) {
  if (typeof text !== 'string' || !text.trim()) return { err: '붙여 넣은 글이 없습니다.' };
  if (text.length > MAX.file) return { err: '글이 너무 깁니다.' };
  let o;
  try { o = JSON.parse(text.replace(/^\ufeff/, '')); } catch (e) { return { err: '글을 읽지 못했습니다. 파일의 내용을 처음부터 끝까지 그대로 붙여 넣었는지 확인해 주세요.' }; }
  if (!o || typeof o !== 'object' || o.schema !== SCHEMA) return { err: '이 앱에서 내보낸 확인서(진행 상황) 파일이 아닙니다.' };
  if (!avail.includes(o.scope)) return { err: '이 화면에 없는 검수 범위입니다(다른 판의 앱에서 만든 파일일 수 있습니다).' };
  if (!o.answers || typeof o.answers !== 'object') return { err: '판정이 들어 있지 않은 파일입니다.' };
  const cur = new Map(R.items[o.scope].map((it) => [it.id, it]));
  const answers = {};
  let stale = 0; let unknown = 0;
  for (const [id, a] of Object.entries(o.answers)) {
    if (!ID_OK.test(id) || !cur.has(id)) { unknown++; continue; }
    if (!a || typeof a !== 'object' || !VSET.has(a.v)) { unknown++; continue; }
    if (a.h !== cur.get(id).h) { stale++; continue; }
    answers[id] = { v: a.v, h: a.h, ...noteKept(a.v, a.m) };
  }
  const rv = o.reviewer && typeof o.reviewer === 'object' ? o.reviewer : {};
  return {
    scope: o.scope, answers, stale, unknown, count: Object.keys(answers).length,
    rev: { name: cut(rv.name, MAX.name), org: cut(rv.affiliation, MAX.org), pub: rv.public === true, lic: rv.license_claimed === true },
    refs: Array.isArray(o.refs) ? o.refs.filter((k) => RSET.has(k)) : [], other: cut(o.refs_other, MAX.other),
  };
}

/* ── ‘검수 상태’ 표시용 요약(빌드가 계산해 담은 현황을 이 화면에 있는 범위만 모아 보여 준다) ── */
export function reviewSummary() {
  const R = getReview();
  if (!R) return null;
  const rows = availableScopes().map((id) => ({
    id, label: R.scopes[id].label,
    n: R.scopes[id].n, answered: 0, confirmed: 0, issue: 0, unsure: 0, need_recheck: 0, attested_confirmed: 0, stage2: false, stage3: false, reviewers: [],
    ...(R.status[id] || {}),
  }));
  if (!rows.length) return null;
  const pub = new Map(); const hid = new Set();
  rows.forEach((r) => (r.reviewers || []).forEach((p) => { if (p.name) pub.set(p.pid, p); else hid.add(p.pid); }));
  return {
    rows, asof: R.asof || null, people: [...pub.values()], hidden: hid.size,
    any2: rows.some((r) => r.answered > 0), all2: rows.every((r) => r.stage2),
    any3: rows.some((r) => r.attested_confirmed > 0), all3: rows.every((r) => r.stage3),
  };
}
