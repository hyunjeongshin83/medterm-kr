"""약사 판정 시트·일치도 계산기·이름 대조 도구·규칙표 도구 점검 — python3 -I tests/test_review_tools.py
 네트워크 불필요. 저장소의 자료·문서와 임시 폴더의 가짜 파일만 쓴다(가짜 판정값은 도구 점검용이며 실제 판정이 아니다).
 ① 규칙표 문서가 코드와 같은지  ② 판정 시트: 결정적·표본 구성·가림(등급 열 없음)·저장된 시트와 같은지  ③ κ·Wilson 계산, 판정 값 읽기, 두 파일 합치기, 인코딩(CP949), 이상 입력
 ④ 식약처↔심평원 이름 대조: 단계 분류·코드 관계·JSON/CSV 읽기  ⑤ 도구 소스에 네트워크·서비스키·실행 호출이 없는지  ⑥ 자료의 hira_codes 불변식  ⑦ 저장소에 비밀값이 없는지
 ⑧ 약사 확인용 대조 시트 2종(핵심 성분·상품명 60행, 약사법 쉬운 풀이 53행): 저장본과 같음·행 구성·판정 칸이 비어 있음·--check"""
import csv, io, json, os, re, sys, tempfile
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
sys.path.insert(0, os.path.join(root, 'tools')); sys.path.insert(0, os.path.join(root, 'build'))
import review_sheet as RS, review_agreement as RA, compare_mfds_names as CM, norm_rules_table as NR, make_check_sheets as MCS

checks = []
def ok(name, cond, extra=''): checks.append(('PASS' if cond else 'FAIL', name, str(extra)[:160]))
def close(a, b, tol=1e-9): return a is not None and abs(a - b) <= tol
def raises(fn, *a):
    try: fn(*a)
    except SystemExit as e: return str(e.code)
    return None

EXT = os.path.join(root, 'data', 'medterm_ext.json')
ext = json.load(open(EXT, encoding='utf-8')); E = ext['entities']; BY = {e['id']: e for e in E}

# ── ① 규칙표 문서 ──
saved = open(os.path.join(root, 'docs', '염_정규화_규칙표.md'), encoding='utf-8', newline='').read()
ok('규칙표: 저장된 문서가 코드(build/ext_norm.py)·자료(map.rule)로 만든 것과 같음', NR.build_doc(EXT) == saved, 'python -I tools/norm_rules_table.py 로 다시 만드세요')
ok('규칙표: 규칙 단계 5개·낱말 표·규칙별 건수·한계가 모두 들어 있음', all(s in saved for s in ('## 2. 후보를 만드는 순서', '## 3. 규칙에 쓰는 낱말 표', '## 4. 규칙별 실제 사용 건수', '## 5. 알려진 한계')) and all(f'`{r}`' in saved for r in ('exact', 'moiety', 'clean', 'desalt', 'decat')))

# ── ② 판정 시트 ──
top = RS.pick(E, 'top', 100); top2 = RS.pick(E, 'top', 100)
ok('시트(top): 100개·단일성분 품목 수 내림차순·모두 품목 수 > 0·같은 입력이면 같은 결과', len(top) == 100 and [e['id'] for e in top] == [e['id'] for e in top2]
   and all(top[i]['kr']['items'] >= top[i + 1]['kr']['items'] for i in range(99)) and all(e['kr']['items'] > 0 for e in top))
bs = RS.pick(E, 'b-strat', 100, 1); bs2 = RS.pick(E, 'b-strat', 100, 1); bs3 = RS.pick(E, 'b-strat', 100, 2)
ok('시트(b-strat): 100개·모두 등급 b·정확 일치 50 + 규칙 연결 50·고유·같은 시드면 같은 결과·다른 시드면 다름', len(bs) == 100 and len({e['id'] for e in bs}) == 100 and all(e['grade'] == 'b' for e in bs)
   and sum(RS.is_exact(e) for e in bs) == 50 and [e['id'] for e in bs] == [e['id'] for e in bs2] and [e['id'] for e in bs] != [e['id'] for e in bs3])
