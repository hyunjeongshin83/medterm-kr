"""임상시험 수집기(build/new_fetch.py)의 순수 함수·묶음 로직 점검 — 네트워크 없이 돈다(요청 함수를 가짜로 바꿔 끼움).
실행: python tests/test_new_fetch.py
 - 이름 → 검색 문구(components): 복합제·수식어·용량 표기·괄호 처리
 - 검색식(ct_term): 유의어 확장을 끄고(EXPANSION[None]) 낱말마다 AND, 불용어는 뺌
 - 이름 대조(matches): 중재 이름·다른 이름에 들어 있어야 세고, 제목만 있을 때는 질환 이름에 없을 때만 셈(cocaine dependence 같은 질환 이름이 약으로 세어지는 것을 막음)
 - 요약(summarize_trials): 시작일이 만든 날로부터 36개월을 넘는 등록은 '가장 늦은 시작 달'과 예시 정렬에서 뺌(건수·상태에는 센다)
 - 묶음 수집(fetch_trials_group): 묶음이 너무 크면 반으로 나눔 · 한 성분만 남으면 시작일 최근순으로 쪽 상한까지 · 1,000건 넘거나 잘리면 cap · 쪽 넘김
 - 국내 시행·결과 게시(in_korea · make_record): 요약에 쓰는 1,000건이 아니라 받은 일치 등록 전체로 센다
 - 데이터 처리일(note_ct_version): 처음 값을 지키고, 끝 값이 같을 때만 same=True (이용 약관: 데이터를 처리한 날짜를 밝힘)
 - MedlinePlus(mplus_items · parse_mplus · fetch_mplus_one · run_pool_jsonl): RxCUI 목록 순서·중복 제거, 약 정보 쪽 주소만 받고 본문(summary)은 읽지 않음, 이어받기"""
import collections, json, os, sys, threading, time, urllib.parse
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
sys.path.insert(0, os.path.join(root, 'build'))
import new_fetch as F

checks = []
def ok(name, cond, extra=''): checks.append(('PASS' if cond else 'FAIL', name, str(extra)[:160]))


# ── 이름 → 검색 문구 ──
C = F.components
ok('단일 성분: 소문자·하이픈은 낱말 경계', C('Muromonab-CD3') == ['muromonab cd3'], C('Muromonab-CD3'))
ok('복합제(쉼표·and): 구성 성분마다 따로', C('nirmatrelvir, ritonavir') == ['nirmatrelvir', 'ritonavir'] and C('vanzacaftor, tezacaftor, and deutivacaftor') == ['vanzacaftor', 'tezacaftor', 'deutivacaftor'], C('vanzacaftor, tezacaftor, and deutivacaftor'))
ok('복합제(슬래시)', C('sodium phenylbutyrate/taurursodiol') == ['sodium phenylbutyrate', 'taurursodiol'], C('sodium phenylbutyrate/taurursodiol'))
ok('뒤가 수식어이면 앞부분만(insulin, regular, human → insulin)', C('insulin, regular, human') == ['insulin'] and C('sodium phosphate, monobasic') == ['sodium phosphate'], (C('insulin, regular, human'), C('sodium phosphate, monobasic')))
ok('용량 표기·괄호 뒤는 뗌', C('risedronate 2.5') == ['risedronate'] and C('decitabine 50mg') == ['decitabine'] and C('duloxetine (as duloxetine') == ['duloxetine'], (C('risedronate 2.5'), C('decitabine 50mg')))
ok('끝에 매달린 and 는 복합제로 보지 않음', C('caffeine and') == ['caffeine'], C('caffeine and'))
ok('숫자·문자 섞인 이름은 그대로(vitamin b12)', C('vitamin b12') == ['vitamin b12'], C('vitamin b12'))
ok('빈 이름은 문구 없음', C('(s)-isomer') == [] or F.ct_term(C('(s)-isomer')) == '', C('(s)-isomer'))

