/**
 * MedTerm-KR 약사 확인서 접수 점검 · 가명 분리 · 주간 요약 메일
 * 응답을 받는 구글 시트(앱에서 바로 받는 새 시트, 또는 구글 폼 응답 시트)의 ‘확장 프로그램 → Apps Script’ 에 붙여 넣어 쓰는 스크립트입니다(자세한 순서: 약사 확인서 접수창 만들기 문서).
 *
 * 하는 일
 *  ⓪ (앱 접수) 앱 화면에서 동의서에 표시하고 ‘보내기’를 누른 확인서를 웹 앱(doPost)으로 받아 ‘응답’ 시트에 한 줄씩 적습니다.
 *     받기 전에 확인서 형식·동의 기록(개인정보 수집·이용 동의 필수, 연구 이용 동의는 선택)·동의서 버전을 모두 검사하고, 하나라도 어긋나면 적지 않습니다.
 *     접수는 처음에 닫혀 있습니다(메뉴 ‘앱 접수 열기’로 동의서 버전을 적어야 열림 · ‘앱 접수 닫기’로 언제든 닫음).
 *  ① 응답이 들어올 때마다(그리고 매주 월요일 아침) 모든 응답을 처음부터 다시 점검합니다 — 확인서 형식·범위·항목 번호·사전 내용 일치(검수 항목 해시)·글자 수·작성일.
 *     결과는 이 시트의 ‘접수 점검’ 에 한 줄씩(이름·소속·메모 없이) 적습니다.
 *  ② ‘연구 이용 동의’ 와 ‘면허확인(운영자 기입)’ 이 모두 있는 응답만 분석에 씁니다. 약사는 R01, R02… 가명으로만 나옵니다.
 *  ③ 가명으로 만든 분석은 따로 만든 새 시트 파일(‘MedTerm-KR 약사 검수 분석(가명…)’)에 적습니다 — 연구자와 나눌 때는 이 파일만 나눕니다.
 *     이름·소속이 든 ‘가명표(운영자만)’ 와 메모가 든 ‘메모(운영자만)’ 는 이 응답 시트 안에만 있습니다(나만 편집 가능으로 보호; 시트 파일 자체를 남에게 나누면 보입니다).
 *  ④ 매주 월요일 아침 요약 메일을 보냅니다: 접수 현황 · 판정 분포 · S-CVI · 일치도 · ‘다르다’ 많은 항목. 이름·소속·메모·원본 글은 담지 않으며, 보내기 전에 한 번 더 검사해 섞였으면 보내지 않습니다.
 *     받는 곳 = 운영자 주소(SUMMARY_TO) + 연구자가 연구자 페이지에서 직접 등록한 주소(최대 5개). 주소마다 한 통씩 따로 보냅니다(받는 사람끼리 주소가 안 보임).
 *  ⑤ (연구자 페이지) 웹 앱 주소 끝에 ?page=researcher 를 붙여 열면, 운영자가 메뉴로 지정한 연구자가 메일 인증 번호로 로그인해 요약 메일 받을 주소를 직접 넣고 뺄 수 있습니다.
 *     다른 사람 주소는 그 주소로 간 인증 번호까지 입력해야 등록됩니다. 이 페이지는 확인서·분석 내용을 보여 주지 않습니다.
 *
 * 하지 않는 일: 인터넷 다른 곳에 접속(UrlFetchApp 등)하지 않습니다 · 약사 면허를 확인하지 않습니다(운영자가 직접) · 판정을 만들어 내지 않습니다 · 확인서를 약사 DB 에 합치지 않습니다(합치기는 tools/merge_pharmacist_reviews.py).
 * 받을 주소는 코드에 적지 않고 ‘스크립트 속성’ SUMMARY_TO 에 둡니다(메뉴 MedTerm-KR → 처음 설정).
 * 시험 삼아 가짜 응답으로 돌려 볼 때는 스크립트 속성 DEMO_MODE 를 1 로 두세요 — 메일·분석에 ‘시험용 · 가짜 데이터’ 표시가 붙습니다(진짜 응답을 받기 전에 지우기).
 * 같은 계산을 tools/review_research_report.py(파이썬)도 합니다. 두 결과가 같은지 tests/test_review_inbox.py 가 가짜 응답으로 대조합니다.
 * 이 줄 아래 MANIFEST 는 tools/make_review_inbox_script.py 가 data/ 의 검수 항목으로 만듭니다(자료가 바뀌면 다시 만들어 붙여 넣기).
 */
var SCRIPT_VERSION = '1.2';
var MANIFEST = /*MANIFEST*/{"scopes":{
"names":{"label":"성분 한글명·국내 상품명","hash":"a42f57e6f1b0","items":[
{"id":"N-161","no":1,"h":"0579f93d78","label":"1. 아세트아미노펜"},
{"id":"B-161-d2cc30","no":2,"h":"7c902f986b","label":"2. 타이레놀"},
{"id":"N-5640","no":3,"h":"e778675eff","label":"3. 이부프로펜"},
{"id":"B-5640-2c88e1","no":4,"h":"5c412290eb","label":"4. 애드빌"},
{"id":"B-5640-a29ba2","no":5,"h":"c5726165e1","label":"5. 부루펜"},
{"id":"N-7258","no":6,"h":"46a519cf6b","label":"6. 나프록센"},
{"id":"B-7258-082dda","no":7,"h":"d29071f6f9","label":"7. 낙센"},
{"id":"N-1191","no":8,"h":"620be9c49f","label":"8. 아스피린"},
{"id":"B-1191-62114d","no":9,"h":"f3d4a33fee","label":"9. 바이엘 아스피린"},
{"id":"N-3355","no":10,"h":"7bb19bc729","label":"10. 디클로페낙"},
{"id":"B-3355-676e1e","no":11,"h":"75a93a6d98","label":"11. 볼타렌"},
{"id":"N-10689","no":12,"h":"c287d50f51","label":"12. 트라마돌"},
{"id":"N-7646","no":13,"h":"a3493606fc","label":"13. 오메프라졸"},
{"id":"N-283742","no":14,"h":"2db4adcfb7","label":"14. 에스오메프라졸"},
{"id":"B-283742-39158a","no":15,"h":"ac7da7548d","label":"15. 넥시움"},
{"id":"N-40790","no":16,"h":"a70f00a3d7","label":"16. 판토프라졸"},
{"id":"B-40790-a75df4","no":17,"h":"05fa10c253","label":"17. 판토록"},
{"id":"N-4278","no":18,"h":"7b3b545d28","label":"18. 파모티딘"},
{"id":"B-4278-26b8c1","no":19,"h":"28f4537135","label":"19. 가스터"},
{"id":"N-6809","no":20,"h":"bb6c9bd192","label":"20. 메트포르민"},
{"id":"B-6809-204ad1","no":21,"h":"1145d0bd34","label":"21. 글루코파지"},
{"id":"N-25789","no":22,"h":"ebf7ee0f96","label":"22. 글리메피리드"},
{"id":"B-25789-db4081","no":23,"h":"5ed1955c45","label":"23. 아마릴"},
{"id":"N-17767","no":24,"h":"e471a66477","label":"24. 암로디핀"},
{"id":"B-17767-8512fe","no":25,"h":"125d1a35f4","label":"25. 노바스크"},
{"id":"N-52175","no":26,"h":"45e876aa0a","label":"26. 로사르탄"},
{"id":"B-52175-c7c504","no":27,"h":"f77fb70d3b","label":"27. 코자"},
{"id":"N-69749","no":28,"h":"4488862bcf","label":"28. 발사르탄"},
{"id":"B-69749-e4fcf7","no":29,"h":"59898e6cb8","label":"29. 디오반"},
{"id":"N-4603","no":30,"h":"875f534f62","label":"30. 푸로세미드"},
{"id":"B-4603-a394da","no":31,"h":"1ad46c8935","label":"31. 라식스"},
{"id":"N-83367","no":32,"h":"286ae1a901","label":"32. 아토르바스타틴"},
{"id":"B-83367-f00c23","no":33,"h":"b96e844785","label":"33. 리피토"},
{"id":"N-301542","no":34,"h":"3250ec79e0","label":"34. 로수바스타틴"},
{"id":"B-301542-9a0197","no":35,"h":"882daedd92","label":"35. 크레스토"},
{"id":"N-36567","no":36,"h":"b303b01ae7","label":"36. 심바스타틴"},
{"id":"B-36567-b982fb","no":37,"h":"fa45930822","label":"37. 조코"},
{"id":"N-11289","no":38,"h":"442244044c","label":"38. 와파린"},
{"id":"B-11289-53ecb7","no":39,"h":"9064ab92e9","label":"39. 쿠파린"},
{"id":"N-32968","no":40,"h":"17bd1dd8b3","label":"40. 클로피도그렐"},
{"id":"B-32968-bc4fe7","no":41,"h":"59ede06381","label":"41. 플라빅스"},
{"id":"N-10582","no":42,"h":"1a85d7614b","label":"42. 레보티록신"},
{"id":"B-10582-c7f42d","no":43,"h":"c71e57276c","label":"43. 씬지로이드"},
{"id":"N-723","no":44,"h":"53bf99d5a9","label":"44. 아목시실린"},
{"id":"N-18631","no":45,"h":"e94cecdca5","label":"45. 아지트로마이신"},
{"id":"B-18631-5eb8ec","no":46,"h":"b1cabee599","label":"46. 지스로맥스"},
{"id":"N-2551","no":47,"h":"76b7d67f47","label":"47. 시프로플록사신"},
{"id":"N-20610","no":48,"h":"34788c489e","label":"48. 세티리진"},
{"id":"B-20610-30738b","no":49,"h":"fc9322beb1","label":"49. 지르텍"},
{"id":"N-28889","no":50,"h":"93cc854eb1","label":"50. 로라타딘"},
{"id":"B-28889-47831c","no":51,"h":"abef71d503","label":"51. 클라리틴"},
{"id":"N-88249","no":52,"h":"3ae5a0312e","label":"52. 몬테루카스트"},
{"id":"B-88249-f90050","no":53,"h":"cbf54f3091","label":"53. 싱귤레어"},
{"id":"N-36437","no":54,"h":"f7e44b4677","label":"54. 설트랄린"},
{"id":"B-36437-38af93","no":55,"h":"a35a1de885","label":"55. 졸로푸트"},
{"id":"N-321988","no":56,"h":"dc64db814c","label":"56. 에스시탈로프람"},
{"id":"B-321988-299e7b","no":57,"h":"e38a259d2b","label":"57. 렉사프로"},
{"id":"N-39993","no":58,"h":"ec6ccfff1d","label":"58. 졸피뎀"},
{"id":"B-39993-46828b","no":59,"h":"6dfb25ebcd","label":"59. 스틸녹스"},
{"id":"N-8638","no":60,"h":"1096e96a4d","label":"60. 프레드니솔론"}
]},
"law":{"label":"약사법 쉬운 풀이","hash":"82e73f27d6c9","items":[
{"id":"L-2_1","no":1,"h":"61d8a89c1a","label":"1. 제2조 제1호"},
{"id":"L-2_2","no":2,"h":"9a23cdc6d7","label":"2. 제2조 제2호"},
{"id":"L-2_3","no":3,"h":"3eff92c28f","label":"3. 제2조 제3호"},
{"id":"L-2_4","no":4,"h":"06dfecac9c","label":"4. 제2조 제4호"},
{"id":"L-2_5","no":5,"h":"77de945514","label":"5. 제2조 제5호"},
{"id":"L-2_6","no":6,"h":"575860a9b2","label":"6. 제2조 제6호"},
{"id":"L-2_7","no":7,"h":"947a17d4a9","label":"7. 제2조 제7호"},
{"id":"L-2_8","no":8,"h":"1120e8048b","label":"8. 제2조 제8호"},
{"id":"L-2_9","no":9,"h":"7a756364f4","label":"9. 제2조 제9호"},
{"id":"L-2_10","no":10,"h":"e6b3fdf8e9","label":"10. 제2조 제10호"},
{"id":"L-2_11","no":11,"h":"b77da6ee4d","label":"11. 제2조 제11호"},
{"id":"L-2_12","no":12,"h":"3efc16c85a","label":"12. 제2조 제12호"},
{"id":"L-2_13","no":13,"h":"766bc8f3e8","label":"13. 제2조 제13호"},
{"id":"L-2_14","no":14,"h":"d841a823b4","label":"14. 제2조 제14호"},
{"id":"L-2_15","no":15,"h":"7e635af09e","label":"15. 제2조 제15호"},
{"id":"L-2_16","no":16,"h":"540934a078","label":"16. 제2조 제16호"},
{"id":"L-2_17","no":17,"h":"4f061c57f8","label":"17. 제2조 제17호"},
{"id":"L-2_18","no":18,"h":"924cc26612","label":"18. 제2조 제18호"},
{"id":"L-2_19","no":19,"h":"eb6a46aa65","label":"19. 제2조 제19호"},
{"id":"L-2_20","no":20,"h":"8b4e72939b","label":"20. 제2조 제20호"},
{"id":"L-2-2","no":21,"h":"4cb7372adf","label":"21. 제2조의2 제1항"},
{"id":"L-11","no":22,"h":"7a77b4dafb","label":"22. 제11조"},
{"id":"L-11-5","no":23,"h":"3f7c7cbf70","label":"23. 제11조 제5항·제6항"},
{"id":"L-12","no":24,"h":"bc5a6e9058","label":"24. 제12조"},
{"id":"L-13","no":25,"h":"3adc1867e6","label":"25. 제13조"},
{"id":"L-14","no":26,"h":"285bc4eeb0","label":"26. 제14조"},
{"id":"L-15","no":27,"h":"b550bfcc7f","label":"27. 제15조"},
{"id":"L-16","no":28,"h":"f267692154","label":"28. 제16조"},
{"id":"L-18","no":29,"h":"94198de44a","label":"29. 제18조"},
{"id":"L-20","no":30,"h":"f3da8cbf11","label":"30. 제20조"},
{"id":"L-21","no":31,"h":"1503575041","label":"31. 제21조"},
{"id":"L-21-3","no":32,"h":"c6cd3b793a","label":"32. 제21조의3 제1항"},
{"id":"L-22","no":33,"h":"4aa224f214","label":"33. 제22조"},
{"id":"L-23","no":34,"h":"9983584e32","label":"34. 제23조"},
{"id":"L-23-2","no":35,"h":"1209fc3874","label":"35. 제23조의2"},
{"id":"L-23-3","no":36,"h":"b1be47cae8","label":"36. 제23조의3 제1항"},
{"id":"L-23-3-4","no":37,"h":"4b6a780c5c","label":"37. 제23조의3 제4항"},
{"id":"L-24_1","no":38,"h":"370eb22b2d","label":"38. 제24조 제1항·제2항"},
{"id":"L-24_4","no":39,"h":"0a94cf3111","label":"39. 제24조 제4항"},
{"id":"L-24-2","no":40,"h":"f85cf2bf5b","label":"40. 제24조의2 제1항"},
{"id":"L-25","no":41,"h":"cd6262b7e9","label":"41. 제25조"},
{"id":"L-26","no":42,"h":"a54d9c5930","label":"42. 제26조"},
{"id":"L-27","no":43,"h":"e5a1348ea9","label":"43. 제27조"},
{"id":"L-27-2","no":44,"h":"f734c5b9b6","label":"44. 제27조의2 제1항"},
{"id":"L-28","no":45,"h":"bae1214794","label":"45. 제28조"},
{"id":"L-29","no":46,"h":"f63046a314","label":"46. 제29조"},
{"id":"L-30","no":47,"h":"08ff46f23b","label":"47. 제30조"},
{"id":"L-33","no":48,"h":"3ecc7b7f2f","label":"48. 제33조"},
{"id":"L-34","no":49,"h":"111e4a5033","label":"49. 제34조 제1항"},
{"id":"L-34-5","no":50,"h":"0dab292d9d","label":"50. 제34조의5 제2항"},
{"id":"L-68-2","no":51,"h":"3ae0a4d743","label":"51. 제68조의2 제1항"},
{"id":"L-68-11","no":52,"h":"6649bc181a","label":"52. 제68조의11 제1항"},
{"id":"L-83-5","no":53,"h":"cf0077ee38","label":"53. 제83조의5 (시행 예정)"}
]}
}}/*END*/;

