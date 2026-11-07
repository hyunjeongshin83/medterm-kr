"""약사 확인서 연구용 분석·그래프 도구 점검 — python3 -I tests/test_review_research.py
 네트워크 불필요. tools/review_research_report.py 를 본다. 임시 폴더의 ‘가짜’ 응답만 쓴다(실제 약사의 응답이 아니다. 저장소 자료는 건드리지 않는다).
 ① 통계 단위 시험(알려진 값)
 ② 가짜 응답 전체 흐름: 접수 현황·최종 판정 행렬·통계를, 이 시험이 따로 계산한 값과 맞춘다
 ③ 개인정보: 결과 파일(요약·보고서·메일 본문·그림)에 이름·소속·메모·기타 자료가 없음 · 운영자 전용 파일 권한 · 엑셀 수식 방지
 ④ 문(연구 이용 동의·면허 확인)  ⑤ 입력 형식·같은 약사 재제출·사전이 바뀐 판정·시각 순서
 ⑥ 종료 코드와 입력 오류  ⑦ 메일 본문(그림·링크·스크립트 없음, 크기)  ⑧ 같은 입력이면 같은 결과 · 도구 소스에 네트워크·실행 호출이 없음
 ⑨ 응답 줄별 점검표(--export-checks) · 표준이 아닌 JSON(NaN)·아주 깊게 겹친 글·아주 큰 칸에도 멈추지 않음 · 메일 HTML 의 속성·닫힘 모양"""
import contextlib, csv, datetime, io, itertools, json, math, os, re, shutil, stat, sys, tempfile
from fractions import Fraction
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
sys.path.insert(0, os.path.join(root, 'tools')); sys.path.insert(0, os.path.join(root, 'build'))
import review_lib as RL, review_research_report as RR

checks = []
def ok(name, cond, extra=''): checks.append(('PASS' if cond else 'FAIL', name, str(extra)[:240]))

DATA = os.path.join(root, 'data')
TODAY = datetime.date(2026, 11, 7)
IT = RL.build_items(DATA)
tmp = tempfile.mkdtemp(prefix='test_review_research_')

def run(args):
    """main() 을 소리 없이 돌려 (종료 코드, 표준출력, 표준오류) 를 돌려준다. 문자열 종료(SystemExit('…'))는 종료 코드 1."""
    o, e, code = io.StringIO(), io.StringIO(), None
    with contextlib.redirect_stdout(o), contextlib.redirect_stderr(e):
        try: code = RR.main(args)
        except SystemExit as x: code = 1 if isinstance(x.code, str) else x.code
    return code, o.getvalue(), e.getvalue()

def rd(path, enc='utf-8'): return open(path, encoding=enc).read()
def jl(path): return json.load(open(path, encoding='utf-8'))
def csv_rows(path): return list(csv.DictReader(open(path, encoding='utf-8-sig', newline='')))

def sub(name, org, scope, ans, created='2026-11-05', public=False, refs=('mfds',), other=''):
    """손으로 만든 가짜 확인서. ans = {항목번호(1부터): 'ok' | ('diff', '메모')}"""
    its, answers = IT['items'][scope], {}
    for no, v in ans.items():
        it = its[no - 1]; memo = None
        if isinstance(v, tuple): v, memo = v
        answers[it['id']] = {'v': v, 'h': it['h']}
        if memo: answers[it['id']]['m'] = memo
    return {'schema': RL.SCHEMA, 'scope': scope, 'scope_hash': IT['scopes'][scope]['hash'], 'app': '1.6.0', 'created': created,
            'reviewer': {'name': name, 'affiliation': org, 'public': public, 'license_claimed': True}, 'refs': list(refs), 'refs_other': other, 'attested': True, 'answers': answers}

def write_json_dir(name, subs):
    d = os.path.join(tmp, name); os.makedirs(d)
    for k, (fname, obj) in enumerate(subs):
        open(os.path.join(d, fname), 'w', encoding='utf-8').write(obj if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False, indent=1) + '\n')
    return d

def write_csv(name, header, rows):
    p = os.path.join(tmp, name)
    with open(p, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)
    return p

# ── ① 통계 단위 시험 ──
buf = io.StringIO()
with contextlib.redirect_stdout(buf): rc = RR.selftest()
ok('① 통계 단위 시험(selftest): Cohen·AC1·Fleiss·Krippendorff α·k*·I-CVI 기준·시각 읽기가 알려진 값과 맞음', rc == 0 and 'FAIL' not in buf.getvalue() and buf.getvalue().count('PASS') >= 15, buf.getvalue().count('PASS'))
ok('① 미국식 시각(월/일/연 오후)도 읽음 · 날짜가 이상하면 None', RR.parse_ts('11/7/2026 3:55:12 PM') == (datetime.date(2026, 11, 7), 15 * 3600 + 55 * 60 + 12) and RR.parse_ts('2026. 13. 40 오전 1:00:00') == (None, 0))
ok('① csv_safe: 수식으로 읽힐 글 앞에 작은따옴표', all(RR.csv_safe(x).startswith("'") for x in ('=1+1', '+SUM(A1)', '-2', '@SUM(1)')) and RR.csv_safe('홍길동') == '홍길동' and RR.csv_safe(None) == '')

