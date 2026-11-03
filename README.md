# MedTerm-KR (프로토타입)
약무용어 사전(VTM→VMP→AMP) · 근거 주입 프롬프트 · LLM 답변 검증 웹앱.

1. `web/index.html` 을 브라우저로 연다(서버 불필요).
2. 자세한 설계·검증·한계: `docs/설계_검증_보고서.md` (한국어).
3. 데이터는 프로토타입이며 한글명·상품명은 약사 검수 전 초안이다. 진단·처방 판단용이 아니다.

폴더: `web/`(앱) · `data/`(사전 JSON, 계열 용어 사전) · `build/`(생성·온톨로지 내보내기 스크립트) · `tests/`(벤치마크·UI 테스트, node_modules 제외) · `tools/`(MFDS 수집 스크립트, 사용자 PC에서 실행)

## CLI
`node bin/medterm.mjs help` — 검색·프롬프트·검증·벤치마크·평가. 예: `node bin/medterm.mjs verify --text "메트포르민은 항고혈압제입니다."` (종료코드 1).
평가 입력(JSONL 한 줄): `{"id":1,"condition":"B","text":"…","expert1":false,"expert2":false}` → `node bin/medterm.mjs eval 파일.jsonl`.
`experiments/` 에는 실제 LLM 답변 파일럿(v1·v2)의 질문·답변·판정이 있다. `tools/run_mfds_resume.cmd` 는 사용자 PC의 작업 스케줄러용이다.

## 저장소 구성
`web/` 웹앱(정적, 서버 불필요) · `data/` 사전 JSON·Turtle(OWL/SKOS)·계열 용어 · `build/` 생성·내보내기 스크립트 · `bin/` CLI · `tests/` 벤치마크·UI·CLI 점검 · `tools/` MFDS 수집 · `experiments/` 파일럿 · `docs/` 설계·검증 보고서와 연구 조사(`docs/research/`).
사용 모델 식별 정보는 이 저장소의 파일럿 결과에서 제외했습니다.

## 주의
- 연구·교육용 **프로토타입**입니다. 진단·처방·개인별 복용량 판단에 쓰지 마세요. 복약 결정은 의사·약사와 상담하세요.
- 수록 범위는 **성분 32개**뿐입니다. "사전에 없음"은 환각의 증거가 아니라 *확인 필요* 신호이고, "불일치 없음"은 정확하다는 뜻이 아닙니다.
- 한글명·한국 상품명·계열 용어는 **약사 검수 전 초안**입니다. 제형·함량(VMP/AMP)은 **미국 RxNorm 기준**이라 국내 허가 규격과 다를 수 있습니다.
- 데이터는 NLM RxNorm/RxNav에서 수집했습니다. 데이터·분류 체계의 이용 조건은 각 제공기관의 조건을 따르며, 이 저장소에는 별도의 라이선스를 지정하지 않았습니다.