// ═════════════ 핵심 계산 — 구글 서비스를 쓰지 않는 순수 함수(노드에서도 시험함) ═════════════
var RI = (function () {
  'use strict';
  var SCHEMA = 'medterm-kr-review/1';
  var VERDICTS = ['ok', 'diff', 'unsure'];
  var V_LABEL = { ok: '맞다', diff: '다르다', unsure: '모르겠다' };
  var REFS = ['health.kr', 'mfds', 'book', 'law', 'other'];
  var REF_LABEL = { 'health.kr': '약학정보원', mfds: '식약처', book: '교재·서적', law: '법령', other: '기타' };
  var REASON_LABEL = {
    empty: '빈 응답', too_large: '크기 초과', json: 'JSON 해석 실패(잘렸거나 따옴표가 바뀜)', schema: '확인서 형식 아님', scope: '알 수 없는 범위',
    license_claim: '면허 보유 표시 없음', item_id: '이 자료에 없는 항목 번호', verdict: '판정 값 이상', hash: '내용 표시 없음', date: '작성일 이상',
    length: '글자 수 초과', all_stale: '지금 사전과 맞는 판정 없음', reviewer: '검수자 칸 이상', answers: '판정 칸 이상', refs: '참고 자료 칸 이상',
    attested: '확인서 동의 칸 이상', other: '그 밖의 형식 오류'
  };
  var GATE_LABEL = { research_consent: '연구 이용 동의 없음', license: '면허 확인 전', gate_unknown: '동의·면허 열 없음(확인 불가)' };
  var REASON_KEYS = [['자를 넘', 'length'], ['JSON 객체가 아닙니다', 'schema'], ['형식이 다릅니다', 'schema'], ['알 수 없는 범위', 'scope'], ['면허를 가지고', 'license_claim'],
    ['항목 id', 'item_id'], ['판정(v)', 'verdict'], ['내용 표시(h)', 'hash'], ['작성일', 'date'], ['하나도 없습니다', 'all_stale'], ['answers', 'answers'],
    ['refs', 'refs'], ['attested', 'attested'], ['reviewer', 'reviewer'], ['검수자', 'reviewer']];
  var MAX_NAME = 40, MAX_ORG = 80, MAX_NOTE = 300, MAX_OTHER = 80, MAX_BYTES = 1000000;
  var BAD = /[\x00-\x1f\x7f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;
  // 파이썬 \s 와 같은 글자 모임(제어 문자 \x1c-\x1f·\x85 포함, ufeff 는 제외)
  var WSC = '[\\t\\n\\v\\f\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]';
  var WS_RUN = new RegExp(WSC + '+', 'g');
  var WS_EDGE = new RegExp('^' + WSC + '+|' + WSC + '+$', 'g');
  var DEMO_NOTE = '시험용 · 가짜 데이터입니다. 실제 약사의 응답이 아닙니다.';

  function RError(message) { this.name = 'RError'; this.message = message; }
  function fail(msg) { return new RError(msg); }
  function cps(s) { return Array.from(s).length; }
  function strip(s) { return s.replace(WS_EDGE, ''); }
  function normText(s) { return strip(String(s == null ? '' : s).normalize('NFC').replace(WS_RUN, ' ')); }
  function normKey(name, org) { return normText(name).toLowerCase() + '|' + normText(org).toLowerCase(); }
  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
  function utf8Len(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1; else if (c < 0x800) n += 2; else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; } else n += 3;
    }
    return n;
  }
  function reasonOf(msg) {
    for (var i = 0; i < REASON_KEYS.length; i++) if (msg.indexOf(REASON_KEYS[i][0]) >= 0) return REASON_KEYS[i][1];
    return 'other';
  }
  // 파이썬의 ‘{:.2f}’ 처럼 정확히 반(0.125 같은 이진수로 딱 떨어지는 경우)이면 짝수 쪽으로 반올림 — 두 도구의 숫자 표기를 맞추려는 것
  function fixed(x, nd) {
    var m = Math.pow(10, nd), y = Math.abs(x) * m, fl = Math.floor(y);
    if (y - fl === 0.5) {
      var r = (fl % 2 === 0) ? fl : fl + 1;
      return (x < 0 && r !== 0 ? '-' : '') + (r / m).toFixed(nd);
    }
    return x.toFixed(nd);
  }
  function fmt(x, nd) { return x == null ? '—' : fixed(x, nd == null ? 2 : nd); }
  function pct(x, nd) { return x == null ? '—' : fixed(x * 100, nd || 0) + '%'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;'); }

  // ── 글 · 날짜 검사(build/review_lib.py 의 clean_text · _date 와 같은 규칙) ──
  function cleanText(s, maxlen, field, required, oneLine) {
    if (s === undefined || s === null) s = '';
    if (typeof s !== 'string') throw fail(field + ': 글자여야 합니다');
    s = s.normalize('NFC');
    if (!oneLine) s = s.replace(WS_RUN, ' ');
    if (BAD.test(s)) throw fail(field + ': 제어 문자·보이지 않는 글자가 들어 있습니다');
    s = strip(s);
    if (required && !s) throw fail(field + ': 비어 있습니다');
    if (cps(s) > maxlen) throw fail(field + ': ' + maxlen + '자를 넘습니다(' + cps(s) + '자)');
    return s;
  }
  function addDays(iso, n) {
    var p = iso.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }
  function validDate(y, m, d) {
    var t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }
  function dateField(s, field, today) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw fail(field + ': YYYY-MM-DD 형식이어야 합니다');
    if (!validDate(+s.slice(0, 4), +s.slice(5, 7), +s.slice(8, 10))) throw fail(field + ': 없는 날짜입니다(' + s + ')');
    if (s < '2026-01-01' || s > addDays(today, 1)) throw fail(field + ': 범위를 벗어난 날짜입니다(' + s + ')');
    return s;
  }

  // ── 확인서 한 건 검증(validate_submission) ──
  function validate(sub, M, today) {
    if (!isObj(sub)) throw fail('제출 파일이 JSON 객체가 아닙니다');
    if (sub.schema !== SCHEMA) throw fail('형식이 다릅니다(schema=' + JSON.stringify(sub.schema) + '; 기대 ' + SCHEMA + ')');
    var sid = sub.scope;
    if (Array.isArray(sid) || isObj(sid)) throw new Error('범위 값이 글자가 아님');   // 파이썬 도구에서도 같은 경우 ‘그 밖의 형식 오류’로 센다
    if (typeof sid !== 'string' || !Object.prototype.hasOwnProperty.call(M.scopes, sid)) throw fail('알 수 없는 범위입니다(' + JSON.stringify(sid) + ')');
    var rv = sub.reviewer;
    if (!isObj(rv)) throw fail('reviewer 칸이 없습니다');
    var name = cleanText(rv.name, MAX_NAME, '검수자 이름', true, true);
    var org = cleanText(rv.affiliation, MAX_ORG, '소속', false, true);
    if (rv.license_claimed !== true) throw fail('약사 면허를 가지고 있다는 표시(license_claimed)가 없는 파일입니다');
    if (typeof rv.public !== 'boolean') throw fail('reviewer.public(공개 동의)은 true/false 여야 합니다');
    var refs = Object.prototype.hasOwnProperty.call(sub, 'refs') ? sub.refs : [];
    if (!Array.isArray(refs) || refs.some(function (r) { return REFS.indexOf(r) < 0; })) throw fail('refs(참고한 자료)에 알 수 없는 값이 있습니다: ' + JSON.stringify(refs).slice(0, 80));
    var other = cleanText(sub.refs_other, MAX_OTHER, '참고한 기타 자료', false, true);
    if (typeof sub.attested !== 'boolean') throw fail('attested(확인서 동의)는 true/false 여야 합니다');
    var created = dateField(sub.created, 'created(작성일)', today);
    var ans = sub.answers;
    if (!isObj(ans) || Object.keys(ans).length === 0) throw fail('answers(판정)가 비어 있습니다');
    var cur = {};
    M.scopes[sid].items.forEach(function (it) { cur[it.id] = it; });
    var ids = Object.keys(ans), unknown = ids.filter(function (i) { return !Object.prototype.hasOwnProperty.call(cur, i); });
    if (unknown.length) throw fail('이 자료에 없는 항목 id 가 있습니다(' + unknown.length + '개: ' + unknown.slice(0, 5).join(', ') + ') — 다른 판의 앱에서 만든 파일일 수 있습니다');
    var good = {}, stale = [], notes = {};
    ids.forEach(function (iid) {
      var a = ans[iid];
      if (!isObj(a) || VERDICTS.indexOf(a.v) < 0) throw fail(iid + ': 판정(v)은 ' + VERDICTS.join('/') + ' 중 하나여야 합니다');
      if (typeof a.h !== 'string' || cps(a.h) < 1 || cps(a.h) > 20) throw fail(iid + ': 내용 표시(h)가 없습니다');
      var note = cleanText(a.m, MAX_NOTE, iid + ' 메모', false, false);
      if (a.h !== cur[iid].h) { stale.push(iid); return; }
      good[iid] = a.v;
      if (note) notes[iid] = note;
    });
    if (!Object.keys(good).length) throw fail('지금 자료와 내용이 맞는 판정이 하나도 없습니다(앱 판이 달라 모든 항목이 바뀐 듯합니다). 새 판의 앱에서 다시 판정해 주세요');
    var rs = refs.filter(function (r, i) { return refs.indexOf(r) === i; }).sort();
    return { scope: sid, reviewer: { name: name, affiliation: org, pub: rv.public }, refs: rs, refsOther: other, attested: sub.attested, created: created, answers: good, notes: notes, stale: stale };
  }

  // ── 동의·면허 열 값 읽기 · 시각 읽기 ──
  function researchYes(v) {
    v = normText(v).toLowerCase();
    if (!v || ['no', 'false', 'n', '0', 'x', '×', '아니오', '아니요'].indexOf(v) >= 0) return false;
    return !/^(비동의|미동의|동의하지|동의 안|동의안|아니)/.test(v);
  }
  function licenseYes(v) { return ['y', 'yes', '예', '네', '확인', '확인함', '확인완료', 'o', 'ㅇ', 'true', '1', 'v', '✓', '✔'].indexOf(normText(v).toLowerCase()) >= 0; }
  var TS = /^\s*(\d{4})\D+(\d{1,2})\D+(\d{1,2})(?:\D+?(오전|오후|AM|PM|am|pm)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
  var TS_US = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/;
  function parseTs(s) {
    s = s || '';
    var m = TS.exec(s), y, mo, dd, ap, hh, mi, ss;
    if (m) { y = +m[1]; mo = +m[2]; dd = +m[3]; ap = m[4]; hh = m[5]; mi = m[6]; ss = m[7]; }
    else {
      m = TS_US.exec(s);
      if (!m) return { d: null, secs: 0 };
      mo = +m[1]; dd = +m[2]; y = +m[3]; hh = m[4]; mi = m[5]; ss = m[6]; ap = m[7];
    }
    if (!validDate(y, mo, dd)) return { d: null, secs: 0 };
    var secs = 0;
    if (hh) {
      var h = +hh;
      if (ap) { h %= 12; if (ap === '오후' || ap.toLowerCase() === 'pm') h += 12; }
      secs = h * 3600 + (+mi) * 60 + (+(ss || 0));
    }
    return { d: y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + dd).slice(-2), secs: secs };
  }
  function weekStart(iso) {
    var p = iso.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    return addDays(iso, -((d.getUTCDay() + 6) % 7));
  }
  function weekly(dates, today, start) {
    if (!dates.length) return [];
    var ds = dates.slice().sort(), cnt = {};
    ds.forEach(function (d) { var w = weekStart(d); cnt[w] = (cnt[w] || 0) + 1; });
    var first = start && start < ds[0] ? start : ds[0], last = today && today > ds[ds.length - 1] ? today : ds[ds.length - 1];
    var w = weekStart(first), w1 = weekStart(last), cum = 0, out = [];
    while (w <= w1) { cum += cnt[w] || 0; out.push({ week: w, 'new': cnt[w] || 0, cum: cum }); w = addDays(w, 7); }
    return out;
  }

  // ── 통계(tools/review_research_report.py 와 같은 정의) ──
  function icviThreshold(n) { return n < 3 ? null : (n <= 5 ? 1.0 : 0.78); }
  function paAc1(units) {
    var us = units.filter(function (u) { return u.length >= 2; });
    if (!us.length) return { pa: null, ac1: null };
    var pa = 0, pi = {};
    us.forEach(function (u) {
      var r = u.length, c = {};
      u.forEach(function (v) { c[v] = (c[v] || 0) + 1; });
      var s = 0;
      Object.keys(c).forEach(function (k) { s += c[k] * (c[k] - 1); pi[k] = (pi[k] || 0) + c[k] / r; });
      pa += s / (r * (r - 1));
    });
    var n = us.length, pe = 0;
    pa /= n;
    Object.keys(pi).forEach(function (k) { var p = pi[k] / n; pe += p * (1 - p); });
    pe /= 2;
    return { pa: pa, ac1: pe >= 1 ? null : (pa - pe) / (1 - pe) };
  }
  function kripAlpha(units) {
    var us = units.filter(function (u) { return u.length >= 2; });
    if (!us.length) return null;
    var o = {}, nc = {}, n = 0, doSum = 0, de = 0;
    us.forEach(function (u) {
      var m = u.length;
      for (var i = 0; i < m; i++) for (var j = 0; j < m; j++) if (i !== j) { var k = u[i] + '|' + u[j]; o[k] = (o[k] || 0) + 1 / (m - 1); }
    });
    Object.keys(o).forEach(function (k) {
      var c = k.split('|')[0];
      nc[c] = (nc[c] || 0) + o[k]; n += o[k];
      if (k.split('|')[0] !== k.split('|')[1]) doSum += o[k];
    });
    var cs = Object.keys(nc);
    cs.forEach(function (c) { cs.forEach(function (k) { if (c !== k) de += nc[c] * nc[k]; }); });
    if (de === 0 || n <= 1) return null;
    return 1 - (n - 1) * doSum / de;
  }
  function scopeStats(items, ratings, label) {
    var rids = Object.keys(ratings).sort(), outItems = [], units = [], vt = { ok: 0, diff: 0, unsure: 0 };
    items.forEach(function (it) {
      var vs = [];
      rids.forEach(function (r) { if (Object.prototype.hasOwnProperty.call(ratings[r], it.id)) vs.push(ratings[r][it.id]); });
      var c = { ok: 0, diff: 0, unsure: 0 };
      vs.forEach(function (v) { c[v]++; vt[v]++; });
      var n = vs.length, th = icviThreshold(n), iv = n ? c.ok / n : null;
      var status = th === null ? 'na' : (iv + 1e-9 >= th ? 'pass' : 'fail');
      outItems.push({ id: it.id, no: it.no, label: it.label, n: n, ok: c.ok, diff: c.diff, unsure: c.unsure, icvi: iv, threshold: th, status: status });
      if (n >= 2) units.push(vs);
    });
    var ev = outItems.filter(function (i) { return i.status !== 'na'; });
    var ag = paAc1(units), cells = vt.ok + vt.diff + vt.unsure;
    var sum = 0, ua = 0;
    ev.forEach(function (i) { sum += i.icvi; if (i.icvi >= 1 - 1e-9) ua++; });
    return {
      label: label, n_items: items.length, n_raters: rids.length, cells: cells, completeness: (rids.length && items.length) ? cells / (rids.length * items.length) : null, verdicts: vt,
      evaluable_items: ev.length, scvi_ave: ev.length ? sum / ev.length : null, scvi_ua: ev.length ? ua / ev.length : null,
      items_below: ev.filter(function (i) { return i.status === 'fail'; }).map(function (i) { return i.no; }),
      agreement: { units: units.length, observed: ag.pa, ac1: ag.ac1, alpha: kripAlpha(units), prevalence_ok: cells ? vt.ok / cells : null }, items: outItems
    };
  }

  // 약사가 쓴 글(이름·소속·기타 자료·메모)을 모아 둔다 — 메일에 섞였는지 마지막에 검사하려고만 쓴다
  function harvest(obj, bag) {
    if (!isObj(obj)) return;
    var rv = obj.reviewer;
    if (isObj(rv)) ['name', 'affiliation'].forEach(function (k) { if (typeof rv[k] === 'string' && normText(rv[k])) bag[normText(rv[k])] = 1; });
    if (typeof obj.refs_other === 'string' && normText(obj.refs_other)) bag[normText(obj.refs_other)] = 1;
    if (isObj(obj.answers)) Object.keys(obj.answers).forEach(function (k) { var x = obj.answers[k]; if (isObj(x) && typeof x.m === 'string' && normText(x.m)) bag[normText(x.m)] = 1; });
  }

  /**
   * recs: [{text, ts, consent(true|false|null), license(true|false|null), row}] → { summary, ops, records }
   * summary 는 파이썬 도구의 summary.json 과 같은 열쇠를 씁니다(약사는 R번호로만 나옴).
   */
  function analyze(recs, M, today, opts) {
    opts = opts || {};
    var gates = opts.gates !== false, intake = { received: 0, rejected: {}, excluded_by_gate: {} }, acc = [], secrets = {}, records = [];
    function bump(o, k) { o[k] = (o[k] || 0) + 1; }
    recs.forEach(function (rec, idx) {
      intake.received++;
      var text = rec.text || '', R = { idx: idx, row: rec.row, ts: rec.ts, status: 'rejected', reason: null, rid: null, scope: null, n: 0, stale: 0 };
      records.push(R);
      if (!strip(text)) { bump(intake.rejected, 'empty'); R.reason = 'empty'; return; }
      if (utf8Len(text) > MAX_BYTES) { bump(intake.rejected, 'too_large'); R.reason = 'too_large'; return; }
      var obj;
      try { obj = JSON.parse(text); } catch (e) { bump(intake.rejected, 'json'); R.reason = 'json'; return; }
      harvest(obj, secrets);
      var clean;
      try { clean = validate(obj, M, today); }
      catch (e) { var rs = (e instanceof RError) ? reasonOf(e.message) : 'other'; bump(intake.rejected, rs); R.reason = rs; return; }
      R.scope = clean.scope; R.n = Object.keys(clean.answers).length; R.stale = clean.stale.length;
      if (gates) {
        var g = null;
        if (rec.consent == null || rec.license == null) g = 'gate_unknown'; else if (!rec.consent) g = 'research_consent'; else if (!rec.license) g = 'license';
        if (g) { bump(intake.excluded_by_gate, g); R.status = 'gated'; R.reason = g; return; }
      }
      var t = parseTs(rec.ts);
      R.status = 'ok';
      acc.push({ clean: clean, idx: idx, d: t.d, secs: t.secs, R: R });
    });
    acc.sort(function (a, b) {
      var ka = [a.clean.created, a.d || '0000-00-00', a.secs, a.idx], kb = [b.clean.created, b.d || '0000-00-00', b.secs, b.idx];
      for (var i = 0; i < 4; i++) if (ka[i] < kb[i]) return -1; else if (ka[i] > kb[i]) return 1;
      return 0;
    });
    var ids = {}, link = {}, nIds = 0, sids = Object.keys(M.scopes), ratings = {}, memos = {}, refs = {}, first = {};
    sids.forEach(function (s) { ratings[s] = {}; memos[s] = {}; refs[s] = {}; first[s] = {}; });
    acc.forEach(function (p) {
      var cl = p.clean, sid = cl.scope, key = normKey(cl.reviewer.name, cl.reviewer.affiliation);
      if (!Object.prototype.hasOwnProperty.call(ids, key)) { ids[key] = ++nIds; link[ids[key]] = { name: cl.reviewer.name, org: cl.reviewer.affiliation, scopes: {} }; }
      var n = ids[key];
      link[n].scopes[sid] = 1;
      var r = ratings[sid][n] || (ratings[sid][n] = {}), mm = memos[sid][n] || (memos[sid][n] = {});
      Object.keys(cl.answers).forEach(function (iid) {
        r[iid] = cl.answers[iid];
        if (Object.prototype.hasOwnProperty.call(cl.notes, iid)) mm[iid] = cl.notes[iid]; else delete mm[iid];
      });
      refs[sid][n] = cl.refs;
      var dd = p.d || cl.created;
      if (!first[sid][n] || dd < first[sid][n]) first[sid][n] = dd;
      p.R.rid = n;
    });
    var width = Math.max(2, String(nIds).length);
    function rid(n) { var s = String(n); while (s.length < width) s = '0' + s; return 'R' + s; }
    acc.forEach(function (p) { p.R.rid = rid(p.R.rid); });
    var allFirst = [];
    sids.forEach(function (s) { Object.keys(first[s]).forEach(function (n) { allFirst.push(first[s][n]); }); });
    var wFirst = allFirst.length ? allFirst.slice().sort()[0] : null;
    var scopes = {}, opsRatings = {}, opsMemos = {};
    sids.forEach(function (sid) {
      var rt = {};
      Object.keys(ratings[sid]).forEach(function (n) { rt[rid(+n)] = ratings[sid][n]; });
      var st = scopeStats(M.scopes[sid].items, rt, M.scopes[sid].label);
      var fd = [];
      Object.keys(first[sid]).forEach(function (n) { fd.push(first[sid][n]); });
      st.weekly = weekly(fd, today, wFirst);
      var nm = 0;
      Object.keys(memos[sid]).forEach(function (n) { nm += Object.keys(memos[sid][n]).length; });
      st.memos = { count: nm };
      scopes[sid] = st; opsRatings[sid] = rt;
      opsMemos[sid] = {};
      Object.keys(memos[sid]).forEach(function (n) { if (Object.keys(memos[sid][n]).length) opsMemos[sid][rid(+n)] = memos[sid][n]; });
    });
    var stale = 0;
    acc.forEach(function (p) { stale += p.clean.stale.length; });
    var opsLink = {};
    Object.keys(link).forEach(function (n) { opsLink[rid(+n)] = { name: link[n].name, org: link[n].org, scopes: Object.keys(link[n].scopes).sort(), first: Object.keys(first).filter(function (s) { return first[s][n]; }).map(function (s) { return first[s][n]; }).sort()[0] }; });
    var summary = {
      meta: { tool: 'review_inbox.gs', version: SCRIPT_VERSION_(), today: today, demo: !!opts.demo, gates: gates },
      intake: { received: intake.received, rejected: intake.rejected, excluded_by_gate: intake.excluded_by_gate, accepted_submissions: acc.length, raters: nIds, stale_answers: stale }, scopes: scopes
    };
    return { summary: summary, ops: { link: opsLink, memos: opsMemos, ratings: opsRatings, secrets: Object.keys(secrets) }, records: records };
  }
  function SCRIPT_VERSION_() { return typeof SCRIPT_VERSION === 'string' ? SCRIPT_VERSION : ''; }

  // ── 메일 글 · HTML(tools/review_research_report.py 의 email_text · email_html 과 같은 모양) ──
  function caution(n) {
    if (n === 0) return '분석할 약사 응답이 아직 없습니다.';
    if (n < 3) return '약사 ' + n + '명 — 3명 미만이라 I-CVI·일치도를 해석하지 않습니다. 판정 분포와 ‘다르다’ 목록만 참고하세요.';
    if (n <= 5) return '약사 ' + n + '명 — I-CVI 기준은 전원 동의(1.00)이고, 일치도 통계는 불안정합니다.';
    return '약사 ' + n + '명 — I-CVI 0.78 이상, S-CVI/Ave 0.90 이상을 기준으로 봅니다.';
  }
  function sumVals(o) { var s = 0; Object.keys(o).forEach(function (k) { s += o[k]; }); return s; }
  function topDiff(sc) {
    return sc.items.filter(function (i) { return i.diff > 0; }).sort(function (a, b) { return (b.diff - a.diff) || (a.no - b.no); }).slice(0, 8);
  }
  function emailSubject(S) {
    var m = S.meta, n = S.intake.raters;
    return (m.demo ? '[시험용·가짜 데이터] ' : '') + (m.gates ? '' : '[동의·면허 확인 안 함] ') + '[MedTerm-KR 약사검수 요약] ' + m.today + ' · ' + (m.gates ? '연구용 약사 ' + n + '명' : '약사 ' + n + '명');
  }
  function emailText(S) {
    var m = S.meta, it = S.intake, L = [];
    if (m.demo) L.push('※ ' + DEMO_NOTE);
    L.push('MedTerm-KR 약사 검수 연구용 요약 · ' + m.today);
    L.push('접수 ' + it.received + '건 → 분석 반영 ' + it.accepted_submissions + '건(약사 ' + it.raters + '명). 뺀 것: 형식 오류 ' + sumVals(it.rejected) + '건 · 동의·면허 확인 ' + sumVals(it.excluded_by_gate) + '건.');
    Object.keys(S.scopes).forEach(function (sid) {
      var sc = S.scopes[sid];
      L.push('', '■ ' + sc.label + ' — ' + caution(sc.n_raters));
      if (sc.n_raters) {
        var v = sc.verdicts, ag = sc.agreement;
        L.push('  판정 ' + sc.cells + '건: 맞다 ' + v.ok + ' · 다르다 ' + v.diff + ' · 모르겠다 ' + v.unsure);
        L.push('  S-CVI/Ave ' + fmt(sc.scvi_ave) + ' · S-CVI/UA ' + fmt(sc.scvi_ua) + ' · 일치율 ' + pct(ag.observed) + ' · AC1 ' + fmt(ag.ac1) + ' · α ' + fmt(ag.alpha));
        topDiff(sc).forEach(function (i) { L.push('  - ' + i.label + ': 다르다 ' + i.diff + '/' + i.n + '명'); });
      }
    });
    L.push('', '이 메일에는 이름·소속·메모·원본 글을 담지 않습니다.');
    return L.join('\n') + '\n';
  }
  var C_OK = '#2a78d6', C_DIFF = '#eb6834', C_UNS = '#898781';
  function barHtml(v) {
    var tot = v.ok + v.diff + v.unsure || 1, cells = '';
    [['ok', C_OK], ['diff', C_DIFF], ['unsure', C_UNS]].forEach(function (p) {
      if (v[p[0]]) cells += '<td width="' + (v[p[0]] / tot * 100).toFixed(2) + '%" bgcolor="' + p[1] + '" style="background:' + p[1] + ';height:14px;font-size:0;line-height:0">&nbsp;</td>';
    });
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>' + cells + '</tr></table>';
  }
  function stripHtml(items) {
    var col = { pass: C_OK, fail: C_DIFF, na: C_UNS }, cells = '';
    items.forEach(function (i) { cells += '<td width="10" bgcolor="' + col[i.status] + '" style="background:' + col[i.status] + ';width:10px;height:14px;font-size:0;line-height:0;border-right:1px solid #ffffff" title="' + i.no + '">&nbsp;</td>'; });
    return '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>' + cells + '</tr></table>';
  }
  function emailHtml(S) {
    var m = S.meta, it = S.intake, out = [];
    out.push('<div style="font:14px/1.6 -apple-system,\'Segoe UI\',\'Noto Sans KR\',\'Malgun Gothic\',sans-serif;color:#0b0b0b;max-width:640px;background:#ffffff;padding:8px">');
    if (m.demo) out.push('<p style="background:#fff3d6;color:#5b3b00;border:1px solid #e8c36a;border-radius:6px;padding:8px 12px;font-weight:bold">' + esc(DEMO_NOTE) + '</p>');
    if (!m.gates) out.push('<p style="background:#fff3d6;color:#5b3b00;padding:8px 12px;font-weight:bold">동의·면허 확인 없이 만든 결과입니다. 연구에는 쓰지 마세요.</p>');
    out.push('<h2 style="font-size:17px;margin:8px 0">MedTerm-KR 약사 검수 연구용 요약 · ' + esc(m.today) + '</h2>');
    out.push('<p style="margin:4px 0">접수 <b>' + it.received + '건</b> → 분석 반영 <b>' + it.accepted_submissions + '건(약사 ' + it.raters + '명)</b>. 뺀 것: 형식 오류 ' + sumVals(it.rejected) + '건 · 동의·면허 확인 ' + sumVals(it.excluded_by_gate) + '건. 사전 변경으로 세지 않은 판정 ' + it.stale_answers + '개.</p>');
    Object.keys(S.scopes).forEach(function (sid) {
      var sc = S.scopes[sid];
      out.push('<h3 style="font-size:15px;margin:18px 0 4px">' + esc(sc.label) + '</h3><p style="margin:2px 0;color:#52514e">' + esc(caution(sc.n_raters)) + '</p>');
      if (!sc.n_raters) return;
      var ag = sc.agreement, v = sc.verdicts;
      out.push(barHtml(v));
      out.push('<p style="margin:2px 0;font-size:12.5px;color:#52514e"><span style="color:' + C_OK + '">■</span> 맞다 ' + v.ok + ' · <span style="color:' + C_DIFF + '">■</span> 다르다 ' + v.diff + ' · <span style="color:' + C_UNS + '">■</span> 모르겠다 ' + v.unsure + ' (판정 ' + sc.cells + '건, 완성도 ' + pct(sc.completeness) + ')</p>');
      out.push('<p style="margin:6px 0">S-CVI/Ave <b>' + fmt(sc.scvi_ave) + '</b> · S-CVI/UA <b>' + fmt(sc.scvi_ua) + '</b> · 관찰 일치율 <b>' + pct(ag.observed) + '</b> · AC1 <b>' + fmt(ag.ac1) + '</b> · α <b>' + fmt(ag.alpha) + '</b></p>');
      out.push('<p style="margin:6px 0 2px;font-size:12.5px;color:#52514e">항목별 기준(1~' + sc.n_items + '번): <span style="color:' + C_OK + '">■</span> 충족 <span style="color:' + C_DIFF + '">■</span> 미달 <span style="color:' + C_UNS + '">■</span> 판정 3명 미만</p>');
      out.push(stripHtml(sc.items));
      var fl = topDiff(sc);
      if (fl.length) out.push('<p style="margin:8px 0 2px"><b>‘다르다’가 나온 항목</b>(많은 순, 최대 8개)</p><ul style="margin:2px 0;padding-left:20px">' + fl.map(function (i) { return '<li>' + esc(i.label) + ' — 다르다 ' + i.diff + '/' + i.n + '명</li>'; }).join('') + '</ul>');
    });
    out.push('<p style="margin:16px 0 4px;font-size:12.5px;color:#52514e">이 메일에는 이름·소속·메모·원본 글을 담지 않습니다. 자세한 내용은 분석 시트에서 확인하세요. 이 요약은 법률 자문이나 연구윤리 심의 결과가 아닙니다.</p></div>');
    return out.join('');
  }
  // 메일에 약사가 쓴 글이 섞였는지 본다(2자 이하는 우연히 겹쳐 제외; 사전·고정 문구에 원래 있는 글은 건너뜀). → 걸린 문자열 수
  function leakCount(texts, secrets, M) {
    var pub = [DEMO_NOTE];
    Object.keys(M.scopes).forEach(function (s) { pub.push(M.scopes[s].label); M.scopes[s].items.forEach(function (i) { pub.push(i.label); }); });
    Object.keys(REF_LABEL).forEach(function (k) { pub.push(REF_LABEL[k]); });
    Object.keys(REASON_LABEL).forEach(function (k) { pub.push(REASON_LABEL[k]); });
    Object.keys(GATE_LABEL).forEach(function (k) { pub.push(GATE_LABEL[k]); });
    Object.keys(V_LABEL).forEach(function (k) { pub.push(V_LABEL[k]); });
    pub.push('기타', '미기재', '약국', '병원·의원', '제약·유통', '학교·연구');
    var pubText = pub.join('\n'), hay = texts.join('\n'), n = 0;
    secrets.forEach(function (s) { if (cps(s) >= 3 && pubText.indexOf(s) < 0 && hay.indexOf(s) >= 0) n++; });
    return n;
  }
  function validEmail(s) { return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s); }

  // ── 앱 접수(웹 앱 doPost): 보낸 글 → 확인서 검증 + 동의 기록 확인 → 시트에 적을 한 줄. 어느 하나라도 어긋나면 적지 않는다. ──
  // 앱이 보내는 글: {"kind":"medterm-kr-submit/1","text":"<확인서 글 그대로>"}. 확인서의 consent 칸({version, collect, research, draft?})이 동의 기록이다.
  var INTAKE_KIND = 'medterm-kr-submit/1';
  var MAX_BODY = 200000;   // 보낸 글 전체(문자 수)
  var MAX_CELL = 45000;    // 시트 한 칸은 5만 자까지라 여유를 둔다
  var VERSION_OK = /^[A-Za-z0-9._-]{1,40}$/;
  function deny(code, msg) { return { ok: false, code: code, msg: msg }; }
  function intake(body, M, today, opts) {
    opts = opts || {};
    if (!opts.open || !opts.version) return deny('closed', '지금은 앱으로 받지 않습니다. 확인서를 파일로 저장해 이 앱을 알려 드린 MedIT 담당자에게 보내 주세요.');
    if (typeof body !== 'string' || !body.length) return deny('bad_request', '보낸 내용이 비어 있습니다. 앱을 새로 고친 뒤 다시 시도해 주세요.');
    if (body.length > MAX_BODY) return deny('too_large', '확인서가 너무 큽니다. 파일로 저장해 MedIT 담당자에게 보내 주세요.');
    var env, sub;
    try { env = JSON.parse(body); } catch (e) { return deny('bad_request', '보낸 내용을 읽지 못했습니다. 앱을 새로 고친 뒤 다시 시도해 주세요.'); }
    if (!isObj(env) || env.kind !== INTAKE_KIND || typeof env.text !== 'string') return deny('bad_request', '보낸 내용의 모양이 맞지 않습니다. 앱을 새로 고친 뒤 다시 시도해 주세요.');
    try { sub = JSON.parse(env.text); } catch (e) { return deny('invalid', '확인서 글을 읽지 못했습니다.'); }
    try { validate(sub, M, today); } catch (e) { return deny('invalid', '확인서가 형식에 맞지 않습니다: ' + (e instanceof RError ? String(e.message).slice(0, 160) : '형식 오류')); }
    var c = sub.consent;
    if (!isObj(c) || c.collect !== true || typeof c.research !== 'boolean') return deny('no_consent', '동의 기록이 없는 확인서입니다. 앱의 동의서를 읽고 표시한 뒤 다시 보내 주세요.');
    if (c.draft === true) return deny('draft', '동의서가 확정되기 전에 만든 확인서라 받지 않습니다.');
    if (typeof c.version !== 'string' || !VERSION_OK.test(c.version) || c.version !== opts.version) return deny('version', '동의서가 바뀌었습니다. 앱을 새로 고치고 동의서를 다시 읽은 뒤 보내 주세요.');
    var compact = JSON.stringify(sub);
    if (compact.length > MAX_CELL) return deny('too_large', '확인서가 너무 큽니다. 파일로 저장해 MedIT 담당자에게 보내 주세요.');
    var app = typeof sub.app === 'string' && /^[0-9A-Za-z._-]{1,20}$/.test(sub.app) ? sub.app : '';
    return { ok: true, row: { json: compact, collect: '동의', research: c.research ? '동의' : '비동의', version: c.version, app: app } };
  }

  return {
    analyze: analyze, validate: validate, intake: intake, parseTs: parseTs, researchYes: researchYes, licenseYes: licenseYes, normText: normText, normKey: normKey, reasonOf: reasonOf,
    emailText: emailText, emailHtml: emailHtml, emailSubject: emailSubject, leakCount: leakCount, validEmail: validEmail, fmt: fmt, pct: pct, caution: caution,
    REASON_LABEL: REASON_LABEL, GATE_LABEL: GATE_LABEL, V_LABEL: V_LABEL, SCHEMA: SCHEMA, RError: RError, DEMO_NOTE: DEMO_NOTE, INTAKE_KIND: INTAKE_KIND
  };
})();

