"""확장 수록 만들기 도구(build/ext_norm.py · build/ext_fetch.py)의 순수 함수 점검 — 네트워크·원자료 없이 돈다.
실행: python tests/test_ext_pipeline.py
 - 이름 정규화 규칙(염·수화물·약어·괄호)이 같은 성분의 표기 변이를 묶고, 다른 성분은 묶지 않는지
 - 한글 성분명의 염 꼬리 떼기가 3글자 미만으로 줄이지 않는지
 - 데이터포털 상세 페이지에서 자료명·등록일·수정일·갱신 주기를 읽는 함수
 - (자료가 있을 때) data/medterm_ext.json 의 입력 파일 기록과 build/ext_build.py 의 기록 방식이 맞는지"""
import json, os, re, sys
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
sys.path.insert(0, os.path.join(root, 'build'))
import ext_norm as N
import ext_fetch as F

checks = []
def ok(name, cond, extra=''): checks.append(('PASS' if cond else 'FAIL', name, str(extra)[:140]))
def keys(name): return [k for k, _ in N.candidates(name)]

# ── 영문 이름 정규화 ──
ok('n0: 소문자·공백 정리·전각 통일', N.n0('  Ｏmeprazole   Sodium ') == 'omeprazole sodium', N.n0('  Ｏmeprazole   Sodium '))
ok('exact 가 첫 후보', N.candidates('Omeprazole')[0] == ('omeprazole', 'exact'), N.candidates('Omeprazole')[:2])
ok('약어 풀기: "atenolol hcl" → atenolol hydrochloride 후보', 'atenolol hydrochloride' in keys('Atenolol HCl'), keys('Atenolol HCl'))
ok('염 꼬리 떼기: "metformin hydrochloride" → metformin', 'metformin' in keys('Metformin Hydrochloride'), keys('Metformin Hydrochloride'))
ok('수화물 떼기: "amoxicillin trihydrate" → amoxicillin', 'amoxicillin' in keys('Amoxicillin Trihydrate'), keys('Amoxicillin Trihydrate'))
ok('(as X) 표기: "eperisone (as hydrochloride)" 는 moiety 규칙 후보를 가짐', any(r == 'moiety' for _, r in N.candidates('Eperisone (as eperisone hydrochloride)')), N.candidates('Eperisone (as eperisone hydrochloride)'))
ok('짝이온만 남으면 떼지 않음: "calcium carbonate" → "calcium" 후보 없음', 'calcium' not in keys('Calcium Carbonate'), keys('Calcium Carbonate'))
ok('짝이온만 남으면 떼지 않음: "sodium chloride" → "sodium" 후보 없음', 'sodium' not in keys('Sodium Chloride'), keys('Sodium Chloride'))
ok('선두 양이온 떼기: "sodium chondroitin sulfate" → chondroitin sulfate', 'chondroitin sulfate' in keys('Sodium Chondroitin Sulfate'), keys('Sodium Chondroitin Sulfate'))
ok('입체 표기는 마지막 수단으로만 떼어 봄(d-/l-)', keys('L-carnitine')[0] == 'l-carnitine' and 'carnitine' in keys('L-carnitine'), keys('L-carnitine'))
ok('후보 키는 중복이 없음', all(len(keys(n)) == len(set(keys(n))) for n in ('Aspirin', 'Metformin Hydrochloride', 'Sodium Chondroitin Sulfate', 'Amoxicillin Trihydrate')))
ok('basekey: 같은 성분의 표기 변이를 하나로 묶음', N.basekey('Metformin Hydrochloride') == N.basekey('Metformin HCl') == 'metformin', (N.basekey('Metformin Hydrochloride'), N.basekey('Metformin HCl')))
ok('basekey: 다른 성분은 묶지 않음', N.basekey('Metformin') != N.basekey('Metoprolol') and N.basekey('Omeprazole') != N.basekey('Esomeprazole'))
ok('같은 입력은 항상 같은 후보(결정적)', all(N.candidates(n) == N.candidates(n) for n in ('Omeprazole', 'Atenolol HCl')))

# ── 한글 이름 ──
ok('ko_base: 염 꼬리 떼기(아토르바스타틴칼슘삼수화물 → 아토르바스타틴)', N.ko_base('아토르바스타틴칼슘삼수화물') == '아토르바스타틴', N.ko_base('아토르바스타틴칼슘삼수화물'))
ok('ko_base: 에페리손염산염 → 에페리손', N.ko_base('에페리손염산염') == '에페리손', N.ko_base('에페리손염산염'))
ok('ko_base: 3글자 미만으로 줄이지 않음("염산염"은 그대로)', len(N.ko_base('염산염')) >= 3 and len(N.ko_base('메트포르민염산염')) >= 3, N.ko_base('염산염'))
ok('ko_base: 이미 본체뿐이면 그대로(오메프라졸)', N.ko_base('오메프라졸') == '오메프라졸')
ok('ko_base: 짝이온 낱말만 남는 경우는 떼지 않음("염화나트륨" → 그대로)', N.ko_base('염화나트륨') == '염화나트륨', N.ko_base('염화나트륨'))

