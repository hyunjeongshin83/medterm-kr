"""연구자 페이지(구글 시트 스크립트의 웹 앱 화면 + 서버 쪽) 점검 — python3 -I tests/test_review_researcher.py
 네트워크 불필요. tools/google_apps_script/review_inbox.gs 를 구글 없이 노드(node)로 돌린다(구글 서비스는 tests/js/review_inbox_harness.js 의 가짜: 시트·메일함·속성·캐시·잠금·시계·화면).
 메일 주소는 모두 example.org 가짜 주소다 — 실제 주소를 쓰지 않고 아무것도 보내지 않는다.
 ① 화면과 소스: 밖으로 부를 수 있는 함수 목록이 정해진 것뿐 · 화면 글에 바깥 자료·삽입 코드·이벤트 속성 없음 · 요소 번호/라벨 짝이 맞음
 ② 아무나 부르는 경우(웹 앱 화면의 google.script.run 흉내): 메뉴·자동 실행 함수를 어떤 인수로 불러도 속성·시트·메일·자동 실행이 그대로
 ③ 로그인: 지정된 주소만 인증 번호를 받고 · 답이 지정 여부를 드러내지 않고 · 번호는 10분·5번·한 번만 · 한 시간 3번·하루 20통 상한 · 로그인 표는 30분(처음부터 2시간) · 지정 취소하면 바로 무효
 ④ 받을 주소: 본인 주소는 바로, 다른 주소는 그 주소로 간 번호까지 · 중복·최대 5개·허용 도메인 · 이상한 주소(쉼표·줄바꿈·꺾쇠 등) 거절 · 지우기
 ⑤ 주간 요약 메일: 운영자 주소 + 등록된 주소에 한 통씩 따로 · 안내 문구는 등록된 주소 쪽에만 · 일부 실패해도 나머지 발송 · 하루 메일 상한 · 약사 이름·소속·메모가 섞이지 않음
 ⑥ 운영자 메뉴: 연구자 지정·취소·받는 주소 지우기·현황(주소 안내) ⑦ 잠금 ⑧ 입력 검사·난수·해시·저장된 값에 번호/토큰 원문이 없음"""
import collections, contextlib, datetime, io, json, os, re, shutil, subprocess, sys, tempfile, types
from html.parser import HTMLParser
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
sys.path.insert(0, os.path.join(root, 'tools')); sys.path.insert(0, os.path.join(root, 'build'))
import review_lib as RL, review_research_report as RR

NODE = shutil.which('node') or next((p for p in ('/opt/node22/bin/node', '/usr/local/bin/node', '/usr/bin/node') if os.path.exists(p)), None)
if not NODE:
    print('건너뜀: node(자바스크립트 실행기)를 찾지 못해 연구자 페이지를 시험하지 못했습니다. node 를 설치한 뒤 다시 돌리세요.')
    sys.exit(0)

GS = os.path.join(root, 'tools', 'google_apps_script', 'review_inbox.gs')
HARNESS = os.path.join(root, 'tests', 'js', 'review_inbox_harness.js')
DATA = os.path.join(root, 'data')
TODAY = datetime.date(2026, 11, 7)
IT = RL.build_items(DATA)
checks = []
def ok(name, cond, extra=''): checks.append(('PASS' if cond else 'FAIL', name, str(extra)[:400]))
tmp = tempfile.mkdtemp(prefix='test_review_researcher_')
def rd(path): return open(path, encoding='utf-8').read()

_n = [0]
def node(scn):
    scn = dict(scn); scn.setdefault('gs', GS); scn.setdefault('today', '2026-11-07')
    _n[0] += 1
    p = os.path.join(tmp, f'scn{_n[0]}.json')
    json.dump(scn, open(p, 'w', encoding='utf-8'), ensure_ascii=False)
    r = subprocess.run([NODE, HARNESS, p], capture_output=True, text=True, encoding='utf-8', timeout=300, cwd=tmp)
    if r.returncode != 0: raise RuntimeError('node 오류: ' + r.stderr[-800:])
    return json.loads(r.stdout)

PROF, PROF2, LAB, LAB2, OPER = 'prof@example.org', 'prof2@example.org', 'lab@example.org', 'lab2@example.org', 'report@example.org'
def base_props(**kw):
    p = {'SUMMARY_TO': OPER, 'RESEARCHERS': json.dumps([PROF, PROF2])}
    p.update(kw)
    return p
def run(steps, props=None, **scn):
    return node({'props': base_props(**(props or {})), **scn, 'steps': steps})
def api(op, **kw): return {'do': 'rpc', 'fn': 'researcherApi', 'args': [json.dumps({'op': op, **kw})]}
def raw(arg): return {'do': 'rpc', 'fn': 'researcherApi', 'args': [arg]}
def P(step): return (step.get('parsed') or {}) if isinstance(step, dict) else {}
def login(who=PROF): return [api('code', email=who), api('login', email=who, code='{{code}}')]
def mails_to(F, addr): return [m for m in F['mails'] if m['to'] == addr]
def codes_in(F): return [re.search(r'(?<!\d)(\d{6})(?!\d)', m['body']).group(1) for m in F['mails'] if '인증 번호' in m['subject']]

class Html(HTMLParser):
    VOID = {'br', 'img', 'hr', 'meta', 'link', 'input'}
    def __init__(s): super().__init__(convert_charrefs=True); s.stack, s.bad, s.tags, s.ids, s.labels, s.inputs = [], [], collections.Counter(), [], [], []
    def handle_starttag(s, tag, attrs):
        s.tags[tag] += 1; d = dict(attrs)
        if 'id' in d: s.ids.append(d['id'])
        if tag == 'label': s.labels.append(d.get('for'))
        if tag == 'input': s.inputs.append(d.get('id'))
        if tag not in s.VOID: s.stack.append(tag)
    def handle_endtag(s, tag):
        if not s.stack or s.stack[-1] != tag: s.bad.append(('닫힘', tag, s.stack[-3:]))
        else: s.stack.pop()
def html_problems(h):
    p = Html(); p.feed(h); p.close()
    return p, p.bad + ([('안 닫힌 태그', p.stack)] if p.stack else [])

# ═════════ ① 화면과 소스 ═════════
src = rd(GS)
top_funcs = sorted({n for n in re.findall(r'(?m)^function ([A-Za-z0-9_]+)\(', src) if not n.endswith('_')})
EXPOSED = sorted(['onOpen', 'setup', 'onFormSubmitCheck', 'weeklySummary', 'hourlyCheck', 'refreshNow', 'sendSummaryNow', 'openIntake', 'closeIntake', 'intakeStatus', 'doGet', 'doPost',
                  'addResearcher', 'removeResearcher', 'removeRecipient', 'researcherStatus', 'researcherApi'])
