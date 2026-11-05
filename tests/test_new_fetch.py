"""임상시험 수집기(build/new_fetch.py)의 순수 함수·묶음 로직 점검 — 네트워크 없이 돈다(요청 함수를 가짜로 바꿔 끼움).
실행: python tests/test_new_fetch.py
 - 이름 → 검색 문구(components): 복합제·수식어·용량 표기·괄호 처리
 - 검색식(ct_term): 유의어 확장을 끄고(EXPANSION[None]) 낱말마다 AND, 불용어는 뺌
 - 이름 대조(matches): 중재 이름·다른 이름에 들어 있어야 세고, 제목만 있을 때는 질환 이름에 없을 때만 셈(cocaine dependence 같은 질환 이름이 약으로 세어지는 것을 막음)
 - 요약(summarize_trials): 시작일이 만든 날로부터 36개월을 넘는 등록은 '가장 늦은 시작 달'과 예시 정렬에서 뺌(건수·상태에는 센다)
 - 묶음 수집(fetch_trials_group): 묶음이 너무 크면 반으로 나눔 · 한 성분만 남으면 시작일 최근순으로 쪽 상한까지 · 1,000건 넘거나 잘리면 cap · 쪽 넘김"""
import collections, json, os, sys
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

bad = [c for c in checks if c[0] == 'FAIL']
for c in checks: print(' | '.join(c))
print(f'\n{len(checks) - len(bad)}/{len(checks)} checks passed')
sys.exit(1 if bad else 0)
