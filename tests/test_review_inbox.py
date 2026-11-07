"""구글 시트용 접수 점검 스크립트 점검 — python3 -I tests/test_review_inbox.py
 네트워크 불필요. tools/google_apps_script/review_inbox.gs 를 구글 없이 노드(node)로 돌린다 — 구글 서비스는 tests/js/review_inbox_harness.js 의
 가짜(시트·메일함·속성·트리거·잠금·대화상자)로 바꿔 끼운다. 임시 폴더의 ‘가짜’ 응답만 쓴다(실제 약사의 응답이 아니다). 아무것도 보내지 않는다.
 ① 소스: 다른 구글 서비스·인터넷 호출 없음 · 보이지 않는 글자 없음 · 메뉴·자동 실행 함수가 있음 · 자료판 표시(MANIFEST)가 지금 자료와 같음(낡으면 잡힘)
 ② 같은 가짜 응답을 파이썬 도구와 스크립트에 넣고 결과를 대조(응답 줄별 점검·판정 행렬·통계·가명표·메모·메일 글·HTML 모양)
 ③ 까다로운 입력(이름 표기 차이·날짜 경계·글자 수·제어 문자·JSON 모양·동의/면허 칸 표기·시각 순서·약사 번호 자릿수)에서도 같은 결과
 ④ 시트·메일 동작: 메일은 한 곳으로만 · 자동 점검은 메일을 안 보냄 · 분석 파일·접수 점검·메일에 이름·소속·메모가 없음 · 운영자 시트 보호·글자 서식 · 다시 돌려도 같음
 ⑤ 처음 설정·메뉴·자동 실행 ⑥ 시험 모드 · 크기 · 오류 처리 · 많은 응답
 ⑦ 앱 접수(웹 앱 doPost): 기본은 닫힘 · 동의 기록·동의서 버전이 맞아야 받음 · 어긋나면 한 줄도 안 적고 잠금을 풀어 줌 · 한도·잠금·오류 · 글자 서식 · 점검·분석과 파이썬 도구가 같은 열을 읽음"""
import collections, contextlib, csv, datetime, io, json, os, random, re, shutil, subprocess, sys, tempfile, time, types, unicodedata
from html.parser import HTMLParser
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
sys.path.insert(0, os.path.join(root, 'tools')); sys.path.insert(0, os.path.join(root, 'build'))
import review_lib as RL, review_research_report as RR, make_review_inbox_script as MK

NODE = shutil.which('node') or next((p for p in ('/opt/node22/bin/node', '/usr/local/bin/node', '/usr/bin/node') if os.path.exists(p)), None)
if not NODE:
    print('건너뜀: node(자바스크립트 실행기)를 찾지 못해 구글 시트용 스크립트를 시험하지 못했습니다. node 를 설치한 뒤 다시 돌리세요.')
    sys.exit(0)

GS = os.path.join(root, 'tools', 'google_apps_script', 'review_inbox.gs')
HARNESS = os.path.join(root, 'tests', 'js', 'review_inbox_harness.js')
DATA = os.path.join(root, 'data')
TODAY = datetime.date(2026, 11, 7)
IT = RL.build_items(DATA)
checks = []
def ok(name, cond, extra=''): checks.append(('PASS' if cond else 'FAIL', name, str(extra)[:300]))

tmp = tempfile.mkdtemp(prefix='test_review_inbox_')
ZWSP, IDEO, NBSP, BOM, BELL, EMOJI = chr(0x200b), chr(0x3000), chr(0xa0), chr(0xfeff), chr(7), chr(0x1F600)
HEADER = ['타임스탬프', '앱에서 ‘복사하기’를 누른 확인서 글을 여기에 붙여 넣어 주세요', '위 안내를 읽었고 동의합니다', '연구 이용에 동의합니다(선택)', '면허확인(운영자 기입)']
SHEET = '설문지 응답 시트1'

def rd(path): return open(path, encoding='utf-8').read()
def write_csv(name, header, rows):
    p = os.path.join(tmp, name)
    with open(p, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)
    return p

_n = [0]
def node(scn):
    """시나리오를 노드 시험 장치에 넣고 결과 JSON 을 돌려준다."""
    scn = dict(scn); scn.setdefault('gs', GS); scn.setdefault('today', '2026-11-07')
    _n[0] += 1
    p = os.path.join(tmp, f'scn{_n[0]}.json')
    json.dump(scn, open(p, 'w', encoding='utf-8'), ensure_ascii=False)
    r = subprocess.run([NODE, HARNESS, p], capture_output=True, text=True, encoding='utf-8', timeout=300, cwd=tmp)
    if r.returncode != 0: raise RuntimeError('node 오류: ' + r.stderr[-800:])
    return json.loads(r.stdout)

def sub(name, org, scope='names', ans=None, created='2026-11-05', public=False, refs=('mfds',), other=''):
    """손으로 만든 가짜 확인서. ans = {항목번호(1부터): 'ok' | ('diff', '메모')}"""
    its, answers = IT['items'][scope], {}
    for no, v in (ans or {1: 'ok'}).items():
        it = its[no - 1]; memo = None
        if isinstance(v, tuple): v, memo = v
        answers[it['id']] = {'v': v, 'h': it['h']}
        if memo is not None: answers[it['id']]['m'] = memo
    return {'schema': RL.SCHEMA, 'scope': scope, 'scope_hash': IT['scopes'][scope]['hash'], 'app': '1.6.0', 'created': created,
            'reviewer': {'name': name, 'affiliation': org, 'public': public, 'license_claimed': True}, 'refs': list(refs), 'refs_other': other, 'attested': True, 'answers': answers}
def J(obj): return json.dumps(obj, ensure_ascii=False, indent=1) + '\n'
def iid(scope, no): return IT['items'][scope][no - 1]['id']

# ── 파이썬 쪽 결과 · 대조 도구 ──
def py_side(header, rows, gates=True, demo=False, name='py.csv'):
    path = write_csv(name, header, rows)
    ns = types.SimpleNamespace(col_json=None, col_ts=None, col_consent=None, col_license=None)
    with contextlib.redirect_stdout(io.StringIO()):
        recs, cols = RR.read_csv(path, ns)
    S, ops = RR.analyze(recs, IT, TODAY, gates_on=gates, demo=demo)
    S = json.loads(json.dumps(S, ensure_ascii=False, default=str))
    return {'path': path, 'recs': recs, 'cols': cols, 'S': S, 'ops': ops, 'et': RR.email_text(S), 'eh': RR.email_html(S), 'subj': RR.subject(S)}

def js_side(path, gates=True, demo=False, extra_steps=(), **scn):
    r = node({'sheets': [{'name': SHEET, 'csv': path}], 'steps': [{'do': 'pure', 'gates': gates, 'demo': demo}] + list(extra_steps), **scn})
    if 'error' in r['steps'][0]: raise RuntimeError('pure 단계 오류: ' + r['steps'][0]['error'])
    return r['steps'][0], r

def num_eq(a, b, tol=1e-9):
    if a is None or b is None: return a is None and b is None
    return abs(a - b) <= tol
def cmp_val(a, b, path, out):
    if isinstance(a, bool) or isinstance(b, bool) or isinstance(a, str) or isinstance(b, str) or a is None or b is None:
        if a != b: out.append((path, a, b))
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)):
        if not num_eq(a, b): out.append((path, a, b))
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b): out.append((path + '.len', len(a), len(b))); return
        for k, (x, y) in enumerate(zip(a, b)): cmp_val(x, y, f'{path}[{k}]', out)
    elif isinstance(a, dict) and isinstance(b, dict):
        if set(a) != set(b): out.append((path + '.keys', sorted(a), sorted(b))); return
        for k in a: cmp_val(a[k], b[k], f'{path}.{k}', out)
    elif a != b: out.append((path, a, b))

def diff_summary(js, py):
    d = []
    cmp_val(js['intake'], py['intake'], 'intake', d)
    cmp_val(sorted(js['scopes']), sorted(py['scopes']), 'scopes', d)
    for sid in py['scopes']:
        j, p = js['scopes'][sid], py['scopes'][sid]
        for k in ('label', 'n_items', 'n_raters', 'cells', 'completeness', 'verdicts', 'evaluable_items', 'scvi_ave', 'scvi_ua', 'items_below', 'weekly'): cmp_val(j[k], p[k], f'{sid}.{k}', d)
        for k in ('units', 'observed', 'ac1', 'alpha', 'prevalence_ok'): cmp_val(j['agreement'][k], p['agreement'][k], f'{sid}.agreement.{k}', d)
        cmp_val(j['memos']['count'], p['memos']['count'], f'{sid}.memos.count', d)
        for ji, pi in zip(j['items'], p['items']):
            for k in ('id', 'no', 'label', 'n', 'ok', 'diff', 'unsure', 'icvi', 'threshold', 'status'): cmp_val(ji[k], pi[k], f'{sid}.item{pi["no"]}.{k}', d)
    return d
def diff_records(js, py):
    d = []
    if len(js) != len(py): return [('len', len(js), len(py))]
    for a, b in zip(js, py):
        ta, tb = (a['status'], a['reason'], a['scope'], a['rid'], a['n'], a['stale']), (b['status'], b['reason'], b['scope'], b['rid'], b['n'], b['stale'])
        if ta != tb: d.append((a['idx'], ta, tb))
    return d
def diff_link(js, py):
    a = {r: (v['name'], v['org'], sorted(v['scopes'])) for r, v in js.items()}
    b = {r: (v['name'], v['org'], sorted(v['scopes'])) for r, v in py.items()}
    return [] if a == b else [(sorted(set(a) ^ set(b))[:3], [k for k in a if k in b and a[k] != b[k]][:3])]
def sets_of(x): return {(r, sc, i, v) for sc, d in x.items() for r, m in d.items() for i, v in m.items()}
def all_diffs(py, js, label):
    """대조 한 벌: 줄별 점검 · 통계 · 판정 행렬 · 메모 · 가명표 · 약사가 쓴 글 모음 · 메일 글·제목·HTML"""
    cut = lambda h: h[:h.rindex('<p style="margin:16px 0 4px')]
    return {
        '응답 줄별 점검(정상·제외·형식 오류와 이유·약사 번호)': diff_records(js['records'], py['ops']['records']),
        '접수 현황·통계(I-CVI·S-CVI·일치율·AC1·α·주별 접수)': diff_summary(js['summary'], py['S']),
        '판정 행렬': [] if sets_of(js['ratings']) == sets_of(py['ops']['ratings']) else ['다름'],
        '메모': [] if js['memos'] == py['ops']['memos'] else ['다름'],
        '가명표(이름·소속·범위)': diff_link(js['link'], py['ops']['link']),
        '약사가 쓴 글 모음(누출 검사용)': [] if set(js['secrets']) == set(py['ops']['secrets']) else ['다름'],
        '메일 제목': [] if js['emailSubject'] == py['subj'] else [(js['emailSubject'], py['subj'])],
        '메일 글(바이트까지 같음)': [] if js['emailText'] == py['et'] else ['다름'],
        '메일 HTML(맨 끝 안내 한 줄만 다름)': [] if cut(js['emailHtml']) == cut(py['eh']) else ['다름'],
    }
def report(tag, diffs):
    for k, v in diffs.items(): ok(f'{tag}: {k}이 파이썬 도구와 같음', not v, v[:3] if v else '')

class Html(HTMLParser):
    """메일 HTML 이 속성·닫힘 모양이 맞는지 본다(예전에 style 속성 안 큰따옴표가 겹쳐 깨진 적이 있음)."""
    VOID = {'br', 'img', 'hr', 'meta', 'link', 'input'}
    def __init__(s): super().__init__(convert_charrefs=True); s.stack, s.bad, s.tags = [], [], collections.Counter()
    def handle_starttag(s, tag, attrs):
        s.tags[tag] += 1
        for k, v in attrs:
            if not re.fullmatch(r'[a-z][a-z0-9-]*', k): s.bad.append(('속성 이름', tag, k))
            if v is not None and '"' in v: s.bad.append(('속성 값에 큰따옴표', tag, k))
        if tag not in s.VOID: s.stack.append(tag)
    def handle_endtag(s, tag):
        if not s.stack or s.stack[-1] != tag: s.bad.append(('닫힘', tag, s.stack[-3:]))
        else: s.stack.pop()
