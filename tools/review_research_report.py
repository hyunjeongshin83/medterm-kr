#!/usr/bin/env python
"""약사 확인서 연구용 분석·그래프 도구(운영자용) — 약사 응답을 가명(R01…)으로 분리해 집계하고, 통계·그래프·정기 요약 메일 본문을 만든다.
 입력: ① 구글 폼 응답 시트를 CSV 로 내려받은 파일(열: 타임스탬프 · 확인서 글 · … · 연구 이용 동의 · 면허확인)  ② 확인서 JSON 파일들(또는 그것이 든 폴더)
 ■ 쓰는 규칙(어기면 결과를 쓰지 않는다)
   · 확인서 검증은 병합 도구와 같은 build/review_lib.py 를 쓴다(형식·범위·항목 번호·내용 표시 h). 사전 내용이 바뀌어 h 가 다른 판정은 세지 않는다.
   · 기본으로 ‘연구 이용 동의’와 ‘면허 확인(운영자 기입)’이 모두 있는 응답만 분석한다. 열이 없거나 비어 있으면 제외한다.
     (--no-gates 로만 끌 수 있고, 그러면 결과에 ‘동의·면허 확인 안 함’이 크게 표시된다)
   · 같은 약사(이름+소속이 같음)가 같은 범위를 다시 내면 항목별로 새 판정이 이전을 덮는다. 이름·소속 표기가 다르면 다른 사람으로 센다.
   · 결과 파일(summary.json · report.html · email.html · email.txt · 그림)에는 이름·소속·메모·원본 글을 넣지 않는다. 약사는 R01, R02… 번호로만 나온다.
     소속은 분류로만 나오고, 3명 미만인 분류는 숨긴다.
   · 다 만든 뒤에 그 문자열이 결과에 섞였는지 다시 검사하고, 섞였으면 종료 코드 3 으로 끝낸다.
   · 이름·소속·메모를 담은 파일은 --link-table · --export-memos 로 따로 요청할 때만 만들고(운영자만 보며, 메일에 붙이지 않는다), 결과 폴더 안에는 쓰지 않는다.
     가명 판정표(--export-ratings: 약사 번호·항목·판정만)는 통계 프로그램에 넘기는 용도다.
 이 도구는 네트워크에 접속하지 않고, 판정 값을 만들어 내지 않는다(--demo 는 ‘가짜’ 응답을 만들며 결과에 그렇게 표시한다).
 통계: I-CVI(‘맞다’ 비율; ‘모르겠다’는 동의 아님 — 3지 판정을 맞춘 변형) · S-CVI/Ave · S-CVI/UA · 수정 카파(k*) · 관찰 일치율 · Gwet AC1 · Krippendorff α(명목) ·
   Fleiss κ(판정자 수가 같은 항목만) · 2명이면 Cohen κ.   기준: 항목마다 판정자 3명 미만은 해석하지 않음 · 3~5명 I-CVI 1.00 · 6명 이상 0.78(Lynn 1986; Polit & Beck 2006) · S-CVI/Ave 0.90 이상.
사용: python -I tools/review_research_report.py 응답.csv --out 결과폴더 [--data-dir 폴더] [--today YYYY-MM-DD] [--min-cell 3] [--no-gates]
      python -I tools/review_research_report.py 확인서.json [더…] [폴더/] --no-gates --out 결과폴더
      python -I tools/review_research_report.py --demo --out 결과폴더          (가짜 응답을 만들어 전체를 시험)
      python -I tools/review_research_report.py --selftest                      (통계·규칙 단위 시험)
 종료 코드: 0 정상 · 1 입력 오류 · 2 분석할 약사가 없음(결과는 만듦) · 3 결과에 개인정보 문자열이 섞임"""
import argparse, base64, collections, csv, datetime, hashlib, html, io, json, math, os, random, re, shutil, sys, tempfile, unicodedata

here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
sys.path.insert(0, os.path.join(root, 'build'))
import review_lib as RL  # noqa: E402

VERSION = '1.1'   # 1.1: 구글 시트 스크립트에 앱 접수(웹 앱) 추가 — 분석 논리는 그대로(두 도구의 판 번호는 같게 둔다)
V_KEYS = ('ok', 'diff', 'unsure')
V_LABEL = {'ok': '맞다', 'diff': '다르다', 'unsure': '모르겠다'}
REF_LABEL = {'health.kr': '약학정보원', 'mfds': '식약처', 'book': '교재·서적', 'law': '법령', 'other': '기타'}
REASON_LABEL = {'empty': '빈 응답', 'too_large': '크기 초과', 'json': 'JSON 해석 실패(잘렸거나 따옴표가 바뀜)', 'schema': '확인서 형식 아님', 'scope': '알 수 없는 범위',
                'license_claim': '면허 보유 표시 없음', 'item_id': '이 자료에 없는 항목 번호', 'verdict': '판정 값 이상', 'hash': '내용 표시 없음', 'date': '작성일 이상',
                'length': '글자 수 초과', 'all_stale': '지금 사전과 맞는 판정 없음', 'reviewer': '검수자 칸 이상', 'answers': '판정 칸 이상', 'refs': '참고 자료 칸 이상',
                'attested': '확인서 동의 칸 이상', 'other': '그 밖의 형식 오류'}
REASON_KEYS = (('자를 넘', 'length'), ('JSON 객체가 아닙니다', 'schema'), ('형식이 다릅니다', 'schema'), ('알 수 없는 범위', 'scope'), ('면허를 가지고', 'license_claim'),
               ('항목 id', 'item_id'), ('판정(v)', 'verdict'), ('내용 표시(h)', 'hash'), ('작성일', 'date'), ('하나도 없습니다', 'all_stale'), ('answers', 'answers'),
               ('refs', 'refs'), ('attested', 'attested'), ('reviewer', 'reviewer'), ('검수자', 'reviewer'))
GATE_LABEL = {'research_consent': '연구 이용 동의 없음', 'license': '면허 확인 전', 'gate_unknown': '동의·면허 열 없음(확인 불가)'}
AFF_RULES = ((re.compile('약국'), '약국'), (re.compile('병원|의원|의료원|클리닉|보건소'), '병원·의원'), (re.compile('제약|바이오|도매|유통|제조'), '제약·유통'),
             (re.compile('대학|학교|연구|학과'), '학교·연구'))
SURFACE, INK, INK2, MUTED, GRID, AXIS = '#fcfcfb', '#0b0b0b', '#52514e', '#898781', '#e1e0d9', '#c3c2b7'
C_OK, C_DIFF, C_UNS, C_NONE = '#2a78d6', '#eb6834', '#898781', '#eceae3'
C_SC1, C_SC2 = '#1baf7a', '#6250d6'   # 범위 구분용(판정 색과 겹치지 않는 팔레트 3·7번 칸; 검증기 통과, 대비가 낮은 청록은 끝 숫자 표시·표로 보완)
DEMO_NOTE = '시험용 · 가짜 데이터입니다. 실제 약사의 응답이 아닙니다.'


# ── 작은 도구 ──
def norm_text(s):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', s or '')).strip()


def norm_key(name, org):
    return norm_text(name).casefold() + '|' + norm_text(org).casefold()


def esc(s):
    return html.escape(str(s), quote=True)


def fmt(x, nd=2):
    return '—' if x is None else f'{x:.{nd}f}'


def pct(x, nd=0):
    return '—' if x is None else f'{x * 100:.{nd}f}%'


def research_yes(v):
    v = norm_text(v).casefold()
    if not v or v in {'no', 'false', 'n', '0', 'x', '×', '아니오', '아니요'}:
        return False
    return not v.startswith(('비동의', '미동의', '동의하지', '동의 안', '동의안', '아니'))


def license_yes(v):
    return norm_text(v).casefold() in {'y', 'yes', '예', '네', '확인', '확인함', '확인완료', 'o', 'ㅇ', 'true', '1', 'v', '✓', '✔'}


_TS = re.compile(r'^\s*(\d{4})\D+(\d{1,2})\D+(\d{1,2})(?:\D+?(오전|오후|AM|PM|am|pm)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?')
_TS_US = re.compile(r'^\s*(\d{1,2})/(\d{1,2})/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?')


def parse_ts(s):
    """시트 타임스탬프 → (날짜|None, 하루 안의 초). ‘2026. 11. 7 오후 3:55:12’ · ‘2026-11-07 15:30:00’ · ‘11/7/2026 15:30:00’(월/일/연) 모두 읽는다."""
    s = s or ''
    m = _TS.search(s)
    if m:
        y, mo, dd, ap, hh, mi, ss = int(m.group(1)), int(m.group(2)), int(m.group(3)), m.group(4), m.group(5), m.group(6), m.group(7)
    else:
        m = _TS_US.search(s)
        if not m:
            return None, 0
        mo, dd, y, hh, mi, ss, ap = int(m.group(1)), int(m.group(2)), int(m.group(3)), m.group(4), m.group(5), m.group(6), m.group(7)
    try:
        d = datetime.date(y, mo, dd)
    except ValueError:
        return None, 0
    secs = 0
    if hh:
        h = int(hh)
        if ap:
            h %= 12
            if ap.lower() in ('오후', 'pm'):
                h += 12
        secs = h * 3600 + int(mi) * 60 + int(ss or 0)
    return d, secs


def reason_of(msg):
    for key, code in REASON_KEYS:
        if key in msg:
            return code
    return 'other'


def item_label(it):
    if it['id'].startswith('N-'):
        return f"{it['no']}. {it['ko']}"
    if it['id'].startswith('B-'):
        return f"{it['no']}. {it['b']}"
    return f"{it['no']}. {it['a']}"


def week_start(d):
    return d - datetime.timedelta(days=d.weekday())


# ── 통계(순수 함수) ──
def icvi_threshold(n):
    """항목마다 판정자 수 n 에 따른 I-CVI 기준: 3명 미만 None(해석 안 함) · 3~5명 1.00 · 6명 이상 0.78."""
    if n < 3:
        return None
    return 1.0 if n <= 5 else 0.78


def kstar(n, a):
    """수정 카파 k* (Polit·Beck·Owen 2007): n 명 중 a 명이 동의."""
    if n <= 0:
        return None
    pc = math.comb(n, a) * 0.5 ** n
    return None if pc >= 1 else (a / n - pc) / (1 - pc)


