#!/usr/bin/env python
"""약사 판정 시트 만들기 — data/medterm_ext.json 에서 표본 100개를 뽑아, 약사 2명이 따로 채울 CSV 를 쓴다.
 목적: 자동 연결(RxNorm ↔ 심평원)이 실제로 맞는지 약사가 판정하고, 두 사람의 일치도(κ)를 재기 위한 시트. 계산은 tools/review_agreement.py.
 표본(--mode):
  top      한국 상용 성분 상위 N — 심평원에 등재된 단일성분 품목 수(kr.items)가 많은 순(기본). '상용'의 대리 지표일 뿐 처방량이 아니다.
  b-strat  등급 b(이름만 일치, ATC 근거 없음) 층화 무작위 N — 절반은 이름이 정확히 같은 연결(exact), 절반은 염·수화물·약어 규칙으로 맞춘 연결. --seed 고정.
           (상용 상위에는 b 가 적어서, b 의 정확도는 이 시트로 따로 잰다. 규칙으로 맞춘 쪽이 틀릴 가능성이 크므로 절반을 그쪽에 둔다.)
 같은 자료·같은 옵션이면 항상 같은 시트가 나온다. 시트에는 정답을 적지 않는다(판정A·판정B 칸은 비워 둔다).
 약사에게 가는 시트에는 시스템의 연결 등급·규칙을 싣지 않는다(판정이 거기에 끌리지 않도록). 분석 때 tools/review_agreement.py 가 성분ID 로 data/medterm_ext.json 에서 불러온다.
 또 --shared 로 '심평원 일반명코드 앞 4자리가 둘 이상의 항목에 걸린' 목록(TSV)을 쓴다 — 같은 성분이 갈라졌을 수 있다는 단서일 뿐이다.
 앞 4자리는 성분 식별자가 아니라서 서로 다른 약(예: peramivir/indacaterol)도 섞여 있다 → 자동으로 합치는 열쇠로 쓰지 않고, 사람이 보는 목록으로만 쓴다.
사용: python -I tools/review_sheet.py [--ext data/medterm_ext.json] [--mode top|b-strat] [--n 100] [--seed 1] [--out <csv>] [--shared <tsv>]"""
import argparse, collections, csv, json, os, random, sys
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)

HEAD = ['번호', '성분ID', 'RxCUI', '이름(영문)', '다른 영문 표기', '한글명 후보', 'ATC(앞 3개)', '심평원 단일성분 품목수', '심평원 일반명코드(예)',
        '코드 앞4자리가 같은 다른 항목(참고)', '비슷한 이름(자동 후보)', '판정A', '판정B', '메모']
EXACT_RULES = ('exact/', 'syn/exact/')          # 이름이 정확히 같아서 연결된 규칙
DEFAULT_OUT = {'top': '상용상위100_판정시트.csv', 'b-strat': '등급b_층화100_판정시트.csv'}
MAX_ALT = 6


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def is_exact(e):
    return ((e.get('map') or {}).get('rule') or '').startswith(EXACT_RULES)


def shared_map(entities):
    """일반명코드 앞 4자리 → 그 앞자리를 쓰는 항목들(둘 이상인 것만)."""
    own = collections.defaultdict(set)
    for e in entities:
        for c in e.get('hira_codes', []):
            own[c[:4]].add(e['id'])
    return {c: sorted(ids) for c, ids in own.items() if len(ids) >= 2}


