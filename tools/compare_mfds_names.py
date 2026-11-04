#!/usr/bin/env python
"""식약처 성분명 ↔ 심평원 일반명 이름 대조 — '두 자료를 한 레코드로 합칠 열쇠가 이름으로 얼마나 맞는가'를 먼저 재는 오프라인 도구.
 입력(모두 내려받아 둔 파일; 이 도구는 네트워크에 접속하지 않고 서비스키도 받지 않는다):
  --mfds  식약처 15098095(성분별 1일 최대투여량) 등에서 받은 CSV 또는 JSON. 필요한 열: 성분코드(CPNT_CD) · 한글 성분명(DRUG_CPNT_KOR_NM) · 영문 성분명(DRUG_CPNT_ENG_NM).
          열 이름은 대소문자·밑줄·카멜표기 차이를 무시하고 찾으며, 못 찾으면 --code-col/--kor-col/--eng-col 로 지정한다. 용량 열은 읽지 않는다.
  --hira  심평원 15067461(의약품주성분) CSV — 열: 일반명코드 · 일반명 (로그인 없이 받는 공개 파일)
  --ext   (선택) data/medterm_ext.json — 한글 이름 후보와의 대조에 쓴다. 기본값은 저장소의 data/medterm_ext.json(있으면)
 하는 일:
  ① 영문 이름 대응률 — 식약처 영문 성분명이 심평원 일반명과 어느 단계에서 맞는가: 정확 일치 · 규칙 일치(염·수화물·약어 규칙, 방향별) · 본체만 일치 · 불일치
  ② 한글 이름 대응률 — 식약처 한글 성분명이 (가) 심평원 일반명 중 한글이 든 것과 (나) 확장 사전의 한글 이름 후보와 정확히 같은 비율
  ③ 코드 관계 — 이름이 맞은 쌍에서 식약처 성분코드와 심평원 일반명코드가 같은 체계인지(같음 · 앞 6/4자리 같음 · 부분 포함 · 무관)
  ④ 불일치 상위 유형 — 못 맞춘 이름의 유형별 건수와 상위 목록(--tsv-unmatched 로 전체 저장)
 이름이 같다는 것은 같은 성분이라는 약사 판정이 아니다. 받은 파일은 읽기만 하며(실행하지 않음), 결과는 저장소 밖에서 처리하는 것을 권한다.
사용: python -I tools/compare_mfds_names.py --mfds 식약처.csv --hira 심평원_의약품주성분.csv [--ext data/medterm_ext.json] [--md 보고서.md] [--tsv-unmatched 불일치.tsv]"""
import argparse, collections, csv, io, json, os, re, sys
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
sys.path.insert(0, os.path.join(root, 'build'))
import ext_norm as N

csv.field_size_limit(10 ** 8)
HANGUL = re.compile(r'[가-힣]')
CAND_COLS = {'code': ['cpntcd', 'drugcpntcd', 'ingrcd', '성분코드'],
             'kor': ['drugcpntkornm', 'cpntkornm', 'ingrkornm', '성분명', '한글성분명', '성분한글명', '성분명한글'],
             'eng': ['drugcpntengnm', 'cpntengnm', 'ingrengnm', '영문성분명', '성분영문명', '성분명영문', '영문명']}


# ── 읽기 ──
def read_text(path):
    raw = open(path, 'rb').read()
    for enc in ('utf-8-sig', 'cp949'):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    raise SystemExit(f'{path}: 글자 인코딩을 읽지 못했습니다(UTF-8 또는 CP949)')


def colkey(s):
    return re.sub(r'[\s_\-]', '', str(s).lower())


def find_records(obj):
    """JSON 안에서 사전 목록(list of dict)을 찾는다(data.go.kr 응답의 body.items.item 같은 겹을 따라 내려감). 없으면 None."""
    if isinstance(obj, list):
        if obj and all(isinstance(x, dict) for x in obj):
            return obj
        for x in obj:
            r = find_records(x)
            if r:
                return r
    elif isinstance(obj, dict):
        for v in obj.values():
            r = find_records(v)
            if r:
                return r
    return None


def find_single(obj):
    """목록이 없고 레코드가 하나뿐인 응답: 성분명·코드 열 이름이 든 사전을 찾는다."""
    if isinstance(obj, dict):
        ks = {colkey(k) for k in obj}
        if any(colkey(c) in ks for cols in CAND_COLS.values() for c in cols):
            return [obj]
        for v in obj.values():
            r = find_single(v)
            if r:
                return r
    return None


def load_table(path):
    text = read_text(path)
    if path.lower().endswith('.json'):
        data = json.loads(text)
        rows = find_records(data) or find_single(data)
        if not rows:
            raise SystemExit(f'{path}: JSON 에서 레코드 목록을 찾지 못했습니다')
        return [{k: ('' if v is None else str(v)) for k, v in r.items()} for r in rows]
    return list(csv.DictReader(io.StringIO(text, newline='')))