# ── ② 가짜 응답 전체 흐름 ──
header, rows, exp = RR.make_demo(IT, TODAY)
resp = write_csv('responses.csv', header, rows)
out1, priv = os.path.join(tmp, 'out1'), os.path.join(tmp, 'priv'); os.makedirs(priv)
LINK, MEMOS, RATINGS = (os.path.join(priv, n) for n in ('link.csv', 'memos.csv', 'ratings.csv'))
code, so, se = run([resp, '--out', out1, '--today', '2026-11-07', '--link-table', LINK, '--export-memos', MEMOS, '--export-ratings', RATINGS])
ok('② 가짜 응답 24행: 종료 코드 0 · 만든 파일이 모두 있음(요약·보고서·메일 본문 2종·그림 9장)',
   code == 0 and all(os.path.exists(os.path.join(out1, f)) for f in ('summary.json', 'report.html', 'email.html', 'email.txt', 'verdict_by_scope.png', 'progress.png', 'icvi_names.png', 'icvi_law.png', 'heatmap_names.png', 'heatmap_law.png', 'diverging_names.png', 'diverging_law.png')), (code, se[:200]))
ok('② 읽은 열을 이름과 함께 알려 줌(확인서 글·시각·연구 이용 동의·면허 확인)', all(k in so for k in ('확인서 글 = 2번', '시각 = 1번', '연구 이용 동의 = 4번', '면허 확인 = 5번')), so[:300])
S = jl(os.path.join(out1, 'summary.json'))
it = S['intake']
ok('② 접수 현황이 가짜 응답을 만들 때 센 값과 같음(접수 24 · 분석 16 · 형식 오류 4종 · 동의 없음 2 · 면허 전 2 · 사전 변경 5개)',
   it['received'] == exp['counts']['received'] == 24 and it['accepted_submissions'] == exp['counts']['accepted'] == 16 and it['stale_answers'] == exp['counts']['stale'] == 5
   and it['rejected'] == exp['counts']['rejected'] == {'json': 1, 'license_claim': 1, 'scope': 1, 'schema': 1} and it['excluded_by_gate'] == exp['counts']['gate'] == {'research_consent': 2, 'license': 2} and it['raters'] == 8, it)

link = {r['약사번호']: RR.norm_key(r['이름'], r['소속']) for r in csv_rows(LINK)}
obs = {'names': {}, 'law': {}}
for r in csv_rows(RATINGS): obs[r['scope']].setdefault(link[r['rater']], {})[r['item_id']] = r['verdict']
ok('② 분석에 쓴 최종 판정(약사×항목)이 이 시험이 따로 만든 기대 행렬과 완전히 같음(재제출은 항목별로 덮어쓰기·사전 변경 판정은 제외·동의 없음·면허 전은 제외)', obs == exp['final'], {k: len(v) for k, v in obs.items()})
ok('② 가명이 R01… 번호이고 약사 8명이 모두 다른 번호', sorted(link) == [f'R0{i}' for i in range(1, 9)] and len(set(link.values())) == 8, sorted(link))

def per_item(final_sid, its):
    return [[final_sid[r][i['id']] for r in sorted(final_sid) if i['id'] in final_sid[r]] for i in its]

def ac1_indep(units):
    us = [u for u in units if len(u) >= 2]; n = len(us)
    pa = sum(Fraction(sum(1 for a, b in itertools.combinations(u, 2) if a == b), math.comb(len(u), 2)) for u in us) / n
    pi = [sum(Fraction(u.count(k), len(u)) for u in us) / n for k in ('ok', 'diff', 'unsure')]
    pe = sum(p * (1 - p) for p in pi) / 2
    return float(pa), float((pa - pe) / (1 - pe))

def alpha_indep(units):
    us = [u for u in units if len(u) >= 2]; N = sum(len(u) for u in us)
    do = sum(Fraction(sum(1 for i, j in itertools.permutations(range(len(u)), 2) if u[i] != u[j]), len(u) - 1) for u in us) / N
    pool = [v for u in us for v in u]
    de = Fraction(sum(1 for i, j in itertools.permutations(range(N), 2) if pool[i] != pool[j]), N * (N - 1))
    return float(1 - do / de)

def fleiss_indep(units):
    by_n = {}
    for u in units:
        if len(u) >= 2: by_n.setdefault(len(u), []).append(u)
    m, us = max(by_n.items(), key=lambda kv: (len(kv[1]), kv[0]))
    rows = [[u.count(k) for k in ('ok', 'diff', 'unsure')] for u in us]
    pbar = sum(Fraction(sum(c * c for c in r) - m, m * (m - 1)) for r in rows) / len(rows)
    pj = [Fraction(sum(r[j] for r in rows), len(rows) * m) for j in range(3)]
    pe = sum(p * p for p in pj)
    return float((pbar - pe) / (1 - pe)), m, len(rows)

def near(a, b, t=1e-9): return a is not None and abs(a - b) <= t

