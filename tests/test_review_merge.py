"""약사 검수 참여(검수 2·3단계) 도구 점검 — python3 -I tests/test_review_merge.py
 네트워크 불필요. build/review_lib.py(항목·검증·병합·현황)와 tools/merge_pharmacist_reviews.py(운영자 병합 도구)를 본다.
 임시 폴더의 가짜 제출 파일만 쓴다(가짜 판정은 도구 점검용이며 실제 약사의 판정이 아니다. 저장소의 data/review/pharmacist_reviews.json 은 건드리지 않는다).
 ① 검수 항목: 개수·id·번호(대조 시트와 같은 순서)·결정성·내용이 바뀌면 그 항목의 해시만 바뀜
 ② 제출 파일 검증: 정상·형식 위반 각각·사전 내용이 바뀐 판정·메모 정리·보이지 않는 글자
 ③ 병합과 현황: 면허 확인 표시 필수·2단계·3단계 조건·‘다르다’ 우선·공개/비공개·같은 검수자·내용이 바뀐 뒤의 현황·메모 비저장
 ④ 저장 자료 점검(--check)과 명령줄 도구  ⑤ 도구 소스에 네트워크·실행 호출이 없음  ⑥ 저장소의 병합 자료·앱 덩어리가 지금 자료와 맞음"""
import copy, io, json, os, re, shutil, sys, tempfile, contextlib
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
sys.path.insert(0, os.path.join(root, 'tools')); sys.path.insert(0, os.path.join(root, 'build'))
import review_lib as RL, merge_pharmacist_reviews as MPR, make_check_sheets as MCS
import datetime

checks = []
def ok(name, cond, extra=''): checks.append(('PASS' if cond else 'FAIL', name, str(extra)[:200]))
def err_of(fn, *a, **k):
    try: fn(*a, **k)
    except RL.ReviewError as e: return str(e)
    return None

DATA = os.path.join(root, 'data')
TODAY = datetime.date(2026, 11, 8)
IT = RL.build_items(DATA)
NAMES, LAW = IT['items']['names'], IT['items']['law']

# ── ① 검수 항목 ──
ok('항목: 성분 한글명·상품명 60개(성분 32 + 상품 28) · 약사법 풀이 53개 · 번호가 1부터 이어짐',
   len(NAMES) == 60 and sum(i['k'] == 'ing' for i in NAMES) == 32 and sum(i['k'] == 'brand' for i in NAMES) == 28 and len(LAW) == 53
   and [i['no'] for i in NAMES] == list(range(1, 61)) and [i['no'] for i in LAW] == list(range(1, 54)), (len(NAMES), len(LAW)))
allids = [i['id'] for sid in IT['items'] for i in IT['items'][sid]]
ok('항목: id 가 모두 다르고 형식이 정해진 대로(N-RxCUI · B-RxCUI-상품명 해시 6자 · L-…)', len(allids) == len(set(allids)) == 113
   and all(re.fullmatch(r'N-\d+', i['id']) for i in NAMES if i['k'] == 'ing') and all(re.fullmatch(r'B-\d+-[0-9a-f]{6}', i['id']) for i in NAMES if i['k'] == 'brand')
   and all(re.fullmatch(r'L-[0-9][0-9A-Za-z_-]*', i['id']) for i in LAW), allids[:3])
ok('항목: 자료의 LAW:2:2 와 LAW:2-2 는 서로 다른 id(L-2_2 · L-2-2)로 구분됨', {'L-2_2', 'L-2-2'} <= set(allids))
nr = MCS.names_rows(MCS.load(os.path.join(DATA, 'medterm.json'))); lr = MCS.law_rows(MCS.load(os.path.join(DATA, 'medterm_law.json')))
ok('항목: 순서·번호가 약사 확인용 대조 시트(CSV)의 번호와 같음 — 성분·상품명 60행, 약사법 53행(조문 순서)',
   all(r[0] == i['no'] and (r[2], r[3], r[4]) == (i['en'], i['ko'], i.get('b', '')) for r, i in zip(nr, NAMES)) and all(r[0] == i['no'] and (r[2], r[3], r[6]) == (i['a'], i['t'], i['pl']) for r, i in zip(lr, LAW)))