r = run([{'do': 'doGet', 'params': {'page': 'researcher'}}, {'do': 'doGet', 'params': {}}, {'do': 'doGet', 'params': {'page': 'other'}}, {'do': 'doGet', 'noEvent': True}, api('ping')])
ok('① 소스에서 이름 끝에 밑줄이 없는 함수(= google.script.run 으로 누구나 부를 수 있는 함수)가 정해진 17개뿐', top_funcs == EXPOSED, sorted(set(top_funcs) ^ set(EXPOSED)))
ok('① 실제로 올린 스크립트(가짜 구글)에서 밖에서 부를 수 있는 함수 목록도 같음', r['exposed'] == EXPOSED, sorted(set(r['exposed']) ^ set(EXPOSED)))
pg = r['steps'][0]; html = pg['html']
ok('① ?page=researcher 는 연구자 페이지(HTML) · 제목 · 휴대폰 화면 설정 · 다른 사이트에 끼워 넣기(ALLOWALL) 허용 안 함', pg['mime'] == 'HTML' and pg['title'] == 'MedTerm-KR 연구자 페이지' and ['viewport', 'width=device-width, initial-scale=1'] in pg['metas'] and pg['xframe'] == 'DEFAULT', {k: pg[k] for k in ('title', 'metas', 'xframe')})
ok('① 주소 끝에 아무것도 없거나 다른 값이면 예전처럼 접수 상태(JSON)만 알려 줌(이벤트가 없어도 오류 없음)', all(r['steps'][i].get('parsed') == {'ok': True, 'kind': 'medterm-kr-intake/1', 'open': False} for i in (1, 2, 3)), [r['steps'][i] for i in (1, 2, 3)])
ok('① ping: 연구자가 지정돼 있으면 enabled', P(r['steps'][4]).get('enabled') is True and P(r['steps'][4]).get('ver') == RR.VERSION, r['steps'][4])
r0 = run([api('ping')], props={'RESEARCHERS': ''})
ok('① ping: 연구자가 한 명도 없으면 enabled 가 거짓(화면이 “아직 지정된 연구자가 없습니다” 를 보여 줌)', P(r0['steps'][0]).get('enabled') is False, r0['steps'][0])
prob, bad = html_problems(html)
ok('① 화면 HTML 의 열고 닫음 모양이 맞음', not bad, bad[:3])
ext = re.findall(r'(?i)(?:src|href|action|poster|data)\s*=\s*["\']?\s*(?:https?:)?//', html) + re.findall(r'(?i)url\(\s*["\']?(?:https?:)?//', html) + re.findall(r'(?i)@import', html)
ok('① 화면에 바깥 자료(스크립트·글꼴·그림·스타일)를 불러오는 주소가 없음 — 이 글 하나로 그려짐', not ext, ext)
ok('① 화면에 외부 자원·이미지·iframe·object·embed 태그가 없고 script 는 인라인 한 개뿐(src 없음)', not any(t in prob.tags for t in ('link', 'img', 'iframe', 'object', 'embed')) and prob.tags['script'] == 1 and not re.search(r'<script[^>]*\ssrc=', html), dict(prob.tags))
bad_words = [w for w in ('innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'localStorage', 'sessionStorage', 'document.cookie', 'window.open', 'location.href', 'fetch(', 'XMLHttpRequest') if w in html]
ok('① 화면 스크립트: 글은 textContent 로만 넣고(innerHTML 없음) 토큰·번호를 저장하지 않으며(저장소·쿠키 없음) 다른 곳으로 가지 않음', not bad_words, bad_words)
ok('① 화면에 인라인 이벤트 속성(onclick 등)이 없음 · 언어 ko', not re.search(r'(?i)\son[a-z]+\s*=', html) and '<html lang="ko">' in html)
used = set(re.findall(r"\$\('([A-Za-z0-9_-]+)'\)", html)) | set(re.findall(r"show\('([A-Za-z0-9_-]+)'", html))
ok('① 스크립트가 찾는 요소 번호가 모두 화면에 있음', used <= set(prob.ids) and len(prob.ids) == len(set(prob.ids)), sorted(used - set(prob.ids)))
ok('① 입력칸마다 라벨(for)이 짝지어져 있음', set(i for i in prob.inputs) <= set(prob.labels), sorted(set(prob.inputs) - set(prob.labels)))
ok('① 화면 글에 메일 주소 예시·전화번호·내 연락처가 없음', not re.search(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}', html) and not re.search(r'\d{2,3}-\d{3,4}-\d{4}', html))
ok('① 화면이 확인서·분석 내용을 가져오는 요청을 하지 않음(요청 종류는 ping·code·login·state·add·verify·remove·logout 뿐)', set(re.findall(r"op: '([a-z]+)'", html)) == {'ping', 'code', 'login', 'state', 'add', 'verify', 'remove', 'logout'}, set(re.findall(r"op: '([a-z]+)'", html)))

# ═════════ ② 아무나 부르는 경우 ═════════
demo_h, demo_rows, _ = RR.make_demo(IT, TODAY)
import csv
demo_csv = os.path.join(tmp, 'demo.csv')
with open(demo_csv, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f); w.writerow(demo_h); w.writerows(demo_rows)
SHEET = '설문지 응답 시트1'
SHEETS = [{'name': SHEET, 'csv': demo_csv}]
INTAKE_CLOSED = {'RESPONSE_SHEET': SHEET}
ARGSETS = [[], [{}], [None], ['x'], [{'triggerUid': ''}], [{'triggerUid': '0'}], [{'triggerUid': 999}], [{'triggerUid': 'abc'}], [{'triggerUid': {'a': 1}}], [{'postData': {'contents': 'x'}}], [{'parameter': {'page': 'researcher'}}], [1, 2, 3]]
spoof_targets = [f for f in EXPOSED if f not in ('researcherApi',)]
steps = [{'do': 'dump'}] + [{'do': 'rpc', 'fn': f, 'args': a} for f in spoof_targets for a in ARGSETS] + [{'do': 'dump'}]
r = run(steps, props={'RESPONSE_SHEET': SHEET, 'DEMO_MODE': '1'}, sheets=SHEETS)
d0, d1 = r['steps'][0], r['steps'][-1]
strip = lambda d: {'props': d['props'], 'mails': d['mails'], 'triggers': d['triggers'], 'cache': d['cache'], 'sheets': {k: [(s['name'], s['cells'], s['nrows']) for s in v['sheets']] for k, v in d['spreadsheets'].items()}, 'alerts': d['alerts']}
ok('② 누가 웹 앱 화면에서 google.script.run 으로 메뉴·자동 실행·접수 함수를 12가지 인수로 불러도(15개 함수 × 12) 속성·시트·메일·자동 실행·캐시가 그대로', strip(d0) == strip(d1) and not d1['mails'] and d1['lock']['acquired'] == d1['lock']['released'], [k for k in strip(d0) if strip(d0)[k] != strip(d1)[k]])
errs = {f: [x for x in r['steps'][1 + i * len(ARGSETS):1 + (i + 1) * len(ARGSETS)]] for i, f in enumerate(spoof_targets)}
menu_fns = ['onOpen', 'setup', 'openIntake', 'closeIntake', 'intakeStatus', 'refreshNow', 'sendSummaryNow', 'addResearcher', 'removeResearcher', 'removeRecipient', 'researcherStatus']
ok('② 메뉴 함수 11개는 웹 앱 화면에서 부르면 맨 앞에서 오류(getUi)로 멈춤', all(all('getUi' in (x or {}).get('error', '') for x in errs[f]) for f in menu_fns), {f: errs[f][0] for f in menu_fns if not all('getUi' in (x or {}).get('error', '') for x in errs[f])})
ok('② 자동 실행 함수 3개(점검·주간 요약·한 시간 점검)는 자동 실행 번호가 없으면 아무 일도 안 하고 기록만 남김', all(all(x is None or x.get('value') is None for x in errs[f]) for f in ('onFormSubmitCheck', 'weeklySummary', 'hourlyCheck')) and sum('자동 실행이 아닌 곳' in l for l in d1['logs']) == 3 * len(ARGSETS), len(d1['logs']))
# 자동 실행이 설치된 뒤에도: 엉뚱한 번호는 막히고, 진짜 번호(구글이 돌릴 때)만 통한다. 다시 설정하면 예전 번호는 무효.
steps = [{'do': 'setup', 'text': ''}, {'do': 'eval', 'code': "ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'weeklySummary'; })[0].getUniqueId()"}]
r = run(steps, props={'RESPONSE_SHEET': SHEET}, sheets=SHEETS)
real_uid = r['steps'][1]
steps = [{'do': 'setup', 'text': ''}] + [{'do': 'rpc', 'fn': 'weeklySummary', 'args': [{'triggerUid': u}]} for u in ('0', 'abc', '7000000099', real_uid + 'x', real_uid.lower() + ' ', int(real_uid) - 1)] + [{'do': 'dump'}]
r = run(steps, props={'RESPONSE_SHEET': SHEET}, sheets=SHEETS)
ok('② 자동 실행이 설치된 뒤에도 엉뚱한 번호(0 · abc · 없는 번호 · 진짜 번호에 글자를 덧붙이거나 하나 뺀 값)로는 요약 메일이 안 나감', not r['steps'][-1]['mails'], r['steps'][-1]['mails'][:1])
r = run([{'do': 'setup', 'text': ''}, {'do': 'eval', 'code': "JSON.stringify(ScriptApp.getProjectTriggers().map(function (t) { return [t.getHandlerFunction(), String(t.getUniqueId())]; }))"}], props={'RESPONSE_SHEET': SHEET}, sheets=SHEETS)
uids = dict(json.loads(r['steps'][1]))
steps = [{'do': 'setup', 'text': ''}, {'do': 'setProp', 'key': 'INTAKE_DIRTY', 'value': '1'}] + [{'do': 'rpc', 'fn': 'weeklySummary', 'args': [{'triggerUid': u}]} for h, u in uids.items() if h != 'weeklySummary'] + [{'do': 'rpc', 'fn': 'hourlyCheck', 'args': [{'triggerUid': uids['weeklySummary']}]}, {'do': 'dump'}]
r = run(steps, props={'RESPONSE_SHEET': SHEET}, sheets=SHEETS)
ok('② 다른 함수의 자동 실행 번호(예: 한 시간 점검의 번호로 주간 요약을, 주간 요약의 번호로 한 시간 점검을)로는 통하지 않음 — 그 함수의 번호만 통과', len(uids) >= 2 and 'weeklySummary' in uids and 'hourlyCheck' in uids and not r['steps'][-1]['mails'] and r['steps'][-1]['props'].get('INTAKE_DIRTY') == '1', (uids, r['steps'][-1]['mails'][:1]))
steps = [{'do': 'setup', 'text': ''}, {'do': 'fire', 'fn': 'weeklySummary'}, {'do': 'dump'}]
r = run(steps, props={'RESPONSE_SHEET': SHEET}, sheets=SHEETS)
ok('② 구글이 진짜 자동 실행(설치된 번호)을 돌릴 때는 요약 메일이 나감(막힌 것이 아니라 진짜만 통과)', len(r['steps'][-1]['mails']) == 1 and r['steps'][-1]['mails'][0]['to'] == OPER, r['steps'][-1]['mails'])
r = run([{'do': 'setup', 'text': ''}, {'do': 'eval', 'code': "ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'weeklySummary'; })[0].getUniqueId()"}, {'do': 'setup', 'text': ''}], props={'RESPONSE_SHEET': SHEET}, sheets=SHEETS)
old_uid = r['steps'][1]
r = run([{'do': 'setup', 'text': ''}, {'do': 'setup', 'text': ''}, {'do': 'rpc', 'fn': 'weeklySummary', 'args': [{'triggerUid': '7000000001'}]}, {'do': 'dump'}], props={'RESPONSE_SHEET': SHEET}, sheets=SHEETS)
ok('② 다시 설정해 자동 실행을 새로 만들면 예전 자동 실행 번호로는 더 이상 안 통함', not r['steps'][-1]['mails'] and len(r['steps'][-1]['triggers']) == 2, (r['steps'][-1]['mails'][:1], len(r['steps'][-1]['triggers'])))

# ═════════ ③ 로그인 ═════════
GEN = None
r = run([api('code', email=PROF), api('code', email='stranger@example.org'), api('code', email='PROF@Example.ORG '), api('code', email='nope'), api('code', email=PROF + ',' + LAB), {'do': 'dump'}])
S = r['steps']; F = r['final']
ok('③ 지정된 연구자 주소(대소문자·앞뒤 공백은 무시)에만 인증 번호 메일이 감 — 모르는 주소·모양이 아닌 주소에는 안 감', [m['to'] for m in F['mails']] == [PROF, PROF] and len(F['mails']) == 2, [m['to'] for m in F['mails']])
ok('③ 답은 지정된 주소든 아니든 글자 하나까지 같음(지정 여부를 알려 주지 않음) · 모양이 틀린 주소만 따로 안내', P(S[0]) == P(S[1]) == P(S[2]) and P(S[3]).get('code') == 'email' and P(S[4]).get('code') == 'email', (P(S[0]), P(S[1])))
m0 = F['mails'][0]
ok('③ 인증 메일: 받는 사람 한 명 · 제목 · 6자리 번호 하나 · cc/bcc/첨부/HTML 없음 · 토큰 없음', set(m0['keys']) == {'body', 'name', 'subject', 'to'} and m0['subject'] == '[MedTerm-KR] 연구자 페이지 인증 번호' and re.search(r'(?<!\d)\d{6}(?!\d)', m0['body']) and len(re.findall(r'\d{6}', m0['body'])) == 1 and m0['name'] == 'MedTerm-KR 연구자 인증', m0)
ok('③ 모르는 주소로 요청해도 저장된 값이 하나도 안 바뀜(속성이 불어나지 않음)', all(k in F['props'] for k in ('RESEARCHERS', 'SUMMARY_TO')) and sorted(F['props']) == ['AUTH_RATE', 'MAIL_DAY', 'OTP_DAY', 'RESEARCHERS', 'SUMMARY_TO'], sorted(F['props']))
r = run([api('code', email='stranger@example.org'), {'do': 'dump'}])
ok('③ 모르는 주소만 요청하면 속성이 하나도 안 생기고 메일도 없음', sorted(r['final']['props']) == ['RESEARCHERS', 'SUMMARY_TO'] and not r['final']['mails'] and not r['final']['cache'], sorted(r['final']['props']))

r = run(login() + [api('state', token='{{token}}'), {'do': 'dump'}])
S = r['steps']; F = r['final']; tok = P(S[1]).get('token', '')
ok('③ 번호를 맞게 입력하면 로그인: 토큰(48자리 16진수) · 본인 주소 · 30분', P(S[1]).get('ok') is True and re.fullmatch(r'[0-9a-f]{48}', tok) and P(S[1]).get('me') == PROF and P(S[1]).get('idleMin') == 30, S[1])
ok('③ 로그인한 뒤 상태: 운영자 주소는 가려서(re***@example.org) · 받는 주소 0개 · 최대 5', P(S[2]).get('operator') == 're***@example.org' and P(S[2]).get('recipients') == [] and P(S[2]).get('max') == 5 and OPER not in json.dumps(S[2]), S[2])
code0 = codes_in(F)[0]
import hashlib
ck, cv = F['cache'][0] if F['cache'] else ('', '{}')
ok('③ 캐시에는 로그인 표 하나만(쓴 인증 번호는 지워짐) · 열쇠는 토큰의 SHA-256 · 값에는 번호·토큰 원문이 없고 주소와 시각만', len(F['cache']) == 1 and ck == 'sess:' + hashlib.sha256(tok.encode()).hexdigest() and tok not in ck + cv and not re.search(r'(?<!\d)' + code0 + r'(?!\d)', cv) and sorted(json.loads(cv)) == ['a', 't'], F['cache'])
ok('③ 저장된 속성(제한 기록·하루 횟수)에도 번호·토큰·주소 원문이 없음, 기록 로그는 운영자만 보는 속성에 주소가 있음', not any(code0 in v or tok in v for v in F['props'].values()) and '@' not in F['props']['AUTH_RATE'] and not any(code0 in l or tok in l for l in F['logs']), F['props']['AUTH_RATE'])

# 틀린 번호 · 만료 · 한 번만 · 5번 제한
r = run([api('code', email=PROF), api('login', email=PROF, code='000000'), api('login', email=PROF, code='{{code}}'), api('login', email=PROF, code='{{code}}')])
S = r['steps']
ok('③ 틀린 번호 한 번은 실패해도 맞는 번호가 이어서 통함 · 한 번 쓴 번호는 다시 못 씀', P(S[1]).get('code') == 'bad_code' and P(S[2]).get('ok') is True and P(S[3]).get('code') == 'bad_code', [P(x) for x in S[1:]])
r = run([api('code', email=PROF)] + [api('login', email=PROF, code=c) for c in ('111111', '222222', '333333', '444444', '555555')] + [api('login', email=PROF, code='{{code}}')])
S = r['steps']
guess_ok = any(P(x).get('ok') for x in S[1:6])
ok('③ 5번 틀리면 그 번호는 폐기: 그 뒤 맞는 번호를 넣어도 거절(새 번호를 받아야 함)', not guess_ok and P(S[6]).get('code') == 'bad_code', [P(x).get('code') for x in S[1:]])
r = run([api('code', email=PROF)] + [api('login', email=PROF, code=c) for c in ('111111', '222222', '333333', '444444')] + [api('login', email=PROF, code='{{code}}')])
ok('③ 네 번 틀리고 다섯 번째에 맞으면 통과(제한은 5번)', P(r['steps'][5]).get('ok') is True, P(r['steps'][5]))
r = run([api('code', email=PROF), {'do': 'tick', 'seconds': 599}, api('login', email=PROF, code='{{code}}')])
ok('③ 번호는 10분(600초) 안에는 유효(599초)', P(r['steps'][2]).get('ok') is True, P(r['steps'][2]))
r = run([api('code', email=PROF), {'do': 'tick', 'seconds': 601}, api('login', email=PROF, code='{{code}}')])
ok('③ 10분이 지나면 무효(601초)', P(r['steps'][2]).get('code') == 'bad_code', P(r['steps'][2]))
r = run([api('code', email=PROF), api('code', email=PROF), api('login', email=PROF, code='{{code#0}}'), api('login', email=PROF, code='{{code#1}}')])
ok('③ 새 번호를 받으면 예전 번호는 무효(마지막 번호만 유효)', P(r['steps'][2]).get('code') == 'bad_code' and P(r['steps'][3]).get('ok') is True, [P(x).get('code') or P(x).get('ok') for x in r['steps'][2:]])
r = run([api('code', email=PROF), api('login', email='stranger@example.org', code='{{code}}'), api('login', email=PROF, code='{{code}}'), api('login', email=PROF2, code='{{code}}')])
S = r['steps']
ok('③ 다른 사람 주소로 그 번호를 넣거나 지정 안 된 주소로 넣어도 같은 “번호가 맞지 않음” 답 · 다른 연구자의 번호는 쓸 수 없음', P(S[1]) == P(S[3]) == {'ok': False, 'code': 'bad_code', 'msg': P(S[1]).get('msg')} and P(S[2]).get('ok') is True, [P(x) for x in S[1:]])
r = run([api('code', email=PROF), api('login', email=PROF, code=''), api('login', email=PROF, code='12 34 56'), api('login', email=PROF, code='１２３４５６'), api('login', email=PROF, code='1234567'), api('login', email=PROF, code='abcdef'), api('login', email=PROF, code='{{code}}')])
ok('③ 번호 칸에 빈 값·공백 섞인 값·전각 숫자·7자리·글자를 넣으면 모두 거절(그리고 시도 횟수로 셈) — 5번째 틀림 뒤 맞는 번호도 거절', all(P(x).get('code') == 'bad_code' for x in r['steps'][1:]), [P(x).get('code') for x in r['steps'][1:]])

# 요청 횟수 상한(한 시간 3번 · 하루 20통)
r = run([api('code', email=PROF) for _ in range(5)] + [{'do': 'tick', 'minutes': 59}, api('code', email=PROF), {'do': 'tick', 'minutes': 2}, api('code', email=PROF), {'do': 'dump'}])
ok('③ 같은 주소는 한 시간에 인증 메일 3통까지(4번째부터는 같은 답이지만 메일은 안 감) · 한 시간이 지나면 다시 받을 수 있음', [len(mails_to(r['steps'][i + 1 if False else -1], PROF)) for i in (0,)] == [4] and len(r['final']['mails']) == 4 and len([m for m in r['final']['mails']]) == 4 and all(P(x) == P(r['steps'][0]) for x in r['steps'][:5]), len(r['final']['mails']))
r = run([{'do': 'setProp', 'key': 'OTP_DAY', 'value': '2026-11-07:20'}, api('code', email=PROF), {'do': 'tick', 'hours': 24}, api('code', email=PROF), {'do': 'dump'}])
ok('③ 하루 인증 메일 20통 상한: 다 쓴 날은 요청해도 같은 답에 메일은 안 가고, 날이 바뀌면 다시 가능', len(r['final']['mails']) == 1 and r['final']['props']['OTP_DAY'] == '2026-11-08:1', (len(r['final']['mails']), r['final']['props'].get('OTP_DAY')))
r = run([{'do': 'setProp', 'key': 'MAIL_DAY', 'value': '2026-11-07:60'}, api('code', email=PROF), {'do': 'dump'}])
ok('③ 하루 전체 메일 60통 상한에 닿으면 인증 메일도 안 감(오류 대신 같은 답)', not r['final']['mails'] and P(r['steps'][1]).get('ok') is True, (r['final']['mails'], r['steps'][1]))
r = run([{'do': 'mailThrow', 'message': 'quota'}, api('code', email=PROF), {'do': 'dump'}])
ok('③ 메일 보내기가 실패해도 화면에는 같은 답(오류 내용 숨김) · 로그에만 남음 · 잠금은 풀림', P(r['steps'][1]).get('ok') is True and 'quota' not in json.dumps(r['steps'][1]) and any('quota' in l for l in r['final']['logs']) and r['final']['lock']['acquired'] == r['final']['lock']['released'], r['final']['logs'])

# 로그인 표(세션)
r = run(login() + [{'do': 'tick', 'minutes': 29}, api('state', token='{{token}}'), {'do': 'tick', 'minutes': 29}, api('state', token='{{token}}'), {'do': 'tick', 'minutes': 31}, api('state', token='{{token}}')])
S = r['steps']
ok('③ 로그인 표는 쓰는 동안 이어지고(29분 간격으로 써도 계속) · 30분 넘게 안 쓰면 끝남', P(S[3]).get('ok') is True and P(S[5]).get('ok') is True and P(S[7]).get('code') == 'auth', [P(x).get('code') or P(x).get('ok') for x in S[3:]])
r = run(login() + sum([[{'do': 'tick', 'minutes': 25}, api('state', token='{{token}}')] for _ in range(5)], []))
S = r['steps']
ok('③ 계속 써도 처음부터 2시간이 지나면 끝남(25분 간격: 100분까지 통과 · 125분에 거절)', all(P(S[3 + 2 * i]).get('ok') is True for i in range(4)) and P(S[3 + 2 * 4]).get('code') == 'auth', [P(S[3 + 2 * i]).get('code') or P(S[3 + 2 * i]).get('ok') for i in range(5)])
r = run(login() + [{'do': 'cacheClear'}, api('state', token='{{token}}'), api('code', email=PROF), {'do': 'cacheClear'}, api('login', email=PROF, code='{{code}}')])
ok('③ 캐시가 일찍 비워져도(구글 캐시는 보장이 없음) 열리지 않고 닫힘: 로그인 표 → 다시 인증 · 인증 번호 → 새 번호 받기', P(r['steps'][3]).get('code') == 'auth' and P(r['steps'][6]).get('code') == 'bad_code', [P(r['steps'][3]), P(r['steps'][6])])
r = run(login() + [api('logout', token='{{token}}'), api('state', token='{{token}}')])
ok('③ 나가기를 누르면 그 토큰은 바로 무효', P(r['steps'][2]).get('ok') is True and P(r['steps'][3]).get('code') == 'auth', P(r['steps'][3]))
r = run(login() + [{'do': 'menu', 'fn': 'removeResearcher', 'text': PROF}, api('state', token='{{token}}'), api('add', token='{{token}}', email=LAB)])
ok('③ 운영자가 연구자 지정을 취소하면 이미 로그인한 화면도 바로 쓸 수 없음(다음 요청부터 거절)', P(r['steps'][3]).get('code') == 'auth' and P(r['steps'][4]).get('code') == 'auth', [P(x) for x in r['steps'][3:]])
r = run([api('state', token=t) for t in ('', 'x', 'a' * 48, 'A' * 48, '0' * 47, '0' * 49, 'g' * 48, '0' * 500, '../etc', None, 5, [1], {'a': 1})])
ok('③ 엉뚱한 토큰(빈 값·짧음·길음·대문자·16진수 아님·숫자·배열·객체)은 모두 “인증이 끝났습니다” 하나로 거절', all(P(x).get('code') == 'auth' for x in r['steps']), [P(x).get('code') for x in r['steps']])
r = run(login(PROF) + login(PROF2) + [api('state', token='{{token#0}}'), api('state', token='{{token#1}}')])
S = r['steps']
ok('③ 연구자마다 따로 로그인(토큰이 서로 다름) · 각자 자기 주소로 로그인됨', P(S[4]).get('me') == PROF and P(S[5]).get('me') == PROF2 and P(S[1]).get('token') != P(S[3]).get('token'), [P(S[4]).get('me'), P(S[5]).get('me')])

# ═════════ ④ 받을 주소 ═════════
r = run(login() + [api('add', token='{{token}}', email=PROF), {'do': 'dump'}])
S = r['steps']; F = r['final']
rec = json.loads(F['props']['RECIPIENTS'])
ok('④ 본인 주소는 번호 없이 바로 추가(방금 메일 인증을 마쳤으므로) · 누가 언제 등록했는지 저장', P(S[2]).get('step') == 'done' and [x['a'] for x in rec] == [PROF] and rec[0]['by'] == PROF and re.fullmatch(r'2026-11-07 12:00', rec[0]['at']) and len(F['mails']) == 1, (rec, len(F['mails'])))
r = run(login() + [api('add', token='{{token}}', email=LAB), {'do': 'dump'}, api('verify', token='{{token}}', email=LAB, code='{{code}}'), {'do': 'dump'}])
S = r['steps']
mlab = mails_to(S[3], LAB)
ok('④ 다른 주소를 넣으면 그 주소로 인증 번호가 가고(연구자에게 가지 않음) 번호를 입력해야 추가됨 — 그 전에는 목록이 그대로', P(S[2]).get('step') == 'verify' and len(mlab) == 1 and 'RECIPIENTS' not in S[3]['props'] and P(S[4]).get('step') == 'done' and [x['a'] for x in P(S[4])['recipients']] == [LAB], (P(S[2]), P(S[4])))
ok('④ 그 주소로 가는 메일: 요청한 연구자 주소는 가려서(pr***@example.org) 보이고 원문은 안 보임 · 6자리 번호 하나 · 첨부·참조 없음', 'pr***@example.org' in mlab[0]['body'] and PROF not in mlab[0]['body'] and set(mlab[0]['keys']) == {'body', 'name', 'subject', 'to'} and len(re.findall(r'\d{6}', mlab[0]['body'])) == 1, mlab[0]['body'][:200])
r = run(login() + [api('add', token='{{token}}', email=LAB)] + [api('verify', token='{{token}}', email=LAB, code=c) for c in ('111111', '222222', '333333', '444444', '555555')] + [api('verify', token='{{token}}', email=LAB, code='{{code}}'), {'do': 'dump'}])
S = r['steps']
ok('④ 인증 번호를 5번 틀리면 그 번호는 폐기되고 추가되지 않음', all(P(x).get('code') == 'bad_code' for x in S[3:9]) and 'RECIPIENTS' not in S[-1]['props'], [P(x).get('code') for x in S[3:9]])
r = run(login() + [api('add', token='{{token}}', email=LAB), api('verify', token='{{token}}', email=LAB2, code='{{code}}'), api('verify', token='{{token}}', email=LAB, code='{{code#0}}'), {'do': 'dump'}])
S = r['steps']
ok('④ 번호는 그 연구자가 요청한 그 주소에만 유효: 다른 주소에 대고 쓰거나 로그인 번호로 추가 인증을 하면 거절', P(S[3]).get('code') == 'bad_code' and P(S[4]).get('code') == 'bad_code' and 'RECIPIENTS' not in S[5]['props'], [P(S[3]), P(S[4])])
r = run([api('code', email=PROF), api('add', token='x', email=LAB), api('login', email=PROF, code='{{code}}'), api('add', token='{{token}}', email=LAB), api('verify', token='{{token}}', email=PROF, code='{{code#0}}'), api('login', email=PROF2, code='{{code#1}}')])
S = r['steps']
ok('④ 추가 인증 번호를 로그인 번호처럼 쓸 수 없고, 로그인 번호를 추가 인증에 쓸 수 없음', P(S[4]).get('code') == 'bad_code' and P(S[5]).get('code') == 'bad_code', [P(S[4]), P(S[5])])
r = run(login(PROF) + login(PROF2) + [api('add', token='{{token#0}}', email=LAB), api('verify', token='{{token#1}}', email=LAB, code='{{code}}'), {'do': 'dump'}])
S = r['steps']
ok('④ 연구자 A 가 요청한 추가 번호를 연구자 B 가 가로채 쓸 수 없음(번호는 요청한 사람 몫)', P(S[5]).get('code') == 'bad_code' and 'RECIPIENTS' not in S[6]['props'], P(S[5]))
steps = login() + [api('add', token='{{token}}', email=PROF), api('add', token='{{token}}', email=PROF), api('add', token='{{token}}', email=OPER), api('add', token='{{token}}', email='  REPORT@Example.ORG  '), api('add', token='{{token}}', email='Prof@EXAMPLE.org')]
r = run(steps)
S = r['steps']
ok('④ 이미 받는 주소(연구자 본인 · 운영자 주소 · 대소문자/공백만 다른 같은 주소)는 “이미 받는 주소” 로 거절', [P(S[i]).get('code') for i in (3, 4, 5, 6)] == ['dup'] * 4, [P(S[i]).get('code') for i in (3, 4, 5, 6)])
r = run(login() + [api('add', token='{{token}}', email='lab9@example.org'), {'do': 'dump'}], props={'RECIPIENTS': json.dumps([{'a': f'l{i}@example.org', 'by': PROF, 'at': ''} for i in range(5)])})
S = r['steps']
ok('④ 연구자가 등록할 수 있는 주소는 최대 5개 — 6번째는 “최대 5개” 안내로 거절하고 메일도 안 감', P(S[2]).get('code') == 'full' and not mails_to(S[3], 'lab9@example.org') and len(S[3]['mails']) == 1, [P(S[2]), len(S[3]['mails'])])
steps = login() + sum([[api('add', token='{{token}}', email=f'lab{i}@example.org'), api('verify', token='{{token}}', email=f'lab{i}@example.org', code='{{code}}')] for i in range(3)], []) + [api('state', token='{{token}}')]
r = run(steps)
S = r['steps']
ok('④ 다른 주소 3개를 차례로 추가(요청→번호→추가)하면 목록이 3개가 됨', all(P(S[2 + 2 * i]).get('step') == 'verify' and P(S[3 + 2 * i]).get('step') == 'done' for i in range(3)) and [x['a'] for x in P(S[-1])['recipients']] == [f'lab{i}@example.org' for i in range(3)], [P(x).get('step') for x in S])
bad_addrs = ['a@x.org,b@y.org', 'a@x.org;b@y.org', 'a@x.org b@y.org', '<a@x.org>', 'a@x.org\nBcc: z@y.org', 'a@x.org\r\nBcc: z@y.org', 'name@', '@x.org', 'a@x', 'a@x..org', '.a@x.org', 'a..b@x.org', 'a@-x.org', 'a@x-.org', 'a@x.o', '한글@x.org', 'a@한글.org', 'a' * 95 + '@x.org', 'a@x.org\u0000', 'a@x.org‮', '"a b"@x.org', 'a@[1.2.3.4]', "a'b@x.org", 'mailto:a@x.org']
r = run(login() + [api('add', token='{{token}}', email=a) for a in bad_addrs] + [{'do': 'dump'}])
S = r['steps']
ok('④ 이상한 주소(쉼표·세미콜론·공백·꺾쇠·줄바꿈 머리글 끼워넣기·길이·한글·IP·따옴표 등 24가지)는 모두 거절하고 메일을 보내지 않음', all(P(x).get('code') == 'email' for x in S[2:-1]) and len(S[-1]['mails']) == 1, [(a, P(x).get('code')) for a, x in zip(bad_addrs, S[2:-1]) if P(x).get('code') != 'email'])
r = run(login() + [api('add', token='{{token}}', email=PROF), api('add', token='{{token}}', email=LAB), api('verify', token='{{token}}', email=LAB, code='{{code}}'), api('remove', token='{{token}}', email=LAB), api('remove', token='{{token}}', email=LAB), api('remove', token='{{token}}', email=OPER), api('remove', token='{{token}}', email='nope'), api('remove', token='{{token}}', email='  PROF@example.org '), {'do': 'dump'}])
S = r['steps']
ok('④ 지우기: 지우면 목록에서 빠짐 · 같은 주소를 또 지우거나 없는 주소는 “등록돼 있지 않음” · 운영자 주소는 연구자가 지울 수 없음 · 대소문자 달라도 지워짐', P(S[5]).get('step') == 'removed' and [x['a'] for x in P(S[5])['recipients']] == [PROF] and P(S[6]).get('code') == 'none' and P(S[7]).get('code') == 'none' and P(S[8]).get('code') == 'none' and P(S[9]).get('step') == 'removed' and P(S[9])['recipients'] == [], [P(x).get('code') or P(x).get('step') for x in S[5:10]])
log = json.loads(S[-1]['props']['RESEARCHER_LOG'])
ok('④ 기록(RESEARCHER_LOG): 로그인 · 추가 · 인증 번호 보냄 · 삭제가 시각과 함께 남고, 번호·토큰은 없음', any('로그인' in l for l in log) and any('받는 주소 추가' in l for l in log) and any('받는 주소 삭제' in l for l in log) and not any(c in ' '.join(log) for c in codes_in(S[-1])), log[:3])
r = run(login() + [api('add', token='{{token}}', email='x@other.net'), api('add', token='{{token}}', email='y@Sub.Example.org'), api('add', token='{{token}}', email='z@example.org'), api('state', token='{{token}}')], props={'RECIPIENT_DOMAINS': ' Example.org , ,sookmyung.ac.kr'})
S = r['steps']
ok('④ 허용 도메인(RECIPIENT_DOMAINS)을 정해 두면 그 도메인 주소만 등록 가능(하위 도메인·다른 도메인은 거절, 화면에 안내 표시)', P(S[2]).get('code') == 'domain' and P(S[3]).get('code') == 'domain' and P(S[4]).get('step') == 'verify' and P(S[5]).get('domains') == ['example.org', 'sookmyung.ac.kr'], [P(x).get('code') or P(x).get('step') for x in S[2:5]])
r = run(login() + [api('add', token='{{token}}', email=f'q{i}@example.org') for i in range(4)] + [{'do': 'tick', 'minutes': 61}] + login() + [api('add', token='{{token}}', email='q9@example.org'), {'do': 'dump'}])
S = r['steps']
ok('④ 다른 주소 인증 메일은 연구자 한 명이 한 시간에 3통까지(4번째는 “너무 자주” 안내, 메일 안 감) · 한 시간 뒤 다시 가능(로그인 표는 30분이라 다시 인증)', [P(x).get('step') or P(x).get('code') for x in S[2:6]] == ['verify', 'verify', 'verify', 'wait'] and P(S[9]).get('step') == 'verify' and len(S[-1]['mails']) == 1 + 3 + 1 + 1, [P(x).get('step') or P(x).get('code') for x in S[2:10]])
r = run(login() + [{'do': 'mailThrow', 'message': 'quota'}, api('add', token='{{token}}', email=LAB), {'do': 'dump'}])
ok('④ 인증 메일을 보내지 못하면 “보내지 못했습니다” 로 알리고 추가되지 않음 · 오류 원문은 화면에 안 나옴', P(r['steps'][3]).get('code') == 'mail' and 'quota' not in json.dumps(r['steps'][3]) and 'RECIPIENTS' not in r['final']['props'], P(r['steps'][3]))

# ═════════ ⑤ 주간 요약 메일 ═════════
secrets = run([{'do': 'pure', 'demo': True}], props={'RESPONSE_SHEET': SHEET}, sheets=SHEETS)['steps'][0]
RC = json.dumps([{'a': PROF, 'by': PROF, 'at': '2026-11-01 10:00'}, {'a': LAB, 'by': PROF, 'at': '2026-11-02 10:00'}])
r = run([{'do': 'call', 'fn': 'weeklySummary', 'context': 'trigger'}, {'do': 'dump'}], props={'RESPONSE_SHEET': SHEET, 'DEMO_MODE': '1', 'RECIPIENTS': RC}, sheets=SHEETS)
F = r['final']; M = F['mails']
ok('⑤ 주간 요약: 운영자 주소 + 등록된 주소마다 한 통씩 따로(3통) · 받는 사람은 각각 한 명 · 참조/숨은참조/첨부 없음', [m['to'] for m in M] == [OPER, PROF, LAB] and all(set(m['keys']) <= {'to', 'subject', 'body', 'htmlBody', 'name'} for m in M), [m['to'] for m in M])
FOOT = '\n— 이 메일은 연구자 페이지에서 등록된 주소로 보냈습니다. 그만 받으려면 연구자 페이지에서 이 주소를 지우거나 운영자에게 알려 주세요.\n'
ok('⑤ 같은 제목·본문(운영자 복사본은 그대로) · 등록된 주소 쪽 끝에만 “연구자 페이지에서 등록된 주소” 안내가 붙음', len({m['subject'] for m in M}) == 1 and M[0]['body'] == secrets['emailText'] and '등록된 주소로 보냈습니다' not in M[0]['body'] and all(m['body'] == secrets['emailText'] + FOOT for m in M[1:]) and M[0]['htmlBody'] == secrets['emailHtml'], (M[0]['body'] == secrets['emailText'], [m['body'] == secrets['emailText'] + FOOT for m in M[1:]], M[0]['htmlBody'] == secrets['emailHtml']))
bad_all = [html_problems(m['htmlBody'])[1] for m in M]
ok('⑤ 안내를 붙인 HTML 도 열고 닫음 모양이 맞고 안내 문장이 마지막 칸 안에 들어감', not any(bad_all) and all(m['htmlBody'].endswith('</p></div>') for m in M) and 'FOOT' not in M[1]['htmlBody'] and M[1]['htmlBody'].count('연구자 페이지에서 등록된 주소') == 1, bad_all)
ok('⑤ 어느 메일에도 약사 이름·소속·메모(가짜 데이터의 비밀 글 %d개)가 섞이지 않음' % len(secrets['secrets']), not [s for s in secrets['secrets'] if len(s) >= 3 and any(s in (m['subject'] + m['body'] + m['htmlBody']) for m in M) and s not in RR.__dict__.get('DEMO_NOTE', '')], [s for s in secrets['secrets'] if any(s in m['body'] for m in M)][:3])
ok('⑤ 마지막 발송 기록(LAST_MAIL)과 하루 메일 횟수(MAIL_DAY)가 남음', F['props'].get('LAST_MAIL', '').startswith('2026-11-07 ') and F['props'].get('MAIL_DAY') == '2026-11-07:3', (F['props'].get('LAST_MAIL'), F['props'].get('MAIL_DAY')))
r = run([{'do': 'call', 'fn': 'refresh_', 'args': [True], 'context': 'trigger'}], props={'RESPONSE_SHEET': SHEET, 'RECIPIENTS': json.dumps([{'a': 'REPORT@example.org', 'by': PROF, 'at': ''}, {'a': LAB, 'by': PROF, 'at': ''}, {'a': LAB.upper(), 'by': PROF, 'at': ''}, {'a': 'bad address', 'by': PROF}, {'a': 5}, None, 'text'])}, sheets=SHEETS)
ok('⑤ 같은 주소(대소문자만 다름)·운영자와 같은 주소·모양이 이상한 항목은 건너뛰고 한 주소에 한 통만', [m['to'] for m in r['final']['mails']] == [OPER, LAB] and r['steps'][0]['mailCount'] == 2, [m['to'] for m in r['final']['mails']])
r = run([{'do': 'call', 'fn': 'refresh_', 'args': [True], 'context': 'trigger'}], props={'RESPONSE_SHEET': SHEET, 'RECIPIENTS': json.dumps([{'a': f'l{i}@example.org', 'by': PROF, 'at': ''} for i in range(8)])}, sheets=SHEETS)
ok('⑤ 저장된 등록 주소가 5개를 넘어도(손으로 고친 경우) 5개까지만 보냄', len(r['final']['mails']) == 1 + 5, len(r['final']['mails']))
r = run([{'do': 'call', 'fn': 'refresh_', 'args': [True], 'context': 'trigger'}], props={'RESPONSE_SHEET': SHEET, 'RECIPIENTS': '{not json'}, sheets=SHEETS)
ok('⑤ 등록 주소 속성이 깨져 있어도 운영자 주소로는 정상 발송(오류 없음)', [m['to'] for m in r['final']['mails']] == [OPER] and 'error' not in (r['steps'][0] or {}), r['steps'][0])
r = run([{'do': 'call', 'fn': 'refresh_', 'args': [True], 'context': 'trigger'}], props={'RESPONSE_SHEET': SHEET, 'RECIPIENTS': RC, 'SUMMARY_TO': ''}, sheets=SHEETS)
ok('⑤ 운영자 주소(SUMMARY_TO)가 없으면 연구자 등록 주소에도 보내지 않음(설정이 덜 된 상태에서는 아무 데도 안 보냄) · 이유를 남김', not r['final']['mails'] and 'SUMMARY_TO' in r['steps'][0]['mailNote'], r['steps'][0])
r = run([{'do': 'mailQuota', 'n': 2}, {'do': 'call', 'fn': 'refresh_', 'args': [True], 'context': 'trigger'}, {'do': 'dump'}], props={'RESPONSE_SHEET': SHEET, 'RECIPIENTS': RC}, sheets=SHEETS)
ok('⑤ 연구자 등록 주소 한 곳이 실패해도(메일 한도 등) 나머지는 발송되고 이유가 남음 — 오류로 멈추지 않음', [m['to'] for m in r['final']['mails']] == [OPER, PROF] and r['steps'][1]['mailSent'] is True and r['steps'][1]['mailCount'] == 2 and '1곳' in r['steps'][1]['mailNote'] and any('보내지 못했습니다' in l for l in r['final']['logs']), r['steps'][1])
r = run([{'do': 'mailThrow', 'message': 'quota'}, {'do': 'call', 'fn': 'weeklySummary', 'context': 'trigger'}, {'do': 'dump'}], props={'RESPONSE_SHEET': SHEET, 'RECIPIENTS': RC}, sheets=SHEETS)
ok('⑤ 운영자 주소 발송이 실패하면 오류가 그대로 올라오고(자동 실행이 실패로 기록) 등록된 주소에도 보내지 않음', 'quota' in r['steps'][1].get('error', '') and not r['final']['mails'], r['steps'][1])
r = run([{'do': 'call', 'fn': 'refresh_', 'args': [True], 'context': 'trigger'}, {'do': 'dump'}], props={'RESPONSE_SHEET': SHEET, 'RECIPIENTS': RC, 'MAIL_DAY': '2026-11-07:59'}, sheets=SHEETS)
ok('⑤ 하루 메일 60통 상한: 운영자 몫까지만 나가고 나머지는 이유와 함께 보내지 않음', [m['to'] for m in r['final']['mails']] == [OPER] and r['steps'][0]['mailCount'] == 1 and '2곳' in r['steps'][0]['mailNote'], r['steps'][0])
r = run([{'do': 'call', 'fn': 'onFormSubmitCheck', 'context': 'trigger'}, {'do': 'call', 'fn': 'hourlyCheck', 'context': 'trigger'}, {'do': 'setProp', 'key': 'INTAKE_DIRTY', 'value': '1'}, {'do': 'call', 'fn': 'hourlyCheck', 'context': 'trigger'}, {'do': 'dump'}], props={'RESPONSE_SHEET': SHEET, 'RECIPIENTS': RC}, sheets=SHEETS)
ok('⑤ 응답이 올 때의 점검·한 시간 점검은 등록된 주소가 있어도 메일을 보내지 않음', not r['final']['mails'], r['final']['mails'][:1])
r = run([{'do': 'menu', 'fn': 'sendSummaryNow'}, {'do': 'dump'}], props={'RESPONSE_SHEET': SHEET, 'RECIPIENTS': RC}, sheets=SHEETS)
ok('⑤ 메뉴 “요약 메일 지금 보내기” 도 같은 방식(운영자 + 등록된 주소 한 통씩)', [m['to'] for m in r['final']['mails']] == [OPER, PROF, LAB] and r['final']['alerts'][-1] == '요약 메일을 보냈습니다.', r['final']['alerts'][-1:])

# ═════════ ⑥ 운영자 메뉴 ═════════
r = run([{'do': 'menu', 'fn': 'addResearcher', 'text': '  New.Prof@Example.ORG '}, {'do': 'dump'}], props={'RESEARCHERS': json.dumps([PROF])})
F = r['final']
ok('⑥ 연구자 지정: 소문자로 바꿔 저장 · 기록 · 안내(연구자 페이지 주소 만드는 법)', json.loads(F['props']['RESEARCHERS']) == [PROF, 'new.prof@example.org'] and '?page=researcher' in F['alerts'][-1] and 'new.prof@example.org' in F['alerts'][-1] and any('연구자 지정' in l for l in json.loads(F['props']['RESEARCHER_LOG'])), F['alerts'][-1][:120])
r = run([{'do': 'menu', 'fn': 'addResearcher', 'text': 'nope'}, {'do': 'menu', 'fn': 'addResearcher', 'text': 'a@b.org', 'button': 'CANCEL'}, {'do': 'menu', 'fn': 'addResearcher', 'text': PROF}, {'do': 'dump'}], props={'RESEARCHERS': json.dumps([PROF])})
F = r['final']; AL = [a for a in F['alerts'] if not a.startswith('[prompt]')]
ok('⑥ 연구자 지정: 이상한 주소·취소·이미 지정된 주소는 아무것도 안 바꿈', json.loads(F['props']['RESEARCHERS']) == [PROF] and len(AL) == 2 and '모양이 아닙니다' in AL[0] and '이미 지정' in AL[1] and 'RESEARCHER_LOG' not in F['props'], AL)
r = run([{'do': 'menu', 'fn': 'addResearcher', 'text': 'fourth@example.org'}, {'do': 'dump'}], props={'RESEARCHERS': json.dumps([PROF, PROF2, 'third@example.org'])})
ok('⑥ 연구자는 최대 3명', len(json.loads(r['final']['props']['RESEARCHERS'])) == 3 and '최대 3명' in r['final']['alerts'][-1], r['final']['alerts'][-1])
RC2 = json.dumps([{'a': LAB, 'by': PROF, 'at': 'x'}, {'a': LAB2, 'by': PROF2, 'at': 'y'}])
r = run(login(PROF) + [{'do': 'menu', 'fn': 'removeResearcher', 'text': ' PROF@example.org'}, {'do': 'dump'}], props={'RECIPIENTS': RC2})
F = r['final']
ok('⑥ 연구자 지정 취소: 그 연구자가 등록한 받는 주소도 함께 지워지고 다른 연구자가 등록한 것은 남음 · 알림에 몇 개 지웠는지 나옴', json.loads(F['props']['RESEARCHERS']) == [PROF2] and [x['a'] for x in json.loads(F['props']['RECIPIENTS'])] == [LAB2] and '1개' in F['alerts'][-1], (F['props']['RECIPIENTS'], F['alerts'][-1]))
r = run([{'do': 'menu', 'fn': 'removeResearcher', 'text': 'stranger@example.org'}, {'do': 'menu', 'fn': 'removeRecipient', 'text': 'stranger@example.org'}, {'do': 'menu', 'fn': 'removeRecipient', 'text': LAB.upper()}, {'do': 'menu', 'fn': 'removeRecipient', 'text': LAB}, {'do': 'dump'}], props={'RECIPIENTS': RC2})
F = r['final']; AL = [a for a in F['alerts'] if not a.startswith('[prompt]')]
ok('⑥ 지정 취소·받는 주소 지우기: 없는 주소는 안내만 · 대소문자 달라도 지워짐 · 없는 걸 또 지우면 안내', len(AL) == 4 and '지정된 연구자 주소가 아닙니다' in AL[0] and '받는 주소가 아닙니다' in AL[1] and '지웠습니다' in AL[2] and '받는 주소가 아닙니다' in AL[3] and [x['a'] for x in json.loads(F['props']['RECIPIENTS'])] == [LAB2], AL)
steps = [{'do': 'setServiceUrl', 'url': 'https://script.google.test/macros/s/AKFAKE123/exec'}, {'do': 'menu', 'fn': 'researcherStatus'}, {'do': 'setServiceUrl', 'url': 'https://script.google.test/macros/s/AKFAKE123/dev'}, {'do': 'menu', 'fn': 'researcherStatus'}, {'do': 'setServiceUrl'}, {'do': 'menu', 'fn': 'researcherStatus'}, {'do': 'dump'}]
r = run(login() + [api('add', token='{{token}}', email=PROF)] + steps, props={'RECIPIENT_DOMAINS': 'example.org'})
A = r['final']['alerts']
ok('⑥ 현황·주소: /exec 주소면 연구자 페이지 주소(…/exec?page=researcher)를 그대로 보여 줌 · 연구자·등록 주소·허용 도메인·최근 기록 표시', A[-3].startswith('연구자 페이지 주소: https://script.google.test/macros/s/AKFAKE123/exec?page=researcher\n') and PROF in A[-3] and OPER in A[-3] and 'example.org' in A[-3] and '로그인' in A[-3] and '받는 주소 추가' in A[-3], A[-3][:300])
ok('⑥ 현황·주소: /dev 주소면 시험용이라 연구자가 못 연다는 경고 · 주소를 모를 때는 배포 순서 안내', '시험용' in A[-2] and '/exec' in A[-2] and '웹 앱으로 배포한 뒤' in A[-1], (A[-2][:200], A[-1][:120]))
ok('⑥ 현황 알림에 인증 번호·토큰이 나오지 않음', not any(c in x for c in codes_in(r['final']) for x in A) and not any(t in x for t in [P(r['steps'][1]).get('token', 'zz')] for x in A))
r = run([{'do': 'menu', 'fn': 'researcherStatus'}], props={'RESEARCHERS': '', 'SUMMARY_TO': ''})
ok('⑥ 연구자가 없을 때 현황: “없음 — 메뉴 연구자 지정” 안내', '없음' in r['final']['alerts'][-1] and '연구자 지정' in r['final']['alerts'][-1], r['final']['alerts'][-1][:200])
r = run([{'do': 'menu', 'fn': 'onOpen'}])
mn = r['final']['menus'][0] if r['final']['menus'] else {'items': [], 'subs': []}
ok('⑥ 시트를 열 때(onOpen) 메뉴가 오류 없이 한 번 만들어짐', 'error' not in (r['steps'][0] or {}) and len(r['final']['menus']) == 1 and mn.get('name') == 'MedTerm-KR', r['steps'][0])
ok('⑥ 메뉴: 기존 여섯 항목 그대로 + 하위 메뉴 “연구자 페이지” 네 항목', [x[1] for x in mn['items']] == ['setup', 'openIntake', 'closeIntake', 'intakeStatus', 'refreshNow', 'sendSummaryNow'] and len(mn['subs']) == 1 and mn['subs'][0]['name'] == '연구자 페이지' and [x[1] for x in mn['subs'][0]['items']] == ['addResearcher', 'removeResearcher', 'removeRecipient', 'researcherStatus'], mn)

# ═════════ ⑦ 잠금 ═════════
r = run([{'do': 'holdLock'}, api('ping'), api('code', email=PROF), api('state', token='x'), {'do': 'releaseLock'}, api('code', email=PROF), {'do': 'dump'}])
S = r['steps']; F = r['final']
ok('⑦ 다른 작업이 잠금을 잡고 있으면 연구자 요청은 “다른 작업이 돌고 있습니다” 로 기다리다 거절(상태 안 바꿈) · ping 은 잠금 없이 답 · 풀리면 정상', P(S[1]).get('ok') is True and P(S[2]).get('code') == 'busy' and P(S[3]).get('code') == 'busy' and len(F['mails']) == 1 and 'AUTH_RATE' in F['props'] and F['lock']['acquired'] == F['lock']['released'] == 1, (P(S[2]), F['lock']))
r = run(login() + [api('add', token='{{token}}', email=PROF), api('state', token='{{token}}'), {'do': 'dump'}])
ok('⑦ 연구자 요청이 끝나면 잠금을 풀어 줌(요청마다 잡았다 풂)', r['final']['lock']['acquired'] == r['final']['lock']['released'] and r['final']['lock']['acquired'] == 4 and not r['final']['lock']['held'], r['final']['lock'])
r = run(login() + [{'do': 'eval', 'code': "researcherOp_ = function () { throw new Error('boom-secret-detail'); };"}, api('state', token='{{token}}'), api('add', token='{{token}}', email=LAB), {'do': 'dump'}])
S = r['steps']
ok('⑦ 서버 안에서 오류가 나도 화면에는 일반 안내만(오류 내용·위치 숨김) · 로그에만 남김 · 잠금은 풀림', P(S[3]).get('code') == 'server' and 'boom' not in json.dumps(S[3]) + json.dumps(S[4]) and any('boom-secret-detail' in l for l in r['final']['logs']) and r['final']['lock']['acquired'] == r['final']['lock']['released'], P(S[3]))

# ═════════ ⑧ 입력 검사 · 난수 · 해시 ═════════
bodies = ['', 'not json', '[]', '"str"', '5', 'null', '{}', '{"op":5}', '{"op":null}', '{"op":["code"]}', '{"op":"nope"}', '{"op":"state"}', '{"op":"code","email":5}', '{"op":"code","email":["a@b.org"]}',
          '{"op":"login","email":"' + PROF + '","code":{"a":1}}', '{"op":"__proto__"}', '{"op":"constructor"}', '{"op":"toString"}', 'x' * 2001, '{"op":"code","email":"' + 'a' * 3000 + '"}']
r = run([raw(b) for b in bodies] + [raw(None), {'do': 'rpc', 'fn': 'researcherApi', 'args': []}, {'do': 'rpc', 'fn': 'researcherApi', 'args': [{'op': 'ping'}]}, {'do': 'rpc', 'fn': 'researcherApi', 'args': [123]}, {'do': 'dump'}])
S = r['steps']
resp = [P(x) for x in S[:-1]]
good = lambda x: x.get('ok') is False and x.get('code') in ('bad_request', 'auth', 'email', 'bad_code') and re.search(r'[가-힣]', x.get('msg', '')) and not re.search(r'Error|undefined|\bat \w|\.gs', x.get('msg', ''))
ok('⑧ 모양이 틀린 요청 24가지(빈 값·JSON 아님·배열·숫자·op 종류 틀림·__proto__·길이 초과·인수 없음 등)는 모두 거절되고 서버 오류·예외 글이 새지 않음', len(resp) == 24 and all(good(x) for x in resp), [(i, x) for i, x in enumerate(resp) if not good(x)][:4])
ok('⑧ 그 요청들이 아무것도 바꾸지 않음(속성·메일·캐시·로그 그대로)', sorted(S[-1]['props']) == ['RESEARCHERS', 'SUMMARY_TO'] and not S[-1]['mails'] and not S[-1]['cache'] and not S[-1]['logs'], sorted(S[-1]['props']))
r = run([{'do': 'eval', 'code': "[sha_('abc'), sha_(''), sha_('한글')].join(',')"}, {'do': 'eval', 'code': "(function () { var o = [], i; for (i = 0; i < 3000; i++) o.push(code6_()); return o; })()"},
        {'do': 'eval', 'code': "(function () { var o = [], i; for (i = 0; i < 200; i++) o.push(rnd_(48)); return o; })()"},
        {'do': 'eval', 'code': "JSON.stringify([normEmail_('Prof@Example.ORG '), normEmail_('a@b.co'), normEmail_('a@b.c'), normEmail_('x@y'), normEmail_('user+tag@sub.example.org'), normEmail_('a@example.org\\n'), normEmail_('a@x.org\\nBcc: b@y.org'), normEmail_(null), normEmail_(undefined), normEmail_(5), normEmail_({}), normEmail_(['a@b.org'])])"},
        {'do': 'eval', 'code': "JSON.stringify([maskEmail_('prof@example.org'), maskEmail_('ab@x.org'), maskEmail_('a@x.org')])"}])
S = r['steps']
ok('⑧ 해시: 구글이 주는 부호 있는 바이트 배열도 올바른 SHA-256 으로(abc · 빈 글 · 한글 알려진 값과 일치)', S[0].split(',')[:2] == ['ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'] and S[0].split(',')[2] == __import__('hashlib').sha256('한글'.encode()).hexdigest(), S[0])
codes = S[1]
ok('⑧ 인증 번호: 3000개 모두 숫자 6자리(앞자리 0 포함) · 서로 다른 값이 충분히 나옴 · 앞자리 0 이 약 10% · 홀짝이 한쪽으로 쏠리지 않음', all(re.fullmatch(r'\d{6}', c) for c in codes) and len(set(codes)) > 2900 and 200 < sum(c[0] == '0' for c in codes) < 400 and 1300 < sum(int(c[-1]) % 2 for c in codes) < 1700, (len(set(codes)), sum(c[0] == '0' for c in codes), sum(int(c[-1]) % 2 for c in codes)))
ok('⑧ 토큰 원료: 48자리 16진수 · 200개가 모두 다름', all(re.fullmatch(r'[0-9a-f]{48}', t) for t in S[2]) and len(set(S[2])) == 200)
ok('⑧ 메일 주소 정리: 대소문자·공백 정리 · 너무 짧은 주소·줄바꿈 머리글·숫자·객체·배열은 거절', json.loads(S[3]) == ['prof@example.org', 'a@b.co', '', '', 'user+tag@sub.example.org', 'a@example.org', '', '', '', '', '', ''], S[3])
ok('⑧ 주소 가리기: 앞 두 글자만 보임(두 글자 이하는 첫 글자만)', json.loads(S[4]) == ['pr***@example.org', 'a***@x.org', 'a***@x.org'], S[4])
r = run([{'do': 'dump'}], props={'RESEARCHERS': 'not json'})
r1 = run([{'do': 'eval', 'code': 'JSON.stringify([researchers_(PropertiesService.getScriptProperties()), recipients_(PropertiesService.getScriptProperties())])'}], props={'RESEARCHERS': 'not json', 'RECIPIENTS': '{"a":1}'})
r2 = run([{'do': 'eval', 'code': 'JSON.stringify(researchers_(PropertiesService.getScriptProperties()))'}], props={'RESEARCHERS': json.dumps([1, None, 'bad', 'OK@Example.org', 'ok@example.org', {'a': 1}, 'a@b.org', 'c@d.org', 'e@f.org'])})
ok('⑧ 속성이 깨져 있어도(JSON 아님·객체·섞인 값) 비어 있는 것으로 읽음 · 지정 연구자는 소문자·중복 제거·최대 3명', json.loads(r1['steps'][0]) == [[], []] and json.loads(r2['steps'][0]) == ['ok@example.org', 'a@b.org', 'c@d.org'], (r1['steps'][0], r2['steps'][0]))
r = run(login() + [api('add', token='{{token}}', email=PROF), {'do': 'dump'}], props={'RESEARCHERS': json.dumps([PROF]), 'SUMMARY_TO': PROF})
ok('⑧ 운영자 주소와 연구자 주소가 같아도 안전하게 동작(본인 주소 추가는 “이미 받는 주소”)', P(r['steps'][2]).get('code') == 'dup', P(r['steps'][2]))

shutil.rmtree(tmp, ignore_errors=True)
bad = [c for c in checks if c[0] == 'FAIL']
for c in checks: print(*c[:2], ('— ' + c[2]) if c[0] == 'FAIL' and c[2] else '')
print(f"\n{len(checks) - len(bad)}/{len(checks)} 통과" + ('' if not bad else f' · 실패 {len(bad)}건'))
sys.exit(1 if bad else 0)
