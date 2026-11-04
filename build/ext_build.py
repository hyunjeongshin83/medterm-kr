#!/usr/bin/env python
"""확장 수록(ext) 사전 만들기 — data/medterm_ext.json
입력(공개 원자료, ext_fetch.py 로 받은 것): RxNorm 성분(IN)·정확 성분(PIN) 목록, Wikidata(RxCUI·ATC·한/영 이름), 심평원 약가마스터(주성분 15067461 · 의약품표준코드 15067462), RxClass ATC 분류명
출력: data/medterm_ext.json (+ data/medterm_ext_review.tsv: 사람이 확인할 상위 미매핑·후보 목록)
원칙
 - 모든 항목은 review_status=draft(약사 검수 전). 한글 이름은 추측해서 만들지 않는다 — ① 심평원 품목명 괄호 표기(예: "…정(에페리손염산염)")에서 많이 쓰인 것을 뽑거나 ② Wikidata 한국어 이름을 쓰며, 둘 다 '후보·미검수'로 표시한다.
 - 연결(RxNorm ↔ 심평원)은 이름 규칙으로만 하고 등급을 기록한다: (a) 이름 일치 + ATC 코드 7자리 일치 (b) 이름 일치만(ATC 근거가 한쪽에 없거나 4단계까지만 일치) (c) 후보(이름은 맞으나 ATC가 서로 달라 연결에 쓰지 않음) (d) 미매핑(심평원에만 있는 성분)
 - 사전의 핵심 수록분(data/medterm.json, 32개 성분)은 건드리지 않는다. 같은 RxCUI 가 핵심에 있으면 core=true 로 표시해 '국내 등재 현황' 보강용으로만 쓴다.
 - 취소된 품목(취소일자 있음)은 세지 않는다. 복합제 품목명은 상표 목록에 넣지 않는다(성분 한 가지짜리 품목만).
사용: python build/ext_build.py --raw <ext_fetch.py 저장폴더> [--out data/medterm_ext.json] [--no-net]"""
import argparse, collections, concurrent.futures as cf, csv, difflib, hashlib, io, json, os, re, sys, time, unicodedata
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
sys.path.insert(0, here)
import ext_norm as N
from ext_fetch import RXNAV, http_get

csv.field_size_limit(10 ** 8)
HANGUL = re.compile(r'[가-힣]')
HIRA_CODE = re.compile(r'[0-9A-Z]{6}[A-Z]{3}')                                    # 심평원 일반명코드 9자리 = 6자리 번호(일부는 앞 1자리가 영문) + 투여 구분 영문 1자리(A 내복·B 주사·C 외용·D 기타; 원자료 59,631행 중 59,619행 일치) + 제형 영문 2자리(제형구분코드와 전 행 일치). 번호의 앞 4자리는 성분 식별자가 아니다(같은 약이 여러 앞자리를 쓰고, 다른 약이 앞자리를 공유한다). 번호의 공식 정의는 확인하지 못했다
KO_ONLY = re.compile(r'^[가-힣]{2,30}$')
HERBAL = re.compile(r'[가-힣·]')                                              # 이름에 한글·가운뎃점(혼합 표기)이 들어 있는 심평원 전용 항목(한약 엑스제·혼합 제제 등)
KO_BLOCK = ('수출', '별치', '분말', '주사', '외용', '내복', '기타')
KO_DESC = {'미분화', '미세', '유전자재조합', '단클론항체유전자재조합', '바이알', '앰플', '프리필드', '환원형', '산화형', '라이트', '수출용', '무수물', '결정형'}   # 성분 이름이 아니라 가공·포장·형태를 나타내는 괄호 낱말           # 성분 이름이 아닌 괄호 주석
FORM_SUFFIX = sorted([
    '장용필름코팅정', '서방필름코팅정', '필름코팅정', '구강붕해필름', '구강붕해정', '서방정', '장용정', '츄어블정', '저작정', '발포정', '설하정', '분산정', '나정', '정',
    '장용성연질캡슐', '서방성캡슐', '장용캡슐', '서방캡슐', '연질캡슐', '경질캡슐', '캡슐', '건조시럽', '시럽', '현탁액', '점안액', '점이액', '점비액', '주사액', '내복액',
    '액', '주', '산', '세립', '과립', '크림', '연고', '겔', '로션', '패취', '패치', '좌제', '질정', '분무액', '엘릭서', '산제', '환', '필름',
], key=len, reverse=True)
COMPANY_TAIL = ('제약공업', '제약', '약품', '바이오제약', '바이오팜', '바이오', '헬스케어', '생명과학', '파마', '팜', '화학', '메디칼', '사이언스', '코리아', '한국')

