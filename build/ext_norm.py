"""영문 성분명 정규화 규칙 (확장 수록용) — 심평원 약가마스터의 영문 일반명을 RxNorm 성분(IN)·정확 성분(PIN) 이름과 맞추기 위한 규칙.
 - 추측하지 않는다: 규칙으로 같아진 이름만 연결하고, 못 맞추면 '미매핑'으로 남긴다.
 - candidates(name) 은 (키, 규칙이름) 목록을 '구체적인 것 → 덜 구체적인 것' 순으로 돌려준다.
   규칙이름: exact(소문자·공백 정리만) · moiety("(as X)" 표기의 X) · clean(약어 풀기·괄호/잡단어 제거) · desalt(염·수화물 꼬리 떼기)
 - 이 파일은 표준 라이브러리만 쓴다."""
import re, unicodedata

ABBR = {  # 약어 → 풀어 쓴 말 (토큰 단위로만 바꾼다)
    'hcl': 'hydrochloride', 'hbr': 'hydrobromide', 'hydrochlorid': 'hydrochloride', 'hydrochlorde': 'hydrochloride',
    'sulphate': 'sulfate', 'na': 'sodium', 'k': 'potassium',
}
NOISE = {  # 이름 뒤에 붙는 제조·상태 설명 — 성분 자체를 바꾸지 않는 말
    'micronized', 'micronised', 'dried', 'encapsulated', 'coated', 'enteric', 'crystalline', 'purified', 'fine', 'powder', 'granule',
    'granules', 'concentrate', 'concentrated', 'conc.', 'conc', 'solution', 'liquid', 'stabilized', 'lyophilized', 'sterile',
}
HYDRATE = {  # 수화물 표기
    'hydrate', 'monohydrate', 'dihydrate', 'trihydrate', 'tetrahydrate', 'pentahydrate', 'hexahydrate', 'heptahydrate',
    'octahydrate', 'nonahydrate', 'decahydrate', 'hemihydrate', 'sesquihydrate', 'anhydrous', 'anhydride', 'hemipentahydrate',
}
SALT = {  # 염·에스테르 꼬리(성분 본체가 아닌 짝이온)
    'hydrochloride', 'dihydrochloride', 'hydrobromide', 'sulfate', 'bisulfate', 'phosphate', 'diphosphate', 'acetate', 'maleate',
    'tartrate', 'bitartrate', 'citrate', 'succinate', 'fumarate', 'hemifumarate', 'mesylate', 'besylate', 'tosylate', 'napsylate',
    'nitrate', 'oxalate', 'bromide', 'chloride', 'iodide', 'sodium', 'potassium', 'calcium', 'magnesium', 'lactate', 'gluconate',
    'valerate', 'propionate', 'dipropionate', 'butyrate', 'palmitate', 'stearate', 'benzoate', 'salicylate', 'hyaluronate', 'pamoate',
    'embonate', 'hemimalate', 'malate', 'camsylate', 'edisylate', 'esylate', 'isethionate', 'lactobionate', 'mucate', 'orotate',
    'decanoate', 'enanthate', 'cypionate', 'furoate', 'trifenatate', 'axetil', 'proxetil', 'medoxomil', 'hexetil', 'pivoxil',
    'disoproxil', 'dimesylate', 'tromethamine', 'trometamol', 'meglumine', 'olamine', 'diolamine',
    'lysine', 'arginine', 'carbonate', 'bicarbonate', 'hydrogen', 'dihydrogen', 'propanediol', 'hemisulfate', 'sesquisulfate',
    'monohydrochloride', 'trihydrochloride', 'tetrahydrochloride', 'dimaleate', 'ditartrate', 'disodium', 'dipotassium',
}
# 이 낱말만 남게 되면(=짝이온만 남음) 떼지 않는다 — 성분 본체가 아니므로 잘못 연결될 수 있다
BARE = {
    'calcium', 'sodium', 'potassium', 'magnesium', 'zinc', 'iron', 'ferrous', 'ferric', 'aluminum', 'aluminium', 'copper', 'cupric',
    'manganese', 'lithium', 'ammonium', 'chloride', 'sulfate', 'phosphate', 'acetate', 'nitrate', 'carbonate', 'bicarbonate', 'oxide',
    'hydroxide', 'acid', 'citrate', 'lactate', 'gluconate', 'bromide', 'iodide', 'silver', 'barium', 'cobalt', 'selenium', 'chromium',
}

CATION = {'sodium', 'potassium', 'calcium', 'magnesium', 'lithium', 'ammonium'}

def n0(s):
    """NFKC·소문자·공백 정리."""
    s = unicodedata.normalize('NFKC', str(s)).lower().strip()
    return re.sub(r'\s+', ' ', s)

def _tokens(s):
    return [t for t in re.split(r'[\s,;/]+', s) if t]