shared = RS.shared_map(E)
ok('앞 4자리 공유 목록: 모든 묶음이 서로 다른 항목 둘 이상이고 항목이 실제로 그 앞자리를 가짐', len(shared) > 0 and all(len(set(ids)) == len(ids) >= 2 and all(any(c[:4] == p for c in BY[i]['hira_codes']) for i in ids) for p, ids in shared.items()), len(shared))
ex = {c[:4] for c in BY['MT:VTM:6915']['hira_codes']} & {c[:4] for c in BY['MT:VTM:6918']['hira_codes']}
ok('근거 예: metoclopramide(6915)와 metoprolol(6918)이 같은 6자리 번호 193801 을 씀 → 코드 번호는 성분 식별자가 아님', '1938' in ex and '193801ATR' in BY['MT:VTM:6915']['hira_codes'] and '193801BIJ' in BY['MT:VTM:6918']['hira_codes'], ex)
with tempfile.TemporaryDirectory() as td:
    out1 = os.path.join(td, 'top.csv'); out2 = os.path.join(td, 'b.csv'); tsv = os.path.join(td, 'shared.tsv')
    RS.write_sheet(out1, [RS.row(i, e, shared) for i, e in enumerate(top, 1)]); RS.write_sheet(out2, [RS.row(i, e, shared) for i, e in enumerate(bs, 1)]); RS.write_shared(tsv, E, shared)
    same = lambda a, b: open(a, 'rb').read() == open(b, 'rb').read()
    ok('시트: 저장소의 상용상위100 시트가 지금 자료로 다시 만든 것과 바이트까지 같음', same(out1, os.path.join(root, 'data', 'review', '상용상위100_판정시트.csv')))
    ok('시트: 저장소의 등급b 층화 시트가 지금 자료로 다시 만든 것과 바이트까지 같음', same(out2, os.path.join(root, 'data', 'review', '등급b_층화100_판정시트.csv')))
    ok('앞 4자리 목록 TSV 가 지금 자료로 다시 만든 것과 같음', same(tsv, os.path.join(root, 'data', 'medterm_ext_review_shared_cd.tsv')))
    raw = open(out1, 'rb').read(); rows = list(csv.reader(io.StringIO(raw.decode('utf-8-sig'), newline='')))
    head = rows[0]
    ok('시트: UTF-8 BOM·열 14개·판정A/B/메모 열이 비어 있음(정답을 적지 않음)', raw[:3] == b'\xef\xbb\xbf' and len(head) == 14 and all(len(r) == 14 for r in rows)
       and all(not r[head.index(c)] for r in rows[1:] for c in ('판정A', '판정B', '메모')))
    ok('시트: 약사에게 가는 시트에 연결 등급·규칙·ATC 일치 열이 없음(가림)', not any(k in h for h in head for k in ('등급', '규칙', 'ATC 일치')) and 'RxCUI' in head, head)
    ok('시트: 성분ID 가 모두 자료에 있고 RxCUI 칸은 MT:VTM 만 채워짐', all(r[1] in BY and bool(r[2]) == r[1].startswith('MT:VTM:') for r in rows[1:]))
g, r_ = RS.summary(top)
guide = open(os.path.join(root, 'docs', '약사검수_판정시트_안내.md'), encoding='utf-8').read()
ok('안내 문서의 등급 분포(a·b·d)가 지금 상용 상위 100 의 실제 분포와 같음', f'a {g["a"]} · b {g["b"]} · d {g["d"]}' in guide and sum(g.values()) == 100, dict(g))
ok('안내 문서가 시트 3종·O/X/? 기준·실행 명령을 설명함', all(s in guide for s in ('상용상위100_판정시트.csv', '등급b_층화100_판정시트.csv', 'medterm_ext_review_shared_cd.tsv', 'review_agreement.py', 'review_sheet.py', 'CSV UTF-8')))