# ── 검색식 ──
T = F.ct_term
ok('낱말 하나: 확장 끔', T(['tirzepatide']) == 'EXPANSION[None]tirzepatide', T(['tirzepatide']))
ok('여러 낱말: 낱말마다 확장 끔 + AND(따옴표 문구는 쓰지 않음)', T(['calcium carbonate']) == '(EXPANSION[None]calcium AND EXPANSION[None]carbonate)' and '"' not in T(['calcium carbonate']), T(['calcium carbonate']))
ok('복합제: 모든 낱말을 AND 로', T(['nirmatrelvir', 'ritonavir']) == '(EXPANSION[None]nirmatrelvir AND EXPANSION[None]ritonavir)', T(['nirmatrelvir', 'ritonavir']))
ok('불용어·한 글자는 검색식에서 뺌(대조에서는 문구 전체를 봄)', T(['alpha 1 proteinase inhibitor']) == '(EXPANSION[None]alpha AND EXPANSION[None]proteinase AND EXPANSION[None]inhibitor)' and T(['a of the']) == '', T(['alpha 1 proteinase inhibitor']))
ok('검색식에 확장을 켠 낱말이 하나도 없음', all('EXPANSION[None]' in part for part in T(['alpha beta gamma']).strip('()').split(' AND ')), T(['alpha beta gamma']))


# ── 이름 대조 ──
def study(nct, ivs=(), title='', conds=(), start='2025-01', status='RECRUITING', phases=('PHASE2',), sponsor='Acme', cls='INDUSTRY', pc='2027-01'):
    return {'protocolSection': {'identificationModule': {'nctId': nct, 'briefTitle': title},
            'statusModule': {'overallStatus': status, 'startDateStruct': {'date': start}, 'primaryCompletionDateStruct': {'date': pc}},
            'designModule': {'phases': list(phases)}, 'sponsorCollaboratorsModule': {'leadSponsor': {'name': sponsor, 'class': cls}},
            'conditionsModule': {'conditions': list(conds)},
            'armsInterventionsModule': {'interventions': [{'name': n, 'otherNames': list(o)} for n, o in ivs]}}}

def hit(s, comps): return F.matches(F._texts(s), comps)

s1 = study('NCT1', ivs=[('Drug: Tirzepatide 5 mg', ['LY3298176'])])
s2 = study('NCT2', ivs=[('Study Drug', [])], title='Tirzepatide Impact Assessment', conds=['Obesity'])
s3 = study('NCT3', ivs=[('Topiramate', [])], title='Topiramate for Alcohol and Cocaine Dependence', conds=['Cocaine Dependence'])
s4 = study('NCT4', ivs=[('Tebipenem Pivoxil Hydrobromide (TBPM-PI-HBr)', ['SPR994'])])
s5 = study('NCT5', ivs=[('SPR994', [])], title='Oral carbapenem study')
ok('중재 이름에 들어 있으면 셈(용량·접두어가 붙어도 낱말 단위)', hit(s1, ['tirzepatide']))
ok('다른 이름(otherNames)에 들어 있어도 셈', hit(study('N', ivs=[('LY3298176', ['Tirzepatide'])]), ['tirzepatide']))
ok('제목에만 있고 질환에는 없으면 셈', hit(s2, ['tirzepatide']))
ok('제목에만 있는데 질환 이름에도 있으면 세지 않음(cocaine dependence)', not hit(s3, ['cocaine']) and hit(s3, ['topiramate']))
ok('두 낱말 이름은 낱말이 붙어 있어야 셈(tebipenem pivoxil)', hit(s4, ['tebipenem pivoxil']) and not hit(study('N', ivs=[('Tebipenem', []), ('Pivoxil resin', [])]), ['tebipenem pivoxil']))
ok('코드명으로만 등록된 시험은 세지 않음', not hit(s5, ['tebipenem pivoxil']) and not hit(s5, ['tebipenem']))
ok('낱말 일부는 세지 않음(tirzepatid 가 tirzepatide 에, iron 이 environment 에)', not hit(s1, ['tirzepatid']) and not hit(study('N', ivs=[('Environment', [])]), ['iron']))
ok('복합제는 모든 성분이 있어야 셈', hit(study('N', ivs=[('Nirmatrelvir/ritonavir', [])]), ['nirmatrelvir', 'ritonavir']) and not hit(study('N', ivs=[('Ritonavir', [])]), ['nirmatrelvir', 'ritonavir']))
ok('중재 목록이 없으면(None) 오류 없이 제목만 봄', hit({'protocolSection': {'identificationModule': {'briefTitle': 'Metformin trial'}}}, ['metformin']))