def _clean(s):
    """괄호 주석 제거·약어 풀기·잡단어 제거."""
    s = re.sub(r'\([^)]*\)', ' ', s)           # (as X) (dried) (10%) 등
    s = re.sub(r'\[[^\]]*\]', ' ', s)
    s = re.sub(r'\b\d+(\.\d+)?\s*%', ' ', s)    # 50% 같은 농도
    toks = [ABBR.get(t, t) for t in _tokens(s)]
    toks = [t for t in toks if t not in NOISE]
    return ' '.join(toks).strip(' -.')

def clean_key(name):
    """표시용 중복 제거 키: 괄호·약어·잡단어를 정리한 소문자 이름."""
    return _clean(n0(name))

def candidates(name):
    """(키, 규칙이름) 목록 — 앞쪽일수록 구체적. 같은 키는 한 번만."""
    raw = n0(name)
    out, seen = [], set()
    def add(k, rule):
        k = k.strip()
        if k and k not in seen:
            seen.add(k); out.append((k, rule))
    add(raw, 'exact')
    m = re.search(r'\(\s*as\s+([^)]+)\)', raw)
    if m:
        add(_clean(m.group(1)), 'moiety')
    c = _clean(raw)
    add(c, 'clean')
    toks = _tokens(c)
    # 수화물 말 떼기
    t2 = [t for t in toks if t not in HYDRATE]
    if t2 != toks:
        add(' '.join(t2), 'clean')
    # 염 꼬리 떼기(뒤에서부터 하나씩) — 본체가 짝이온 낱말뿐이면 멈춘다
    cur = list(t2)
    while len(cur) > 1 and cur[-1] in SALT:
        nxt = cur[:-1]
        if all(t in BARE for t in nxt):
            break
        cur = nxt
        add(' '.join(cur), 'desalt')
    # "X sulfate sodium" 처럼 염이 두 개 겹친 경우를 위해 중간에 낀 염도 떼어 본다
    if len(t2) > 2:
        mid = [t for i, t in enumerate(t2) if not (i > 0 and t in SALT)]
        if mid and not all(t in BARE for t in mid):
            add(' '.join(mid), 'desalt')
    # 선두의 양이온(sodium chondroitin sulfate → chondroitin sulfate). 남은 것이 짝이온 낱말뿐이면 하지 않는다
    for k, rule in list(out):
        tk = k.split()
        if len(tk) > 1 and tk[0] in CATION and not all(t in BARE for t in tk[1:]):
            add(' '.join(tk[1:]), 'decat')
    # 선두의 d-/l-/dl- 입체 표기 떼기(마지막 수단)
    for k, rule in list(out):
        k2 = re.sub(r'^(?:d|l|dl)-', '', k)
        if k2 != k:
            add(k2, 'desalt')
    return out


def basekey(name):
    """같은 성분의 표기 변이(염·수화물·약어·괄호)를 하나로 묶는 키 — 가장 줄인 후보. 심평원에만 있는 성분(미매핑)의 묶음 기준."""
    c = candidates(name)
    if not c:
        return n0(name)
    # 낱말 수가 가장 적은 후보(가장 줄인 것). 같으면 뒤쪽(덜 구체적인 것)을 고른다.
    best = min(range(len(c)), key=lambda i: (len(c[i][0].split()), -i))
    return c[best][0]

# ── 한글 쪽 ────────────────────────────────────────────────────────────────
KO_SALT = [  # 한글 성분명 꼬리(염·수화물) — 긴 것부터 떼어 낸다
    '브롬화수소산염', '메탄설폰산염', '염산염', '황산염', '질산염', '인산염', '일인산염', '이인산염', '말레산염', '푸마르산염', '타르타르산염',
    '주석산염', '시트르산염', '구연산염', '메실산염', '베실산염', '토실산염', '아세트산염', '초산염', '숙신산염', '호박산염', '젖산염',
    '락트산염', '글루콘산염', '발레르산염', '프로피온산염', '낙산염', '부티르산염', '팔미트산염', '스테아르산염', '벤조산염', '살리실산염',
    '삼수화물', '이수화물', '일수화물', '사수화물', '오수화물', '육수화물', '칠수화물', '반수화물', '수화물', '무수물', '나트륨', '칼륨',
    '칼슘', '마그네슘', '탄산염', '브롬화물', '요오드화물', '염화물', '염',
]
KO_BARE = {'염화', '황산', '인산', '탄산', '질산', '초산', '구연산', '젖산', '염산', '수산화', '산화', '규산', '붕산'}

def ko_base(name):
    """'아토르바스타틴칼슘삼수화물' → '아토르바스타틴' (뒤에서부터 염·수화물 꼬리를 떼고, 3글자 미만이거나 짝이온 낱말이면 멈춘다).
    약전식 한글명을 '검색·인식용 별칭'으로 만드는 용도이며, 표준 이름이 아니다."""
    cur = name
    changed = True
    while changed and len(cur) > 3:
        changed = False
        for suf in KO_SALT:
            if cur.endswith(suf) and len(cur) - len(suf) >= 3 and cur[:-len(suf)] not in KO_BARE:
                cur = cur[:-len(suf)]; changed = True; break
    return cur
