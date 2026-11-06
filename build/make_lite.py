"""공개판(lite) 자료·번들 만들기 — 외부에 공개하는 주소(GitHub Pages 등)에 올릴 화면용.

사용: python3 build/make_lite.py --out <폴더>
  → <폴더>/data/*.json   공개판 자료(원본 data/ 는 건드리지 않는다)
  → <폴더>/js/           medterm-*-data.js + core.js · bench.js · layers.js  (그 다음 화면 빌드는 아래처럼)
     cd web-react && MEDTERM_JS=<폴더>/js MEDTERM_DIST=<폴더>/dist MEDTERM_EDITION=lite node build.mjs

공개판에서 빼는 것(재배포 조건을 확인하지 못한 자료):
  1) SNOMED CT ID — 핵심 사전 snomed_ct (32개 성분의 ID 목록)
  2) ATC 분류 이름(영문, WHO ATC) — 핵심 사전 atc(125개), 확장 수록 meta.atc_names(993개), 이름의 근거였던 RxClass 분류 연결(atc_class, 출처 A)
  3) 심평원·Wikidata 자료와 일치하지 않고 RxClass 에서만 온 핵심 사전의 ATC 코드
남기는 것: 심평원 약가마스터(공공누리 제1유형)·Wikidata(CC0)에서 온 ATC 코드 값. 코드 값 자체의 공개 여부는 아직 결정하지 않은 항목이다(README·소개 탭에 적음).
나머지(RxNorm 이름·RxCUI, 심평원 제품, 최신 승인·임상, 약사법 층, 분류 별칭 등)는 그대로 둔다. 모든 한글명·상품명·약사법 쉬운 풀이는 약사 검수 전 초안이다.
"""
import argparse, json, os, re, shutil, subprocess, sys

here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); a = ap.parse_args()
out = os.path.abspath(a.out); ddir = os.path.join(out, "data"); jdir = os.path.join(out, "js")
for d in (ddir, jdir): os.makedirs(d, exist_ok=True)

LITE_NOTE = ("공개판: SNOMED CT ID와 ATC 영문 분류 이름을 뺐습니다. ATC 코드 값은 심평원·Wikidata 자료에서 온 것만 남겼습니다. "
             "한글명·상품명·약사법 쉬운 풀이는 약사 검수 전 초안입니다.")

