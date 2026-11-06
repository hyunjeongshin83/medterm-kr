#!/usr/bin/env python
"""최신 승인·임상 단계·화합물 연결 자료 만들기 — data/medterm_new.json
입력(new_fetch.py 로 받은 폴더 --raw): fda_novel.json(FDA 신약 승인표) · trials.jsonl(ClinicalTrials.gov 요약) · ct_version.json(등록소 API 버전·데이터 처리 시각) · chem.jsonl(PubChem 구조 식별자) · sim.jsonl(PubChem 2D 유사 이웃, 선택)
            · mplus.jsonl(MedlinePlus Connect: 성분 RxCUI → 약 정보 쪽 번호·제목, 선택) · fetch_log.json
            + data/medterm.json · data/medterm_ext.json (성분 이름 연결용)
출력: data/medterm_new.json
원칙
 - 사전의 핵심·확장 수록분은 바꾸지 않는다. 이 파일은 성분 이름(소문자 영문)을 열쇠로 그 위에 얹는 별도 층이다.
 - 임상시험은 '등록 건수·단계·상태' 요약이다: 성분 이름이 시험 중재(intervention 이름·다른 이름, 또는 제목+중재 설명)에 그대로 들어간 등록을 센 것이며(유의어 확장 없음 — 코드명·다른 철자로만 등록된 시험은 빠지고, 비교약·병용약은 섞일 수 있음), 한 성분당 최근 시작 1,000건까지만 센다(cap 표시). 효능·안전성 근거가 아니다.
 - 화합물 연결은 PubChem 이름 검색에서 제목이 성분 이름과 정확히 같은 화합물(또는 후보가 하나뿐인 경우)만 쓴다. 같은 골격 = InChIKey 앞 14자(연결 구조)가 같은 것(입체이성질체 등). 구조 유사 이웃 = PubChem 2D 유사도 0.9 이상, 사전에 있는 성분만.
 - FDA 신약 항목은 사전 성분 이름과 정확히 같을 때만 사전 항목에 연결한다(이름 대조 외의 추측 없음).
사용: python build/new_build.py --raw <new_fetch.py 저장폴더> [--out data/medterm_new.json]"""
import argparse, collections, json, os, re, sys, time
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
BIO_STEM = re.compile(r'^(.*(?:mab|cept|ase|kin|tug|ra|ide|ptin|cel|vec))-[a-z]{4}$')

def app_version():
    return json.load(open(os.path.join(root, 'web-react', 'package.json'), encoding='utf-8'))['version']

def jl(path):
    out = []
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            line = line.strip()
            if line:
                try: out.append(json.loads(line))
                except ValueError: pass
    return out

