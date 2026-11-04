# MedTerm-KR
약무용어 사전(VTM→VMP→AMP) · 근거 주입 프롬프트 · LLM 답변 검증 웹앱.

1. `web/index.html` 을 브라우저로 연다(서버 불필요). 3단 화면(분류 트리 · 작업 탭 · 상세)이며 좁은 화면에서는 서랍으로 바뀐다. 성분 주소 공유: `index.html#MT:VTM:7646`. "관계 그래프" 탭은 고른 성분 중심의 분류·제품 관계를 SVG로 보여준다(`node tests/test_graph.js`로 모델 점검).
2. 자세한 설계·검증·한계: `docs/설계_검증_보고서.md` (한국어).
3. 수록 범위는 **핵심 사전 성분 32개**(제형·제품까지)와 **확장 수록 성분 3,526개**(이름·ATC·국내 등재 현황만, v1.1.0, `data/README.md`)이며, 한글명·상품명은 모두 약사 검수 전 초안이다. 진단·처방 판단용이 아니다. "근거 기반 질의"의 LLM 질의문·답변은 리서치용이다.

## 바로 가기 (링크)
- 웹 화면(공유 페이지, 2026-11-04 새 디자인): https://claude.ai/artifact/3sczdoo74SPLoMg8LmTQ5S — **비공개**라 소유자 계정으로 로그인해야 열린다(공개 주소 아님).
- Figma 화면 설계(MedTerm-KR, 이전 파란 디자인): https://www.figma.com/design/PotdShI3iRc93DpN4DbsWw
- Figma 참고 템플릿(Mobile app UI Template, 커뮤니티 파일, 2026-11-04 전달받음 — **화면 구성(버튼·사진 자리·카드)만** 웹·앱에 반영, 글씨는 그대로. 원본 화면은 열람하지 못해 말로 전달받은 설명으로 만들었음): https://www.figma.com/design/YWPjl2mqIzpjjl1OesjvRd/Mobile-app-UI-Template--Community-?node-id=1-9
- 설치형 웹앱(PWA)·안드로이드 앱: 접속 주소 없음. 웹앱은 `web-react/dist/pwa/` 폴더째 https 서버에 올리면 동작하고, APK 만드는 법은 `android-app/README.md` 에 있다(저장소에는 APK 를 올리지 않음).
- 누구나 여는 **공개 주소(GitHub Pages 등)는 아직 만들지 않았다**. 공개하려면 SNOMED CT · ATC 값의 재배포 조건부터 확인해야 한다(아래 "설치형 웹앱" 절과 `docs/research/05_수록범위확대_DB조사_20261103.md`).

폴더: `web/`(앱) · `web-react/`(React 화면 소스·빌드, 아래 참고) · `android-app/`(설치형 안드로이드 앱, 아래 참고) · `.github/workflows/`(APK 만들기, 수동 실행) · `data/`(핵심·확장 사전 JSON, 계열 용어 사전, 설명 `data/README.md`) · `build/`(생성·온톨로지 내보내기·확장 수록 수집/빌드 스크립트) · `tests/`(벤치마크·UI 테스트, node_modules 제외) · `tools/`(MFDS 수집 스크립트는 사용자 PC에서 실행, `tools/coverage/`는 수록 범위 표본 점검)

