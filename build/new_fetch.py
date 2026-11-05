#!/usr/bin/env python
"""최신 승인·임상 등록·화합물 식별자 내려받기 — 키·로그인 없이 받을 수 있는 공개 자료만.
 받는 곳(모두 공개): ① FDA CDER '신약 승인' 연도별 표(미국 정부 저작물) ② ClinicalTrials.gov API v2(미국 NLM) ③ PubChem PUG REST(미국 NLM)
 쓰는 법: python build/new_fetch.py --raw <저장폴더> [--only fda,names,trials,chem,sim] [--rate 3] [--limit N]
   fda    FDA 신약 승인표(2021~올해; 2020년 이전은 누리집 주소 형식이 달라 받지 않음) → fda_novel.json
   names  핵심·확장 사전과 FDA 신약의 영문 성분명 목록 → names.json (아래 두 단계의 입력)
   trials 성분별 임상시험 등록 현황 → trials.jsonl   (이어받기: 이미 받은 이름은 건너뜀)
          유의어 확장을 끄고(EXPANSION[None]) 성분 25개씩 묶어 받은 뒤, 이름이 시험의 '중재 이름·다른 이름'(없으면 제목)에 실제로 들어간 등록만 센다.
          (확장을 켜면 chlorotrianisene 이 711건처럼 엉뚱한 시험까지 세어져 건수가 5~15배 부풀려진다.)
   chem   성분별 PubChem 화합물 식별자 → chem.jsonl  (이어받기)
   sim    chem 에서 찾은 화합물의 PubChem 2D 유사 이웃(유사도 0.9 이상) → sim.jsonl  (--limit N: 앞쪽 N개 이름만, 기본 1000; 이어받기)
 원칙: 저장폴더는 저장소 밖에 둔다(원자료는 커밋하지 않는다). 받은 파일은 '신뢰할 수 없는 데이터'로 읽기만 한다.
 개인정보(이메일 등)는 요청에 넣지 않는다(일반 UA만). 호출 속도는 각 서비스 안내 이하로 제한한다(PubChem 초당 5회 이하, ClinicalTrials.gov 분당 50회 안팎)."""
import argparse, collections, html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

UA = 'MedTermKR-build/1.3 (open-data research; python-urllib)'
FDA_URL = 'https://www.fda.gov/drugs/novel-drug-approvals-fda/novel-drug-approvals-{y}'
CT_API = 'https://clinicaltrials.gov/api/v2/studies'
PUBCHEM = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug'
CT_FIELDS = 'NCTId,BriefTitle,Phase,OverallStatus,LeadSponsorName,LeadSponsorClass,StartDate,PrimaryCompletionDate,Condition'
CT_FIELDS_X = CT_FIELDS + ',InterventionName,InterventionOtherName'   # 이름 대조용 (중재 이름·다른 이름)


def _req(url, tries=5, timeout=90, not_found_ok=False, accept='application/json'):
    """GET. 404 는 '없음'(None)으로 돌려주고(not_found_ok), 429·5xx·연결 오류만 기다렸다 다시 시도한다."""
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': accept})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404 and not_found_ok: return None
            last = e
            if e.code == 429: time.sleep(min(90, 15 * (i + 1)))
            elif e.code >= 500: time.sleep(4 * (i + 1))
            else: break                      # 400 등 요청 자체의 문제는 되풀이하지 않는다
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = e; time.sleep(4 * (i + 1))
    raise RuntimeError(f'요청 실패: {url[:110]} — {last}')


def note_fetch(raw, rel):
    p = os.path.join(raw, 'fetch_log.json')
    try: log = json.load(open(p, encoding='utf-8'))
    except (OSError, ValueError): log = {}
    log[rel] = time.strftime('%Y-%m-%d')
    json.dump(log, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, sort_keys=True)