# ── 요약: 시작일 입력 오류 거르기 ──
today = '2026-11'
far = study('NCTF', ivs=[('Ivermectin', [])], start='2030-12', status='NOT_YET_RECRUITING', phases=('PHASE3',))
near = study('NCTN', ivs=[('Ivermectin', [])], start='2027-02', status='NOT_YET_RECRUITING', phases=('PHASE3',))
old = study('NCTO', ivs=[('Ivermectin', [])], start='2019-05', status='COMPLETED', phases=('PHASE4',))
r = F.summarize_trials('ivermectin', 3, [far, near, old], today)
ok('36개월을 넘는 시작은 가장 늦은 시작 달에서 뺌', r['last_start'] == '2027-02', r['last_start'])
ok('그래도 건수·단계·상태에는 센다', r['n'] == 3 and r['ph'].get('3') == 2 and r['st'].get('nyr') == 2 and r['st'].get('done') == 1, (r['n'], r['ph'], r['st']))
ok('예시는 입력 오류 같은 먼 시작을 맨 앞에 두지 않음', r['ex'][0]['id'] == 'NCTN' and r['ex'][-1]['id'] == 'NCTF', [e['id'] for e in r['ex']])
ok('add_months: 연도 넘김', F.add_months('2026-11', 36) == '2029-11' and F.add_months('2026-12', 1) == '2027-01' and F.add_months('2026-01', -1) == '2025-12')

# ── 묶음 수집(요청 함수를 가짜로) ──
class Fake:
    """name → 그 이름이 중재에 든 등록 수만큼 가짜 등록을 만든다. 쪽당 pageSize 건, nextPageToken 으로 넘김. 모든 요청을 기록한다."""
    def __init__(self, counts, extra_desc=0):
        self.counts = counts; self.calls = []; self.extra_desc = extra_desc
    def universe(self, expr):
        import re
        names = [n for n in self.counts if re.search(r'EXPANSION\[None\]' + n.split()[0] + r'\b', expr)]
        out = []
        for n in names:
            out += [study(f'{n}-{i}', ivs=[(n.title(), [])], start='%04d-%02d' % (2000 + i % 27, 1 + i % 12)) for i in range(self.counts[n])]
            out += [study(f'{n}-d{i}', ivs=[('Other', [])], start='2024-01') for i in range(self.extra_desc)]   # 설명에만 이름이 있어 검색엔진은 돌려주지만 대조에서는 빠지는 등록
        return out
    def __call__(self, url, **kw):
        import urllib.parse
        q = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(url).query)); self.calls.append(q)
        U = self.universe(q['query.intr'])
        if q.get('sort') == 'StartDate:desc': U.sort(key=F.start_of, reverse=True)
        start = int(q.get('pageToken') or 0); ps = int(q['pageSize']); page = U[start:start + ps]
        d = {'studies': page, 'totalCount': len(U)}
        if start + ps < len(U): d['nextPageToken'] = str(start + ps)
        return json.dumps(d).encode()