// ═════════════ 구글 서비스 연결 — 시트·메일·트리거 ═════════════
var PROP = { TO: 'SUMMARY_TO', RESP: 'RESPONSE_SHEET', ANALYSIS: 'ANALYSIS_SSID', LAST_MAIL: 'LAST_MAIL', DEMO: 'DEMO_MODE',
  OPEN: 'INTAKE_OPEN', VERSION: 'CONSENT_VERSION', SS: 'SS_ID', DIRTY: 'INTAKE_DIRTY', MAX_ROWS: 'INTAKE_MAX_ROWS',
  RESEARCHERS: 'RESEARCHERS', RECIPIENTS: 'RECIPIENTS', RLOG: 'RESEARCHER_LOG', RATE: 'AUTH_RATE', MAIL_DAY: 'MAIL_DAY', OTP_DAY: 'OTP_DAY', DOMAINS: 'RECIPIENT_DOMAINS' };
var SHEET = { check: '접수 점검', link: '가명표(운영자만)', memo: '메모(운영자만)', resp: '응답' };
// 앱 접수가 적는 ‘응답’ 시트의 머리글. 점검 코드가 열 제목의 글자(‘연구 이용’+‘동의’, ‘면허’)로 열을 찾으므로 1단계 동의 열 제목에는 ‘연구 이용’을, 다른 열에는 ‘면허’를 넣지 않는다.
var RESP_HEADER = ['타임스탬프', '확인서(JSON)', '개인정보 수집·이용 동의(1단계·필수)', '연구 이용 동의(2단계·선택)', '면허확인(운영자 기입)', '접수 경로', '동의서 버전', '앱 버전'];
// 연구자가 등록한 주소로 가는 요약 메일 끝에만 붙는 안내(운영자 주소로 가는 메일에는 없음)
var FOOT_TEXT = '\n— 이 메일은 연구자 페이지에서 등록된 주소로 보냈습니다. 그만 받으려면 연구자 페이지에서 이 주소를 지우거나 운영자에게 알려 주세요.\n';
var FOOT_HTML = '<p style="margin:8px 0 0;font-size:12.5px;color:#52514e">이 메일은 연구자 페이지에서 등록된 주소로 보냈습니다. 그만 받으려면 연구자 페이지에서 이 주소를 지우거나 운영자에게 알려 주세요.</p>';
var GATE_NOTE = {
  research_consent: '연구 이용 동의 없음 — 분석에서 제외', license: '면허 확인 전 — 면허확인 열에 Y 를 적으면 다음 점검부터 반영',
  gate_unknown: '연구 이용 동의·면허확인 열을 찾지 못함 — 열 이름을 확인하세요'
};

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('MedTerm-KR')
    .addItem('처음 설정(받을 주소·자동 실행)', 'setup')
    .addItem('앱 접수 열기(동의서 버전 맞추기)', 'openIntake')
    .addItem('앱 접수 닫기', 'closeIntake')
    .addItem('앱 접수 상태 보기', 'intakeStatus')
    .addItem('지금 점검·분석 새로 만들기', 'refreshNow')
    .addItem('요약 메일 지금 보내기', 'sendSummaryNow')
    .addSubMenu(ui.createMenu('연구자 페이지')
      .addItem('연구자 지정(메일 인증 허용)', 'addResearcher')
      .addItem('연구자 지정 취소', 'removeResearcher')
      .addItem('받는 주소 지우기(운영자)', 'removeRecipient')
      .addItem('연구자 페이지 현황·주소', 'researcherStatus'))
    .addToUi();
}

