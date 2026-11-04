#!/usr/bin/env python
"""data/medterm.json 의 VMP 에 한글 제형명(form_ko)을 채운다 — RxNav 를 다시 받지 않는다(받으면 건수가 달라질 수 있다).
 - form_ko 가 비어 있는 VMP 만 form_ko.py 의 표로 채운다. 이미 있는 값은 건드리지 않는다.
 - 표에 없는 영문 제형이 있으면 아무것도 쓰지 않고 목록을 보여 준 뒤 실패한다(추측해서 채우지 않는다).
 - meta.sources 에 출처 한 줄(제형 한글명: 수기 직역 초안(미검수))을 더한다(이미 있으면 그대로).
사용: python build/apply_form_ko.py [--check]   (--check: 쓰지 않고 채울 건수만 센다)
이어서: python build/make_bundle.py && python build/export_ontology.py  (번들·온톨로지 다시 만들기)"""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
sys.path.insert(0, here)
from form_ko import FORM_KO, SOURCE_NOTE
path = os.path.join(root, "data", "medterm.json")
raw = open(path, encoding="utf-8", newline="").read(); d = json.loads(raw)
CRLF = "\r\n" in raw          # 저장소의 이 파일은 줄바꿈이 CRLF 다 — 그대로 지켜 불필요한 변경 줄이 생기지 않게 한다
vmps = [c for c in d["concepts"] if c["type"] == "VMP"]
missing = sorted({c["form_en"] for c in vmps if not c.get("form_ko") and c["form_en"] not in FORM_KO})
if missing:
    print("한글 제형명 표에 없는 영문 제형:", missing); sys.exit(1)
fill = [c for c in vmps if not c.get("form_ko")]
conflict = sorted({(c["form_en"], c["form_ko"]) for c in vmps if c.get("form_ko") and FORM_KO.get(c["form_en"]) not in (None, c["form_ko"])})
if conflict:
    print("이미 들어 있는 값이 표와 다름(확인 필요):", conflict); sys.exit(1)
print(f"채울 VMP {len(fill)}개 · 영문 제형 {len({c['form_en'] for c in fill})}종 / 전체 VMP {len(vmps)}개")
if "--check" in sys.argv: sys.exit(0)
for c in fill: c["form_ko"] = FORM_KO[c["form_en"]]
if SOURCE_NOTE not in d["meta"]["sources"]: d["meta"]["sources"].append(SOURCE_NOTE)
out = json.dumps(d, ensure_ascii=False, indent=1)
open(path, "w", encoding="utf-8", newline="").write(out.replace("\n", "\r\n") if CRLF else out)
print("쓰기 완료:", path)