# ── ③ 통계·판정 읽기 ──
k = RA.kappa(20, 5, 10, 15)
ok('κ: 교과서 예(20·5·10·15) → 일치율 0.7 · 우연일치 0.5 · κ 0.4 · PABAK 0.4', close(k['po'], 0.7) and close(k['pe'], 0.5) and close(k['kappa'], 0.4) and close(k['pabak'], 0.4) and k['n'] == 50, k)
ok('κ: 근사 95% 구간 = κ ± 1.96·√(po(1-po)/(n(1-pe)²)) ≈ 0.146 ~ 0.654', close(k['kappa_ci'][0], 0.4 - 1.96 * (0.21 / 12.5) ** 0.5, 1e-9) and close(k['kappa_ci'][1], 0.4 + 1.96 * (0.21 / 12.5) ** 0.5, 1e-9), k['kappa_ci'])
ok('κ: 완전 일치 → 1 · 완전 반대 → -1 · 모두 O 로 같으면 정의 안 됨(None)이고 일치율 1 · 쌍이 없으면 None', close(RA.kappa(5, 0, 0, 5)['kappa'], 1.0) and close(RA.kappa(0, 5, 5, 0)['kappa'], -1.0)
   and RA.kappa(9, 0, 0, 0)['kappa'] is None and close(RA.kappa(9, 0, 0, 0)['po'], 1.0) and RA.kappa(0, 0, 0, 0) is None)
w = RA.wilson(8, 10)
ok('Wilson 95%: 8/10 → 0.490 ~ 0.943 · 0/0 → None · 10/10 의 상한은 1', abs(w[0] - 0.4901) < 5e-4 and abs(w[1] - 0.9433) < 5e-4 and RA.wilson(0, 0) is None and close(RA.wilson(10, 10)[1], 1.0), w)
ok('판정 읽기: O·o·○·맞음·예 → O / X·x·×·틀림 → X / ?·모름 → ? / 빈 칸·공백 → None / 그 밖 → bad', [RA.norm(v) for v in ('O', ' o ', '○', '맞음', '예')] == ['O'] * 5 and [RA.norm(v) for v in ('X', 'x', '×', '틀림')] == ['X'] * 4
   and [RA.norm(v) for v in ('?', '모름', '？')] == ['?'] * 3 and RA.norm('') is None and RA.norm('  ') is None and RA.norm(None) is None and RA.norm('maybe') == 'bad')

# ── ③-2 가짜 시트로 전체 분석 ──
FAKE = {'meta': {'version': 'T'}, 'entities': [
    {'id': 'MT:VTM:1', 'grade': 'a', 'map': {'rule': 'exact/IN', 'atc': '7'}}, {'id': 'MT:VTM:2', 'grade': 'a', 'map': {'rule': 'moiety/IN', 'atc': '7'}},
    {'id': 'MT:VTM:3', 'grade': 'b', 'map': {'rule': 'exact/IN', 'atc': '-'}}, {'id': 'MT:VTM:4', 'grade': 'b', 'map': {'rule': 'desalt/IN', 'atc': '-'}},
    {'id': 'MT:VTM:5', 'grade': 'b', 'map': {'rule': 'syn/clean/IN', 'atc': '-'}}, {'id': 'MT:KRI:six', 'grade': 'd'}, {'id': 'MT:KRI:seven', 'grade': 'd'}]}
HEAD = ['번호', '성분ID', '이름(영문)', '판정A', '판정B', '메모']
def sheet(path, col, vals, enc, memo=None):
    with open(path, 'w', encoding=enc, newline='') as f:
        w = csv.writer(f)
        w.writerow(HEAD)
        for i, (id_, v) in enumerate(vals.items(), 1):
            w.writerow([i, id_, id_.split(':')[-1], v if col == 'A' else '', v if col == 'B' else '', (memo or {}).get(id_, '')])
