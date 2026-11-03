// MFDS(식약처) 의약품 제품 허가정보 수집 — 사용자 PC에서 실행합니다(인증키는 .env에만 보관).
// 준비: .env 파일에  DATA_GO_KR_KEY=<공공데이터포털 인증키>  (디코딩/인코딩 키 모두 가능)
// 실행: node --env-file=.env tools/fetch_mfds.mjs --out "C:\Users\<사용자>\Downloads\mfds_out"
// 옵션: --only list|ingredients  --max-pages N  --rows 100  --delay 150  --list-op 이름  --ing-op 이름(오퍼레이션 이름을 직접 지정할 때)
// 이어받기: 같은 --out 으로 다시 실행하면 마지막 페이지 다음부터 계속합니다(일일 호출 한도 대비).
// 주의: 요청 URL에는 인증키가 들어 있으므로 URL·키를 로그/오류 메시지에 출력하지 않습니다.
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const DEFAULT_BASE = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService08';   // 2026-10 기준 포털의 최신 End Point(07은 중지 예정 공지)
// 오퍼레이션 이름은 서비스 버전 번호에서 만든다: ServiceNN → getDrugPrdtPrmsnInqNN / getDrugPrdtMcpnDtlInqNN
const opsFor = (base, over = {}) => { const v = (base.match(/Service(\d+)\/?$/) || [])[1] || '08'; return { list: over.listOp || `getDrugPrdtPrmsnInq${v}`, ingredients: over.ingOp || `getDrugPrdtMcpnDtlInq${v}` }; };
const FATAL = { '22': '일일 호출 한도 초과(내일 같은 명령으로 이어받기)', '30': '등록되지 않은 서비스키', '31': '기한 만료된 서비스키', '20': '인증키 누락 또는 접근 거부(데이터포털 오류표에서는 SERVICE_KEY_IS_NULL로 표기 — 키 값과 활용신청 승인 상태 확인)', '10': '잘못된 요청 파라미터', '12': '해당 서비스 없음(서비스 버전/주소 확인)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function collectAll({ out, only = '', maxPages = 0, rows = 100, delay = 150, base = DEFAULT_BASE, key = '', log = console.log, listOp, ingOp }) {
  base = String(base).replace(/\/+$/, ''); const OPS = opsFor(base, { listOp, ingOp });
  key = String(key || '').trim();
  if (!key) throw Object.assign(new Error('DATA_GO_KR_KEY 가 없습니다. .env 에 DATA_GO_KR_KEY=... 를 넣고 node --env-file=.env 로 실행하세요.'), { fatal: true });
  if (/%[0-9A-Fa-f]{2}/.test(key)) { try { key = decodeURIComponent(key); } catch {} }   // 인코딩 키가 들어와도 한 번만 인코딩되게
  rows = Math.min(Number(rows) || 100, 100); out = path.resolve(out); fs.mkdirSync(out, { recursive: true });
  async function fetchPage(op, pageNo) {
    const url = `${base}/${op}?serviceKey=${encodeURIComponent(key)}&pageNo=${pageNo}&numOfRows=${rows}&type=json`;
    let last = '';
    for (let a = 0; a < 4; a++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); const txt = await r.text();
        if (txt.trim().startsWith('<')) {                                  // XML 오류 본문(키 오류 등)
          const code = (txt.match(/<returnReasonCode>(\d+)</) || [])[1]; const msg = (txt.match(/<returnAuthMsg>([^<]+)</) || txt.match(/<errMsg>([^<]+)</) || [])[1] || 'XML 오류 응답';
          throw Object.assign(new Error(`${msg}${code ? ' (코드 ' + code + ')' : ''}${FATAL[code] ? ' — ' + FATAL[code] : ''}`), { fatal: !!code });
        }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = JSON.parse(txt); const h = j.header || j.response?.header, b = j.body || j.response?.body;
        if (!h || !b) throw new Error('예상과 다른 응답 구조');
        if (String(h.resultCode) !== '00') throw Object.assign(new Error(`resultCode ${h.resultCode} ${h.resultMsg || ''}${FATAL[String(h.resultCode)] ? ' — ' + FATAL[String(h.resultCode)] : ''}`), { fatal: true });
        let items = b.items; if (items && !Array.isArray(items)) items = items.item ?? []; if (items && !Array.isArray(items)) items = [items];
        return { total: Number(b.totalCount), items: items || [] };
      } catch (e) { last = String(e.message).split(key).join('***'); if (e.fatal) throw new Error(last); await sleep(800 * (a + 1)); }
    }
    throw new Error('재시도 실패: ' + last);
  }
  async function collect(name) {
    const op = OPS[name], data = path.join(out, `${name}.jsonl`), prog = path.join(out, `${name}.progress.json`);
    let start = 1, got = 0, total = null, firstKeys = null;
    if (fs.existsSync(prog)) { const p = JSON.parse(fs.readFileSync(prog, 'utf8')); start = p.lastPage + 1; got = p.collected; total = p.total; log(`[${name}] 이어받기: ${start}페이지부터 (이미 ${got}건)`); }
    if (total !== null && got >= total) return { name, op, total, collected: got, complete: true, first_record_keys: null };
    let pageNo = start, done = 0;
    while (true) {
      const { total: t, items } = await fetchPage(op, pageNo); total = t;
      if (!firstKeys && items[0]) firstKeys = Object.keys(items[0]);
      if (items.length) fs.appendFileSync(data, items.map(x => JSON.stringify(x)).join('\n') + '\n');
      got += items.length; fs.writeFileSync(prog, JSON.stringify({ lastPage: pageNo, collected: got, total }));
      done++; if (pageNo % 20 === 0 || pageNo === 1) log(`[${name}] ${pageNo}/${Math.ceil(total / rows)} 페이지, ${got}/${total}건`);
      if (got >= total || items.length === 0 || pageNo >= Math.ceil(total / rows)) break;
      if (maxPages && done >= maxPages) { log(`[${name}] --max-pages ${maxPages} 에서 중단(이어받기 가능)`); break; }
      pageNo++; await sleep(delay);
    }
    return { name, op, total, collected: got, complete: got >= total, first_record_keys: firstKeys };
  }
  const summary = { retrieved_at: new Date().toISOString(), base, results: [] };
  try {
    for (const n of (only ? [only] : ['list', 'ingredients'])) {
      const r = await collect(n); summary.results.push(r); log(`[${n}] 완료=${r.complete} 수집 ${r.collected}/${r.total}`);
      if (r.first_record_keys) log(`[${n}] 첫 레코드 필드: ${r.first_record_keys.join(', ')}`);
    }
  } catch (e) { fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ ...summary, error: e.message }, null, 1)); throw e; }
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1)); log('summary.json 저장: ' + path.join(out, 'summary.json'));
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2); const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
  try {
    await collectAll({ out: opt('out', './mfds_out'), only: opt('only', ''), maxPages: Number(opt('max-pages', 0)), rows: Number(opt('rows', 100)), delay: Number(opt('delay', 150)), listOp: opt('list-op', ''), ingOp: opt('ing-op', ''), base: process.env.MFDS_BASE_URL || DEFAULT_BASE, key: process.env.DATA_GO_KR_KEY });
  } catch (e) { console.error('중단: ' + e.message); process.exit(e.message.startsWith('DATA_GO_KR_KEY') ? 2 : 1); }
}