def pick(entities, mode='top', n=100, seed=1):
    """표본을 고른다. 같은 입력이면 같은 결과(정렬 기준에 id 를 넣고, 무작위는 seed 고정)."""
    if mode == 'top':
        cand = [e for e in entities if (e.get('kr') or {}).get('items', 0) > 0]
        cand.sort(key=lambda e: (-e['kr']['items'], e['id']))
        return cand[:n]
    if mode == 'b-strat':
        b = sorted((e for e in entities if e.get('grade') == 'b' and e.get('map')), key=lambda e: e['id'])
        ex = [e for e in b if is_exact(e)]; nx = [e for e in b if not is_exact(e)]
        rng = random.Random(seed)
        got_nx = rng.sample(nx, min(n - n // 2, len(nx)))           # 규칙으로 맞춘 연결 쪽을 먼저 채운다
        got_ex = rng.sample(ex, min(n - len(got_nx), len(ex)))      # 모자라면 정확 일치 쪽에서 채운다
        return sorted(got_nx + got_ex, key=lambda e: e['id'])       # id 순 = 두 층이 섞여 보임
    raise ValueError('mode 는 top 또는 b-strat')


def near_text(e):
    return '; '.join(f"{x['n']} ({x['id']}, 유사도 {x['r']})" for x in (e.get('near') or [])[:3])


def row(i, e, shared):
    ko = '; '.join(x['n'] for x in e.get('ko', [])[:3])
    alts = e.get('alt_en', []); alt = '; '.join(alts[:MAX_ALT]) + (f' (외 {len(alts) - MAX_ALT}개)' if len(alts) > MAX_ALT else '')
    codes = e.get('hira_codes', []); eg = ', '.join(codes[:3]) + (f' (외 {len(codes) - 3}개)' if len(codes) > 3 else '')
    others = sorted({o for c in codes for o in shared.get(c[:4], []) if o != e['id']})
    return [i, e['id'], e.get('rxcui') or '', e['label_en'], alt, ko, ', '.join(e.get('atc', [])[:3]), (e.get('kr') or {}).get('items', 0),
            eg, ', '.join(others), near_text(e), '', '', '']


def write_sheet(path, rows):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:   # 엑셀이 한글을 바로 읽도록 BOM 을 붙인다
        w = csv.writer(f, lineterminator='\n'); w.writerow(HEAD); w.writerows(rows)


def write_shared(path, entities, shared):
    by = {e['id']: e for e in entities}
    lines = ['prefix4\tn\tids\tlabels\tgrades']
    for c in sorted(shared):
        ids = shared[c]
        lines.append('\t'.join([c, str(len(ids)), ' | '.join(ids), ' | '.join(by[i]['label_en'] for i in ids), ' | '.join(by[i]['grade'] for i in ids)]))
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')


def summary(sample):
    g = collections.Counter(e['grade'] for e in sample)
    r = collections.Counter(((e.get('map') or {}).get('rule', '(연결 없음)')) for e in sample)
    return g, r


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--ext', default=os.path.join(root, 'data', 'medterm_ext.json'))
    ap.add_argument('--mode', default='top', choices=['top', 'b-strat']); ap.add_argument('--n', type=int, default=100); ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--out', help='쓸 CSV 경로(기본: data/review/ 아래 모드별 이름)')
    ap.add_argument('--shared', help='심평원 일반명코드 앞 4자리가 둘 이상의 항목에 걸린 목록(단서일 뿐 합치는 열쇠가 아님)을 이 경로에 TSV 로 쓴다')
    a = ap.parse_args()
    out = a.out or os.path.join(root, 'data', 'review', DEFAULT_OUT[a.mode])
    d = load(a.ext); E = d['entities']
    shared = shared_map(E)
    sample = pick(E, a.mode, a.n, a.seed)
    write_sheet(out, [row(i, e, shared) for i, e in enumerate(sample, 1)])
    g, r = summary(sample)
    print(f'시트 {len(sample)}행 → {out}  (자료 v{d["meta"].get("version")}, 모드 {a.mode})')
    print('등급 분포:', ', '.join(f'{k} {v}' for k, v in sorted(g.items())))
    print('연결 규칙:', ', '.join(f'{k} {v}' for k, v in r.most_common()))
    if a.shared:
        write_shared(a.shared, E, shared); print(f'앞 4자리가 여러 항목에 걸린 목록 {len(shared)}건 → {a.shared}')


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    main()
