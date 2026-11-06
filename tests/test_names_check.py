"""핵심 사전의 한글 성분명·국내 상품명 대조 점검 — python3 -I tests/test_names_check.py
 네트워크 불필요. tools/names_check.py 가 저장소 자료(핵심 사전·확장 수록·국내 제품)만 읽어 비교한다.
 ① 성분 한글명 32개가 모두 확장 쪽 한글 이름과 같거나(exact) 염 이름의 앞부분(salt)인가  ② 상품명이 모두 심평원 품목에서 확인되는가
 ③ 2026-11-06 대조로 바꾼 두 곳(로섹 제외 · 쿠마딘→쿠파린)이 되돌아가지 않았는가
 이것은 자료 사이의 일치 점검이며 약사의 검수가 아니다."""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
sys.path.insert(0, os.path.join(root, 'tools'))
import names_check as NC

checks = []
def ok(name, cond, extra=''): checks.append(('PASS' if cond else 'FAIL', name, str(extra)[:200]))

core, ext, prod = NC.load(root)
V = NC.vtm_names(core, ext); B = NC.brand_names(core, ext, prod)
ok('성분 한글명: 핵심 성분 32개를 모두 대조함', len(V) == 32 and len(V) == sum(1 for c in core['concepts'] if c['type'] == 'VTM'), len(V))
ok('성분 한글명: 확장 쪽 이름과 같거나(exact) 염 이름의 앞부분(salt)이 아닌 것이 없음', all(r['status'] in ('exact', 'salt') for r in V), [r['en'] for r in V if r['status'] == 'missing'])
ok('성분 한글명: salt 는 메트포르민·아토르바스타틴 두 개뿐(심평원은 염 이름으로 적음)', sorted(r['en'] for r in V if r['status'] == 'salt') == ['atorvastatin', 'metformin'], [r['en'] for r in V if r['status'] == 'salt'])
nb = sum(len(c.get('brands_ko', [])) for c in core['concepts'] if c['type'] == 'VTM')
ok('상품명: 핵심 사전의 상품명 28개를 모두 대조함', len(B) == nb == 28, (len(B), nb))
ok('상품명: 심평원 품목에서 확인되지 않은 것(none)이 없음', all(r['status'] in ('ok-ingredient', 'ok-name') for r in B), [(r['vtm'], r['brand']) for r in B if r['status'] == 'none'])
ok('상품명: 성분 연결까지 확인된 것이 27개, 품목명의 성분 표기로 확인된 것이 1개(클라리틴)', sum(r['status'] == 'ok-ingredient' for r in B) == 27 and [r['brand'] for r in B if r['status'] == 'ok-name'] == ['클라리틴'], [(r['brand'], r['status']) for r in B if r['status'] != 'ok-ingredient'])
by = {c['label_en']: c for c in core['concepts'] if c['type'] == 'VTM'}
ok('2026-11-06 대조: 오메프라졸에서 로섹을 뺌(심평원 약가마스터에 없음)', by['omeprazole']['brands_ko'] == [], by['omeprazole']['brands_ko'])
ok('2026-11-06 대조: 와파린의 쿠마딘을 심평원에 등재된 쿠파린으로 바꿈', by['warfarin']['brands_ko'] == ['쿠파린'], by['warfarin']['brands_ko'])
ok('상품명: 어느 성분에도 로섹·쿠마딘이 남아 있지 않음', not any(b in ('로섹', '쿠마딘') for c in core['concepts'] if c['type'] == 'VTM' for b in c.get('brands_ko', [])))
ok('출처 표기: 성분마다 ko_label·brands_ko 출처에 2026-11-06 대조 사실이 적혀 있음', all('2026-11-06' in c['provenance']['ko_label'] and '2026-11-06' in c['provenance']['brands_ko'] and '약사 검수 전' in c['provenance']['ko_label'] for c in core['concepts'] if c['type'] == 'VTM'))
ttl = open(os.path.join(root, 'data', 'medterm.ttl'), encoding='utf-8').read()
ok('온톨로지(medterm.ttl): 로섹·쿠마딘이 없고 쿠파린이 있음', '"로섹"' not in ttl and '"쿠마딘"' not in ttl and 'mt:koBrand "쿠파린"@ko' in ttl)
src = open(os.path.join(root, 'tools', 'names_check.py'), encoding='utf-8').read()
ok('도구 소스에 네트워크·서비스키·실행 호출이 없음', not any(w in src for w in ('urllib', 'requests', 'http.client', 'socket', 'subprocess', 'os.system', 'serviceKey')))

fails = [c for c in checks if c[0] == 'FAIL']
for s, n, x in checks:
    print(f'{s} {n}' + (f'  -> {x}' if s == 'FAIL' and x else ''))
print(f'\n한글명·상품명 대조 점검: {len(checks) - len(fails)}개 통과, {len(fails)}개 실패')
sys.exit(1 if fails else 0)
