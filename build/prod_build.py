#!/usr/bin/env python
"""국내 제품(품목) 계층 만들기 — data/medterm_kr_products.json
입력(공개 원자료, ext_fetch.py 로 받은 것): 심평원 약가마스터 의약품표준코드(15067462) · 의약품주성분(15067461), data/medterm_ext.json(성분 연결용), data/product_lexicon.json(묶음·증상어, 수작업 초안)
출력: data/medterm_kr_products.json — 품목 한 줄에 [품목기준코드, 품목명, 업체, 구분, 일반명코드, ATC, 허가년월, 한약추정, 규격, 특수관리]
원칙
 - 취소된 품목은 넣지 않는다. 한약재·원료의약품·의약외품·구분 공란 품목은 넣지 않고 건수만 meta 에 적는다(약재는 제제가 아니다).
 - 품목 하나(품목기준코드)는 포장 단위 여러 줄로 나뉘어 있다. 첫 줄(표준코드 순)의 이름·업체·허가일·ATC 를 쓰고, 일반명코드는 함량별로 여럿일 수 있어 모두 담는다(그 건수는 meta.counts.multi_code_products).
 - 성분 구성(영문 일반명·함량·단위)은 주성분 파일의 일반명코드 줄을 그대로 옮긴다. 성분을 사전 항목(RxNorm 성분)에 연결하는 것은 '단일 성분 코드에서 이름→항목이 이미 정해진 경우'에만 한다.
 - 한약제제 표시는 이름 규칙으로 '추정'한다(규칙은 meta.herbal_rules). 한약 처방 구성(군신좌사)·병명은 이 자료에 없다.
 - 대체 후보 = 같은 일반명코드(성분·함량·제형 큰 갈래가 같음) 품목. 약사법 제27조의 대체조제 판정이 아니다.
사용: python build/prod_build.py --raw <ext_fetch.py 저장폴더> [--out data/medterm_kr_products.json]"""
import argparse, collections, csv, hashlib, io, json, os, re, sys, time
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
sys.path.insert(0, here)
csv.field_size_limit(10 ** 8)

KEEP = {'전문의약품': 0, '일반의약품': 1, '전문,희귀': 0}
EXCL_NAMES = {'한약재': '한약재', '원료의약품': '원료의약품', '의약외품': '의약외품', '': '구분 공란(대부분 한약재)'}
FORM = r'(?:건조|연조|유동)?엑스(?:과립|세립|산|정|캡슐|액|환|시럽)?'
RULE1 = re.compile(r'(?:탕|산|환|단|음|고|전)(?:가[가-힣]+?)?' + FORM)
RULE3 = re.compile(r'\([가-힣]{2,12}(?:탕|환|단|음|고)(?:가[가-힣]+)?\)')
RULE4 = re.compile(r'[가-힣]{2,10}탕(?:액|과립|세립|환|정|엑스[가-힣]*)?(?:\(|$)')
NOT_HERBAL = re.compile(r'반창고|플라스타|파스')

def app_version():
    return json.load(open(os.path.join(root, 'web-react', 'package.json'), encoding='utf-8'))['version']

def herbal_rule(name):
    """한약제제로 '추정'하는 이름 규칙 번호(0=해당 없음). 이름 모양만 본다 — 약사 확인 전 표시."""
    if NOT_HERBAL.search(name): return 0
    if RULE1.search(name): return 1
    if '혼합단미엑스' in name or '단미엑스' in name or '혼합엑스' in name: return 2
    if RULE3.search(name): return 3
    if RULE4.search(name): return 4
    return 0