for sid in ('names', 'law'):
    sc, its = S['scopes'][sid], IT['items'][sid]
    units = per_item(exp['final'][sid], its)
    ns = [len(u) for u in units]
    icv = [u.count('ok') / len(u) for u in units]
    th = [None if n < 3 else (1.0 if n <= 5 else 0.78) for n in ns]
    ev = [i for i, t in enumerate(th) if t is not None]
    ok(f'② [{sid}] 항목마다 맞다·다르다·모르겠다 수와 I-CVI 가 따로 센 값과 같음', all((i['ok'], i['diff'], i['unsure'], i['n']) == (u.count('ok'), u.count('diff'), u.count('unsure'), len(u)) and near(i['icvi'], c) for i, u, c in zip(sc['items'], units, icv)), sid)
    ok(f'② [{sid}] 항목별 기준(3~5명 1.00 · 6명 이상 0.78)과 충족·미달 판정이 맞음', all(i['threshold'] == t and i['status'] == ('na' if t is None else ('pass' if c + 1e-9 >= t else 'fail')) for i, t, c in zip(sc['items'], th, icv)), sid)
    ok(f'② [{sid}] S-CVI/Ave · S-CVI/UA 가 따로 계산한 값과 같음', near(sc['scvi_ave'], sum(icv[i] for i in ev) / len(ev)) and near(sc['scvi_ua'], sum(1 for i in ev if icv[i] >= 1 - 1e-9) / len(ev)) and sc['evaluable_items'] == len(ev), (sc['scvi_ave'], sc['scvi_ua']))
    pa, ac1 = ac1_indep(units)
    ag = sc['agreement']
    ok(f'② [{sid}] 관찰 일치율 · Gwet AC1 이 쌍 비교로 따로 계산한 값과 같음', near(ag['observed'], pa) and near(ag['ac1'], ac1), (ag['observed'], pa, ag['ac1'], ac1))
    ok(f'② [{sid}] Krippendorff α 가 쌍 비교로 따로 계산한 값과 같음(결측 있어도)', near(ag['alpha'], alpha_indep(units)), (ag['alpha'], alpha_indep(units)))
    fk, fm, fn = fleiss_indep(units)
    ok(f'② [{sid}] Fleiss κ 가 따로 계산한 값과 같고 ‘항목마다 같은 판정자 수’인 항목만 씀', near(ag['fleiss']['kappa'], fk) and (ag['fleiss']['raters_per_item'], ag['fleiss']['items']) == (fm, fn), (ag['fleiss'], fk, fm, fn))
    cells = sum(ns)
    ok(f'② [{sid}] 판정 수·완성도·판정 분포 합이 맞음', sc['cells'] == cells == sum(sc['verdicts'].values()) and near(sc['completeness'], cells / (sc['n_raters'] * sc['n_items'])), (sc['cells'], cells))
ok('② 범위별 약사 수: 성분·상품명 8명(부분 응답 1명 포함) · 약사법 7명', (S['scopes']['names']['n_raters'], S['scopes']['law']['n_raters']) == (8, 7))
ok('② 응답이 몰린 주 축이 두 범위에 같음(같은 주 시작·같은 길이)', [w['week'] for w in S['scopes']['names']['weekly']] == [w['week'] for w in S['scopes']['law']['weekly']] and S['scopes']['names']['weekly'][-1]['week'] == '2026-11-02')
ok('② 가명 판정표 줄 수 = 판정 수 합 · 메모 파일 줄 수 = 메모 수 합', len(csv_rows(RATINGS)) == sum(S['scopes'][s]['cells'] for s in S['scopes']) and len(csv_rows(MEMOS)) == sum(S['scopes'][s]['memos']['count'] for s in S['scopes']), (len(csv_rows(RATINGS)), len(csv_rows(MEMOS))))
ok('② 소속 분류는 3명 미만이면 숨김 · 참고 자료별 판정도 3명 미만이면 숨김', all(n >= 3 for n in S['affiliation_categories']['shown'].values()) and S['affiliation_categories']['hidden_people'] == 3
   and all((r['verdicts'] is None) == (r['raters'] < 3) for sid in S['scopes'] for r in S['scopes'][sid]['refs'].values()), S['affiliation_categories'])
ok('② 점검 줄: 개인정보 문자열 점검 통과 문구(100개 넘는 문자열 검사)', (lambda m: m and int(m.group(1)) > 100)(re.search(r'개인정보 문자열 점검: (\d+)개', so)), so[-200:])

# ── ③ 개인정보 ──
secret_texts, tokens = set(), set()
for r in rows:
    text = r[1]
    tokens |= set(re.findall(r'가짜[0-9A-Za-z가-힣]+', text))
    try: o = json.loads(text)
    except ValueError: continue
    rv = o.get('reviewer', {})
    for v in (rv.get('name'), rv.get('affiliation'), o.get('refs_other')):
        if v: secret_texts.add(v)
    for a in o.get('answers', {}).values():
        if a.get('m'): secret_texts.add(a['m'])
outputs = {f: open(os.path.join(out1, f), 'rb').read() for f in os.listdir(out1)}
leaks = [(f, s) for f, b in outputs.items() for s in (secret_texts | tokens) if s.encode('utf-8') in b]
ok(f'③ 결과 폴더의 모든 파일(요약·보고서·메일 본문·그림 {len(outputs)}개)에 이름·소속·메모·기타 자료가 한 글자도 없음(가짜 값 {len(secret_texts)}개·‘가짜…’ 글 {len(tokens)}개 검사)', not leaks and len(secret_texts) > 50 and len(tokens) >= 10, leaks[:3])
ok('③ 결과 폴더에 이름·소속 표나 메모 파일이 없음(운영자 전용 파일은 결과 폴더 밖)', sorted(os.listdir(out1)) == sorted(['summary.json', 'report.html', 'email.html', 'email.txt', 'verdict_by_scope.png', 'progress.png', 'icvi_names.png', 'icvi_law.png', 'heatmap_names.png', 'heatmap_law.png', 'diverging_names.png', 'diverging_law.png']), sorted(os.listdir(out1)))
ok('③ 이름·소속 표(link)에는 가짜 이름이 있고 파일 권한이 소유자 전용(600) · 메모 파일도 600', any('가짜약사01' in r['이름'] for r in csv_rows(LINK)) and stat.S_IMODE(os.stat(LINK).st_mode) == 0o600 and stat.S_IMODE(os.stat(MEMOS).st_mode) == 0o600)
ok('③ 가명 판정표에는 약사 번호·범위·항목·판정만(이름·소속·메모 없음)', list(csv_rows(RATINGS)[0]) == ['rater', 'scope', 'item_id', 'item_no', 'verdict'] and not any(t in rd(RATINGS) for t in tokens))
sm = jl(os.path.join(out1, 'summary.json'))
ok('③ 요약(JSON)에 ‘reviewer’·‘name’·‘affiliation’·‘refs_other’·메모 글 열쇠가 없고, 약사는 R번호 · 분류로만 나옴',
   not re.search(r'"(reviewer|name|affiliation|refs_other|note|notes|memo_text)"', rd(os.path.join(out1, 'summary.json'))) and all(re.fullmatch(r'R\d\d', r['id']) for sc in sm['scopes'].values() for r in sc['raters']))