def cohen_kappa(pairs):
    n = len(pairs)
    if n == 0:
        return None, None
    po = sum(1 for a, b in pairs if a == b) / n
    ca = collections.Counter(a for a, _ in pairs)
    cb = collections.Counter(b for _, b in pairs)
    pe = sum(ca[k] / n * cb[k] / n for k in set(ca) | set(cb))
    return po, (None if pe >= 1 else (po - pe) / (1 - pe))


def pa_ac1(units, q=3):
    """항목마다 판정 목록(2명 이상인 항목만) → (관찰 일치율, Gwet AC1). 판정자 수가 달라도 된다(항목마다 비율을 평균)."""
    us = [u for u in units if len(u) >= 2]
    if not us:
        return None, None
    pa, pi = 0.0, collections.defaultdict(float)
    for u in us:
        r, c = len(u), collections.Counter(u)
        pa += sum(v * (v - 1) for v in c.values()) / (r * (r - 1))
        for k, v in c.items():
            pi[k] += v / r
    n = len(us)
    pa /= n
    pe = sum((p / n) * (1 - p / n) for p in pi.values()) / (q - 1)
    return pa, (None if pe >= 1 else (pa - pe) / (1 - pe))


def fleiss_kappa(rows):
    """rows: 항목마다 범주별 개수(판정자 수가 모두 같아야 한다)."""
    n = len(rows)
    if n == 0:
        return None
    m = sum(rows[0])
    if m < 2 or any(sum(r) != m for r in rows):
        return None
    p_bar = sum((sum(v * v for v in r) - m) / (m * (m - 1)) for r in rows) / n
    pe = sum((sum(r[j] for r in rows) / (n * m)) ** 2 for j in range(len(rows[0])))
    return None if pe >= 1 else (p_bar - pe) / (1 - pe)


def kripp_alpha(units):
    """Krippendorff α(명목). 결측이 있어도 된다(판정자 2명 이상인 항목만 쓴다)."""
    us = [u for u in units if len(u) >= 2]
    if not us:
        return None
    o = collections.defaultdict(float)
    for u in us:
        m = len(u)
        for i in range(m):
            for j in range(m):
                if i != j:
                    o[(u[i], u[j])] += 1 / (m - 1)
    nc = collections.defaultdict(float)
    for (c, _k), v in o.items():
        nc[c] += v
    n = sum(nc.values())
    do = sum(v for (c, k), v in o.items() if c != k)
    de = sum(nc[c] * nc[k] for c in nc for k in nc if c != k)
    if de == 0 or n <= 1:
        return None
    return 1 - (n - 1) * do / de


def scope_stats(its, ratings):
    """한 범위의 통계. ratings: {약사번호: {항목id: 판정}} → dict(JSON 으로 쓸 수 있는 값만)."""
    rids = sorted(ratings)
    out_items, units, bal = [], [], collections.defaultdict(list)
    vt = collections.Counter()
    for it in its:
        vs = [ratings[r][it['id']] for r in rids if it['id'] in ratings[r]]
        c = collections.Counter(vs)
        n, ok, df, un = len(vs), c['ok'], c['diff'], c['unsure']
        th = icvi_threshold(n)
        iv = ok / n if n else None
        status = 'na' if th is None else ('pass' if iv + 1e-9 >= th else 'fail')
        out_items.append({'id': it['id'], 'no': it['no'], 'label': item_label(it), 'n': n, 'ok': ok, 'diff': df, 'unsure': un, 'icvi': iv,
                          'icvi_excl_unsure': (ok / (ok + df) if ok + df else None), 'kstar': (kstar(n, ok) if th is not None else None), 'threshold': th, 'status': status})
        vt.update(vs)
        if n >= 2:
            units.append(vs)
            bal[n].append([ok, df, un])
    ev = [i for i in out_items if i['status'] != 'na']
    pa, ac1 = pa_ac1(units)
    fl = None
    if bal:
        m, rows = max(bal.items(), key=lambda kv: (len(kv[1]), kv[0]))
        fl = {'kappa': fleiss_kappa(rows), 'raters_per_item': m, 'items': len(rows)}
    coh = None
    if len(rids) == 2:
        a, b = rids
        pairs = [(ratings[a][i['id']], ratings[b][i['id']]) for i in out_items if i['id'] in ratings[a] and i['id'] in ratings[b]]
        po, k = cohen_kappa(pairs)
        coh = {'pairs': len(pairs), 'observed': po, 'kappa': k}
    cells = sum(vt.values())
    rater_rows = []
    for r in rids:
        c = collections.Counter(ratings[r].values())
        rater_rows.append({'id': r, 'answered': len(ratings[r]), 'ok': c['ok'], 'diff': c['diff'], 'unsure': c['unsure']})
    return {'n_items': len(its), 'n_raters': len(rids), 'cells': cells, 'completeness': (cells / (len(rids) * len(its)) if rids and its else None),
            'verdicts': {k: vt[k] for k in V_KEYS}, 'evaluable_items': len(ev), 'scvi_ave': (sum(i['icvi'] for i in ev) / len(ev) if ev else None),
            'scvi_ua': (sum(1 for i in ev if i['icvi'] >= 1 - 1e-9) / len(ev) if ev else None), 'items_below': [i['no'] for i in ev if i['status'] == 'fail'],
            'agreement': {'units': len([u for u in units if len(u) >= 2]), 'observed': pa, 'ac1': ac1, 'alpha': kripp_alpha(units), 'prevalence_ok': (vt['ok'] / cells if cells else None),
                          'fleiss': fl, 'cohen': coh}, 'items': out_items, 'raters': rater_rows}


# ── 입력 ──
csv.field_size_limit(1 << 26)


csv.field_size_limit(8_000_000)   # 파이썬 기본(13만 자)보다 큰 칸도 ‘크기 초과’ 로 세어 넘어가게(오류로 멈추지 않게)


def _decode(raw):
    try:
        return raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        return raw.decode('cp949', errors='replace')


def read_csv(path, a):
    rows = list(csv.reader(io.StringIO(_decode(open(path, 'rb').read()), newline='')))
    if len(rows) < 2:
        return [], {}
    head, body = rows[0], rows[1:]

    def find(arg, pred):
        if arg:
            return arg - 1
        for k, h in enumerate(head):
            if pred(norm_text(h)):
                return k
        return None
    cj = a.col_json - 1 if a.col_json else None
    if cj is None:
        hits = collections.Counter(k for r in body for k, cell in enumerate(r) if RL.SCHEMA in cell)
        cj = hits.most_common(1)[0][0] if hits else find(0, lambda h: '확인서' in h)
    if cj is None:
        raise SystemExit('확인서 글이 든 열을 찾지 못했습니다(--col-json 으로 열 번호를 알려 주세요)')
    ct = find(a.col_ts, lambda h: '타임스탬프' in h or h.lower() == 'timestamp')
    if ct is None and not a.col_ts and cj != 0:
        ct = 0
    # 열 이름 약속: 연구 동의 열은 ‘연구 이용’과 ‘동의’가 함께 든 이름, 면허 열은 ‘면허’가 든 이름(구글 폼 질문 제목·시트에 운영자가 더한 열 이름)
    cc = find(a.col_consent, lambda h: '연구 이용' in h and '동의' in h)
    cl = find(a.col_license, lambda h: '면허' in h)
    recs = []
    for r in body:
        if not any(norm_text(x) for x in r):
            continue

        def g(k):
            return r[k] if k is not None and k < len(r) else None
        recs.append({'text': g(cj) or '', 'ts': g(ct) or '', 'consent': None if cc is None else research_yes(g(cc) or ''),
                     'license': None if cl is None else license_yes(g(cl) or ''), 'src': os.path.basename(path)})
    cols = {'json': cj + 1, 'ts': None if ct is None else ct + 1, 'consent': None if cc is None else cc + 1, 'license': None if cl is None else cl + 1}
    names = {k: (norm_text(head[v - 1])[:40] if v else None) for k, v in cols.items()}
    print('읽은 열: ' + ' · '.join(f"{lab} = {('%d번 ‘%s’' % (cols[k], names[k])) if cols[k] else '없음'}" for k, lab in (('json', '확인서 글'), ('ts', '시각'), ('consent', '연구 이용 동의'), ('license', '면허 확인'))))
    return recs, cols


def read_json_files(paths):
    out = []
    for p in paths:
        files = sorted(os.path.join(p, f) for f in os.listdir(p) if f.lower().endswith(('.json', '.txt'))) if os.path.isdir(p) else [p]
        for f in files:
            out.append({'text': _decode(open(f, 'rb').read()), 'ts': '', 'consent': None, 'license': None, 'src': os.path.basename(f)})
    return out


def load_inputs(paths, a):
    recs, cols = [], {}
    for p in paths:
        if not os.path.exists(p):
            raise SystemExit(f'입력이 없습니다: {p}')
    csvs = [p for p in paths if os.path.isfile(p) and p.lower().endswith('.csv')]
    others = [p for p in paths if p not in csvs]
    for p in csvs:
        r, c = read_csv(p, a)
        recs += r
        cols = c or cols
    recs += read_json_files(others)
    return recs, cols


# ── 분석 ──
def _harvest(obj, bag):
    """개인정보가 될 수 있는 글(이름·소속·기타 자료·메모)을 모아 둔다 — 결과에 섞였는지 마지막에 검사하려고만 쓴다."""
    if not isinstance(obj, dict):
        return
    rv = obj.get('reviewer')
    if isinstance(rv, dict):
        for k in ('name', 'affiliation'):
            if isinstance(rv.get(k), str) and norm_text(rv[k]):
                bag.add(norm_text(rv[k]))
    if isinstance(obj.get('refs_other'), str) and norm_text(obj['refs_other']):
        bag.add(norm_text(obj['refs_other']))
    ans = obj.get('answers')
    if isinstance(ans, dict):
        for x in ans.values():
            if isinstance(x, dict) and isinstance(x.get('m'), str) and norm_text(x['m']):
                bag.add(norm_text(x['m']))