def html_problems(h):
    p = Html(); p.feed(h); p.close()
    return p.bad + ([('안 닫힌 태그', p.stack)] if p.stack else []), p.tags

def sheets_of(final, name):
    return next(v for v in final['spreadsheets'].values() if v['name'] == name)
def analysis_of(final):
    return next(v for v in final['spreadsheets'].values() if v['name'].startswith('MedTerm-KR 약사 검수 분석'))
def sheet(ss, name): return next(s for s in ss['sheets'] if s['name'] == name)
def cell_texts(ss, skip_response=True):
    return [str(c) for s in ss['sheets'] if not (skip_response and s['isResponse']) for row in s['rows'] for c in row if c != '']

# ═════════ ① 소스 ═════════
src = rd(GS)
code_only = re.sub(r'(?m)(^|\s)//\s.*$', '', re.sub(r'/\*.*?\*/', '', src, flags=re.S))
services = set(re.findall(r'\b([A-Z][A-Za-z]*(?:App|Service))\b', code_only))
ok('① 쓰는 구글 서비스는 시트·속성·잠금·메일·자동 실행·웹 앱 응답(ContentService)·연구자 페이지의 캐시(CacheService)와 화면(HtmlService)뿐(UrlFetchApp·DriveApp·GmailApp 등 없음)', services <= {'SpreadsheetApp', 'PropertiesService', 'LockService', 'MailApp', 'ScriptApp', 'ContentService', 'CacheService', 'HtmlService'}, sorted(services))
bad = [w for w in ('eval(', 'new Function', 'importScripts', 'XMLHttpRequest', 'fetch(', 'UserProperties', 'DocumentProperties', 'innerHTML', 'document.write', 'google.script.host', 'window.open', 'ALLOWALL') if w in code_only] + [w for w in (r'\bDrive\.', r'\bSheets\.', r'\bGmail\.') if re.search(w, code_only)]
ok('① 인터넷 접속·코드 실행·고급 서비스 호출이 없음', not bad, bad)
inv = [hex(ord(c)) for f in (GS, HARNESS, os.path.join(root, 'tools', 'review_research_report.py'), os.path.join(root, 'tools', 'make_review_inbox_script.py')) for c in rd(f)
       if ord(c) in (0x2028, 0x2029, 0xfeff) or 0x200b <= ord(c) <= 0x200f or 0x202a <= ord(c) <= 0x202e or 0x2060 <= ord(c) <= 0x2069]
ok('① 스크립트·도구 소스에 보이지 않는 글자(줄 구분자·제로폭·방향 제어)가 없음', not inv, inv[:5])
ok('① 메일 받을 주소가 코드에 적혀 있지 않음(스크립트 속성에 둠)', not re.search(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}', code_only) and 'SUMMARY_TO' in code_only)
ok('① 쓰는 API 범위가 작음: 시트 읽기·쓰기 + 메일(보내는 곳은 sendMail_ 한 군데) + 자동 실행 + 화면(메뉴) + 연구자 페이지', 'MailApp.sendEmail' in code_only and 'GmailApp' not in code_only and code_only.count('MailApp.sendEmail') == 1 and code_only.count('sendMail_(') >= 4)
ver = re.search(r"SCRIPT_VERSION = '([^']+)'", src).group(1)
ok('① 스크립트 판 번호가 파이썬 도구와 같음', ver == RR.VERSION, (ver, RR.VERSION))
with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()): rc = MK.main(['--check'])
ok('① 자료판 표시(MANIFEST)가 지금 data/ 의 검수 항목과 같음(자료가 바뀌면 낡은 표시가 여기서 잡힘)', rc == 0, rc)
stale_gs = os.path.join(tmp, 'stale.gs'); open(stale_gs, 'w', encoding='utf-8').write(re.sub(r'"h":"([0-9a-f]{10})"', '"h":"0000000000"', src, count=1))
with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()): rc1 = MK.main(['--check', '--script', stale_gs])
with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()): rc2 = MK.main(['--script', stale_gs]); rc3 = MK.main(['--check', '--script', stale_gs])
ok('① 낡은 자료판 표시는 --check 가 알려 주고(종료 코드 1) 다시 만들면 원래대로 돌아옴', rc1 == 1 and rc2 == 0 and rc3 == 0 and rd(stale_gs) == src, (rc1, rc2, rc3))

# ═════════ ② 가짜 응답 24행: 파이썬 도구와 대조 ═════════
header, drows, dexp = RR.make_demo(IT, TODAY)
py = py_side(header, drows, demo=True, name='demo.csv')
js, full = js_side(py['path'], demo=True)
ok('② 스크립트가 읽은 열이 파이썬 도구와 같음(확인서 글 · 시각 · 연구 이용 동의 · 면허확인)', [js['cols'][k] + 1 for k in ('json', 'ts', 'consent', 'license')] == [py['cols'][k] for k in ('json', 'ts', 'consent', 'license')] == [2, 1, 4, 5], (js['cols'], py['cols']))
ok('② 시트의 응답 줄 수(24)와 줄 번호(2…25)가 맞음', js['nrecs'] == 24 and [r['row'] for r in js['records']] == list(range(2, 26)), js['nrecs'])
report('② 가짜 응답 24행', all_diffs(py, js, 'demo'))
it = js['summary']['intake']
ok('② 접수 현황이 가짜 응답을 만들 때 센 값과 같음(접수 24 · 분석 16 · 형식 오류 4종 · 동의 없음 2 · 면허 전 2 · 사전 변경 5개 · 약사 8명)',
   it['received'] == dexp['counts']['received'] == 24 and it['accepted_submissions'] == dexp['counts']['accepted'] == 16 and it['stale_answers'] == dexp['counts']['stale'] == 5 and it['raters'] == 8
   and it['rejected'] == dexp['counts']['rejected'] and it['excluded_by_gate'] == dexp['counts']['gate'], it)
ok('② 시험 모드 표시: 가짜 데이터면 제목·글·HTML 맨 위에 “가짜 데이터” 표시', js['emailSubject'].startswith('[시험용·가짜 데이터]') and js['emailText'].startswith('※ 시험용 · 가짜 데이터입니다') and '가짜 데이터입니다' in js['emailHtml'])
prob, tags = html_problems(js['emailHtml'])
ok('② 스크립트가 만든 메일 HTML 의 속성·닫힘 모양이 맞고 그림·링크·스크립트·양식이 없음', not prob and not any(t in tags for t in ('img', 'a', 'script', 'form', 'iframe', 'link', 'style')), (prob[:2], dict(tags)))
prob2, _ = html_problems(py['eh'])
ok('② 파이썬 도구의 메일 HTML 도 속성·닫힘 모양이 맞음(예전 style 속성 따옴표 겹침 오류가 다시 안 생기게)', not prob2, prob2[:2])
js_plain = node({'sheets': [{'name': SHEET, 'csv': py['path']}], 'steps': [{'do': 'pure', 'demo': False}]})['steps'][0]
py_plain = py_side(header, drows, demo=False, name='demo2.csv')
ok('② 시험 표시가 없는 보통 모드도 제목·글이 파이썬 도구와 같음', js_plain['emailSubject'] == py_plain['subj'] == '[MedTerm-KR 약사검수 요약] 2026-11-07 · 연구용 약사 8명' and js_plain['emailText'] == py_plain['et'] and '시험용' not in js_plain['emailText'], js_plain['emailSubject'])
jt = node({'sheets': [{'name': SHEET, 'csv': py['path'], 'typed': True}], 'steps': [{'do': 'pure', 'demo': True}]})['steps'][0]
ok('② 구글 시트가 시각을 날짜 값으로, 면허 칸을 체크박스(참/거짓)로 돌려줘도 결과가 같음', not diff_summary(jt['summary'], py['S']) and not diff_records(jt['records'], py['ops']['records']) and sets_of(jt['ratings']) == sets_of(py['ops']['ratings']), diff_summary(jt['summary'], py['S'])[:2])

# ═════════ ③ 까다로운 입력 ═════════
trows, TAG = [], {}
def add(tag, text, ts='2026. 11. 5 오전 9:00:00', cons='연구 이용에 동의합니다', lic='Y'):
    TAG[tag] = len(trows); trows.append([ts, text if isinstance(text, str) else J(text), '동의합니다', cons, lic])