def rd(path): return open(path, 'rb').read()

def csv_rows(path):
    return list(csv.DictReader(io.StringIO(rd(path).decode('cp949'), newline='')))

def sparql(path):
    out = collections.defaultdict(set)
    for b in json.loads(rd(path))['results']['bindings']:
        k = [x for x in b if x != 'rxcui'][0]
        out[b['rxcui']['value']].add(b[k]['value'])
    return out

def company_short(name):
    s = re.sub(r'\(.*?\)|㈜|주식회사', '', name).strip()
    for _ in range(2):
        for t in COMPANY_TAIL:
            if s.endswith(t) and len(s) > len(t) + 1:
                s = s[:-len(t)]; break
    return s

def brand_stem(name):
    """품목명에서 상표 부분만: 괄호와 첫 숫자 뒤를 버리고 끝의 제형 낱말을 뗀다(검색 키용). 못 구하면 None."""
    s = re.sub(r'\([^)]*\)', '', name)
    s = re.split(r'[\d\[]', s)[0].strip(' _-.,/·')
    for suf in FORM_SUFFIX:
        if s.endswith(suf) and len(s) - len(suf) >= 2:
            s = s[:-len(suf)]; break
    s = s.strip(' _-.,/·')
    return s if 2 <= len(s) <= 20 and HANGUL.search(s) else None

def slug(base, taken):
    s = unicodedata.normalize('NFKD', base).encode('ascii', 'ignore').decode()
    s = re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')[:40]
    if not s or s in taken:
        s = (s + '_' if s else '') + hashlib.sha1(base.encode('utf-8')).hexdigest()[:6]
    taken.add(s); return s