real_req, real_pace = F._req, F.CT_PACE
F.CT_PACE = 0
try:
    # 가벼운 묶음: 한 번에 받고 이름별로 나눈다
    fk = Fake({'alpha': 30, 'beta': 50}); F._req = fk
    out = []; st = collections.Counter(); F.fetch_trials_group([('alpha', ['alpha']), ('beta', ['beta'])], today, out.append, st)
    got = {r['q']: r for r in out}
    ok('묶음: 이름별 건수가 맞음', got['alpha']['n'] == 30 and got['beta']['n'] == 50 and not got['alpha']['cap'], {k: v['n'] for k, v in got.items()})
    ok('묶음: 요청이 한 번(OR 검색식, 확장 끔)', len(fk.calls) == 1 and ' OR ' in fk.calls[0]['query.intr'] and fk.calls[0]['query.intr'].count('EXPANSION[None]') == 2, fk.calls[0]['query.intr'] if fk.calls else '')
    # 설명에만 있는 등록은 검색엔진이 돌려줘도 세지 않는다
    fk = Fake({'alpha': 10}, extra_desc=5); F._req = fk
    out = []; F.fetch_trials_group([('alpha', ['alpha'])], today, out.append, collections.Counter())
    ok('이름 대조: 검색엔진이 돌려준 후보 중 이름이 중재에 없는 것은 뺌', out[0]['n'] == 10, out[0]['n'])
    # 묶음이 너무 크면 반으로 나눈다
    old_max = F.CT_MAX_BATCH; F.CT_MAX_BATCH = 100
    fk = Fake({'alpha': 40, 'beta': 40, 'gamma': 40, 'delta': 40}); F._req = fk
    out = []; st = collections.Counter(); F.fetch_trials_group([(n, [n]) for n in ('alpha', 'beta', 'gamma', 'delta')], today, out.append, st)
    ok('너무 큰 묶음은 반으로 나눠 다시 물음(나눔 ≥ 1)이고 결과는 같음', st['splits'] >= 1 and {r['q']: r['n'] for r in out} == {'alpha': 40, 'beta': 40, 'gamma': 40, 'delta': 40}, (dict(st), {r['q']: r['n'] for r in out}))
    F.CT_MAX_BATCH = old_max
    # 한 성분이 아주 많으면: 시작일 최근순으로 끝까지(쪽 상한 안에서) 받고, 1,000건 넘으면 cap(건수는 받은 일치 수)·요약은 가장 최근 1,000건
    fk = Fake({'common': 2500}); F._req = fk
    out = []; st = collections.Counter(); F.fetch_trials_group([('common', ['common'])], today, out.append, st)
    r = out[0]
    ok('흔한 약: 시작일 최근순으로 받음(sort=StartDate:desc)', all(c.get('sort') == 'StartDate:desc' for c in fk.calls), [c.get('sort') for c in fk.calls])
    ok('흔한 약: 끝까지 받아 정확한 일치 수(2,500)·cap', r['n'] == 2500 and r['cap'] and len(fk.calls) == 3 and st['truncated'] == 0, (r['n'], r['cap'], len(fk.calls), dict(st)))
    ok('흔한 약: 요약은 시작이 가장 최근인 1,000건(단계 합 = 1,000, 가장 늦은 시작이 가장 최근 등록)', sum(r['ph'].values()) == 1000 and r['last_start'] == '2026-12'.replace('2026-12', max(F.start_of(x) for x in fk.universe('EXPANSION[None]common'))[:7]), (sum(r['ph'].values()), r['last_start']))
    # 정확히 1,000건 넘게 일치하는 이름이 쪽 상한 안에서 끝나면 truncated 가 아니어도 cap
    fk = Fake({'mid': 1300}); F._req = fk
    out = []; F.fetch_trials_group([('mid', ['mid'])], today, out.append, collections.Counter()); r = out[0]
    ok('1,000건 넘게 일치하면 cap(건수 1,300)이고 요약은 1,000건', r['cap'] and r['n'] == 1300 and sum(r['ph'].values()) == 1000, (r['n'], r['cap'], sum(r['ph'].values())))
    # 쪽 상한에 걸려 일치가 1,000건에 못 미치면: cap 을 켜고 건수는 받은 일치 수(하한)
    old_sp = F.CT_SINGLE_PAGES; F.CT_SINGLE_PAGES = 2
    fk = Fake({'rare': 400}, extra_desc=3000); F._req = fk
    out = []; F.fetch_trials_group([('rare', ['rare'])], today, out.append, collections.Counter()); r = out[0]
    ok('쪽 상한에서 멈추면 cap 을 켜고 건수는 받은 일치 수(하한)', r['cap'] and 0 < r['n'] <= 400 and len(fk.calls) == 2, (r['n'], r['cap'], len(fk.calls)))
    F.CT_SINGLE_PAGES = old_sp
    # 문구가 없는 이름은 요청 없이 0건 기록
    fk = Fake({}); F._req = fk
    out = []; F.fetch_trials_group([('', []), ('of', ['of'])], today, out.append, collections.Counter())
    ok('검색할 낱말이 없는 이름은 요청하지 않고 0건으로 기록', len(fk.calls) == 0 and [r['n'] for r in out] == [0, 0], (len(fk.calls), [r['n'] for r in out]))