def aff_cat(org):
    o = norm_text(org)
    if not o:
        return '미기재'
    for rx, lab in AFF_RULES:
        if rx.search(o):
            return lab
    return '기타'


def aff_summary(orgs, k):
    cnt = collections.Counter(aff_cat(o) for o in orgs)
    shown = {c: n for c, n in cnt.items() if n >= k}
    return {'shown': dict(sorted(shown.items(), key=lambda kv: (-kv[1], kv[0]))), 'hidden_people': sum(n for c, n in cnt.items() if n < k), 'min_cell': k}


def weekly(dates, today=None, start=None):
    """약사가 처음 응답한 날짜들 → 주(월요일)별 새 약사 수와 누적. start 가 있으면 그 주부터, today 가 있으면 오늘이 든 주까지(0명인 주도) 이어서 보여 준다 — 범위마다 같은 주 축을 쓰려는 것."""
    if not dates:
        return []
    ds = sorted(dates)
    cnt = collections.Counter(week_start(d) for d in ds)
    w, w1, cum, out = week_start(min(ds[0], start) if start else ds[0]), week_start(max(ds[-1], today) if today else ds[-1]), 0, []
    while w <= w1:
        cum += cnt.get(w, 0)
        out.append({'week': w.isoformat(), 'new': cnt.get(w, 0), 'cum': cum})
        w += datetime.timedelta(days=7)
    return out


def _no_constant(name):
    """파이썬 json 은 NaN·Infinity 도 받아 주지만 표준 JSON 이 아니다(구글 시트용 스크립트의 JSON.parse 는 거부) — 두 도구의 분류를 맞추려고 같이 거부한다."""
    raise ValueError('JSON 에 쓸 수 없는 값: ' + name)


def analyze(recs, items, today, gates_on=True, min_cell=3, demo=False):
    intake, rejects, gated = collections.Counter(), collections.Counter(), collections.Counter()
    acc, secrets, records = [], set(), []
    for idx, rec in enumerate(recs):
        intake['received'] += 1
        R = {'idx': idx, 'ts': rec['ts'], 'status': 'rejected', 'reason': None, 'rid': None, 'scope': None, 'n': 0, 'stale': 0}
        records.append(R)
        text = rec['text'] or ''
        if not text.strip():
            rejects['empty'] += 1
            R['reason'] = 'empty'
            continue
        if len(text.encode('utf-8')) > RL.MAX_FILE_BYTES:
            rejects['too_large'] += 1
            R['reason'] = 'too_large'
            continue
        try:
            obj = json.loads(text, parse_constant=_no_constant)
        except (ValueError, RecursionError):   # 잘린 글 · 표준 JSON 이 아닌 글(NaN 등) · 너무 깊게 겹친 글 — 모두 ‘해석 실패’
            rejects['json'] += 1
            R['reason'] = 'json'
            continue
        _harvest(obj, secrets)
        try:
            clean, _w = RL.validate_submission(obj, items, today)
        except RL.ReviewError as e:
            R['reason'] = reason_of(str(e))
            rejects[R['reason']] += 1
            continue
        except Exception:  # noqa: BLE001 — 낯선 입력은 오류로 세고 멈추지 않는다
            rejects['other'] += 1
            R['reason'] = 'other'
            continue
        R.update(scope=clean['scope'], n=len(clean['answers']), stale=len(clean['stale']))
        if gates_on:
            g = None
            if rec['consent'] is None or rec['license'] is None:
                g = 'gate_unknown'
            elif not rec['consent']:
                g = 'research_consent'
            elif not rec['license']:
                g = 'license'
            if g:
                gated[g] += 1
                R.update(status='gated', reason=g)
                continue
        d, secs = parse_ts(rec['ts'])
        R['status'] = 'ok'
        acc.append({'clean': clean, 'idx': idx, 'd': d, 'secs': secs, 'R': R})
    acc.sort(key=lambda p: (p['clean']['created'], p['d'] or datetime.date.min, p['secs'], p['idx']))
    ids, link = {}, {}
    sids = list(items['scopes'])
    ratings = {s: {} for s in sids}
    memos = {s: {} for s in sids}
    refs = {s: {} for s in sids}
    first = {s: {} for s in sids}
    for p in acc:
        cl = p['clean']
        sid, rv = cl['scope'], cl['reviewer']
        key = norm_key(rv['name'], rv['affiliation'])
        if key not in ids:
            ids[key] = len(ids) + 1
            link[ids[key]] = {'name': rv['name'], 'org': rv['affiliation'], 'scopes': set()}
        n = ids[key]
        p['nid'] = n
        link[n]['scopes'].add(sid)
        r, mm = ratings[sid].setdefault(n, {}), memos[sid].setdefault(n, {})
        for iid, a in cl['answers'].items():
            r[iid] = a['v']
            if iid in cl['notes']:
                mm[iid] = cl['notes'][iid]
            else:
                mm.pop(iid, None)
        refs[sid][n] = set(cl['refs'])
        dd = p['d'] or datetime.date.fromisoformat(cl['created'])
        first[sid][n] = min(first[sid].get(n, dd), dd)
    width = max(2, len(str(len(ids))))

    def rid(n):
        return f'R{n:0{width}d}'
    for p in acc:
        p['R']['rid'] = rid(p['nid'])
    all_first = [d for sid in sids for d in first[sid].values()]
    w_first = min(all_first) if all_first else None
    scopes = {}
    for sid in sids:
        rt = {rid(n): v for n, v in ratings[sid].items()}
        st = scope_stats(items['items'][sid], rt)
        st['label'] = items['scopes'][sid]['label']
        st['data_hash'] = items['scopes'][sid]['hash']
        rf = {}
        for ref in RL.REFS:
            who = [n for n, s in refs[sid].items() if ref in s]
            row = {'label': REF_LABEL[ref], 'raters': len(who), 'verdicts': None}
            if len(who) >= min_cell:
                c = collections.Counter(v for n in who for v in ratings[sid][n].values())
                row['verdicts'] = {k: c[k] for k in V_KEYS}
            rf[ref] = row
        notes = [(n, i, t) for n, d in memos[sid].items() for i, t in d.items()]
        nonok = st['verdicts']['diff'] + st['verdicts']['unsure']
        st['refs'] = rf
        st['memos'] = {'count': len(notes), 'share_of_non_ok': (len(notes) / nonok if nonok else None), 'mean_chars': (sum(len(t) for _, _, t in notes) / len(notes) if notes else None)}
        st['weekly'] = weekly(list(first[sid].values()), today, w_first)
        scopes[sid] = st
    stale = 0
    for p in acc:
        stale += len(p['clean']['stale'])
    S = {'meta': {'tool': 'review_research_report', 'version': VERSION, 'today': today.isoformat(), 'demo': demo, 'gates': gates_on, 'min_cell': min_cell,
                  'input_sha': hashlib.sha256('\x00'.join((r['text'] or '') for r in recs).encode('utf-8')).hexdigest()[:12]},
         'intake': {'received': intake['received'], 'rejected': dict(rejects), 'excluded_by_gate': dict(gated), 'accepted_submissions': len(acc), 'raters': len(ids), 'stale_answers': stale},
         'affiliation_categories': aff_summary([v['org'] for v in link.values()], min_cell), 'scopes': scopes}
    ops = {'records': records, 'link': {rid(n): v for n, v in link.items()}, 'memos': {s: {rid(n): d for n, d in m.items() if d} for s, m in memos.items()},
           'ratings': {s: {rid(n): v for n, v in r.items()} for s, r in ratings.items()}, 'secrets': secrets}
    return S, ops


# ── 그림 ──
def _mpl():
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib import font_manager as fm
    have = {f.name for f in fm.fontManager.ttflist}
    for fam in ('Noto Sans CJK KR', 'Noto Sans KR', 'NanumGothic', 'Malgun Gothic', 'AppleGothic'):
        if fam in have:
            plt.rcParams['font.family'] = fam
            break
    plt.rcParams.update({'axes.unicode_minus': False, 'figure.facecolor': SURFACE, 'axes.facecolor': SURFACE, 'savefig.facecolor': SURFACE, 'text.color': INK,
                         'axes.labelcolor': INK2, 'xtick.color': INK2, 'ytick.color': INK2, 'axes.edgecolor': AXIS, 'axes.spines.top': False, 'axes.spines.right': False, 'font.size': 9})
    return plt


def _save(plt, fig, path):
    fig.savefig(path, dpi=140, bbox_inches='tight', facecolor=SURFACE)
    plt.close(fig)


def ch_stack(plt, scopes, path):
    fig, ax = plt.subplots(figsize=(8.2, 1.2 + 0.7 * len(scopes)))
    for i, sc in enumerate(scopes):
        tot, left = sum(sc['verdicts'].values()) or 1, 0
        for k, col in (('ok', C_OK), ('diff', C_DIFF), ('unsure', C_UNS)):
            w = sc['verdicts'][k] / tot * 100
            ax.barh(i, w, left=left, height=0.46, color=col, edgecolor=SURFACE, linewidth=2, label=V_LABEL[k] if i == 0 else None)
            if w >= 8:
                ax.text(left + w / 2, i, f'{w:.0f}%', ha='center', va='center', color='#ffffff', fontsize=9)
            left += w
    ax.set_yticks(range(len(scopes)))
    ax.set_yticklabels([f"{sc['label']}\n약사 {sc['n_raters']}명 · 판정 {sum(sc['verdicts'].values())}건" for sc in scopes])
    ax.invert_yaxis()
    ax.set_xlim(0, 100)
    ax.set_xlabel('판정 비율(%)')
    ax.xaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.legend(loc='lower center', bbox_to_anchor=(0.5, 1.0), ncol=3, frameon=False)
    _save(plt, fig, path)