def pick_col(rows, want, explicit):
    cols = list(rows[0].keys()) if rows else []
    if explicit:
        if explicit not in cols:
            raise SystemExit(f'열 "{explicit}" 이(가) 없습니다. 있는 열: {", ".join(cols)}')
        return explicit
    by = {colkey(c): c for c in cols}
    for k in CAND_COLS[want]:
        if colkey(k) in by:
            return by[colkey(k)]
    return None


def load_mfds(path, code_col=None, kor_col=None, eng_col=None):
    rows = load_table(path)
    if not rows:
        raise SystemExit(f'{path}: 행이 없습니다')
    c, k, e = pick_col(rows, 'code', code_col), pick_col(rows, 'kor', kor_col), pick_col(rows, 'eng', eng_col)
    if not (k or e):
        raise SystemExit(f'{path}: 성분명 열을 찾지 못했습니다. 있는 열: {", ".join(rows[0].keys())} → --kor-col/--eng-col 로 지정하세요')
    seen = {}
    for r in rows:
        code = (r.get(c) or '').strip() if c else ''; kor = (r.get(k) or '').strip() if k else ''; eng = (r.get(e) or '').strip() if e else ''
        if not (kor or eng):
            continue
        key = (code, kor, eng)
        seen[key] = seen.get(key, 0) + 1
    return {'rows': len(rows), 'cols': {'code': c, 'kor': k, 'eng': e}, 'ingredients': [{'code': a, 'kor': b, 'eng': d, 'n': n} for (a, b, d), n in seen.items()]}


def load_hira(path):
    rows = load_table(path)
    need = {'일반명코드', '일반명'} - set(rows[0].keys() if rows else [])
    if need:
        raise SystemExit(f'{path}: 열이 없습니다 — {", ".join(sorted(need))}')
    names = collections.defaultdict(set)
    for r in rows:
        n = (r['일반명'] or '').strip()
        if n:
            names[n].add((r['일반명코드'] or '').strip())
    return names


# ── 대조 ──
def build_index(hira):
    exact = collections.defaultdict(set); cand = collections.defaultdict(set); base = collections.defaultdict(set)
    for h in hira:
        exact[N.n0(h)].add(h)
        for k, rule in N.candidates(h)[1:]:
            cand[k].add((h, rule))
        base[N.basekey(h)].add(h)
    return exact, cand, base


def match_en(eng, idx):
    """(단계, 규칙, 심평원 일반명 집합). 단계: exact · rule_to_hira(식약처 이름을 규칙으로 줄여 맞음) · rule_from_hira(심평원 이름을 규칙으로 줄여 맞음) · base · none"""
    exact, cand, base = idx
    n = N.n0(eng)
    if n in exact:
        return 'exact', '', exact[n]
    for k, rule in N.candidates(eng)[1:]:
        if k in exact:
            return 'rule_to_hira', rule, exact[k]
    if n in cand:
        rules = sorted({r for _, r in cand[n]})
        return 'rule_from_hira', rules[0], {h for h, _ in cand[n]}
    b = N.basekey(eng)
    if b and b in base:
        return 'base', '', base[b]
    return 'none', '', set()


def code_relation(mcode, hcodes):
    """식약처 성분코드와 심평원 일반명코드의 관계: same · same6 · same4 · contained · none"""
    m = mcode.strip().upper()
    if not m:
        return 'nocode'
    best = 'none'
    order = ['none', 'contained', 'same4', 'same6', 'same']
    for h in hcodes:
        h = h.strip().upper()
        rel = 'same' if m == h else 'same6' if len(m) >= 6 and m == h[:6] else 'same4' if len(m) >= 4 and m == h[:4] else 'contained' if len(m) >= 4 and (m in h or h in m) else 'none'
        if order.index(rel) > order.index(best):
            best = rel
    return best


def kind_of(ing):
    n = N.n0(ing['eng']) if ing['eng'] else ''
    if not n:
        return '영문명 없음'
    if re.search(r'\bext(ract)?\b|엑스', n + ing['kor']):
        return '엑스·추출물'
    if re.search(r'\d', n):
        return '숫자·함량 포함'
    if '(' in n or '/' in n or ',' in n:
        return '괄호·복합 표기'
    if any(t in N.SALT or t in N.HYDRATE for t in n.split()):
        return '염·수화물 낱말 포함(규칙으로도 안 맞음)'
    return '그 밖(철자·동의어·한쪽에 없는 성분)'