def clean_ing(s):
    return re.sub(r'\s*\(.*?\)', '', s or '').strip().lower()

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--raw', required=True); ap.add_argument('--out', default=os.path.join(root, 'data', 'medterm_new.json'))
    ap.add_argument('--built-at', default=time.strftime('%Y-%m-%d')); ap.add_argument('--neighbors', type=int, default=6)
    a = ap.parse_args(); raw = a.raw
    core = json.load(open(os.path.join(root, 'data', 'medterm.json'), encoding='utf-8'))
    ext = json.load(open(os.path.join(root, 'data', 'medterm_ext.json'), encoding='utf-8'))
    fda = json.load(open(os.path.join(raw, 'fda_novel.json'), encoding='utf-8'))
    flog = json.load(open(os.path.join(raw, 'fetch_log.json'), encoding='utf-8')) if os.path.exists(os.path.join(raw, 'fetch_log.json')) else {}

    # 1) 성분 이름 → 사전 항목(정확 이름 일치만; 같은 이름이 서로 다른 항목에 걸리면 연결하지 않는다)
    first = {}; alt = {}; conflict = set()
    def put(d, name, eid):
        n = (name or '').strip().lower()
        if not n: return
        if n in d and d[n] != eid: conflict.add(n)
        d.setdefault(n, eid)
    for c in core['concepts']:
        if c.get('type') == 'VTM': put(first, c.get('label_en'), c['id'])
    for e in ext['entities']:
        put(first, e.get('label_en'), e['id'])
        for n in e.get('alt_en') or []: put(alt, n, e['id'])
    name2ent = {n: i for n, i in first.items() if n not in conflict}
    for n, i in alt.items():
        if n not in name2ent and n not in conflict and n not in first: name2ent[n] = i

    # 2) 임상시험 · 화합물 요약 읽기
    trials = {}; ls_dropped = []
    _y, _m = int(a.built_at[:4]), int(a.built_at[5:7]); limit_ym = '%04d-%02d' % (_y + 5, _m)
    for r in jl(os.path.join(raw, 'trials.jsonl')):
        if r.get('n'):
            # 원자료(new_fetch.py)의 act 는 '모집 예정(nyr)'까지 포함하고 rec 는 act 의 부분집합이다. 화면은 겹치지 않는 상태별 건수를 쓰므로
            # act 에서 nyr 를 빼고 rec 는 버린다(진행 중 + 모집 예정 + 완료 + 중단 + 미상 = 가져온 시험 수).
            st = {k: v for k, v in dict(r.get('st', {})).items() if k != 'rec'}
            st['act'] = st.get('act', 0) - st.get('nyr', 0)
            st = {k: v for k, v in st.items() if v}
            # 등록소에는 시작일이 2099-01 같은 입력 오류가 있다. 만든 날로부터 5년을 넘는 '가장 늦은 시작 달'은 믿지 않고 비운다(건수를 세어 meta 에 적는다).
            ls = r.get('last_start') or None
            if ls and ls > limit_ym: ls = None; ls_dropped.append(r['q'])
            trials[r['q']] = {'n': r['n'], 'cap': bool(r.get('cap')), 'ph': r.get('ph', {}), 'st': st, 'ind': r.get('ind', 0), 'spi': r.get('spi', []), 'cond': r.get('cond', []), 'ls': ls, 'np': r.get('next_pc'), 'ex': r.get('ex', [])}
            if 'kr' in r: trials[r['q']]['kr'] = r['kr']        # 시험 장소에 대한민국이 있는 등록 수(n 과 같은 기준)
            if 'res' in r: trials[r['q']]['res'] = r['res']     # 결과가 게시된 등록 수(n 과 같은 기준)
    names_all = json.load(open(os.path.join(raw, 'names.json'), encoding='utf-8')) if os.path.exists(os.path.join(raw, 'names.json')) else []
    queried_tr = {r['q'] for r in jl(os.path.join(raw, 'trials.jsonl'))}
    queried_ch = {r['q'] for r in jl(os.path.join(raw, 'chem.jsonl'))}
    chem = {}
    for r in jl(os.path.join(raw, 'chem.jsonl')):
        if r.get('cid') and r.get('ik'):
            chem[r['q']] = {'cid': r['cid'], 'ik': r['ik'], 'f': r.get('f'), 'mw': r.get('mw'), 't': r.get('t'), 'how': r.get('how')}
    cid2key = {}
    for k in sorted(chem): cid2key.setdefault(chem[k]['cid'], k)
    sim = {}
    for r in jl(os.path.join(raw, 'sim.jsonl')):
        nb = r.get('nb')
        if not nb or r['q'] not in chem: continue
        names = []
        for c in nb:
            k = cid2key.get(c)
            if k and k != r['q'] and chem[k]['ik'][:14] != chem[r['q']]['ik'][:14] and k not in names: names.append(k)
        if names: sim[r['q']] = names[:a.neighbors]

    # 2b) ClinicalTrials.gov 데이터 처리 시각(약관: 처리일 표시 의무) — new_fetch.py 가 수집 전후로 /api/v2/version 을 기록한다.
    ctv = {}
    p_ctv = os.path.join(raw, 'ct_version.json')
    if os.path.exists(p_ctv):
        j = json.load(open(p_ctv, encoding='utf-8')); s0 = j.get('start') or {}; e0 = j.get('end') or {}
        ctv = {'api': s0.get('api'), 'data_ts': s0.get('ts'), 'data_ts_end': e0.get('ts') if e0.get('ts') != s0.get('ts') else None, 'same': bool(j.get('same')), 'fetched': (s0.get('at') or '')[:10] or None}

    # 2c) MedlinePlus Connect: 사전 항목의 RxCUI 로 찾은 영문 약 정보 쪽(제목만; 본문 요약은 받지도 저장하지도 않는다).
    rx_hits = {}; mp_queried = 0
    for r in jl(os.path.join(raw, 'mplus.jsonl')):
        mp_queried += 1
        if r.get('hits'): rx_hits[str(r['q'])] = r['hits']
    mp_rx_total = len(json.load(open(os.path.join(raw, 'mplus_rx.json'), encoding='utf-8'))) if os.path.exists(os.path.join(raw, 'mplus_rx.json')) else mp_queried
    mp = {}
    for key_name, rx in [((c.get('label_en') or '').strip().lower(), str(c.get('rxcui') or '')) for c in core['concepts'] if c.get('type') == 'VTM'] + \
                        [((e.get('label_en') or '').strip().lower(), str(e.get('rxcui') or '')) for e in ext['entities']]:
        if rx in rx_hits and key_name in name2ent and key_name not in mp:
            hs = rx_hits[rx]; mp[key_name] = {'rx': rx, 'n': len(hs), 't': [h['t'] for h in hs[:3]]}

    # 3) 같은 골격(InChIKey 앞 14자) 묶음
    by_sk = collections.defaultdict(list)
    for k, c in chem.items():
        if c['cid'] == cid2key and False: continue
        by_sk[c['ik'][:14]].append(k)
    sk = {ik: sorted(ks) for ik, ks in sorted(by_sk.items()) if len(ks) >= 2}

    # 4) FDA 신약
    novel = []
    for r in sorted(fda['items'], key=lambda r: (r['date'], r['no']), reverse=True):
        ing = clean_ing(r['ingredient']); stem = BIO_STEM.match(ing); base = stem.group(1) if stem else ''
        keys = [k for k in (ing, base) if k]
        key = next((k for k in keys if k in trials or k in chem), ing)
        ent = next((name2ent[k] for k in keys if k in name2ent), '')
        novel.append({'d': r['date'], 'y': r['year'], 'no': r['no'], 'b': r['brand'], 'g': r['ingredient'], 'u': r['use'], 'k': key, 'e': ent})

    # 조회하지 않은 이름(수집이 끝나지 않았을 때만 생김): 화면이 '없음'과 '아직 조회 안 함'을 구별하게 한다.
    unq_tr = sorted(n for n in names_all if n not in queried_tr); unq_ch = sorted(n for n in names_all if n not in queried_ch)
    keys_used = {x['k'] for x in novel} | set(trials) | set(chem) | set(unq_tr) | set(unq_ch) | set(mp)
    ent = {k: name2ent[k] for k in sorted(keys_used) if k in name2ent}

    # 5) 출처
    src_fda = {'id': 'F', 'name': 'FDA CDER 신약 승인표(Novel Drug Approvals)', 'use': '2021년 이후 미국 FDA 신약(신규 분자 실체·신규 생물의약품) 승인일·상표·성분·승인 용도', 'license': '미국 FDA 누리집 공개 정보 — 출처 표시, 이용 조건은 FDA 누리집 고지를 따름', 'license_tag': 'FDA 공개 정보(출처 표시)', 'license_class': 'attribution', 'credit': 'U.S. Food and Drug Administration (FDA)', 'url': 'https://www.fda.gov/drugs/novel-drug-approvals-fda', 'files': ['fda_novel']}
    src_ct = {'id': 'T', 'name': 'ClinicalTrials.gov (미국 NLM)', 'use': '성분 이름이 중재에 그대로 들어간(유의어 확장 없음) 임상시험 등록의 기록 수·단계·상태·시작/완료 예정월·주관 기관, 시험 장소에 대한민국이 있는 등록 수, 결과가 게시된 등록 수', 'license': 'NLM 공개 자료 — 이용약관: ① 출처 ‘ClinicalTrials.gov’ 표시 ② 데이터 처리일 표시 ③ 최신 상태 유지 ④ 가공 내용 명시. 미국 밖에서는 국제 저작권이 적용되고 일부 자료는 제3자 저작권일 수 있어 ‘퍼블릭 도메인’으로 쓰지 않음(요약 수치와 짧은 제목만 사용, 연락처는 받지 않음)', 'license_tag': 'NLM 공개(출처 표시)', 'license_class': 'attribution', 'credit': 'U.S. National Library of Medicine (ClinicalTrials.gov)', 'url': 'https://clinicaltrials.gov/', 'rec_url': 'https://clinicaltrials.gov/study/{nct}', 'files': ['trials']}
    src_mp = {'id': 'M', 'name': 'MedlinePlus Connect (미국 NLM)', 'use': '성분 RxCUI로 찾은 MedlinePlus 영문 약 정보 쪽으로 가는 링크와 제목만(본문 미수록)', 'license': 'NLM — 링크만 이용. 약 정보 본문은 미국약제사회(ASHP) 저작물이라 저작권이 있어 옮기지 않음. NLM 이름·로고는 쓰지 않으며 NLM이 보증하는 것처럼 보이게 하지 않음', 'license_tag': 'NLM 링크만(본문 미수록)', 'license_class': 'attribution', 'credit': 'Source: MedlinePlus, National Library of Medicine', 'url': 'https://medlineplus.gov/', 'files': ['mplus']}
    src_pc = {'id': 'P', 'name': 'PubChem (미국 NCBI/NLM)', 'use': '화합물 식별자(CID·InChIKey)·분자식·분자량, 2D 구조 유사 이웃(유사도 0.9 이상)', 'license': 'NLM 공개 자료 — 출처 표시, 구조 식별자·분자식·분자량·CID 만 사용(개별 출처 자료의 이용 조건은 PubChem 안내 확인)', 'license_tag': 'NLM 공개(출처 표시)', 'license_class': 'attribution', 'credit': 'National Center for Biotechnology Information (PubChem)', 'url': 'https://pubchem.ncbi.nlm.nih.gov/', 'rec_url': 'https://pubchem.ncbi.nlm.nih.gov/compound/{cid}', 'files': ['chem', 'sim']}
    out = {
        'meta': {
            'name': 'MedTerm-KR 최신 승인·임상·화합물 연결', 'version': app_version(), 'built_at': a.built_at, 'review_status': 'draft',
            'notice': '공개 자료를 자동 수집해 만든 초안입니다. FDA 승인은 미국 기준이며 국내 허가·급여를 뜻하지 않습니다. 임상시험 수치는 등록 기록 수 요약일 뿐 효능·안전성 근거가 아닙니다(미국 정부는 등재된 연구의 안전성과 과학성을 검토·승인하지 않습니다). 화합물 연결은 구조 정보 기반의 참고 정보이며 같은 계열·대체 가능을 뜻하지 않습니다.',
            'sources': [src_fda, src_ct, src_pc] + ([src_mp] if mp else []),
            'fetched': {'fda': fda.get('fetched'), 'trials': flog.get('trials.jsonl'), 'chem': flog.get('chem.jsonl'), 'sim': flog.get('sim.jsonl'), **({'mplus': flog.get('mplus.jsonl')} if mp else {})},
            'ct': {**ctv, 'terms': 'https://clinicaltrials.gov/about-site/terms-conditions', 'disclaimer': 'https://clinicaltrials.gov/about-site/disclaimer',
                   'mods': ['성분 이름이 시험 중재(이름·다른 이름)에 그대로 들어간 등록만 골랐습니다. 중재에 없고 제목에만 이름이 있으면 질환(condition)에 그 말이 없을 때만 넣었습니다(유의어 확장 끔).',
                            '한 성분당 시작일이 가장 최근인 1,000건으로 단계·상태·질환·주관 기관을 요약했습니다. 일치한 등록이 그보다 많으면 ‘+’를 붙입니다(기록 수는 받은 일치 등록 수).',
                            '진행 상태는 5개 묶음(진행 중·모집 예정·완료·중단·상태 미상)으로, 단계는 0·1·1/2·2·2/3·3·4·해당 없음으로 묶었고 한국어 이름은 이 앱에서 붙였습니다.',
                            '시험 장소의 국가가 ‘South Korea’인 등록을 국내 시행으로 셌습니다(시설명·연락처는 받지 않았습니다).',
                            '시작일이 만든 날로부터 5년을 넘는 입력 오류는 ‘가장 늦은 시작 달’에서 뺐고(기록 수에는 포함), 시험 제목은 90자로 줄였습니다.']},
            'status_legend': {'act': '진행 중(모집 중·모집 마감 후 진행·초대 등록. 모집 예정은 따로 셈)', 'nyr': '모집 예정(시작 전)', 'done': '완료', 'stop': '중단·종료·철회', 'unk': '상태 미상'},
            'phase_legend': {'0': '탐색', '1': '1상', '1/2': '1/2상', '2': '2상', '2/3': '2/3상', '3': '3상', '4': '4상(허가 후)', 'NA': '해당 없음(기기·행동 등)'},
            'counts': {'novel': len(novel), 'novel_linked': sum(1 for x in novel if x['e']), 'novel_with_trials': sum(1 for x in novel if x['k'] in trials), 'names': len(names_all), 'trials_queried': len(queried_tr), 'chem_queried': len(queried_ch), 'trials': len(trials), 'start_dates_dropped': len(ls_dropped), 'trials_capped': sum(1 for t in trials.values() if t['cap']), 'trials_kr': sum(1 for t in trials.values() if t.get('kr')), 'trials_res': sum(1 for t in trials.values() if t.get('res')),
                       'mplus': len(mp), 'mplus_queried': mp_queried, 'mplus_rx': mp_rx_total, 'chem': len(chem),
                       'chem_how': dict(collections.Counter(c['how'] for c in chem.values())), 'skeleton_groups': len(sk), 'sim': len(sim), 'linked_names': len(ent)},
        },
        'novel': novel, 'tr': {k: trials[k] for k in sorted(trials)}, 'ch': {k: chem[k] for k in sorted(chem)}, 'sk': sk, 'sim': {k: sim[k] for k in sorted(sim)}, 'ent': ent,
    }
    if mp: out['mp'] = {k: mp[k] for k in sorted(mp)}
    if unq_tr or unq_ch: out['unq'] = {'tr': unq_tr, 'ch': unq_ch}
    txt = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    open(a.out, 'w', encoding='utf-8', newline='\n').write(txt)
    c = out['meta']['counts']
    print(f"신약 {c['novel']}(사전 연결 {c['novel_linked']} · 임상 있음 {c['novel_with_trials']}) · 임상 요약 {c['trials']}(상한 도달 {c['trials_capped']} · 국내 시행 {c['trials_kr']} · 결과 게시 {c['trials_res']}) · MedlinePlus {c['mplus']}/{c['mplus_queried']} · 화합물 {c['chem']} {c['chem_how']} · 골격 묶음 {c['skeleton_groups']} · 유사 이웃 {c['sim']} · 이름 연결 {c['linked_names']} · 조회 {c['trials_queried']}/{c['names']}(임상) {c['chem_queried']}/{c['names']}(화합물) · {len(txt) / 1e6:.2f} MB")

if __name__ == '__main__': main()