def load(n): return json.load(open(os.path.join(root, "data", n), encoding="utf-8"))
def save(n, o): json.dump(o, open(os.path.join(ddir, n), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

core, ext = load("medterm.json"), load("medterm_ext.json")
removed = {"snomed_ids": [], "atc_names": set(), "core_codes_dropped": [], "atc_class_links": 0}

# ---- 심평원(H)·Wikidata(W)가 뒷받침하는 ATC 코드(확장 수록 쪽 기록의 출처 표시) ----
hw = {}
for y in ext["entities"]:
    hw[y["rxcui"]] = {c for c, s in (y.get("atc_src") or {}).items() if set(s or "") & set("HW")}

# ---- 핵심 사전 ----
removed["atc_names"].update(core.get("atc", {}).values())
core["atc"] = {}
for c in core["concepts"]:
    if c.get("snomed_ct"):
        removed["snomed_ids"].extend(str(x) for x in c["snomed_ct"])
    if "snomed_ct" in c: c["snomed_ct"] = []
    if "atc_codes" in c:
        keep = [x for x in c["atc_codes"] if x in hw.get(c["rxcui"], set())]
        removed["core_codes_dropped"].extend((c["label_en"], x) for x in c["atc_codes"] if x not in keep)
        c["atc_codes"] = keep
        c["atc_paths"] = {k: v for k, v in (c.get("atc_paths") or {}).items() if k in keep}
        c["atc_source"] = "HW" if keep else None
m = core["meta"]; m["edition"] = "lite"; m["lite_note"] = LITE_NOTE
new_src, found = [], 0
for s in m["sources"]:
    if s.startswith("ATC class names via RxNav RxClass"): found += 1; continue            # 이름 출처 줄은 뺀다
    if s.startswith("RxNorm/RxNav REST (NLM)"):
        found += 1; s = "RxNorm/RxNav REST (NLM): RxCUI, SCD/SBD (공개판: SNOMED CT ID 제외, ATC 코드는 심평원·Wikidata 와 일치하는 것만)"
    new_src.append(s)
if found != 2: raise SystemExit("핵심 사전 meta.sources 의 예상한 두 줄을 찾지 못했습니다(자료 형식이 바뀐 듯): " + repr(m["sources"]))
m["sources"] = new_src

# ---- 확장 수록 ----
em = ext["meta"]
removed["atc_names"].update(em.get("atc_names", {}).values())
em["atc_names"] = {}
em["sources"] = [s for s in em["sources"] if s["id"] != "A"]
em["src_legend"].pop("A", None)
em["files"].pop("rx_atc_classes", None)
for y in ext["entities"]:
    if "atc_class" in y: removed["atc_class_links"] += len(y.pop("atc_class"))
em["edition"] = "lite"; em["lite_note"] = LITE_NOTE
if any(s["id"] == "A" for s in em["sources"]) or "A" in em["src_legend"]: raise SystemExit("출처 A 가 남아 있습니다")

save("medterm.json", core); save("medterm_ext.json", ext)
for n in ("medterm_kr_products.json", "medterm_new.json", "medterm_law.json", "class_lexicon.json", "product_lexicon.json"):
    shutil.copyfile(os.path.join(root, "data", n), os.path.join(ddir, n))

# ---- 점검: 뺀 자료가 공개판 자료 어디에도 남지 않았는지 ----
texts = {n: open(os.path.join(ddir, n), encoding="utf-8").read() for n in os.listdir(ddir) if n.endswith(".json")}
bad = []
for sid in set(removed["snomed_ids"]):
    for n, t in texts.items():
        if re.search(r'"' + re.escape(sid) + r'"', t): bad.append(("SNOMED CT ID", sid, n))
# 이름이 남았는지는 "자료의 칸"으로 확인한다: 핵심 atc · 확장 meta.atc_names 가 비었고 atc_class 가 없고 snomed_ct 가 비었다(아래 assert).
# 글자 찾기는 보조 점검이다: 여러 낱말로 된 분류 이름(예: "Caries prophylactic agents")이 우리가 고친 두 자료 파일에 남았는지만 본다.
# (낱말 하나짜리 이름은 Potassium·Magnesium 처럼 성분 영문명이 같은 글자이고, 다른 파일의 임상시험 제목·제품 성분명에도 평범하게 나오므로 글자 찾기로는 구분할 수 없다.)
for nm in sorted(x for x in removed["atc_names"] if " " in x):
    for n in ("medterm.json", "medterm_ext.json"):
        if nm in texts[n]: bad.append(("ATC 영문 이름", nm, n))
assert not core["atc"] and not em["atc_names"], "ATC 이름 칸이 비어 있어야 합니다"
assert all(not c.get("snomed_ct") for c in core["concepts"]), "SNOMED CT 칸이 비어 있어야 합니다"
assert not any("atc_class" in y for y in ext["entities"]), "atc_class 가 없어야 합니다"
if bad: raise SystemExit("공개판 자료에 뺀 자료가 남아 있습니다: " + repr(bad[:10]))

# ---- 번들(JS 변수) + 화면 코드 복사 ----
env = dict(os.environ, MEDTERM_DATA_DIR=ddir, MEDTERM_JS_OUT=jdir)
subprocess.run([sys.executable, os.path.join(here, "make_bundle.py")], check=True, env=env, stdout=subprocess.DEVNULL)
for f in ("core.js", "bench.js", "layers.js"):
    shutil.copyfile(os.path.join(root, "web", "js", f), os.path.join(jdir, f))

print(json.dumps({
    "out": out,
    "snomed_ids_removed": len(set(removed["snomed_ids"])),
    "atc_names_removed": len(removed["atc_names"]),
    "atc_class_links_removed": removed["atc_class_links"],
    "core_atc_codes_dropped(RxClass-only)": removed["core_codes_dropped"],
}, ensure_ascii=False, indent=1))