## React 화면 (`web-react/`, 2026-11-03 추가)
같은 3단 화면을 React 18 + Tailwind + React Flow 로 다시 만든 소스다. 사전 데이터와 검증 로직(`web/js/`)은 그대로이고 화면만 바뀌었다. 기존 `web/` 은 비교·문서용으로 그대로 동작한다.
- 결과물: `web-react/dist/MedTerm-KR_react.html`(독립 실행, 서버 불필요, 글꼴 포함이라 약 1.8 MB) · `web-react/dist/artifact.html`(공유 페이지용 조각) · `web-react/dist/pwa/`(설치형 웹앱, 아래 참고). 성분 주소: `#v-7646`(예전 `#MT:VTM:7646` 도 열림).
- 만들기·점검: `cd web-react && npm ci && npm run build`, 점검 방법과 구조는 `web-react/README.md`. 오픈소스 고지문: `web-react/THIRD_PARTY_NOTICES.txt`.
- 반응형 화면 구성(2026-11-04): 휴대폰은 하단 탭 + 카드 목록 + 아래에서 올라오는 상세 시트, 태블릿은 서랍, 노트북 이상은 3단(카드 1~3열). 자세히: `web-react/README.md` 의 "화면 구성(모바일 앱 템플릿식)과 반응형".
- 실사용판 표기(2026-11-04): 화면·설치 정보 어디에도 "프로토타입" 표기를 쓰지 않고, 버전(현재 `v1.1.0`)은 `web-react/package.json` 한 곳에서 정한다. "근거 기반 질의" 탭은 **리서치용**으로 표시되고 LLM 질의문은 리서치 형식(R1, `web-react/src/lib/researchPrompt.js`)이다. 자세히: `web-react/README.md` 의 "실사용판 표기와 리서치용 LLM 질의".
- 검색 막힘 해소(v1.0.1, 2026-11-04): 검색 상자가 분류 이름(`PPI`·`진통제`·`항응고제` …)과 ID 표기(`MT:VTM:7646`·`[MT:VTM:7646]`·`RxCUI 7646`)를 알아보고, 전각 글자·조합형 한글도 같게 본다. 사전에 성분이 없는 분류(ACE 억제제·베타차단제)는 "분류는 알지만 이 사전에 성분이 없음 — 확인 필요"로 안내한다. 질의문(R1)은 질문 속 구조 태그를 무력화하고, 제형 한글명 23종(85개 VMP)을 채웠다(수기 직역 초안·미검수). 시험: `node tests/search_forms.js` · `node tests/data_check.js` · `cd web-react && npm test`.
- 확장 수록(v1.1.0, 2026-11-04): 공개 자료(RxNorm · 심평원 약가마스터 · Wikidata)를 자동으로 모아 서로 연결한 성분 3,526개를 핵심 32개 **옆에** 더했다(핵심 값은 바꾸지 않음). 사전 검색·ATC 대분류 거르기·상세(국내 등재 품목 수·제형·함량 요약)·관계 그래프(성분·ATC·같은 세부군)·답변 검증(이름·ATC·계열)·근거 기반 질의에서 쓰이며 **모두 약사 검수 전 초안**이다. 확장 성분에는 제형·용량(VMP)·제품(AMP)이 없고 단위용량 검사를 하지 않으며, ATC·계열이 다르면 오류가 아니라 경고로 표시한다. 자료 파일(`web/js/medterm-ext-data.js`) 없이 빌드하면 이전과 똑같이 핵심 사전만으로 동작한다(시험 `tests/ui.cjs` 17번 묶음). 같은 벤치마크 문장을 확장 수록으로도 검증해 비교했다(`node tests/ext_benchmark.js`): 오류·정상 문장의 판정은 그대로이고 가짜 이름은 모두 걸러지며(일부는 "사전 밖" 대신 "확장 수록 이름과 철자가 비슷함"으로 표시), 달라진 것은 핵심 밖의 실제 약이 사전에 들어와 더는 "사전 밖"으로 걸리지 않게 된 것뿐이다. 자세히: `data/README.md` · `web-react/README.md` 의 "확장 수록".
- 디자인(2026-11-04): 메디노트(MediNote)와 같은 글꼴(Pretendard)·색(브랜드 틸 `#0A7168`)·글자 크기·모서리로 바꿨다. 값의 원본은 `web-react/tokens.json`, 글꼴은 `web-react/fonts/`. Figma 파일 `PotdShI3iRc93DpN4DbsWw` 는 **아직 새 디자인으로 바꾸지 않았다**(이전 파란 계열). 현황과 Figma–React 차이: `docs/Figma_React_안내_20261103.md`.
- 수록 범위 확대(식약처·심평원·RxNorm 등 데이터 출처, 라이선스, 단계별 계획) 조사: `docs/research/05_수록범위확대_DB조사_20261103.md`.

## 설치형 웹앱 (PWA, `web-react/dist/pwa/`, 2026-11-04 추가)
같은 React 화면을 휴대폰·PC에 설치해서 앱처럼 쓰고, 인터넷이 없어도 열리게 한 웹앱이다(설치 정보 + 오프라인용 서비스 워커 + 아이콘). 폴더째 https 서버의 아무 경로에 올려도 동작한다(경로가 모두 상대 경로).
- 내 PC에서 열어 보기: `cd web-react && python3 -m http.server 8080 --directory dist/pwa` → 크롬에서 `http://localhost:8080/`. 서비스 워커는 **https 또는 localhost 에서만** 동작한다. 자세한 설명·점검: `web-react/README.md` 의 "웹앱(PWA)".
- **공개 주소는 아직 정하지 않았다.** 비공개 저장소의 GitHub Pages 는 사이트가 공개되므로 켜지 않았다. 공개하려면 SNOMED CT · ATC 값의 재배포 조건부터 확인해야 한다(`docs/research/05_수록범위확대_DB조사_20261103.md`).
- 크롬(데스크톱·휴대폰 폭 모의)에서 점검했고(`web-react/tests/pwa.cjs`, 34개; 전체 시험 `cd web-react && npm test`), 실제 휴대폰에서 설치해 본 확인은 아직 없다.

