#!/usr/bin/env python
"""염·수화물·약어 정규화 규칙표 만들기 — build/ext_norm.py 의 표와 규칙을 그대로 읽어 docs/염_정규화_규칙표.md 를 쓴다.
 - 표·예시는 코드를 실행해서 만든다(손으로 적지 않는다) → 코드와 문서가 어긋나지 않는다. 시험(tests/test_review_tools.py)이 저장된 문서와 같은지 확인한다.
 - 규칙별 실제 사용 건수는 data/medterm_ext.json 의 map.rule 에서 센다(자료가 없으면 이 절을 건너뛴다).
사용: python -I tools/norm_rules_table.py [--out docs/염_정규화_규칙표.md] [--ext data/medterm_ext.json] [--check]
 --check: 파일을 쓰지 않고, 지금 코드·자료로 만든 내용이 저장된 문서와 같은지만 본다(다르면 종료 코드 1)."""
import argparse, collections, json, os, sys
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
sys.path.insert(0, os.path.join(root, 'build'))
import ext_norm as N

# 규칙 설명(후보를 만드는 순서와 같다). 예시 입력은 실제 코드를 돌려 후보를 적는다.
STEPS = [
    ('exact', '소문자·공백만 정리', ['Omeprazole']),
    ('moiety', '"(as X)" 표기의 X 를 본체로 봄', ['Eperisone (as eperisone hydrochloride)']),
    ('clean', '약어 풀기(HCl→hydrochloride 등) · 괄호·농도·잡단어 제거 · 수화물 말 떼기', ['Atenolol HCl', 'Amoxicillin Trihydrate']),
    ('desalt', '염·에스테르 꼬리를 뒤에서부터 하나씩 떼기 · 중간에 낀 염 떼기 · 선두 d-/l-/dl- 떼기(마지막 수단)', ['Metformin Hydrochloride', 'Esomeprazole Magnesium Trihydrate', 'L-carnitine']),
    ('decat', '선두의 양이온(sodium·potassium·calcium·magnesium·lithium·ammonium) 떼기', ['Sodium Chondroitin Sulfate']),
]
NO_STRIP = ['Calcium Carbonate', 'Sodium Chloride']   # 짝이온만 남게 되면 떼지 않는 예


def cand_text(name):
    return ' → '.join(f'`{k}`[{r}]' for k, r in N.candidates(name))


def table(rows, head):
    out = ['| ' + ' | '.join(head) + ' |', '|' + '|'.join(['---'] * len(head)) + '|']
    out += ['| ' + ' | '.join(str(c) for c in r) + ' |' for r in rows]
    return out


def words(title, s, note=''):
    return [f'**{title}** ({len(s)}개){(" — " + note) if note else ""}', '', ', '.join(f'`{w}`' for w in sorted(s)), '']


def rule_counts(ext_path):
    if not os.path.exists(ext_path):
        return None
    d = json.load(open(ext_path, encoding='utf-8'))
    c = collections.defaultdict(collections.Counter)
    for e in d['entities']:
        m = e.get('map')
        if m:
            c[m['rule']][e['grade']] += 1
    return c, d['meta'].get('version', '')