# 엑셀 수식 방지: 이름·메모가 =,+,-,@ 로 시작하는 확인서
inj = write_json_dir('inj', [('a.json', sub('=1+1', '@소속', 'law', {1: ('diff', '=HYPERLINK("http://x","y")'), 2: ('diff', '+메모'), 3: ('unsure', '-메모')}))])
priv2 = os.path.join(tmp, 'priv2'); os.makedirs(priv2)
code, so2, se2 = run([inj, '--out', os.path.join(tmp, 'out_inj'), '--no-gates', '--today', '2026-11-07', '--link-table', os.path.join(priv2, 'l.csv'), '--export-memos', os.path.join(priv2, 'm.csv')])
lt, mm = csv_rows(os.path.join(priv2, 'l.csv')), csv_rows(os.path.join(priv2, 'm.csv'))
ok('③ 이름·소속·메모가 =,+,-,@ 로 시작해도 운영자 파일에서는 앞에 작은따옴표가 붙음(엑셀 수식 방지)', code == 0 and lt[0]['이름'] == "'=1+1" and lt[0]['소속'] == "'@소속" and sorted(r['메모'] for r in mm) == sorted(["'=HYPERLINK(\"http://x\",\"y\")", "'+메모", "'-메모"]), (lt, mm))
ok('③ 그 이름·메모도 결과 폴더 파일에는 없음', not any(x.encode() in open(os.path.join(tmp, 'out_inj', f), 'rb').read() for f in os.listdir(os.path.join(tmp, 'out_inj')) for x in ('=1+1', 'HYPERLINK', '@소속', '+메모')))

# ── ④ 문(연구 이용 동의·면허 확인) ──
out2 = os.path.join(tmp, 'out2')
code, so, se = run([resp, '--out', out2, '--today', '2026-11-07', '--no-gates'])
S2 = jl(os.path.join(out2, 'summary.json'))
ok('④ --no-gates: 동의 없음·면허 전 응답도 세고(약사 10명 · 분석 20건) 결과마다 ‘동의·면허 확인 안 함’을 크게 표시', code == 0 and S2['intake']['raters'] == 10 and S2['intake']['accepted_submissions'] == 20 and not S2['intake']['excluded_by_gate']
   and S2['meta']['gates'] is False and '동의·면허 확인을 하지 않고' in rd(os.path.join(out2, 'report.html')) and '동의·면허 확인 없이' in rd(os.path.join(out2, 'email.html')) and '[동의·면허 확인 안 함]' in S2['meta']['email_subject'], S2['intake'])
nogate_csv = write_csv('nogate_cols.csv', header[:3], [r[:3] for r in rows])
code, so, se = run([nogate_csv, '--out', os.path.join(tmp, 'out3'), '--today', '2026-11-07'])
S3 = jl(os.path.join(tmp, 'out3', 'summary.json'))
ok('④ 동의·면허 열이 없는 시트: 아무도 분석하지 않고(확인 불가로 뺌 20건) 종료 코드 2 · 열을 찾으라는 안내', code == 2 and S3['intake']['excluded_by_gate'] == {'gate_unknown': 20} and S3['intake']['raters'] == 0 and '열을 찾지 못해' in se, (code, S3['intake'], se[:160]))
base = sub('가짜갑', '가짜약국갑', 'law', {1: 'ok', 2: 'ok', 3: 'ok'})
cases = [('연구 이용에 동의합니다', 'Y', True), ('동의하지 않습니다', 'Y', False), ('아니오', 'Y', False), ('', 'Y', False), ('연구 이용에 동의합니다', '', False), ('연구 이용에 동의합니다', '미확인', False),
         ('연구 이용에 동의합니다', '확인', True), ('연구 이용에 동의합니다', '예', True), ('연구 이용에 동의합니다', 'yes', True), ('동의함', '확인함', True), ('비동의', 'Y', False)]
grows = []
for k, (c, l, _) in enumerate(cases):
    o = json.loads(json.dumps(base, ensure_ascii=False)); o['reviewer']['name'] = f'가짜을{k:02d}'
    grows.append([f'2026. 11. 5 오후 3:{k:02d}:00', json.dumps(o, ensure_ascii=False), '동의합니다', c, l])
gcsv = write_csv('gate_cases.csv', header, grows)
code, so, se = run([gcsv, '--out', os.path.join(tmp, 'out4'), '--today', '2026-11-07'])
S4 = jl(os.path.join(tmp, 'out4', 'summary.json'))
want = sum(1 for _, _, y in cases if y)
ok(f'④ 연구 동의·면허 확인 값 읽기 {len(cases)}가지: 동의·확인으로 읽히는 {want}건만 분석, 나머지는 뺌', S4['intake']['accepted_submissions'] == want and S4['intake']['raters'] == want and sum(S4['intake']['excluded_by_gate'].values()) == len(cases) - want, S4['intake'])

# ── ⑤ 입력 형식·재제출·사전 변경·시각 순서 ──
D = write_json_dir('hand3', [('r1.json', sub('가짜하나', '가짜약국1', 'law', {1: 'ok', 2: 'ok', 3: 'ok', 4: 'diff'})), ('r2.json', sub('가짜둘', '가짜약국2', 'law', {1: 'ok', 2: 'ok', 3: 'unsure', 4: 'diff'})),
                             ('r3.json', sub('가짜셋', '가짜약국3', 'law', {1: 'ok', 2: 'diff', 3: 'ok', 4: 'diff'}))])