## 설치형 안드로이드 앱 (`android-app/`, 2026-11-04 추가)
같은 React 화면(`web-react/dist/MedTerm-KR_app.html`)을 앱 안에 담아 휴대폰에 설치하는 앱이다(Java + 기본 WebView, 외부 라이브러리 없음, **인터넷 권한 없음**: 화면과 사전이 모두 앱 안에 있다). 안드로이드 8.0 이상.
- 설치·다시 만들기·서명 주의: `android-app/README.md`. 저장소에서 APK 를 만들려면 Actions → android-app → Run workflow(`.github/workflows/android-apk.yml`, 수동 실행).
- 현재 버전 **1.1.0(6)**. 개인 확인용 서명(디버그 키)이다. 정식 배포용 서명 키와 앱 ID 는 정해지지 않았다. 휴대폰에서 직접 설치·실행해 본 확인은 아직 없다(`android-app/README.md` 의 "확인하지 못함" 참고).

## CLI
`node bin/medterm.mjs help` — 검색·프롬프트·검증·벤치마크·평가. 예: `node bin/medterm.mjs verify --text "메트포르민은 항고혈압제입니다."` (종료코드 1).
`prompt` 명령의 질의문은 이전 형식(`buildGroundedPrompt`)이며, 화면의 리서치 질의문(R1)과 다르다(실험 기록과 맞추기 위해 그대로 둠).
CLI 와 예전 화면(`web/index.html`)은 **핵심 사전(성분 32개)만** 쓴다 — 확장 수록은 React 화면(`web-react/`)에만 들어 있다.
평가 입력(JSONL 한 줄): `{"id":1,"condition":"B","text":"…","expert1":false,"expert2":false}` → `node bin/medterm.mjs eval 파일.jsonl`.
`experiments/` 에는 실제 LLM 답변 파일럿(v1·v2)의 질문·답변·판정이 있다. `tools/run_mfds_resume.cmd` 는 사용자 PC의 작업 스케줄러용이다.

## 저장소 구성
`web/` 웹앱(정적, 서버 불필요) · `data/` 핵심·확장 사전 JSON·Turtle(OWL/SKOS)·계열 용어 · `build/` 생성·내보내기 스크립트 · `bin/` CLI · `tests/` 벤치마크·UI·CLI 점검 · `tools/` MFDS 수집 · `experiments/` 파일럿 · `docs/` 설계·검증 보고서와 연구 조사(`docs/research/`).
사용 모델 식별 정보는 이 저장소의 파일럿 결과에서 제외했습니다.

## 주의
- **정보 제공용**입니다. 진단·처방·개인별 복용량 판단에 쓰지 마세요. 복약 결정은 의사·약사와 상담하세요.
- "근거 기반 질의"의 질의문과 LLM 답변은 **리서치용**입니다. 사전 근거를 붙여도 LLM 은 틀릴 수 있으므로 임상 판단·복약 안내에 쓰지 마세요.
- 수록 범위는 **핵심 성분 32개 + 확장 수록 3,526개**(이름·ATC·국내 등재 현황만)뿐입니다. "사전에 없음"(핵심·확장 어디에도 없음)은 환각의 증거가 아니라 *확인 필요* 신호이고, "불일치 없음"은 정확하다는 뜻이 아닙니다. 확장 수록을 쓰면 핵심 밖의 실제 약 이름이 사전에 들어와 "사전 밖 약물명" 탐지가 그만큼 줄어듭니다(설계된 변화).
- 한글명·한국 상품명·계열 용어는 **약사 검수 전 초안**입니다. 제형·함량(VMP/AMP)은 **미국 RxNorm 기준**이라 국내 허가 규격과 다를 수 있습니다. 확장 수록의 한글 이름·상품명·국내 등재 현황(심평원 약가마스터, 파일 기준일 2025-10-31 · 2026-08-31)은 자동으로 뽑은 후보이며, 심평원 ‘등재’는 식약처 ‘허가’와 같은 뜻이 아닙니다.
- 핵심 사전은 NLM RxNorm/RxNav에서 수집했고, 확장 수록은 RxNorm · 건강보험심사평가원 약가마스터(공공데이터포털, 공공누리 제1유형 — 출처: 건강보험심사평가원) · Wikidata(CC0) · RxClass 의 공개 자료를 가공한 것입니다. 가공본은 각 기관이 보증하지 않습니다. 데이터·분류 체계의 이용 조건은 각 제공기관의 조건을 따르며(`data/README.md`), 이 저장소에는 별도의 라이선스를 지정하지 않았습니다.