def ext_korean(ext_path):
    """확장 사전의 한글 이름 후보(전부)와 염 꼬리를 뗀 이름. 파일이 없으면 None."""
    if not ext_path or not os.path.exists(ext_path):
        return None
    d = json.load(open(ext_path, encoding='utf-8'))
    full, base = set(), set()
    for e in d['entities']:
        for x in e.get('ko', []):
            full.add(x['n'])
        base.update(e.get('ko_base', []) if isinstance(e.get('ko_base'), list) else ([e['ko_base']] if e.get('ko_base') else []))
        base.update(e.get('ko_alias', []))
    return full, base, d['meta'].get('version')


def analyze(mfds, hira, extk):
    idx = build_index(hira)
    hira_ko = {h for h in hira if HANGUL.search(h)}
    ings = mfds['ingredients']
    # 같은 (코드, 한글, 영문) 은 이미 하나로 합쳐져 있음
    tiers = collections.Counter(); rules = collections.Counter(); rel = collections.Counter(); rel_ex = collections.defaultdict(list)
    unmatched = []; kinds = collections.Counter(); with_eng = 0
    ko_h = ko_e = ko_eb = ko_n = 0
    for ing in ings:
        if ing['eng']:
            with_eng += 1
            t, rule, hs = match_en(ing['eng'], idx)
            tiers[t] += 1
            if rule:
                rules[(t, rule)] += 1
            if t == 'none':
                unmatched.append(ing); kinds[kind_of(ing)] += 1
            else:
                hc = set().union(*(hira[h] for h in hs))
                r = code_relation(ing['code'], hc); rel[r] += 1
                if len(rel_ex[r]) < 4:
                    rel_ex[r].append((ing['code'], sorted(hc)[:3], ing['eng']))
        if ing['kor']:
            ko_n += 1
            if ing['kor'] in hira_ko:
                ko_h += 1
            if extk:
                if ing['kor'] in extk[0]:
                    ko_e += 1
                elif ing['kor'] in extk[1] or N.ko_base(ing['kor']) in extk[1]:
                    ko_eb += 1
    return {'rows': mfds['rows'], 'cols': mfds['cols'], 'ingredients': len(ings), 'with_eng': with_eng, 'with_kor': ko_n,
            'hira_names': len(hira), 'hira_hangul_names': len(hira_ko), 'tiers': dict(tiers), 'rules': {f'{a}/{b}': v for (a, b), v in rules.items()},
            'code_relation': dict(rel), 'code_examples': dict(rel_ex), 'ko_hira_hangul': ko_h, 'ko_ext_full': ko_e, 'ko_ext_base': ko_eb, 'ext': bool(extk),
            'ext_version': extk[2] if extk else None, 'unmatched': unmatched, 'unmatched_kinds': dict(kinds)}


# ── 보고서 ──
pc = lambda a, b: '—' if not b else f'{a / b * 100:.1f}%'
TIER = {'exact': '정확 일치(소문자·공백 정리 후)', 'rule_to_hira': '규칙 일치 — 식약처 이름을 줄여서 심평원 이름과 맞음', 'rule_from_hira': '규칙 일치 — 심평원 이름을 줄여서 식약처 이름과 맞음',
        'base': '본체만 일치(염·수화물이 서로 다름)', 'none': '불일치'}
RULE_DIR = {'rule_to_hira': '식약처 이름 축약', 'rule_from_hira': '심평원 이름 축약'}
REL = {'same': '같음(전체 9자리)', 'same6': '앞 6자리가 같음', 'same4': '앞 4자리가 같음', 'contained': '한쪽이 다른 쪽에 들어 있음', 'none': '무관', 'nocode': '식약처 성분코드 열 없음/빈 값'}