def build_doc(ext_path):
    L = ['# 염·수화물·약어 정규화 규칙표 (자동 생성)', '',
         '> 이 문서는 `tools/norm_rules_table.py` 가 `build/ext_norm.py` 에서 만든 것입니다. **손으로 고치지 않습니다**(고치려면 `build/ext_norm.py` 를 고치고 이 도구를 다시 실행).',
         '> 약사 검수 전 초안의 규칙입니다. 규칙이 같은 성분으로 묶은 것이 실제로 맞는지는 판정 시트(`data/review/`)로 확인합니다.', '',
         '## 1. 무엇을 하는 규칙인가', '',
         '심평원 약가마스터의 **영문 일반명**(예: `omeprazole sodium`)을 RxNorm 성분명(IN, 예: `omeprazole`)과 맞춥니다. 추측하지 않고 **규칙으로 같아진 이름만** 연결하며, 못 맞추면 미매핑(등급 d)으로 남깁니다. '
         '`candidates()` 는 아래 순서로 (키, 규칙 이름) 목록을 만들고, 앞쪽에서 RxNorm 이름과 처음 일치한 것으로 연결합니다.', '',
         '## 2. 후보를 만드는 순서 (구체적 → 덜 구체적)', '']
    rows = []
    for i, (rule, what, exs) in enumerate(STEPS, 1):
        rows.append((i, f'`{rule}`', what, '<br>'.join(f'`{x}` ⇒ {cand_text(x)}' for x in exs)))
    L += table(rows, ['순서', '규칙', '하는 일', '예 (입력 ⇒ 후보[규칙])'])
    L += ['', '**짝이온만 남으면 떼지 않습니다**(성분 본체가 아니라서 잘못 연결될 수 있음):', '']
    L += [f'- `{x}` ⇒ {cand_text(x)}' for x in NO_STRIP]
    L += ['', '연결 경로 중 **약한 것**(`syn/`·`desalt/`·`decat/`)은 ATC 대분류(앞 3자리)가 양쪽에서 전혀 맞지 않으면 등급 c(후보)로 내려 연결에 쓰지 않습니다. ATC 코드가 서로 달라도 그 자체가 오류의 증거는 아닙니다(WHO 가 분류를 옮긴 경우가 있음).', '',
          '## 3. 규칙에 쓰는 낱말 표', '']
    L += words('약어 → 풀이', {f'{k}→{v}' for k, v in N.ABBR.items()}, '토큰 단위로만 바꿈')
    L += words('잡단어(제조·상태 설명)', N.NOISE, '이름 뒤에 붙어도 성분을 바꾸지 않는 말')
    L += words('수화물 표기', N.HYDRATE)
    L += words('염·에스테르 꼬리', N.SALT, '성분 본체가 아닌 짝이온')
    L += words('짝이온만 남으면 떼지 않는 낱말(BARE)', N.BARE)
    L += words('선두 양이온', N.CATION)
    L += words('한글 성분명 염 꼬리(ko_base)', set(N.KO_SALT), '긴 것부터 떼며 3글자 미만으로는 줄이지 않음 — 검색·인식용 별칭이며 표준 이름이 아님')
    L += words('한글 꼬리를 떼지 않는 짝이온 낱말(KO_BARE)', N.KO_BARE)
    rc = rule_counts(ext_path)
    L += ['## 4. 규칙별 실제 사용 건수', '']
    if rc is None:
        L += ['(자료 `data/medterm_ext.json` 이 없어 건너뜀)', '']
    else:
        counts, ver = rc
        L += [f'`data/medterm_ext.json`(v{ver})의 `map.rule` 기준입니다. 한 성분에 이름이 여럿이면 가장 많이 쓰인 규칙 하나만 셉니다. `/IN`·`/PIN` 은 RxNorm 의 성분(IN)·정확 성분(PIN)과 맞은 것, `syn/` 은 Wikidata 동의어를 거친 것입니다.', '']
        rows = []
        for rule in sorted(counts, key=lambda r: (-sum(counts[r].values()), r)):
            g = counts[rule]
            rows.append((f'`{rule}`', sum(g.values()), g.get('a', 0), g.get('b', 0), g.get('c', 0)))
        L += table(rows, ['규칙/경로', '성분 수', '등급 a', '등급 b', '등급 c'])
        L += ['', '등급 a = 이름 일치 + ATC 7자리 일치, b = 이름 일치(ATC 근거가 한쪽에 없거나 4단계까지만 일치), c = 후보(연결에 쓰지 않음). **b 의 연결이 실제로 맞는지**가 약사 판정 시트의 핵심 질문입니다.', '']
    L += ['## 5. 알려진 한계', '',
          '- 염이 달라도 같은 약으로 묶습니다(본체가 같은 성분이라는 가정). 염에 따라 약이 달라지는 드문 경우는 규칙으로 가려내지 못합니다.',
          '- 표기가 전혀 다른 이름(약어·상품명·철자 오류)은 맞추지 못해 미매핑으로 남습니다. 비슷한 이름은 자동으로 합치지 않고 `near` 로만 알립니다.',
          '- 한글 이름은 이 규칙표로 연결하지 않습니다(연결은 영문 일반명으로만).', '']
    return '\n'.join(L)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(root, 'docs', '염_정규화_규칙표.md'))
    ap.add_argument('--ext', default=os.path.join(root, 'data', 'medterm_ext.json'))
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    doc = build_doc(a.ext)
    if a.check:
        cur = open(a.out, encoding='utf-8', newline='').read() if os.path.exists(a.out) else None
        same = cur == doc
        print('일치' if same else '다름 — python -I tools/norm_rules_table.py 로 다시 만드세요')
        sys.exit(0 if same else 1)
    with open(a.out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(doc)
    print('쓰기 완료', a.out, len(doc), '자')


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    main()
