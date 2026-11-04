#!/usr/bin/env python
"""약사 판정 시트 분석 — 약사 2명이 채운 판정(O/X/?)에서 '자동 연결이 맞는 비율'과 '두 사람의 일치도(κ)'를 계산한다.
 입력: tools/review_sheet.py 가 만든 CSV. 한 파일에 판정A·판정B 가 다 있어도 되고, 약사 한 명씩 받은 파일 둘을 같이 줘도 된다(성분ID 로 합침).
 판정 값: O(맞음) · X(틀림) · ?(판단 불가). '맞음/틀림/모름'도 받는다. 비어 있으면 아직 안 한 것.
   등급 a·b 행: 이름(영문)과 다른 영문 표기가 같은 성분(염·수화물 차이만)이면 O.   d 행: 미국 RxNorm 에 대응 성분이 없다는 판단이 맞으면 O.
 성분ID 로 data/medterm_ext.json 에서 연결 등급·규칙을 불러와 층(a · b 정확 일치 · b 규칙 연결 · d …)별로 나눠 센다(약사가 보는 시트에는 등급을 싣지 않았다).
 Excel 에서 저장한 CSV 가 UTF-8 이 아니면(한국어 Excel 의 기본 'CSV') CP949 로 다시 읽는다.
 이 도구는 네트워크에 접속하지 않고, 판정 값을 만들어 내지 않는다(비어 있는 칸은 비어 있는 채로 센다).
사용: python -I tools/review_agreement.py 시트.csv [시트2.csv ...] [--ext data/medterm_ext.json] [--md 보고서.md] [--json 결과.json]"""
import argparse, collections, csv, io, json, math, os, sys
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)

EXACT_RULES = ('exact/', 'syn/exact/')
O_SET = {'o', '○', '◯', 'ㅇ', 'y', 'yes', '예', '맞음', '맞다', '1', 'true'}
X_SET = {'x', '×', '✕', '✗', 'n', 'no', '아니오', '틀림', '틀리다', '0', 'false'}
Q_SET = {'?', '？', '모름', '불명', '판단불가', '불확실'}
LABEL = {'a': '등급 a (이름 + ATC 일치)', 'b-exact': '등급 b · 이름 정확 일치', 'b-rule': '등급 b · 염/수화물/약어 규칙으로 연결', 'c': '등급 c (후보)',
         'd': '등급 d (미매핑 — O = 미매핑이 맞음)', '-': 'RxNorm 전용', '?': '(자료에 없는 성분ID)'}
ORDER = ['a', 'b-exact', 'b-rule', 'c', 'd', '-', '?']


# ── 통계 ──
def wilson(k, n, z=1.96):
    """비율 k/n 의 Wilson 95% 구간. n=0 이면 None."""
    if n <= 0:
        return None
    p = k / n; d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def kappa(oo, ox, xo, xx):
    """Cohen κ · 일치율 · PABAK · κ 의 근사 95% 구간. 쌍이 없으면 None. 한쪽 값만 쓰여 우연일치가 1 이면 κ 는 None(정의 안 됨)."""
    n = oo + ox + xo + xx
    if n == 0:
        return None
    po = (oo + xx) / n
    pa, pb = (oo + ox) / n, (oo + xo) / n
    pe = pa * pb + (1 - pa) * (1 - pb)
    k = None if pe >= 1 else (po - pe) / (1 - pe)
    ci = None
    if k is not None:
        se = math.sqrt(po * (1 - po) / (n * (1 - pe) ** 2))
        ci = (max(-1.0, k - 1.96 * se), min(1.0, k + 1.96 * se))
    return {'n': n, 'po': po, 'pe': pe, 'kappa': k, 'kappa_ci': ci, 'pabak': 2 * po - 1, 'agree_ci': wilson(oo + xx, n)}


# ── 읽기 ──
def read_text(path):
    raw = open(path, 'rb').read()
    for enc in ('utf-8-sig', 'cp949'):
        try:
            return raw.decode(enc), enc
        except UnicodeDecodeError:
            pass
    raise SystemExit(f'{path}: 글자 인코딩을 읽지 못했습니다(CSV UTF-8 또는 CP949 로 저장해 주세요)')


