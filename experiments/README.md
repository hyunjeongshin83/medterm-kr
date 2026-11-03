# 파일럿 실험(실제 LLM 답변)
- `pilot_llm.py` — 실행 스크립트(분석 커널의 `host.llm` 필요). v2 판.
- `pilot_answers_v1.jsonl` — v1(32 실존+8 가짜, 수정 전). `pilot_answers_v2.jsonl` — v2(+사전 밖 12, 수정 후; 복합제 규칙 적용 전·후 검증 결과를 함께 저장).
- `pilot_judged_v2.json` — 가짜·사전 밖 약물 답변의 판정자 LLM 분류. `pilot_results_v2.json` — 집계(수동 판정 포함).
정답 라벨이 없는 파일럿이며 약사 판독이 아니다. 자세한 해석과 한계는 docs/설계_검증_보고서.md §8.