def md(r):
    L = ['# 식약처 성분명 ↔ 심평원 일반명 이름 대조', '',
         f'- 식약처 파일: {r["rows"]}행 → 서로 다른 성분 {r["ingredients"]}개(영문명 있음 {r["with_eng"]} · 한글명 있음 {r["with_kor"]}). 쓴 열: 코드 `{r["cols"]["code"]}` · 한글 `{r["cols"]["kor"]}` · 영문 `{r["cols"]["eng"]}`',
         f'- 심평원 일반명 {r["hira_names"]}개 중 한글이 든 것 {r["hira_hangul_names"]}개({pc(r["hira_hangul_names"], r["hira_names"])})',
         '- 이름이 같다는 것은 같은 성분이라는 약사 판정이 아닙니다. 아래 숫자는 이 파일 두 개에 대한 것입니다.', '',
         '## 1. 영문 이름 대응률 (식약처 영문 성분명 → 심평원 일반명)', '', '| 단계 | 성분 | 비율 |', '|---|---|---|']
    n = r['with_eng']; hit = 0
    for t in ('exact', 'rule_to_hira', 'rule_from_hira', 'base', 'none'):
        v = r['tiers'].get(t, 0); hit += v if t != 'none' else 0
        L.append(f'| {TIER[t]} | {v} | {pc(v, n)} |')
    L += [f'| **맞은 합계(불일치 제외)** | **{hit}** | **{pc(hit, n)}** |', '']
    if r['rules']:
        L += ['규칙 일치의 규칙별: ' + ', '.join(f'{RULE_DIR[k.split("/")[0]]}·{k.split("/")[1]} {v}' for k, v in sorted(r['rules'].items(), key=lambda x: (-x[1], x[0]))), '']
    L += ['## 2. 한글 이름 대응률', '', '| 비교 대상 | 성분 | 비율 |', '|---|---|---|',
          f'| 심평원 일반명 중 한글이 든 것과 정확히 같음 | {r["ko_hira_hangul"]} | {pc(r["ko_hira_hangul"], r["with_kor"])} |']
    if r['ext']:
        L += [f'| 확장 사전(v{r["ext_version"]})의 한글 이름 후보와 정확히 같음 | {r["ko_ext_full"]} | {pc(r["ko_ext_full"], r["with_kor"])} |',
              f'| 확장 사전의 염 꼬리를 뗀 이름과 같음(위에서 안 맞은 것 중) | {r["ko_ext_base"]} | {pc(r["ko_ext_base"], r["with_kor"])} |']
    else:
        L += ['| 확장 사전 대조 | (--ext 파일 없음) | — |']
    L += ['', '심평원 일반명은 대부분 영문이라 한글 정확일치는 구조적으로 낮을 수 있습니다. 한글 이름 후보는 심평원 품목명 괄호 표기와 Wikidata 에서 자동으로 뽑은 것이며 약사 검수 전입니다.', '',
          '## 3. 코드 관계 (영문 이름이 맞은 쌍)', '']
    tot = sum(r['code_relation'].values())
    if tot:
        L += ['| 관계 | 성분 | 비율 | 예 (식약처 코드 / 심평원 일반명코드 / 이름) |', '|---|---|---|---|']
        for k in ('same', 'same6', 'same4', 'contained', 'none', 'nocode'):
            v = r['code_relation'].get(k, 0)
            if v:
                ex = '; '.join(f'{a or "(빈 값)"} / {", ".join(b)} / {c}' for a, b, c in r['code_examples'].get(k, [])[:2])
                L.append(f'| {REL[k]} | {v} | {pc(v, tot)} | {ex} |')
        L += ['', '"같음" 이 대부분이면 두 코드가 같은 체계라는 단서이고, "무관" 이 대부분이면 코드로 합칠 수 없어 이름 기반 연결이 주 경로입니다(이름이 같은 쌍만 본 것이라 코드 체계가 다르다는 확정은 아닙니다).', '']
    else:
        L += ['이름이 맞은 쌍이 없습니다.', '']
    L += ['## 4. 불일치 상위 유형', '']
    if r['unmatched_kinds']:
        L += ['| 유형 | 성분 |', '|---|---|'] + [f'| {k} | {v} |' for k, v in sorted(r['unmatched_kinds'].items(), key=lambda x: -x[1])]
        L += ['', '상위 30개 (식약처 영문 성분명 / 한글):', ''] + [f'- {u["eng"]} / {u["kor"] or "—"}' for u in sorted(r['unmatched'], key=lambda u: (-u['n'], u['eng']))[:30]]
    else:
        L.append('불일치 없음.')
    return '\n'.join(L) + '\n'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--mfds', required=True); ap.add_argument('--hira', required=True)
    ap.add_argument('--ext', default=os.path.join(root, 'data', 'medterm_ext.json'))
    ap.add_argument('--code-col'); ap.add_argument('--kor-col'); ap.add_argument('--eng-col')
    ap.add_argument('--md', help='보고서를 Markdown 으로도 저장'); ap.add_argument('--tsv-unmatched', help='불일치 전체 목록을 TSV 로 저장')
    a = ap.parse_args()
    for p in (a.mfds, a.hira):
        if not os.path.exists(p):
            sys.exit(f'파일이 없습니다: {p}')
    res = analyze(load_mfds(a.mfds, a.code_col, a.kor_col, a.eng_col), load_hira(a.hira), ext_korean(a.ext))
    text = md(res)
    print(text)
    if a.md:
        open(a.md, 'w', encoding='utf-8', newline='\n').write(text)
    if a.tsv_unmatched:
        with open(a.tsv_unmatched, 'w', encoding='utf-8', newline='\n') as f:
            f.write('code\tkor\teng\ttype\n' + ''.join(f'{u["code"]}\t{u["kor"]}\t{u["eng"]}\t{kind_of(u)}\n' for u in sorted(res['unmatched'], key=lambda u: (-u['n'], u['eng']))))


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    main()