def mut(obj, fn): fn(obj); return obj
# 같은 사람의 다른 표기
add('p1', sub('가짜 갑', '가짜약국', ans={1: 'ok', 2: 'ok', 3: ('diff', '가짜메모 하나'), 4: 'unsure'}, created='2026-11-01'), ts='2026. 11. 1 오전 9:00:00')
add('p1_nfd', sub(unicodedata.normalize('NFD', ' 가짜  갑 '), ' 가짜약국 ', ans={3: 'ok', 31: 'diff'}, created='2026-11-03'), ts='2026. 11. 3 오후 2:00:00')
add('p2_case', sub('Kim Lee', 'ABC Pharmacy', ans={1: 'ok'}, created='2026-11-02'))
add('p2_case2', sub('KIM  LEE', 'abc pharmacy', ans={1: 'diff', 2: 'ok'}, created='2026-11-04'))
add('p3_fw', sub('박' + IDEO + '나', '가짜약국3', ans={1: 'ok'}, created='2026-11-02'))
add('p3_nb', sub('박' + NBSP + '나', '가짜약국3', ans={2: 'unsure'}, created='2026-11-04'))
add('p4_diff_org', sub('가짜 갑', '가짜약국2', ans={1: 'ok'}, created='2026-11-02'))
add('p5_zw', sub('이' + ZWSP + '름', '약국', ans={1: 'ok'}))
add('p6_names', sub('가짜을', '가짜병원', scope='names', ans={1: 'ok'}, created='2026-11-02'))
add('p6_law', sub('가짜을', '가짜병원', scope='law', ans={1: 'ok', 2: 'diff'}, created='2026-11-02'))
trows.append(['', '', '', '', '']); trows.append(['  ', '', '', '', ''])
# 날짜
add('d_tomorrow', sub('날짜갑', '가짜약국', created='2026-11-08'))
add('d_future2', sub('날짜을', '가짜약국', created='2026-11-09'))
add('d_old', sub('날짜병', '가짜약국', created='2025-12-31'))
add('d_invalid', sub('날짜정', '가짜약국', created='2026-02-30'))
add('d_format', sub('날짜무', '가짜약국', created='2026-1-5'))
add('d_missing', mut(sub('날짜기', '가짜약국'), lambda o: o.pop('created')))
# 참고 자료
add('r_dupes', sub('참고갑', '가짜약국', refs=('mfds', 'mfds', 'book')))
add('r_bad', mut(sub('참고을', '가짜약국'), lambda o: o.__setitem__('refs', ['nope'])))
add('r_notlist', mut(sub('참고병', '가짜약국'), lambda o: o.__setitem__('refs', 'mfds')))
add('r_other_long', sub('참고정', '가짜약국', refs=('other',), other='가' * 81))
add('r_other_nl', sub('참고무', '가짜약국', refs=('other',), other='a\nb'))
add('r_other_num', mut(sub('참고기', '가짜약국'), lambda o: o.__setitem__('refs_other', 5)))
# 메모
add('m_300', sub('메모갑', '가짜약국', ans={1: ('diff', '가' * 300)}))
add('m_301', sub('메모을', '가짜약국', ans={1: ('diff', '가' * 301)}))
add('m_emoji300', sub('메모병', '가짜약국', ans={1: ('diff', EMOJI * 300)}))
add('m_emoji301', sub('메모정', '가짜약국', ans={1: ('diff', EMOJI * 301)}))
add('m_nl', sub('메모무', '가짜약국', ans={1: ('diff', 'a\nb\tc  d')}))
add('m_bell', sub('메모기', '가짜약국', ans={1: ('diff', 'a' + BELL + 'b')}))
add('m_formula', sub('=가짜수식', '@가짜소속', ans={1: ('diff', '=HYPERLINK("http://example.com","x")'), 2: ('unsure', '+SUM(1)')}))
# 판정 칸
add('v_bad', mut(sub('판정갑', '가짜약국'), lambda o: o['answers'][iid('names', 1)].__setitem__('v', 'maybe')))
add('v_str', mut(sub('판정을', '가짜약국'), lambda o: o['answers'].__setitem__(iid('names', 1), 'ok')))
add('v_nohash', mut(sub('판정병', '가짜약국'), lambda o: o['answers'][iid('names', 1)].pop('h')))
add('v_longhash', mut(sub('판정정', '가짜약국'), lambda o: o['answers'][iid('names', 1)].__setitem__('h', 'x' * 21)))
add('a_list', mut(sub('답갑', '가짜약국'), lambda o: o.__setitem__('answers', [])))
add('a_empty', mut(sub('답을', '가짜약국'), lambda o: o.__setitem__('answers', {})))
add('a_unknown', mut(sub('답병', '가짜약국'), lambda o: o['answers'].__setitem__('N-99999', {'v': 'ok', 'h': 'abcdef0123'})))
add('a_other_scope', mut(sub('답정', '가짜약국'), lambda o: o.__setitem__('scope', 'law')))
add('a_all_stale', mut(sub('답무', '가짜약국', ans={1: 'ok', 2: 'ok'}), lambda o: [a.__setitem__('h', 'deadbeef00') for a in o['answers'].values()]))
add('a_part_stale', mut(sub('답기', '가짜약국', ans={1: 'ok', 2: 'ok', 3: 'ok', 4: 'ok', 5: 'ok'}), lambda o: [o['answers'][iid('names', k)].__setitem__('h', 'deadbeef00') for k in (1, 2, 3)]))
add('a_proto', mut(sub('답경', '가짜약국'), lambda o: o.__setitem__('answers', {'__proto__': {'v': 'ok', 'h': 'x'}})))
# 맨 위 모양
for tag, text in (('t_list', '[]'), ('t_str', '"hi"'), ('t_null', 'null'), ('t_num', '123'), ('t_nan', '{"schema": NaN}'), ('t_trailing', '{"a":1,}'), ('t_empty', ''), ('t_ws', '  \n ')): add(tag, text)
add('t_bom', BOM + J(sub('모양갑', '가짜약국')))
add('t_trunc', J(sub('모양을', '가짜약국', ans={1: 'ok', 2: 'ok'}))[:200])
add('t_dupkey', J(sub('모양병', '가짜약국')).replace(' "scope": "names",', ' "scope": "law",\n "scope": "names",', 1))
# 검수자 칸 · 범위 · 동의서
add('rv_missing', mut(sub('검수갑', '가짜약국'), lambda o: o.pop('reviewer')))
add('rv_noname', sub('', '가짜약국'))
add('rv_nolicense', mut(sub('검수병', '가짜약국'), lambda o: o['reviewer'].__setitem__('license_claimed', False)))
add('rv_nopublic', mut(sub('검수정', '가짜약국'), lambda o: o['reviewer'].pop('public')))
add('rv_longname', sub('가' * 41, '가짜약국'))
add('rv_longorg', sub('검수기', '가' * 81))
add('at_missing', mut(sub('동의갑', '가짜약국'), lambda o: o.pop('attested')))
for tag, val in (('sc_list', ['names']), ('sc_num', 5), ('sc_null', None), ('sc_unknown', 'xyz'), ('sc_proto', '__proto__'), ('sc_ctor', 'constructor')):
    add(tag, mut(sub('범위' + tag, '가짜약국'), lambda o, v=val: o.__setitem__('scope', v)))
# 동의·면허 칸 표기
CONS = ['No', '비동의', '동의하지 않습니다', '동의 안 함', '', '네', 'Yes', '동의합니다', 'x', '아니오', '미동의합니다', '연구 이용에 동의합니다']
for k, c in enumerate(CONS): add(f'g_cons{k}', sub(f'동의자{k:02d}', '가짜약국G', ans={1: 'ok'}, created='2026-11-02'), cons=c)
LIC = ['y ', 'YES', '예', 'O', 'ㅇ', '확인완료', 'x', 'N', '', 'Y', '네', 'TRUE', '1', 'v', '✓', '확인 안 함']
for k, l in enumerate(LIC): add(f'g_lic{k}', sub(f'면허자{k:02d}', '가짜약국L', ans={1: 'ok'}, created='2026-11-02'), lic=l)
# 시각 표기
TSS = ['2026-11-05 14:03:00', '2026/11/05', '11/5/2026 2:03:00 PM', '', 'garbage', '2026. 11. 5 오후 12:00:00', '2026. 11. 5 오전 12:30:00', '2026-11-05T14:03:00']
for k, t in enumerate(TSS): add(f't_ts{k}', sub(f'시각자{k}', '가짜약국T', scope='law', ans={1: 'ok'}, created=f'2026-10-{12 + 3 * k:02d}'), ts=t)
# 같은 사람이 여러 번 — 작성일 → 시각 → 줄 순서로 겹쳐 씀
add('x1', sub('순서자', '가짜약국X', ans={1: 'diff', 2: 'ok'}, created='2026-11-05'), ts='2026. 11. 5 오후 3:00:00')
add('x2', sub('순서자', '가짜약국X', ans={1: 'ok', 3: 'ok'}, created='2026-11-05'), ts='2026. 11. 5 오전 9:00:00')
add('x3', sub('순서자', '가짜약국X', ans={1: 'unsure', 2: 'unsure'}, created='2026-11-04'), ts='2026. 11. 6 오전 9:00:00')
add('x4', sub('순서자', '가짜약국X', ans={4: 'diff'}, created='2026-11-05'), ts='2026. 11. 5 오전 9:00:00')
add('x5', sub('순서자', '가짜약국X', ans={4: 'ok'}, created='2026-11-05'), ts='2026. 11. 5 오전 9:00:00')

py3 = py_side(HEADER, trows, name='tricky.csv')
js3, _ = js_side(py3['path'])
dd = all_diffs(py3, js3, 'tricky')
report(f'③ 까다로운 입력 {len(trows)}행', dd)
rec = {t: js3['records'][TAG[t] - sum(1 for k, r in enumerate(trows[:TAG[t]]) if not any(x.strip() for x in r))] for t in TAG}   # 빈 줄은 기록이 없으므로 그만큼 당김
def reason(t): return rec[t]['reason'] if rec[t]['status'] == 'rejected' else rec[t]['status']
EXPECT = {'p5_zw': 'reviewer', 'd_future2': 'date', 'd_old': 'date', 'd_invalid': 'date', 'd_format': 'date', 'd_missing': 'date', 'r_bad': 'refs', 'r_notlist': 'refs', 'r_other_long': 'length', 'r_other_nl': 'other', 'r_other_num': 'other',
          'm_301': 'length', 'm_emoji301': 'length', 'm_bell': 'other', 'v_bad': 'verdict', 'v_str': 'verdict', 'v_nohash': 'hash', 'v_longhash': 'hash', 'a_list': 'answers', 'a_empty': 'answers', 'a_unknown': 'item_id', 'a_other_scope': 'item_id',
          'a_all_stale': 'all_stale', 'a_proto': 'item_id', 't_list': 'schema', 't_str': 'schema', 't_null': 'schema', 't_num': 'schema', 't_nan': 'json', 't_trailing': 'json', 't_empty': 'empty', 't_ws': 'empty', 't_bom': 'json', 't_trunc': 'json',
          'rv_missing': 'reviewer', 'rv_noname': 'reviewer', 'rv_nolicense': 'license_claim', 'rv_nopublic': 'reviewer', 'rv_longname': 'length', 'rv_longorg': 'length', 'at_missing': 'attested',
          'sc_list': 'other', 'sc_num': 'scope', 'sc_null': 'scope', 'sc_unknown': 'scope', 'sc_proto': 'scope', 'sc_ctor': 'scope'}
wrong = {t: (reason(t), w) for t, w in EXPECT.items() if reason(t) != w}
ok('③ 형식 오류 이유가 손으로 정한 기대와 같음(두 도구가 같은 오해를 하지 않는지 — 날짜 경계·제로폭 글자·NaN·BOM·__proto__ 등 %d종)' % len(EXPECT), not wrong, wrong)
good = [t for t in ('d_tomorrow', 'r_dupes', 'm_300', 'm_emoji300', 'm_nl', 'm_formula', 'a_part_stale', 't_dupkey') if rec[t]['status'] != 'ok']
ok('③ 통과해야 하는 경계 입력(내일 날짜·글자 수 300자·이모티콘 300자·줄바꿈 메모·중복 열쇠 등)은 정상 반영', not good and rec['a_part_stale']['stale'] == 3, good)
same = lambda *t: len({rec[x]['rid'] for x in t}) == 1 and rec[t[0]]['rid']
ok('③ 같은 사람 판단: 이름의 띄어쓰기·분해형 한글·대소문자·전각 공백·줄바꿈 없는 공백 차이는 한 사람, 소속이 다르면 다른 사람',
   same('p1', 'p1_nfd') and same('p2_case', 'p2_case2') and same('p3_fw', 'p3_nb') and rec['p4_diff_org']['rid'] != rec['p1']['rid'] and same('p6_names', 'p6_law'), {t: rec[t]['rid'] for t in ('p1', 'p1_nfd', 'p4_diff_org')})
rp1 = rec['p1']['rid']
ok('③ 같은 사람이 다시 낸 확인서가 항목별로 겹쳐 씀 — 3번 항목은 ‘다르다’(메모 있음)에서 ‘맞다’(메모 없음)로, 메모도 함께 사라짐',
   js3['ratings']['names'][rp1][iid('names', 3)] == 'ok' and iid('names', 3) not in js3['memos']['names'].get(rp1, {}) and js3['ratings']['names'][rp1][iid('names', 31)] == 'diff' and js3['ratings']['names'][rp1][iid('names', 4)] == 'unsure')
rx = rec['x1']['rid']
fx = js3['ratings']['names'][rx]
ok('③ 겹쳐 쓰는 순서: 작성일이 늦은 것 → 같으면 시각이 늦은 것 → 같으면 시트 줄이 뒤인 것이 이김(1번=다르다 · 2번=맞다 · 3번=맞다 · 4번=맞다)',
   (fx[iid('names', 1)], fx[iid('names', 2)], fx[iid('names', 3)], fx[iid('names', 4)]) == ('diff', 'ok', 'ok', 'ok'), fx)
gc = [reason(f'g_cons{k}') for k in range(len(CONS))]
ok('③ 연구 이용 동의 칸 표기: 빈칸·No·비동의·동의하지 않습니다·동의 안 함·x·아니오·미동의 → 제외, 네·Yes·동의합니다 등 → 반영',
   gc == ['research_consent'] * 5 + ['ok', 'ok', 'ok', 'research_consent', 'research_consent', 'research_consent', 'ok'] or all((g == 'ok') == (c in ('네', 'Yes', '동의합니다', '연구 이용에 동의합니다')) for g, c in zip(gc, CONS)), list(zip(CONS, gc)))