/** 처음 한 번: 요약 메일 받을 주소를 적고, 응답이 올 때마다·매주 월요일 아침 자동 실행을 만든다. */
function setup() {
  var ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties();
  var cur = props.getProperty(PROP.TO) || '';
  var r = ui.prompt('요약 메일 받을 주소(한 개)', '지금: ' + (cur || '없음') + '\n주소를 적어 주세요. 비워 두면 그대로 둡니다.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var to = String(r.getResponseText() || '').trim();
  if (to) {
    if (!RI.validEmail(to)) { ui.alert('메일 주소 모양이 아닙니다. 다시 실행해 주세요.'); return; }
    props.setProperty(PROP.TO, to);
  }
  var ss0 = SpreadsheetApp.getActiveSpreadsheet(), hasForm = false;
  props.setProperty(PROP.SS, ss0.getId());   // 웹 앱(doPost)은 ‘지금 열린 시트’가 없을 수 있어 시트 번호를 적어 둔다
  try { hasForm = !!ss0.getFormUrl(); } catch (e) { hasForm = false; }
  // 구글 폼이 연결돼 있지 않고 확인서 글이 든 다른 시트도 없는 새 시트 파일 = 앱 접수용: ‘응답’ 시트를 만들고 점검이 그 시트를 읽게 한다(이미 정해 둔 시트 이름은 건드리지 않음)
  var appRoute = !hasForm && !otherResponseSheets_(ss0).length;
  if (appRoute) {
    ensureResponseSheet_(ss0);
    if (!props.getProperty(PROP.RESP)) props.setProperty(PROP.RESP, SHEET.resp);
  }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'onFormSubmitCheck' || f === 'weeklySummary' || f === 'hourlyCheck') ScriptApp.deleteTrigger(t);
  });
  if (hasForm) ScriptApp.newTrigger('onFormSubmitCheck').forSpreadsheet(ss0).onFormSubmit().create();   // 구글 폼이 연결돼 있을 때만(응답이 올 때마다)
  ScriptApp.newTrigger('hourlyCheck').timeBased().everyHours(1).create();                              // 앱 접수: 새 응답이 있으면 한 시간 안에 점검(없으면 아무것도 안 함)
  ScriptApp.newTrigger('weeklySummary').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
  refresh_(false);
  ui.alert('설정했습니다. 새 응답은 점검하고(' + (hasForm ? '구글 폼은 올 때마다, ' : '') + '앱 접수는 한 시간 안에), 매주 월요일 아침 9시쯤 ' + (props.getProperty(PROP.TO) || '(받을 주소 없음 — 다시 설정해 주세요)') + ' 로 요약을 보냅니다.' +
    (appRoute ? '\n앱으로 받으려면: ① 오른쪽 위 ‘배포’ → 새 배포 → 웹 앱(실행: 나, 액세스: 모든 사용자)으로 배포해 주소를 앱에 넣고 ② 메뉴 ‘앱 접수 열기’에서 동의서 버전을 적어 주세요.' : '') +
    (hasForm ? '\n※ 구글 폼이 연결된 시트입니다. 앱 접수와 한 시트 파일에서 섞어 쓰지 마세요.' : ''));
}
/** 구글이 그 함수의 자동 실행을 돌릴 때만 true. 자동 실행은 이벤트에 자기 번호(triggerUid)를 담아 보내고, 그 번호가 이 프로젝트에 설치된 자동 실행 중 “이 함수(fn)를 돌리는 것”의 번호와 같아야 한다(다른 함수의 자동 실행 번호로는 통하지 않는다).
 *  이름 끝에 밑줄이 없는 함수는 웹 앱 화면의 google.script.run 으로 아무나 부를 수 있으므로, 메일을 보내거나 시트를 다시 쓰는 자동 실행 함수는 이 확인을 거친다. */
function fromTrigger_(e, fn) {
  var uid = e && typeof e === 'object' ? e.triggerUid : null;
  if (uid === null || uid === undefined || uid === '') return false;
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) if (String(ts[i].getUniqueId()) === String(uid) && ts[i].getHandlerFunction() === fn) return true;
  return false;
}
function notTrigger_(name) { Logger.log(name + ': 자동 실행이 아닌 곳에서 불려 아무것도 하지 않았습니다 — 메뉴 MedTerm-KR 를 쓰세요'); }
function onFormSubmitCheck(e) { if (!fromTrigger_(e, 'onFormSubmitCheck')) return notTrigger_('onFormSubmitCheck'); refresh_(false); }
function weeklySummary(e) { if (!fromTrigger_(e, 'weeklySummary')) return notTrigger_('weeklySummary'); refresh_(true); }
/** 앱 접수로 새 응답이 들어왔을 때만(표시가 있을 때) 점검·분석을 새로 만든다. 한 시간마다 도는 자동 실행이며, 메일은 보내지 않는다. */
function hourlyCheck(e) {
  if (!fromTrigger_(e, 'hourlyCheck')) return notTrigger_('hourlyCheck');
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty(PROP.DIRTY) !== '1') return;
  p.deleteProperty(PROP.DIRTY);
  try { refresh_(false); } catch (e) { p.setProperty(PROP.DIRTY, '1'); throw e; }
}
function refreshNow() {
  var ui = SpreadsheetApp.getUi();
  try { refresh_(false); } catch (e) { ui.alert('점검·분석을 끝내지 못했습니다: ' + (e && e.message ? e.message : e)); return; }
  ui.alert('점검·분석을 새로 만들었습니다. 접수 점검 시트와 분석 시트 파일을 보세요.');
}
function sendSummaryNow() {
  var ui = SpreadsheetApp.getUi(), r;
  try { r = refresh_(true); } catch (e) { ui.alert('메일을 보내지 못했습니다: ' + (e && e.message ? e.message : e)); return; }
  ui.alert(r && r.mailSent ? '요약 메일을 보냈습니다.' : '메일을 보내지 않았습니다: ' + ((r && r.mailNote) || '이유 불명'));
}