def norm(v):
    """None=비어 있음 · 'O' · 'X' · '?' · 'bad'(알 수 없는 값)."""
    s = (v or '').strip()
    if not s:
        return None
    k = s.lower().replace(' ', '')
    return 'O' if k in O_SET else 'X' if k in X_SET else '?' if k in Q_SET else 'bad'


def merge(paths):
    rec = {}; notes = {'enc': {}, 'bad': [], 'conflict': [], 'dup': []}
    for p in paths:
        text, enc = read_text(p); notes['enc'][p] = enc
        rd = csv.DictReader(io.StringIO(text, newline=''))
        miss = {'성분ID', '판정A', '판정B'} - set(rd.fieldnames or [])
        if miss:
            raise SystemExit(f'{p}: 열이 없습니다 — {", ".join(sorted(miss))} (tools/review_sheet.py 가 만든 시트인지 확인)')
        seen = set()
        for r in rd:
            i = (r.get('성분ID') or '').strip()
            if not i:
                continue
            if i in seen:
                notes['dup'].append((os.path.basename(p), i)); continue
            seen.add(i)
            cur = rec.setdefault(i, {'id': i, 'A': None, 'B': None, 'memo': [], 'name': (r.get('이름(영문)') or '').strip()})
            for col, key in (('판정A', 'A'), ('판정B', 'B')):
                v = norm(r.get(col))
                if v is None:
                    continue
                if v == 'bad':
                    notes['bad'].append((i, col, (r.get(col) or '').strip())); continue
                if cur[key] is None:
                    cur[key] = v
                elif cur[key] != v:
                    notes['conflict'].append((i, key, cur[key], v))
            m = (r.get('메모') or '').strip()
            if m and m not in cur['memo']:
                cur['memo'].append(m)
    return rec, notes


# ── 집계 ──
def stratum(e):
    if e is None:
        return '?'
    g = e.get('grade', '?'); rule = (e.get('map') or {}).get('rule', '')
    return ('b-exact' if rule.startswith(EXACT_RULES) else 'b-rule') if g == 'b' else g


def family(e):
    rule = (e.get('map') or {}).get('rule', '') if e else ''
    return '' if not rule else 'syn(Wikidata 동의어 경유)' if rule.startswith('syn/') else rule.split('/')[0]


def outcome(r):
    if r['A'] is None or r['B'] is None:
        return 'incomplete'
    if '?' in (r['A'], r['B']):
        return 'unsure'
    return 'ok' if r['A'] == r['B'] == 'O' else 'wrong' if r['A'] == r['B'] == 'X' else 'split'


def summarize(rows):
    oc = collections.Counter(outcome(r) for r in rows)
    pairs = collections.Counter(r['A'] + r['B'] for r in rows if r['A'] in ('O', 'X') and r['B'] in ('O', 'X'))
    k = kappa(pairs['OO'], pairs['OX'], pairs['XO'], pairs['XX'])
    out = {'rows': len(rows), 'outcome': {x: oc[x] for x in ('ok', 'wrong', 'split', 'unsure', 'incomplete')}, 'kappa': k}
    for who in ('A', 'B'):
        o = sum(1 for r in rows if r[who] == 'O'); x = sum(1 for r in rows if r[who] == 'X')
        out[who] = {'O': o, 'X': x, '?': sum(1 for r in rows if r[who] == '?'), 'blank': sum(1 for r in rows if r[who] is None),
                    'o_rate': (o / (o + x)) if o + x else None, 'o_ci': wilson(o, o + x)}
    npair = oc['ok'] + oc['wrong'] + oc['split']
    out['bounds'] = {'n': npair, 'low': oc['ok'] / npair, 'high': (oc['ok'] + oc['split']) / npair} if npair else None
    return out