gl = [reason(f'g_lic{k}') for k in range(len(LIC))]
ok('③ 면허확인 칸 표기: Y·YES·예·O·ㅇ·확인완료·네·TRUE·1·v·✓ 만 확인으로 읽고 x·N·빈칸·‘확인 안 함’ 은 확인 전', all((g == 'ok') == (l.strip().lower() in ('y', 'yes', '예', 'o', 'ㅇ', '확인완료', '네', 'true', '1', 'v', '✓')) for g, l in zip(gl, LIC)), list(zip(LIC, gl)))
ok('③ 빈 줄은 건너뛰고 응답 시트의 줄 번호는 빈 줄까지 센 값 그대로', len(js3['records']) == len(trows) - 2 and rec['d_tomorrow']['row'] == TAG['d_tomorrow'] + 2 and js3['records'][0]['row'] == 2 and js3['records'][-1]['row'] == len(trows) + 1, (len(js3['records']), js3['records'][-1]['row']))
wk = js3['summary']['scopes']['law']['weekly']
ok('③ 시각을 못 읽는 응답(빈칸·garbage)은 작성일로 첫 응답일을 셈 · 주별 접수의 누적이 마지막 주에 전체 약사 수와 같음', wk and wk[-1]['cum'] == js3['summary']['scopes']['law']['n_raters'] and sum(w['new'] for w in wk) == wk[-1]['cum'], wk[-1] if wk else None)
ok('③ 약사 번호 자릿수: 약사 %d명이면 R01…(두 자리)' % js3['summary']['intake']['raters'], re.fullmatch(r'R\d{2}', rec['p1']['rid']) is not None)

# 약사 번호 자릿수 경계(99명 · 100명)와 NaN 같은 글: 가짜 응답을 곧바로 두 도구에 넣는다
def recs_n(n): return [{'text': J(sub(f'폭{k:03d}', '가짜약국W', scope='law', ans={5: 'ok'}, created='2026-11-02')), 'ts': '2026. 11. 2 오전 9:00:00', 'consent': True, 'license': True, 'row': k + 2} for k in range(n)]
for n, want in ((99, r'R\d{2}'), (100, r'R\d{3}')):
    rs = recs_n(n)
    S, ops = RR.analyze([{'text': r['text'], 'ts': r['ts'], 'consent': True, 'license': True} for r in rs], IT, TODAY)
    jr = node({'steps': [{'do': 'analyze', 'recs': rs}]})['steps'][0]
    pr = {r['rid'] for r in ops['records'] if r['rid']}; jrr = {r['rid'] for r in jr['records'] if r['rid']}
    ok(f'③ 약사 {n}명: 번호가 파이썬 도구와 같고 {"두" if n < 100 else "세"} 자리({min(pr)}…{max(pr)})', pr == jrr and len(pr) == n and all(re.fullmatch(want, x) for x in pr), (min(pr), max(pr), len(jrr)))

# 크기 경계 · 깊이 · 불량 글: 두 도구 모두 멈추지 않고 형식 오류로 센다
def one(text): return [{'text': text, 'ts': '', 'consent': True, 'license': True, 'row': 2}]
cases = {'정확히 100만 바이트(JSON 아님)': '가' * 333333 + 'a', '100만 바이트를 넘음': '가' * 333334, '아주 깊게 겹친 글': '[' * 100000 + ']' * 100000, '짝이 안 맞는 괄호': '{' * 5000}
res_js = {k: node({'steps': [{'do': 'analyze', 'recs': one(t)}]})['steps'][0] for k, t in cases.items()}
res_py = {k: RR.analyze(one(t), IT, TODAY)[1]['records'][0] for k, t in cases.items()}
ok('③ 크기 경계: 정확히 100만 바이트는 ‘JSON 해석 실패’, 1바이트라도 넘으면 ‘크기 초과’ — 두 도구가 같음(글자 3바이트 한글 기준)',
   res_js['정확히 100만 바이트(JSON 아님)']['records'][0]['reason'] == res_py['정확히 100만 바이트(JSON 아님)']['reason'] == 'json' and res_js['100만 바이트를 넘음']['records'][0]['reason'] == res_py['100만 바이트를 넘음']['reason'] == 'too_large',
   (res_js['정확히 100만 바이트(JSON 아님)']['records'][0]['reason'], res_py['100만 바이트를 넘음']['reason']))
ok('③ 아주 깊게 겹친 글·짝이 안 맞는 괄호도 멈추지 않고 형식 오류로 셈(두 도구 모두)', all(res_js[k]['records'][0]['status'] == 'rejected' and res_py[k]['status'] == 'rejected' for k in ('아주 깊게 겹친 글', '짝이 안 맞는 괄호')), {k: (res_js[k]['records'][0]['reason'], res_py[k]['reason']) for k in cases})
pol = node({'steps': [{'do': 'analyze', 'recs': [{'text': t, 'ts': '', 'consent': True, 'license': True, 'row': 2} for t in (json.dumps({'__proto__': {'polluted': True}, 'schema': 'x'}), '{"constructor": {"prototype": {"polluted": 1}}}')]}, {'do': 'eval', 'code': 'typeof ({}).polluted'}]})
ok('③ 약사가 쓴 글에 __proto__·constructor 가 들어 있어도 객체가 오염되지 않음', pol['steps'][1] == 'undefined' and all(r['status'] == 'rejected' for r in pol['steps'][0]['records']), pol['steps'][1])

# 동의·면허 열이 아예 없는 시트(열 이름을 못 찾음) · 문 끄기
hdr2 = HEADER[:3]
rows2 = [r[:3] for r in drows]
py4 = py_side(hdr2, rows2, name='nocols.csv'); js4, _ = js_side(py4['path'])
report('③ 동의·면허 열이 없는 시트', all_diffs(py4, js4, 'nocols'))
ok('③ 열을 못 찾으면 모든 응답이 ‘동의·면허 열 없음(확인 불가)’ 으로 분석에서 빠짐(조용히 통과하지 않음)', js4['summary']['intake']['accepted_submissions'] == 0 and js4['summary']['intake']['excluded_by_gate'] == {'gate_unknown': 20}, js4['summary']['intake'])
py5 = py_side(hdr2, rows2, gates=False, name='nogates.csv'); js5, _ = js_side(py5['path'], gates=False)
report('③ 문 끄기(동의·면허를 보지 않음)', all_diffs(py5, js5, 'nogates'))
ok('③ 문을 끄면 제목에 “[동의·면허 확인 안 함]”, 글·HTML 에 연구에 쓰지 말라는 경고', '[동의·면허 확인 안 함]' in js5['emailSubject'] and '연구에는 쓰지 마세요' in js5['emailHtml'])