# ── ① FDA 신약 승인표 ────────────────────────────────────────────────────────────────────────────────
def parse_fda(page, year):
    """연도별 표(번호·약 이름·성분·승인일·승인 용도) → 목록. 표의 열 수가 5가 아니면 건너뛴다(형식이 바뀌면 개수로 드러난다)."""
    out = []
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', page, flags=re.S):
        cells = [re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', c))).strip() for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', tr, flags=re.S)]
        if len(cells) < 5 or not re.match(r'^\d+\.?$', cells[0]): continue
        m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', cells[3])
        if not m: continue
        use = re.sub(r'\s*Drug Trials Snapshot\s*$', '', cells[4]).strip(' *')
        out.append({'no': int(cells[0].rstrip('.')), 'brand': cells[1].strip(' *'), 'ingredient': cells[2].strip(' *'),
                    'date': f'{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}', 'use': use, 'year': year})
    return out


def fetch_fda(raw, y0=2021):
    items = []; srcs = []
    for y in range(y0, int(time.strftime('%Y')) + 1):
        url = FDA_URL.format(y=y)
        b = _req(url, accept='text/html', not_found_ok=True)
        if b is None: print('FDA', y, '없음'); continue
        rows = parse_fda(b.decode('utf-8', 'replace'), y); items += rows; srcs.append(url)
        print('FDA', y, len(rows)); time.sleep(2)
    items.sort(key=lambda r: (r['date'], r['no']), reverse=True)
    json.dump({'fetched': time.strftime('%Y-%m-%d'), 'sources': srcs, 'items': items}, open(os.path.join(raw, 'fda_novel.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    note_fetch(raw, 'fda_novel.json'); print('fda_novel.json', len(items))


# ── 이름 목록 ────────────────────────────────────────────────────────────────────────────────────────
BIO_STEM = re.compile(r'^(.*(?:mab|cept|ase|kin|tug|ra|ide|ptin|cel|vec))-[a-z]{4}$')

def query_names(here_root, raw):
    """묻는 순서가 곧 중요도: ① FDA 신약 ② 핵심 사전 ③ 확장 사전(국내 등재 품목이 많은 성분부터). 중간에 멈춰도 앞쪽이 먼저 채워진다."""
    names = {}
    def add(s):
        s = (s or '').strip().lower()
        if s and all(ord(c) < 128 for c in s) and len(s) > 2: names.setdefault(s, s)
    p = os.path.join(raw, 'fda_novel.json')
    if os.path.exists(p):
        for r in json.load(open(p, encoding='utf-8'))['items']:
            ing = re.sub(r'\s*\(.*?\)', '', r['ingredient']).strip().lower()
            add(ing)
            m = BIO_STEM.match(ing)
            if m: add(m.group(1))                  # 바이오의약품 접미(-wuug 등)를 뗀 기본 이름도 함께 묻는다
    core = json.load(open(os.path.join(here_root, 'data', 'medterm.json'), encoding='utf-8'))
    for c in core['concepts']:
        if c.get('type') == 'VTM': add(c.get('label_en'))
    ext = json.load(open(os.path.join(here_root, 'data', 'medterm_ext.json'), encoding='utf-8'))['entities']
    for e in sorted(ext, key=lambda e: -((e.get('kr') or {}).get('items', 0))): add(e.get('label_en'))
    out = list(names)
    json.dump(out, open(os.path.join(raw, 'names.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print('names.json', len(out))


# ── ② ClinicalTrials.gov ────────────────────────────────────────────────────────────────────────────
PH = {'EARLY_PHASE1': '0', 'PHASE1': '1', 'PHASE2': '2', 'PHASE3': '3', 'PHASE4': '4', 'NA': 'NA'}
ACTIVE = {'RECRUITING', 'NOT_YET_RECRUITING', 'ACTIVE_NOT_RECRUITING', 'ENROLLING_BY_INVITATION'}
# 주의: 원자료 st 의 act 는 ACTIVE 전체(모집 예정 nyr 포함), rec 는 그중 RECRUITING 이다. 겹침은 build/new_build.py 가 정리한다(act-nyr, rec 버림).
STOPPED = {'TERMINATED', 'WITHDRAWN', 'SUSPENDED'}

def phase_label(phases):
    ks = [PH.get(p, p) for p in (phases or [])]
    ks = [k for k in ks if k != 'NA']
    return '/'.join(ks) if ks else 'NA'

def ym(d): return (d or '')[:7]

def add_months(ym_s, k):
    y, m = int(ym_s[:4]), int(ym_s[5:7]); t = y * 12 + (m - 1) + k
    return '%04d-%02d' % (t // 12, t % 12 + 1)

START_HORIZON = 36   # 시작(예정) 달이 만든 날로부터 이 개월 수를 넘는 등록은 '가장 늦은 시작 달'(last_start)·예시 정렬에서 뺀다(입력 오류가 목록 맨 위를 차지하는 것을 막음; 건수·단계·상태에는 그대로 센다)

def summarize_trials(name, total, studies, today):
    ph = collections.Counter(); st = collections.Counter(); spi = collections.Counter(); cond = collections.Counter(); ind = 0
    last_start = ''; next_pc = ''; act = []; lim = add_months(today, START_HORIZON)
    for s in studies:
        p = s.get('protocolSection', {})
        sm = p.get('statusModule', {}); sp = p.get('sponsorCollaboratorsModule', {}).get('leadSponsor', {})
        lab = phase_label(p.get('designModule', {}).get('phases')); ph[lab] += 1
        ov = sm.get('overallStatus', '')
        st['act' if ov in ACTIVE else 'done' if ov == 'COMPLETED' else 'stop' if ov in STOPPED else 'unk'] += 1
        if ov == 'RECRUITING': st['rec'] += 1
        if ov == 'NOT_YET_RECRUITING': st['nyr'] += 1
        if sp.get('class') == 'INDUSTRY': ind += 1; spi[sp.get('name', '')] += 1
        for c in p.get('conditionsModule', {}).get('conditions', [])[:6]: cond[c] += 1
        s0 = ym(sm.get('startDateStruct', {}).get('date')); pc = ym(sm.get('primaryCompletionDateStruct', {}).get('date'))
        if s0 > last_start and s0 <= lim: last_start = s0
        if ov in ACTIVE:
            if pc and pc >= today and (not next_pc or pc < next_pc): next_pc = pc
            if any(x in lab for x in '23'): act.append((s0, lab, ov, sp.get('name', ''), pc, p.get('identificationModule', {}).get('nctId', ''), p.get('identificationModule', {}).get('briefTitle', '')))
    act.sort(key=lambda a: ((a[0] if a[0] <= lim else ''),) + a[1:], reverse=True)
    ex = [{'id': a[5], 'ph': a[1], 'st': a[2], 'sp': a[3][:40], 's': a[0], 'pc': a[4], 't': a[6][:90]} for a in act[:3]]
    return {'q': name, 'n': total, 'cap': total > len(studies), 'ph': dict(ph), 'st': dict(st), 'ind': ind,
            'spi': [n for n, _ in spi.most_common(3)], 'cond': [c for c, _ in cond.most_common(3)], 'last_start': last_start, 'next_pc': next_pc, 'ex': ex}

# ── 정확 일치 수집(유의어 확장 끔) ───────────────────────────────────────────────────────────────────
CT_BATCH = 25           # 한 번에 묻는 성분 수
CT_MAX_BATCH = 6000     # 묶음의 등록 수가 이보다 많으면 반으로 나눠 다시 묻는다(흔한 약이 끼어 있다는 뜻)
CT_SINGLE_PAGES = 8     # 한 성분만 남았는데도 많으면(흔한 약) 시작일 최근순으로 이 쪽수(쪽당 1,000건)까지만 받는다. 더 있으면 cap(건수는 받은 일치 수 = '이상')
CT_HEAVY = 400          # --hint 로 준 이전 건수가 이 이상이면 '흔한 약'으로 보고 묶음에서 빼 한 성분씩 뒤에 받는다
CT_KEEP = 1000          # 한 성분의 요약에 쓰는 등록은 시작일이 가장 최근인 1,000건까지(넘으면 cap 표시)
CT_PACE = 1.25          # 요청 사이 최소 간격(초). ClinicalTrials.gov 는 분당 50회 안팎을 안내한다
_ct_last = [0.0]
_QUAL = {'human', 'regular', 'dibasic', 'monobasic', 'ammoniated', 'synthetic', 'usp', 'isomer', 'anhydrous', 'ext', 'recombinant'}
_DOSE = re.compile(r'\s+\d[\d.,]*\s*(?:mg|g|mcg|iu|i\.u|ml|%)?\.?$')


def _norm(s):
    """소문자로 바꾸고 영숫자 아닌 것은 모두 공백 하나로 — 앞뒤 공백을 붙여 낱말 단위로 포함 여부를 본다."""
    return ' ' + re.sub(r'[^0-9a-z]+', ' ', (s or '').lower()).strip() + ' '


def components(name):
    """이름 → 검색 문구 목록. 쉼표·슬래시·and 로 이어진 복합제(예: 'nirmatrelvir, ritonavir')는 구성 성분 문구들을 돌려주고(모두 들어 있어야 센다),
    'insulin, regular, human' 처럼 뒤가 수식어이면 앞부분만 쓴다. '(' 뒤와 끝의 용량 표기는 뗀다."""
    s = _DOSE.sub('', name.lower().split('(')[0].strip())
    parts = [p for p in re.split(r',|/|\band\b', s) if p.strip()]
    toks = [_norm(p).split() for p in parts]
    if len(parts) >= 2 and all(1 <= len(t) <= 3 and sum(map(len, t)) >= 4 and not any(c.isdigit() for w in t for c in w) and not (set(t) & _QUAL) for t in toks):
        out = []
        for t in toks:
            ph = ' '.join(t)
            if ph not in out: out.append(ph)
        return out
    head = _norm(parts[0] if parts else s).strip()
    return [head] if head else []


_STOP = {'of', 'the', 'and', 'or', 'not', 'a', 'an', 'in', 'for', 'with', 'to', 'on'}

def ct_term(comps):
    """검색식 조각: 확장 끔 + 낱말마다 AND. (따옴표 문구 검색은 확장을 끄면 'tebipenem pivoxil' 처럼 있는 이름도 0건으로 돌려주는 경우가 있어 쓰지 않는다.
    낱말 AND 는 문구보다 넓은 후보를 주고, 실제 이름 대조는 아래 matches 가 낱말 순서·붙어 있음까지 본다.)"""
    toks = []
    for c in comps:
        for t in c.split():
            if len(t) >= 2 and t not in _STOP and t not in toks: toks.append(t)
    if not toks: return ''
    one = ['EXPANSION[None]' + t for t in toks]
    return one[0] if len(one) == 1 else '(' + ' AND '.join(one) + ')'


def _texts(s):
    p = s.get('protocolSection', {})
    iv = []
    for i in (p.get('armsInterventionsModule') or {}).get('interventions') or []:
        iv.append(_norm(i.get('name'))); iv += [_norm(x) for x in (i.get('otherNames') or [])]
    ti = _norm(p.get('identificationModule', {}).get('briefTitle'))
    co = ' '.join(_norm(c) for c in (p.get('conditionsModule') or {}).get('conditions') or [])
    return ' '.join(iv), ti, co


def matches(tx, comps):
    """모든 구성 문구가 ① 중재 이름·다른 이름에 있거나 ② 제목에 있고 질환(condition)에는 없을 때만 센다
    (②의 단서는 'cocaine dependence' 같은 질환 이름 때문에 약이 아닌 시험이 세어지는 것을 막는다)."""
    iv, ti, co = tx
    for c in comps:
        k = ' ' + c + ' '
        if k in iv: continue
        if k in ti and k not in co: continue
        return False
    return True


def start_of(s):
    return (s.get('protocolSection', {}).get('statusModule', {}).get('startDateStruct') or {}).get('date') or ''


def ct_pages(expr, max_pages, sort=None, abort_total=None):
    """한 검색식의 결과를 쪽(1,000건)별로 받는다. 첫 쪽에서 전체 건수가 abort_total 보다 크면 (None, 건수, True)로 곧바로 돌려준다.
    max_pages 쪽을 받고도 다음 쪽이 남았으면 마지막 값이 True(잘림)."""
    studies, token, total, k = [], None, None, 0
    while True:
        q = {'query.intr': expr, 'pageSize': 1000, 'countTotal': 'true', 'fields': CT_FIELDS_X}
        if sort: q['sort'] = sort
        if token: q['pageToken'] = token
        w = _ct_last[0] + CT_PACE - time.time()
        if w > 0: time.sleep(w)
        _ct_last[0] = time.time()
        d = json.loads(_req(CT_API + '?' + urllib.parse.urlencode(q)))
        if total is None:
            total = d.get('totalCount', 0)
            if abort_total is not None and total > abort_total: return None, total, True
        studies += d.get('studies', []); token = d.get('nextPageToken'); k += 1
        if not token or k >= max_pages: break
    return studies, total, bool(token)


def make_record(name, matched, truncated, today):
    """일치한 등록 → 요약 한 줄. 시작일이 가장 최근인 CT_KEEP 건으로 요약하고, 그보다 많거나(또는 받다가 멈춰 더 있을 수 있으면) cap 을 켠다(건수는 '이상')."""
    matched = sorted(matched, key=start_of, reverse=True)
    kept = matched[:CT_KEEP]
    rec = summarize_trials(name, len(matched), kept, today)
    if truncated: rec['cap'] = True
    return rec


def fetch_trials_group(items, today, emit, stats):
    """items = [(이름, 구성 문구들)]. 묶음으로 받고, 너무 크면 반으로 나눠 다시 묻는다. 한 성분만 남으면 시작일 최근순으로 최대 CT_SINGLE_PAGES 쪽."""
    live = [(n, c) for n, c in items if c and ct_term(c)]
    for n, c in items:
        if not (c and ct_term(c)): emit(summarize_trials(n, 0, [], today))
    if not live: return
    if len(live) == 1:
        n, c = live[0]
        studies, total, more = ct_pages(ct_term(c), CT_SINGLE_PAGES, sort='StartDate:desc')
        stats['requests'] += 1; stats['single'] += 1
        if more: stats['truncated'] += 1
        emit(make_record(n, [s for s in studies if matches(_texts(s), c)], more, today)); return
    studies, total, more = ct_pages(' OR '.join(ct_term(c) for _, c in live), 10 ** 6, abort_total=CT_MAX_BATCH)
    stats['requests'] += max(1, -(-(total or 0) // 1000))
    if studies is None:
        stats['splits'] += 1; h = len(live) // 2
        fetch_trials_group(live[:h], today, emit, stats); fetch_trials_group(live[h:], today, emit, stats); return
    stats['studies'] += len(studies)
    tx = [_texts(s) for s in studies]
    for n, c in live:
        emit(make_record(n, [s for s, t in zip(studies, tx) if matches(t, c)], False, today))


def fetch_trials_one(name, today):
    """한 성분만 받아 요약 한 줄을 돌려준다(점검용)."""
    out = []; fetch_trials_group([(name, components(name))], today, out.append, collections.Counter()); return out[0]


def run_trials(raw, names, today, limit=0, hint=None):
    """names 를 앞에서부터 CT_BATCH 개씩 묶어 받는다. hint({이름: 이전 건수})가 있으면 건수가 CT_HEAVY 이상인 이름(흔한 약)은 묶음에서 빼
    가벼운 이름을 모두 받은 뒤 한 성분씩 받는다(묶음에 끼면 반씩 나눠 다시 묻느라 요청이 크게 늘기 때문). 이어받기: 이미 받은 이름은 건너뛴다."""
    path = os.path.join(raw, 'trials.jsonl'); done = set(); hint = hint or {}
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            try: done.add(json.loads(line)['q'])
            except (ValueError, KeyError): pass
    todo = [n for n in names if n not in done]
    if limit: todo = todo[:limit]
    light = [n for n in todo if hint.get(n, 0) < CT_HEAVY]; heavy = [n for n in todo if hint.get(n, 0) >= CT_HEAVY]
    print('trials.jsonl 남은', len(todo), f'(가벼운 {len(light)} · 흔한 약 {len(heavy)}) / 전체', len(names), flush=True)
    t0 = time.time(); stats = collections.Counter(); fails = 0; n_done = 0
    groups = [light[i:i + CT_BATCH] for i in range(0, len(light), CT_BATCH)] + [[n] for n in heavy]
    with open(path, 'a', encoding='utf-8') as f:
        for gi, chunk in enumerate(groups):
            recs = []
            try: fetch_trials_group([(n, components(n)) for n in chunk], today, recs.append, stats)
            except RuntimeError as e:
                fails += 1; print('묶음 건너뜀', chunk[0], '…', str(e)[:80], flush=True)
                if fails > 15: raise SystemExit('실패가 많아 멈춥니다 — 나중에 같은 명령으로 이어받으세요')
                continue
            for r in recs: f.write(json.dumps(r, ensure_ascii=False) + '\n')
            f.flush(); n_done += len(recs)
            if gi % 5 == 4 or gi == len(groups) - 1:
                el = time.time() - t0
                print(f"trials.jsonl {n_done}/{len(todo)} ({el:.0f}s) 요청 {stats['requests']} · 받은 등록 {stats['studies']} · 나눔 {stats['splits']} · 단독 {stats['single']} (잘림 {stats['truncated']})", flush=True)
    note_fetch(raw, 'trials.jsonl'); print('trials.jsonl 완료', dict(stats), flush=True)


# ── ③ PubChem ───────────────────────────────────────────────────────────────────────────────────────
def pick_chem(name, props):
    """PubChem 이름 검색은 같은 이름이 여러 화합물에 걸릴 수 있다(예: scopolamine → 14건, 첫 건이 복합 제품). 제목이 이름과 정확히 같은 것만 쓴다.
    한 건뿐이면 그것을 쓰되 'single' 로 표시한다. 정확히 같은 것이 없고 여럿이면 연결하지 않는다('ambig')."""
    n = name.lower()
    exact = [p for p in props if (p.get('Title') or '').lower() == n]
    if exact: return min(exact, key=lambda p: p['CID']), 'exact'
    if len(props) == 1: return props[0], 'single'
    return None, 'ambig'

def fetch_chem_one(name):
    u = f'{PUBCHEM}/compound/name/{urllib.parse.quote(name, safe="")}/property/InChIKey,MolecularFormula,MolecularWeight,Title/JSON'
    b = _req(u, not_found_ok=True)
    if b is None: return {'q': name}
    props = json.loads(b)['PropertyTable']['Properties']
    p, how = pick_chem(name, props)
    if p is None: return {'q': name, 'm': len(props), 'how': how}
    return {'q': name, 'cid': p.get('CID'), 'ik': p.get('InChIKey'), 'f': p.get('MolecularFormula'), 'mw': p.get('MolecularWeight'), 't': p.get('Title'), 'm': len(props), 'how': how}


def fetch_sim_one(rec):
    """PubChem 2D 구조 유사 화합물(Tanimoto 0.9 이상, 최대 300개)의 CID 목록. 결과가 바로 오지 않는 무거운 질의(Waiting)는 nb=None 으로 둔다."""
    cid = rec['cid']
    b = _req(f'{PUBCHEM}/compound/fastsimilarity_2d/cid/{cid}/cids/JSON?Threshold=90&MaxRecords=300', not_found_ok=True, timeout=90)
    j = json.loads(b) if b else {}
    ids = (j.get('IdentifierList') or {}).get('CID')
    return {'q': rec['q'], 'cid': cid, 'nb': ids if isinstance(ids, list) else None}


def run_pool_jsonl(raw, fname, items, fn, rate, workers=3):
    """items(각 항목에 'q')를 스레드 몇 개로 나눠 받는다. 전체 호출 속도는 초당 rate 를 넘지 않는다. 이어받기 가능."""
    import concurrent.futures as cf, threading
    path = os.path.join(raw, fname); done = set()
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            try: done.add(json.loads(line)['q'])
            except (ValueError, KeyError): pass
    todo = [x for x in items if x['q'] not in done]
    print(fname, '남은', len(todo), '/ 전체', len(items), flush=True)
    lock = threading.Lock(); state = {'next': 0.0, 'n': 0, 'fails': 0}; t0 = time.time()
    with open(path, 'a', encoding='utf-8') as f:
        def job(x):
            with lock:
                now = time.time(); wait = max(0.0, state['next'] - now); state['next'] = max(now, state['next']) + 1.0 / rate
            if wait: time.sleep(wait)
            try: rec = fn(x)
            except RuntimeError as e:
                with lock:
                    state['fails'] += 1; print('건너뜀', x['q'], str(e)[:80], flush=True)
                    if state['fails'] > 40: raise SystemExit('실패가 많아 멈춥니다 — 나중에 같은 명령으로 이어받으세요')
                return
            with lock:
                f.write(json.dumps(rec, ensure_ascii=False) + '\n'); f.flush(); state['n'] += 1
                if state['n'] % 100 == 0: print(f"{fname} {state['n']}/{len(todo)} ({time.time() - t0:.0f}s)", flush=True)
        with cf.ThreadPoolExecutor(workers) as ex: list(ex.map(job, todo))
    note_fetch(raw, fname); print(fname, '완료', flush=True)


def run_jsonl(raw, fname, names, fn, rate, limit):
    path = os.path.join(raw, fname); done = set()
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            try: done.add(json.loads(line)['q'])
            except (ValueError, KeyError): pass
    todo = [n for n in names if n not in done]
    if limit: todo = todo[:limit]
    print(fname, '남은', len(todo), '/ 전체', len(names), flush=True)
    t0 = time.time(); fails = 0
    with open(path, 'a', encoding='utf-8') as f:
        for i, n in enumerate(todo, 1):
            try:
                rec = fn(n)
            except RuntimeError as e:
                fails += 1; print('건너뜀', n, str(e)[:80], flush=True)
                if fails > 40: raise SystemExit('실패가 많아 멈춥니다 — 나중에 같은 명령으로 이어받으세요')
                continue
            f.write(json.dumps(rec, ensure_ascii=False) + '\n'); f.flush()
            if i % 100 == 0: print(f'{fname} {i}/{len(todo)} ({time.time() - t0:.0f}s)', flush=True)
            time.sleep(1.0 / rate)
    note_fetch(raw, fname); print(fname, '완료', flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--raw', required=True, help='저장 폴더(저장소 밖)')
    ap.add_argument('--only', default='fda,names,trials,chem')
    ap.add_argument('--rate', type=float, default=3.0, help='초당 호출 수(기본 3)')
    ap.add_argument('--limit', type=int, default=0, help='시험용: 앞에서 N개만')
    ap.add_argument('--hint', default='', help='trials 용: 이전에 받은 trials.jsonl(이름별 건수만 \'흔한 약\' 판별에 쓰고 값은 쓰지 않음)')
    a = ap.parse_args()
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.makedirs(a.raw, exist_ok=True)
    only = set(a.only.split(','))
    if 'fda' in only: fetch_fda(a.raw)
    if 'names' in only: query_names(root, a.raw)
    names = json.load(open(os.path.join(a.raw, 'names.json'), encoding='utf-8')) if only & {'trials', 'chem'} else []
    today = time.strftime('%Y-%m')
    hint = {}
    if a.hint and os.path.exists(a.hint):
        for line in open(a.hint, encoding='utf-8'):
            try: r = json.loads(line); hint[r['q']] = int(r.get('n') or 0)
            except (ValueError, KeyError): pass
    if 'trials' in only: run_trials(a.raw, names, today, a.limit, hint)
    if 'chem' in only: run_jsonl(a.raw, 'chem.jsonl', names, fetch_chem_one, min(a.rate, 3.0), a.limit)
    if 'sim' in only:   # 구조 유사 이웃: 앞쪽 N개 이름(FDA 신약 → 핵심 → 국내 품목 많은 성분 순)만. --limit 로 N 을 정한다(기본 1000)
        names = json.load(open(os.path.join(a.raw, 'names.json'), encoding='utf-8'))
        chem = {}
        for line in open(os.path.join(a.raw, 'chem.jsonl'), encoding='utf-8'):
            r = json.loads(line)
            if r.get('cid'): chem[r['q']] = r
        items = [chem[n] for n in names[:a.limit or 1000] if n in chem]
        run_pool_jsonl(a.raw, 'sim.jsonl', items, fetch_sim_one, min(a.rate, 3.0))


if __name__ == '__main__':
    main()