class E:
    def __init__(s, rxcui, base):
        s.rxcui, s.base = rxcui, base
        s.names = collections.Counter(); s.rules = collections.Counter(); s.codes = set(); s.ing_rows = []
        s.items_single = {}; s.items_combo = set(); s.atc = collections.Counter(); s.ko = collections.Counter(); s.cand = None; s.grade = None; s.atc_chk = '-'; s.single_codes = set()

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--raw', required=True); ap.add_argument('--out', default=os.path.join(root, 'data', 'medterm_ext.json'))
    ap.add_argument('--review', default=os.path.join(root, 'data', 'medterm_ext_review.tsv'))
    ap.add_argument('--no-net', action='store_true', help='PIN→IN 관계를 캐시(pin_in.json)에서만 읽는다')
    ap.add_argument('--brands-per', type=int, default=10); ap.add_argument('--strengths-per', type=int, default=16)
    ap.add_argument('--built-at', default=time.strftime('%Y-%m-%d')); ap.add_argument('--dropped', help='제외한 심평원 전용 성분 목록을 이 경로에 TSV 로 쓴다(검토용)')
    a = ap.parse_args(); raw = a.raw
    core = json.load(open(os.path.join(root, 'data', 'medterm.json'), encoding='utf-8'))
    core_rx = {c['rxcui'] for c in core['concepts'] if c['type'] == 'VTM'}

    # 1) 원자료 읽기
    rx = lambda fn: json.loads(rd(os.path.join(raw, fn)))['minConceptGroup']['minConcept']
    IN_NAME = {c['rxcui']: c['name'] for c in rx('rx_in.json')}; IN = {N.n0(n): r for r, n in IN_NAME.items()}
    PIN_NAME = {c['rxcui']: c['name'] for c in rx('rx_pin.json')}; PIN = {N.n0(n): r for r, n in PIN_NAME.items()}
    WDATC = sparql(os.path.join(raw, 'wd_atc.json'))
    def _qnum(u):   # 같은 RxCUI 에 Wikidata 항목이 여럿이면 번호가 가장 작은(가장 오래된) 항목을 쓴다 — 집합의 순서에 기대면 만들 때마다 값이 달라진다
        t = u.rsplit('/', 1)[-1]
        return (int(t[1:]) if t[:1] == 'Q' and t[1:].isdigit() else 10 ** 18, t)
    WDITEM = {k: min(v, key=_qnum).rsplit('/', 1)[-1] for k, v in sparql(os.path.join(raw, 'wd_items.json')).items()}
    WDKO = sparql(os.path.join(raw, 'wd_ko_label.json')); WDKOA = sparql(os.path.join(raw, 'wd_ko_alias.json'))
    syn = collections.defaultdict(set)
    for fn in ('wd_en_label.json', 'wd_en_alias.json'):
        for rxcui, vals in sparql(os.path.join(raw, fn)).items():
            if rxcui in IN_NAME or rxcui in PIN_NAME:
                for v in vals: syn[N.n0(v)].add(rxcui)
    ing = csv_rows(os.path.join(raw, 'hira_ing', 'raw.bin')); std = csv_rows(os.path.join(raw, 'hira_std', 'raw.bin'))
    meta_of = lambda d: json.load(open(os.path.join(raw, d, 'meta.json'), encoding='utf-8')) if os.path.exists(os.path.join(raw, d, 'meta.json')) else {}
    ing_meta, std_meta = meta_of('hira_ing'), meta_of('hira_std')
    fl_path = os.path.join(raw, 'fetch_log.json')   # ext_fetch.py 가 파일을 받을 때마다 받은 날을 적는 기록(없으면 받은 날은 비움)
    fetch_log = json.load(open(fl_path, encoding='utf-8')) if os.path.exists(fl_path) else {}
    def file_meta(d, m, pk):   # 파일 이름·기준일은 내려받을 때 적어 둔 것만 쓰고(없으면 비움), 크기·SHA-256 은 받은 파일에서 직접 계산한다
        b = rd(os.path.join(raw, d, 'raw.bin'))
        return {'pk': pk, 'filename': m.get('filename'), 'file_date': m.get('file_date'), 'portal': m.get('portal'), 'fetched': m.get('fetched') or fetch_log.get(d + '/raw.bin'), 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}
    hira_files = {'hira_ing': file_meta('hira_ing', ing_meta, '15067461'), 'hira_std': file_meta('hira_std', std_meta, '15067462')}
    atc_cls = {c['classId']: c['className'] for c in json.loads(rd(os.path.join(raw, 'rx_atc_classes.json')))['rxclassMinConceptList']['rxclassMinConcept']}

    code_rows = collections.defaultdict(list)
    for r in ing: code_rows[r['일반명코드'].strip()].append(r)
    single = {c for c, rws in code_rows.items() if len({N.basekey(r['일반명'].strip()) for r in rws}) == 1}
    items = {}
    for x in std:
        if (x['취소일자'] or '').strip(): continue
        code = (x['일반명코드(성분명코드)'] or '').strip()
        if not code or code not in code_rows: continue
        k = x['품목기준코드'].strip()
        if k not in items: items[k] = {'name': x['한글상품명'].strip(), 'co': x['업체명'].strip(), 'atc': (x['국제표준코드(ATC코드)'] or '').strip(), 'code': code}
    print(f'주성분 코드 {len(code_rows)} (단일성분 {len(single)}) · 유효 품목 {len(items)}')

    # 2) 이름 → RxNorm
    names = sorted({r['일반명'].strip() for r in ing})
    cache = os.path.join(raw, 'pin_in.json'); pin_in = json.load(open(cache, encoding='utf-8')) if os.path.exists(cache) else {}
    match = {}
    for n in names:
        for k, rule in N.candidates(n):
            if k in IN: match[n] = ('IN', rule, IN[k]); break
            if k in PIN: match[n] = ('PIN', rule, PIN[k]); break
            s = syn.get(k)
            if s and len(s) == 1:
                r0 = next(iter(s)); match[n] = ('IN' if r0 in IN_NAME else 'PIN', 'syn/' + rule, r0); break
    need = sorted({m[2] for m in match.values() if m[0] == 'PIN' and m[2] not in pin_in})
    if need and not a.no_net:
        print('PIN→IN 관계 조회', len(need))
        def rel(p):
            try:
                d = json.loads(http_get(f'{RXNAV}/rxcui/{p}/related.json?tty=IN', {'Accept': 'application/json'}))
                return p, [c['rxcui'] for g in (d['relatedGroup'].get('conceptGroup') or []) for c in g.get('conceptProperties', [])]
            except Exception: return p, None
        with cf.ThreadPoolExecutor(4) as ex:
            for p, ins in ex.map(rel, need):
                if ins is not None: pin_in[p] = ins
        json.dump(pin_in, open(cache, 'w', encoding='utf-8'))
        fetch_log['pin_in.json'] = time.strftime('%Y-%m-%d')   # 캐시를 새로 채운 날 — 받은 날 기록에 함께 적는다
        json.dump(fetch_log, open(fl_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, sort_keys=True)
    def resolve(m):
        via, rule, rid = m
        if via == 'IN': return rid
        ins = pin_in.get(rid); return ins[0] if ins and len(ins) == 1 else None
    resolved = {n: resolve(m) for n, m in match.items()}

    # 3) 성분 묶기
    ents = {}
    def key_of(name):
        rid = resolved.get(name)
        return ('rx', rid) if rid else ('kr', N.basekey(name))
    def get(key):
        if key not in ents: ents[key] = E(key[1] if key[0] == 'rx' else None, key[1] if key[0] == 'kr' else None)
        return ents[key]
    code_ent = collections.defaultdict(set)
    for code, rws in code_rows.items():
        for r in rws:
            n = r['일반명'].strip(); key = key_of(n); e = get(key)
            e.names[n] += 1; e.codes.add(code); code_ent[code].add(key)
            if code in single: e.ing_rows.append(r); e.single_codes.add(code)
            if n in match: e.rules[match[n][1] + '/' + match[n][0]] += 1
    for k, it in items.items():
        keys = code_ent[it['code']]
        if it['code'] in single and len(keys) == 1: ents[next(iter(keys))].items_single[k] = it
        else:
            for key in keys: ents[key].items_combo.add(k)
    for e in ents.values():
        for k, it in e.items_single.items():
            if it['atc']: e.atc[it['atc']] += 1
            for m in {m.strip() for m in re.findall(r'\(([^()]*)\)', it['name'])}:
                if KO_ONLY.match(m) and not m.startswith(KO_BLOCK) and m not in KO_DESC: e.ko[m] += 1
    # 품목명 괄호에서 뽑은 한글 이름이 서로 다른 성분 4개 이상에 걸쳐 나오면 성분 이름이 아니라 가공·포장 낱말이다 → 모두 뺀다
    _kc = collections.Counter(n for e in ents.values() for n in e.ko)
    _generic = {n for n, c in _kc.items() if c >= 4}
    for e in ents.values():
        for n in _generic: e.ko.pop(n, None)
    if _generic: print('여러 성분에 걸쳐 나와 뺀 괄호 낱말:', ', '.join(sorted(_generic)))

    # 4) 등급. ATC 가 서로 다른 것은 '틀렸다'는 근거가 아니다(WHO 가 2018 년에 L01X→L01E 처럼 분류를 옮겼는데 Wikidata 에는 옛 코드가 남아 있음).
    #    그래서 ATC 일치는 '가산 근거'로만 쓰고, 이름 연결이 약한 경로(동의어·염 떼기·양이온 떼기)이면서 ATC 대분류(앞 3자리)도 전혀 안 맞을 때만 (c) 후보로 내린다.
    WEAK = ('syn/', 'desalt/', 'decat/')
    for key in list(ents):
        e = ents[key]
        if key[0] != 'rx': e.grade = 'd'; continue
        h7 = {c for c in e.atc if len(c) == 7}; w7 = {c for c in WDATC.get(e.rxcui, ()) if len(c) == 7}
        chk = '-'
        if h7 and w7:
            if h7 & w7: chk = '7'
            elif {c[:5] for c in h7} & {c[:5] for c in w7}: chk = '5'
            elif {c[:3] for c in h7} & {c[:3] for c in w7}: chk = '3'
            else: chk = 'x'
        e.atc_chk = chk
        weak_only = bool(e.rules) and all(k.startswith(WEAK) for k in e.rules)
        if chk == '7': e.grade = 'a'
        elif chk == 'x' and weak_only:
            e.grade = 'c'
            cand = {'rxcui': e.rxcui, 'name': IN_NAME.get(e.rxcui)}
            bk = N.basekey(max(e.names, key=e.names.get)); k2 = ('kr', bk); e2 = get(k2)
            for n, c in e.names.items(): e2.names[n] += c
            e2.codes |= e.codes; e2.single_codes |= e.single_codes; e2.ing_rows += e.ing_rows; e2.items_single.update(e.items_single); e2.items_combo |= e.items_combo
            e2.atc.update(e.atc); e2.ko.update(e.ko); e2.cand = cand; e2.grade = 'c'; e2.rules.update(e.rules); e2.atc_chk = 'x'
            del ents[key]
        else: e.grade = 'b'

    # 5) 출력 레코드
    taken = set(); recs = []; brand_total = 0
    def title(s): return s
    def ko_wd(rxcui, table):
        out = []
        for v in sorted(table.get(rxcui, ())):
            v = v.strip()
            if KO_ONLY.match(v) and v not in out: out.append(v)
        return out
    def build(key, e):
        n_single = len(e.items_single)
        rid = e.rxcui
        label_en = IN_NAME[rid] if rid else e.base
        # 한글 이름: 심평원 품목명 괄호 표기 투표 → Wikidata
        ko = []
        tot = n_single
        if e.ko:
            top = e.ko.most_common(1)[0][1]
            for n_, c in sorted(e.ko.items(), key=lambda kv: (-kv[1], kv[0]))[:6]:   # 같은 횟수면 이름순(항상 같은 순서로)
                if len(ko) >= 3: break
                if c >= (1 if tot <= 2 else 2) and c * 10 >= top and not any(x['n'] in n_ and x['n'] != n_ for x in ko): ko.append({'n': n_, 's': 'H', 'c': c})
        for w in (ko_wd(rid, WDKO) if rid else []):
            hit = next((x for x in ko if x['n'] == w), None)
            if hit: hit['s'] = 'HW'
            elif len(ko) < 6: ko.append({'n': w, 's': 'W'})
        ko_alias = [w for w in (ko_wd(rid, WDKOA) if rid else []) if w not in {x['n'] for x in ko}][:5]
        ko_names = {x['n'] for x in ko}
        bases = sorted({N.ko_base(n_) for n_ in ko_names if N.ko_base(n_) != n_} - ko_names)
        # ATC
        atc = []; src = {}
        for c, cnt in e.atc.most_common():
            if len(c) == 7 and len(atc) < 4: atc.append(c); src[c] = 'H'
        for c in sorted(WDATC.get(rid, ())) if rid else ():
            if len(c) == 7:
                if c in src: src[c] = 'HW'
                elif len(atc) < 8: atc.append(c); src[c] = 'W'
        atc_class = sorted({c for c in e.atc if len(c) < 7})[:4] if not any(len(c) == 7 for c in e.atc) else []
        # 상표(앞부분): 이 성분의 한글 이름을 포함하거나 회사 이름으로 시작하는 것은 뺀다
        stems = collections.defaultdict(set)
        skip = [x for x in (ko_names | set(bases)) if len(x) >= 3]
        for k_, it in e.items_single.items():
            st = brand_stem(it['name'])
            if not st or any(x in st for x in skip): continue
            cs = company_short(it['co'])
            if len(cs) >= 2 and st.startswith(cs): continue
            stems[st].add(k_)
        brands = [s_ for s_, v in sorted(stems.items(), key=lambda kv: (-len(kv[1]), kv[0]))][:a.brands_per]
        # 국내 등재 현황(제형·투여·함량) — 단일성분 코드만
        forms = collections.Counter(re.sub(r'\s+', '', r['제형']) for r in e.ing_rows if r['제형'].strip())
        routes = sorted({r['투여'].strip() for r in e.ing_rows if r['투여'].strip()})
        def numkey(s_):
            m = re.match(r'[\d.]+', s_); return (float(m.group()) if m and m.group().count('.') <= 1 else 1e18, s_)
        sts = sorted({(r['함량'].strip() + ' ' + r['단위'].strip()).strip() for r in e.ing_rows if r['함량'].strip()}, key=numkey)
        kr = None
        if e.codes:
            kr = {'items': n_single, 'combo': len(e.items_combo), 'codes': len(e.single_codes),
                  'forms': [f for f, _ in forms.most_common(6)], 'routes': routes,
                  'strengths': sts[:a.strengths_per], 'n_strengths': len(sts)}
        alt_en, seen_k = [], {N.clean_key(label_en)}
        for n_, _ in e.names.most_common():
            k_ = N.clean_key(n_)
            if HANGUL.search(n_) or k_ in seen_k or N.n0(n_) == N.n0(label_en): continue
            seen_k.add(k_); alt_en.append(n_)
        rec = {'id': f'MT:VTM:{rid}' if rid else None, 'rxcui': rid, 'label_en': label_en, 'alt_en': alt_en[:6]}
        if ko: rec['ko'] = ko
        if bases: rec['ko_base'] = bases[:4]
        if ko_alias: rec['ko_alias'] = ko_alias
        if atc: rec['atc'] = atc; rec['atc_src'] = src
        if atc_class: rec['atc_class'] = atc_class
        if brands: rec['brands_ko'] = brands
        if kr: rec['kr'] = kr
        rec['grade'] = e.grade
        rec['src'] = ('R' if rid else '') + ('H' if e.codes else '') + ('W' if rid and rid in WDITEM else '')
        cds = sorted(c for c in e.single_codes if HIRA_CODE.fullmatch(c))   # 출처 추적용: 단일성분 일반명코드 전체(9자리). 복합제 코드는 넣지 않는다. 코드 앞 4자리는 성분 식별자가 아니라서(같은 약이 여러 앞자리를 쓰고 다른 약이 앞자리를 공유함) 쓰지 않는다.
        if cds: rec['hira_codes'] = cds
        if rid and e.rules: rec['map'] = {'rule': e.rules.most_common(1)[0][0], 'atc': e.atc_chk}
        if e.cand: rec['cand'] = e.cand
        if rid in WDITEM: rec['wd'] = WDITEM[rid]
        if rid in core_rx: rec['core'] = True
        rec['review_status'] = 'draft'
        return rec, len(stems)
    inc = collections.Counter(); dropped = []
    for key, e in ents.items():
        n_single = len(e.items_single)
        if key[0] == 'kr':
            if not (n_single >= 1 or len(e.items_combo) >= 3): inc['kr_drop'] += 1; dropped.append((key[1], n_single, len(e.items_combo), len(e.codes), ','.join(c for c, _ in e.atc.most_common(2)), '; '.join(list(e.names)[:2]))); continue
            if HERBAL.search(key[1]):        # 한글 이름뿐인 한약 엑스제·'·'로 이은 혼합 제제: 성분 단위 사전에 맞지 않고 이름이 불안정해 이번 범위에서는 뺀다(약사 검토로 별도 범위를 정한 뒤 추가). 라틴어 이름의 단일 추출물(예: ginkgo biloba leaf ext)은 남긴다
                inc['kr_herbal'] += 1; dropped.append((key[1], n_single, len(e.items_combo), len(e.codes), ','.join(c for c, _ in e.atc.most_common(2)), '한글명·혼합(·) 제제: ' + '; '.join(list(e.names)[:2]))); continue
        rec, nst = build(key, e)
        brand_total += len(rec.get('brands_ko', []))
        recs.append((key, rec))
    inc['kept'] = len(recs)
    if a.dropped:
        dropped.sort(key=lambda x: (-x[1], -x[3]))
        open(a.dropped, 'w', encoding='utf-8').write('base\titems_single\titems_combo\tcodes\tatc\tnames\n' + '\n'.join('\t'.join(str(v) for v in row) for row in dropped) + '\n')
    # 6) 심평원과 연결되지 않은 RxNorm 성분 중 ATC 가 있는 것(Wikidata) — 국내 미수록 또는 이름 매핑 실패
    have = {k[1] for k, _ in recs if k[0] == 'rx'} | {k[1] for k in ents if k[0] == 'rx'}
    rx_only = 0
    for rid in sorted(IN_NAME):
        if rid in have or rid in core_rx: continue
        atc = sorted(c for c in WDATC.get(rid, ()) if len(c) == 7)
        if not atc: continue
        rec = {'id': f'MT:VTM:{rid}', 'rxcui': rid, 'label_en': IN_NAME[rid], 'alt_en': []}
        ko = [{'n': w, 's': 'W'} for w in ko_wd(rid, WDKO)[:6]]
        ka = [w for w in ko_wd(rid, WDKOA) if w not in {x['n'] for x in ko}][:5]
        if ko: rec['ko'] = ko; b_ = sorted({N.ko_base(x['n']) for x in ko} - {x['n'] for x in ko})
        if ko and b_: rec['ko_base'] = b_[:4]
        if ka: rec['ko_alias'] = ka
        rec['atc'] = atc[:8]; rec['atc_src'] = {c: 'W' for c in atc[:8]}
        rec['grade'] = '-'; rec['src'] = 'RW' if rid in WDITEM else 'R'
        if rid in WDITEM: rec['wd'] = WDITEM[rid]
        rec['review_status'] = 'draft'
        recs.append((('rx', rid), rec)); rx_only += 1
    # 7) 아이디 부여(심평원 전용은 영문 기본키로 slug)
    for key, rec in recs:
        if rec['id'] is None: rec['id'] = 'MT:KRI:' + slug(key[1], taken)
    recs = sorted((r for _, r in recs), key=lambda r: (0 if r['rxcui'] else 1, int(r['rxcui']) if r['rxcui'] else 0, r['id']))
    ids = [r['id'] for r in recs]; assert len(ids) == len(set(ids)), '아이디 중복'
    # 검색 상자가 입력을 NFKC 로 정규화하므로, 사전의 이름도 같은 형태로 맞춘다(아니면 그 이름은 검색으로 찾을 수 없다). 정규화로 같아진 항목은 하나로 합친다.
    def nfkc(o):
        if isinstance(o, str): return unicodedata.normalize('NFKC', o)
        if isinstance(o, list):
            out_, seen_ = [], set()
            for x in (nfkc(y) for y in o):
                k_ = json.dumps(x, ensure_ascii=False, sort_keys=True)
                if k_ not in seen_: seen_.add(k_); out_.append(x)
            return out_
        if isinstance(o, dict): return {k: nfkc(v) for k, v in o.items()}
        return o
    recs = [nfkc(r) for r in recs]
    # 심평원에만 있는 성분 중 'RxNorm 성분과 ATC 코드(7자리)가 같고 영문 이름이 비슷한' 것은 같은 약의 다른 표기일 수 있다(철자 변형·염·USAN/INN 차이).
    # 다른 약일 수도 있어(예: tripegfilgrastim ↔ lipegfilgrastim) 자동으로 합치지 않고 near 힌트로만 남긴다 — 검수자가 확인한다.
    by_atc = collections.defaultdict(list)
    for r in recs:
        if r['rxcui']:
            for c in r.get('atc', []): by_atc[c].append(r)
    n_near = 0
    for r in recs:
        if r['rxcui'] or not r.get('atc'): continue
        best = {}
        for c in r['atc']:
            for o in by_atc.get(c, []):
                ratio = max(difflib.SequenceMatcher(None, r['label_en'], x).ratio() for x in [o['label_en']] + o.get('alt_en', []))
                if ratio >= 0.8 and ratio > best.get(o['id'], (0,))[0]: best[o['id']] = (ratio, o['label_en'], c)
        if best:
            r['near'] = [{'id': i, 'n': v[1], 'r': round(v[0], 2), 'atc': v[2]} for i, v in sorted(best.items(), key=lambda kv: -kv[1][0])[:2]]; n_near += 1
    # 8) 메타
    used_atc = set()
    for r in recs:
        for c in r.get('atc', []): used_atc |= {c[:1], c[:3], c[:4], c[:5]}
    atc_names = {c: atc_cls[c] for c in sorted(used_atc) if c in atc_cls}
    g = collections.Counter((r['grade'] or '-') for r in recs)
    # 출처마다 이용 조건을 기계가 읽을 수 있게 적는다(화면의 '출처·이용 조건'과 하단 표기가 이것을 읽는다).
    #  license_class: open(표기 의무 없음) · attribution(출처 표기 필요) · pending(재배포 조건 미결정 — 외부 공개 전에 결정해야 함)
    #  rec_url: 성분 한 개의 원자료로 가는 주소 틀({rxcui}·{wd}) · file_urls: 파일 자료의 포털 상세 페이지 · files: 이 출처에서 읽은 입력 파일(meta.files 의 키)
    srcs = [
        {'id': 'R', 'name': 'RxNorm (미국 NLM) — RxNav 공개 REST API', 'use': '성분(IN)·정확 성분(PIN) 이름과 RxCUI', 'license': 'RxNorm 이름·RXCUI 는 퍼블릭 도메인(NLM 표기 필요), NLM 보증 아님·최신 아닐 수 있음', 'license_tag': 'NLM 공개(표기 필요)', 'license_class': 'attribution',
         'credit': 'U.S. National Library of Medicine (NLM)', 'url': 'https://lhncbc.nlm.nih.gov/RxNav/', 'rec_url': RXNAV + '/rxcui/{rxcui}/properties.json', 'files': ['rx_in', 'rx_pin', 'pin_in']},
        {'id': 'H', 'name': '건강보험심사평가원 약가마스터 의약품주성분(15067461) · 의약품표준코드(15067462)', 'use': '국내 등재 성분·품목명·ATC(제품 단위)·제형·함량', 'license': '공공누리 제1유형(출처표시)', 'license_tag': '공공누리 제1유형', 'license_class': 'attribution',
         'credit': '건강보험심사평가원', 'url': 'https://www.data.go.kr/data/15067461/fileData.do', 'file_urls': {'hira_ing': 'https://www.data.go.kr/data/15067461/fileData.do', 'hira_std': 'https://www.data.go.kr/data/15067462/fileData.do'}, 'files': ['hira_ing', 'hira_std']},
        {'id': 'W', 'name': 'Wikidata (RxCUI P3345 · ATC P267 · 한/영 이름)', 'use': 'ATC 대조, 영문 동의어, 한국어 이름 후보', 'license': 'CC0', 'license_tag': 'CC0', 'license_class': 'open',
         'url': 'https://www.wikidata.org/', 'rec_url': 'https://www.wikidata.org/wiki/{wd}', 'files': ['wd_items', 'wd_atc', 'wd_en_label', 'wd_en_alias', 'wd_ko_label', 'wd_ko_alias']},
        {'id': 'A', 'name': 'RxClass ATC1-4 분류명 (RxNav)', 'use': 'ATC 1~4단계 분류 영문명', 'license': 'ATC 분류는 WHO 저작물 — 재배포 범위 미결정(핵심 수록분과 동일 보류 항목)', 'license_tag': '재배포 미결정(WHO ATC)', 'license_class': 'pending',
         'url': 'https://lhncbc.nlm.nih.gov/RxNav/', 'files': ['rx_atc_classes']},
    ]
    # 입력 파일 기록: 크기·SHA-256 은 파일에서 직접 계산하고, 받은 날은 fetch_log.json 에 있는 것만 적는다
    api_files = {}
    for k_, s_ in (('rx_in', 'R'), ('rx_pin', 'R'), ('pin_in', 'R'), ('rx_atc_classes', 'A'), ('wd_items', 'W'), ('wd_atc', 'W'), ('wd_en_label', 'W'), ('wd_en_alias', 'W'), ('wd_ko_label', 'W'), ('wd_ko_alias', 'W')):
        p_ = os.path.join(raw, k_ + '.json')
        if os.path.exists(p_):
            b_ = rd(p_); api_files[k_] = {'src': s_, 'name': k_ + '.json', 'fetched': fetch_log.get(k_ + '.json'), 'bytes': len(b_), 'sha256': hashlib.sha256(b_).hexdigest()}
    if 'pin_in' in api_files: api_files['pin_in']['note'] = '빌드할 때 RxNav 에서 조회해 둔 정확 성분(PIN)→성분(IN) 관계(캐시)'
    out = {'meta': {
        'name': 'MedTerm-KR 확장 수록(ext)', 'version': '1.2.0', 'built_at': a.built_at, 'review_status': 'draft',
        'notice': '자동 수집·연결한 초안입니다. 약사 검수 전이며, 한글 이름은 후보입니다. 국내 허가·급여·처방 판단의 근거가 아닙니다.',
        'grade_legend': {'a': '이름 일치 + ATC 코드(7자리) 일치', 'b': '이름 일치(ATC 근거가 한쪽에 없거나 4단계까지만 일치)', 'c': '후보(이름은 맞으나 ATC가 서로 달라 연결에 쓰지 않음)', 'd': '미매핑(심평원에만 있는 성분)', '-': '심평원과 연결되지 않은 RxNorm 성분(ATC 보유)'},
        'src_legend': {s['id']: s['name'] for s in srcs}, 'sources': srcs,
        'counts': {'entities': len(recs), 'grades': dict(sorted(g.items())), 'rx_mapped': sum(1 for r in recs if r['rxcui'] and 'H' in r['src']), 'rx_only': rx_only,
                   'kr_only': sum(1 for r in recs if not r['rxcui']), 'core_overlap': sum(1 for r in recs if r.get('core')),
                   'with_ko': sum(1 for r in recs if r.get('ko')), 'with_brands': sum(1 for r in recs if r.get('brands_ko')), 'brand_names': brand_total,
                   'with_atc': sum(1 for r in recs if r.get('atc')), 'with_hira_codes': sum(1 for r in recs if r.get('hira_codes')), 'active_items': len(items), 'hira_codes': len(code_rows), 'with_near': n_near, 'dropped_kr_only': inc['kr_drop'], 'dropped_herbal': inc['kr_herbal']},
        'atc_names': atc_names,
        'files': {**hira_files, **api_files},
        **({'fetch_note': fetch_log['_note']} if fetch_log.get('_note') else {}),
    }}
    with open(a.out, 'w', encoding='utf-8', newline='\n') as f:
        f.write('{"meta":' + json.dumps(out['meta'], ensure_ascii=False, separators=(',', ':')) + ',\n"entities":[\n')
        f.write(',\n'.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in recs)); f.write('\n]}\n')
    print(json.dumps(out['meta']['counts'], ensure_ascii=False)); print('쓰기 완료', a.out, os.path.getsize(a.out), 'bytes')
    # 9) 검토 목록(상위 미매핑·후보)
    inn = sorted(IN)
    lines = ['id\tlabel_en\tgrade\titems\tatc\tko\tcand_or_suggest']
    top = sorted([r for r in recs if r['grade'] in ('c', 'd')], key=lambda r: -(r.get('kr') or {}).get('items', 0))[:400]
    for r in top:
        sug = r.get('cand', {}).get('name') or ', '.join(difflib.get_close_matches(N.n0(r['label_en']), inn, n=2, cutoff=0.86))
        lines.append('\t'.join([r['id'], r['label_en'], r['grade'], str((r.get('kr') or {}).get('items', 0)), ','.join(r.get('atc', [])[:2]), ','.join(x['n'] for x in r.get('ko', [])[:2]), sug or '']))
    open(a.review, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
    print('검토 목록', a.review, len(lines) - 1)

if __name__ == '__main__':
    main()