// ═════════════ 앱 접수(웹 앱) — 앱 화면의 동의서를 거쳐 ‘보내기’로 온 확인서를 시트에 적는다 ═════════════
/** 시트(웹 앱은 ‘지금 열린 시트’가 없을 수 있어 처음 설정 때 적어 둔 번호로 연다) */
function intakeSs_(props) {
  var id = props.getProperty(PROP.SS);
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function ensureResponseSheet_(ss) {
  var sh = ss.getSheetByName(SHEET.resp) || ss.insertSheet(SHEET.resp);
  if (sh.getLastRow() < 1) {
    ensureSize_(sh, 1, RESP_HEADER.length);
    sh.getRange(1, 1, 1, RESP_HEADER.length).setValues([RESP_HEADER]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function isOpen_(props) { return props.getProperty(PROP.OPEN) === '1' && !!props.getProperty(PROP.VERSION); }
/** ‘응답’·점검 시트 말고, 확인서 글이 이미 든 시트의 이름(구글 폼 응답 시트나 붙여 넣은 시트). 앱 접수와 섞여 한쪽이 점검에서 빠지는 일을 막으려고 본다. */
function otherResponseSheets_(ss) {
  var out = [];
  ss.getSheets().forEach(function (sh) {
    var nm = sh.getName();
    if (nm === SHEET.resp || nm === SHEET.check || nm === SHEET.link || nm === SHEET.memo) return;
    var rows = sh.getDataRange().getValues();
    if (rows.length > 1 && rows.some(function (r) { return r.some(function (c) { return typeof c === 'string' && c.indexOf(RI.SCHEMA) >= 0; }); })) out.push(nm);
  });
  return out;
}

/** 메뉴: 앱 접수 열기. 앱의 동의서 칸 아래에 적힌 ‘동의서 버전’을 그대로 적어야 열린다(앱과 다른 버전의 확인서는 받지 않는다). */
function openIntake() {
  var ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties(), cur = props.getProperty(PROP.VERSION) || '';
  var r = ui.prompt('앱 접수 열기 — 동의서 버전', '앱의 동의서 칸 아래에 적힌 ‘동의서 버전’(예: c-3fa9b2c10d)을 그대로 적어 주세요. 앱과 버전이 다른 확인서는 받지 않습니다.\n지금: ' + (cur || '없음'), ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var v = String(r.getResponseText() || '').trim();
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(v)) { ui.alert('버전 모양이 아닙니다(영문·숫자·점·밑줄·줄표 3~40자). 다시 실행해 주세요.'); return; }
  props.setProperty(PROP.SS, props.getProperty(PROP.SS) || SpreadsheetApp.getActiveSpreadsheet().getId());
  var ss = intakeSs_(props), others = otherResponseSheets_(ss);
  ensureResponseSheet_(ss);
  props.setProperty(PROP.RESP, SHEET.resp);   // 점검·분석은 ‘응답’ 시트를 읽는다(앱으로 받은 줄이 다른 시트에 가려지지 않게)
  props.setProperty(PROP.VERSION, v);
  props.setProperty(PROP.OPEN, '1');
  ui.alert('앱 접수를 열었습니다(동의서 버전 ' + v + ').' + (props.getProperty(PROP.DEMO) === '1' ? '\n※ DEMO_MODE 가 켜져 있어 받은 줄에 ‘앱(시험)’ 표시가 붙습니다. 진짜 응답을 받기 전에 이 속성을 지우세요.' : '') +
    (others.length ? '\n※ 다른 시트(' + others.join(', ') + ')에도 확인서 글이 있습니다. 점검·분석은 ‘응답’ 시트만 읽으므로 그 시트의 응답은 빠집니다 — 한 시트 파일에서는 한 가지 방식만 쓰세요.' : '') +
    '\n웹 앱 배포 주소가 앱에 들어 있어야 약사님이 보낼 수 있습니다.');
}
function closeIntake() {
  var ui = SpreadsheetApp.getUi();
  PropertiesService.getScriptProperties().setProperty(PROP.OPEN, '0');
  ui.alert('앱 접수를 닫았습니다. 지금부터 앱에서 보내는 확인서는 받지 않습니다(이미 받은 줄은 그대로).');
}
function intakeStatus() {
  var ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties(), sh = intakeSs_(props).getSheetByName(SHEET.resp);
  var n = sh ? Math.max(0, sh.getLastRow() - 1) : 0;
  ui.alert('앱 접수: ' + (isOpen_(props) ? '열려 있음' : '닫혀 있음') + '\n동의서 버전: ' + (props.getProperty(PROP.VERSION) || '없음') + '\n받은 줄: ' + n + '줄 · 한도 ' + (+(props.getProperty(PROP.MAX_ROWS) || 3000) || 3000) +
    (props.getProperty(PROP.DEMO) === '1' ? '\n※ 시험 모드(DEMO_MODE=1)' : '') + '\n(웹 앱으로 배포했는지는 이 메뉴에서 알 수 없습니다. 오른쪽 위 배포 → 배포 관리에서 확인하세요.)');
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
/** 웹 앱 주소를 브라우저로 열면: 그대로면 접수가 열렸는지만 알려 주고(시트 내용은 돌려주지 않음), 주소 끝에 ?page=researcher 가 있으면 연구자 페이지를 보여 준다. */
function doGet(e) {
  var page = e && e.parameter && typeof e.parameter.page === 'string' ? e.parameter.page : '';
  if (page === 'researcher') return HtmlService.createHtmlOutput(RESEARCHER_HTML).setTitle('MedTerm-KR 연구자 페이지').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  return json_({ ok: true, kind: 'medterm-kr-intake/1', open: isOpen_(PropertiesService.getScriptProperties()) });
}
/** 앱의 ‘보내기’가 부르는 곳. 검사에 통과한 확인서만 ‘응답’ 시트에 한 줄 적고, 어긋나면 이유 코드만 돌려준다(시트 내용은 돌려주지 않음). */
function doPost(e) { return json_(intakeRun_(e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '')); }
function intakeRun_(body) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, code: 'busy', msg: '지금 접수가 몰려 있습니다. 잠시 뒤 다시 보내 주세요.' }; }
  try {
    var props = PropertiesService.getScriptProperties();
    var tz = Session.getScriptTimeZone(), now = new Date();
    var r = RI.intake(body, MANIFEST, Utilities.formatDate(now, tz, 'yyyy-MM-dd'), { open: props.getProperty(PROP.OPEN) === '1', version: props.getProperty(PROP.VERSION) || '' });
    if (!r.ok) return r;
    var sh = ensureResponseSheet_(intakeSs_(props)), last = sh.getLastRow();
    var cap = +(props.getProperty(PROP.MAX_ROWS) || 3000) || 3000;
    if (last - 1 >= cap) return { ok: false, code: 'full', msg: '접수 한도에 도달했습니다. 확인서를 파일로 저장해 MedIT 담당자에게 보내 주세요.' };
    var ts = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss');
    var row = [ts, r.row.json, r.row.collect, r.row.research, '', props.getProperty(PROP.DEMO) === '1' ? '앱(시험)' : '앱', r.row.version, r.row.app];
    ensureSize_(sh, last + 1, RESP_HEADER.length);
    var rg = sh.getRange(last + 1, 1, 1, row.length);
    rg.setNumberFormat('@');   // 약사가 쓴 글이 수식으로 읽히지 않게 글자 서식으로 적는다
    rg.setValues([row]);
    props.setProperty(PROP.DIRTY, '1');   // 한 시간 안에 점검·분석이 새로 만들어짐(hourlyCheck)
    return { ok: true, n: last, at: ts.slice(0, 16) };
  } catch (err) {
    Logger.log('앱 접수 오류: ' + err);
    return { ok: false, code: 'server', msg: '접수 중 오류가 났습니다. 확인서를 파일로 저장해 MedIT 담당자에게 보내 주세요.' };
  } finally { lock.releaseLock(); }
}

// ═════════════ 연구자 페이지 — 연구자가 메일 인증을 거쳐 요약 메일 받을 주소를 직접 등록·삭제 ═════════════
// 흐름: ① 운영자가 메뉴로 ‘연구자’ 메일 주소를 지정(RESEARCHERS) → ② 연구자가 웹 앱 주소 끝에 ?page=researcher 를 붙여 열고 자기 주소로 인증 번호(6자리)를 받아 입력(로그인) →
//       ③ 받을 주소를 추가(자기 주소는 바로, 다른 주소는 그 주소로 간 인증 번호까지 받아 입력해야)·삭제(RECIPIENTS, 최대 5개). 매주 요약 메일은 운영자 주소(SUMMARY_TO)와 이 주소들에 한 통씩 따로 간다.
// 이 페이지는 확인서·분석 내용을 보여 주지 않는다. 인증 번호·로그인 표는 캐시에 해시로만 두고, 지정·등록·기록은 스크립트 속성에 둔다. 인증 메일은 하루 20통, 같은 주소에는 한 시간 3번까지.
// 주의: 이름 끝에 밑줄이 없는 함수는 웹 앱 화면의 google.script.run 으로 누구나 부를 수 있다 →
//       (1) 메뉴 함수는 맨 앞에서 getUi() 를 불러 시트 화면 밖에서는 아무것도 바꾸기 전에 오류가 나게 하고 (2) 자동 실행 함수는 구글이 넘긴 자동 실행 번호를 확인하며 (3) researcherApi 는 로그인한 연구자만 바꾸게 한다.
var RLIM = { codeTtl: 600, tries: 5, perHour: 3, otpPerDay: 20, mailPerDay: 60, sessIdle: 1800, sessMax: 7200, maxRecipients: 5, maxResearchers: 3, logKeep: 40, bodyMax: 2000 };

function jget_(props, key, dflt) {
  var s = props.getProperty(key);
  if (!s) return dflt;
  try { var v = JSON.parse(s); return v === null || v === undefined ? dflt : v; } catch (e) { return dflt; }
}
function jset_(props, key, v) { props.setProperty(key, JSON.stringify(v)); }
function today_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function trim_(x) { return String(x).trim(); }
/** 메일 주소를 소문자로 바꿔 검사한다(모양이 아니면 ''). 쉼표·공백·꺾쇠·여러 개·너무 긴 글은 모두 거른다 — 이 글이 그대로 메일 보내기에 쓰이기 때문. */
function normEmail_(s) {
  if (typeof s !== 'string') return '';   // 글자가 아닌 값(숫자·배열·객체)은 주소로 보지 않는다
  s = s.trim().toLowerCase();
  if (s.length < 6 || s.length > 100) return '';
  if (!/^[a-z0-9][a-z0-9._+-]*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(s)) return '';
  if (s.indexOf('..') >= 0 || !RI.validEmail(s)) return '';
  return s;
}
function maskEmail_(a) {
  var p = String(a).split('@'), l = p[0] || '';
  return (l.length <= 2 ? l.charAt(0) : l.slice(0, 2)) + '***@' + (p[1] || '');
}
function sha_(s) {   // 구글의 digest 는 부호 있는 바이트(-128~127)를 돌려주므로 0~255 로 바꿔 16진수로
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8), o = '';
  for (var i = 0; i < b.length; i++) o += ('0' + ((b[i] + 256) % 256).toString(16)).slice(-2);
  return o;
}
function rnd_(n) { var s = ''; while (s.length < n) s += Utilities.getUuid().replace(/-/g, ''); return s.slice(0, n); }
function code6_() { return ('00000' + (parseInt(rnd_(12), 16) % 1000000)).slice(-6); }

function researchers_(props) {
  var out = [], raw = jget_(props, PROP.RESEARCHERS, []);
  if (!Array.isArray(raw)) raw = [];
  raw.forEach(function (a) { var n = typeof a === 'string' ? normEmail_(a) : ''; if (n && out.indexOf(n) < 0) out.push(n); });
  return out.slice(0, RLIM.maxResearchers);
}
function recipients_(props) {
  var out = [], seen = {}, raw = jget_(props, PROP.RECIPIENTS, []);
  if (!Array.isArray(raw)) raw = [];
  raw.forEach(function (r) {
    var n = r && typeof r.a === 'string' ? normEmail_(r.a) : '';
    if (n && !seen[n]) { seen[n] = 1; out.push({ a: n, by: typeof r.by === 'string' ? normEmail_(r.by) : '', at: typeof r.at === 'string' && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(r.at) ? r.at : '' }); }   // 손으로 고친 값이 화면·삭제 기준에 섞이지 않도록 모양을 맞춘다
  });
  return out.slice(0, RLIM.maxRecipients);
}
function domainsOf_(props) { return String(props.getProperty(PROP.DOMAINS) || '').toLowerCase().split(',').map(trim_).filter(function (x) { return x; }); }
function domainOk_(props, a) { var d = domainsOf_(props); return !d.length || d.indexOf(a.split('@')[1]) >= 0; }
function rlog_(props, text) {
  var L = jget_(props, PROP.RLOG, []);
  if (!Array.isArray(L)) L = [];
  L.push(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') + ' ' + text);
  jset_(props, PROP.RLOG, L.slice(-RLIM.logKeep));
}
/** 같은 열쇠가 한 시간에 limit 번을 넘으면 false(넘지 않으면 이번 시각을 적고 true). 지정된 연구자 주소 때만 부르므로 아무 주소나 넣어 속성이 불어나지 않는다. */
function rateOk_(props, key, now, limit) {
  var st = jget_(props, PROP.RATE, {}), cut = now - 3600000, out = {}, k;
  if (!st || typeof st !== 'object' || Array.isArray(st)) st = {};
  for (k in st) {
    if (Object.prototype.hasOwnProperty.call(st, k) && Array.isArray(st[k])) {
      var keep = st[k].filter(function (t) { return typeof t === 'number' && t > cut; });
      if (keep.length) out[k] = keep;
    }
  }
  var a = out[key] || [];
  if (a.length >= limit) { jset_(props, PROP.RATE, out); return false; }
  a.push(now); out[key] = a; jset_(props, PROP.RATE, out);
  return true;
}
/** 하루 상한: 오늘 쓴 횟수가 cap 이상이면 false, 아니면 1 올리고 true */
function dayCap_(props, key, day, cap) {
  var p = String(props.getProperty(key) || '').split(':'), n = p[0] === day ? (+p[1] || 0) : 0;
  if (n >= cap) return false;
  props.setProperty(key, day + ':' + (n + 1));
  return true;
}
function withLock_(ms, fn, onBusy) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(ms); } catch (e) { return onBusy(); }
  try { return fn(); } finally { lock.releaseLock(); }
}

