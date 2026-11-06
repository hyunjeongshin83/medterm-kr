#!/usr/bin/env python3
"""핵심 사전의 한글 성분명·국내 상품명을 공개 자료(심평원 약가마스터 기반 확장 수록·국내 제품 자료)와 대조한다.

사용:  python3 -I tools/names_check.py [--json 결과.json]      (네트워크를 쓰지 않는다. 저장소의 data/*.json 만 읽는다)

무엇을 대조하나
  ① 성분 한글명(label_ko): 같은 RxCUI 의 확장 수록 항목이 가진 한글 이름(심평원 성분명·위키데이터)과 비교한다.
       exact  = 같은 이름이 있음
       salt   = 확장 쪽 이름이 핵심 사전의 이름으로 시작함(예: 메트포르민 ↔ 메트포르민염산염 — 심평원은 염 이름으로 적음)
       missing= 둘 다 아님(철자 확인 필요)
  ② 국내 상품명(brands_ko): 심평원 약가마스터 품목명 중 허가 취소가 아닌 품목에서 찾는다.
       ok-ingredient = 품목명이 상품명으로 시작하고(다음 글자가 제형·숫자·'(' 이거나 끝), 그 품목의 성분 구성에 이 성분이 들어 있음
       ok-name       = 위와 같되 성분 연결은 비어 있고 품목명에 이 성분의 한글 이름이 적혀 있음(예: 클라리틴정(로라타딘))
       none          = 찾지 못함(단종·급여 목록 밖일 수 있음 — 사전에 두지 않는다)

한계: 이것은 '자료 사이의 일치'를 보는 점검이다. 약사의 검수가 아니며, 식약처(MFDS) 허가 정보와의 대조도 아니다.
      심평원 약가마스터는 급여·비급여 목록 기반이어서 허가는 있으나 목록에 없는 제품은 'none' 이 될 수 있다.
"""
import argparse, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FORMS = set('정캡주액시산연겔크패좌점필에츄서현과환분스로폼')   # 상품명 다음에 오는 제형 글자(상품명이 더 긴 다른 이름의 앞부분인 경우를 거르기 위함)


def norm(s):
    return re.sub(r'\s+', '', s or '')


def load(root=ROOT):
    d = os.path.join(root, 'data')
    rd = lambda n: json.load(open(os.path.join(d, n), encoding='utf-8'))
    return rd('medterm.json'), rd('medterm_ext.json'), rd('medterm_kr_products.json')


def vtm_names(core, ext):
    by = {e['rxcui']: e for e in ext['entities']}
    out = []
    for c in core['concepts']:
        if c['type'] != 'VTM':
            continue
        e = by.get(c['rxcui'])
        kos = [k['n'] for k in (e or {}).get('ko', [])]
        n = norm(c['label_ko'])
        if not e:
            st = 'missing'
        elif any(norm(k) == n for k in kos):
            st = 'exact'
        elif any(norm(k).startswith(n) for k in kos):
            st = 'salt'
        else:
            st = 'missing'
        out.append(dict(rxcui=c['rxcui'], en=c['label_en'], ko=c['label_ko'], alt_ko=c.get('alt_ko', []), ext_ko=kos, status=st))
    return out


def brand_names(core, ext, prod):
    ING, ING_ENT, CMP, P = prod['ing'], prod['ing_ent'], prod['cmp'], prod['p']
    by = {e['rxcui']: e for e in ext['entities']}

    def ents(p):
        idx = p[4]
        if idx == -1:
            return set()
        return {ING_ENT[str(c[0])] for i in (idx if isinstance(idx, list) else [idx]) for c in CMP[i][1] if str(c[0]) in ING_ENT}

    pn = [(p, norm(p[1])) for p in P]
    out = []
    for c in core['concepts']:
        if c['type'] != 'VTM':
            continue
        ent = 'MT:VTM:' + c['rxcui']
        names = {norm(c['label_ko'])} | {norm(k['n']) for k in (by.get(c['rxcui']) or {}).get('ko', [])}
        for b in c.get('brands_ko', []):
            nb = norm(b)
            starts = [(p, s) for p, s in pn if s.startswith(nb) and (len(s) == len(nb) or s[len(nb)] in FORMS or s[len(nb)].isdigit() or s[len(nb)] == '(')]
            linked = [p for p, s in starts if ent in ents(p)]
            named = [p for p, s in starts if any(n and n in s for n in names)]
            st = 'ok-ingredient' if linked else ('ok-name' if named else 'none')
            ex = (linked or named or [None])[0]
            out.append(dict(vtm=c['label_ko'], en=c['label_en'], brand=b, status=st, n_products=len(linked or named), example=(ex[1] if ex else None)))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--json', help='결과를 JSON 으로도 저장')
    a = ap.parse_args()
    core, ext, prod = load()
    v, b = vtm_names(core, ext), brand_names(core, ext, prod)
    for r in v:
        print(f"[성분 {r['status']:7}] {r['en']} | {r['ko']} | 확장 쪽 이름: {', '.join(r['ext_ko'][:3])}")
    print()
    for r in b:
        print(f"[상품 {r['status']:13}] {r['vtm']} / {r['brand']} | 품목 {r['n_products']}건 | {r['example']}")
    cv = {s: sum(1 for r in v if r['status'] == s) for s in ('exact', 'salt', 'missing')}
    cb = {s: sum(1 for r in b if r['status'] == s) for s in ('ok-ingredient', 'ok-name', 'none')}
    print(f"\n성분 한글명 {len(v)}개: {cv}\n상품명 {len(b)}개: {cb}")
    if a.json:
        json.dump(dict(vtm=v, brand=b, summary=dict(vtm=cv, brand=cb)), open(a.json, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return 0 if cv['missing'] == 0 and cb['none'] == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
