#!/usr/bin/env python
"""약사 검수 확인서 병합 도구(운영자용) — 약사가 앱에서 내보낸 파일을 검증해 data/review/pharmacist_reviews.json 에 합치고, 현황(검수 2·3단계)을 보여 준다.
 입력: 앱 ‘데이터·한계 → 약사 검수 참여’에서 약사가 만든 제출 파일(JSON, 형식 medterm-kr-review/1). 파일로 받았든 복사한 글을 붙여 저장했든 같다.
 이 도구는 자료 파일만 읽고 쓴다. 네트워크·서비스키·실행 호출이 없고, 판정 값을 만들어 내지 않는다. 약사 면허를 대신 확인해 주지도 않는다.

 ■ 병합 순서(운영자가 하는 일)
   1) 약사에게 받은 파일을 연다(내용을 읽어 본다).  2) 약사 면허를 따로 확인한다(방법은 운영자가 정한다; 면허번호·사본은 저장소에 두지 않는다).
   3) 확인했으면:  python -I tools/merge_pharmacist_reviews.py 받은파일.json --license-verified [--reviewer-id P1] [--report 보고서.md]
      · 병합하기 전에 먼저 --dry-run 으로 결과만 볼 수 있다.   · --license-verified 없이는 합치지 않는다.
      · 공개에 동의한 약사는 이름·소속이 같으면 같은 검수자(P번호)로 합쳐진다. 비공개 약사가 다시 낼 때는 --reviewer-id 로 번호를 알려 줘야 같은 사람으로 합쳐진다.
   4) 화면 다시 만들기: python3 build/make_bundle.py → cd web-react && npm run build (그 뒤 시험 npm test).
 ■ 보고서(--report)에는 약사가 쓴 메모(수정 제안)가 들어 있다. 운영자만 보는 파일이며 저장소에 올리지 않는다(저장 자료에는 메모를 담지 않는다).
 ■ 현황만 보기:  python -I tools/merge_pharmacist_reviews.py --status      저장 자료 점검:  python -I tools/merge_pharmacist_reviews.py --check
사용: python -I tools/merge_pharmacist_reviews.py [제출파일] [--license-verified] [--reviewer-id P1] [--verified-on YYYY-MM-DD] [--dry-run] [--report 보고서.md] [--status] [--check] [--store 파일] [--data-dir 폴더]"""
import argparse, datetime, json, os, sys

here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
sys.path.insert(0, os.path.join(root, 'build'))
import review_lib as RL

VNAME = {'ok': '같다(맞다)', 'diff': '다르다(수정 필요)', 'unsure': '모르겠다'}


def read_submission(path):
    if not os.path.exists(path):
        raise RL.ReviewError(f'제출 파일이 없습니다: {path}')
    if os.path.getsize(path) > RL.MAX_FILE_BYTES:
        raise RL.ReviewError(f'제출 파일이 너무 큽니다(> {RL.MAX_FILE_BYTES:,} 바이트)')
    raw = open(path, 'rb').read()
    try:
        return json.loads(raw.decode('utf-8-sig'))
    except (UnicodeDecodeError, ValueError) as e:
        raise RL.ReviewError(f'JSON 으로 읽지 못했습니다({e}). 복사하다 잘렸거나 따옴표가 바뀌었을 수 있으니 약사에게 파일로 다시 받아 주세요')


def status_lines(items, store):
    st = RL.compute_status(items, store)
    out = []
    for sid, s in st['scopes'].items():
        lab = items['scopes'][sid]['label']
        stage = '3단계(검수 완료)' if s['stage3'] else '2단계(약사 확인 끝)' if s['stage2'] else '진행 중' if s['answered'] else '아직'
        out.append(f"[{sid}] {lab}: {s['answered']}/{s['n']} 판정 · 같다 {s['confirmed']} · 다르다 {s['issue']} · 모르겠다만 {s['unsure']} · 다시 확인 필요 {s['need_recheck']} → {stage}")
        for r in s['reviewers']:
            who = f"{r['name']}{'(' + r['org'] + ')' if r['org'] else ''}" if r['name'] else '비공개 약사'
            out.append(f"    {r['pid']} {who}: {r['n']}개(확인서 {r['att']}개) · {r['date']}")
    out.append(f"기준일(마지막 면허 확인일): {st['asof'] or '없음'}")
    return out


def report_md(rep, warns, today):
    rr = rep['reviewer_raw']
    L = [f'# 약사 제출 파일 병합 보고 ({today})', '',
         '> 운영자용 문서입니다. 약사가 쓴 메모가 들어 있으므로 저장소에 올리지 않습니다.', '',
         f"- 범위: {RL.SCOPE_LABEL.get(rep['scope'], rep['scope'])} (`{rep['scope']}`)",
         f"- 검수자(제출 파일 기준): {rr['name']}" + (f" / {rr['affiliation']}" if rr['affiliation'] else '') + f" · 공개 동의: {'예' if rr['public'] else '아니오'} → 검수자 번호 {rep['pid']}",
         f"- 확인서 동의(attested): {'예' if rep['attested'] else '아니오(진행 상황 파일)'} · 작성일 {rep['created']}",
         f"- 반영한 판정 {rep['count']}개: " + ' · '.join(f"{VNAME[v]} {n}" for v, n in rep['verdicts'].items())]
    for w in warns:
        L.append(f'- 경고: {w}')
    L += ['', '## 고칠 후보(다르다·모르겠다로 표시된 항목)', '']
    if not rep['flagged']:
        L.append('없음')
    for f in rep['flagged']:
        it = f['item']
        what = (f"{it['en']} → {it['ko']}" + (f" (다른 표기: {', '.join(it['alt'])})" if it.get('alt') else '') if it.get('k') == 'ing'
                else f"{it['ko']}({it['en']})의 국내 상품명 ‘{it['b']}’" if it.get('k') == 'brand' else f"{it['a']} {it['t']} — 풀이: {it['pl']}")
        L.append(f"- **{it['no']}번 · {VNAME[f['verdict']]}** · {what}")
        if f['note']:
            L.append(f"  - 약사 메모: {f['note']}")
    L += ['', '고친 뒤에는 그 항목의 내용이 바뀌어 지난 판정이 ‘지난 판’이 됩니다. 고친 항목은 약사에게 다시 확인받아야 3단계가 됩니다.', '']
    return '\n'.join(L)


