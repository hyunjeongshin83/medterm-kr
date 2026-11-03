// 모의 서버로 fetch_mfds.mjs 의 페이징·이어받기·오류 처리·키 비노출을 점검한다(실제 MFDS 서버가 아님).
import http from 'node:http'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)); const { collectAll } = await import(pathToFileURL(path.join(here, 'fetch_mfds.mjs')).href);
const SECRET = 'AbC+dEf/123==';   // 디코딩 키(+, / 포함)
const N = { getDrugPrdtPrmsnInq07: 257, getDrugPrdtMcpnDtlInq07: 341, getDrugPrdtPrmsnInq08: 257, getDrugPrdtMcpnDtlInq08: 341 }; let calls = 0, quota = 1e9; const seenOps = new Set();
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const op = u.pathname.split('/').pop(); calls++; seenOps.add(op);
  if (u.searchParams.get('serviceKey') !== SECRET) { res.end('<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>'); return; }
  if (calls > quota) { res.end('<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>'); return; }
  const page = +u.searchParams.get('pageNo'), rows = +u.searchParams.get('numOfRows'), total = N[op]; const items = [];
  for (let i = (page - 1) * rows; i < Math.min(page * rows, total); i++) items.push({ ITEM_SEQ: String(100000 + i), ITEM_NAME: '테스트정' + i, MTRAL_NM: '성분' + (i % 7) });
  res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' }, body: { pageNo: page, numOfRows: rows, totalCount: total, items } }));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const BASE = `http://127.0.0.1:${srv.address().port}/1471000/DrugPrdtPrmsnInfoService07`;
const tmp = () => fs.mkdtempSync(path.join(process.env.TEST_TMP || os.tmpdir(), 'mfds-')); const logs = []; const log = m => logs.push(m);
const go = async (o, key) => { try { return { ok: true, v: await collectAll({ delay: 0, base: BASE, key, log, ...o }) }; } catch (e) { return { ok: false, msg: e.message }; } };
const lines = f => fs.readFileSync(f, 'utf8').trim().split('\n').map(JSON.parse); const checks = []; const ok = (n, c, x = '') => checks.push([c ? 'PASS' : 'FAIL', n, x]);
// 1) 전체 수집(디코딩 키)
let out = tmp(); let r = await go({ out }, SECRET); ok('full run ok', r.ok, r.msg);
const L = lines(path.join(out, 'list.jsonl')), I = lines(path.join(out, 'ingredients.jsonl'));
ok('list count == totalCount (257)', L.length === 257, String(L.length)); ok('ingredients count == totalCount (341)', I.length === 341, String(I.length)); ok('no duplicate ITEM_SEQ in list', new Set(L.map(x => x.ITEM_SEQ)).size === 257);
ok('summary complete & first-record keys reported', JSON.parse(fs.readFileSync(path.join(out, 'summary.json'))).results.every(x => x.complete && x.first_record_keys.includes('ITEM_SEQ')));
// 2) 인코딩 키도 허용
out = tmp(); r = await go({ out, only: 'list' }, encodeURIComponent(SECRET)); ok('encoded key accepted', r.ok && lines(path.join(out, 'list.jsonl')).length === 257, r.msg);
// 3) 이어받기
out = tmp(); await go({ out, only: 'list', maxPages: 1 }, SECRET); const part = lines(path.join(out, 'list.jsonl')).length; ok('partial run stops after 1 page', part === 100, String(part));
r = await go({ out, only: 'list' }, SECRET); const after = lines(path.join(out, 'list.jsonl')); ok('resume completes without duplicates', r.ok && after.length === 257 && new Set(after.map(x => x.ITEM_SEQ)).size === 257, String(after.length));
r = await go({ out, only: 'list' }, SECRET); ok('rerun after completion makes no extra rows', r.ok && lines(path.join(out, 'list.jsonl')).length === 257);
// 4) 잘못된 키: 사유 표시, 키 비노출
out = tmp(); logs.length = 0; r = await go({ out, only: 'list' }, 'WRONGKEY+/='); ok('bad key -> fatal with code 30', !r.ok && r.msg.includes('코드 30'), r.msg);
ok('key never in message/log', !(r.msg + logs.join('')).includes('WRONGKEY') && !(r.msg + logs.join('')).includes(encodeURIComponent('WRONGKEY+/=')));
r = await go({ out: tmp() }, ''); ok('missing key -> clear message', !r.ok && r.msg.includes('DATA_GO_KR_KEY'));
// 5) 일일 한도 초과 → 진행 상태 보존 → 한도 해제 후 이어받기
out = tmp(); calls = 0; quota = 2; r = await go({ out, only: 'list' }, SECRET); ok('quota error stops with code 22', !r.ok && r.msg.includes('코드 22'), r.msg);
const p = JSON.parse(fs.readFileSync(path.join(out, 'list.progress.json'))); ok('progress saved before quota stop', p.lastPage === 2 && p.collected === 200, JSON.stringify(p));
quota = 1e9; r = await go({ out, only: 'list' }, SECRET); ok('resume after quota reset completes', r.ok && lines(path.join(out, 'list.jsonl')).length === 257, r.msg);
// 6) 서비스 버전에서 오퍼레이션 이름 유도(08), 기본 주소가 08인지
seenOps.clear(); out = tmp(); r = await go({ out, base: BASE.replace('Service07', 'Service08') }, SECRET);
ok('Service08 base -> *Inq08 operations used', r.ok && seenOps.has('getDrugPrdtPrmsnInq08') && seenOps.has('getDrugPrdtMcpnDtlInq08') && !seenOps.has('getDrugPrdtPrmsnInq07'), [...seenOps].join(','));
ok('default base is Service08', fs.readFileSync(path.join(here, 'fetch_mfds.mjs'), 'utf8').includes("DEFAULT_BASE = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService08'"));
srv.close(); checks.forEach(c => console.log(c.join(' | '))); const f = checks.filter(c => c[0] === 'FAIL').length; console.log(`\n${checks.length - f}/${checks.length} checks passed`); process.exit(f ? 1 : 0);