def analyze(paths, ext_path):
    rec, notes = merge(paths)
    ext = json.load(open(ext_path, encoding='utf-8')); E = {e['id']: e for e in ext['entities']}
    for i, r in rec.items():
        e = E.get(i); r['stratum'] = stratum(e); r['family'] = family(e); r['rule'] = ((e or {}).get('map') or {}).get('rule', '')
    rows = list(rec.values())
    res = {'version': ext['meta'].get('version'), 'files': [os.path.basename(p) for p in paths], 'notes': notes,
           'total': summarize(rows), 'strata': {}, 'families': {}, 'unknown_ids': sorted(i for i in rec if i not in E),
           'followup': [r for r in rows if outcome(r) in ('wrong', 'split') or 'X' in (r['A'], r['B'])]}
    for s in ORDER:
        sub = [r for r in rows if r['stratum'] == s]
        if sub:
            res['strata'][s] = summarize(sub)
    for f in sorted({r['family'] for r in rows if r['family']}):
        res['families'][f] = summarize([r for r in rows if r['family'] == f])
    return res


# ── 보고서 ──
pc = lambda x: '—' if x is None else f'{x * 100:.0f}%'
fx = lambda x: '—' if x is None else f'{x:.2f}'
rng = lambda ci, f=pc: '' if ci is None else f' [{f(ci[0])}~{f(ci[1])}]'