# ═════════ ④ 시트·메일 동작(가짜 구글) ═════════
base = {'sheets': [{'name': SHEET, 'csv': py['path']}], 'props': {'SUMMARY_TO': 'report@example.org'}}
secrets = sorted(s for s in py_plain['ops']['secrets'] if len(s) >= 3)
ok('④ (준비) 가짜 응답에서 약사가 쓴 글 %d개를 모아 둠(이름·소속·메모·기타 자료)' % len(secrets), len(secrets) >= 100, len(secrets))
r = node({**base, 'steps': [{'do': 'call', 'fn': 'weeklySummary', 'context': 'trigger'}]}); F = r['final']
ok('④ 매주 요약(weeklySummary): 메일 한 통, 받는 사람은 스크립트 속성의 주소 한 곳뿐, cc·bcc·첨부 없음', len(F['mails']) == 1 and F['mails'][0]['to'] == 'report@example.org' and set(F['mails'][0]['keys']) <= {'to', 'subject', 'body', 'htmlBody', 'name'}, F['mails'][:1] and F['mails'][0]['keys'])
m = F['mails'][0]
ok('④ 메일 제목·글·HTML 이 파이썬 도구가 만든 것과 같고, 약사가 쓴 글이 하나도 섞여 있지 않음', m['subject'] == py_plain['subj'] and m['body'] == py_plain['et'] and not [s for s in secrets if s in m['subject'] + m['body'] + m['htmlBody']], m['subject'])
ok('④ 메일을 보낸 뒤 LAST_MAIL 기록 · 잠금을 잡았다가 풀었음(1·1)', 'LAST_MAIL' in F['props'] and F['lock']['acquired'] == 1 and F['lock']['released'] == 1 and not F['lock']['held'], F['lock'])
ss_resp = sheets_of(F, '응답 시트 파일'); ss_an = analysis_of(F)
ok('④ 응답 시트 파일에는 접수 점검 · 가명표(운영자만) · 메모(운영자만) 시트가 생기고, 분석은 따로 만든 새 시트 파일에 적힘', [s['name'] for s in ss_resp['sheets']] == [SHEET, '접수 점검', '가명표(운영자만)', '메모(운영자만)'] and [s['name'] for s in ss_an['sheets']] == ['요약', '항목별 집계', '분석(가명)', '주별 접수'] and F['props']['ANALYSIS_SSID'] == ss_an['id'] != ss_resp['id'], [s['name'] for s in ss_an['sheets']])
leaks_an = [s for s in secrets if any(s in c for c in cell_texts(ss_an))]
leaks_ck = [s for s in secrets if any(s in c for c in cell_texts({'sheets': [sheet(ss_resp, '접수 점검')]}))]
ok('④ 분석 시트 파일(요약·항목별 집계·분석(가명)·주별 접수)에 약사의 이름·소속·메모·기타 자료가 하나도 없음', not leaks_an, leaks_an[:3])
ok('④ 접수 점검 시트(응답 줄마다 결과 한 줄)에도 이름·소속·메모가 없음', not leaks_ck, leaks_ck[:3])
lk, mm = sheet(ss_resp, '가명표(운영자만)'), sheet(ss_resp, '메모(운영자만)')
ok('④ 가명표·메모 시트는 운영자만 편집으로 보호(편집자 = 소유자 하나, 도메인 편집 끔)', all(s['prots'] == [{'description': 'MedTerm-KR 운영자 전용(이름·소속·메모)', 'editors': ['owner@example.org'], 'domainEdit': False}] for s in (lk, mm)) and not sheet(ss_resp, '접수 점검')['prots'] and not any(s['prots'] for s in ss_an['sheets']), (lk['prots'], mm['prots']))
ok('④ 가명표·메모 시트의 모든 칸이 글자 서식(약사가 쓴 글이 =·+·@ 로 시작해도 수식으로 안 읽힘) · 수식 위험 칸 0', lk['textCells'] == lk['cells'] > 0 and mm['textCells'] == mm['cells'] > 0 and all(not s['risk'] for v in F['spreadsheets'].values() for s in v['sheets']), (lk['textCells'], lk['cells'], mm['textCells'], mm['cells']))
ok('④ 분석 시트 파일은 글자 서식을 쓰지 않음(숫자가 숫자로 남아 계산·그래프가 됨)', all(s['textCells'] == 0 for s in ss_an['sheets']) and isinstance(sheet(ss_an, '항목별 집계')['rows'][1][3], (int, float)) and isinstance(sheet(ss_an, '주별 접수')['rows'][1][2], int), sheet(ss_an, '항목별 집계')['rows'][1])
ok('④ 접수 점검 시트: 응답 줄 수만큼(24줄 + 머리글), 결과 말·이유·약사 번호가 적힘', sheet(ss_resp, '접수 점검')['nrows'] == 25 and [r[2] for r in sheet(ss_resp, '접수 점검')['rows'][1:]].count('정상 반영') == 16 and [r[2] for r in sheet(ss_resp, '접수 점검')['rows'][1:]].count('확인 대기') == 2 and [r[2] for r in sheet(ss_resp, '접수 점검')['rows'][1:]].count('분석 제외') == 2 and [r[2] for r in sheet(ss_resp, '접수 점검')['rows'][1:]].count('형식 오류') == 4)
ok('④ 가명표 시트의 약사 수·메모 시트의 메모 수가 분석과 같음(8명 · 메모 %d개)' % js['summary']['scopes']['names']['memos']['count'], lk['nrows'] == 9 and mm['nrows'] - 1 == sum(s['memos']['count'] for s in js['summary']['scopes'].values()), (lk['nrows'], mm['nrows']))
# 자동 점검은 메일을 보내지 않음 · 속성 없음 · 주소 모양
r = node({**base, 'steps': [{'do': 'call', 'fn': 'onFormSubmitCheck', 'context': 'trigger'}]}); F2 = r['final']
ok('④ 응답이 들어올 때의 점검(onFormSubmitCheck)은 시트만 새로 쓰고 메일은 보내지 않음(주소가 있어도)', not F2['mails'] and 'ANALYSIS_SSID' in F2['props'] and len(sheets_of(F2, '응답 시트 파일')['sheets']) == 4)
r = node({'sheets': base['sheets'], 'steps': [{'do': 'call', 'fn': 'refresh_', 'args': [True], 'context': 'trigger'}]})
ok('④ 받을 주소(SUMMARY_TO)가 없으면 메일을 보내지 않고 이유를 남김(시트는 갱신)', not r['final']['mails'] and 'SUMMARY_TO' in r['steps'][0]['mailNote'] and not r['steps'][0]['mailSent'], r['steps'][0])
bad_to = ['not-an-address', 'a@b', 'a@b.com, c@d.com', 'a b@c.com', 'a@b.com;c@d.com', '<a@b.com>', '']
r = node({'sheets': base['sheets'], 'props': {'SUMMARY_TO': 'x'}, 'steps': [{'do': 'setProp', 'key': 'SUMMARY_TO', 'value': v} for v in bad_to[:0]] + [x for v in bad_to for x in ({'do': 'setProp', 'key': 'SUMMARY_TO', 'value': v}, {'do': 'call', 'fn': 'refresh_', 'args': [True], 'context': 'trigger'})]})
ok('④ 받을 주소가 이상하면(여러 개·공백·꺾쇠·모양 아님·빈 값) 보내지 않음 — 한 주소로만 보냄', not r['final']['mails'] and all(not s['mailSent'] for s in r['steps'] if isinstance(s, dict) and 'mailSent' in s), [s for s in r['steps'] if s and 'mailSent' in s][:2])
r = node({**base, 'steps': [{'do': 'eval', 'code': "(function(){var o=RI.emailText;RI.emailText=function(S){return o(S)+'\\n" + '가짜약사01' + "';};})()"}, {'do': 'call', 'fn': 'refresh_', 'args': [True], 'context': 'trigger'}]})
ok('④ 누출 방지: 메일 글에 약사 이름이 섞이면(고쳐 쓰다 실수한 경우를 흉내) 보내지 않고 이유를 남김', not r['final']['mails'] and '섞여' in r['steps'][1]['mailNote'], r['steps'][1])
r = node({**base, 'steps': [{'do': 'mailThrow', 'message': 'Service invoked too many times for one day: email.'}, {'do': 'call', 'fn': 'weeklySummary', 'context': 'trigger'}, {'do': 'mailThrow'}, {'do': 'call', 'fn': 'refresh_', 'args': [True], 'context': 'trigger'}]})
ok('④ 메일 보내기가 실패해도(하루 한도 등) 오류가 그대로 올라오고(자동 실행이 실패로 기록됨) 잠금은 풀려 다음 실행이 됨', 'error' in r['steps'][1] and 'too many' in r['steps'][1]['error'] and r['final']['lock']['acquired'] == r['final']['lock']['released'] == 2 and r['steps'][3].get('mailSent') is True and len(r['final']['mails']) == 1, (r['steps'][1], r['final']['lock']))
# 다시 돌려도 같음 · 분석 파일 지워짐
r = node({**base, 'steps': [{'do': 'call', 'fn': 'refresh_', 'args': [True]}, {'do': 'dump'}, {'do': 'call', 'fn': 'refresh_', 'args': [True]}, {'do': 'dump'}]})
d1, d2 = r['steps'][1], r['steps'][3]
def freeze(dm): return {v['name']: {s['name']: s['rows'] for s in v['sheets'] if not s['isResponse']} for v in dm['spreadsheets'].values()}
ok('④ 두 번 연달아 돌려도 시트 내용이 같고 시트·파일이 늘어나지 않음(분석 파일 재사용)', freeze(d1) == freeze(d2) and len(d2['spreadsheets']) == 2 and [len(v['sheets']) for v in d2['spreadsheets'].values()] == [4, 4] and d1['props']['ANALYSIS_SSID'] == d2['props']['ANALYSIS_SSID'], len(d2['spreadsheets']))
ok('④ 메일은 요청할 때마다 한 통씩(자동으로 불어나지 않음)', len(d2['mails']) == 2 and d1['lock']['acquired'] == 1 and d2['lock']['acquired'] == d2['lock']['released'] == 2)
r = node({**base, 'steps': [{'do': 'call', 'fn': 'refresh_', 'args': [False]}, {'do': 'deleteSpreadsheet'}, {'do': 'call', 'fn': 'refresh_', 'args': [False]}]})
F3 = r['final']
ok('④ 분석 시트 파일이 지워졌으면 새로 만들고 속성을 갱신(멈추지 않음)', not any('error' in s for s in r['steps'] if isinstance(s, dict)) and F3['props']['ANALYSIS_SSID'] != 'SS2' and any('새로 만듭니다' in l for l in F3['logs']) and sheet(analysis_of(F3), '요약')['nrows'] > 5, F3['props'].get('ANALYSIS_SSID'))
# 응답 시트 찾기 · 자리가 좁은 시트 · 같은 이름 시트
r = node({'sheets': [{'name': '메모장', 'rows': [['메모'], ['x']]}, {'name': SHEET, 'csv': py['path']}], 'props': {}, 'steps': [{'do': 'pure'}]})
ok('④ 응답 시트 이름을 몰라도 확인서 글이 든 시트를 스스로 찾음(첫 시트가 아니어도)', r['steps'][0]['sheetName'] == SHEET and r['steps'][0]['nrecs'] == 24, r['steps'][0].get('sheetName'))
r = node({'sheets': [{'name': '메모장', 'rows': [['메모'], ['x']]}, {'name': SHEET, 'csv': py['path']}], 'props': {'RESPONSE_SHEET': '메모장'}, 'steps': [{'do': 'pure'}]})
ok('④ 스크립트 속성 RESPONSE_SHEET 로 시트를 지정하면 그 시트를 읽음', r['steps'][0]['sheetName'] == '메모장' and r['steps'][0]['nrecs'] == 1, r['steps'][0].get('sheetName'))
r = node({'sheets': [{'name': SHEET, 'rows': [HEADER, ['', 'hello', '', '', '']]}], 'steps': [{'do': 'pure'}]})
ok('④ 확인서 글이 하나도 없는 시트도 멈추지 않고 읽음(형식 오류로 셈)', 'error' not in r['steps'][0] and r['steps'][0]['summary']['intake']['rejected'] == {'json': 1}, r['steps'][0].get('error') or r['steps'][0]['summary']['intake'])
r = node({**base, 'maxRows': 5, 'maxCols': 6, 'steps': [{'do': 'call', 'fn': 'refresh_', 'args': [True], 'context': 'trigger'}]})
ok('④ 시트 자리가 좁아도(5줄 · 6칸) 줄·칸을 늘려 쓰고 메일도 나감(오류 없음)', 'error' not in r['steps'][0] and len(r['final']['mails']) == 1 and sheet(sheets_of(r['final'], '응답 시트 파일'), '접수 점검')['nrows'] == 25, r['steps'][0])
r = node({**base, 'steps': [{'do': 'call', 'fn': 'refresh_', 'args': [False]}, {'do': 'addRow', 'sheet': SHEET, 'cells': ['2026. 11. 7 오후 1:00:00', J(sub('추가약사', '가짜약국Z', ans={1: 'ok'}, created='2026-11-07')), '동의합니다', '연구 이용에 동의합니다', 'Y']}, {'do': 'call', 'fn': 'onFormSubmitCheck', 'context': 'trigger'}]})
ck = sheet(sheets_of(r['final'], '응답 시트 파일'), '접수 점검')
ok('④ 새 응답이 들어온 뒤 다시 점검하면 접수 점검이 한 줄 늘고 약사가 한 명 늘어남', ck['nrows'] == 26 and ck['rows'][-1][2] == '정상 반영' and ck['rows'][-1][5] == 'R09' and sheet(sheets_of(r['final'], '응답 시트 파일'), '가명표(운영자만)')['nrows'] == 10, ck['rows'][-1])
r = node({**base, 'steps': [{'do': 'call', 'fn': 'refresh_', 'args': [True]}, {'do': 'call', 'fn': 'refresh_', 'args': [True]}]})
r2 = node({**base, 'steps': [{'do': 'eval', 'code': 'LockService.getScriptLock().waitLock(1)'}, {'do': 'call', 'fn': 'weeklySummary', 'context': 'trigger'}]})
ok('④ 잠금: 다른 실행이 잡고 있으면 기다리다 오류(시트를 반쯤 쓴 채로 두지 않음)', 'Lock timeout' in r2['steps'][1].get('error', '') and not r2['final']['mails'] and r2['final']['lock']['acquired'] == 1, r2['steps'][1])

# ═════════ ⑤ 처음 설정 · 메뉴 · 자동 실행 ═════════
fbase = {**base, 'form': True}   # 구글 폼이 연결된 시트 파일(폼 방식). 폼이 없는 앱 접수용 시트 파일은 ⑦ 에서 시험한다.
r = node({**fbase, 'props': {}, 'steps': [{'do': 'eval', 'code': 'onOpen()'}, {'do': 'setup', 'button': 'OK', 'text': '  report@example.org  '}]})
F = r['final']; tr = F['triggers']
ok('⑤ 처음 설정: 주소를 속성에 저장(앞뒤 공백 제거) · 점검 시트 생성 · 메일은 안 보냄', F['props'].get('SUMMARY_TO') == 'report@example.org' and not F['mails'] and 'ANALYSIS_SSID' in F['props'], F['props'])
ok('⑤ 자동 실행 세 개: 응답이 올 때마다(스프레드시트 양식 제출·구글 폼 전용) · 한 시간마다(앱 접수 점검) · 매주 월요일 9시', sorted((t['fn'], t.get('event') or '', t.get('weekday') or '', t.get('hour') or 0, t.get('every') or '', t.get('n') or 0) for t in tr) == [('hourlyCheck', '', '', 0, 'hours', 1), ('onFormSubmitCheck', 'onFormSubmit', '', 0, '', 0), ('weeklySummary', '', 'MONDAY', 9, '', 0)] and next(t for t in tr if t['fn'] == 'onFormSubmitCheck')['ss'] == sheets_of(F, '응답 시트 파일')['id'], tr)
ok('⑤ 메뉴 MedTerm-KR: 처음 설정 · 앱 접수 열기·닫기·상태 · 지금 점검·분석 새로 만들기 · 요약 메일 지금 보내기', len(F['menus']) == 1 and F['menus'][0]['name'] == 'MedTerm-KR' and [x[1] for x in F['menus'][0]['items']] == ['setup', 'openIntake', 'closeIntake', 'intakeStatus', 'refreshNow', 'sendSummaryNow'], F['menus'])
ok('⑤ 메뉴·자동 실행이 부르는 함수가 모두 스크립트에 있음', all(t == 'function' for _, t in r['globalsDefined']), r['globalsDefined'])
ok('⑤ 완료 안내에 받을 주소가 보임(어디로 가는지 확인)', any('report@example.org' in a for a in F['alerts'][-1:]), F['alerts'][-1:])
r = node({**fbase, 'props': {}, 'steps': [{'do': 'setup', 'button': 'OK', 'text': 'first@example.org'}, {'do': 'setup', 'button': 'OK', 'text': 'second@example.org'}, {'do': 'setup', 'button': 'OK', 'text': ''}, {'do': 'setup', 'button': 'OK', 'text': 'nope'}, {'do': 'setup', 'button': 'CANCEL', 'text': 'third@example.org'}]})
F = r['final']
ok('⑤ 다시 설정해도 자동 실행이 겹쳐 늘지 않음(3개 그대로) · 빈 입력은 주소를 그대로 둠 · 이상한 주소와 취소는 아무것도 바꾸지 않음', len(F['triggers']) == 3 and F['props']['SUMMARY_TO'] == 'second@example.org' and any('모양이 아닙니다' in a for a in F['alerts']), (len(F['triggers']), F['props'].get('SUMMARY_TO')))
r = node({**fbase, 'props': {}, 'steps': [{'do': 'setup', 'button': 'OK', 'text': 'nope'}, {'do': 'setup', 'button': 'CANCEL', 'text': 'x@example.org'}]})
ok('⑤ 처음부터 이상한 주소·취소면 자동 실행도 속성도 안 만듦', not r['final']['triggers'] and 'SUMMARY_TO' not in r['final']['props'] and 'ANALYSIS_SSID' not in r['final']['props'], r['final']['props'])
r = node({**fbase, 'steps': [{'do': 'eval', 'code': "ScriptApp.newTrigger('otherHandler').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(8).create()"}, {'do': 'setup', 'button': 'OK', 'text': ''}]})
ok('⑤ 설정은 이 스크립트의 자동 실행 세 개만 다시 만들고, 다른 자동 실행은 건드리지 않음', sorted(t['fn'] for t in r['final']['triggers']) == ['hourlyCheck', 'onFormSubmitCheck', 'otherHandler', 'weeklySummary'], r['final']['triggers'])
r = node({**fbase, 'steps': [{'do': 'eval', 'code': 'sendSummaryNow()'}, {'do': 'mailThrow', 'message': 'quota'}, {'do': 'eval', 'code': 'sendSummaryNow()'}, {'do': 'setProp', 'key': 'SUMMARY_TO', 'value': ''}, {'do': 'eval', 'code': 'sendSummaryNow()'}, {'do': 'eval', 'code': 'refreshNow()'}]})
al = r['final']['alerts']
ok('⑤ 메뉴의 ‘요약 메일 지금 보내기’: 성공·실패·주소 없음을 각각 대화 상자로 알림(오류가 그대로 터지지 않음), ‘새로 만들기’도 안내', al[0] == '요약 메일을 보냈습니다.' and '메일을 보내지 못했습니다' in al[1] and 'quota' in al[1] and '메일을 보내지 않았습니다' in al[2] and '새로 만들었습니다' in al[3], al)
r = node({**fbase, 'steps': [{'do': 'call', 'fn': 'onFormSubmitCheck', 'context': 'trigger'}, {'do': 'call', 'fn': 'weeklySummary', 'context': 'trigger'}]})
ok('⑤ 자동 실행(화면 없는 상태)에서는 대화 상자를 부르지 않아 오류 없이 돎', all(s is None or 'error' not in s for s in r['steps']) and len(r['final']['mails']) == 1, r['steps'])