A_ = {'MT:VTM:1': 'O', 'MT:VTM:2': 'O', 'MT:VTM:3': 'O', 'MT:VTM:4': 'X', 'MT:VTM:5': '?', 'MT:KRI:six': 'O', 'MT:KRI:seven': 'X'}
B_ = {'MT:VTM:1': 'O', 'MT:VTM:2': 'X', 'MT:VTM:3': 'O', 'MT:VTM:4': 'X', 'MT:VTM:5': 'O', 'MT:KRI:six': 'O', 'MT:KRI:seven': ''}
with tempfile.TemporaryDirectory() as td:
    fx = os.path.join(td, 'ext.json'); json.dump(FAKE, open(fx, 'w', encoding='utf-8'))
    pa = os.path.join(td, 'A.csv'); pb = os.path.join(td, 'B.csv')
    sheet(pa, 'A', A_, 'utf-8-sig', {'MT:VTM:4': '염이 달라 다른 약'}); sheet(pb, 'B', B_, 'cp949')
    res = RA.analyze([pa, pb], fx); T = res['total']
    ok('분석(두 파일 합침·CP949 읽기): 쌍 5개 · OO 3 · OX 1 · XX 1 → 일치율 0.8 · κ 0.545', T['kappa']['n'] == 5 and close(T['kappa']['po'], 0.8) and close(T['kappa']['kappa'], (0.8 - 0.56) / 0.44, 1e-9), T['kappa'])
    ok('분석: 결과 분류 — 둘 다 O 3 · 둘 다 X 1 · 의견 갈림 1 · 판단 불가 1 · 미완 1', T['outcome'] == {'ok': 3, 'wrong': 1, 'split': 1, 'unsure': 1, 'incomplete': 1}, T['outcome'])
    ok('분석: 약사별 O 비율 4/6 · 합의 기준 범위 하한 3/5 ~ 상한 4/5', close(T['A']['o_rate'], 4 / 6) and close(T['B']['o_rate'], 4 / 6) and close(T['bounds']['low'], 0.6) and close(T['bounds']['high'], 0.8), T['bounds'])
    ok('분석: 층 분리 — a(2) · b 정확(1) · b 규칙(2: desalt, syn/clean) · d(2)', {s: v['rows'] for s, v in res['strata'].items()} == {'a': 2, 'b-exact': 1, 'b-rule': 2, 'd': 2}, {s: v['rows'] for s, v in res['strata'].items()})
    ok('분석: 규칙 묶음 — exact 2 · moiety 1 · desalt 1 · syn 1', {f: v['rows'] for f, v in res['families'].items()} == {'desalt': 1, 'exact': 2, 'moiety': 1, 'syn(Wikidata 동의어 경유)': 1}, {f: v['rows'] for f, v in res['families'].items()})
    ok('분석: 따로 볼 행 = X 가 있거나 의견이 갈린 3개(2·4·seven)', sorted(r['id'] for r in res['followup']) == ['MT:KRI:seven', 'MT:VTM:2', 'MT:VTM:4'], [r['id'] for r in res['followup']])
    ok('분석: CP949 로 읽은 파일을 알리고 메모가 따라옴', res['notes']['enc'][pb] == 'cp949' and res['notes']['enc'][pa] == 'utf-8-sig' and any('염이 달라 다른 약' in r['memo'] for r in res['followup']))
    text = RA.md(res)
    ok('보고서: 표 5절과 읽는 법이 있고 "CP949 로 읽은 파일"을 밝힘', all(s in text for s in ('## 1. 두 약사의 일치도', '## 2. 자동 연결이 맞다고 본 비율', '## 4. 따로 볼 행', '## 5. 입력 점검', '## 읽는 법', 'CP949 로 읽은 파일: B.csv')))
    # 이상 입력
    pc_ = os.path.join(td, 'C.csv'); sheet(pc_, 'A', {'MT:VTM:1': 'X', 'MT:VTM:2': 'maybe', 'MT:VTM:9': 'O'}, 'utf-8-sig')
    r2 = RA.analyze([pa, pc_], fx)
    ok('이상 입력: 두 파일의 같은 칸이 다르면 앞 파일 값을 쓰고 충돌로 알림 · 알 수 없는 값은 빈 칸으로 셈 · 자료에 없는 ID 를 알림', len(r2['notes']['conflict']) == 1 and r2['notes']['conflict'][0][:2] == ('MT:VTM:1', 'A')
       and [b[2] for b in r2['notes']['bad']] == ['maybe'] and r2['unknown_ids'] == ['MT:VTM:9'] and r2['total']['A']['O'] == 5 and 'MT:VTM:9' in RA.md(r2), r2['notes'])
    pe_ = os.path.join(td, 'E.csv'); sheet(pe_, 'A', {k_: '' for k_ in A_}, 'utf-8-sig')
    ok('빈 시트: "아직 채워진 판정이 없습니다" 로 안내하고 오류 없음', '아직 채워진 판정이 없습니다' in RA.md(RA.analyze([pe_], fx)))
    pn_ = os.path.join(td, 'N.csv'); open(pn_, 'w', encoding='utf-8').write('a,b\n1,2\n')
    ok('열이 없는 파일은 어떤 열이 없는지 알리고 멈춤', '성분ID' in (raises(RA.merge, [pn_]) or ''))
    pd_ = os.path.join(td, 'D.csv'); sheet(pd_, 'A', A_, 'utf-8-sig')
    with open(pd_, 'a', encoding='utf-8', newline='') as f: csv.writer(f).writerow([99, 'MT:VTM:1', 'dup', 'X', '', ''])
    ok('한 파일에서 성분ID 가 겹치면 첫 행만 쓰고 알림', len(RA.merge([pd_])[1]['dup']) == 1 and RA.merge([pd_])[0]['MT:VTM:1']['A'] == 'O')