def md(res):
    T = res['total']; n_ab = T['A']['O'] + T['A']['X'] + T['A']['?']; n_bb = T['B']['O'] + T['B']['X'] + T['B']['?']
    L = [f'# 약사 판정 일치도 보고 (자료 v{res["version"]})', '',
         f'- 입력: {", ".join(res["files"])} · 성분 {T["rows"]}개',
         f'- 진행: 판정A {n_ab}개 · 판정B {n_bb}개 · 둘 다 O/X 로 판정한 쌍 {(T["kappa"] or {}).get("n", 0)}개', '']
    if not (n_ab or n_bb):
        return '\n'.join(L + ['**아직 채워진 판정이 없습니다.** 판정A·판정B 칸에 O / X / ? 를 적은 시트를 넣어 주세요.', ''])
    L += ['## 1. 두 약사의 일치도', '', '| 층 | 성분 | 쌍(O/X) | 일치율 | κ (근사 95% 구간) | PABAK |', '|---|---|---|---|---|---|']
    for s, v in [('전체', T)] + [(LABEL[k], v) for k, v in res['strata'].items()]:
        k = v['kappa']
        L.append(f'| {s} | {v["rows"]} | {k["n"] if k else 0} | {pc(k["po"]) if k else "—"}{rng(k["agree_ci"]) if k else ""} | '
                 + (f'{fx(k["kappa"])}{rng(k["kappa_ci"], fx)}' if k and k['kappa'] is not None else '계산 불가(한쪽 값만 쓰임)' if k else '—')
                 + f' | {fx(k["pabak"]) if k else "—"} |')
    L += ['', '## 2. 자동 연결이 맞다고 본 비율', '',
          '| 층 | 약사A (O/(O+X)) | 약사B | 둘 다 O | 둘 다 X | 의견 갈림 | 판단 불가 포함 | 미완 | 합의 기준 범위(하한~상한) |', '|---|---|---|---|---|---|---|---|---|']
    for s, v in [('전체', T)] + [(LABEL[k], v) for k, v in res['strata'].items()]:
        o = v['outcome']; b = v['bounds']
        L.append(f'| {s} | {pc(v["A"]["o_rate"])}{rng(v["A"]["o_ci"])} ({v["A"]["O"]}/{v["A"]["O"] + v["A"]["X"]}) | '
                 f'{pc(v["B"]["o_rate"])}{rng(v["B"]["o_ci"])} ({v["B"]["O"]}/{v["B"]["O"] + v["B"]["X"]}) | {o["ok"]} | {o["wrong"]} | {o["split"]} | {o["unsure"]} | {o["incomplete"]} | '
                 + (f'{pc(b["low"])}~{pc(b["high"])} (n={b["n"]})' if b else '—') + ' |')
    if res['families']:
        L += ['', '## 3. 연결 규칙 묶음별 (a·b·c 행)', '', '| 규칙 | 성분 | 약사A O 비율 | 약사B O 비율 | 둘 다 X | 의견 갈림 |', '|---|---|---|---|---|---|']
        for f, v in res['families'].items():
            L.append(f'| {f} | {v["rows"]} | {pc(v["A"]["o_rate"])} ({v["A"]["O"]}/{v["A"]["O"] + v["A"]["X"]}) | {pc(v["B"]["o_rate"])} ({v["B"]["O"]}/{v["B"]["O"] + v["B"]["X"]}) | {v["outcome"]["wrong"]} | {v["outcome"]["split"]} |')
    L += ['', '## 4. 따로 볼 행 (X 가 하나라도 있거나 의견이 갈린 행)', '']
    if res['followup']:
        L += ['| 성분ID | 이름 | 층 | 규칙 | A | B | 메모 |', '|---|---|---|---|---|---|---|']
        for r in sorted(res['followup'], key=lambda r: (ORDER.index(r['stratum']), r['id'])):
            L.append(f'| {r["id"]} | {r["name"]} | {r["stratum"]} | {r["rule"]} | {r["A"] or "—"} | {r["B"] or "—"} | {" / ".join(r["memo"]).replace("|", "/")} |')
    else:
        L.append('없음.')
    n = res['notes']
    chk = []
    if res['unknown_ids']: chk.append(f'자료에 없는 성분ID {len(res["unknown_ids"])}개(자료 버전이 다르면 생길 수 있음): {", ".join(res["unknown_ids"][:8])}')
    if n['bad']: chk.append(f'알 수 없는 판정 값 {len(n["bad"])}개(빈 칸으로 셈): ' + ', '.join(f'{i}/{c}="{v}"' for i, c, v in n['bad'][:8]))
    if n['conflict']: chk.append(f'두 파일에서 같은 칸 값이 다른 경우 {len(n["conflict"])}개(앞 파일 값을 씀)')
    if n['dup']: chk.append(f'한 파일 안에서 성분ID 가 겹친 경우 {len(n["dup"])}개(첫 행만 씀)')
    cp = [os.path.basename(p) for p, e in n['enc'].items() if e != 'utf-8-sig']
    if cp: chk.append(f'CP949 로 읽은 파일: {", ".join(cp)}')
    L += ['', '## 5. 입력 점검', ''] + (['- ' + c for c in chk] if chk else ['- 문제 없음.'])
    L += ['', '## 읽는 법', '',
          '- 판단 기준: 등급 a·b 는 "이름과 다른 표기가 같은 성분인가", d 는 "미국 RxNorm 에 대응 성분이 없다는 판단이 맞는가". 시트 안내(docs/약사검수_판정시트_안내.md) 참고.',
          '- κ 는 한쪽 값(대개 O)에 쏠리면 일치율이 높아도 낮게 나옵니다. 그래서 일치율·PABAK 을 같이 봅니다. 쌍이 20개 미만인 층은 참고용입니다. 구간은 근사입니다.',
          '- "합의 기준 범위": 하한 = 둘 다 O 인 비율, 상한 = 둘 다 O + 의견 갈림. 갈린 행을 세 번째 약사나 협의로 정하면 이 범위가 한 점으로 좁혀집니다.',
          '- 이 보고서는 표본(시트에 든 성분)에 대한 것이며 전체 자료의 정확도가 아닙니다. 상용 상위 시트는 많이 쓰이는 성분에 쏠린 표본입니다.', '']
    return '\n'.join(L)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('sheets', nargs='+', help='채운 시트 CSV (한 명씩 받은 파일 여러 개도 가능)')
    ap.add_argument('--ext', default=os.path.join(root, 'data', 'medterm_ext.json'))
    ap.add_argument('--md', help='보고서를 이 경로에 Markdown 으로도 쓴다'); ap.add_argument('--json', help='계산 결과를 이 경로에 JSON 으로 쓴다')
    a = ap.parse_args()
    for p in a.sheets + [a.ext]:
        if not os.path.exists(p):
            sys.exit(f'파일이 없습니다: {p}')
    res = analyze(a.sheets, a.ext)
    text = md(res)
    print(text)
    if a.md:
        open(a.md, 'w', encoding='utf-8', newline='\n').write(text)
    if a.json:
        json.dump(res, open(a.json, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=list)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    main()