# ═════════ ⑥ 시험 모드 · 많은 응답 ═════════
r = node({**base, 'props': {'SUMMARY_TO': 'report@example.org', 'DEMO_MODE': '1'}, 'steps': [{'do': 'call', 'fn': 'weeklySummary', 'context': 'trigger'}]}); F = r['final']
ok('⑥ 시험 모드(DEMO_MODE=1): 메일 제목·글·HTML 과 분석 요약·접수 점검에 “시험용 · 가짜 데이터” 표시',
   F['mails'][0]['subject'].startswith('[시험용·가짜 데이터]') and F['mails'][0]['body'].startswith('※ 시험용') and '가짜 데이터입니다' in F['mails'][0]['htmlBody'] and sheet(analysis_of(F), '요약')['rows'][1][0] == '※'
   and any('시험용' in str(c) for row in sheet(sheets_of(F, '응답 시트 파일'), '접수 점검')['rows'] for c in row), F['mails'][0]['subject'])
ok('⑥ 시험 모드가 아니면 어디에도 시험 표시가 없음', all('시험용' not in c for c in cell_texts(analysis_of(node({**base, 'steps': [{'do': 'call', 'fn': 'refresh_', 'args': [False]}]})['final']))))
def make_big(n_people=150, seed=7):
    rnd, out = random.Random(seed), []
    for p in range(n_people):
        for sc in ('names', 'law'):
            ans = {}
            for no in range(1, len(IT['items'][sc]) + 1):
                if rnd.random() < 0.9:
                    x = rnd.random(); ans[no] = 'diff' if x < 0.12 else ('unsure' if x < 0.2 else 'ok')
            out.append([f'2026. 10. {1 + p % 28} 오전 9:{p % 60:02d}:00', J(sub(f'대량{p:03d}', f'가짜약국{p % 17}', scope=sc, ans=ans or {1: 'ok'}, created=f'2026-10-{1 + p % 28:02d}')), '동의합니다', '연구 이용에 동의합니다', 'Y'])
    return out