# ── ④ 이름 대조 ──
HIRA_ROWS = [('250101ACH', 'omeprazole'), ('191501ATB', 'metformin HCl'), ('108201ACH', 'amoxicillin trihydrate'), ('110101ATB', 'atorvastatin'),
             ('250501ATB', 'zolpidem tartrate'), ('300101ATB', '아스피린'), ('300101ACH', '아스피린')]
MFDS_ROWS = [('250101', '오메프라졸', 'Omeprazole'), ('191501', '메트포르민', 'Metformin Hydrochloride'), ('108201', '아목시실린나트륨', 'Amoxicillin Sodium'),
             ('X6', '아토르바스타틴칼슘', 'Atorvastatin Calcium'), ('X9', '졸피뎀', 'Zolpidem'), ('X8', '가상성분', 'Foobarzole'), ('X7', '아스피린', '')]
with tempfile.TemporaryDirectory() as td:
    hp = os.path.join(td, 'hira.csv')
    with open(hp, 'w', encoding='cp949', newline='') as f:
        w = csv.writer(f); w.writerow(['일반명코드', '제형구분코드', '제형', '일반명', '분류번호', '투여', '함량', '단위'])
        for c, n in HIRA_ROWS: w.writerow([c, c[6:], '', n, '', '', '', ''])
    mp = os.path.join(td, 'mfds.csv')
    with open(mp, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f); w.writerow(['CPNT_CD', 'DRUG_CPNT_KOR_NM', 'DRUG_CPNT_ENG_NM', 'MAX_DOSE'])
        for r in MFDS_ROWS + MFDS_ROWS[:2]: w.writerow(list(r) + ['999'])
    res = CM.analyze(CM.load_mfds(mp), CM.load_hira(hp), None)
    ok('대조: 식약처 9행 → 서로 다른 성분 7개(같은 행 반복은 하나로) · 영문명 6 · 한글명 7', res['rows'] == 9 and res['ingredients'] == 7 and res['with_eng'] == 6 and res['with_kor'] == 7, (res['rows'], res['ingredients'], res['with_eng'], res['with_kor']))
    ok('대조: 단계 — 정확 1(omeprazole) · 식약처 이름 축약 1(atorvastatin calcium→atorvastatin) · 심평원 이름 축약 2(metformin HCl · zolpidem tartrate) · 본체만 1(amoxicillin sodium) · 불일치 1',
       res['tiers'] == {'exact': 1, 'rule_to_hira': 1, 'rule_from_hira': 2, 'base': 1, 'none': 1}, res['tiers'])
    ok('대조: 코드 관계 — 앞 6자리 같음 3(250101·191501·108201) · 무관 2(짧은 코드)', res['code_relation'] == {'same6': 3, 'none': 2}, res['code_relation'])
    ok('대조: 한글 — 심평원 일반명 중 한글이 든 것과 정확히 같은 성분 1(아스피린) · 심평원 한글 일반명 1개(중복 제거)', res['ko_hira_hangul'] == 1 and res['hira_hangul_names'] == 1, (res['ko_hira_hangul'], res['hira_hangul_names']))
    ok('대조: 불일치 유형 — Foobarzole 는 "그 밖"', res['unmatched_kinds'] == {'그 밖(철자·동의어·한쪽에 없는 성분)': 1} and [u['eng'] for u in res['unmatched']] == ['Foobarzole'], res['unmatched_kinds'])
    rep = CM.md(res)
    ok('대조 보고서: 4개 절과 "같은 성분이라는 약사 판정이 아닙니다" 문구', all(s in rep for s in ('## 1. 영문 이름 대응률', '## 2. 한글 이름 대응률', '## 3. 코드 관계', '## 4. 불일치 상위 유형', '약사 판정이 아닙니다')))
    # JSON(겹겹이 감싼 응답·카멜 표기) 읽기
    jp = os.path.join(td, 'mfds.json')
    json.dump({'header': {'resultCode': '00'}, 'body': {'items': {'item': [{'cpntCd': c, 'drugCpntKorNm': k_, 'drugCpntEngNm': e_, 'x': 1} for c, k_, e_ in MFDS_ROWS]}}}, open(jp, 'w', encoding='utf-8'), ensure_ascii=False)
    mj = CM.load_mfds(jp)
    ok('JSON 읽기: body.items.item 의 카멜 표기 열(cpntCd·drugCpntKorNm·drugCpntEngNm)을 찾음', mj['cols'] == {'code': 'cpntCd', 'kor': 'drugCpntKorNm', 'eng': 'drugCpntEngNm'} and len(mj['ingredients']) == 7, mj['cols'])
    bad = os.path.join(td, 'bad.csv'); open(bad, 'w', encoding='utf-8').write('A,B\n1,2\n')
    ok('열을 못 찾으면 있는 열을 알리고 멈춤(--kor-col/--eng-col 안내)', '--kor-col' in (raises(CM.load_mfds, bad) or '') and 'A, B' in (raises(CM.load_mfds, bad) or ''))
    ok('--eng-col 로 열을 직접 지정할 수 있음', CM.load_mfds(bad, None, None, 'B')['cols']['eng'] == 'B')
    nh = os.path.join(td, 'nh.csv'); open(nh, 'w', encoding='utf-8').write('x,y\n1,2\n')
    ok('심평원 파일에 일반명코드·일반명 열이 없으면 멈춤', '일반명코드' in (raises(CM.load_hira, nh) or ''))