def ch_icvi(plt, sc, path):
    from matplotlib.patches import Patch
    its = sc['items']
    fig, ax = plt.subplots(figsize=(10, 3.4))
    cols = [C_UNS if i['status'] == 'na' else (C_OK if i['status'] == 'pass' else C_DIFF) for i in its]
    ax.bar(range(1, len(its) + 1), [i['icvi'] or 0 for i in its], color=cols, width=0.72, edgecolor=SURFACE, linewidth=0.8)
    for th in sorted({i['threshold'] for i in its if i['threshold'] is not None}):
        ax.axhline(th, color=INK2, linewidth=1)
        ax.text(len(its) + 0.8, th, f'기준 {th:.2f}', va='center', fontsize=8, color=INK2)
    ax.set_ylim(0, 1.05)
    ax.set_xlim(0.3, len(its) + 0.7)
    ax.set_xticks([1] + list(range(5, len(its) + 1, 5)))
    ax.set_xlabel('항목 번호')
    ax.set_ylabel('I-CVI(‘맞다’ 비율)')
    ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.legend(handles=[Patch(color=C_OK, label='기준 충족'), Patch(color=C_DIFF, label='기준 미달'), Patch(color=C_UNS, label='판정 3명 미만(해석 안 함)')],
              loc='lower center', bbox_to_anchor=(0.5, 1.0), ncol=3, frameon=False)
    _save(plt, fig, path)


def ch_heat(plt, sc, ratings, path):
    import numpy as np
    from matplotlib.colors import ListedColormap
    from matplotlib.patches import Patch
    rids = sorted(ratings)
    code = {None: 0, 'ok': 1, 'diff': 2, 'unsure': 3}
    M = np.array([[code[ratings[r].get(i['id'])] for i in sc['items']] for r in rids])
    fig, ax = plt.subplots(figsize=(10, 0.3 * len(rids) + 1.7))
    ax.imshow(M, cmap=ListedColormap([C_NONE, C_OK, C_DIFF, C_UNS]), vmin=0, vmax=3, aspect='auto', interpolation='nearest')
    ax.set_xticks(np.arange(-0.5, M.shape[1], 1), minor=True)
    ax.set_yticks(np.arange(-0.5, M.shape[0], 1), minor=True)
    ax.grid(which='minor', color=SURFACE, linewidth=1.2)
    ax.tick_params(which='minor', length=0)
    ax.set_yticks(range(len(rids)))
    ax.set_yticklabels(rids)
    ax.set_xticks([0] + list(range(4, M.shape[1], 5)))
    ax.set_xticklabels([1] + list(range(5, M.shape[1] + 1, 5)))
    ax.set_xlabel('항목 번호')
    for s in ax.spines.values():
        s.set_visible(False)
    ax.legend(handles=[Patch(color=C_OK, label='맞다'), Patch(color=C_DIFF, label='다르다'), Patch(color=C_UNS, label='모르겠다'), Patch(facecolor=C_NONE, edgecolor=AXIS, label='아직 판정 안 함')],
              loc='lower center', bbox_to_anchor=(0.5, 1.0), ncol=4, frameon=False)
    _save(plt, fig, path)


def ch_div(plt, sc, path):
    """항목별 판정 분포: 오른쪽 = ‘맞다’(I-CVI 의 분자와 같은 길이), 왼쪽 = ‘맞다’가 아닌 것(0 쪽에서 다르다 → 그 바깥에 모르겠다). 눈금이 칸 수와 그대로 맞는다."""
    from matplotlib.patches import Patch
    its = sc['items']
    fig, ax = plt.subplots(figsize=(8.6, 1.5 + 0.2 * len(its)))
    mx = 1
    for i, it in enumerate(its):
        ax.barh(i, it['ok'], left=0, height=0.74, color=C_OK, edgecolor=SURFACE, linewidth=0.8)
        ax.barh(i, -it['diff'], left=0, height=0.74, color=C_DIFF, edgecolor=SURFACE, linewidth=0.8)
        ax.barh(i, -it['unsure'], left=-it['diff'], height=0.74, color=C_UNS, edgecolor=SURFACE, linewidth=0.8)
        mx = max(mx, it['ok'], it['diff'] + it['unsure'])
    ax.set_yticks(range(len(its)))
    ax.set_yticklabels([i['label'] for i in its], fontsize=6.5)
    ax.set_ylim(len(its) - 0.5, -0.5)
    ax.set_xlim(-mx - 0.3, mx + 0.3)
    ticks = list(range(-int(mx), int(mx) + 1))
    ax.set_xticks(ticks)
    ax.set_xticklabels([str(abs(t)) for t in ticks])
    ax.axvline(0, color=AXIS, linewidth=1)
    ax.set_xlabel('← ‘맞다’가 아닌 약사(명)      ‘맞다’ 약사(명) →')
    ax.xaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.legend(handles=[Patch(color=C_OK, label='맞다'), Patch(color=C_DIFF, label='다르다'), Patch(color=C_UNS, label='모르겠다')], loc='lower center', bbox_to_anchor=(0.5, 1.0), ncol=3, frameon=False)
    _save(plt, fig, path)


def ch_progress(plt, scopes, path):
    """주별 누적 약사 수. 범위(성분·상품명 / 약사법)는 판정 색(파랑·주황)과 겹치지 않게 다른 두 색을 쓴다."""
    from matplotlib.lines import Line2D
    from matplotlib.ticker import MaxNLocator
    fig, ax = plt.subplots(figsize=(8.2, 3.1))
    cols = [C_SC1, C_SC2]
    handles = []
    for k, sc in enumerate(scopes):
        w = sc['weekly']
        if not w:
            continue
        col = cols[k % 2]
        xs = list(range(len(w)))
        ax.plot(xs, [x['cum'] for x in w], color=col, linewidth=2, marker='o', markersize=6, markeredgecolor=SURFACE, markeredgewidth=1.5)
        ax.text(xs[-1] + 0.12, w[-1]['cum'], f"{w[-1]['cum']}명", va='center', fontsize=9, color=INK2)
        handles.append(Line2D([0], [0], color=col, linewidth=2, marker='o', markersize=6, markeredgecolor=SURFACE, label=sc['label']))
    wk = max((sc['weekly'] for sc in scopes), key=len, default=[])
    ax.set_xticks(range(len(wk)))
    ax.set_xticklabels([x['week'][5:] for x in wk])
    ax.set_xlim(-0.3, max(len(wk) - 1, 1) + 0.7)
    ax.set_ylim(bottom=0)
    ax.yaxis.set_major_locator(MaxNLocator(integer=True))
    ax.set_xlabel('주(월요일 날짜)')
    ax.set_ylabel('누적 약사 수')
    ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    if len(handles) > 1:
        ax.legend(handles=handles, loc='lower center', bbox_to_anchor=(0.5, 1.0), ncol=2, frameon=False)
    _save(plt, fig, path)


def make_charts(S, ops, outdir):
    try:
        plt = _mpl()
    except Exception as e:  # noqa: BLE001
        print('그림은 만들지 않았습니다(matplotlib 을 불러오지 못함):', e, file=sys.stderr)
        return {}
    files = {}
    scs = [S['scopes'][s] for s in S['scopes'] if S['scopes'][s]['n_raters']]
    if not scs:
        return files
    p = os.path.join(outdir, 'verdict_by_scope.png')
    ch_stack(plt, scs, p)
    files['verdict_by_scope'] = p
    for sid, sc in S['scopes'].items():
        if not sc['n_raters']:
            continue
        for name, fn, extra in (('icvi', ch_icvi, ()), ('heatmap', ch_heat, (ops['ratings'][sid],)), ('diverging', ch_div, ())):
            p = os.path.join(outdir, f'{name}_{sid}.png')
            fn(plt, sc, *extra, p)
            files[f'{name}_{sid}'] = p
    if any(len(sc['weekly']) for sc in scs):
        p = os.path.join(outdir, 'progress.png')
        ch_progress(plt, scs, p)
        files['progress'] = p
    return files


# ── 글(해석 주의) ──
def caution(n):
    if n == 0:
        return '분석할 약사 응답이 아직 없습니다.'
    if n < 3:
        return f'약사 {n}명 — 3명 미만이라 I-CVI·일치도를 해석하지 않습니다. 판정 분포와 ‘다르다’ 목록만 참고하세요.'
    if n <= 5:
        return f'약사 {n}명 — I-CVI 기준은 전원 동의(1.00)이고, 일치도 통계는 불안정합니다.'
    return f'약사 {n}명 — I-CVI 0.78 이상, S-CVI/Ave 0.90 이상을 기준으로 봅니다.'


def subject(S):
    m, n = S['meta'], S['intake']['raters']
    pre = ('[시험용·가짜 데이터] ' if m['demo'] else '') + ('' if m['gates'] else '[동의·면허 확인 안 함] ')
    return pre + f"[MedTerm-KR 약사검수 요약] {m['today']} · " + (f'연구용 약사 {n}명' if m['gates'] else f'약사 {n}명')


# ── 보고서(report.html) ──
CSS = """
:root{color-scheme:light}
body{margin:0;background:#fcfcfb;color:#0b0b0b;font:14px/1.65 system-ui,-apple-system,"Segoe UI","Noto Sans KR","Malgun Gothic",sans-serif}
main{max-width:900px;margin:0 auto;padding:20px max(16px,env(safe-area-inset-right,0px)) 48px max(16px,env(safe-area-inset-left,0px))}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 8px;border-top:1px solid #e1e0d9;padding-top:16px}h3{font-size:14.5px;margin:20px 0 6px}
p,li{max-width:70ch}.sub{color:#52514e;margin:0 0 12px}.banner{background:#fff3d6;color:#5b3b00;border:1px solid #e8c36a;border-radius:8px;padding:10px 14px;margin:12px 0;font-weight:600}
.note{background:#f4f3ef;border-radius:8px;padding:10px 14px;margin:12px 0}.tw{overflow-x:auto;margin:8px 0}
table{border-collapse:collapse;min-width:100%}th,td{border-bottom:1px solid #e1e0d9;padding:6px 10px;text-align:left;vertical-align:top;white-space:nowrap}th{color:#52514e;font-weight:600;font-size:12.5px}
td.n,th.n{text-align:right}img{max-width:100%;height:auto;border:1px solid #e1e0d9;border-radius:8px;margin:6px 0}
details{margin:10px 0}summary{cursor:pointer;color:#184f95}.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:baseline}
footer{color:#52514e;font-size:12.5px;margin-top:32px}
"""


def _img(files, key, alt):
    if key not in files:
        return ''
    b = base64.b64encode(open(files[key], 'rb').read()).decode('ascii')
    return f'<img alt="{esc(alt)}" src="data:image/png;base64,{b}">'