out5 = os.path.join(tmp, 'out5')
code, so, se = run([D, '--out', out5, '--no-gates', '--today', '2026-11-07'])
S5 = jl(os.path.join(out5, 'summary.json')); L5 = S5['scopes']['law']; i5 = L5['items']
ok('⑤ 손으로 센 세 약사 × 네 항목: I-CVI 1.00 · 0.67 · 0.67 · 0.00, 충족 1·미달 3, 나머지 49개 항목은 판정 부족', code == 0 and [round(i['icvi'], 4) for i in i5[:4]] == [1.0, 0.6667, 0.6667, 0.0] and [i['status'] for i in i5[:4]] == ['pass', 'fail', 'fail', 'fail']
   and all(i['status'] == 'na' for i in i5[4:]) and L5['items_below'] == [2, 3, 4], [round(i['icvi'], 4) for i in i5[:4]])
ok('⑤ 손으로 센 S-CVI/Ave = 0.5833 · S-CVI/UA = 0.25 · 일치율 = 0.6667 · 약사 3명 · 판정 12건', near(L5['scvi_ave'], (1 + 2 / 3 + 2 / 3) / 4, 1e-9) and near(L5['scvi_ua'], 0.25) and near(L5['agreement']['observed'], (1 + 1 / 3 + 1 / 3 + 1) / 4, 1e-9) and L5['n_raters'] == 3 and L5['cells'] == 12, (L5['scvi_ave'], L5['agreement']))
ok('⑤ 성분·상품명 범위는 응답이 없어 약사 0명 · 요약 글이 “아직 없습니다”', S5['scopes']['names']['n_raters'] == 0 and '분석할 약사 응답이 아직 없습니다' in rd(os.path.join(out5, 'email.txt')))
D1 = write_json_dir('hand1', [('one.json', sub('가짜혼자', '가짜약국', 'names', {1: 'ok', 2: ('diff', '표기 다름'), 3: 'unsure'}))])
code, so, se = run([D1, '--out', os.path.join(tmp, 'out6'), '--no-gates', '--today', '2026-11-07'])
t6 = rd(os.path.join(tmp, 'out6', 'email.txt'))
ok('⑤ 약사 1명: 오류 없이 끝나고 ‘3명 미만이라 해석하지 않습니다’ 안내 · 그림도 만들어짐', code == 0 and '3명 미만이라 I-CVI·일치도를 해석하지 않습니다' in t6 and os.path.exists(os.path.join(tmp, 'out6', 'heatmap_names.png')), (code, se[:200]))
D2 = write_json_dir('hand2', [('a.json', sub('가짜하나', '가짜약국1', 'law', {1: 'ok', 2: 'ok', 3: 'diff', 4: 'unsure'})), ('b.json', sub('가짜둘', '가짜약국2', 'law', {1: 'ok', 2: 'diff', 3: 'diff', 4: 'ok'}))])
code, so, se = run([D2, '--out', os.path.join(tmp, 'out7'), '--no-gates', '--today', '2026-11-07'])
L7 = jl(os.path.join(tmp, 'out7', 'summary.json'))['scopes']['law']; co = L7['agreement']['cohen']
po = 2 / 4; pe = (3 / 4) * (2 / 4) + (1 / 4) * (2 / 4) + 0   # 가짜하나: ok2 diff1 unsure1 / 가짜둘: ok2 diff2 → pe = (2/4·2/4)+(1/4·2/4)+(1/4·0)
ok('⑤ 약사 2명이면 Cohen κ 도 계산(관찰 일치율 0.5 · 우연 일치 0.375 → κ = 0.2) · 3명 미만 항목은 I-CVI 해석 안 함', co and co['pairs'] == 4 and near(co['observed'], 0.5) and near(co['kappa'], (0.5 - 0.375) / (1 - 0.375)) and all(i['status'] == 'na' for i in L7['items']), co)
# 같은 약사: 이름·소속 표기가 공백·대소문자만 다르면 같은 사람, 같은 날이면 파일 순서가 아니라 작성일이 늦은 것이 이김
D3 = write_json_dir('resub', [('a.json', sub('Hong Gil', 'Saebom Pharm', 'law', {1: 'ok', 2: 'ok', 3: 'ok'}, created='2026-11-05')), ('b.json', sub(' hong  gil ', 'SAEBOM   pharm', 'law', {1: 'diff', 2: 'ok'}, created='2026-11-01')),
                              ('c.json', sub('Hong Gil', 'Saebom Pharm 본점', 'law', {1: 'diff'}, created='2026-11-06'))])
