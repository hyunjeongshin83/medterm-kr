#!/usr/bin/env python
"""확장 수록(ext)용 공개 원자료 내려받기 — 키·로그인 없이 받을 수 있는 것만.
 받는 곳(모두 공개): ① RxNav REST(미국 NLM) ② Wikidata SPARQL(CC0) ③ data.go.kr 파일데이터(심평원, 공공누리 제1유형)
 쓰는 법: python build/ext_fetch.py --raw <저장폴더> [--only rx,wd,hira]   (저장폴더는 저장소 밖에 둔다 — 원자료는 커밋하지 않는다)
 받은 파일은 '신뢰할 수 없는 데이터'로 다룬다: 실행하지 않고 읽기만 한다. 사용자 이메일 등 개인정보는 요청에 넣지 않는다(일반 UA만).
 data.go.kr 인증키(서비스키)는 쓰지 않는다 — 파일데이터는 로그인 없이 받을 수 있는 공개 파일이다."""
import argparse, http.cookiejar, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

UA = 'MedTermKR-build/1.1 (open-data research; python-urllib)'
RXNAV = 'https://rxnav.nlm.nih.gov/REST'
WDQS = 'https://query.wikidata.org/sparql'
DATAGO = 'https://www.data.go.kr'
HIRA_FILES = {'hira_ing': '15067461', 'hira_std': '15067462'}   # 약가마스터 의약품주성분 · 의약품표준코드

# Wikidata: P3345 = RxCUI, P267 = ATC 코드. 가볍고 한 가지씩만 묻는다(합치면 502가 난다).
WD_QUERIES = {
    'wd_en_label': 'SELECT ?rxcui ?v WHERE { ?i wdt:P3345 ?rxcui . ?i rdfs:label ?v . FILTER(LANG(?v)="en") }',
    'wd_en_alias': 'SELECT ?rxcui ?v WHERE { ?i wdt:P3345 ?rxcui . ?i skos:altLabel ?v . FILTER(LANG(?v)="en") }',
    'wd_ko_label': 'SELECT ?rxcui ?v WHERE { ?i wdt:P3345 ?rxcui . ?i rdfs:label ?v . FILTER(LANG(?v)="ko") }',
    'wd_ko_alias': 'SELECT ?rxcui ?v WHERE { ?i wdt:P3345 ?rxcui . ?i skos:altLabel ?v . FILTER(LANG(?v)="ko") }',
    'wd_atc':      'SELECT ?rxcui ?v WHERE { ?i wdt:P3345 ?rxcui . ?i wdt:P267 ?v . }',
    'wd_items':    'SELECT ?rxcui ?item WHERE { ?item wdt:P3345 ?rxcui . }',
}

def http_get(url, headers=None, tries=4, timeout=120):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, **(headers or {})})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except (urllib.error.URLError, TimeoutError) as e:
            last = e; time.sleep(3 * (i + 1))
    raise RuntimeError(f'요청 실패: {url[:90]} — {last}')

def fetch_rx(raw):
    for tty, fn in (('IN', 'rx_in.json'), ('PIN', 'rx_pin.json')):
        b = http_get(f'{RXNAV}/allconcepts.json?tty={tty}', {'Accept': 'application/json'}, timeout=300)
        open(os.path.join(raw, fn), 'wb').write(b); print(fn, len(b))
    b = http_get(f'{RXNAV}/rxclass/allClasses.json?classTypes=ATC1-4', {'Accept': 'application/json'})
    open(os.path.join(raw, 'rx_atc_classes.json'), 'wb').write(b); print('rx_atc_classes.json', len(b))

def fetch_wd(raw):
    for name, q in WD_QUERIES.items():
        url = WDQS + '?format=json&query=' + urllib.parse.quote(q)
        b = http_get(url, {'Accept': 'application/sparql-results+json'}, timeout=300)
        json.loads(b)  # 형식 확인
        open(os.path.join(raw, name + '.json'), 'wb').write(b); print(name + '.json', len(b))
        time.sleep(2)