/** 모든 메일은 여기로만 나간다(받는 주소는 한 개 · 하루 60통 상한 · 첨부·참조 없음). kind: 'summary'(주간 요약) | 'otp'(인증 번호) */
function sendMail_(kind, to, subject, body, html, name) {
  var props = PropertiesService.getScriptProperties();
  if (!RI.validEmail(to)) throw new Error('받는 주소 모양이 이상합니다');
  if (!dayCap_(props, PROP.MAIL_DAY, today_(), RLIM.mailPerDay)) throw new Error('하루 메일 한도(' + RLIM.mailPerDay + '통)에 도달했습니다');
  var msg = { to: to, subject: subject, body: body, name: name };
  if (html) msg.htmlBody = html;
  MailApp.sendEmail(msg);
}
function loginMail_(code) {
  return { subject: '[MedTerm-KR] 연구자 페이지 인증 번호',
    body: 'MedTerm-KR 연구자 페이지 인증 번호: ' + code + '\n\n연구자 페이지에 ' + Math.round(RLIM.codeTtl / 60) + '분 안에 입력하세요(틀려도 ' + RLIM.tries + '번까지 다시 해 볼 수 있습니다).\n' +
      '본인이 요청하지 않았다면 이 메일을 무시하세요. 인증 번호는 다른 사람에게 알려 주지 마세요.\n' };
}
function addMail_(code, by) {
  return { subject: '[MedTerm-KR] 요약 메일 받을 주소 등록 인증 번호',
    body: 'MedTerm-KR 약사 확인서 주간 요약 메일을 이 주소로 받겠다는 등록 요청이 있었습니다.\n요청한 연구자: ' + maskEmail_(by) + '\n\n인증 번호: ' + code + '\n\n' +
      '이 주소로 받기를 원하면 요청한 연구자에게 위 번호를 알려 주세요(' + Math.round(RLIM.codeTtl / 60) + '분 안). 번호를 알려 주지 않으면 등록되지 않습니다. 모르는 요청이면 무시하세요.\n' +
      '받게 될 메일: 매주 월요일 아침의 약사 확인서 접수 현황·판정 분포·일치도 집계. 이름·소속·메모·원본 글은 들어 있지 않습니다. 언제든 연구자 페이지에서 지울 수 있습니다.\n' };
}

// 인증 번호: 캐시에는 번호 자체가 아니라 (임의 소금 + 번호)의 해시만 둔다. 5번 틀리면 지우고, 10분이 지나면 캐시가 알아서 지운다. 캐시가 일찍 비워져도 ‘번호가 맞지 않음’으로 닫힐 뿐 열리지 않는다.
function codeKey_(kind, who, target) { return 'otp:' + kind + ':' + sha_(who + '|' + target).slice(0, 40); }
function issueCode_(cache, kind, who, target, now) {
  var code = code6_(), salt = rnd_(16);
  cache.put(codeKey_(kind, who, target), JSON.stringify({ s: salt, h: sha_(salt + ':' + code), n: 0, t: now }), RLIM.codeTtl);
  return code;
}
function checkCode_(cache, kind, who, target, code, now) {
  var key = codeKey_(kind, who, target), raw = cache.get(key), st, left;
  if (!raw) return 'bad';
  try { st = JSON.parse(raw); } catch (e) { cache.remove(key); return 'bad'; }
  code = String(code === null || code === undefined ? '' : code).replace(/\s+/g, '');
  if (!st || typeof st.s !== 'string' || typeof st.h !== 'string' || !(st.n < RLIM.tries)) { cache.remove(key); return 'bad'; }
  if (/^[0-9]{6}$/.test(code) && sha_(st.s + ':' + code) === st.h) { cache.remove(key); return 'ok'; }
  st.n += 1;
  left = RLIM.codeTtl - Math.floor((now - st.t) / 1000);
  if (st.n >= RLIM.tries || left < 1) cache.remove(key); else cache.put(key, JSON.stringify(st), left);
  return 'bad';
}
// 로그인 표(세션): 임의의 긴 글(토큰)을 화면에 주고, 캐시에는 그 해시를 열쇠로 두는 연구자 주소·시작 시각만 둔다. 쓰지 않고 30분이면 끝나고, 처음부터 2시간이면 끝난다. 지정이 취소된 연구자의 표는 바로 쓸 수 없게 된다.
function newSession_(cache, addr, now) {
  var tok = rnd_(48);
  cache.put('sess:' + sha_(tok), JSON.stringify({ a: addr, t: now }), RLIM.sessIdle);
  return tok;
}
function readSession_(cache, tok, props, now) {
  if (typeof tok !== 'string' || !/^[0-9a-f]{48}$/.test(tok)) return '';
  var key = 'sess:' + sha_(tok), raw = cache.get(key), st;
  if (!raw) return '';
  try { st = JSON.parse(raw); } catch (e) { cache.remove(key); return ''; }
  if (!st || typeof st.a !== 'string' || typeof st.t !== 'number' || now - st.t > RLIM.sessMax * 1000 || researchers_(props).indexOf(st.a) < 0) { cache.remove(key); return ''; }
  cache.put(key, raw, RLIM.sessIdle);
  return st.a;
}