def _table(head, rows, num=()):
    h = ''.join(f'<th class="{"n" if k in num else ""}">{esc(c)}</th>' for k, c in enumerate(head))
    b = ''.join('<tr>' + ''.join(f'<td class="{"n" if k in num else ""}">{c}</td>' for k, c in enumerate(r)) + '</tr>' for r in rows)
    return f'<div class="tw"><table><thead><tr>{h}</tr></thead><tbody>{b}</tbody></table></div>'


def _banner(S):
    m, out = S['meta'], ''
    if m['demo']:
        out += f'<div class="banner">{esc(DEMO_NOTE)}</div>'
    if not m['gates']:
        out += '<div class="banner">동의·면허 확인을 하지 않고 만든 결과입니다(--no-gates). 연구에는 쓰지 마세요.</div>'
    return out


def render_report(S, files):
    m, it = S['meta'], S['intake']
    rej = ', '.join(f'{REASON_LABEL.get(k, k)} {v}건' for k, v in sorted(it['rejected'].items())) or '없음'
    gat = ', '.join(f'{GATE_LABEL.get(k, k)} {v}건' for k, v in sorted(it['excluded_by_gate'].items())) or '없음'
    rows = [['접수', f"{it['received']}건"], ['형식 오류로 뺀 것', rej], ['동의·면허 확인으로 뺀 것', gat], ['분석에 쓴 확인서', f"{it['accepted_submissions']}건"],
            ['분석에 쓴 약사(가명)', f"{it['raters']}명"], ['사전 내용이 바뀌어 세지 않은 판정', f"{it['stale_answers']}개"]]
    aff = S['affiliation_categories']
    aff_txt = ', '.join(f'{k} {v}명' for k, v in aff['shown'].items()) or '표시할 분류 없음'
    if aff['hidden_people']:
        aff_txt += f" · 그 밖 {aff['hidden_people']}명(분류 비공개: {aff['min_cell']}명 미만)"
    parts = [f'<h1>약사 확인서 연구용 요약</h1><p class="sub">{esc(m["today"])} 기준 · 이름·소속·메모·원본 글을 담지 않은 집계입니다(약사는 R번호로만 나옵니다).</p>', _banner(S),
             '<h2>접수 현황</h2>', _table(['항목', '값'], [[esc(a), esc(b)] for a, b in rows]), f'<p class="sub">소속 분류: {esc(aff_txt)}</p>']
    scs = [s for s in S['scopes'].values() if s['n_raters']]
    if scs:
        parts += ['<h2>범위별 요약</h2>', _img(files, 'verdict_by_scope', '범위별 판정 분포 누적 막대')]
        head = ['범위', '항목', '약사', '판정', '맞다', '다르다', '모르겠다', 'S-CVI/Ave', 'S-CVI/UA', '관찰 일치율', 'AC1', 'α']
        rr = []
        for sc in S['scopes'].values():
            ag, v = sc['agreement'], sc['verdicts']
            rr.append([esc(sc['label']), sc['n_items'], sc['n_raters'], sc['cells'], v['ok'], v['diff'], v['unsure'], fmt(sc['scvi_ave']), fmt(sc['scvi_ua']), pct(ag['observed']), fmt(ag['ac1']), fmt(ag['alpha'])])
        parts.append(_table(head, rr, num=range(1, 12)))
    for sid, sc in S['scopes'].items():
        parts.append(f'<h2>{esc(sc["label"])}</h2><p>{esc(caution(sc["n_raters"]))}</p>')
        if not sc['n_raters']:
            continue
        ag = sc['agreement']
        kv = [['항목·약사·판정', f"{sc['n_items']}개 · {sc['n_raters']}명 · {sc['cells']}건(완성도 {pct(sc['completeness'])})"],
              ['S-CVI/Ave · S-CVI/UA', f"{fmt(sc['scvi_ave'])} · {fmt(sc['scvi_ua'])} (판정자 3명 이상인 항목 {sc['evaluable_items']}개 기준)"],
              ['관찰 일치율 · AC1 · α', f"{pct(ag['observed'])} · {fmt(ag['ac1'])} · {fmt(ag['alpha'])} (2명 이상이 판정한 항목 {ag['units']}개)"],
              ['‘맞다’ 비율(쏠림)', pct(ag['prevalence_ok'])]]
        if ag['fleiss']:
            kv.append(['Fleiss κ', f"{fmt(ag['fleiss']['kappa'])} (항목마다 판정자 {ag['fleiss']['raters_per_item']}명인 {ag['fleiss']['items']}개 항목만)"])
        if ag['cohen']:
            kv.append(['Cohen κ(2명)', f"{fmt(ag['cohen']['kappa'])} (함께 판정한 {ag['cohen']['pairs']}개 항목, 일치 {pct(ag['cohen']['observed'])})"])
        parts += [_table(['지표', '값'], [[esc(a), esc(b)] for a, b in kv]),
                  _img(files, f'icvi_{sid}', f'{sc["label"]} 항목별 I-CVI'), _img(files, f'heatmap_{sid}', f'{sc["label"]} 약사×항목 판정 히트맵')]
        flag = [i for i in sc['items'] if i['status'] == 'fail' or i['diff'] > 0]
        if flag:
            parts += ['<h3>살펴볼 항목(기준 미달 또는 ‘다르다’가 있는 항목)</h3>', _table(
                ['항목', '판정', '맞다', '다르다', '모르겠다', 'I-CVI', 'k*', '결과'],
                [[esc(i['label']), i['n'], i['ok'], i['diff'], i['unsure'], fmt(i['icvi']), fmt(i['kstar']), {'pass': '충족', 'fail': '미달', 'na': '판정 부족'}[i['status']]] for i in flag], num=range(1, 7))]
        parts += ['<details><summary>항목별 판정 분포(그림 보기)</summary>', _img(files, f'diverging_{sid}', f'{sc["label"]} 항목별 판정 분포 발산 막대'), '</details>',
                  '<details><summary>전체 항목 표(그림의 숫자)</summary>', _table(['항목', '판정', '맞다', '다르다', '모르겠다', 'I-CVI', '‘모름’ 뺀 I-CVI', 'k*', '결과'],
                  [[esc(i['label']), i['n'], i['ok'], i['diff'], i['unsure'], fmt(i['icvi']), fmt(i['icvi_excl_unsure']), fmt(i['kstar']), {'pass': '충족', 'fail': '미달', 'na': '판정 부족'}[i['status']]] for i in sc['items']], num=range(1, 8)), '</details>',
                  '<details><summary>약사(가명)별 · 참고 자료 · 메모</summary>', _table(['약사', '판정', '맞다', '다르다', '모르겠다'], [[r['id'], r['answered'], r['ok'], r['diff'], r['unsure']] for r in sc['raters']], num=range(1, 5)),
                  _table(['참고한 자료', '약사 수', '맞다', '다르다', '모르겠다'], [[esc(r['label']), r['raters']] + ([r['verdicts']['ok'], r['verdicts']['diff'], r['verdicts']['unsure']] if r['verdicts'] else ['<3명', '', '']) for r in sc['refs'].values()], num=range(1, 5)),
                  f'<p class="sub">메모 {sc["memos"]["count"]}건(‘다르다’·‘모르겠다’ 판정의 {pct(sc["memos"]["share_of_non_ok"])}), 평균 {fmt(sc["memos"]["mean_chars"], 0)}자. 메모 내용은 이 보고서에 싣지 않습니다.</p>', '</details>']
    if any(len(sc['weekly']) for sc in scs):
        wsc = [sc for sc in scs if sc['weekly']]
        wk = wsc[0]['weekly']
        wrows = [[w['week']] + [v for sc in wsc for v in (sc['weekly'][k]['new'], sc['weekly'][k]['cum'])] for k, w in enumerate(wk)]
        parts += ['<h2>접수 추이</h2>', _img(files, 'progress', '주별 누적 약사 수'), '<details><summary>표로 보기</summary>',
                  _table(['주(월요일)'] + [f'{sc["label"]} {x}' for sc in wsc for x in ('새 약사', '누적')], wrows, num=range(1, 1 + 2 * len(wsc))), '</details>']
    parts += ['<h2>읽는 법과 한계</h2><div class="note"><ul>',
              '<li>I-CVI = 그 항목에 판정한 약사 중 ‘맞다’를 고른 비율입니다(‘모르겠다’는 동의로 세지 않음). 3지 판정에 맞춘 변형이므로 논문에 그렇게 밝힙니다. ‘모르겠다’를 뺀 비율은 전체 항목 표에 따로 있습니다.</li>',
              '<li>기준: 항목마다 판정자 3명 미만은 해석하지 않고, 3~5명은 1.00(전원 동의), 6명 이상은 0.78 이상입니다(Lynn 1986; Polit &amp; Beck 2006). S-CVI/Ave는 0.90 이상을 권고합니다.</li>',
              '<li>‘맞다’가 대부분이면 일치율이 높아도 카파가 낮게 나옵니다(카파 역설). 그래서 관찰 일치율·판정 분포·카파·AC1을 함께 보고, 항목을 건너뛴 약사가 있으면 α를 봅니다.</li>',
              '<li>약사는 편의표본이라 대표성을 주장할 수 없고, 이름·소속 표기가 다르면 다른 사람으로 세어집니다.</li>',
              '<li>이 도구는 판정 값을 만들어 내지 않으며, 이 결과는 법률 자문이나 연구윤리 심의 결과가 아닙니다.</li></ul></div>',
              f'<footer>review_research_report {esc(m["version"])} · 입력 해시 {esc(m["input_sha"])} · 같은 입력이면 같은 결과가 나옵니다.</footer>']
    return f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MedTerm-KR 약사 확인서 연구용 요약</title><style>{CSS}</style></head><body><main>{"".join(parts)}</main></body></html>'


# ── 정기 요약 메일(그림 없이 표·막대만: 메일에 이미지를 붙이지 않아도 되게) ──
def _bar(v):
    tot = sum(v.values()) or 1
    cells = ''.join(f'<td width="{v[k] / tot * 100:.2f}%" bgcolor="{c}" style="background:{c};height:14px;font-size:0;line-height:0">&nbsp;</td>' for k, c in (('ok', C_OK), ('diff', C_DIFF), ('unsure', C_UNS)) if v[k])
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>{cells}</tr></table>'