def portal_info(html):
    """데이터포털 상세 페이지의 구조화 정보(JSON-LD)에서 자료명·등록일·수정일·갱신 주기를 읽는다(없으면 None). 파일 안에는 기준일 열이 없어서 이 값이 자료 시점의 근거다."""
    g = lambda pat: (lambda m: m.group(1) if m else None)(re.search(pat, html))
    return {'title': g(r'"alternateName":"([^"]+)"'), 'registered': g(r'"dateCreated":"(\d{4}-\d{2}-\d{2})"'),
            'modified': g(r'"dateModified":"(\d{4}-\d{2}-\d{2})"'), 'cycle': g(r'"name":"업데이트 주기","value":"([^"]+)"')}

def fetch_datago(raw, key, pk):
    """data.go.kr 파일데이터: 상세 페이지의 내려받기 버튼 정보 → 내려받기 주소 → 파일. (공개 파일만)"""
    d = os.path.join(raw, key); os.makedirs(d, exist_ok=True)
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj)); op.addheaders = [('User-Agent', UA), ('Accept-Language', 'ko,en;q=0.8')]
    html = op.open(f'{DATAGO}/data/{pk}/fileData.do', timeout=60).read().decode('utf-8', 'replace')
    m = re.search(r"fn_fileDataDown\('(\d+)',\s*'([^']+)',\s*'([^']*)',\s*'(\d+)',\s*'(\d+)'\)", html)
    if not m: sys.exit(f'{pk}: 내려받기 버튼 정보를 찾지 못함(페이지 구조가 바뀌었을 수 있음)')
    _, detail, atch, sn, _hist = m.groups()
    body = urllib.parse.urlencode({'publicDataDetailPk': detail, 'publicDataPk': pk, 'atchFileId': atch, 'fileDetailSn': sn, 'publicDataTyCode': 'PR0051'}).encode()
    req = urllib.request.Request(f'{DATAGO}/tcs/dss/selectFileDataDownload.do', data=body, headers={'X-Requested-With': 'XMLHttpRequest', 'Referer': f'{DATAGO}/data/{pk}/fileData.do'})
    js = json.loads(op.open(req, timeout=60).read().decode('utf-8'))
    if js.get('status') is not True: sys.exit(f'{pk}: 내려받기 정보를 받지 못함 — {js.get("error")}')
    nm = (js.get('dataSetFileDetailInfo') or {}).get('dataNm') or pk
    url = f"{DATAGO}/cmm/cmm/fileDownload.do?atchFileId={js['atchFileId']}&fileDetailSn={js['fileDetailSn']}&dataNm={urllib.parse.quote(nm)}"
    r = op.open(urllib.request.Request(url, headers={'Referer': f'{DATAGO}/data/{pk}/fileData.do'}), timeout=600)
    # 응답 머리글의 파일 이름은 UTF-8 바이트가 latin-1 로 읽혀 깨져 들어온다 → 되돌려 읽고, 안 되면 주소 인코딩(%..)을 풀어 본다.
    cd_raw = r.headers.get('Content-Disposition', ''); body = r.read()
    try: cd = cd_raw.encode('latin-1').decode('utf-8')
    except UnicodeError: cd = urllib.parse.unquote(cd_raw)
    m_fn = re.search(r'filename="?([^";]+)"?', cd); filename = m_fn.group(1).strip() if m_fn else None
    m_dt = re.search(r'(20\d{2})(\d{2})(\d{2})', filename or ''); file_date = f'{m_dt.group(1)}-{m_dt.group(2)}-{m_dt.group(3)}' if m_dt else None
    open(os.path.join(d, 'raw.bin'), 'wb').write(body)
    json.dump({'pk': pk, 'dataNm': nm, 'filename': filename, 'file_date': file_date, 'portal': portal_info(html), 'bytes': len(body), 'fetched': time.strftime('%Y-%m-%d')},
              open(os.path.join(d, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(key, pk, filename or nm, len(body))

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--raw', required=True, help='원자료를 저장할 폴더(저장소 밖)')
    ap.add_argument('--only', default='rx,wd,hira', help='쉼표로 구분: rx · wd · hira')
    a = ap.parse_args(); os.makedirs(a.raw, exist_ok=True)
    want = set(a.only.split(','))
    if 'rx' in want: fetch_rx(a.raw)
    if 'wd' in want: fetch_wd(a.raw)
    if 'hira' in want:
        for key, pk in HIRA_FILES.items(): fetch_datago(a.raw, key, pk)

if __name__ == '__main__':
    main()