function stateOf_(props, me) {
  var to = normEmail_(props.getProperty(PROP.TO) || '');
  return { ok: true, me: me, operator: to ? maskEmail_(to) : '', recipients: recipients_(props).map(function (r) { return { a: r.a, at: r.at }; }),
    max: RLIM.maxRecipients, domains: domainsOf_(props), idleMin: Math.round(RLIM.sessIdle / 60) };
}
function addRecipient_(props, a, by, now) {
  var list = recipients_(props);
  list.push({ a: a, by: by, at: Utilities.formatDate(new Date(now), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') });
  jset_(props, PROP.RECIPIENTS, list);
  rlog_(props, '받는 주소 추가 ' + a + ' (등록 ' + by + ')');
  var s = stateOf_(props, by);
  s.step = 'done'; s.msg = '받는 주소에 추가했습니다. 다음 주 월요일 아침부터 이 주소로도 요약 메일이 갑니다.';
  return s;
}

/** 연구자 페이지가 부르는 단 하나의 입구. 글(JSON) 하나를 받아 글(JSON) 하나를 돌려준다. 오류 내용은 화면에 내지 않고 기록에만 남긴다. */
function researcherApi(text) {
  var out;
  try { out = researcherRun_(text); }
  catch (err) { Logger.log('연구자 페이지 오류: ' + err); out = { ok: false, code: 'server', msg: '처리 중 오류가 났습니다. 잠시 뒤 다시 해 보세요.' }; }
  return JSON.stringify(out);
}
function researcherRun_(text) {
  var props = PropertiesService.getScriptProperties(), q = null;
  var badReq = { ok: false, code: 'bad_request', msg: '요청 모양이 맞지 않습니다. 페이지를 새로 고쳐 주세요.' };
  if (typeof text !== 'string' || !text.length || text.length > RLIM.bodyMax) return badReq;
  try { q = JSON.parse(text); } catch (e) { q = null; }
  if (!q || typeof q !== 'object' || Array.isArray(q) || typeof q.op !== 'string') return badReq;
  if (q.op === 'ping') return { ok: true, kind: 'medterm-kr-researcher/1', ver: SCRIPT_VERSION, enabled: researchers_(props).length > 0 };
  return withLock_(10000, function () { return researcherOp_(q, props); }, function () { return { ok: false, code: 'busy', msg: '지금 다른 작업이 돌고 있습니다. 잠시 뒤 다시 해 주세요.' }; });
}
function researcherOp_(q, props) {
  var cache = CacheService.getScriptCache(), now = new Date().getTime(), day = today_(), op = q.op, me, a, m, list, keep, s;
  var field = function (k) { return typeof q[k] === 'string' && q[k].length <= 200 ? q[k] : ''; };
  var badMail = { ok: false, code: 'email', msg: '메일 주소 모양이 아닙니다.' };
  var generic = { ok: true, msg: '등록된 연구자 주소라면 인증 번호를 보냈습니다. ' + Math.round(RLIM.codeTtl / 60) + '분 안에 입력하세요. 안 오면 스팸함을 보세요(한 시간에 ' + RLIM.perHour + '번까지 받을 수 있습니다).' };
  var badCode = { ok: false, code: 'bad_code', msg: '번호가 맞지 않거나 시간이 지났습니다. 새 번호를 받아 다시 해 주세요.' };
  var needAuth = { ok: false, code: 'auth', msg: '인증이 끝났습니다(' + Math.round(RLIM.sessIdle / 60) + '분 동안 쓰지 않았거나 지정이 바뀌었습니다). 다시 인증해 주세요.' };

  if (op === 'code') {   // 로그인용 인증 번호. 지정된 주소인지는 답으로 알려 주지 않는다(누구나 똑같은 답)
    a = normEmail_(field('email'));
    if (!a) return badMail;
    if (researchers_(props).indexOf(a) < 0) return generic;
    if (!rateOk_(props, 'c:' + sha_(a).slice(0, 12), now, RLIM.perHour)) return generic;
    if (!dayCap_(props, PROP.OTP_DAY, day, RLIM.otpPerDay)) return generic;
    try { m = loginMail_(issueCode_(cache, 'login', a, '', now)); sendMail_('otp', a, m.subject, m.body, '', 'MedTerm-KR 연구자 인증'); } catch (e) { Logger.log('인증 메일을 보내지 못했습니다: ' + e); }
    return generic;
  }
  if (op === 'login') {
    a = normEmail_(field('email'));
    if (!a || researchers_(props).indexOf(a) < 0) return badCode;
    if (checkCode_(cache, 'login', a, '', field('code'), now) !== 'ok') return badCode;
    rlog_(props, '로그인 ' + a);
    return { ok: true, token: newSession_(cache, a, now), me: a, idleMin: Math.round(RLIM.sessIdle / 60) };
  }
  // 여기부터는 로그인한 연구자만
  me = readSession_(cache, field('token'), props, now);
  if (!me) return needAuth;
  if (op === 'state') return stateOf_(props, me);
  if (op === 'logout') { cache.remove('sess:' + sha_(field('token'))); return { ok: true }; }
  if (op === 'add' || op === 'verify') {
    a = normEmail_(field('email'));
    if (!a) return badMail;
    if (!domainOk_(props, a)) return { ok: false, code: 'domain', msg: '운영자가 허용한 도메인(' + domainsOf_(props).join(', ') + ')의 주소만 등록할 수 있습니다.' };
    list = recipients_(props);
    if (a === normEmail_(props.getProperty(PROP.TO) || '') || list.some(function (r) { return r.a === a; })) return { ok: false, code: 'dup', msg: '이미 요약 메일을 받는 주소입니다.' };
    if (list.length >= RLIM.maxRecipients) return { ok: false, code: 'full', msg: '연구자가 등록할 수 있는 주소는 최대 ' + RLIM.maxRecipients + '개입니다. 하나를 지운 뒤 추가해 주세요.' };
    if (op === 'verify') {
      if (checkCode_(cache, 'add', me, a, field('code'), now) !== 'ok') return badCode;
      return addRecipient_(props, a, me, now);
    }
    if (a === me) return addRecipient_(props, a, me, now);   // 방금 메일 인증을 마친 본인 주소
    if (!rateOk_(props, 'v:' + sha_(me).slice(0, 12), now, RLIM.perHour)) return { ok: false, code: 'wait', msg: '인증 번호를 너무 자주 요청했습니다. 한 시간 뒤에 다시 해 주세요(한 시간에 ' + RLIM.perHour + '번).' };
    if (!dayCap_(props, PROP.OTP_DAY, day, RLIM.otpPerDay)) return { ok: false, code: 'wait', msg: '오늘은 인증 메일을 더 보낼 수 없습니다. 내일 다시 해 주세요.' };
    m = addMail_(issueCode_(cache, 'add', me, a, now), me);
    try { sendMail_('otp', a, m.subject, m.body, '', 'MedTerm-KR 연구자 인증'); }
    catch (e) { Logger.log('인증 메일을 보내지 못했습니다: ' + e); return { ok: false, code: 'mail', msg: '그 주소로 메일을 보내지 못했습니다. 주소를 확인하거나 잠시 뒤 다시 해 주세요.' }; }
    rlog_(props, '주소 인증 번호 보냄 ' + a + ' (요청 ' + me + ')');
    return { ok: true, step: 'verify', msg: '그 주소로 인증 번호를 보냈습니다. 그 주소를 쓰는 분에게 번호를 받아 아래에 입력하세요(' + Math.round(RLIM.codeTtl / 60) + '분 안).' };
  }
  if (op === 'remove') {
    a = normEmail_(field('email'));
    list = recipients_(props);
    keep = list.filter(function (r) { return r.a !== a; });
    if (!a || keep.length === list.length) return { ok: false, code: 'none', msg: '그 주소는 등록돼 있지 않습니다.' };
    jset_(props, PROP.RECIPIENTS, keep);
    rlog_(props, '받는 주소 삭제 ' + a + ' (삭제 ' + me + ')');
    s = stateOf_(props, me);
    s.step = 'removed'; s.msg = '지웠습니다. 다음 요약 메일부터 이 주소로는 가지 않습니다.';
    return s;
  }
  return { ok: false, code: 'bad_request', msg: '모르는 요청입니다. 페이지를 새로 고쳐 주세요.' };
}

// ── 운영자 메뉴(시트 화면에서만 돈다: 맨 앞의 getUi() 가 시트 화면 밖에서는 오류를 내므로, 웹 앱 화면의 google.script.run 으로는 아무것도 바뀌지 않는다) ──
function addResearcher() {
  var ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties(), list = researchers_(props);
  var r = ui.prompt('연구자 지정 — 인증을 허용할 메일 주소(한 개)', '연구자 페이지에서 인증 번호를 받을 수 있는 주소입니다(예: 연구 책임자의 학교 메일).\n지금 지정: ' + (list.length ? list.join(', ') : '없음') + ' (최대 ' + RLIM.maxResearchers + '명)', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var a = normEmail_(r.getResponseText());
  if (!a) { ui.alert('메일 주소 모양이 아닙니다. 다시 실행해 주세요.'); return; }
  if (list.indexOf(a) >= 0) { ui.alert('이미 지정된 주소입니다.'); return; }
  if (list.length >= RLIM.maxResearchers) { ui.alert('연구자는 최대 ' + RLIM.maxResearchers + '명까지 지정할 수 있습니다. 먼저 한 명의 지정을 취소해 주세요.'); return; }
  var done = withLock_(15000, function () { var cur = researchers_(props); if (cur.indexOf(a) < 0) cur.push(a); jset_(props, PROP.RESEARCHERS, cur); rlog_(props, '연구자 지정 ' + a); return true; }, function () { return false; });
  ui.alert(done ? '연구자로 지정했습니다: ' + a + '\n연구자 페이지 주소는 웹 앱 주소 끝에 ?page=researcher 를 붙인 것입니다(메뉴 “연구자 페이지 현황·주소”에서 확인).\n그 주소를 연구자에게 알려 주세요. 연구자는 이 주소로 인증 번호를 받아, 요약 메일 받을 주소를 직접 넣고 뺄 수 있습니다.'
    : '지금 다른 작업이 돌고 있습니다. 잠시 뒤 다시 실행해 주세요.');
}
function removeResearcher() {
  var ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties(), list = researchers_(props);
  if (!list.length) { ui.alert('지정된 연구자가 없습니다.'); return; }
  var r = ui.prompt('연구자 지정 취소', '지정을 취소할 주소를 적어 주세요.\n지금 지정: ' + list.join(', ') + '\n그 연구자가 등록한 받는 주소도 함께 지워집니다. 이미 로그인한 화면도 바로 쓸 수 없게 됩니다.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var a = normEmail_(r.getResponseText());
  if (!a || list.indexOf(a) < 0) { ui.alert('지정된 연구자 주소가 아닙니다. 다시 실행해 주세요.'); return; }
  var removed = withLock_(15000, function () {
    var cur = researchers_(props).filter(function (x) { return x !== a; }), all = recipients_(props), keep = all.filter(function (x) { return x.by !== a; });
    jset_(props, PROP.RESEARCHERS, cur); jset_(props, PROP.RECIPIENTS, keep);
    rlog_(props, '연구자 지정 취소 ' + a + (all.length - keep.length ? ' (그가 등록한 받는 주소 ' + (all.length - keep.length) + '개 함께 삭제)' : ''));
    return all.length - keep.length;
  }, function () { return -1; });
  ui.alert(removed < 0 ? '지금 다른 작업이 돌고 있습니다. 잠시 뒤 다시 실행해 주세요.' : '지정을 취소했습니다: ' + a + (removed ? '\n그가 등록한 받는 주소 ' + removed + '개도 지웠습니다.' : ''));
}
function removeRecipient() {
  var ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties(), list = recipients_(props);
  if (!list.length) { ui.alert('연구자가 등록한 받는 주소가 없습니다.'); return; }
  var r = ui.prompt('받는 주소 지우기(운영자)', '지울 주소를 적어 주세요.\n지금: ' + list.map(function (x) { return x.a; }).join(', ') + '\n(운영자 주소 SUMMARY_TO 는 “처음 설정”에서 바꿉니다.)', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var a = normEmail_(r.getResponseText());
  var res = withLock_(15000, function () {
    var all = recipients_(props), keep = all.filter(function (x) { return x.a !== a; });
    if (!a || keep.length === all.length) return 0;
    jset_(props, PROP.RECIPIENTS, keep); rlog_(props, '받는 주소 삭제(운영자) ' + a); return 1;
  }, function () { return -1; });
  ui.alert(res < 0 ? '지금 다른 작업이 돌고 있습니다. 잠시 뒤 다시 실행해 주세요.' : (res ? '지웠습니다: ' + a : '그 주소는 연구자가 등록한 받는 주소가 아닙니다.'));
}
function researcherStatus() {
  var ui = SpreadsheetApp.getUi(), props = PropertiesService.getScriptProperties(), rs = researchers_(props), rc = recipients_(props), log = jget_(props, PROP.RLOG, []), url = '', L = [];
  if (!Array.isArray(log)) log = [];
  try { url = String(ScriptApp.getService().getUrl() || ''); } catch (e) { url = ''; }
  var base = url.replace(/[?#].*$/, '');
  L.push('연구자 페이지 주소: ' + (base ? base + '?page=researcher' : '(웹 앱으로 배포한 뒤, 배포 관리의 웹 앱 주소 끝에 ?page=researcher 를 붙이세요)'));
  if (/\/dev$/.test(base)) L.push('※ /dev 로 끝나는 주소는 시험용이라 연구자가 열 수 없습니다. 배포 관리에서 새 배포를 만들고 /exec 로 끝나는 주소를 쓰세요.');
  L.push('지정된 연구자 ' + rs.length + '/' + RLIM.maxResearchers + ': ' + (rs.length ? rs.join(', ') : '없음 — 메뉴 “연구자 지정”으로 지정'));
  L.push('운영자 주소(SUMMARY_TO): ' + (props.getProperty(PROP.TO) || '없음'));
  L.push('연구자가 등록한 받는 주소 ' + rc.length + '/' + RLIM.maxRecipients + ': ' + (rc.length ? rc.map(function (x) { return x.a + ' ← ' + x.by + ' ' + x.at; }).join(' · ') : '없음'));
  if (domainsOf_(props).length) L.push('허용 도메인(RECIPIENT_DOMAINS): ' + domainsOf_(props).join(', '));
  L.push('최근 기록: ' + (log.length ? '\n  ' + log.slice(-8).join('\n  ') : '없음'));
  ui.alert(L.join('\n'));
}

function refresh_(send) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), props = PropertiesService.getScriptProperties();
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var rd = readResponses_(ss);
    var res = RI.analyze(rd.recs, MANIFEST, today, { gates: true, demo: props.getProperty(PROP.DEMO) === '1' });   // DEMO_MODE=1 이면 시험용 표시
    writeCheck_(ss, rd, res);
    writeOperator_(ss, res);
    writeAnalysis_(props, res);
    res.mailSent = false; res.mailNote = '';
    if (send) {
      var to = props.getProperty(PROP.TO);
      if (!to || !RI.validEmail(to)) { res.mailNote = '받을 주소(SUMMARY_TO)가 없거나 모양이 이상합니다 — 메뉴 MedTerm-KR → 처음 설정'; }
      else {
        var text = RI.emailText(res.summary), html = RI.emailHtml(res.summary), subj = RI.emailSubject(res.summary);
        var leak = RI.leakCount([subj, text, html], res.ops.secrets, MANIFEST);
        if (leak) { res.mailNote = '이름·소속·메모로 보이는 글 ' + leak + '건이 메일에 섞여 있어 보내지 않았습니다'; }
        else {
          sendMail_('summary', to, subj, text, html, 'MedTerm-KR 접수 점검');   // 운영자 주소로 먼저(실패하면 오류가 그대로 올라옴)
          res.mailSent = true; res.mailCount = 1; props.setProperty(PROP.LAST_MAIL, today + ' ' + subj);
          var failed = 0, mine = normEmail_(to);
          recipients_(props).forEach(function (r) {   // 연구자가 연구자 페이지에서 등록한 주소: 한 통씩 따로(서로 주소가 안 보임). 한 곳이 실패해도 나머지는 보낸다.
            if (r.a === mine) return;
            try { sendMail_('summary', r.a, subj, text + FOOT_TEXT, html.replace(/<\/div>\s*$/, FOOT_HTML + '</div>'), 'MedTerm-KR 접수 점검'); res.mailCount++; }
            catch (e) { failed++; Logger.log('연구자 등록 주소로 보내지 못했습니다: ' + e); }
          });
          if (failed) res.mailNote = '연구자가 등록한 주소 ' + failed + '곳에는 보내지 못했습니다(메일 한도 등) — 메뉴 “연구자 페이지 현황·주소”에서 확인하세요';
        }
      }
    }
    return res;
  } finally { lock.releaseLock(); }
}

function findCol_(head, pred) { for (var k = 0; k < head.length; k++) if (pred(RI.normText(head[k]))) return k; return -1; }
function tsString_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  return v == null ? '' : String(v);
}
function readResponses_(ss) {
  var name = PropertiesService.getScriptProperties().getProperty(PROP.RESP), sheets = ss.getSheets(), sh = name ? ss.getSheetByName(name) : null, i, rows;
  if (!sh) {
    for (i = 0; i < sheets.length; i++) {
      if ([SHEET.check, SHEET.link, SHEET.memo].indexOf(sheets[i].getName()) >= 0) continue;
      rows = sheets[i].getDataRange().getValues();
      if (rows.length > 1 && rows.some(function (r) { return r.some(function (c) { return typeof c === 'string' && c.indexOf(RI.SCHEMA) >= 0; }); })) { sh = sheets[i]; break; }
    }
    if (!sh) sh = sheets[0];
  }
  rows = sh.getDataRange().getValues();
  var head = rows[0] || [], body = rows.slice(1), cj = -1, hits = {};
  body.forEach(function (r) { r.forEach(function (c, k) { if (typeof c === 'string' && c.indexOf(RI.SCHEMA) >= 0) hits[k] = (hits[k] || 0) + 1; }); });
  Object.keys(hits).forEach(function (k) { if (cj < 0 || hits[k] > hits[cj]) cj = +k; });
  if (cj < 0) cj = findCol_(head, function (h) { return h.indexOf('확인서') >= 0; });
  var ct = findCol_(head, function (h) { return h.indexOf('타임스탬프') >= 0 || h.toLowerCase() === 'timestamp'; });
  if (ct < 0 && cj !== 0) ct = 0;
  var cc = findCol_(head, function (h) { return h.indexOf('연구 이용') >= 0 && h.indexOf('동의') >= 0; });
  var cl = findCol_(head, function (h) { return h.indexOf('면허') >= 0; });
  var recs = [];
  body.forEach(function (r, k) {
    if (!r.some(function (c) { return RI.normText(c); })) return;
    recs.push({
      text: cj >= 0 && r[cj] != null ? String(r[cj]) : '', ts: ct >= 0 ? tsString_(r[ct]) : '',
      consent: cc >= 0 ? RI.researchYes(r[cc]) : null, license: cl >= 0 ? RI.licenseYes(r[cl]) : null, row: k + 2
    });
  });
  return { recs: recs, sheetName: sh.getName(), cols: { json: cj, ts: ct, consent: cc, license: cl } };
}

function ensureSheet_(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }
function ensureSize_(sh, rows, cols) {
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
  if (sh.getMaxColumns() < cols) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
}
/** 시트를 비우고 표를 쓴다. asText 면 글자 서식('@')을 먼저 정해 두어, 약사가 쓴 글이 =, +, -, @ 로 시작해도 수식으로 읽히지 않게 한다. */
function writeTable_(sh, header, rows, asText) {
  var all = [header].concat(rows), nc = header.length;
  sh.clear();
  ensureSize_(sh, all.length, nc);
  var rg = sh.getRange(1, 1, all.length, nc);
  if (asText) rg.setNumberFormat('@');   // 약사가 쓴 글이 든 시트만 글자 서식(분석 파일은 숫자 그대로 둬야 그래프·계산이 된다)
  rg.setValues(all);
  sh.setFrozenRows(1);
}
function protectOwnerOnly_(sh) {
  var ps = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET), p = ps.length ? ps[0] : sh.protect();
  p.setDescription('MedTerm-KR 운영자 전용(이름·소속·메모)');
  var me = Session.getEffectiveUser();
  p.addEditor(me);
  p.removeEditors(p.getEditors().filter(function (u) { return u.getEmail() !== me.getEmail(); }));
  if (p.canDomainEdit()) p.setDomainEdit(false);
}
function labelOf_(sid, iid) { var its = MANIFEST.scopes[sid].items; for (var i = 0; i < its.length; i++) if (its[i].id === iid) return its[i]; return null; }

/** 접수 점검: 응답 시트의 줄마다 결과 한 줄 — 이름·소속·메모는 넣지 않는다 */
function writeCheck_(ss, rd, res) {
  var rows = res.records.map(function (R) {
    var st = R.status === 'ok' ? '정상 반영' : (R.status === 'gated' ? (R.reason === 'license' ? '확인 대기' : '분석 제외') : '형식 오류');
    var why = R.status === 'ok' ? (R.stale ? '사전이 바뀐 판정 ' + R.stale + '개는 세지 않음' : '') : (R.status === 'gated' ? GATE_NOTE[R.reason] : RI.REASON_LABEL[R.reason] || R.reason);
    return [R.row, R.ts, st, why, R.scope ? MANIFEST.scopes[R.scope].label : '', R.rid || '', R.n || '', R.stale || ''];
  });
  var sh = ensureSheet_(ss, SHEET.check);
  writeTable_(sh, ['응답 시트 줄', '시각', '결과', '이유', '범위', '약사 번호(가명)', '판정 수', '사전 변경 판정 수'], rows);
  var meta = ['읽은 시트: ' + rd.sheetName, '확인서 글 열 ' + (rd.cols.json + 1) + ' · 시각 열 ' + (rd.cols.ts + 1) + ' · 연구 이용 동의 열 ' + (rd.cols.consent < 0 ? '없음' : rd.cols.consent + 1) + ' · 면허 확인 열 ' + (rd.cols.license < 0 ? '없음' : rd.cols.license + 1), '점검 날짜 ' + res.summary.meta.today];
  if (res.summary.meta.demo) meta.unshift('※ ' + RI.DEMO_NOTE);
  ensureSize_(sh, meta.length, 10);
  sh.getRange(1, 10, meta.length, 1).setValues(meta.map(function (m) { return [m]; }));
}

/** 운영자 전용: 가명표(이름·소속)·메모. 이 시트 파일을 남에게 나누면 보이므로 분석은 따로 만든 파일로 나눈다. */
function writeOperator_(ss, res) {
  var L = res.ops.link, ids = Object.keys(L).sort();
  var linkRows = ids.map(function (r) { return [r, L[r].name, L[r].org, L[r].scopes.join(' '), L[r].first || '']; });
  var shL = ensureSheet_(ss, SHEET.link);
  writeTable_(shL, ['약사 번호(가명)', '이름', '소속', '범위', '처음 응답일'], linkRows, true);
  var memoRows = [];
  Object.keys(res.ops.memos).forEach(function (sid) {
    Object.keys(res.ops.memos[sid]).sort().forEach(function (r) {
      Object.keys(res.ops.memos[sid][r]).forEach(function (iid) {
        var it = labelOf_(sid, iid);
        memoRows.push([r, sid, it ? it.no : '', it ? it.label : iid, RI.V_LABEL[res.ops.ratings[sid][r][iid]], res.ops.memos[sid][r][iid]]);
      });
    });
  });
  memoRows.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[2] - b[2]); });
  var shM = ensureSheet_(ss, SHEET.memo);
  writeTable_(shM, ['약사 번호(가명)', '범위', '항목 번호', '항목', '판정', '메모(이름·약국명이 섞였는지 확인 후 쓰기)'], memoRows, true);
  protectOwnerOnly_(shL);
  protectOwnerOnly_(shM);
}

