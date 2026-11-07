"""약사 검수 참여(검수 2·3단계)용 공용 계산 — 검수 항목 만들기 · 약사 제출 파일 검증 · 병합 · 현황 계산.

 쓰는 곳: tools/merge_pharmacist_reviews.py(운영자 병합 도구) · build/make_bundle.py(앱에 담을 덩어리) · tests/test_review_merge.py.
 이 파일은 자료 파일(data/medterm.json · data/medterm_law.json · data/review/pharmacist_reviews.json)만 읽고 쓴다. 네트워크·서비스키·실행 호출이 없다.

 ■ 흐름(서버 없음)
   약사가 앱의 ‘약사 검수 참여’에서 항목마다 판정(같다·맞다 ok / 다르다 diff / 모르겠다 unsure)을 표시한다
   → ‘확인서’ 파일(JSON, 형식 medterm-kr-review/1)을 만들어 운영자에게 보낸다
   → 운영자가 약사 면허를 따로 확인한 뒤 이 라이브러리(병합 도구)로 합친다
   → 합쳐진 자료(data/review/pharmacist_reviews.json)에서 계산한 현황만 앱의 ‘검수 상태’에 나온다.
   앱 안에서 스스로 ‘검수 완료’를 표시하는 길은 없다(앱은 현황을 계산하지 않고, 빌드가 담은 계산 결과만 보여 준다).

 ■ 항목(item)
   names 범위: 핵심 사전의 성분 한글명(성분마다 1개) + 국내 상품명(상품마다 1개). 항목 id 는 성분 RxCUI·상품명으로 정해 자료의 순서가 바뀌어도 그대로다.
   law 범위: 약사법 쉬운 풀이(조문 항목마다 1개). 항목 id 는 자료의 LAW:… id 에서 만든다(LAW:2:2 → L-2_2, LAW:2-2 → L-2-2 로 구분).
   항목마다 h = 약사가 보는 내용(이름·상품명·원문 발췌·풀이 등)의 해시. 사전 내용이 바뀌면 h 가 달라져, 그 항목에 대한 지난 판정은 ‘지난 판’이 되어 현황에서 빠진다(다시 확인 필요).

 ■ 현황 계산(항목마다, 같은 h 의 판정만 센다)
   answered  : 약사가 판정을 표시한 항목                     confirmed : ‘다르다’ 없이 ‘같다’가 하나 이상인 항목
   issue     : ‘다르다’가 하나라도 있는 항목                 unsure    : ‘모르겠다’만 있는 항목
   need_recheck : 지난 판정만 있고 지금 내용에 대한 판정이 없는 항목
   2단계(stage2) = 모든 항목에 판정이 있음.   3단계(stage3) = 모든 항목이 ‘다르다’ 없이 ‘같다’로 확인됐고, 그 ‘같다’ 중 하나는 확인서(attested)로 낸 것.
   ‘다르다’가 있는 항목을 고쳐도(내용이 바뀌어 h 가 달라지므로) 다시 확인받아야 3단계가 된다.

 ■ 개인정보
   저장 자료에는 판정·참고 자료 종류·날짜만 둔다. 약사가 쓴 메모(수정 제안)는 저장하지 않고 운영자 보고서에만 나온다(약학정보원 등 외부 자료의 글을 옮겨 적었을 수 있어서).
   이름·소속은 약사가 공개에 동의한 경우에만 저장한다(아니면 ‘비공개 약사’). 면허번호·연락처는 받지도 저장하지도 않는다.
"""
import datetime, hashlib, json, os, re, unicodedata

SCHEMA = 'medterm-kr-review/1'      # 약사가 앱에서 내보내는 제출 파일 형식
STORE_SCHEMA = 1                    # data/review/pharmacist_reviews.json 형식
VERDICTS = ('ok', 'diff', 'unsure')
REFS = ('health.kr', 'mfds', 'book', 'law', 'other')
SCOPE_LABEL = {'names': '성분 한글명·국내 상품명', 'law': '약사법 쉬운 풀이'}
STORE_NAME = 'pharmacist_reviews.json'
MAX_NAME, MAX_ORG, MAX_NOTE, MAX_OTHER = 40, 80, 300, 80
MAX_FILE_BYTES = 1_000_000


class ReviewError(Exception):
    """제출 파일·병합 규칙을 어겼을 때(메시지는 운영자가 읽는 한국어)."""