ok('코드 관계 함수: 같음 · 앞 6자리 · 앞 4자리 · 포함 · 무관 · 코드 없음', [CM.code_relation(m, h) for m, h in (('193801ATR', ['193801ATR']), ('193801', ['193801BIJ']), ('1938', ['193801BIJ']), ('9380', ['193801BIJ']), ('ZZZZ', ['193801BIJ']), ('', ['193801BIJ']))]
   == ['same', 'same6', 'same4', 'contained', 'none', 'nocode'])

# ── ⑤ 도구 소스 점검 ──
FORBID = re.compile(r'urllib|requests|http\.client|socket|subprocess|os\.system|\beval\(|\bexec\(|serviceKey|DATA_GO_KR_KEY|https?://')
for t in ('review_sheet.py', 'review_agreement.py', 'compare_mfds_names.py', 'norm_rules_table.py', 'make_check_sheets.py'):
    src = open(os.path.join(root, 'tools', t), encoding='utf-8').read()
    hit = FORBID.findall(src)
    ok(f'{t}: 네트워크·서비스키·실행 호출·주소 문자열이 없음', not hit, hit[:3])
    ok(f'{t}: 사용법 설명(docstring)과 python -I 실행 안내가 있음', src.count('"""') >= 2 and 'python -I' in src)