def _strip(items):
    col = {'pass': C_OK, 'fail': C_DIFF, 'na': C_UNS}
    cells = ''.join(f'<td width="10" bgcolor="{col[i["status"]]}" style="background:{col[i["status"]]};width:10px;height:14px;font-size:0;line-height:0;border-right:1px solid #ffffff" title="{i["no"]}">&nbsp;</td>' for i in items)
    return f'<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>{cells}</tr></table>'


def email_html(S):
    m, it = S['meta'], S['intake']
    st = "font:14px/1.6 -apple-system,'Segoe UI','Noto Sans KR','Malgun Gothic',sans-serif;color:#0b0b0b"   # style="…" 안이라 글꼴 이름은 작은따옴표
    out = [f'<div style="{st};max-width:640px;background:#ffffff;padding:8px">']
    if m['demo']:
        out.append(f'<p style="background:#fff3d6;color:#5b3b00;border:1px solid #e8c36a;border-radius:6px;padding:8px 12px;font-weight:bold">{esc(DEMO_NOTE)}</p>')
    if not m['gates']:
        out.append('<p style="background:#fff3d6;color:#5b3b00;padding:8px 12px;font-weight:bold">동의·면허 확인 없이 만든 결과입니다. 연구에는 쓰지 마세요.</p>')
    rej, gat = sum(it['rejected'].values()), sum(it['excluded_by_gate'].values())
    out.append(f'<h2 style="font-size:17px;margin:8px 0">MedTerm-KR 약사 검수 연구용 요약 · {esc(m["today"])}</h2>')
    out.append(f'<p style="margin:4px 0">접수 <b>{it["received"]}건</b> → 분석 반영 <b>{it["accepted_submissions"]}건(약사 {it["raters"]}명)</b>. 뺀 것: 형식 오류 {rej}건 · 동의·면허 확인 {gat}건. 사전 변경으로 세지 않은 판정 {it["stale_answers"]}개.</p>')
    for sid, sc in S['scopes'].items():
        out.append(f'<h3 style="font-size:15px;margin:18px 0 4px">{esc(sc["label"])}</h3><p style="margin:2px 0;color:#52514e">{esc(caution(sc["n_raters"]))}</p>')
        if not sc['n_raters']:
            continue
        ag, v = sc['agreement'], sc['verdicts']
        out.append(_bar(v))
        out.append(f'<p style="margin:2px 0;font-size:12.5px;color:#52514e"><span style="color:{C_OK}">■</span> 맞다 {v["ok"]} · <span style="color:{C_DIFF}">■</span> 다르다 {v["diff"]} · <span style="color:{C_UNS}">■</span> 모르겠다 {v["unsure"]} (판정 {sc["cells"]}건, 완성도 {pct(sc["completeness"])})</p>')
        out.append(f'<p style="margin:6px 0">S-CVI/Ave <b>{fmt(sc["scvi_ave"])}</b> · S-CVI/UA <b>{fmt(sc["scvi_ua"])}</b> · 관찰 일치율 <b>{pct(ag["observed"])}</b> · AC1 <b>{fmt(ag["ac1"])}</b> · α <b>{fmt(ag["alpha"])}</b></p>')
        out.append(f'<p style="margin:6px 0 2px;font-size:12.5px;color:#52514e">항목별 기준(1~{sc["n_items"]}번): <span style="color:{C_OK}">■</span> 충족 <span style="color:{C_DIFF}">■</span> 미달 <span style="color:{C_UNS}">■</span> 판정 3명 미만</p>')
        out.append(_strip(sc['items']))
        flag = sorted([i for i in sc['items'] if i['diff'] > 0], key=lambda i: (-i['diff'], i['no']))[:8]
        if flag:
            out.append('<p style="margin:8px 0 2px"><b>‘다르다’가 나온 항목</b>(많은 순, 최대 8개)</p><ul style="margin:2px 0;padding-left:20px">' + ''.join(f'<li>{esc(i["label"])} — 다르다 {i["diff"]}/{i["n"]}명</li>' for i in flag) + '</ul>')
    out.append('<p style="margin:16px 0 4px;font-size:12.5px;color:#52514e">이 메일에는 이름·소속·메모·원본 글을 담지 않습니다. 자세한 내용은 분석 시트(링크: 운영 설정에서 넣음)에서 확인하세요. 이 요약은 법률 자문이나 연구윤리 심의 결과가 아닙니다.</p></div>')
    return ''.join(out)


def email_text(S):
    m, it = S['meta'], S['intake']
    L = []
    if m['demo']:
        L.append(f'※ {DEMO_NOTE}')
    L.append(f'MedTerm-KR 약사 검수 연구용 요약 · {m["today"]}')
    L.append(f'접수 {it["received"]}건 → 분석 반영 {it["accepted_submissions"]}건(약사 {it["raters"]}명). 뺀 것: 형식 오류 {sum(it["rejected"].values())}건 · 동의·면허 확인 {sum(it["excluded_by_gate"].values())}건.')
    for sc in S['scopes'].values():
        L += ['', f'■ {sc["label"]} — {caution(sc["n_raters"])}']
        if sc['n_raters']:
            v, ag = sc['verdicts'], sc['agreement']
            L += [f'  판정 {sc["cells"]}건: 맞다 {v["ok"]} · 다르다 {v["diff"]} · 모르겠다 {v["unsure"]}', f'  S-CVI/Ave {fmt(sc["scvi_ave"])} · S-CVI/UA {fmt(sc["scvi_ua"])} · 일치율 {pct(ag["observed"])} · AC1 {fmt(ag["ac1"])} · α {fmt(ag["alpha"])}']
            for i in sorted([i for i in sc['items'] if i['diff'] > 0], key=lambda i: (-i['diff'], i['no']))[:8]:
                L.append(f'  - {i["label"]}: 다르다 {i["diff"]}/{i["n"]}명')
    L += ['', '이 메일에는 이름·소속·메모·원본 글을 담지 않습니다.']
    return '\n'.join(L) + '\n'


# ── 개인정보 문자열 검사 ──
def leak_check(paths, secrets, S):
    """결과 파일에 약사의 이름·소속·기타 자료·메모가 섞였는지 본다. 사전·고정 문구에 원래 있는 글은 건너뛴다. → 걸린 문자열 수."""
    pub = '\n'.join([i['label'] for sc in S['scopes'].values() for i in sc['items']] + [sc['label'] for sc in S['scopes'].values()] + list(REF_LABEL.values()) + list(REASON_LABEL.values()) +
                    list(GATE_LABEL.values()) + [v for v in V_LABEL.values()] + [lab for _, lab in AFF_RULES] + ['기타', '미기재', DEMO_NOTE, CSS])
    bad = [s for s in secrets if len(s) >= 3 and s not in pub]
    text = ''
    for p in paths:
        if p.lower().endswith(('.json', '.html', '.txt')):
            text += open(p, encoding='utf-8').read() + '\n'
    return sum(1 for s in bad if s in text), len(bad)