# ── 공통 ──
def _h(obj, n=10):
    return hashlib.sha256(json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest()[:n]


def _load(path):
    with open(path, encoding='utf-8-sig') as f:
        return json.load(f)


def art_key(a):
    """'제2조 제11호' · '제2조의2 제1항' · '제23조의2' → 법 조문 순서 열쇠(tools/make_check_sheets.py 와 같은 규칙; 시험이 같은 순서인지 확인)."""
    m = re.match(r'제(\d+)조(?:의(\d+))?', a)
    rest = [int(x) for x in re.findall(r'\d+', a[m.end():])]
    return (int(m.group(1)), int(m.group(2) or 0), rest + [0] * (4 - len(rest)))


# ── 검수 항목 ──
def build_items(data_dir):
    """{'scopes': {범위: {label, n, hash[, eff]}}, 'items': {범위: [항목…]}} — 자료만으로 정해지며 같은 자료면 같은 결과."""
    core = _load(os.path.join(data_dir, 'medterm.json'))
    names, n = [], 0
    for c in core['concepts']:
        if c['type'] != 'VTM':
            continue
        n += 1
        alt = list(c.get('alt_ko', []))
        names.append({'id': f"N-{c['rxcui']}", 'no': n, 'k': 'ing', 'en': c['label_en'], 'ko': c['label_ko'], 'alt': alt, 'h': _h(['ing', c['label_en'], c['label_ko'], alt])})
        for b in c.get('brands_ko', []):
            n += 1
            names.append({'id': f"B-{c['rxcui']}-{hashlib.sha1(b.encode('utf-8')).hexdigest()[:6]}", 'no': n, 'k': 'brand', 'en': c['label_en'], 'ko': c['label_ko'], 'b': b, 'h': _h(['brand', c['label_en'], c['label_ko'], b])})
    items = {'names': names}
    scopes = {'names': {'label': SCOPE_LABEL['names'], 'n': len(names)}}
    law_path = os.path.join(data_dir, 'medterm_law.json')
    if os.path.exists(law_path):
        law = _load(law_path)
        groups = {g['id']: g['label'] for g in law['meta']['groups']}
        laws = []
        for i, e in enumerate(sorted(law['e'], key=lambda e: art_key(e['a'])), 1):
            ex, exn = e.get('ex', ''), e.get('exn', '')
            laws.append({'id': 'L-' + e['id'].split(':', 1)[1].replace(':', '_'), 'no': i, 'a': e['a'], 't': e['t'], 'g': groups.get(e['g'], e['g']), 'ex': ex, 'exn': exn, 'pl': e['pl'], 'st': e['st'],
                         'h': _h(['law', e['a'], e['t'], ex, exn, e['pl'], e['st']])})
        items['law'] = laws
        scopes['law'] = {'label': SCOPE_LABEL['law'], 'n': len(laws), 'eff': law['meta'].get('upcoming_effective', '')}
    for sid, lst in items.items():
        ids = [it['id'] for it in lst]
        if len(set(ids)) != len(ids):
            raise ReviewError(f'{sid} 범위에 같은 항목 id 가 겹칩니다: ' + ', '.join(sorted({i for i in ids if ids.count(i) > 1})[:5]))
        scopes[sid]['hash'] = _h([[it['id'], it['h']] for it in lst], 12)
    return {'scopes': scopes, 'items': items}


# ── 제출 파일 검증 ──
_BAD_CHARS = re.compile('[\\x00-\\x1f\\x7f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u2069\\ufeff]')


def clean_text(s, maxlen, field, required=False, one_line=True):
    if s is None:
        s = ''
    if not isinstance(s, str):
        raise ReviewError(f'{field}: 글자여야 합니다')
    s = unicodedata.normalize('NFC', s)
    if not one_line:
        s = re.sub(r'\s+', ' ', s)
    if _BAD_CHARS.search(s):
        raise ReviewError(f'{field}: 제어 문자·보이지 않는 글자가 들어 있습니다')
    s = s.strip()
    if required and not s:
        raise ReviewError(f'{field}: 비어 있습니다')
    if len(s) > maxlen:
        raise ReviewError(f'{field}: {maxlen}자를 넘습니다({len(s)}자)')
    return s


def _date(s, field, today):
    if not isinstance(s, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', s):
        raise ReviewError(f'{field}: YYYY-MM-DD 형식이어야 합니다')
    try:
        d = datetime.date.fromisoformat(s)
    except ValueError:
        raise ReviewError(f'{field}: 없는 날짜입니다({s})')
    if d < datetime.date(2026, 1, 1) or d > today + datetime.timedelta(days=1):
        raise ReviewError(f'{field}: 범위를 벗어난 날짜입니다({s})')
    return s


def validate_submission(sub, items, today=None):
    """약사 제출 파일(dict) 검증 → (정리된 제출, 경고 목록). 어기면 ReviewError.
    경고: 사전 내용이 바뀌어 반영하지 않은 판정 수. 알 수 없는 항목 id 는 오류(파일이 망가졌거나 다른 자료판일 수 있음)."""
    today = today or datetime.date.today()
    if not isinstance(sub, dict):
        raise ReviewError('제출 파일이 JSON 객체가 아닙니다')
    if sub.get('schema') != SCHEMA:
        raise ReviewError(f'형식이 다릅니다(schema={sub.get("schema")!r}; 기대 {SCHEMA})')
    sid = sub.get('scope')
    if sid not in items['scopes']:
        raise ReviewError(f'알 수 없는 범위입니다({sid!r}; 이 자료의 범위: {", ".join(items["scopes"])})')
    rv = sub.get('reviewer')
    if not isinstance(rv, dict):
        raise ReviewError('reviewer 칸이 없습니다')
    name = clean_text(rv.get('name'), MAX_NAME, '검수자 이름', required=True)
    org = clean_text(rv.get('affiliation'), MAX_ORG, '소속')
    if rv.get('license_claimed') is not True:
        raise ReviewError('약사 면허를 가지고 있다는 표시(license_claimed)가 없는 파일입니다')
    if not isinstance(rv.get('public'), bool):
        raise ReviewError('reviewer.public(공개 동의)은 true/false 여야 합니다')
    refs = sub.get('refs', [])
    if not isinstance(refs, list) or any(r not in REFS for r in refs):
        raise ReviewError('refs(참고한 자료)에 알 수 없는 값이 있습니다: ' + repr(refs)[:80])
    other = clean_text(sub.get('refs_other'), MAX_OTHER, '참고한 기타 자료')
    if not isinstance(sub.get('attested'), bool):
        raise ReviewError('attested(확인서 동의)는 true/false 여야 합니다')
    created = _date(sub.get('created'), 'created(작성일)', today)
    ans = sub.get('answers')
    if not isinstance(ans, dict) or not ans:
        raise ReviewError('answers(판정)가 비어 있습니다')
    cur = {it['id']: it for it in items['items'][sid]}
    unknown = [i for i in ans if i not in cur]
    if unknown:
        raise ReviewError(f'이 자료에 없는 항목 id 가 있습니다({len(unknown)}개: {", ".join(map(str, unknown[:5]))}) — 다른 판의 앱에서 만든 파일일 수 있습니다')
    good, stale, notes = {}, [], {}
    for iid, a in ans.items():
        if not isinstance(a, dict) or a.get('v') not in VERDICTS:
            raise ReviewError(f'{iid}: 판정(v)은 {"/".join(VERDICTS)} 중 하나여야 합니다')
        if not isinstance(a.get('h'), str) or not 1 <= len(a['h']) <= 20:
            raise ReviewError(f'{iid}: 내용 표시(h)가 없습니다')
        note = clean_text(a.get('m'), MAX_NOTE, f'{iid} 메모', one_line=False)
        if a['h'] != cur[iid]['h']:
            stale.append(iid)
            continue
        good[iid] = {'v': a['v'], 'h': a['h']}
        if sub['attested']:
            good[iid]['a'] = 1
        if note:
            notes[iid] = note
    warns = [f'사전 내용이 바뀐 뒤라 반영하지 않은 판정 {len(stale)}개: ' + ', '.join(stale[:8]) + (' …' if len(stale) > 8 else '')] if stale else []
    if not good:
        raise ReviewError('지금 자료와 내용이 맞는 판정이 하나도 없습니다(앱 판이 달라 모든 항목이 바뀐 듯합니다). 새 판의 앱에서 다시 판정해 주세요')
    clean = {'scope': sid, 'reviewer': {'name': name, 'affiliation': org, 'public': rv['public']}, 'refs': sorted(set(refs)), 'refs_other': other, 'attested': sub['attested'],
             'created': created, 'answers': good, 'notes': notes, 'stale': stale}
    return clean, warns


# ── 저장 자료(병합 결과) ──
def empty_store():
    return {'meta': {'schema': STORE_SCHEMA,
                     'note': '약사가 앱의 ‘약사 검수 참여’에서 낸 확인서를, 운영자가 약사 면허를 확인한 뒤 tools/merge_pharmacist_reviews.py 로 합친 기록입니다. 판정·날짜·참고 자료 종류만 담고 메모는 담지 않습니다. 이름·소속은 약사가 공개에 동의한 경우에만 있습니다.'},
            'reviewers': {}, 'reviews': []}


def load_store(path):
    return _load(path) if os.path.exists(path) else empty_store()


def dump_store(store):
    return json.dumps(store, ensure_ascii=False, indent=1, sort_keys=True) + '\n'


def _pid_num(pid):
    return int(pid[1:])


def merge_submission(store, items, sub, license_verified, verified_on, reviewer_id=None, today=None):
    """제출 파일(dict)을 저장 자료(store)에 합친다(store 를 제자리에서 고침). → 운영자용 보고(dict).
    license_verified 가 True 가 아니면 합치지 않는다(운영자가 약사 면허를 따로 확인했다는 표시). 같은 검수자·같은 범위의 새 제출은 항목별로 새 판정이 이전을 덮는다."""
    if license_verified is not True:
        raise ReviewError('운영자가 약사 면허를 확인했다는 표시(--license-verified)가 없으면 합치지 않습니다')
    today = today or datetime.date.today()
    _date(verified_on, '확인일(verified_on)', today)
    sub_clean, warns = validate_submission(sub, items, today)
    sid, rv = sub_clean['scope'], sub_clean['reviewer']
    reviewers = store.setdefault('reviewers', {})
    pid = reviewer_id
    if pid is not None:
        if pid not in reviewers:
            raise ReviewError(f'검수자 번호 {pid} 가 없습니다(있는 번호: {", ".join(sorted(reviewers, key=_pid_num)) or "없음"})')
    else:
        for k, r in reviewers.items():          # 공개한 검수자는 이름·소속이 같으면 같은 사람으로 본다. 비공개는 번호를 직접 지정해야 같은 사람이 된다.
            if r.get('public') and rv['public'] and r.get('name') == rv['name'] and r.get('affiliation', '') == rv['affiliation']:
                pid = k
                break
        if pid is None:
            pid = 'P' + str(1 + max([_pid_num(k) for k in reviewers] or [0]))
    # 공개 정보: 공개에 동의한 최신 제출이 우선, 한 번이라도 비공개로 내면 이름·소속을 지운다(개인정보 쪽으로 안전하게).
    if rv['public']:
        prev = reviewers.get(pid, {})
        reviewers[pid] = {'public': True, 'name': rv['name'], 'affiliation': rv['affiliation']} if prev.get('public', True) else {'public': False}
    else:
        reviewers[pid] = {'public': False}
    rev = next((r for r in store['reviews'] if r['pid'] == pid and r['scope'] == sid), None)
    if rev is None:
        rev = {'pid': pid, 'scope': sid, 'answers': {}}
        store['reviews'].append(rev)
    rev['answers'].update(sub_clean['answers'])
    rev['refs'] = sub_clean['refs']
    rev['refs_other'] = sub_clean['refs_other']
    rev['updated'] = max(sub_clean['created'], rev.get('updated', ''))
    rev['verified_on'] = verified_on
    store['reviews'].sort(key=lambda r: (_pid_num(r['pid']), r['scope']))
    cnt = {v: sum(1 for a in sub_clean['answers'].values() if a['v'] == v) for v in VERDICTS}
    cur = {it['id']: it for it in items['items'][sid]}
    flagged = [{'id': i, 'verdict': sub_clean['answers'][i]['v'], 'note': sub_clean['notes'].get(i, ''), 'item': cur[i]} for i in sub_clean['answers'] if sub_clean['answers'][i]['v'] != 'ok']
    flagged.sort(key=lambda f: f['item']['no'])
    return {'pid': pid, 'scope': sid, 'reviewer_raw': {'name': rv['name'], 'affiliation': rv['affiliation'], 'public': rv['public']}, 'attested': sub_clean['attested'],
            'count': len(sub_clean['answers']), 'verdicts': cnt, 'warnings': warns, 'flagged': flagged, 'created': sub_clean['created']}


# ── 현황 계산 ──
def compute_status(items, store):
    """범위마다 현황(위 모듈 설명)과 전체 기준일. 같은 h 의 판정만 센다. 확인일(verified_on)이 없는 검수 기록은 세지 않는다."""
    reviewers = store.get('reviewers', {})
    out, asof = {}, None
    for sid, sc in items['scopes'].items():
        its = items['items'][sid]
        hmap = {it['id']: it['h'] for it in its}
        per, old, who = {}, set(), {}
        for r in store.get('reviews', []):
            if r['scope'] != sid or not r.get('verified_on'):
                continue
            seen = att = 0
            for iid, a in r['answers'].items():
                if iid not in hmap:
                    continue
                if a['h'] != hmap[iid]:
                    old.add(iid)
                    continue
                per.setdefault(iid, []).append((a['v'], bool(a.get('a'))))
                seen += 1
                att += 1 if a.get('a') else 0
            if seen:
                rp = reviewers.get(r['pid'], {})
                who[r['pid']] = {'name': rp.get('name') if rp.get('public') else None, 'org': (rp.get('affiliation') or None) if rp.get('public') else None,
                                 'date': r.get('updated'), 'n': seen, 'att': att}
                asof = max(asof or '', r['verified_on'])
        issue = conf = uns = attc = 0
        for lst in per.values():
            vs = [v for v, _ in lst]
            if 'diff' in vs:
                issue += 1
            elif 'ok' in vs:
                conf += 1
                attc += 1 if any(v == 'ok' and a for v, a in lst) else 0
            else:
                uns += 1
        n = len(its)
        out[sid] = {'n': n, 'answered': len(per), 'confirmed': conf, 'issue': issue, 'unsure': uns, 'need_recheck': len([i for i in old if i not in per]), 'attested_confirmed': attc,
                    'stage2': n > 0 and len(per) == n, 'stage3': n > 0 and attc == n,
                    'reviewers': [dict(who[p], pid=p) for p in sorted(who, key=_pid_num)]}
    return {'scopes': out, 'asof': asof}


def app_payload(data_dir):
    """앱에 담을 덩어리(window.MEDTERM_REVIEW): 항목·범위·현황. 자료 폴더의 review/pharmacist_reviews.json 이 없으면 ‘아직 아무도 안 함’."""
    items = build_items(data_dir)
    store = load_store(os.path.join(data_dir, 'review', STORE_NAME))
    st = compute_status(items, store)
    return {'schema': 1, 'scopes': items['scopes'], 'items': items['items'], 'status': st['scopes'], 'asof': st['asof']}


# ── 저장 자료 점검(--check) ──
def check_store(store, items):
    """(오류 목록, 경고 목록). 오류가 없어야 한다."""
    errs, warns = [], []
    if not isinstance(store, dict) or store.get('meta', {}).get('schema') != STORE_SCHEMA:
        return ['저장 자료의 형식(meta.schema)이 맞지 않습니다'], warns
    reviewers = store.get('reviewers', {})
    for pid, r in reviewers.items():
        if not re.fullmatch(r'P\d+', pid):
            errs.append(f'검수자 번호 형식이 이상합니다: {pid}')
        if r.get('public') is True:
            if not isinstance(r.get('name'), str) or not r['name'].strip():
                errs.append(f'{pid}: 공개 검수자인데 이름이 없습니다')
        elif r.get('public') is False:
            if set(r) != {'public'}:
                errs.append(f'{pid}: 비공개 검수자의 이름·소속이 저장돼 있습니다(지워야 함)')
        else:
            errs.append(f'{pid}: public 값이 true/false 가 아닙니다')
    seen = set()
    for i, r in enumerate(store.get('reviews', [])):
        where = f'reviews[{i}]'
        if r.get('pid') not in reviewers:
            errs.append(f'{where}: 검수자 {r.get("pid")} 가 reviewers 에 없습니다')
        if r.get('scope') not in items['scopes']:
            errs.append(f'{where}: 알 수 없는 범위 {r.get("scope")!r}')
            continue
        if (r.get('pid'), r['scope']) in seen:
            errs.append(f'{where}: 같은 검수자·같은 범위가 두 번 있습니다')
        seen.add((r.get('pid'), r['scope']))
        if not r.get('verified_on'):
            errs.append(f'{where}: 면허 확인일(verified_on)이 없습니다')
        else:
            try:
                datetime.date.fromisoformat(r['verified_on'])
            except ValueError:
                errs.append(f'{where}: verified_on 이 날짜가 아닙니다')
        if any(k in r for k in ('note', 'notes', 'm', 'name', 'license')):
            errs.append(f'{where}: 저장하지 않기로 한 칸(메모·이름·면허)이 있습니다')
        if any(x not in REFS for x in r.get('refs', [])):
            errs.append(f'{where}: refs 에 알 수 없는 값')
        cur = {it['id'] for it in items['items'][r['scope']]}
        for iid, a in r.get('answers', {}).items():
            if not isinstance(a, dict) or a.get('v') not in VERDICTS or not isinstance(a.get('h'), str) or set(a) - {'v', 'h', 'a'}:
                errs.append(f'{where}.{iid}: 판정 기록 형식이 맞지 않습니다')
            if iid not in cur:
                warns.append(f'{where}.{iid}: 지금 자료에 없는 항목(자료에서 빠진 듯)')
    return errs, warns
