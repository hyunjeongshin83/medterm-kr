#!/usr/bin/env python
"""구글 시트용 접수 점검 스크립트(tools/google_apps_script/review_inbox.gs)의 ‘자료판 표시’(MANIFEST: 검수 항목의 번호·id·내용 표시·이름표)를
 data/ 의 검수 항목으로 다시 만든다. 검수 항목은 약사가 앱에서 판정하는 것과 같은 것(build/review_lib.build_items)이다.
 자료(data/)가 바뀌면 항목의 내용 표시(h)도 바뀌므로 이 도구를 다시 돌려 스크립트를 새로 붙여 넣는다 — 안 하면 바뀐 항목의 판정은 ‘사전이 바뀐 판정’으로 세지 않는다.
 사용: python3 -I tools/make_review_inbox_script.py            (파일을 고침)
       python3 -I tools/make_review_inbox_script.py --check    (고치지 않고, 지금 자료와 맞는지만 봄 · 다르면 종료 코드 1)
       python3 -I tools/make_review_inbox_script.py --data-dir 폴더 --script 파일"""
import argparse, json, os, re, sys

here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
sys.path.insert(0, os.path.join(root, 'build')); sys.path.insert(0, here)
import review_lib as RL  # noqa: E402
import review_research_report as RR  # noqa: E402

DEFAULT_SCRIPT = os.path.join(here, 'google_apps_script', 'review_inbox.gs')
MARK = re.compile(r'/\*MANIFEST\*/.*?/\*END\*/', re.S)


def manifest_text(items):
    """줄마다 항목 하나인 JSON(읽기 쉽고 바뀐 항목이 줄 단위로 보이게)."""
    out = ['{"scopes":{']
    scs = []
    for sid, sc in items['scopes'].items():
        lines = [f'{json.dumps(sid)}:{{"label":{json.dumps(sc["label"], ensure_ascii=False)},"hash":{json.dumps(sc["hash"])},"items":[']
        rows = [json.dumps({'id': it['id'], 'no': it['no'], 'h': it['h'], 'label': RR.item_label(it)}, ensure_ascii=False, separators=(',', ':')) for it in items['items'][sid]]
        lines.append(',\n'.join(rows))
        lines.append(']}')
        scs.append('\n'.join(lines))
    out.append(',\n'.join(scs))
    out.append('}}')
    return '\n'.join(out)


def build(script_path, data_dir):
    items = RL.build_items(data_dir)
    src = open(script_path, encoding='utf-8').read()
    if not MARK.search(src):
        raise SystemExit('스크립트에 /*MANIFEST*/ … /*END*/ 자리가 없습니다')
    return MARK.sub(lambda m: '/*MANIFEST*/' + manifest_text(items) + '/*END*/', src, count=1), src


def main(argv=None):
    ap = argparse.ArgumentParser(description='접수 점검 스크립트의 자료판 표시(MANIFEST)를 만든다', epilog=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--data-dir', default=os.path.join(root, 'data'))
    ap.add_argument('--script', default=DEFAULT_SCRIPT)
    ap.add_argument('--check', action='store_true', help='파일을 고치지 않고 지금 자료와 맞는지만 본다')
    a = ap.parse_args(argv)
    new, old = build(a.script, a.data_dir)
    if a.check:
        if new == old:
            print('스크립트의 자료판 표시가 지금 자료와 같습니다.')
            return 0
        print('스크립트의 자료판 표시가 지금 자료와 다릅니다 — python3 -I tools/make_review_inbox_script.py 로 다시 만드세요.', file=sys.stderr)
        return 1
    if new == old:
        print('이미 최신입니다.')
        return 0
    open(a.script, 'w', encoding='utf-8').write(new)
    print(f'자료판 표시를 새로 만들었습니다: {a.script}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