# ── 가짜 응답(시험용) ──
def make_demo(items, today, seed=20261107):
    """가짜 응답 CSV 행을 만든다. 이름·소속·메모는 모두 ‘가짜’이며 실제 약사와 무관하다.
    일부러 넣은 문제: 잘린 JSON · 면허 보유 표시 없음 · 모르는 범위 · 다른 형식 · 연구 동의 없음 · 면허 확인 전 · 사전이 바뀐(h 가 다른) 판정 · 같은 약사의 재제출.
    → (헤더, 행들, expected) ; expected['final'][범위][열쇠] = {항목id: 판정}(분석에 쓰여야 하는 최종 판정), expected['counts'] = 접수 현황."""
    rnd = random.Random(seed)
    P = [('가짜약사01', '가짜약국A'), ('가짜약사02', '가짜약국B'), ('가짜약사03', '가짜약국C'), ('가짜약사04', '가짜약국D'), ('가짜약사05', '가짜약국E'), ('가짜약사06', '가짜병원약제부'),
         ('가짜약사07', '가짜병원약제부 분원'), ('가짜약사08', '가짜대학교 약학대학'), ('가짜약사09', '가짜약국F'), ('가짜약사10', '가짜제약 학술팀')]
    NO_CONSENT, NO_LICENSE, UNSURE_HEAVY, PARTIAL, RESUBMIT, STALE = 8, 9, 6, 7, 4, 2
    bad = {s: set(rnd.sample([i['id'] for i in its], 4 if s == 'names' else 3)) for s, its in items['items'].items()}
    plan = []
    for who in range(len(P)):
        plan.append((who, 'names'))
        if who != PARTIAL:
            plan.append((who, 'law'))
    plan.insert(14, (RESUBMIT, 'names'))
    plan += [(-1, 'trunc'), (-2, 'nolicense'), (-3, 'scope'), (-4, 'schema')]
    total = len(plan)
    header = ['타임스탬프', '앱에서 ‘복사하기’를 누른 확인서 글을 여기에 붙여 넣어 주세요', '위 안내를 읽었고 동의합니다', '연구 이용에 동의합니다(선택)', '면허확인(운영자 기입)']
    rows, final, seen = [], {s: {} for s in items['items']}, collections.Counter()
    exp = collections.Counter()
    resub_done = False

    def answers(sid, who, count=None, only=None):
        out = {}
        for it in (items['items'][sid][:count] if count else items['items'][sid]):
            if only is not None and it['id'] not in only:
                continue
            pd, pu = (0.6 if it['id'] in bad[sid] else 0.06), (0.35 if who == UNSURE_HEAVY else 0.05)
            x = rnd.random()
            v = 'diff' if x < pd else ('unsure' if x < pd + pu else 'ok')
            a = {'v': v, 'h': it['h']}
            if v != 'ok' and rnd.random() < 0.7:
                a['m'] = f"{P[who][1]} 에서는 {P[who][0]} 기준으로 표기가 다릅니다 #{it['no']}"
            out[it['id']] = a
        return out
    for n, (who, sid) in enumerate(plan):
        day = today - datetime.timedelta(days=24 - int(n * 24 / total))
        hh, mm, ss = 9 + (n * 7) % 12, (n * 13) % 60, (n * 29) % 60
        stamp = f"{day.year}. {day.month}. {day.day} {'오전' if hh < 12 else '오후'} {hh % 12 or 12}:{mm:02d}:{ss:02d}"
        if who >= 0:
            if who == RESUBMIT and sid == 'names' and seen[(who, sid)]:
                ans = answers(sid, who, only={i['id'] for i in rnd.sample(items['items'][sid], 15)})
            else:
                ans = answers(sid, who, count=40 if who == PARTIAL else None)
            stale_ids = []
            if who == STALE and sid == 'names':
                stale_ids = list(ans)[:5]
                for i in stale_ids:
                    ans[i]['h'] = 'deadbeef00'
            refs = sorted(rnd.sample(RL.REFS, rnd.randint(1, 3)))
            obj = {'schema': RL.SCHEMA, 'scope': sid, 'scope_hash': items['scopes'][sid]['hash'], 'app': '1.6.0', 'created': day.isoformat(),
                   'reviewer': {'name': P[who][0], 'affiliation': P[who][1], 'public': who % 2 == 0, 'license_claimed': True}, 'refs': refs,
                   'refs_other': '가짜참고서적 제3판' if 'other' in refs else '', 'attested': True, 'answers': ans}
            text = json.dumps(obj, ensure_ascii=False, indent=1) + '\n'
            consent = '' if who == NO_CONSENT else '연구 이용에 동의합니다'
            lic = '' if who == NO_LICENSE else 'Y'
            rows.append([stamp, text, '동의합니다', consent, lic])
            exp['received'] += 1
            seen[(who, sid)] += 1
            if who == NO_CONSENT:
                exp['gate:research_consent'] += 1
            elif who == NO_LICENSE:
                exp['gate:license'] += 1
            else:
                exp['accepted'] += 1
                exp['stale'] += len(stale_ids)
                tgt = final[sid].setdefault(norm_key(*P[who]), {})
                for iid, a in ans.items():
                    if iid not in stale_ids:
                        tgt[iid] = a['v']
        else:
            base = {'schema': RL.SCHEMA, 'scope': 'names', 'scope_hash': items['scopes']['names']['hash'], 'app': '1.6.0', 'created': day.isoformat(),
                    'reviewer': {'name': '가짜약사99', 'affiliation': '가짜약국Z', 'public': False, 'license_claimed': True}, 'refs': [], 'refs_other': '', 'attested': True,
                    'answers': answers('names', 0, count=3)}
            if sid == 'trunc':
                text = json.dumps(base, ensure_ascii=False, indent=1)
                text, reason = text[: int(len(text) * 0.6)], 'json'
            elif sid == 'nolicense':
                base['reviewer']['license_claimed'] = False
                text, reason = json.dumps(base, ensure_ascii=False, indent=1), 'license_claim'
            elif sid == 'scope':
                base['scope'] = 'TEST'
                text, reason = json.dumps(base, ensure_ascii=False, indent=1), 'scope'
            else:
                base['schema'] = 'medterm-kr-review/2'
                text, reason = json.dumps(base, ensure_ascii=False, indent=1), 'schema'
            rows.append([stamp, text, '동의합니다', '연구 이용에 동의합니다', 'Y'])
            exp['received'] += 1
            exp['reject:' + reason] += 1
    counts = {'received': exp['received'], 'accepted': exp['accepted'], 'stale': exp['stale'], 'rejected': {k[7:]: v for k, v in exp.items() if k.startswith('reject:')},
              'gate': {k[5:]: v for k, v in exp.items() if k.startswith('gate:')}}
    return header, rows, {'final': final, 'counts': counts}