code, so, se = run([D3, '--out', os.path.join(tmp, 'out8'), '--no-gates', '--today', '2026-11-07'])
S8 = jl(os.path.join(tmp, 'out8', 'summary.json')); L8 = S8['scopes']['law']['items']
ok('⑤ 같은 약사(표기 차이는 공백·대소문자뿐)는 1명으로 합치고, 항목마다 작성일이 늦은 판정이 이김 · 소속 표기가 다르면 다른 약사', S8['intake']['raters'] == 2 and S8['intake']['accepted_submissions'] == 3 and (L8[0]['ok'], L8[0]['diff']) == (1, 1) and (L8[1]['ok'], L8[2]['ok']) == (1, 1), [(i['ok'], i['diff']) for i in L8[:3]])
# 같은 날 두 번: 파일 시각(시트 타임스탬프)이 늦은 것이 이김 — 행 순서를 거꾸로 두어도
ob = sub('가짜병', '가짜약국병', 'law', {1: 'diff', 2: 'ok'}, created='2026-11-05'); ol = sub('가짜병', '가짜약국병', 'law', {1: 'ok', 2: 'ok'}, created='2026-11-05')
tcsv = write_csv('ts_order.csv', header, [['2026. 11. 5 오후 3:10:00', json.dumps(ol, ensure_ascii=False), '동의합니다', '연구 이용에 동의합니다', 'Y'], ['2026. 11. 5 오전 9:30:00', json.dumps(ob, ensure_ascii=False), '동의합니다', '연구 이용에 동의합니다', 'Y']])
code, so, se = run([tcsv, '--out', os.path.join(tmp, 'out9'), '--today', '2026-11-07'])
L9 = jl(os.path.join(tmp, 'out9', 'summary.json'))['scopes']['law']['items']
ok('⑤ 같은 날 두 번 낸 확인서: 시트 타임스탬프(오후 3:10)가 늦은 쪽(맞다)이 행 순서와 상관없이 이김', (L9[0]['ok'], L9[0]['diff']) == (1, 0), (L9[0]['ok'], L9[0]['diff']))
# 형식이 이상한 파일
D4 = write_json_dir('bad', [('a.json', sub('가짜하나', '가짜약국1', 'law', {1: 'ok'})), ('b.json', 'not json'), ('c.json', '[]'), ('d.json', 'null'), ('e.json', '123'), ('f.json', '"문자열"'), ('g.json', '{}'), ('h.txt', '')])
code, so, se = run([D4, '--out', os.path.join(tmp, 'out10'), '--no-gates', '--today', '2026-11-07'])
S10 = jl(os.path.join(tmp, 'out10', 'summary.json'))
ok('⑤ 깨진·엉뚱한 파일(글자 아님·[]·null·숫자·문자열·{}·빈 파일)이 섞여도 멈추지 않고 오류 이유별로 셈(분석 1건 · 형식 오류 7건)', code == 0 and S10['intake']['accepted_submissions'] == 1 and sum(S10['intake']['rejected'].values()) == 7 and S10['intake']['received'] == 8, S10['intake'])
# 폴더+파일 섞어 주기
code, so, se = run([D, os.path.join(D1, 'one.json'), '--out', os.path.join(tmp, 'out11'), '--no-gates', '--today', '2026-11-07'])
ok('⑤ 폴더와 파일을 함께 줘도 읽음(약사 4명)', code == 0 and jl(os.path.join(tmp, 'out11', 'summary.json'))['intake']['raters'] == 4)
# 사전(자료)이 바뀌면 그 항목의 판정은 세지 않음
core = json.load(open(os.path.join(DATA, 'medterm.json'), encoding='utf-8')); law = json.load(open(os.path.join(DATA, 'medterm_law.json'), encoding='utf-8'))
law['e'][5]['pl'] += ' (수정)'
d1 = os.path.join(tmp, 'data_chg'); os.makedirs(d1)
json.dump(core, open(os.path.join(d1, 'medterm.json'), 'w', encoding='utf-8'), ensure_ascii=False); json.dump(law, open(os.path.join(d1, 'medterm_law.json'), 'w', encoding='utf-8'), ensure_ascii=False)
IT1 = RL.build_items(d1)
chg = [a['id'] for a, b in zip(IT['items']['law'], IT1['items']['law']) if a['h'] != b['h']]
code, so, se = run([resp, '--out', os.path.join(tmp, 'out12'), '--today', '2026-11-07', '--data-dir', d1])
S12 = jl(os.path.join(tmp, 'out12', 'summary.json'))
n_chg = sum(1 for r in exp['final']['law'].values() if chg and chg[0] in r)
j = next(k for k, i in enumerate(IT['items']['law']) if chg and i['id'] == chg[0])
ok('⑤ 자료의 풀이 한 곳이 바뀌면 그 항목의 지난 판정만 세지 않음(세지 않은 판정 5 + 7 = 12개 · 그 항목은 판정 부족)', len(chg) == 1 and code == 0 and S12['intake']['stale_answers'] == 5 + n_chg == 12 and S12['scopes']['law']['items'][j]['n'] == 0 and S12['scopes']['law']['items'][j]['status'] == 'na', (chg, S12['intake']))