def rd(p): return open(p, 'rb').read()
def csv_rows(p): return list(csv.DictReader(io.StringIO(rd(p).decode('cp949'), newline='')))
def ym(s):
    m = re.match(r'(\d{4})-(\d{2})', s or ''); return int(m.group(1)) * 100 + int(m.group(2)) if m else 0

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--raw', required=True); ap.add_argument('--out', default=os.path.join(root, 'data', 'medterm_kr_products.json'))
    ap.add_argument('--built-at', default=time.strftime('%Y-%m-%d'))
    a = ap.parse_args(); raw = a.raw
    lex = json.load(open(os.path.join(root, 'data', 'product_lexicon.json'), encoding='utf-8'))
    ext = json.load(open(os.path.join(root, 'data', 'medterm_ext.json'), encoding='utf-8'))
    std = csv_rows(os.path.join(raw, 'hira_std', 'raw.bin')); ing = csv_rows(os.path.join(raw, 'hira_ing', 'raw.bin'))

    # 1) 품목 모으기 — 품목기준코드는 같은 허가 품목을 여러 업체·이름이 함께 쓰는 경우가 있어(양도양수·공동 판매 등; 이 자료에서 6,977개 코드) 코드만으로는 제품이 구별되지 않는다.
    #    그래서 제품 열쇠를 (품목기준코드, 품목명, 업체명) 으로 한다. 이전 자료(ext)의 '품목 수'는 품목기준코드 단위여서 이보다 적다.
    by = collections.OrderedDict(); excluded = collections.Counter(); cancelled = 0; pk_all = set()
    for r in sorted(std, key=lambda r: (r['품목기준코드'].strip(), r['한글상품명'].strip(), r['업체명'].strip(), r['표준코드'].strip())):
        if (r['취소일자'] or '').strip(): cancelled += 1; continue
        kind = (r['전문일반구분'] or '').strip()
        if kind not in KEEP: continue
        pk_all.add(r['품목기준코드'].strip())
        by.setdefault((r['품목기준코드'].strip(), r['한글상품명'].strip(), r['업체명'].strip()), []).append(r)
    ex_pk = collections.defaultdict(set)
    for r in std:
        kind = (r['전문일반구분'] or '').strip()
        if kind not in KEEP and not (r['취소일자'] or '').strip(): ex_pk[kind].add((r['품목기준코드'].strip(), r['한글상품명'].strip(), r['업체명'].strip()))
    excluded = {EXCL_NAMES.get(k, k): len(v) for k, v in ex_pk.items()}

    # 2) 성분 구성표: 일반명코드 → (제형, [(일반명, 함량, 단위)])
    comp_rows = collections.defaultdict(list)
    for r in ing: comp_rows[r['일반명코드'].strip()].append(r)

    # 3) 이름 → 사전 항목: 단일 성분 코드에서 이미 정해진 연결(ext 의 hira_codes)만 쓴다
    code2ent = {}
    for e in ext['entities']:
        for c in e.get('hira_codes') or []: code2ent[c] = e['id']
    name2ent = {}; name_conf = set()
    for code, ent in code2ent.items():
        rows = comp_rows.get(code, [])
        if len({r['일반명'].strip() for r in rows}) != 1: continue
        n = rows[0]['일반명'].strip()
        if n in name2ent and name2ent[n] != ent: name_conf.add(n)
        name2ent.setdefault(n, ent)
    for n in name_conf: name2ent.pop(n, None)       # 서로 다른 항목에 걸린 이름은 연결하지 않는다

    # 4) 표 만들기
    co_ix = {}; atc_ix = {}; sp_ix = {}; cd_ix = {}; ing_ix = {}; un_ix = {}; fm_ix = {}
    def ix(d, k):
        if k not in d: d[k] = len(d)
        return d[k]
    P = []; cd_list = []; cmp_list = []; conflict_code = conflict_atc = 0; herbal = collections.Counter(); kinds = collections.Counter()
    for (pk, _nm, _co), rws in by.items():
        r = rws[0]
        codes = {(x['일반명코드(성분명코드)'] or '').strip() for x in rws} - {''}; atcs = {(x['국제표준코드(ATC코드)'] or '').strip() for x in rws} - {''}
        if len(codes) > 1: conflict_code += 1
        if len(atcs) > 1: conflict_atc += 1
        atc = (r['국제표준코드(ATC코드)'] or '').strip() or (sorted(atcs)[0] if atcs else '')
        name = r['한글상품명'].strip(); co = r['업체명'].strip(); kind = KEEP[(r['전문일반구분'] or '').strip()]
        gis = []
        for code in sorted(codes):          # 한 품목이 함량별로 일반명코드를 여러 개 갖는 경우가 있다(1,200여 품목) — 모두 담는다
            if code not in comp_rows: continue
            if code not in cd_ix:
                cd_ix[code] = len(cd_list); cd_list.append(code)
                rows = comp_rows[code]
                cmp_list.append([ix(fm_ix, (rows[0]['제형'] or '').strip()), [[ix(ing_ix, x['일반명'].strip()), (x['함량'] or '').strip(), ix(un_ix, (x['단위'] or '').strip())] for x in rows]])
            gis.append(cd_ix[code])
        gi = -1 if not gis else gis[0] if len(gis) == 1 else gis
        specs = []
        for x in rws:
            sp1 = (x['약품규격'] or '').strip()
            if sp1 not in ('', '없음', '0') and sp1 not in specs: specs.append(sp1)
        spec = ' / '.join(specs[:3]) + (' 외' if len(specs) > 3 else '')
        spc = (r['특수관리약품구분'] or '').strip(); spc = '' if spc in ('', '해당사항없음') else spc
        h = herbal_rule(name); herbal[h] += 1; kinds[kind] += 1
        P.append([pk, name, ix(co_ix, co), kind, gi, ix(atc_ix, atc) if atc else -1, ym(r['품목허가일자']), h, spec, ix(sp_ix, spc) if spc else -1])

    inv = lambda d: [k for k, _ in sorted(d.items(), key=lambda kv: kv[1])]
    ing_names = inv(ing_ix)
    out = {
        'meta': {
            'name': 'MedTerm-KR 국내 제품(품목) 계층', 'version': app_version(), 'built_at': a.built_at, 'review_status': 'draft',
            'notice': '심평원 공개 자료로 만든 초안입니다. 약사 검수 전이며, 한약제제·묶음 표시는 이름·ATC 규칙으로 추정한 것입니다. 대체 후보는 같은 일반명코드 품목일 뿐 대체조제 가능 판정이 아닙니다(약사법 제27조). 허가·급여·처방 판단의 근거가 아닙니다.',
            'sources': [s for s in ext['meta']['sources'] if s['id'] == 'H'],
            'files': ext['meta'].get('files', {}),
            'counts': {'products': len(P), 'companies': len(co_ix), 'codes': len(cd_list), 'ingredient_names': len(ing_ix), 'atc': len(atc_ix), 'with_code': sum(1 for p in P if p[4] != -1), 'with_atc': sum(1 for p in P if p[5] >= 0),
                       'rx': kinds[0], 'otc': kinds[1], 'herbal_guess': sum(v for k, v in herbal.items() if k), 'herbal_by_rule': {str(k): v for k, v in sorted(herbal.items()) if k},
                       'linked_ingredient_names': sum(1 for n in ing_names if n in name2ent), 'distinct_item_codes': len(pk_all), 'cancelled_rows_skipped': cancelled, 'excluded_products': excluded,
                       'multi_code_products': sum(1 for r in P if isinstance(r[4], list)), 'conflict_atc_products': conflict_atc},
            'product_key': '품목기준코드 + 품목명 + 업체명(같은 품목기준코드를 여러 업체·이름이 함께 쓰므로)', 'fields': ['품목기준코드(제품 열쇠가 아님)', '품목명', '업체(co 색인)', '구분(0 전문·1 일반)', '성분 구성(cd 색인 하나 또는 색인 목록, -1 없음)', 'ATC(atc 색인, -1 없음)', '허가년월(YYYYMM)', '한약 추정 규칙(0 아님)', '규격', '특수관리(sp 색인, -1 없음)'],
            'herbal_rules': lex['herbal_rules'], 'groups': lex['groups'], 'symptoms': lex['symptoms'], 'notes': lex['notes'], 'lexicon_provenance': lex['_provenance'],
        },
        'co': inv(co_ix), 'atc': inv(atc_ix), 'sp': inv(sp_ix), 'fm': inv(fm_ix), 'un': inv(un_ix), 'ing': ing_names,
        'ing_ent': {str(i): name2ent[n] for i, n in enumerate(ing_names) if n in name2ent},
        'cd': cd_list, 'cmp': cmp_list, 'p': P,
    }
    txt = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    open(a.out, 'w', encoding='utf-8', newline='\n').write(txt)
    c = out['meta']['counts']
    print(f"품목 {c['products']} (전문 {c['rx']} · 일반 {c['otc']}) · 업체 {c['companies']} · 성분 구성 {c['codes']}개 · 한약 추정 {c['herbal_guess']} {c['herbal_by_rule']} · 일반명코드 있음 {c['with_code']} · ATC 있음 {c['with_atc']}")
    print('제외(제품 수):', excluded, '· 일반명코드가 여럿인 제품', c['multi_code_products'], '(원자료에서 코드가 달랐던 제품', conflict_code, ')', '· ATC 상이', conflict_atc, '· 사전 연결 성분명', c['linked_ingredient_names'], '/', c['ingredient_names'])
    print(f'{len(txt) / 1e6:.2f} MB')

if __name__ == '__main__': main()