# ── ⑥ 자료의 hira_codes 불변식(요약) ──
HC = [e for e in E if e.get('hira_codes')]
ok('자료: hira_codes 는 9자리 형식·정렬·중복 없음·개수가 kr.codes 와 같고, 옛 필드 hira_cd 는 없음', len(HC) == ext['meta']['counts']['with_hira_codes'] and not any('hira_cd' in e for e in E)
   and all(re.fullmatch(r'[0-9A-Z]{6}[A-Z]{3}', c) for e in HC for c in e['hira_codes']) and all(e['hira_codes'] == sorted(set(e['hira_codes'])) and len(e['hira_codes']) == e['kr']['codes'] for e in HC), len(HC))

# ── ⑦ 비밀값 없음 ──
SECRET = re.compile('|'.join(['github_pat' + '_[A-Za-z0-9_]{20,}', 'gh[pousr]' + '_[A-Za-z0-9]{30,}', 'sb_' + 'secret_', 'sb_' + 'publishable_', 'twin' + 'ky0509', r'eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\.']))
hits = []
for base in ('tools', 'docs', 'data', 'build', 'tests', 'web', 'bin', 'web-react/src', 'web-react/tests', 'android-app/app/src', 'README.md', 'web-react/README.md', 'android-app/README.md'):
    p = os.path.join(root, base)
    files = [p] if os.path.isfile(p) else [os.path.join(d, f) for d, _, fs in os.walk(p) for f in fs] if os.path.isdir(p) else []
    for f in files:
        if f.endswith(('.png', '.jpg', '.ico', '.apk', '.jar', '.webp')) or '/node_modules/' in f or os.path.getsize(f) > 12_000_000: continue
        try: txt = open(f, encoding='utf-8', errors='ignore').read()
        except OSError: continue
        m = SECRET.search(txt)
        if m: hits.append((os.path.relpath(f, root), m.group(0)[:12] + '…'))
ok('저장소 소스·문서·자료에 토큰·키·개인 이메일 흔적이 없음(GitHub·Supabase·JWT 형태)', not hits, hits[:3])

# ── ⑧ 약사 확인용 대조 시트 2종 ──
core_ = json.load(open(os.path.join(root, 'data', 'medterm.json'), encoding='utf-8-sig')); law_ = json.load(open(os.path.join(root, 'data', 'medterm_law.json'), encoding='utf-8-sig'))
sheets = MCS.build(root)
def read_sheet(raw):
    return list(csv.reader(io.StringIO(raw.decode('utf-8-sig'), newline='')))
ok('대조 시트: 저장소의 두 시트가 지금 자료로 다시 만든 것과 바이트까지 같음(어긋나면 python -I tools/make_check_sheets.py)',
   all(open(os.path.join(root, 'data', 'review', n), 'rb').read() == b for n, b in sheets.items()), list(sheets))
nm_rows = read_sheet(sheets[MCS.NAME_NAMES]); lw_rows = read_sheet(sheets[MCS.NAME_LAW])
vtm_ = [c for c in core_['concepts'] if c['type'] == 'VTM']
ok('대조 시트(성분·상품명): UTF-8 BOM · 열 11개 · 성분 한글명 행 = 핵심 성분 수, 국내 상품명 행 = 핵심 상품명 수(합 60) · 번호가 1부터 이어짐',
   sheets[MCS.NAME_NAMES][:3] == b'\xef\xbb\xbf' and all(len(r) == 11 for r in nm_rows)
   and sum(r[1] == '성분 한글명' for r in nm_rows[1:]) == len(vtm_) == 32 and sum(r[1] == '국내 상품명' for r in nm_rows[1:]) == sum(len(c.get('brands_ko', [])) for c in vtm_) == 28
   and [int(r[0]) for r in nm_rows[1:]] == list(range(1, 61)), (len(nm_rows) - 1, nm_rows[0]))