def main(argv=None):
    ap = argparse.ArgumentParser(description='약사 검수 확인서를 검증해 합치고 현황을 보여 준다(자료 파일만 읽고 씀, 네트워크 없음).')
    ap.add_argument('submission', nargs='?', help='약사가 앱에서 낸 제출 파일(JSON)')
    ap.add_argument('--license-verified', action='store_true', help='운영자가 이 약사의 면허를 따로 확인했다(없으면 합치지 않음)')
    ap.add_argument('--reviewer-id', help='이미 있는 검수자 번호(예: P1). 비공개 약사의 두 번째 제출 등에 쓴다')
    ap.add_argument('--verified-on', help='면허를 확인한 날(YYYY-MM-DD, 기본 오늘)')
    ap.add_argument('--dry-run', action='store_true', help='합친 결과만 보여 주고 저장하지 않는다')
    ap.add_argument('--report', help='운영자용 보고서(약사 메모 포함)를 쓸 마크다운 파일')
    ap.add_argument('--status', action='store_true', help='현재 현황만 보여 준다')
    ap.add_argument('--check', action='store_true', help='저장 자료가 규칙에 맞는지 점검한다(어긋나면 종료 코드 1)')
    ap.add_argument('--data-dir', default=os.path.join(root, 'data'), help='자료 폴더(기본 data)')
    ap.add_argument('--store', help='병합 결과 파일(기본 <data-dir>/review/pharmacist_reviews.json)')
    ap.add_argument('--today', help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    today = datetime.date.fromisoformat(a.today) if a.today else datetime.date.today()
    store_path = a.store or os.path.join(a.data_dir, 'review', RL.STORE_NAME)
    try:
        items = RL.build_items(a.data_dir)
        store = RL.load_store(store_path)
        if a.check:
            errs, warns = RL.check_store(store, items)
            if os.path.exists(store_path) and open(store_path, 'rb').read().decode('utf-8') != RL.dump_store(store):
                errs.append('파일 형식이 이 도구가 쓰는 형식과 다릅니다(손으로 고쳤다면 도구로 다시 저장해야 합니다)')
            for e in errs:
                print('오류:', e)
            for w in warns:
                print('경고:', w)
            print('저장 자료 점검: ' + ('통과' if not errs else f'오류 {len(errs)}개'))
            return 1 if errs else 0
        if a.status or not a.submission:
            print('\n'.join(status_lines(items, store)))
            return 0
        sub = read_submission(a.submission)
        verified_on = a.verified_on or today.isoformat()
        rep = RL.merge_submission(store, items, sub, a.license_verified, verified_on, a.reviewer_id, today)
        errs, _ = RL.check_store(store, items)
        if errs:
            raise RL.ReviewError('병합 결과가 점검을 통과하지 못했습니다: ' + '; '.join(errs[:3]))
    except RL.ReviewError as e:
        print('병합하지 않았습니다 —', e)
        return 2
    rr = rep['reviewer_raw']
    print(f"검수자 {rep['pid']} ({rr['name']}{' / ' + rr['affiliation'] if rr['affiliation'] else ''}, 공개 동의 {'예' if rr['public'] else '아니오'}) · 범위 {rep['scope']} · 판정 {rep['count']}개 "
          + '(' + ' · '.join(f'{VNAME[v]} {n}' for v, n in rep['verdicts'].items()) + f") · 확인서 {'동의' if rep['attested'] else '미동의(진행 상황)'}")
    for w in rep['warnings']:
        print('경고:', w)
    print(f"고칠 후보 {len(rep['flagged'])}개(다르다·모르겠다)" + (' — --report 로 보고서를 만들면 약사 메모와 함께 볼 수 있습니다' if rep['flagged'] and not a.report else ''))
    if a.report:
        with open(a.report, 'w', encoding='utf-8', newline='\n') as f:
            f.write(report_md(rep, rep['warnings'], today.isoformat()))
        print('보고서:', a.report)
    print('--- 병합 후 현황 ---')
    print('\n'.join(status_lines(items, store)))
    if a.dry_run:
        print('(--dry-run: 저장하지 않았습니다)')
        return 0
    os.makedirs(os.path.dirname(store_path) or '.', exist_ok=True)
    with open(store_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(RL.dump_store(store))
    print('저장:', os.path.relpath(store_path, root) if store_path.startswith(root) else store_path)
    print('다음: python3 build/make_bundle.py → cd web-react && npm run build → npm test')
    return 0


if __name__ == '__main__':
    sys.exit(main())