finally:
    F._req, F.CT_PACE = real_req, real_pace

# ── run_trials: 이어받기와 가벼운 이름 → 흔한 약 순서 ──
import tempfile
with tempfile.TemporaryDirectory() as tmp:
    order = []
    real_group = F.fetch_trials_group
    def spy(items, today_, emit, stats):
        order.append([n for n, _ in items])
        for n, _ in items: emit(F.summarize_trials(n, 0, [], today_))
    F.fetch_trials_group = spy
    try:
        names = ['aaa1', 'bbb1', 'common1', 'ccc1', 'common2']
        F.run_trials(tmp, names, today, 0, {'common1': 900, 'common2': 5000, 'aaa1': 3})
        done = [json.loads(l)['q'] for l in open(os.path.join(tmp, 'trials.jsonl'), encoding='utf-8')]
        ok('가벼운 이름은 묶어서 먼저, 흔한 약(이전 건수 ≥ 400)은 한 성분씩 뒤에', order[0] == ['aaa1', 'bbb1', 'ccc1'] and order[1:] == [['common1'], ['common2']], order)
        ok('모든 이름이 한 번씩 기록됨', sorted(done) == sorted(names), done)
        order.clear(); F.run_trials(tmp, names, today, 0, {})
        ok('이어받기: 이미 받은 이름은 다시 받지 않음', order == [], order)
    finally:
        F.fetch_trials_group = real_group


# ── 국내 시행·결과 게시: in_korea · make_record ──
def with_locs(st, countries, has_results=False):
    st = json.loads(json.dumps(st))
    st['protocolSection']['contactsLocationsModule'] = {'locations': [{'facility': 'X', 'country': c} for c in countries]}
    if has_results: st['hasResults'] = True
    return st
base = study('NCTK', ivs=[('Tirzepatide', [])])
ok('in_korea: 장소 중 하나라도 대한민국이면 참 — 등록소 API v2 의 실제 표기 \'South Korea\'(2026-11-06 확인)와 예전 표기 \'Korea, Republic of\' 모두', F.in_korea(with_locs(base, ['United States', 'South Korea'])) and F.in_korea(with_locs(base, ['South Korea'])) and F.in_korea(with_locs(base, ['Korea, Republic of'])) and 'South Korea' in F.KOREA)
ok('in_korea: 대한민국이 없거나 장소 목록이 없으면 거짓(오류 없음)', not F.in_korea(with_locs(base, ['United States', 'Japan'])) and not F.in_korea(base) and not F.in_korea({}) and not F.in_korea({'protocolSection': {'contactsLocationsModule': {'locations': [None, {}]}}}))
ok('in_korea: 비슷한 이름(North Korea · Korea, Democratic People\'s Republic of · Korea)은 세지 않음', not F.in_korea(with_locs(base, ['North Korea', "Korea, Democratic People's Republic of", 'Korea'])))
# 받은 일치 전체로 센다: 요약에 쓰는 최근 1,000건 밖의 옛 등록에 있는 국내 시행·결과도 센다
many = []
for i in range(1100):
    st = study(f'NCTM{i}', ivs=[('Tirzepatide', [])], start='%04d-%02d' % (2000 + i % 25, 1 + i % 12))
    many.append(with_locs(st, ['South Korea'] if i % 11 == 0 else ['United States'], has_results=(i % 7 == 0)))