/** 분석 파일(가명): 따로 만든 새 시트 파일에 적는다 — 이름·소속·메모 없음 */
function analysisSs_(props) {
  var id = props.getProperty(PROP.ANALYSIS);
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { Logger.log('분석 시트 파일을 열지 못해 새로 만듭니다: ' + e); } }
  var ss2 = SpreadsheetApp.create('MedTerm-KR 약사 검수 분석(가명 · 이름·소속·메모 없음)');
  props.setProperty(PROP.ANALYSIS, ss2.getId());
  return ss2;
}
function writeAnalysis_(props, res) {
  var ss2 = analysisSs_(props), S = res.summary, it = S.intake, sids = Object.keys(S.scopes), first = ss2.getSheets()[0];
  var sumRows = [['접수', it.received + '건'], ['분석 반영 확인서', it.accepted_submissions + '건'], ['분석에 쓴 약사(가명)', it.raters + '명'],
    ['형식 오류로 뺀 것', sumVals_(it.rejected) + '건'], ['동의·면허 확인으로 뺀 것', sumVals_(it.excluded_by_gate) + '건'], ['사전 변경으로 세지 않은 판정', it.stale_answers + '개'], ['점검 날짜', S.meta.today]];
  sids.forEach(function (sid) {
    var sc = S.scopes[sid], ag = sc.agreement;
    sumRows.push(['', ''], ['[' + sc.label + ']', RI.caution(sc.n_raters)]);
    if (sc.n_raters) sumRows.push(['판정', sc.cells + '건: 맞다 ' + sc.verdicts.ok + ' · 다르다 ' + sc.verdicts.diff + ' · 모르겠다 ' + sc.verdicts.unsure],
      ['S-CVI/Ave · S-CVI/UA', RI.fmt(sc.scvi_ave) + ' · ' + RI.fmt(sc.scvi_ua)], ['관찰 일치율 · AC1 · α', RI.pct(ag.observed) + ' · ' + RI.fmt(ag.ac1) + ' · ' + RI.fmt(ag.alpha)], ['I-CVI 기준 미달 항목 번호', sc.items_below.join(', ') || '없음']);
  });
  if (S.meta.demo) sumRows.unshift(['※', RI.DEMO_NOTE]);
  var rowsA = [], rowsI = [], rowsW = [];
  sids.forEach(function (sid) {
    var sc = S.scopes[sid];
    sc.items.forEach(function (i) {
      rowsI.push([sid, i.no, i.label, i.n, i.ok, i.diff, i.unsure, i.icvi == null ? '' : i.icvi, i.threshold == null ? '' : i.threshold, { pass: '충족', fail: '미달', na: '판정 부족' }[i.status]]);
      Object.keys(res.ops.ratings[sid]).sort().forEach(function (r) { var v = res.ops.ratings[sid][r][i.id]; if (v) rowsA.push([r, sid, i.no, i.label, RI.V_LABEL[v]]); });
    });
    sc.weekly.forEach(function (w) { rowsW.push([sid, w.week, w['new'], w.cum]); });
  });
  var shS = ss2.getSheetByName('요약') || (first.getName() === '요약' ? first : null);
  if (!shS) { first.setName('요약'); shS = first; }
  writeTable_(shS, ['항목', '값'], sumRows);
  writeTable_(ensureSheet_(ss2, '항목별 집계'), ['범위', '항목 번호', '항목', '판정 수', '맞다', '다르다', '모르겠다', 'I-CVI', '기준', '결과'], rowsI);
  writeTable_(ensureSheet_(ss2, '분석(가명)'), ['약사 번호(가명)', '범위', '항목 번호', '항목', '판정'], rowsA);
  writeTable_(ensureSheet_(ss2, '주별 접수'), ['범위', '주(월요일)', '새 약사', '누적 약사'], rowsW);
}
function sumVals_(o) { var s = 0; Object.keys(o).forEach(function (k) { s += o[k]; }); return s; }

// ═════════════ 연구자 페이지 화면(웹 앱 주소 끝에 ?page=researcher) — 바깥 자료 없이 이 글 하나로 그려진다 ═════════════
// 화면 글은 모두 textContent 로만 넣는다(innerHTML 안 씀). 로그인 토큰은 화면의 변수에만 두고 저장하지 않는다(새로 고치면 다시 인증).
var RESEARCHER_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MedTerm-KR 연구자 페이지</title>
<style>
:root{--bg:#f4f3ef;--card:#ffffff;--ink:#17191e;--sub:#4a505c;--line:#d6d3ca;--acc:#1c5db8;--on-acc:#ffffff;--bad:#a8231b;--ok:#14663a;--soft:#e9eff9;--focus:#1c5db8}
@media (prefers-color-scheme:dark){:root{--bg:#13151a;--card:#1b1e25;--ink:#ecebe7;--sub:#b7bbc5;--line:#373c47;--acc:#8fb7f5;--on-acc:#0c1a33;--bad:#ff9a92;--ok:#86d9a6;--soft:#222b3b;--focus:#8fb7f5}}
*{box-sizing:border-box}
html{color-scheme:light dark}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,"Segoe UI","Noto Sans KR","Malgun Gothic",sans-serif}
.wrap{max-width:640px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:1.45rem;line-height:1.3;margin:4px 0 6px}
h2{font-size:1.1rem;margin:0 0 8px}
h2:focus{outline:none}
.lead{margin:0 0 18px;color:var(--sub)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin:0 0 14px}
label{display:block;font-weight:600;margin:12px 0 4px}
input{width:100%;font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:11px 12px;min-height:44px}
input:focus-visible,button:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
button{font:inherit;font-weight:600;min-height:44px;padding:9px 16px;border-radius:10px;border:1px solid var(--acc);background:var(--acc);color:var(--on-acc);cursor:pointer}
button.ghost{background:transparent;color:var(--acc)}
button.danger{background:transparent;color:var(--bad);border-color:var(--bad)}
button[disabled]{opacity:.55;cursor:default}
.row{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
ul.list{list-style:none;margin:8px 0;padding:0}
ul.list li{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-top:1px solid var(--line);padding:10px 0}
ul.list li:first-child{border-top:0}
.addr{word-break:break-all;min-width:0}
.tag{display:inline-block;font-size:.8rem;color:var(--sub);background:var(--soft);border-radius:999px;padding:1px 9px;margin-left:6px}
.small{font-size:.9rem;color:var(--sub);margin:4px 0}
#live{min-height:1.6em;margin:0 0 12px;font-weight:600}
#live.err{color:var(--bad)}
#live.ok{color:var(--ok)}
ul.plain{margin:6px 0;padding-left:20px}
ul.plain li{margin:4px 0}
[hidden]{display:none!important}
</style>
</head>
<body>
<div class="wrap">
<header>
<h1>MedTerm-KR 연구자 페이지</h1>
<p class="lead">약사 확인서 주간 요약 메일을 받을 주소를 연구자가 직접 등록·삭제합니다. 메일로 본인 확인을 마친 연구자만 바꿀 수 있습니다.</p>
</header>
<main>
<noscript><p class="small">이 페이지는 자바스크립트가 켜져 있어야 동작합니다.</p></noscript>
<p id="live" role="status" aria-live="polite"></p>

<section class="card" id="s-login" aria-labelledby="h-login">
<h2 id="h-login">1. 본인 확인</h2>
<p class="small">운영자가 연구자로 지정한 메일 주소를 적으면, 그 주소로 인증 번호(6자리)가 갑니다.</p>
<form id="f-code" novalidate>
<label for="email">연구자 메일 주소</label>
<input id="email" type="email" inputmode="email" autocomplete="email" maxlength="100" required>
<div class="row"><button type="submit" id="b-code">인증 번호 받기</button></div>
</form>
<form id="f-login" novalidate hidden>
<label for="code">인증 번호 (6자리)</label>
<input id="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" required>
<div class="row"><button type="submit" id="b-login">확인</button><button type="button" class="ghost" id="b-again">번호 다시 받기</button></div>
</form>
</section>

<section class="card" id="s-main" aria-labelledby="h-main" hidden>
<h2 id="h-main" tabindex="-1">2. 요약 메일 받는 주소</h2>
<p class="small" id="me"></p>
<ul class="list" id="list"></ul>
<p class="small" id="count"></p>
<form id="f-add" novalidate>
<label for="new">추가할 메일 주소</label>
<input id="new" type="email" inputmode="email" autocomplete="off" maxlength="100" required>
<p class="small" id="dom" hidden></p>
<div class="row"><button type="submit" id="b-add">추가</button></div>
</form>
<form id="f-verify" novalidate hidden>
<p class="small" id="v-note"></p>
<label for="vcode">그 주소로 간 인증 번호 (6자리)</label>
<input id="vcode" type="text" inputmode="numeric" autocomplete="off" maxlength="6" pattern="[0-9]*" required>
<div class="row"><button type="submit" id="b-verify">확인하고 추가</button><button type="button" class="ghost" id="b-vcancel">취소</button></div>
</form>
<div class="row"><button type="button" class="ghost" id="b-out">나가기</button></div>
</section>

<section class="card" aria-labelledby="h-info">
<h2 id="h-info">받게 되는 메일</h2>
<ul class="plain">
<li>매주 월요일 아침(9시쯤), 등록된 주소마다 한 통씩 따로 갑니다. 받는 사람끼리 주소가 보이지 않습니다.</li>
<li>내용: 접수 현황, 판정 분포(맞다·다르다·모르겠다), 항목별 일치도, ‘다르다’가 많은 항목.</li>
<li>약사의 이름·소속·메모·원본 글은 들어 있지 않습니다(약사는 R01, R02… 번호로만 나옵니다).</li>
<li>시험 단계에는 제목에 [시험용·가짜 데이터] 표시가 붙습니다.</li>
</ul>
<p class="small">이 페이지는 확인서나 분석 내용을 보여 주지 않습니다. 쓰지 않고 30분이 지나면 인증이 끝납니다. 문의는 이 주소를 알려 드린 MedIT 담당자에게 해 주세요.</p>
</section>
</main>
</div>
<script>
(function () {
  'use strict';
  var token = '', pending = '';
  function $(id) { return document.getElementById(id); }
  function say(msg, kind) { var l = $('live'); l.textContent = msg || ''; l.className = kind || ''; }
  function show(id, on) { $(id).hidden = !on; }
  function setBusy(b) {
    var bs = document.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) bs[i].disabled = b;
    document.body.setAttribute('aria-busy', b ? 'true' : 'false');
  }
  function call(req, done) {
    setBusy(true);
    google.script.run
      .withSuccessHandler(function (txt) {
        setBusy(false);
        var r = null;
        try { r = JSON.parse(txt); } catch (e) { r = null; }
        done(r || { ok: false, msg: '응답을 읽지 못했습니다. 페이지를 새로 고쳐 주세요.' });
      })
      .withFailureHandler(function () { setBusy(false); done({ ok: false, code: 'net', msg: '서버에 연결하지 못했습니다. 잠시 뒤 다시 해 보세요.' }); })
      .researcherApi(JSON.stringify(req));
  }
  function toLogin(msg, kind) {
    token = ''; pending = '';
    show('s-main', false); show('s-login', true); show('f-code', true); show('f-login', false); show('f-verify', false); show('f-add', true);
    $('code').value = ''; $('vcode').value = '';
    say(msg, kind); $('email').focus();
  }
  function authLost(r) { if (r && r.code === 'auth') { toLogin(r.msg, 'err'); return true; } return false; }
  function render(st) {
    $('me').textContent = '접속한 연구자: ' + st.me;
    var ul = $('list');
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    var li = document.createElement('li'), sp = document.createElement('span'), tg = document.createElement('span');
    sp.className = 'addr'; sp.textContent = st.operator || '(운영자 주소 없음)';
    tg.className = 'tag'; tg.textContent = '운영자 · 지울 수 없음';
    sp.appendChild(tg); li.appendChild(sp); ul.appendChild(li);
    st.recipients.forEach(function (r) {
      var item = document.createElement('li'), a = document.createElement('span'), b = document.createElement('button');
      a.className = 'addr'; a.textContent = r.a;
      if (r.at) { var t = document.createElement('span'); t.className = 'tag'; t.textContent = r.at + ' 등록'; a.appendChild(t); }
      b.type = 'button'; b.className = 'danger'; b.textContent = '지우기'; b.setAttribute('aria-label', r.a + ' 지우기');
      b.addEventListener('click', function () {
        call({ op: 'remove', token: token, email: r.a }, function (res) {
          if (authLost(res)) return;
          if (res.ok) { render(res); say(res.msg, 'ok'); $('new').focus(); } else say(res.msg, 'err');
        });
      });
      item.appendChild(a); item.appendChild(b); ul.appendChild(item);
    });
    $('count').textContent = '연구자가 등록한 주소 ' + st.recipients.length + ' / ' + st.max + '개';
    var d = $('dom');
    if (st.domains && st.domains.length) { d.textContent = '운영자가 허용한 도메인의 주소만 추가할 수 있습니다: ' + st.domains.join(', '); d.hidden = false; } else { d.textContent = ''; d.hidden = true; }
    show('f-add', true); show('f-verify', false); pending = '';
  }
  function loadState(msg) {
    call({ op: 'state', token: token }, function (st) {
      if (authLost(st)) return;
      if (!st.ok) { say(st.msg, 'err'); return; }
      show('s-login', false); show('s-main', true); render(st); say(msg, 'ok'); $('h-main').focus();
    });
  }
  function askCode() {
    var em = $('email').value.trim();
    if (!em) { say('메일 주소를 적어 주세요.', 'err'); $('email').focus(); return; }
    call({ op: 'code', email: em }, function (r) {
      if (!r.ok) { say(r.msg, 'err'); return; }
      say(r.msg, 'ok'); show('f-login', true); $('code').focus();
    });
  }
  $('f-code').addEventListener('submit', function (ev) { ev.preventDefault(); askCode(); });
  $('b-again').addEventListener('click', askCode);
  $('f-login').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var em = $('email').value.trim(), cd = $('code').value.trim();
    if (!em || !cd) { say('메일 주소와 인증 번호를 모두 적어 주세요.', 'err'); return; }
    call({ op: 'login', email: em, code: cd }, function (r) {
      if (!r.ok) { say(r.msg, 'err'); $('code').select(); return; }
      token = r.token; $('code').value = '';
      loadState('인증했습니다. 이 화면은 쓰지 않고 ' + r.idleMin + '분이 지나면 닫힙니다.');
    });
  });
  $('f-add').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var em = $('new').value.trim();
    if (!em) { say('추가할 메일 주소를 적어 주세요.', 'err'); $('new').focus(); return; }
    call({ op: 'add', token: token, email: em }, function (r) {
      if (authLost(r)) return;
      if (!r.ok) { say(r.msg, 'err'); return; }
      if (r.step === 'verify') {
        pending = em; $('v-note').textContent = r.msg; $('vcode').value = '';
        show('f-add', false); show('f-verify', true); say('', ''); $('vcode').focus(); return;
      }
      render(r); $('new').value = ''; say(r.msg, 'ok');
    });
  });
  $('f-verify').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var cd = $('vcode').value.trim();
    if (!cd) { say('인증 번호를 적어 주세요.', 'err'); $('vcode').focus(); return; }
    call({ op: 'verify', token: token, email: pending, code: cd }, function (r) {
      if (authLost(r)) return;
      if (!r.ok) { say(r.msg, 'err'); $('vcode').select(); return; }
      render(r); $('new').value = ''; say(r.msg, 'ok'); $('new').focus();
    });
  });
  $('b-vcancel').addEventListener('click', function () { pending = ''; show('f-verify', false); show('f-add', true); say('', ''); $('new').focus(); });
  $('b-out').addEventListener('click', function () { call({ op: 'logout', token: token }, function () { toLogin('나갔습니다.', 'ok'); }); });
  call({ op: 'ping' }, function (r) { if (r.ok && !r.enabled) say('아직 지정된 연구자가 없습니다. 운영자에게 연구자 지정을 요청해 주세요.', 'err'); });
})();
</script>
</body>
</html>`;