def write_demo_csv(path, header, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


# ── 단위 시험 ──
def selftest():
    fails = []

    def ok(name, cond, extra=''):
        print(('PASS' if cond else 'FAIL'), name, extra)
        if not cond:
            fails.append(name)

    def close(x, y, t=1e-3):
        return x is not None and abs(x - y) <= t
    pairs = [('a', 'a')] * 20 + [('a', 'b')] * 5 + [('b', 'a')] * 10 + [('b', 'b')] * 15
    po, k = cohen_kappa(pairs)
    ok('Cohen κ = 0.4 (2×2 [[20,5],[10,15]])', close(po, 0.7) and close(k, 0.4), (po, k))
    pa, ac1 = pa_ac1([list(p) for p in pairs], q=2)
    ok('Gwet AC1 = 0.4059 (같은 2×2)', close(pa, 0.7) and close(ac1, 0.40594, 1e-4), (pa, ac1))
    fl = [[0, 0, 0, 0, 14], [0, 2, 6, 4, 2], [0, 0, 3, 5, 6], [0, 3, 9, 2, 0], [2, 2, 8, 1, 1], [7, 7, 0, 0, 0], [3, 2, 6, 3, 0], [2, 5, 3, 2, 2], [6, 5, 2, 1, 0], [0, 2, 2, 3, 7]]
    ok('Fleiss κ = 0.210 (위키백과 예: 10항목·14명·5범주)', close(fleiss_kappa(fl), 0.2099, 5e-4), fleiss_kappa(fl))
    ok('Fleiss: 판정자 수가 다르면 계산 안 함', fleiss_kappa([[2, 0], [1, 0]]) is None)
    A = '1 2 3 3 2 1 4 1 2 * * *'.split()
    B = '1 2 3 3 2 2 4 1 2 5 * 3'.split()
    C = '* 3 3 3 2 3 4 2 2 5 1 *'.split()
    D = '1 2 3 3 2 4 4 1 2 5 1 *'.split()
    units = [[x for x in (A[i], B[i], C[i], D[i]) if x != '*'] for i in range(12)]
    ok('Krippendorff α = 0.743 (Krippendorff 2011 예: 12단위·4관찰자, 결측 있음)', close(kripp_alpha(units), 0.743, 5e-4), kripp_alpha(units))

    def alpha_bf(us):
        us = [u for u in us if len(u) >= 2]
        n = sum(len(u) for u in us)
        do = sum(sum(1 for i in range(len(u)) for j in range(len(u)) if i != j and u[i] != u[j]) / (len(u) - 1) for u in us) / n
        pool = [v for u in us for v in u]
        de = sum(1 for i in range(n) for j in range(n) if i != j and pool[i] != pool[j]) / (n * (n - 1))
        return None if de == 0 else 1 - do / de
    rnd, same = random.Random(1), True
    for _ in range(30):
        us = [[rnd.choice(V_KEYS) for _ in range(rnd.randint(1, 5))] for _ in range(rnd.randint(2, 20))]
        a1, a2 = kripp_alpha(us), alpha_bf(us)
        same = same and ((a1 is None and a2 is None) or (a1 is not None and a2 is not None and abs(a1 - a2) < 1e-9))
    ok('Krippendorff α: 계수 행렬 계산 = 쌍 직접 계산(무작위 30벌)', same)
    ok('k* (n=5, 동의 4) = 0.763', close(kstar(5, 4), 0.763, 1e-3) and close(kstar(3, 3), 1.0), kstar(5, 4))
    ok('I-CVI 기준: 2명 해석 안 함 · 3~5명 1.00 · 6명 이상 0.78', icvi_threshold(2) is None and icvi_threshold(3) == 1.0 and icvi_threshold(5) == 1.0 and icvi_threshold(6) == 0.78 and icvi_threshold(12) == 0.78)
    its = [{'id': f'N-{i}', 'no': i, 'ko': f'성분{i}', 'b': '', 'a': ''} for i in range(1, 4)]
    rt = {'R1': {'N-1': 'ok', 'N-2': 'ok', 'N-3': 'diff'}, 'R2': {'N-1': 'ok', 'N-2': 'unsure', 'N-3': 'diff'}, 'R3': {'N-1': 'ok', 'N-2': 'ok'}}
    st = scope_stats(its, rt)
    i1, i2, i3 = st['items']
    ok('I-CVI: 3명 전원 맞다 = 1.00 충족', i1['icvi'] == 1.0 and i1['status'] == 'pass')
    ok('I-CVI: 맞다 2·모르겠다 1 = 0.67 미달(기준 1.00), ‘모름’ 뺀 비율 1.00', close(i2['icvi'], 2 / 3) and i2['status'] == 'fail' and i2['icvi_excl_unsure'] == 1.0)
    ok('I-CVI: 판정자 2명 항목은 해석 안 함', i3['n'] == 2 and i3['status'] == 'na' and i3['kstar'] is None)
    ok('S-CVI/Ave = (1.00+0.67)/2 · S-CVI/UA = 1/2', close(st['scvi_ave'], (1 + 2 / 3) / 2) and close(st['scvi_ua'], 0.5) and st['evaluable_items'] == 2, (st['scvi_ave'], st['scvi_ua']))
    ok('연구 동의 값 읽기', research_yes('연구 이용에 동의합니다') and not research_yes('') and not research_yes('동의하지 않습니다') and not research_yes('아니오') and not research_yes('No'))
    ok('면허 확인 값 읽기', license_yes('Y') and license_yes('확인') and not license_yes('') and not license_yes('미확인'))
    ok('타임스탬프(오후 12시간제·24시간제)', parse_ts('2026. 11. 7 오후 3:55:12') == (datetime.date(2026, 11, 7), 15 * 3600 + 55 * 60 + 12) and parse_ts('2026-11-07 15:30:00') == (datetime.date(2026, 11, 7), 15 * 3600 + 1800)
       and parse_ts('2026. 11. 7 오전 12:05:00') == (datetime.date(2026, 11, 7), 300) and parse_ts('') == (None, 0))
    ok('같은 사람 열쇠: 공백·대소문자 차이는 같은 사람', norm_key('홍길동 ', '새봄  약국') == norm_key('홍길동', '새봄 약국') and norm_key('홍길동', '새봄약국') != norm_key('홍길동', '새봄약국2'))
    ag = aff_summary(['가약국', '나약국', '다약국', '라약국', '가병원', '나병원', '그냥', ''], 3)
    ok('소속 분류: 3명 미만 분류는 숨김', ag['shown'] == {'약국': 4} and ag['hidden_people'] == 4, ag)
    ok('오류 분류 말', reason_of('이 자료에 없는 항목 id 가 있습니다') == 'item_id' and reason_of('메모: 300자를 넘습니다') == 'length' and reason_of('알 수 없는 범위입니다') == 'scope')
    S0 = {'scopes': {}}
    ok('개인정보 검사: 이름이 결과에 있으면 잡는다', leak_check_text('가짜약사01 이 있음', {'가짜약사01', '새봄약국'}, S0) == 1 and leak_check_text('아무것도 없음', {'가짜약사01'}, S0) == 0)
    print(f"\n{'모두 통과' if not fails else '실패 ' + str(len(fails)) + '건: ' + ', '.join(fails)}")
    return 0 if not fails else 1


def leak_check_text(text, secrets, S):
    """leak_check 와 같은 규칙을 글 한 덩어리에 적용(시험용)."""
    pub = CSS + '\n'.join(list(REF_LABEL.values()) + list(V_LABEL.values()) + [DEMO_NOTE])
    return sum(1 for s in secrets if len(s) >= 3 and s not in pub and s in text)


# ── 실행 ──
def _inside(path, folder):
    p, f = os.path.realpath(path), os.path.realpath(folder)
    return p == f or p.startswith(f + os.sep)


def csv_safe(t):
    """엑셀·시트가 글을 수식으로 읽지 않도록(=, +, -, @ 로 시작하는 글 앞에 작은따옴표를 붙임). 약사가 쓴 글은 믿을 수 없는 입력이다."""
    t = '' if t is None else str(t)
    return "'" + t if t[:1] in ('=', '+', '-', '@', '\t', '\r') else t


def main(argv=None):
    ap = argparse.ArgumentParser(description='약사 확인서 연구용 분석·그래프 도구(운영자용)', epilog=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('inputs', nargs='*', help='응답 CSV · 확인서 JSON · 그 폴더')
    ap.add_argument('--out', help='결과를 쓸 폴더')
    ap.add_argument('--data-dir', default=os.path.join(root, 'data'))
    ap.add_argument('--today', help='오늘 날짜(YYYY-MM-DD; 작성일 검사 기준). 기본: 오늘')
    ap.add_argument('--min-cell', type=int, default=3, help='이보다 적은 칸(소속 분류·참고 자료)은 숨김(기본 3)')
    ap.add_argument('--no-gates', action='store_true', help='연구 동의·면허 확인 열을 보지 않는다(시험용; 연구에는 쓰지 말 것)')
    ap.add_argument('--col-json', type=int, help='확인서 글 열 번호(1부터)')
    ap.add_argument('--col-ts', type=int, help='타임스탬프 열 번호')
    ap.add_argument('--col-consent', type=int, help='연구 이용 동의 열 번호')
    ap.add_argument('--col-license', type=int, help='면허확인 열 번호')
    ap.add_argument('--demo', action='store_true', help='가짜 응답을 만들어 전체를 돌린다(결과에 가짜라고 표시)')
    ap.add_argument('--save-demo-input', help='--demo 가 만든 가짜 응답 CSV 를 이 파일로도 저장(결과 폴더 밖만)')
    ap.add_argument('--selftest', action='store_true', help='통계·규칙 단위 시험')
    ap.add_argument('--link-table', help='[운영자 전용] 약사 번호↔이름·소속 표를 이 파일로(결과 폴더 밖만)')
    ap.add_argument('--export-memos', help='[운영자 전용] 메모를 약사 번호·항목과 함께 이 파일로(결과 폴더 밖만)')
    ap.add_argument('--export-ratings', help='약사 번호·항목·판정만 담은 가명 판정표 CSV(통계 프로그램용)')
    ap.add_argument('--export-checks', help='응답 한 줄마다 점검 결과(정상·제외·형식 오류와 이유)를 적은 CSV — 이름·소속·메모 없음(약사는 R번호)')
    a = ap.parse_args(argv)
    if a.selftest:
        return selftest()
    if not a.out:
        ap.error('--out 결과폴더가 필요합니다')
    try:
        today = datetime.date.fromisoformat(a.today) if a.today else datetime.date.today()
    except ValueError:
        ap.error('--today 는 YYYY-MM-DD 형식이어야 합니다')
    for opt in ('link_table', 'export_memos', 'save_demo_input'):
        if getattr(a, opt) and _inside(getattr(a, opt), a.out):
            ap.error(f'--{opt.replace("_", "-")} 파일은 결과 폴더 밖에 써야 합니다(결과 폴더는 메일·공유에 쓰일 수 있어서)')
    if a.save_demo_input and not a.demo:
        ap.error('--save-demo-input 은 --demo 와 함께만 씁니다')
    items = RL.build_items(a.data_dir)
    with tempfile.TemporaryDirectory(prefix='review_research_') as work:
        if a.demo:
            header, rows, _exp = make_demo(items, today)
            demo_csv = os.path.join(work, 'demo_responses.csv')
            write_demo_csv(demo_csv, header, rows)
            if a.save_demo_input:
                shutil.copyfile(demo_csv, a.save_demo_input)
            print(f'※ {DEMO_NOTE} 가짜 응답 {len(rows)}행을 만들어 돌립니다(저장하지 않음).')
            a.inputs = [demo_csv]
            a.col_json = a.col_ts = a.col_consent = a.col_license = None
        if not a.inputs:
            ap.error('입력(CSV·JSON·폴더)을 하나 이상 주세요')
        recs, cols = load_inputs(a.inputs, a)
        if not recs:
            print('읽은 응답이 없습니다.', file=sys.stderr)
            return 1
        S, ops = analyze(recs, items, today, gates_on=not a.no_gates, min_cell=a.min_cell, demo=a.demo)
        S['meta']['columns'] = cols or None
        S['meta']['email_subject'] = subject(S)
        stage = os.path.join(work, 'stage')
        os.makedirs(stage)
        files = make_charts(S, ops, stage)
        out = {'summary.json': json.dumps(S, ensure_ascii=False, indent=1) + '\n', 'report.html': render_report(S, files), 'email.html': email_html(S), 'email.txt': email_text(S)}
        paths = list(files.values())
        for name, text in out.items():
            p = os.path.join(stage, name)
            open(p, 'w', encoding='utf-8').write(text)
            paths.append(p)
        hit, tested = leak_check(paths, ops['secrets'], S)
        if hit:
            print(f'오류: 이름·소속·메모·기타 자료 {hit}건이 결과 파일에 섞여 있습니다. 결과를 쓰지 않았습니다.', file=sys.stderr)
            return 3
        os.makedirs(a.out, exist_ok=True)
        for p in paths:
            shutil.copyfile(p, os.path.join(a.out, os.path.basename(p)))
    if a.link_table:
        with open(a.link_table, 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.writer(f)
            w.writerow(['약사번호', '이름', '소속', '범위'])
            for r, v in sorted(ops['link'].items()):
                w.writerow([r, csv_safe(v['name']), csv_safe(v['org']), ' '.join(sorted(v['scopes']))])
        os.chmod(a.link_table, 0o600)
        print(f'[운영자 전용] 이름·소속이 든 표를 만들었습니다: {a.link_table} — 메일에 붙이거나 공유하지 마세요.')
    if a.export_memos:
        with open(a.export_memos, 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.writer(f)
            w.writerow(['약사번호', '범위', '항목번호', '항목', '판정', '메모'])
            lab = {sid: {i['id']: i for i in its} for sid, its in items['items'].items()}
            for sid, d in ops['memos'].items():
                for r, mm in sorted(d.items()):
                    for iid, t in mm.items():
                        w.writerow([r, sid, lab[sid][iid]['no'], csv_safe(item_label(lab[sid][iid])), V_LABEL[ops['ratings'][sid][r][iid]], csv_safe(t)])
        os.chmod(a.export_memos, 0o600)
        print(f'[운영자 전용] 메모가 든 파일을 만들었습니다: {a.export_memos} — 이름·약국명이 섞여 있을 수 있으니 지우고 쓰세요.')
    if a.export_checks:
        with open(a.export_checks, 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.writer(f)
            w.writerow(['입력순번', '시각', '결과', '이유', 'status', 'reason', 'scope', 'rid', 'n', 'stale'])
            for R in ops['records']:
                lab = {'ok': '정상 반영', 'gated': '확인 대기' if R['reason'] == 'license' else '분석 제외', 'rejected': '형식 오류'}[R['status']]
                why = '' if R['status'] == 'ok' else (GATE_LABEL if R['status'] == 'gated' else REASON_LABEL).get(R['reason'], R['reason'])
                w.writerow([R['idx'] + 1, csv_safe(R['ts']), lab, why, R['status'], R['reason'] or '', R['scope'] or '', R['rid'] or '', R['n'] or '', R['stale'] or ''])
        print(f'응답 한 줄마다 점검 결과를 만들었습니다: {a.export_checks}')
    if a.export_ratings:
        with open(a.export_ratings, 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.writer(f)
            w.writerow(['rater', 'scope', 'item_id', 'item_no', 'verdict'])
            for sid, d in ops['ratings'].items():
                no = {i['id']: i['no'] for i in items['items'][sid]}
                for r, rt in sorted(d.items()):
                    for iid, v in sorted(rt.items(), key=lambda kv: no[kv[0]]):
                        w.writerow([r, sid, iid, no[iid], v])
        print(f'가명 판정표를 만들었습니다: {a.export_ratings}')
    print(f"약사 {S['intake']['raters']}명 · 분석 확인서 {S['intake']['accepted_submissions']}건 / 접수 {S['intake']['received']}건 → {a.out}")
    print(f'개인정보 문자열 점검: {tested}개 문자열이 결과 파일에 없음(통과)')
    gu = S['intake']['excluded_by_gate'].get('gate_unknown', 0)
    if gu:
        print(f'알림: 연구 동의·면허 확인 열을 찾지 못해 {gu}건을 뺐습니다. 시트에 ‘연구 이용…동의’·‘면허…확인’ 이름의 열이 있는지 보거나 --col-consent/--col-license 로 열 번호를 알려 주세요.', file=sys.stderr)
    if not S['intake']['raters']:
        print('분석할 약사가 없습니다(접수 현황만 담은 결과를 만들었습니다).', file=sys.stderr)
    return 0 if S['intake']['raters'] else 2


if __name__ == '__main__':
    sys.exit(main())