want_kr = sum(1 for x in many if F.in_korea(x)); want_res = sum(1 for x in many if x.get('hasResults'))
rec = F.make_record('tirzepatide', many, False, '2026-11')
kept = sorted(many, key=F.start_of, reverse=True)[:F.CT_KEEP]
ok('make_record: 국내 시행·결과 게시는 받은 일치 등록 전체로 센다(요약 1,000건 밖 포함)', rec['kr'] == want_kr and rec['res'] == want_res and want_kr > sum(1 for x in kept if F.in_korea(x)) and rec['n'] == 1100, (rec['kr'], want_kr, rec['res'], want_res, rec['n']))
ok('make_record: 1,000건을 넘으면 cap, 단계 합은 요약한 1,000건', rec['cap'] and sum(rec['ph'].values()) == F.CT_KEEP, (rec['cap'], sum(rec['ph'].values())))
rec0 = F.make_record('tirzepatide', [with_locs(base, ['United States'])], False, '2026-11')
ok('make_record: 국내 시행·결과가 없으면 0(자료 없음 null 과 구별되는 0)', rec0['kr'] == 0 and rec0['res'] == 0 and not rec0.get('cap'), (rec0['kr'], rec0['res']))
rec_t = F.make_record('x', [with_locs(base, ['South Korea'], True)], True, '2026-11')
ok('make_record: 받다가 멈췄으면(truncated) cap 을 켜고 국내·결과는 받은 만큼', rec_t['cap'] and rec_t['kr'] == 1 and rec_t['res'] == 1)

# ── 데이터 처리일: note_ct_version ──
real_ctv = F.ct_version
try:
    with tempfile.TemporaryDirectory() as tmp:
        seq = iter([{'api': '2.0.5', 'ts': '2026-11-05T10:00:06', 'at': 'A1'}, {'api': '2.0.5', 'ts': '2026-11-06T10:00:00', 'at': 'A2'}, {'api': '2.0.5', 'ts': '2026-11-05T10:00:06', 'at': 'A3'}, {'api': '2.0.5', 'ts': '2026-11-05T10:00:06', 'at': 'A4'}])
        F.ct_version = lambda: next(seq)
        j = F.note_ct_version(tmp)
        ok('note_ct_version: 시작 값을 기록(end 없음)', j['start']['ts'] == '2026-11-05T10:00:06' and 'end' not in j and 'same' not in j, j)
        j = F.note_ct_version(tmp)       # 이어받아도 처음 start 를 지킨다
        ok('note_ct_version: 이어받아도 처음 start 를 지킴', j['start']['at'] == 'A1' and j['start']['ts'] == '2026-11-05T10:00:06', j)
        j = F.note_ct_version(tmp, end=True)   # 끝 값(A3)이 start 와 같은 처리 시각
        ok('note_ct_version: 끝 처리 시각이 같으면 same=True', j['same'] is True and j['end']['at'] == 'A3', j)
        saved = json.load(open(os.path.join(tmp, 'ct_version.json'), encoding='utf-8'))
        ok('note_ct_version: ct_version.json 에 기록되고 다시 읽힘', saved == j, saved)
    with tempfile.TemporaryDirectory() as tmp:
        seq = iter([{'api': '2.0.5', 'ts': '2026-11-05T10:00:06', 'at': 'B1'}, {'api': '2.0.5', 'ts': '2026-11-06T10:00:00', 'at': 'B2'}])
        F.ct_version = lambda: next(seq)
        F.note_ct_version(tmp); j = F.note_ct_version(tmp, end=True)
        ok('note_ct_version: 수집 도중 등록소 자료가 갱신되면(처리 시각이 다름) same=False', j['same'] is False and j['start']['ts'] != j['end']['ts'], j)
    with tempfile.TemporaryDirectory() as tmp:
        seq = iter([{'error': '요청 실패', 'at': 'C1'}, {'error': '요청 실패', 'at': 'C2'}])
        F.ct_version = lambda: next(seq)
        F.note_ct_version(tmp); j = F.note_ct_version(tmp, end=True)
        ok('note_ct_version: 처리 시각을 못 받았으면(둘 다 오류) same=False — 같다고 말하지 않음', j['same'] is False, j)
finally:
    F.ct_version = real_ctv