# ── 데이터포털 페이지 해석 ──
html = ('<html><script type="application/ld+json">{"name":"x","alternateName":"건강보험심사평가원_약가마스터_의약품주성분_20251031",'
        '"variableMeasured":[{"name":"업데이트 주기","value":"연간","@type":"PropertyValue"}],'
        '"dateCreated":"2025-11-20","dateModified":"2026-01-20","datePublished":"2025-11-20"}</script></html>')
pi = F.portal_info(html)
ok('portal_info: 자료명·등록일·수정일·갱신 주기', pi == {'title': '건강보험심사평가원_약가마스터_의약품주성분_20251031', 'registered': '2025-11-20', 'modified': '2026-01-20', 'cycle': '연간'}, pi)
ok('portal_info: 없는 항목은 None(오류 없음)', F.portal_info('<html></html>') == {'title': None, 'registered': None, 'modified': None, 'cycle': None})
ok('수집기: 사용자 이메일 등 개인정보를 요청 머리글에 넣지 않음(일반 UA)', '@' not in F.UA and 'MedTermKR' in F.UA, F.UA)
ok('수집기: data.go.kr 인증키(서비스키)를 코드에 쓰지 않음', not re.search(r'serviceKey|DATA_GO_KR_KEY', open(os.path.join(root, 'build', 'ext_fetch.py'), encoding='utf-8').read()))

# ── 받은 날 기록(fetch_log.json) · 일반명코드 형식 ──
import tempfile
import ext_build as B
with tempfile.TemporaryDirectory() as td:
    F.note_fetch(td, 'rx_in.json'); F.note_fetch(td, 'hira_ing/raw.bin')
    lg = json.load(open(os.path.join(td, 'fetch_log.json'), encoding='utf-8'))
    ok('받은 날 기록: 파일마다 YYYY-MM-DD 로 쌓이고 앞의 기록을 지우지 않음', sorted(lg) == ['hira_ing/raw.bin', 'rx_in.json'] and all(re.fullmatch(r'\d{4}-\d{2}-\d{2}', v) for v in lg.values()), lg)
    open(os.path.join(td, 'fetch_log.json'), 'w').write('{깨진 파일')
    F.note_fetch(td, 'wd_atc.json')
    ok('받은 날 기록: 기록 파일이 깨져 있어도 멈추지 않고 새로 시작', list(json.load(open(os.path.join(td, 'fetch_log.json'), encoding='utf-8'))) == ['wd_atc.json'])
ok('일반명코드 형식: 숫자 6자리 + 영문 3자리, 또는 앞 1자리가 영문인 것을 받아들임', all(B.HIRA_CODE.fullmatch(c) for c in ('193801ATR', '611901CCH', 'A12301ATB')), None)
ok('일반명코드 형식: 8자리·10자리·소문자·공백·빈 값은 거절', not any(B.HIRA_CODE.fullmatch(c) for c in ('19380ATR', '1938011ATR', '193801atr', '193801 AT', '')), None)
ok('ext_build: 레코드에 쓰는 필드가 hira_codes(전체 9자리)이고, 앞 4자리만 담던 hira_cd 는 코드에 남아 있지 않음', "rec['hira_codes']" in open(os.path.join(root, 'build', 'ext_build.py'), encoding='utf-8').read() and "'hira_cd'" not in open(os.path.join(root, 'build', 'ext_build.py'), encoding='utf-8').read())

# ── 만들어진 자료의 입력 파일 기록(자료가 있을 때만) ──
p = os.path.join(root, 'data', 'medterm_ext.json')
if os.path.exists(p):
    first = open(p, encoding='utf-8').readline().rstrip().rstrip(',')
    meta = json.loads(first[len('{"meta":'):])
    fl = meta.get('files', {})
    ok('자료: 입력 파일 두 개의 SHA-256 이 64자리 16진수', all(re.fullmatch(r'[0-9a-f]{64}', (fl.get(k) or {}).get('sha256', '')) for k in ('hira_ing', 'hira_std')), {k: (fl.get(k) or {}).get('sha256', '')[:12] for k in ('hira_ing', 'hira_std')})
    ok('자료: 표준코드 파일 날짜가 포털 자료명 끝의 날짜와 같음', fl['hira_std'].get('file_date', '').replace('-', '') == re.search(r'_(\d{8})$', fl['hira_std']['portal']['title']).group(1), fl['hira_std'])
    pkg = json.load(open(os.path.join(root, 'web-react', 'package.json'), encoding='utf-8'))['version']
    ok('자료: meta.version 이 앱 버전(web-react/package.json)과 같음', meta.get('version') == pkg, (meta.get('version'), pkg))
    ok('자료: 입력 파일 모두에 받은 날(YYYY-MM-DD)이 있음', all(re.fullmatch(r'\d{4}-\d{2}-\d{2}', f.get('fetched') or '') for f in fl.values()), [k for k, f in fl.items() if not f.get('fetched')])
    ok('자료: 출처 4종(R·H·W·A)에 이용 조건 태그·분류가 있고 ATC 는 재배포 미결정', {x['id']: x['license_class'] for x in meta['sources']} == {'R': 'attribution', 'H': 'attribution', 'W': 'open', 'A': 'pending'}, {x['id']: x['license_class'] for x in meta['sources']})

bad = [c for c in checks if c[0] == 'FAIL']
for c in checks: print(' | '.join(c))
print(f'\n{len(checks) - len(bad)}/{len(checks)} checks passed')
sys.exit(1 if bad else 0)
