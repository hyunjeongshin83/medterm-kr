"""약사 확인용 대조 시트 두 가지를 data/review/ 에 만든다 — python -I tools/make_check_sheets.py [--out-dir DIR] [--check]

 ① 핵심_성분_상품명_대조시트.csv : 핵심 사전의 성분 한글명 32개 + 국내 상품명 28개(60행).
    약사가 약학정보원(health.kr) 화면을 열어 놓고 사전의 표기가 같은지 O / X / ? 만 적는다. 화면의 내용을 복사해 오지 않는다.
 ② 약사법_쉬운풀이_검토시트.csv : 약사법 쉬운 풀이 53개. 법령 원문 발췌와 쉬운 풀이가 맞는지 O / X / ? 와 수정 제안을 적는다.

- 도구의 판정은 싣지 않는다(약사가 도구 결과에 끌리지 않도록). 판정·메모·확인자·확인일 칸은 비워 둔다.
- 약사 이름·연락처는 시트에 적지 않는다. 확인자는 약사가 직접 적는다.
- 자료(data/medterm.json, data/medterm_law.json)만 읽는다. 네트워크·서비스키를 쓰지 않고, 약학정보원 화면을 가져오지 않는다.
- --check : 저장된 시트가 지금 자료로 다시 만든 것과 바이트까지 같은지만 본다(다르면 종료 코드 1).
- 엑셀에서 열면 한글이 깨지지 않도록 UTF-8 BOM 으로 저장한다. 판정 값은 O, X, ? 중 하나만 적는다.
"""
import argparse, csv, io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAME_NAMES = '핵심_성분_상품명_대조시트.csv'
NAME_LAW = '약사법_쉬운풀이_검토시트.csv'

HEAD_NAMES = ['번호', '구분', '성분(영문)', '성분 한글명(사전)', '상품명(사전)', '다른 한글 표기(사전)',
              '약학정보원에서 확인한 표기(약사 기입)', '판정(O=같음 / X=다르거나 없음 / ?=모름)', '메모', '확인자', '확인일']


def head_law(eff):
    return ['번호', '구분', '조문', '용어', '원문 발췌(법제처 출력본)', f'원문 발췌({eff} 시행 예정판)', '쉬운 풀이(초안)', '시행 상태',
            '판정(O=적정 / X=수정 필요 / ?=모름)', '수정 제안(약사 기입)', '확인자', '확인일']


def load(path):
    with open(path, encoding='utf-8-sig') as f:
        return json.load(f)


def names_rows(core):
    """성분 한 줄 + 그 성분의 국내 상품명 줄들(핵심 사전 순서 그대로)."""
    rows, n = [], 0
    for c in (c for c in core['concepts'] if c['type'] == 'VTM'):
        n += 1
        rows.append([n, '성분 한글명', c['label_en'], c['label_ko'], '', '; '.join(c.get('alt_ko', [])), '', '', '', '', ''])
        for b in c.get('brands_ko', []):
            n += 1
            rows.append([n, '국내 상품명', c['label_en'], c['label_ko'], b, '', '', '', '', '', ''])
    return rows


def art_key(a):
    """'제2조 제11호' · '제2조의2 제1항' · '제23조의2' → (조 번호, 가지 번호(의N; 없으면 0), 항·호 번호들). 법 조문 순서로 줄 세우는 열쇠."""
    m = re.match(r'제(\d+)조(?:의(\d+))?', a)
    rest = [int(x) for x in re.findall(r'\d+', a[m.end():])]
    return (int(m.group(1)), int(m.group(2) or 0), rest + [0] * (4 - len(rest)))


def law_rows(law):
    meta = law['meta']
    groups = {g['id']: g['label'] for g in meta['groups']}
    eff = meta.get('upcoming_effective', '')
    state = {'cur': '현행', 'chg': f'현행 + 개정 예정({eff})', 'new': f'시행 예정({eff})'}
    es = sorted(law['e'], key=lambda e: art_key(e['a']))
    return [[i, groups.get(e['g'], e['g']), e['a'], e['t'], e.get('ex', ''), e.get('exn', ''), e['pl'], state.get(e['st'], e['st']), '', '', '', ''] for i, e in enumerate(es, 1)]


def to_bytes(head, rows):
    buf = io.StringIO(newline='')
    w = csv.writer(buf)
    w.writerow(head)
    w.writerows(rows)
    return ('﻿' + buf.getvalue()).encode('utf-8')


def build(root=ROOT):
    """{파일 이름: 바이트} — 지금 자료로 만든 두 시트."""
    core = load(os.path.join(root, 'data', 'medterm.json'))
    law = load(os.path.join(root, 'data', 'medterm_law.json'))
    return {NAME_NAMES: to_bytes(HEAD_NAMES, names_rows(core)), NAME_LAW: to_bytes(head_law(law['meta'].get('upcoming_effective', '')), law_rows(law))}


def main(argv=None):
    ap = argparse.ArgumentParser(description='약사 확인용 대조 시트 두 가지를 만든다(자료만 읽음, 네트워크 없음).')
    ap.add_argument('--out-dir', default=os.path.join(ROOT, 'data', 'review'), help='시트를 둘 폴더(기본 data/review)')
    ap.add_argument('--check', action='store_true', help='만들지 않고, 저장된 시트가 지금 자료와 같은지만 본다')
    a = ap.parse_args(argv)
    sheets = build()
    if a.check:
        bad = [n for n, b in sheets.items() if not os.path.exists(os.path.join(a.out_dir, n)) or open(os.path.join(a.out_dir, n), 'rb').read() != b]
        print('저장된 시트가 지금 자료와 같음' if not bad else '다름(다시 만드세요): ' + ', '.join(bad))
        return 1 if bad else 0
    os.makedirs(a.out_dir, exist_ok=True)
    for n, b in sheets.items():
        with open(os.path.join(a.out_dir, n), 'wb') as f:
            f.write(b)
        print(f'{n}: {len(list(csv.reader(io.StringIO(b.decode("utf-8-sig"), newline="")))) - 1}행')
    return 0


if __name__ == '__main__':
    sys.exit(main())