# ── MedlinePlus: mplus_items ──
with tempfile.TemporaryDirectory() as tmp:
    os.makedirs(os.path.join(tmp, 'data')); rawd = os.path.join(tmp, 'raw'); os.makedirs(rawd)
    json.dump({'concepts': [{'type': 'VTM', 'rxcui': '161', 'label_en': 'Acetaminophen '}, {'type': 'VMP', 'rxcui': '999', 'label_en': 'x'}, {'type': 'VTM', 'rxcui': '', 'label_en': 'none'}, {'type': 'VTM', 'rxcui': 'abc', 'label_en': 'bad'}, {'type': 'VTM', 'rxcui': 7646, 'label_en': 'Omeprazole'}]},
              open(os.path.join(tmp, 'data', 'medterm.json'), 'w', encoding='utf-8-sig'), ensure_ascii=False)
    json.dump({'entities': [{'rxcui': '2', 'label_en': 'few', 'kr': {'items': 3}}, {'rxcui': '161', 'label_en': 'dup', 'kr': {'items': 999}}, {'rxcui': '3', 'label_en': 'Many', 'kr': {'items': 50}}, {'rxcui': '4', 'label_en': 'nokr'}]},
              open(os.path.join(tmp, 'data', 'medterm_ext.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    items = F.mplus_items(tmp, rawd)
    ok('mplus_items: 핵심 사전(VTM)이 먼저, 그다음 확장 사전은 국내 등재 품목이 많은 성분부터', [x['q'] for x in items] == ['161', '7646', '3', '2', '4'], [x['q'] for x in items])
    ok('mplus_items: 같은 RxCUI 는 한 번만(핵심 사전 이름이 남음) · 숫자가 아닌 코드와 VTM 이 아닌 항목은 뺌 · 이름은 소문자·공백 정리', items[0] == {'q': '161', 'n': 'acetaminophen'} and all(x['q'].isdigit() for x in items) and '999' not in [x['q'] for x in items], items[:2])
    ok('mplus_items: 목록을 raw 폴더의 mplus_rx.json 으로 저장(새 자료 만들 때 조회 대상 수로 씀)', json.load(open(os.path.join(rawd, 'mplus_rx.json'), encoding='utf-8')) == items)

# ── MedlinePlus: parse_mplus · MPLUS_PAGE ──
feed = {'feed': {'entry': [
    {'title': {'_value': 'Acetaminophen'}, 'link': [{'href': 'https://medlineplus.gov/druginfo/meds/a681004.html'}], 'summary': {'_value': '<p>ASHP 저작물 본문</p>'}},
    {'title': {'_value': 'Acetaminophen (again)'}, 'link': {'href': 'https://medlineplus.gov/druginfo/meds/a681004.html?utm=1'}},
    {'title': {'_value': 'Acetaminophen Injection'}, 'link': [{'href': 'https://medlineplus.gov/druginfo/meds/a611011.html#top'}]},
    {'title': {'_value': 'Encyclopedia'}, 'link': [{'href': 'https://medlineplus.gov/ency/article/002345.htm'}]},
    {'title': {'_value': 'Plain http'}, 'link': [{'href': 'http://medlineplus.gov/druginfo/meds/a111111.html'}]},
    {'title': {'_value': 'Other host'}, 'link': [{'href': 'https://medlineplus.gov.evil.example/druginfo/meds/a222222.html'}]},
    {'title': {'_value': 'Suffix'}, 'link': [{'href': 'https://medlineplus.gov/druginfo/meds/a333333.html.exe'}]},
    {'title': {'_value': 'T' * 200}, 'link': [{'href': 'https://medlineplus.gov/druginfo/meds/a444444.html'}]},
]}}
hits = F.parse_mplus(feed)
ok('parse_mplus: 약 정보 쪽(https://medlineplus.gov/druginfo/meds/aNNN.html)만 받고 같은 쪽은 한 번만', [h['id'] for h in hits] == ['a681004', 'a611011', 'a444444'], hits)
ok('parse_mplus: 결과에는 쪽 번호와 제목만 있고 본문 요약(summary)은 읽지도 담지도 않음(ASHP 저작물)', all(set(h) == {'id', 't'} for h in hits) and 'ASHP' not in json.dumps(hits, ensure_ascii=False), hits)
ok('parse_mplus: 제목은 80자까지', len(hits[2]['t']) == 80 and hits[0]['t'] == 'Acetaminophen')
ok('parse_mplus: 사전 밖 주소(백과·http·다른 호스트·확장자 뒤 붙임)는 버림', not any(h['id'] in ('a111111', 'a222222', 'a333333') for h in hits))
ok('parse_mplus: entry 가 하나(딕셔너리)여도 · 비어도 · None 이어도 오류 없음', F.parse_mplus({'feed': {'entry': feed['feed']['entry'][0]}}) == [{'id': 'a681004', 't': 'Acetaminophen'}] and F.parse_mplus({'feed': {}}) == [] and F.parse_mplus(None) == [] and F.parse_mplus({}) == [])

# ── MedlinePlus: fetch_mplus_one (요청 함수를 가짜로) ──
asked = []
def fake_mp(url, **kw):
    asked.append((url, kw)); return json.dumps(feed).encode() if 'v.c=161' in url else None
F._req = fake_mp
try:
    r1 = F.fetch_mplus_one('161'); r2 = F.fetch_mplus_one('999')
    q1 = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(asked[0][0]).query))
    ok('fetch_mplus_one: RxNorm OID(2.16.840.1.113883.6.88)와 RxCUI 로, 영문 JSON 을 요청', asked[0][0].startswith('https://connect.medlineplus.gov/service?') and q1['mainSearchCriteria.v.cs'] == '2.16.840.1.113883.6.88' and q1['mainSearchCriteria.v.c'] == '161' and q1['informationRecipient.languageCode.c'] == 'en' and q1['knowledgeResponseType'] == 'application/json', q1)
    ok('fetch_mplus_one: 404 는 오류가 아니라 ‘쪽 없음’(hits 빈 목록)으로 기록 — 이어받기에서 다시 묻지 않도록 q 는 남김', asked[0][1].get('not_found_ok') is True and r2 == {'q': '999', 'hits': []} and r1['q'] == '161' and len(r1['hits']) == 3, (r1, r2))
finally:
    F._req = real_req

# ── 이어받기·속도 제한: run_pool_jsonl ──
with tempfile.TemporaryDirectory() as tmp:
    calls, lock = [], threading.Lock()
    def fn(x):
        with lock: calls.append((x['q'], time.time()))
        if x['q'] == 'bad': raise RuntimeError('일시 오류')
        return {'q': x['q'], 'hits': []}
    items = [{'q': str(i)} for i in range(6)] + [{'q': 'bad'}]
    t0 = time.time(); F.run_pool_jsonl(tmp, 'mp.jsonl', items, fn, rate=50, workers=3)
    got = [json.loads(l)['q'] for l in open(os.path.join(tmp, 'mp.jsonl'), encoding='utf-8')]
    ok('run_pool_jsonl: 성공한 항목만 기록하고 일시 오류 항목은 건너뜀(다음 이어받기에서 다시 시도)', sorted(got) == sorted(str(i) for i in range(6)) and 'bad' not in got, got)
    n_before = len(calls); F.run_pool_jsonl(tmp, 'mp.jsonl', items, fn, rate=50, workers=3)
    ok('run_pool_jsonl: 이어받기 — 이미 받은 항목은 다시 묻지 않고 실패했던 것만 다시 시도', len(calls) - n_before == 1 and calls[-1][0] == 'bad', (len(calls) - n_before, calls[-1]))
    log = json.load(open(os.path.join(tmp, 'fetch_log.json'), encoding='utf-8'))
    ok('run_pool_jsonl: 끝나면 fetch_log.json 에 받은 날을 기록(앱의 “자료 받은 날”)', 'mp.jsonl' in log and str(log['mp.jsonl'])[:4] == time.strftime('%Y'), log)
    ts = sorted(t for _, t in calls[:7])
    ok('run_pool_jsonl: 초당 rate 를 넘지 않음(7건에 최소 0.1초 이상)', ts[-1] - ts[0] >= 6 / 50 * 0.8, ts[-1] - ts[0])

bad = [c for c in checks if c[0] == 'FAIL']
for c in checks: print(' | '.join(c))
print(f'\n{len(checks) - len(bad)}/{len(checks)} checks passed')
sys.exit(1 if bad else 0)