ok('항목: art_key 가 대조 시트 도구와 같은 규칙', all(RL.art_key(a) == MCS.art_key(a) for a in ('제2조 제1호', '제2조의2 제1항', '제23조의2', '제83조의5', '제24조 제4항')))
ok('항목: 같은 자료면 같은 결과(결정적) · 범위 해시가 12자리 16진수', json.dumps(RL.build_items(DATA), sort_keys=True) == json.dumps(IT, sort_keys=True) and all(re.fullmatch(r'[0-9a-f]{12}', s['hash']) for s in IT['scopes'].values()))
ok('항목: 약사법 범위에 시행 예정일(eff)이 있고 항목마다 시행 상태 코드(cur·chg·new)가 있음', IT['scopes']['law']['eff'] == '2026-11-12' and {i['st'] for i in LAW} <= {'cur', 'chg', 'new'})

tmp = tempfile.mkdtemp()
def data_copy(sub, mut=None):
    d = os.path.join(tmp, sub); os.makedirs(d)
    core = json.load(open(os.path.join(DATA, 'medterm.json'), encoding='utf-8')); law = json.load(open(os.path.join(DATA, 'medterm_law.json'), encoding='utf-8'))
    if mut: mut(core, law)
    json.dump(core, open(os.path.join(d, 'medterm.json'), 'w', encoding='utf-8'), ensure_ascii=False); json.dump(law, open(os.path.join(d, 'medterm_law.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    return d
def edit_law(core, law): law['e'][5]['pl'] += ' (수정)'
d1 = data_copy('chg_law', edit_law); IT1 = RL.build_items(d1)
diff = [(a['id']) for a, b in zip(LAW, IT1['items']['law']) if a['h'] != b['h']]
ok('항목: 풀이 한 개를 고치면 그 항목의 해시만 바뀌고 id 는 그대로, 약사법 범위 해시는 바뀌고 성분·상품명 범위 해시는 그대로',
   diff == [LAW[5]['id']] and [i['id'] for i in IT1['items']['law']] == [i['id'] for i in LAW] and IT1['scopes']['law']['hash'] != IT['scopes']['law']['hash'] and IT1['scopes']['names']['hash'] == IT['scopes']['names']['hash'], diff)
def edit_brand(core, law):
    c = next(c for c in core['concepts'] if c['type'] == 'VTM' and c.get('brands_ko')); c['brands_ko'][0] = c['brands_ko'][0] + '정'
d2 = data_copy('chg_brand', edit_brand); IT2 = RL.build_items(d2)
ch = [a['id'] for a, b in zip(NAMES, IT2['items']['names']) if a['id'] != b['id']]
ok('항목: 상품명을 고치면 그 상품 항목의 id·해시만 바뀌고 성분 항목과 나머지 상품 항목은 그대로(자료 순서가 바뀌어도 id 가 안 흔들림)', len(ch) == 1 and ch[0].startswith('B-') and sum(a['h'] != b['h'] for a, b in zip(NAMES, IT2['items']['names'])) == 1, ch)
d3 = data_copy('no_law', None); os.remove(os.path.join(d3, 'medterm_law.json'))
ok('항목: 약사법 자료가 없는 자료판에서는 성분·상품명 범위만 만듦(약사법 범위 없음)', list(RL.build_items(d3)['scopes']) == ['names'])

# ── ② 제출 파일 검증 ──
def sub(scope='names', ids=None, v='ok', attested=True, name='김약사', org='새봄약국', public=True, created='2026-11-08', refs=('health.kr',), items=IT, notes=None):
    lst = items['items'][scope]
    pick = lst if ids is None else [i for i in lst if i['id'] in ids]
    ans = {i['id']: {'v': (v(i) if callable(v) else v), 'h': i['h']} for i in pick}
    for k, m in (notes or {}).items(): ans[k]['m'] = m
    return {'schema': RL.SCHEMA, 'app_version': '1.6.0', 'scope': scope, 'created': created, 'reviewer': {'name': name, 'affiliation': org, 'license_claimed': True, 'public': public},
            'refs': list(refs), 'refs_other': '', 'attested': attested, 'answers': ans}
good, warns = RL.validate_submission(sub(), IT, TODAY)
ok('검증: 정상 제출 파일이 통과하고 항목 60개·확인서 표시(a)가 붙음', len(good['answers']) == 60 and all(a.get('a') == 1 for a in good['answers'].values()) and not warns and good['reviewer']['name'] == '김약사')
g2, _ = RL.validate_submission(sub(attested=False), IT, TODAY)
ok('검증: 확인서에 동의하지 않은 파일(진행 상황)은 판정은 받되 확인서 표시(a)가 없음', len(g2['answers']) == 60 and not any('a' in a for a in g2['answers'].values()))
def bad(msg_part, **kw):
    s = sub(**{k: v for k, v in kw.items() if k in ('scope', 'ids', 'v', 'attested', 'name', 'org', 'public', 'created', 'refs', 'notes')})
    for path, val in kw.get('patch', {}).items():
        o = s
        for p in path[:-1]: o = o[p]
        if val is KeyError: o.pop(path[-1], None)
        else: o[path[-1]] = val
    e = err_of(RL.validate_submission, s, IT, TODAY)
    return e is not None and msg_part in e, e
cases = [
    ('형식이 다릅니다', dict(patch={('schema',): 'x/9'})),
    ('알 수 없는 범위', dict(patch={('scope',): 'drugs'})),
    ('면허를 가지고 있다는 표시', dict(patch={('reviewer', 'license_claimed'): False})),
    ('면허를 가지고 있다는 표시', dict(patch={('reviewer', 'license_claimed'): 'true'})),
    ('공개 동의', dict(patch={('reviewer', 'public'): 'yes'})),
    ('검수자 이름: 비어 있습니다', dict(name='   ')),
    ('검수자 이름: 40자를 넘습니다', dict(name='가' * 41)),
    ('제어 문자', dict(name='김‮약사')),
    ('제어 문자', dict(name='김​약사')),
    ('제어 문자', dict(name='김\n약사')),
    ('소속: 80자를 넘습니다', dict(org='나' * 81)),
    ('참고한 자료', dict(refs=('health.kr', 'wikipedia'))),
    ('attested', dict(patch={('attested',): 'yes'})),
    ('created', dict(created='2026/11/08')),
    ('없는 날짜', dict(created='2026-02-30')),
    ('범위를 벗어난 날짜', dict(created='2025-12-31')),
    ('범위를 벗어난 날짜', dict(created='2026-11-20')),
    ('answers(판정)가 비어 있습니다', dict(patch={('answers',): {}})),
    ('이 자료에 없는 항목 id', dict(patch={('answers', 'N-999999'): {'v': 'ok', 'h': 'abc'}})),
    ('판정(v)은', dict(patch={('answers', NAMES[0]['id']): {'v': 'yes', 'h': NAMES[0]['h']}})),
    ('내용 표시(h)가 없습니다', dict(patch={('answers', NAMES[0]['id']): {'v': 'ok'}})),
    ('메모: 300자를 넘습니다', dict(notes={NAMES[0]['id']: '가' * 301})),
    ('메모: 제어 문자', dict(notes={NAMES[0]['id']: 'a\x00b'})),
]
for part, kw in cases:
    r, e = bad(part, **kw)
    ok(f'검증 거부: {part} ({list(kw)[0]})', r, e)
ok('검증 거부: JSON 객체가 아닌 파일', err_of(RL.validate_submission, [1, 2], IT, TODAY) is not None)
st = sub(); st['answers'][NAMES[3]['id']]['h'] = 'old0000000'; st['answers'][NAMES[4]['id']]['h'] = 'old1111111'
gs, ws = RL.validate_submission(st, IT, TODAY)
ok('검증: 사전 내용이 바뀐 뒤의 판정(해시 불일치)은 반영하지 않고 경고로 알림(나머지는 받음)', len(gs['answers']) == 58 and NAMES[3]['id'] in gs['stale'] and len(ws) == 1 and '2개' in ws[0], ws)
sa = sub(); [a.__setitem__('h', 'old') for a in sa['answers'].values()]
ok('검증 거부: 모든 판정이 지난 판이면 병합하지 않음', '하나도 없습니다' in (err_of(RL.validate_submission, sa, IT, TODAY) or ''))
gn, _ = RL.validate_submission(sub(ids={NAMES[0]['id']}, notes={NAMES[0]['id']: '  줄바꿈\n  있는   메모 '}), IT, TODAY)
ok('검증: 메모는 한 줄로 정리됨(줄바꿈·연속 공백 → 한 칸)', gn['notes'][NAMES[0]['id']] == '줄바꿈 있는 메모')

# ── ③ 병합과 현황 ──
def fresh(): return RL.empty_store()
def merge(store, s, **kw):
    kw.setdefault('license_verified', True); kw.setdefault('verified_on', '2026-11-09'); kw.setdefault('today', TODAY)
    return RL.merge_submission(store, IT, s, **kw)
ok('병합: 면허 확인 표시(license_verified)가 True 가 아니면 합치지 않음(저장 자료도 그대로)', all(err_of(RL.merge_submission, fresh(), IT, sub(), v, '2026-11-09', None, TODAY) for v in (False, None, 'yes', 1)))
s0 = fresh(); merge(s0, sub(ids={i['id'] for i in NAMES[:30]}))
c0 = RL.compute_status(IT, s0)
ok('현황(부분): 판정 30/60 · 같다 30 · 2단계·3단계 아님 · 검수자 이름 공개 · 기준일은 면허 확인일', c0['scopes']['names']['answered'] == 30 and c0['scopes']['names']['confirmed'] == 30 and not c0['scopes']['names']['stage2'] and not c0['scopes']['names']['stage3']
   and c0['scopes']['names']['reviewers'][0]['name'] == '김약사' and c0['scopes']['names']['reviewers'][0]['org'] == '새봄약국' and c0['asof'] == '2026-11-09' and c0['scopes']['law']['answered'] == 0, c0['scopes']['names']['reviewers'])
s1 = fresh(); r1 = merge(s1, sub())
c1 = RL.compute_status(IT, s1)['scopes']['names']
ok('현황(전부 같다·확인서): 2단계·3단계 모두 충족(60/60, 확인서로 확인 60)', c1['stage2'] and c1['stage3'] and c1['confirmed'] == 60 and c1['attested_confirmed'] == 60 and c1['issue'] == 0 and r1['pid'] == 'P1', c1)
s2 = fresh(); merge(s2, sub(attested=False))
c2 = RL.compute_status(IT, s2)['scopes']['names']
ok('현황(전부 같다·확인서 없음): 2단계는 충족, 3단계는 아님(확인서가 있어야 함)', c2['stage2'] and not c2['stage3'] and c2['confirmed'] == 60 and c2['attested_confirmed'] == 0, c2)
s3 = fresh(); r3 = merge(s3, sub(v=lambda i: 'diff' if i['no'] == 5 else 'ok'))
c3 = RL.compute_status(IT, s3)['scopes']['names']
ok('현황(‘다르다’ 1개): 2단계는 충족 · 3단계 아님 · issue 1 · 확인 59 · 보고에 고칠 후보 1개(5번)', c3['stage2'] and not c3['stage3'] and c3['issue'] == 1 and c3['confirmed'] == 59 and [f['item']['no'] for f in r3['flagged']] == [5], c3)
merge(s3, sub(name='박약사', org='', v='ok'))
c3b = RL.compute_status(IT, s3)['scopes']['names']
ok('현황(두 번째 약사는 ‘같다’여도 첫 약사의 ‘다르다’가 남아 있으면): 그 항목은 계속 issue 이고 3단계가 아님', c3b['issue'] == 1 and not c3b['stage3'] and len(c3b['reviewers']) == 2 and [r['pid'] for r in c3b['reviewers']] == ['P1', 'P2'], c3b)
s4 = fresh(); merge(s4, sub(v=lambda i: 'unsure' if i['no'] == 7 else 'ok', attested=True))
c4 = RL.compute_status(IT, s4)['scopes']['names']
ok('현황(‘모르겠다’ 1개만 있는 항목): unsure 1 · 3단계 아님', c4['unsure'] == 1 and c4['confirmed'] == 59 and not c4['stage3'] and c4['stage2'], c4)
merge(s4, sub(name='이약사', ids={NAMES[6]['id']}, v='ok'))
c4b = RL.compute_status(IT, s4)['scopes']['names']
ok('현황(다른 약사가 그 항목을 ‘같다’로 확인하면): ‘모르겠다’는 막지 않아 3단계 충족', c4b['unsure'] == 0 and c4b['stage3'] and c4b['confirmed'] == 60, c4b)
s5 = fresh(); r5 = merge(s5, sub(name='최약사', org='비공개약국', public=False))
txt5 = RL.dump_store(s5)
ok('개인정보: 비공개를 고른 약사는 이름·소속이 저장 자료 어디에도 없고 현황에는 ‘이름 없음’으로 나옴', '최약사' not in txt5 and '비공개약국' not in txt5 and s5['reviewers']['P1'] == {'public': False}
   and RL.compute_status(IT, s5)['scopes']['names']['reviewers'][0]['name'] is None and r5['reviewer_raw']['name'] == '최약사')
s6 = fresh(); merge(s6, sub(notes={NAMES[0]['id']: '약학정보원 표기는 ○○입니다'}, v=lambda i: 'diff' if i['no'] == 1 else 'ok'))
ok('개인정보: 약사가 쓴 메모는 저장 자료에 담기지 않고 보고에만 나옴(외부 자료의 글을 옮겼을 수 있어서)', '약학정보원 표기' not in RL.dump_store(s6) and not any('m' in a for r in s6['reviews'] for a in r['answers'].values()))
rep6 = merge(fresh(), sub(notes={NAMES[0]['id']: '약학정보원 표기는 ○○입니다'}, v=lambda i: 'diff' if i['no'] == 1 else 'ok'))
ok('보고: 고칠 후보에 약사 메모가 그대로 실림', rep6['flagged'][0]['note'] == '약학정보원 표기는 ○○입니다' and rep6['flagged'][0]['item']['id'] == NAMES[0]['id'])
s7 = fresh(); a7 = merge(s7, sub(ids={i['id'] for i in NAMES[:10]})); b7 = merge(s7, sub(ids={i['id'] for i in NAMES[5:20]}, v='diff', attested=False))
ok('병합: 공개한 같은 검수자(이름·소속 같음)의 두 번째 제출은 같은 번호(P1)로 합쳐지고 항목별로 새 판정·새 확인서 표시가 이전을 덮음',
   a7['pid'] == b7['pid'] == 'P1' and len(s7['reviews']) == 1 and len(s7['reviews'][0]['answers']) == 20 and s7['reviews'][0]['answers'][NAMES[5]['id']] == {'v': 'diff', 'h': NAMES[5]['h']} and s7['reviews'][0]['answers'][NAMES[0]['id']].get('a') == 1)
c_law = RL.compute_status(IT, (lambda s: (merge(s, sub('law', attested=True)), s)[1])(fresh()))['scopes']
ok('병합: 범위마다 따로 센다(약사법 범위만 낸 약사는 성분·상품명 범위 0)', c_law['law']['stage3'] and c_law['law']['n'] == 53 and c_law['names']['answered'] == 0)
s8 = fresh(); merge(s8, sub(name='정약사', public=False)); r8 = merge(s8, sub('law', name='정약사', public=False), reviewer_id='P1')
ok('병합: 비공개 약사는 번호를 알려 줘야 같은 사람이 되고(P1 의 두 범위), 번호 없이 내면 새 번호', r8['pid'] == 'P1' and len(s8['reviews']) == 2 and merge(s8, sub(name='정약사', public=False))['pid'] == 'P2')
ok('병합: 없는 검수자 번호는 거부', err_of(RL.merge_submission, fresh(), IT, sub(), True, '2026-11-09', 'P7', TODAY) is not None)
s9 = fresh(); merge(s9, sub(name='한약사')); merge(s9, sub('law', name='한약사', public=False), reviewer_id='P1')
ok('개인정보: 같은 검수자가 나중에 비공개로 내면 이름·소속을 지움(번호로 합칠 때)', s9['reviewers']['P1'] == {'public': False} and '한약사' not in RL.dump_store(s9))
s10 = fresh(); merge(s10, sub(name='강약사', public=False)); merge(s10, sub(name='강약사', public=True), reviewer_id='P1')
ok('개인정보: 비공개로 시작한 검수자는 나중에 공개 동의 파일이 와도 자동으로 공개로 바뀌지 않음(운영자가 직접 정해야 함)', s10['reviewers']['P1'] == {'public': False})
ok('병합: 확인일(verified_on)이 날짜가 아니거나 범위 밖이면 거부', all(err_of(RL.merge_submission, fresh(), IT, sub(), True, v, None, TODAY) for v in ('11월 9일', '2026-13-01', '2024-01-01')))
# 내용이 바뀐 뒤의 현황: 풀이 한 개를 고친 자료로 다시 계산
sl = fresh(); merge(sl, sub('law', attested=True))
cl = RL.compute_status(IT1, sl)['scopes']['law']
ok('현황(사전 내용이 바뀐 뒤): 고친 항목은 ‘다시 확인 필요’가 되어 2단계·3단계가 풀리고, 나머지 52개는 그대로 유지', cl['need_recheck'] == 1 and cl['answered'] == 52 and not cl['stage2'] and not cl['stage3'] and cl['confirmed'] == 52, cl)
ok('현황: 확인일(verified_on)이 없는 기록은 세지 않음', (lambda s: (s['reviews'][0].pop('verified_on'), RL.compute_status(IT, s)['scopes']['names']['answered'])[1])(copy.deepcopy(s1)) == 0)
ok('현황: 저장 자료가 비어 있으면 모든 범위가 0 · 단계 없음 · 기준일 없음', all(v['answered'] == 0 and not v['stage2'] and not v['stage3'] for v in RL.compute_status(IT, fresh())['scopes'].values()) and RL.compute_status(IT, fresh())['asof'] is None)

# ── ④ 저장 자료 점검과 명령줄 도구 ──
errs, wr = RL.check_store(s1, IT)
ok('점검: 정상 병합 결과는 오류 없음', not errs, errs)
def chk(mut):
    s = copy.deepcopy(s5); mut(s); return RL.check_store(s, IT)[0]
ok('점검: 비공개 검수자에 이름이 남아 있으면 오류', any('비공개' in e for e in chk(lambda s: s['reviewers']['P1'].update(name='x'))))
ok('점검: 저장하지 않기로 한 칸(메모 m·note)이 있으면 오류', any('저장하지 않기로' in e for e in chk(lambda s: s['reviews'][0].update(notes={'a': 'b'}))))
ok('점검: 면허 확인일이 없으면 오류 · 알 수 없는 범위 · 같은 검수자·범위 중복 · 검수자 없음', any('verified_on' in e for e in chk(lambda s: s['reviews'][0].pop('verified_on')))
   and any('알 수 없는 범위' in e for e in chk(lambda s: s['reviews'][0].update(scope='x'))) and any('두 번' in e for e in chk(lambda s: s['reviews'].append(copy.deepcopy(s['reviews'][0]))))
   and any('reviewers 에 없습니다' in e for e in chk(lambda s: s['reviewers'].pop('P1'))))
ok('점검: 판정 값이 이상하거나 해시가 없으면 오류', any('형식' in e for e in chk(lambda s: s['reviews'][0]['answers'][NAMES[0]['id']].update(v='maybe'))) and any('형식' in e for e in chk(lambda s: s['reviews'][0]['answers'][NAMES[0]['id']].pop('h'))))
s_w = copy.deepcopy(s5); s_w['reviews'][0]['answers']['N-0'] = {'v': 'ok', 'h': 'x'}; e_w, w_w = RL.check_store(s_w, IT)
ok('점검: 자료에서 사라진 항목 id 는 경고(오류 아님)', not e_w and any('지금 자료에 없는' in w for w in w_w), (e_w, w_w))
ok('저장: dump → load 왕복이 같음(키 정렬·들여쓰기 고정)', json.loads(RL.dump_store(s1)) == s1 and RL.dump_store(json.loads(RL.dump_store(s1))) == RL.dump_store(s1))

def run(argv):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try: rc = MPR.main(argv + ['--today', '2026-11-08'])
        except SystemExit as e: rc = e.code
    return rc, out.getvalue()
td = tempfile.mkdtemp(); store = os.path.join(td, 'store.json'); subf = os.path.join(td, 'sub.json')
json.dump(sub(notes={NAMES[0]['id']: '표기가 다릅니다'}, v=lambda i: 'diff' if i['no'] == 1 else 'ok'), open(subf, 'w', encoding='utf-8'), ensure_ascii=False)
rc, o = run(['--status', '--store', store])
ok('명령줄: 저장 자료가 없어도 --status 는 ‘아직’으로 보여 줌(종료 코드 0)', rc == 0 and '0/60' in o and '0/53' in o and '아직' in o, o[:120])
rc, o = run([subf, '--store', store])
ok('명령줄: --license-verified 없이는 합치지 않고(종료 코드 2) 저장 파일도 만들지 않음', rc == 2 and '면허' in o and not os.path.exists(store), o[:160])
rc, o = run([subf, '--store', store, '--license-verified', '--dry-run'])
ok('명령줄: --dry-run 은 결과만 보여 주고 저장하지 않음', rc == 0 and '저장하지 않았습니다' in o and not os.path.exists(store) and '고칠 후보 1개' in o, o[-200:])
rep = os.path.join(td, 'report.md')
rc, o = run([subf, '--store', store, '--license-verified', '--verified-on', '2026-11-09', '--report', rep])
ok('명령줄: 면허 확인 표시와 함께 합치면 저장되고(종료 코드 0) 보고서에 약사 메모가 들어감', rc == 0 and os.path.exists(store) and '표기가 다릅니다' in open(rep, encoding='utf-8').read() and '운영자용' in open(rep, encoding='utf-8').read() and '표기가 다릅니다' not in open(store, encoding='utf-8').read(), o[-200:])
rc, o = run(['--check', '--store', store])
ok('명령줄: 병합 결과를 --check 가 통과시킴', rc == 0 and '통과' in o, o)
open(store, 'a', encoding='utf-8').write(' ')
rc, o = run(['--check', '--store', store])
ok('명령줄: 손으로 고쳐 형식이 도구가 쓴 것과 다르면 --check 가 실패(종료 코드 1)', rc == 1 and '형식' in o, o)
bad_f = os.path.join(td, 'bad.json'); open(bad_f, 'w', encoding='utf-8').write('{"schema": "medterm-kr-review/1", "answers": {')
rc, o = run([bad_f, '--store', os.path.join(td, 's2.json'), '--license-verified'])
ok('명령줄: 잘린 JSON 은 친절한 메시지와 함께 거부(종료 코드 2)', rc == 2 and 'JSON' in o and '다시 받아' in o, o)
rc, o = run([os.path.join(td, 'none.json'), '--store', os.path.join(td, 's3.json'), '--license-verified'])
ok('명령줄: 없는 파일은 거부(종료 코드 2)', rc == 2 and '없습니다' in o, o)
rc, o = run(['--check'])
ok('명령줄: 저장소의 병합 자료(data/review/pharmacist_reviews.json)가 점검을 통과하고 형식이 도구가 쓴 것과 같음', rc == 0 and '통과' in o, o)

# ── ⑤ 도구 소스 점검 ──
FORBID = re.compile(r'urllib|requests|http\.client|socket|subprocess|os\.system|\beval\(|\bexec\(|serviceKey|DATA_GO_KR_KEY|https?://')
for rel in ('tools/merge_pharmacist_reviews.py', 'build/review_lib.py'):
    src = open(os.path.join(root, rel), encoding='utf-8').read()
    ok(f'{rel}: 네트워크·서비스키·실행 호출·주소 문자열이 없음', not FORBID.findall(src), FORBID.findall(src)[:3])
ok('도구: 사용법 설명(docstring)과 python -I 실행 안내가 있음', MPR.__doc__.count('python -I') >= 3 and '--license-verified' in MPR.__doc__)

# ── ⑥ 저장소의 병합 자료와 앱 덩어리 ──
shipped = RL.load_store(os.path.join(DATA, 'review', RL.STORE_NAME))
ok('저장소의 병합 자료: 검수 기록마다 면허 확인일이 있고, 메모·면허번호·연락처 칸이 없으며, 비공개 검수자에 이름이 없음',
   all(r.get('verified_on') for r in shipped['reviews']) and not any(set(r) - {'pid', 'scope', 'answers', 'refs', 'refs_other', 'updated', 'verified_on'} for r in shipped['reviews'])
   and all(set(v) == {'public'} or (v.get('public') and set(v) <= {'public', 'name', 'affiliation'}) for v in shipped['reviewers'].values()))
jsf = os.path.join(root, 'web', 'js', 'medterm-review-data.js')
if os.path.exists(jsf):
    txt = open(jsf, encoding='utf-8').read(); body = txt[txt.index('window.MEDTERM_REVIEW=') + len('window.MEDTERM_REVIEW='):].strip().rstrip(';')
    ok('앱 덩어리(web/js/medterm-review-data.js)가 지금 자료·병합 자료로 다시 만든 것과 같음(어긋나면 python3 build/make_bundle.py)', json.loads(body) == RL.app_payload(DATA))
else:
    ok('앱 덩어리(web/js/medterm-review-data.js)가 있음', False, 'python3 build/make_bundle.py')
guide = open(os.path.join(root, 'docs', '약사검수_참여_안내.md'), encoding='utf-8').read() if os.path.exists(os.path.join(root, 'docs', '약사검수_참여_안내.md')) else ''
ok('안내 문서가 약사용·운영자용 절차와 병합 명령·면허 확인 원칙·개인정보 원칙을 설명함', all(s in guide for s in ('merge_pharmacist_reviews.py', '--license-verified', '면허번호', '메모', 'medterm-kr-review/1', '#review')), len(guide))
shutil.rmtree(tmp, ignore_errors=True); shutil.rmtree(td, ignore_errors=True)

failed = [c for c in checks if c[0] == 'FAIL']
for c in checks: print(' | '.join(c))
print(f'\n{len(checks) - len(failed)}/{len(checks)} checks passed')
sys.exit(1 if failed else 0)