# ── ⑥ 종료 코드와 입력 오류 ──
code, so, se = run([os.path.join(tmp, 'nope.csv'), '--out', os.path.join(tmp, 'o_x')])
ok('⑥ 없는 입력 파일: 종료 코드 1', code == 1)
code, so, se = run([resp, '--out', out1, '--link-table', os.path.join(out1, 'link.csv')])
ok('⑥ --link-table 을 결과 폴더 안에 두려 하면 거부(종료 코드 2)', code == 2 and not os.path.exists(os.path.join(out1, 'link.csv')))
code, so, se = run([resp, '--out', out1, '--export-memos', os.path.join(out1, 'sub', 'm.csv')])
ok('⑥ --export-memos 도 결과 폴더 안(하위 폴더 포함)이면 거부', code == 2)
code, so, se = run(['--demo', '--out', out1, '--save-demo-input', os.path.join(out1, 'd.csv')])
ok('⑥ --save-demo-input 도 결과 폴더 안이면 거부', code == 2)
code, so, se = run([resp, '--out', os.path.join(tmp, 'o_y'), '--today', '2026-13-45'])
ok('⑥ 날짜 형식이 틀리면 거부(종료 코드 2)', code == 2)
code, so, se = run(['--out', os.path.join(tmp, 'o_z')])
ok('⑥ 입력을 안 주면 거부(종료 코드 2)', code == 2)
code, so, se = run([resp])
ok('⑥ --out 없이는 거부(종료 코드 2)', code == 2)
only_bad = write_csv('only_bad.csv', header, [r for r in rows if not r[1].lstrip().startswith('{') or 'medterm-kr-review/2' in r[1] or '가짜약사99' in r[1]])
code, so, se = run([only_bad, '--out', os.path.join(tmp, 'out13'), '--today', '2026-11-07'])
S13 = jl(os.path.join(tmp, 'out13', 'summary.json'))
ok('⑥ 분석할 약사가 한 명도 없으면 종료 코드 2 · 그래도 접수 현황은 담은 결과를 만듦', code == 2 and S13['intake']['raters'] == 0 and S13['intake']['received'] == 4 and os.path.exists(os.path.join(tmp, 'out13', 'email.txt')), (code, S13['intake']))
# 개인정보 문자열이 결과에 섞이면 종료 코드 3 · 결과를 쓰지 않음
orig = RR.email_text
RR.email_text = lambda S: orig(S) + '\n가짜약사01\n'
code, so, se = run([resp, '--out', os.path.join(tmp, 'out_leak'), '--today', '2026-11-07'])
RR.email_text = orig
ok('⑥ 결과에 약사 이름이 섞이면 종료 코드 3 · 결과 폴더를 아예 만들지 않음 · 오류 문구', code == 3 and not os.path.exists(os.path.join(tmp, 'out_leak')) and '섞여 있습니다' in se, (code, se[:160]))
ok('⑥ 점검 함수가 소속·메모·기타 자료 글도 잡음(이름만 보지 않음)', RR.leak_check_text('x 가짜약국A y', {'가짜약국A'}, {}) == 1 and RR.leak_check_text('가짜참고서적 제3판', {'가짜참고서적 제3판'}, {}) == 1 and RR.leak_check_text('아무 글', {'가짜약국A'}, {}) == 0)

# ── ⑦ 메일 본문 ──
eh, et = rd(os.path.join(out1, 'email.html')), rd(os.path.join(out1, 'email.txt'))
ok('⑦ 메일 HTML: 그림·링크·스크립트·외부 글꼴 없음(img·src·href·script·url(·@import·http 없음)', not re.search(r'<img|src=|href=|<script|url\(|@import|https?:', eh, re.I))
ok('⑦ 메일 HTML 크기가 지메일이 잘라내는 한도(약 102KB)보다 훨씬 작음', len(eh.encode('utf-8')) < 60_000, len(eh.encode('utf-8')))
out_demo = os.path.join(tmp, 'out_demo')
code, so, se = run(['--demo', '--out', out_demo, '--today', '2026-11-07'])
Sd = jl(os.path.join(out_demo, 'summary.json'))
ok('⑦ --demo 로 돌리면 제목·메일 HTML 맨 위·메일 글·보고서에 “가짜 데이터” 표시, 보통 입력으로 돌리면 시험용 표시가 없음',
   code == 0 and Sd['meta']['demo'] and Sd['meta']['email_subject'].startswith('[시험용·가짜 데이터]') and '가짜 데이터입니다' in rd(os.path.join(out_demo, 'email.html')) and rd(os.path.join(out_demo, 'email.txt')).startswith('※ 시험용 · 가짜 데이터입니다')
   and '가짜 데이터입니다' in rd(os.path.join(out_demo, 'report.html')) and not sm['meta']['demo'] and '시험용' not in sm['meta']['email_subject'] and '가짜 데이터입니다' not in eh and not et.startswith('※'), (code, Sd['meta']['email_subject']))
ok('⑦ 제목: 보통은 “[MedTerm-KR 약사검수 요약] 날짜 · 연구용 약사 N명”', sm['meta']['email_subject'] == '[MedTerm-KR 약사검수 요약] 2026-11-07 · 연구용 약사 8명', sm['meta']['email_subject'])
ok('⑦ 메일 글에 집계(판정 수·S-CVI·일치율·AC1·α)와 ‘다르다’ 많은 항목, 담지 않는 것의 안내', all(k in et for k in ('S-CVI/Ave', 'AC1', 'α', '다르다')) and '이름·소속·메모·원본 글을 담지 않습니다' in et)
ok('⑦ 메일 글에서 ‘다르다’ 항목은 최대 8개씩 · 많은 순', et.count('  - ') <= 16 and 'I-CVI 0.78 이상' in et)

# ── ⑧ 결정성 · 소스 ──
out1b = os.path.join(tmp, 'out1b')
code, so, se = run([resp, '--out', out1b, '--today', '2026-11-07'])
same = all(open(os.path.join(out1, f), 'rb').read() == open(os.path.join(out1b, f), 'rb').read() for f in ('summary.json', 'email.html', 'email.txt', 'report.html'))
ok('⑧ 같은 입력이면 요약·보고서·메일 본문이 바이트까지 같음(그림 포함 보고서도)', code == 0 and same)
src = rd(os.path.join(root, 'tools', 'review_research_report.py'))
bad = [p for p in (r'import\s+(requests|urllib|http|socket|subprocess|ftplib|smtplib|telnetlib)', r'from\s+(urllib|http|socket|subprocess)\b', r'os\.system', r'\beval\(', r'\bexec\(', r'__import__', r'webbrowser') if re.search(p, src)]
ok('⑧ 도구 소스에 네트워크·실행 호출이 없음(requests·urllib·http·socket·subprocess·os.system·eval·exec·__import__ 없음)', not bad, bad)
ok('⑧ 도구는 병합 도구와 같은 검증(review_lib.validate_submission)을 씀', 'RL.validate_submission' in src and 'import review_lib as RL' in src)
png = open(os.path.join(out1, 'heatmap_names.png'), 'rb').read(8)
ok('⑧ 그림 파일이 PNG 형식', png == b'\x89PNG\r\n\x1a\n')
ok('⑧ 보고서(report.html)에 한 줄 요약표 · 표로 보기(그림의 숫자) · 읽는 법과 한계 · 스크립트 없음', all(k in rd(os.path.join(out1, 'report.html')) for k in ('접수 현황', '전체 항목 표(그림의 숫자)', '읽는 법과 한계', '카파 역설', '표로 보기')) and '<script' not in rd(os.path.join(out1, 'report.html')))