ok('대조 시트(성분·상품명): 약사가 적을 칸(확인한 표기·판정·메모·확인자·확인일)이 모두 비어 있고, 도구의 판정·등급을 싣지 않음',
   all(not r[i] for r in nm_rows[1:] for i in (6, 7, 8, 9, 10)) and not any(k in h for h in nm_rows[0] for k in ('등급', '규칙', '자동', '도구', '일치율')), nm_rows[0])
ok('대조 시트(성분·상품명): 사전의 한글명·상품명·다른 표기가 핵심 자료 그대로(영문명 ↔ 한글명 쌍이 같음)',
   {(r[2], r[3]) for r in nm_rows[1:] if r[1] == '성분 한글명'} == {(c['label_en'], c['label_ko']) for c in vtm_}
   and {(r[3], r[4]) for r in nm_rows[1:] if r[1] == '국내 상품명'} == {(c['label_ko'], b) for c in vtm_ for b in c.get('brands_ko', [])})
LE = law_['e']
ok('대조 시트(약사법): UTF-8 BOM · 열 12개 · 행 수 = 약사법 항목 수(53) · 번호가 1부터 이어짐 · 쉬운 풀이·원문 발췌가 자료 그대로',
   sheets[MCS.NAME_LAW][:3] == b'\xef\xbb\xbf' and all(len(r) == 12 for r in lw_rows) and len(lw_rows) - 1 == len(LE) == 53
   and [int(r[0]) for r in lw_rows[1:]] == list(range(1, 54)) and {(r[3], r[6]) for r in lw_rows[1:]} == {(e['t'], e['pl']) for e in LE}
   and {(r[3], r[4]) for r in lw_rows[1:]} == {(e['t'], e.get('ex', '')) for e in LE}, (len(lw_rows) - 1, lw_rows[0]))
ok('대조 시트(약사법): 조문 순서(제2조 제1호부터)로 줄을 세움 · 시행 예정·개정 예정 행 수가 자료의 건수와 같음',
   lw_rows[1][2] == '제2조 제1호' and [MCS.art_key(r[2]) for r in lw_rows[1:]] == sorted(MCS.art_key(r[2]) for r in lw_rows[1:])
   and sum(r[7] != '현행' for r in lw_rows[1:]) == law_['meta']['counts']['upcoming'], [r[2] for r in lw_rows[1:4]])
ok('대조 시트(약사법): 약사가 적을 칸(판정·수정 제안·확인자·확인일)이 모두 비어 있음',
   all(not r[i] for r in lw_rows[1:] for i in (8, 9, 10, 11)))
ok('조문 열쇠: 제2조의2 가 제2조 제3호 뒤·제3조 앞에 오고, 제23조의2 는 제23조 뒤에 옴',
   MCS.art_key('제2조 제3호') < MCS.art_key('제2조의2 제1항') < MCS.art_key('제3조') and MCS.art_key('제23조') < MCS.art_key('제23조의2') < MCS.art_key('제24조'))
with tempfile.TemporaryDirectory() as td:
    for n, b in sheets.items(): open(os.path.join(td, n), 'wb').write(b)
    ok('--check: 같으면 종료 코드 0', MCS.main(['--out-dir', td, '--check']) == 0)
    open(os.path.join(td, MCS.NAME_LAW), 'ab').write(b'x')
    ok('--check: 한 글자라도 다르면 종료 코드 1, 파일이 없어도 1', MCS.main(['--out-dir', td, '--check']) == 1 and MCS.main(['--out-dir', os.path.join(td, 'none'), '--check']) == 1)
    MCS.main(['--out-dir', td]); ok('다시 만들면 저장본과 같아짐', MCS.main(['--out-dir', td, '--check']) == 0)
ok('안내 문서가 두 대조 시트의 파일 이름과 만드는 명령을 설명함', all(s_ in guide for s_ in (MCS.NAME_NAMES, MCS.NAME_LAW, 'make_check_sheets.py')))

bad = [c for c in checks if c[0] == 'FAIL']
for c in checks: print(' | '.join(c))
print(f'\n{len(checks) - len(bad)}/{len(checks)} checks passed')
sys.exit(1 if bad else 0)