big = make_big()
pyb = py_side(HEADER, big, name='big.csv')
t0 = time.time(); rb = node({'sheets': [{'name': SHEET, 'csv': pyb['path']}], 'props': {'SUMMARY_TO': 'report@example.org'}, 'steps': [{'do': 'pure'}, {'do': 'call', 'fn': 'refresh_', 'args': [True], 'context': 'trigger'}]}); el = time.time() - t0
jb = rb['steps'][0]
report('⑥ 많은 응답(약사 150명 × 두 범위 = 300건, 약 %d MB)' % (os.path.getsize(pyb['path']) // 1000000 or 1), all_diffs(pyb, jb, 'big'))
ok('⑥ 많은 응답도 한 번에 끝남(%.1f초; 구글 한도는 한 번에 6분) · 메일 한 통' % el, el < 60 and len(rb['final']['mails']) == 1 and 'error' not in rb['steps'][1], el)
ak = analysis_of(rb['final'])
ok('⑥ 많은 응답에서도 분석 파일이 구글 시트 한도 안(분석(가명) %d줄 × %d칸 ≪ 천만 칸 · 한 칸 5만 자 이하)' % (sheet(ak, '분석(가명)')['nrows'], sheet(ak, '분석(가명)')['ncols']), sum(s['nrows'] * s['ncols'] for s in ak['sheets']) < 10000000 and sheet(ak, '분석(가명)')['nrows'] > 10000 and all(len(str(c)) <= 50000 for s in ak['sheets'] for r_ in s['rows'] for c in r_))


# ═════════ ⑦ 앱 접수(웹 앱 doPost) — 앱의 동의서를 거쳐 ‘보내기’로 온 확인서를 시트에 적는다 ═════════
CV = 'c-0123456789'
RESP_HEAD = ['타임스탬프', '확인서(JSON)', '개인정보 수집·이용 동의(1단계·필수)', '연구 이용 동의(2단계·선택)', '면허확인(운영자 기입)', '접수 경로', '동의서 버전', '앱 버전']
def csub(name, org, research=True, version=CV, collect=True, draft=None, **kw):
    """동의 기록(consent)이 든 가짜 확인서 — 앱이 동의서 화면을 거치면 이 칸이 붙는다."""
    s = sub(name, org, **kw)
    c = {'version': version, 'collect': collect, 'research': research, 'date': '2026-11-07'}
    if draft is not None: c['draft'] = draft
    s['consent'] = c
    return s
def env(s, kind='medterm-kr-submit/1'): return json.dumps({'kind': kind, 'text': s if isinstance(s, str) else json.dumps(s, ensure_ascii=False)}, ensure_ascii=False)
OPEN = {'SUMMARY_TO': 'report@example.org', 'INTAKE_OPEN': '1', 'CONSENT_VERSION': CV}
def post(body, **kw): return {'do': 'doPost', 'body': body, **kw}
def resp_sheet(F): return next((s for v in F['spreadsheets'].values() if v['name'] == '응답 시트 파일' for s in v['sheets'] if s['name'] == '응답'), None)
def sheet_names(F): return [s['name'] for v in F['spreadsheets'].values() if v['name'] == '응답 시트 파일' for s in v['sheets']]
valid = csub('가짜약사A', '가짜약국1')
good = env(valid)
def mut(f):
    s = json.loads(json.dumps(valid, ensure_ascii=False)); f(s); return s

# 기본은 닫힘
for tag, pr in (('접수를 연 적 없음', {}), ('닫기 표시(0)', {'INTAKE_OPEN': '0', 'CONSENT_VERSION': CV}), ('동의서 버전을 적은 적 없음', {'INTAKE_OPEN': '1'}), ('열림 표시가 1이 아님(true)', {'INTAKE_OPEN': 'true', 'CONSENT_VERSION': CV})):
    r = node({'props': {'SUMMARY_TO': 'report@example.org', **pr}, 'steps': [post(good), {'do': 'doGet'}]}); F = r['final']; rp = r['steps'][0]['parsed']
    ok(f'⑦ 닫힘({tag}): 올바른 확인서도 받지 않고(closed) 시트를 만들지 않으며 잠금은 풀림 · 주소를 열어 보면 닫힘으로 보임', rp and rp['ok'] is False and rp['code'] == 'closed' and not sheet_names(F) and F['lock']['acquired'] == F['lock']['released'] == 1 and r['steps'][1]['parsed'] == {'ok': True, 'kind': 'medterm-kr-intake/1', 'open': False}, (rp, F['lock'], sheet_names(F)))

# 정상 접수
r = node({'props': dict(OPEN), 'steps': [post(good), {'do': 'doGet'}]}); F = r['final']; rs = resp_sheet(F); rp = r['steps'][0]['parsed']
ok('⑦ 열려 있고 동의 기록·버전이 맞으면 ‘응답’ 시트에 한 줄 적고 줄 번호·분 단위 시각만 돌려줌(JSON 응답)', rp == {'ok': True, 'n': 1, 'at': '2026-11-07 12:00'} and r['steps'][0]['mime'] == 'JSON' and rs and rs['nrows'] == 2 and rs['rows'][0] == RESP_HEAD, (rp, rs and rs['rows'][:1]))
row = rs['rows'][1]
ok('⑦ 적힌 줄: 시각 · 확인서 글(보낸 내용 그대로, 한 줄로 줄임) · 동의 · 동의 · 면허확인 빈 칸 · 접수 경로 앱 · 동의서 버전 · 앱 버전', row[0] == '2026-11-07 12:00:00' and json.loads(row[1]) == valid and row[2:] == ['동의', '동의', '', '앱', CV, '1.6.0'], row)
ok('⑦ 적힌 칸은 모두 글자 서식(수식으로 읽히지 않음) · 수식 위험 칸 0 · 점검 표시(INTAKE_DIRTY) · 잠금 1회 잡고 1회 풂', rs['textCells'] == 7 and not rs['risk'] and F['props'].get('INTAKE_DIRTY') == '1' and F['lock']['acquired'] == F['lock']['released'] == 1, (rs['textCells'], rs['risk'], F['props'], F['lock']))
ok('⑦ 돌려주는 글에 약사 이름·소속이 없음 · 주소를 열어 보면 열림으로 보임(시트 내용은 없음)', '가짜약사A' not in r['steps'][0]['content'] and '가짜약국1' not in r['steps'][0]['content'] and r['steps'][1]['parsed'] == {'ok': True, 'kind': 'medterm-kr-intake/1', 'open': True}, r['steps'][1])
r = node({'props': dict(OPEN), 'steps': [post(env(csub('가짜약사B', '가짜약국2', research=False)))]}); rs = resp_sheet(r['final'])
ok('⑦ 연구 이용(2단계)에 동의하지 않아도 받음 — 시트에는 ‘비동의’로 적힘(분석에서만 빠짐)', r['steps'][0]['parsed']['ok'] is True and rs['rows'][1][2:4] == ['동의', '비동의'], rs['rows'][1])
r = node({'props': {**OPEN, 'DEMO_MODE': '1'}, 'steps': [post(good)]}); rs = resp_sheet(r['final'])
ok('⑦ 시험 모드(DEMO_MODE=1)면 접수 경로에 ‘앱(시험)’ 표시', rs['rows'][1][5] == '앱(시험)', rs['rows'][1])

# 어긋나면 한 줄도 적지 않음
cases = [
    ('빈 글', '', 'bad_request'), ('JSON 아님', 'hello', 'bad_request'), ('JSON 배열', '[]', 'bad_request'),
    ('종류 표시(kind)가 다름', env(valid, kind='other/1'), 'bad_request'), ('text 가 글자가 아님', json.dumps({'kind': 'medterm-kr-submit/1', 'text': {'a': 1}}), 'bad_request'),
    ('확인서 글이 JSON 아님', env('not json'), 'invalid'), ('확인서 글이 배열', env('[]'), 'invalid'),
    ('형식(schema)이 다름', env(mut(lambda s: s.update(schema='x/1'))), 'invalid'),
    ('면허 보유 표시 없음', env(mut(lambda s: s['reviewer'].update(license_claimed=False))), 'invalid'),
    ('작성일이 미래', env(mut(lambda s: s.update(created='2026-12-31'))), 'invalid'),
    ('아주 긴 schema 값(되돌려 보내는 글이 길어지지 않음)', env(mut(lambda s: s.update(schema='x' * 5000))), 'invalid'),
    ('동의 기록 없음', env(mut(lambda s: s.pop('consent'))), 'no_consent'), ('동의 기록이 객체가 아님', env(mut(lambda s: s.update(consent='yes'))), 'no_consent'),
    ('1단계 동의(collect)가 false', env(csub('가짜약사A', '가짜약국1', collect=False)), 'no_consent'), ('1단계 동의가 글자 “true”', env(mut(lambda s: s['consent'].update(collect='true'))), 'no_consent'),
    ('2단계(research)가 true/false 아님', env(mut(lambda s: s['consent'].update(research='yes'))), 'no_consent'), ('2단계(research) 칸 없음', env(mut(lambda s: s['consent'].pop('research'))), 'no_consent'),
    ('동의서 초안(draft)으로 만든 확인서', env(csub('가짜약사A', '가짜약국1', draft=True)), 'draft'),
    ('동의서 버전이 다름', env(csub('가짜약사A', '가짜약국1', version='c-ffffffffff')), 'version'), ('버전 모양이 이상함', env(csub('가짜약사A', '가짜약국1', version='bad version!')), 'version'), ('버전 칸 없음', env(mut(lambda s: s['consent'].pop('version'))), 'version'),
    ('보낸 글이 20만 자 넘음', env(mut(lambda s: s.update(junk='a' * 200001))), 'too_large'), ('시트 한 칸 한도(4.5만 자) 넘음', env(mut(lambda s: s.update(junk='a' * 46000))), 'too_large'),
]
r = node({'props': dict(OPEN), 'steps': [post(b) for _, b, _ in cases]}); F = r['final']; rs = resp_sheet(F)
got = [(t, st['parsed'] and st['parsed'].get('code'), exp) for (t, _, exp), st in zip(cases, r['steps'])]
wrong = [g for g in got if g[1] != g[2]]
ok('⑦ 어긋난 보냄 %d가지(빈 글·JSON 아님·kind 다름·형식·면허 표시·미래 날짜·동의 기록 없음/비정상·초안·버전 다름·너무 큼)가 각각 알맞은 이유 코드로 거절됨' % len(cases), not wrong, wrong[:3])
ok('⑦ 거절된 보냄은 시트에 한 줄도 적지 않고(응답 시트가 없거나 머리글뿐) 점검 표시도 안 켬 · 매번 잠금을 잡았다 풂 · 메일 없음', (rs is None or rs['nrows'] <= 1) and 'INTAKE_DIRTY' not in F['props'] and F['lock']['acquired'] == F['lock']['released'] == len(cases) and not F['mails'], (rs and rs['nrows'], F['lock']))
msgs = [st['parsed'].get('msg', '') for st in r['steps']]
ok('⑦ 거절 안내는 모두 짧은 한국어 문장(300자 이하) — 보낸 글을 길게 되돌려 보내지 않음 · 약사 이름·소속이 없음', all(0 < len(m) <= 300 for m in msgs) and not [m for m in msgs if '가짜약사A' in m or '가짜약국1' in m], max(len(m) for m in msgs))
ok('⑦ 이상하게 짧은 이유도 확인서 문제는 ‘invalid’, 동의 문제는 ‘no_consent·draft·version’로 나뉨(앱이 안내를 고를 수 있게)', {c for _, c, _ in got} == {'bad_request', 'invalid', 'no_consent', 'draft', 'version', 'too_large'}, sorted({c for _, c, _ in got}))
r = node({'props': dict(OPEN), 'steps': [post(env(mut(lambda s: s.update(junk='a' * 40000))))]}); rs = resp_sheet(r['final'])
ok('⑦ 한도 안의 큰 확인서(약 4만 자)는 오류 없이 적힘(시트 한 칸 5만 자 이하)', r['steps'][0]['parsed']['ok'] is True and 40000 < len(rs['rows'][1][1]) <= 45000, len(rs['rows'][1][1]) if rs else None)

# 이름이 =·+ 로 시작해도 수식이 되지 않음 · app 칸 정리
s2 = csub('=HYPERLINK("http://x","y")', '+SUM(1)'); s2['app'] = '=1+1'
r = node({'props': dict(OPEN), 'steps': [post(env(s2)), post(env(mut(lambda s: s.update(app='a' * 21))))]}); rs = resp_sheet(r['final'])
ok('⑦ 이름·소속이 =·+ 로 시작해도 수식이 되지 않음(확인서 글 칸은 ‘{’로 시작하고 글자 서식) · 앱 판 칸은 영문·숫자·점·밑줄·줄표 20자만 받고 나머지는 빈 칸', r['steps'][0]['parsed']['ok'] and not rs['risk'] and rs['rows'][1][1].startswith('{') and rs['rows'][1][7] == '' and rs['rows'][2][7] == '', (rs['rows'][1][7], rs['rows'][2][7], rs['risk']))

# 잠금 · 한도 · 서버 오류
r = node({'props': dict(OPEN), 'steps': [{'do': 'holdLock'}, post(good), {'do': 'releaseLock'}, post(good)]}); F = r['final']; rs = resp_sheet(F)
ok('⑦ 다른 실행이 잠금을 잡고 있으면 기다리다 ‘busy’(적지 않음 · 남의 잠금을 풀지 않음) · 풀린 뒤에는 받음', r['steps'][1]['parsed']['code'] == 'busy' and r['steps'][3]['parsed']['ok'] and rs['nrows'] == 2 and F['lock']['acquired'] == 1 and F['lock']['released'] == 1, (r['steps'][1]['parsed'], F['lock']))
r = node({'props': {**OPEN, 'INTAKE_MAX_ROWS': '2'}, 'steps': [post(good), post(good), post(good)]}); F = r['final']; rs = resp_sheet(F)
ok('⑦ 접수 한도(INTAKE_MAX_ROWS=2): 세 번째는 ‘full’ — 시트는 2줄까지만 · 잠금은 풀림', [x['parsed'].get('code', 'ok') for x in r['steps']] == ['ok', 'ok', 'full'] and rs['nrows'] == 3 and F['lock']['acquired'] == F['lock']['released'] == 3, ([x['parsed'] for x in r['steps']], rs['nrows']))
r = node({'props': {**OPEN, 'INTAKE_MAX_ROWS': 'abc'}, 'steps': [post(good)]})
ok('⑦ 한도 값이 숫자가 아니면 기본값(3000)으로 받음', r['steps'][0]['parsed']['ok'] is True, r['steps'][0]['parsed'])
r = node({'props': dict(OPEN), 'steps': [{'do': 'eval', 'code': "ensureResponseSheet_ = function () { throw new Error('boom-secret'); };"}, post(good)]}); F = r['final']
ok('⑦ 시트 쓰기 중 오류가 나면 ‘server’ 로 안내하고 오류 내용은 돌려주지 않음(운영자 로그에만 남음) · 잠금은 풀림', r['steps'][1]['parsed']['code'] == 'server' and 'boom-secret' not in r['steps'][1]['content'] and any('boom-secret' in l for l in F['logs']) and F['lock']['acquired'] == F['lock']['released'] == 1, (r['steps'][1]['content'], F['logs']))
r = node({'props': dict(OPEN), 'steps': [{'do': 'doPost', 'noEvent': True}, {'do': 'doPost', 'noPostData': True}]})
ok('⑦ 웹 앱 호출에 내용이 없거나(이벤트·postData 없음) 오류가 나도 터지지 않고 bad_request 로 답함', [x['parsed'].get('code') for x in r['steps']] == ['bad_request', 'bad_request'], r['steps'])
r = node({'props': dict(OPEN), 'steps': [post(good), post(good)]}); rs = resp_sheet(r['final'])
ok('⑦ 같은 확인서를 두 번 보내도(응답이 안 와서 다시 누른 경우) 두 줄이 적히고 오류 없음', [x['parsed'].get('n') for x in r['steps']] == [1, 2] and rs['nrows'] == 3, rs['nrows'])

# 메뉴: 접수 열기·닫기·상태
r = node({'props': {'SUMMARY_TO': 'report@example.org'}, 'steps': [
    {'do': 'menu', 'fn': 'openIntake', 'button': 'OK', 'text': 'ab'}, {'do': 'menu', 'fn': 'openIntake', 'button': 'OK', 'text': 'bad version!'}, {'do': 'menu', 'fn': 'openIntake', 'button': 'CANCEL', 'text': CV}, {'do': 'dump'},
    {'do': 'menu', 'fn': 'openIntake', 'button': 'OK', 'text': '  ' + CV + '  '}, {'do': 'dump'}, post(good), {'do': 'menu', 'fn': 'intakeStatus'}, {'do': 'menu', 'fn': 'closeIntake'}, post(good), {'do': 'doGet'}]})
d0, d1, F = r['steps'][3], r['steps'][5], r['final']; al = F['alerts']
ok('⑦ 접수 열기: 버전 모양이 이상하거나(2자·공백·느낌표) 취소면 아무것도 바꾸지 않음', 'INTAKE_OPEN' not in d0['props'] and 'CONSENT_VERSION' not in d0['props'] and not sheet_names(d0) and sum('버전 모양이 아닙니다' in a for a in al) == 2, (d0['props'], al[:3]))
ok('⑦ 접수 열기: 버전을 적으면(앞뒤 공백 제거) ‘응답’ 시트(머리글 포함)를 만들고 점검이 그 시트를 읽도록 정하고 열림 · 시트 번호를 적어 둠', d1['props'].get('INTAKE_OPEN') == '1' and d1['props'].get('CONSENT_VERSION') == CV and d1['props'].get('RESPONSE_SHEET') == '응답' and d1['props'].get('SS_ID') == 'SS1' and resp_sheet(d1)['rows'][0] == RESP_HEAD and any('앱 접수를 열었습니다(동의서 버전 ' + CV + ')' in a for a in al), (d1['props'], al[-4:]))
ok('⑦ 접수 상태 보기: 열림 · 버전 · 받은 줄 수를 알려 줌(시트 내용은 없음) · 닫으면 이후 보냄은 closed · 이미 받은 줄은 그대로', any('열려 있음' in a and CV in a and '받은 줄: 1줄' in a and '가짜약사A' not in a for a in al) and any('닫았습니다' in a for a in al) and r['steps'][9]['parsed']['code'] == 'closed' and r['steps'][10]['parsed']['open'] is False and resp_sheet(F)['nrows'] == 2, (al, r['steps'][9]['parsed']))
r = node({'props': {'SUMMARY_TO': 'report@example.org', 'DEMO_MODE': '1'}, 'steps': [{'do': 'menu', 'fn': 'openIntake', 'button': 'OK', 'text': CV}]})
ok('⑦ 시험 모드가 켜진 채 접수를 열면 안내에 ‘진짜 응답을 받기 전에 지우세요’가 보임', any('DEMO_MODE' in a and '지우세요' in a for a in r['final']['alerts']), r['final']['alerts'][-1:])
r = node({'props': {'SUMMARY_TO': 'report@example.org'}, 'sheets': [{'name': SHEET, 'csv': py['path']}], 'steps': [{'do': 'menu', 'fn': 'openIntake', 'button': 'OK', 'text': CV}]})
ok('⑦ 다른 시트에 이미 확인서 글(구글 폼 응답 등)이 있으면 접수를 열 때 “그 시트는 점검에서 빠진다”고 경고', any('다른 시트(' + SHEET + ')' in a and '한 가지 방식만' in a for a in r['final']['alerts']), r['final']['alerts'][-1:])

# 처음 설정(앱 접수용 새 시트 파일 / 구글 폼이 있는 시트 / 붙여 넣은 시트)
r = node({'props': {}, 'steps': [{'do': 'setup', 'button': 'OK', 'text': 'report@example.org'}]}); F = r['final']
ok('⑦ 처음 설정(폼이 없는 새 시트 파일): ‘응답’ 시트(머리글)를 만들고 점검이 그 시트를 읽도록 정함 · 시트 번호 저장 · 접수는 아직 닫힘', 'error' not in (r['steps'][0] or {}) and sheet_names(F) == ['응답', '접수 점검', '가명표(운영자만)', '메모(운영자만)'] and resp_sheet(F)['rows'][0] == RESP_HEAD and F['props'].get('RESPONSE_SHEET') == '응답' and F['props'].get('SS_ID') == 'SS1' and 'INTAKE_OPEN' not in F['props'] and not F['mails'], (sheet_names(F), F['props']))
ok('⑦ 처음 설정(폼 없음): 자동 실행은 한 시간마다 점검 · 매주 월요일 9시 둘뿐(폼 제출 실행은 만들지 않음) · 안내에 웹 앱 배포 순서가 보임', sorted((t['fn'], t.get('every') or t.get('weekday') or '') for t in F['triggers']) == [('hourlyCheck', 'hours'), ('weeklySummary', 'MONDAY')] and any('웹 앱' in a and '앱 접수 열기' in a for a in F['alerts'][-1:]), (F['triggers'], F['alerts'][-1:]))
r = node({'props': {}, 'form': True, 'sheets': [{'name': SHEET, 'csv': py['path']}], 'steps': [{'do': 'setup', 'button': 'OK', 'text': 'report@example.org'}]}); F = r['final']
ok('⑦ 처음 설정(구글 폼이 연결된 시트): ‘응답’ 시트를 만들지 않고 읽을 시트도 정하지 않음 · 폼 제출 실행을 포함한 세 개 · 섞어 쓰지 말라는 안내', '응답' not in sheet_names(F) and 'RESPONSE_SHEET' not in F['props'] and sorted(t['fn'] for t in F['triggers']) == ['hourlyCheck', 'onFormSubmitCheck', 'weeklySummary'] and any('섞어 쓰지' in a for a in F['alerts'][-1:]), (sheet_names(F), F['props'], F['alerts'][-1:]))
r = node({'props': {}, 'sheets': [{'name': SHEET, 'csv': py['path']}], 'steps': [{'do': 'setup', 'button': 'OK', 'text': 'report@example.org'}]}); F = r['final']
ok('⑦ 처음 설정(폼 없이 확인서를 붙여 넣은 시트가 있는 파일): 그 시트를 가로채지 않음 — ‘응답’ 시트를 만들지 않고 읽을 시트도 정하지 않아 기존 점검이 그대로 됨', '응답' not in sheet_names(F) and 'RESPONSE_SHEET' not in F['props'] and sheet(sheets_of(F, '응답 시트 파일'), '접수 점검')['nrows'] == 25 and not any('웹 앱' in a for a in F['alerts'][-1:]), (sheet_names(F), F['props']))
r = node({'props': {}, 'steps': [{'do': 'setup', 'button': 'OK', 'text': 'report@example.org'}, {'do': 'menu', 'fn': 'openIntake', 'button': 'OK', 'text': CV}, post(good), {'do': 'setup', 'button': 'OK', 'text': ''}]}); F = r['final']
ok('⑦ 처음 설정을 다시 해도 받은 줄이 지워지지 않고 자동 실행이 겹쳐 늘지 않음(2개) · 열림 상태 유지', resp_sheet(F)['nrows'] == 2 and len(F['triggers']) == 2 and F['props'].get('INTAKE_OPEN') == '1' and 'error' not in (r['steps'][3] or {}), (resp_sheet(F)['nrows'], F['triggers']))

# 한 시간마다 점검(hourlyCheck): 새 응답이 있을 때만 · 메일은 안 보냄 · 실패하면 표시를 되돌림
r = node({'props': {**OPEN, 'RESPONSE_SHEET': '응답'}, 'steps': [post(good), {'do': 'call', 'fn': 'hourlyCheck', 'context': 'trigger'}, {'do': 'dump'}, {'do': 'call', 'fn': 'hourlyCheck', 'context': 'trigger'}, {'do': 'dump'}]})
d1, d2 = r['steps'][2], r['steps'][4]
ok('⑦ 한 시간마다 점검: 새 응답이 있으면 점검·분석을 새로 만들고 표시를 지움 · SUMMARY_TO 가 있어도 메일은 안 보냄', 'INTAKE_DIRTY' not in d1['props'] and not d1['mails'] and '접수 점검' in sheet_names(d1) and 'ANALYSIS_SSID' in d1['props'] and 'error' not in (r['steps'][1] or {}), (d1['props'], sheet_names(d1)))
ok('⑦ 새 응답이 없으면 아무것도 하지 않음(두 번째 실행은 잠금도 안 잡음 · 시트도 그대로)', d2['lock'] == d1['lock'] and sheet_names(d2) == sheet_names(d1) and not d2['mails'], (d1['lock'], d2['lock']))
r = node({'props': {**OPEN, 'RESPONSE_SHEET': '응답'}, 'steps': [{'do': 'call', 'fn': 'hourlyCheck', 'context': 'trigger'}]}); F = r['final']
ok('⑦ 응답이 한 번도 없으면 한 시간마다 점검은 아무것도 안 만듦', not sheet_names(F) and F['lock']['acquired'] == 0 and len(F['spreadsheets']) == 1, (sheet_names(F), F['lock']))
r = node({'props': {**OPEN, 'RESPONSE_SHEET': '응답'}, 'steps': [post(good), {'do': 'eval', 'code': "writeCheck_ = function () { throw new Error('write-failed'); };"}, {'do': 'call', 'fn': 'hourlyCheck', 'context': 'trigger'}]}); F = r['final']
ok('⑦ 점검 중 오류가 나면 오류가 그대로 올라가(자동 실행이 실패로 기록됨) 점검 표시를 되돌려 다음 시간에 다시 시도 · 잠금은 풀림', 'write-failed' in r['steps'][2].get('error', '') and F['props'].get('INTAKE_DIRTY') == '1' and F['lock']['acquired'] == F['lock']['released'] == 2, (r['steps'][2], F['props'].get('INTAKE_DIRTY'), F['lock']))

# 끝까지: 앱으로 받음 → 운영자가 면허확인 → 점검·분석 → 파이썬 도구와 같은 결과
steps = [post(env(csub('가짜약사A', '가짜약국1', research=True, ans={1: 'ok', 2: ('diff', '메모A')}))), post(env(csub('가짜약사B', '가짜약국2', research=False))),
         post(env(csub('가짜약사C', '가짜약국3', research=True, scope='law', ans={1: 'ok', 2: 'diff'}))), post(env(csub('가짜약사D', '가짜약국4', research=True))),
         post(env(csub('가짜약사A', '가짜약국1', research=True, ans={1: 'diff', 2: 'ok', 3: 'ok'}))),
         {'do': 'eval', 'code': "SpreadsheetApp.getActiveSpreadsheet().getSheetByName('응답').getRange(2, 5, 3, 1).setValues([['Y'], ['Y'], ['Y']]); SpreadsheetApp.getActiveSpreadsheet().getSheetByName('응답').getRange(6, 5, 1, 1).setValues([['Y']]);"},
         {'do': 'call', 'fn': 'hourlyCheck', 'context': 'trigger'}, {'do': 'dump'}]
r = node({'props': {**OPEN, 'RESPONSE_SHEET': '응답'}, 'steps': steps}); F = r['final']; rs = resp_sheet(F); ck = sheet(sheets_of(F, '응답 시트 파일'), '접수 점검')
ok('⑦ 앱 접수 5건 → 면허확인(운영자가 Y) → 점검: A 정상 · B 분석 제외(연구 이용 비동의) · C 정상 · D 확인 대기(면허 확인 전) · A 다시 보냄은 정상', [x['parsed'].get('ok') for x in r['steps'][:5]] == [True] * 5 and [row[2] for row in ck['rows'][1:]] == ['정상 반영', '분석 제외', '정상 반영', '확인 대기', '정상 반영'], [row[2] for row in ck['rows'][1:]])
ok('⑦ 점검 시트의 이유 칸: 비동의 → 연구 이용 동의 없음 · 면허 전 → 면허확인 열에 Y 안내 · 읽은 열이 확인서 2 · 시각 1 · 연구 이용 동의 4 · 면허 확인 5', '연구 이용 동의 없음' in ck['rows'][2][3] and '면허확인 열에 Y' in ck['rows'][4][3] and '확인서 글 열 2 · 시각 열 1 · 연구 이용 동의 열 4 · 면허 확인 열 5' in ck['rows'][1][9] and ck['rows'][1][9 - 0 - 0] is not None, (ck['rows'][2][3], ck['rows'][4][3], ck['rows'][1][9]))
an = analysis_of(F); sm = {row[0]: row[1] for row in sheet(an, '요약')['rows'][1:] if row[0]}
ok('⑦ 분석 요약: 접수 5건 · 분석 반영 확인서 3건 · 약사 2명(같은 약사가 다시 보내면 최신 것) · 동의·면허로 뺀 것 2건 · 형식 오류 0건', sm.get('접수') == '5건' and sm.get('분석 반영 확인서') == '3건' and sm.get('분석에 쓴 약사(가명)') == '2명' and sm.get('동의·면허 확인으로 뺀 것') == '2건' and sm.get('형식 오류로 뺀 것') == '0건', sm)
secrets_app = ['가짜약사A', '가짜약사B', '가짜약사C', '가짜약사D', '가짜약국1', '가짜약국2', '가짜약국3', '가짜약국4', '메모A']
ok('⑦ 앱으로 받은 응답에서도 분석 시트 파일·접수 점검 시트에는 이름·소속·메모가 없고 가명표·메모는 운영자만 편집으로 보호', not [s for s in secrets_app if any(s in c for c in cell_texts(an))] and not [s for s in secrets_app if any(s in c for c in cell_texts({'sheets': [ck]}))] and all(len(sheet(sheets_of(F, '응답 시트 파일'), n_)['prots']) == 1 for n_ in ('가명표(운영자만)', '메모(운영자만)')) and not F['mails'], '')
rows_app = [row for row in rs['rows'][1:]]
pyx = py_side(RESP_HEAD, rows_app, name='app_route.csv')
jsx, _ = js_side(pyx['path'])
ok('⑦ 응답 시트 머리글을 두 도구가 같은 열로 읽음(스크립트 확인서 2·시각 1·연구 이용 동의 4·면허 5 / 파이썬 도구도 같음) — 1단계 동의 열을 연구 동의 열로 잘못 읽지 않음', {k: (v + 1 if v is not None and v >= 0 else None) for k, v in jsx['cols'].items()} == pyx['cols'] == {'json': 2, 'ts': 1, 'consent': 4, 'license': 5}, (jsx['cols'], pyx['cols']))
ok('⑦ 점검 결과(파이썬 도구): 정상 · 분석 제외(연구 이용 동의 없음) · 정상 · 확인 대기(면허) · 정상', [(x['status'], x['reason']) for x in pyx['ops']['records']] == [('ok', None), ('gated', 'research_consent'), ('ok', None), ('gated', 'license'), ('ok', None)], [(x['status'], x['reason']) for x in pyx['ops']['records']])
report('⑦ 앱 접수 시트(5건)', all_diffs(pyx, jsx, 'app'))

shutil.rmtree(tmp, ignore_errors=True)
bad = [c for c in checks if c[0] == 'FAIL']
for c in checks: print(*c[:2], ('— ' + c[2]) if c[0] == 'FAIL' and c[2] else '')
print(f"\n{len(checks) - len(bad)}/{len(checks)} 통과" + ('' if not bad else f' · 실패 {len(bad)}건'))
sys.exit(1 if bad else 0)