# ── ⑨ 응답 줄별 점검표 · 거친 입력 · 메일 HTML 모양 ──
import collections
from html.parser import HTMLParser
chk = os.path.join(priv, 'checks.csv')
code, so, se = run([resp, '--out', os.path.join(tmp, 'out9'), '--today', '2026-11-07', '--export-checks', chk])
ck = csv_rows(chk)
labs = collections.Counter(r['결과'] for r in ck)
secrets9 = set()
for r in csv.DictReader(open(resp, encoding='utf-8-sig', newline='')):
    try: RR._harvest(json.loads(r['앱에서 ‘복사하기’를 누른 확인서 글을 여기에 붙여 넣어 주세요']), secrets9)
    except ValueError: pass
text9 = rd(chk, 'utf-8-sig')
ok('⑨ --export-checks: 응답 한 줄마다 한 줄(24줄) · 정상 16 · 확인 대기 2 · 분석 제외 2 · 형식 오류 4 · 이유와 약사 번호가 적힘', code == 0 and len(ck) == 24 and labs == {'정상 반영': 16, '확인 대기': 2, '분석 제외': 2, '형식 오류': 4}
   and all(r['이유'] for r in ck if r['결과'] != '정상 반영') and all(r['rid'] for r in ck if r['status'] == 'ok') and not any(r['rid'] for r in ck if r['status'] != 'ok'), (code, dict(labs)))
ok('⑨ --export-checks 에는 이름·소속·메모·기타 자료가 없음(약사는 R번호로만)', not [s for s in secrets9 if len(s) >= 3 and s in text9] and len(secrets9) > 50, len(secrets9))
rough = [['2026. 11. 1 오전 9:00:00', json.dumps(sub('거친입력갑', '가짜약국', 'names', {1: 'ok', 2: 'ok'}), ensure_ascii=False), '동의합니다', '연구 이용에 동의합니다', 'Y'],
         ['2026. 11. 1 오전 9:01:00', '{"schema": NaN}', '동의합니다', '연구 이용에 동의합니다', 'Y'], ['2026. 11. 1 오전 9:02:00', '{"a": Infinity}', '동의합니다', '연구 이용에 동의합니다', 'Y'],
         ['2026. 11. 1 오전 9:03:00', '[' * 100000 + ']' * 100000, '동의합니다', '연구 이용에 동의합니다', 'Y'], ['2026. 11. 1 오전 9:04:00', '가' * 400000, '동의합니다', '연구 이용에 동의합니다', 'Y'],
         ['=2026-11-01', json.dumps(sub('거친입력을', '가짜약국', 'names', {1: 'diff'}), ensure_ascii=False), '동의합니다', '연구 이용에 동의합니다', 'Y']]
rp = write_csv('rough.csv', header, rough)
chk2 = os.path.join(priv, 'checks2.csv')
code, so, se = run([rp, '--out', os.path.join(tmp, 'out9b'), '--today', '2026-11-07', '--export-checks', chk2])
S9 = jl(os.path.join(tmp, 'out9b', 'summary.json')) if code in (0, 2) else {}
ok('⑨ NaN·Infinity(표준 JSON 아님) · 20만 자로 겹친 글 · 40만 자(120만 바이트) 칸 · =로 시작하는 시각도 도구가 멈추지 않고 형식 오류로 셈', code == 0 and S9.get('intake', {}).get('rejected') == {'json': 3, 'too_large': 1} and S9['intake']['accepted_submissions'] == 2 and S9['intake']['received'] == 6, (code, se[-200:], S9.get('intake')))
ok('⑨ 점검표의 시각 칸도 수식 방지(=로 시작하면 앞에 작은따옴표)', csv_rows(chk2)[5]['시각'].startswith("'="), csv_rows(chk2)[5]['시각'])
class Html(HTMLParser):
    VOID = {'br', 'img', 'hr', 'meta', 'link', 'input'}
    def __init__(s): super().__init__(convert_charrefs=True); s.stack, s.bad = [], []
    def handle_starttag(s, tag, attrs):
        for k, v in attrs:
            if not re.fullmatch(r'[a-z][a-z0-9-]*', k) or (v is not None and '"' in v): s.bad.append((tag, k))
        if tag not in s.VOID: s.stack.append(tag)
    def handle_endtag(s, tag):
        if not s.stack or s.stack[-1] != tag: s.bad.append(('닫힘', tag))
        else: s.stack.pop()
hp = Html(); hp.feed(rd(os.path.join(out1, 'email.html'))); hp.close()
ok('⑨ 메일 HTML(email.html)의 속성(style 안 글꼴 이름 따옴표 포함)과 태그 닫힘이 올바름', not hp.bad and not hp.stack, (hp.bad[:3], hp.stack[:3]))

shutil.rmtree(tmp, ignore_errors=True)
bad = [c for c in checks if c[0] == 'FAIL']
for c in checks: print(*c[:2], ('— ' + c[2]) if c[0] == 'FAIL' and c[2] else '')
print(f"\n{len(checks) - len(bad)}/{len(checks)} 통과" + ('' if not bad else f' · 실패 {len(bad)}건'))
sys.exit(1 if bad else 0)
