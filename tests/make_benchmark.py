"""벤치마크 생성(seed 고정) → Node로 실행 → 요약(web/js/bench.js).
dev: 사전에서 합성한 개발 세트(단위 테스트 성격). heldout/heldout2: 사전 밖 실존 약물명 탐지(독립 평가용)."""
import json, math, os, random, subprocess, sys
import pandas as pd
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
NODE = os.environ.get("NODE", "node")
D = json.load(open(os.path.join(root, "data", "medterm.json"), encoding="utf-8")); CL = json.load(open(os.path.join(root, "data", "class_lexicon.json"), encoding="utf-8"))["classes"]
vtms = [c for c in D["concepts"] if c["type"] == "VTM"]; vmps = {}
for c in D["concepts"]:
    if c["type"] == "VMP" and not c["strength"]["per"] and c["strength"]["unit"] in ("MG", "MCG", "G"):
        vmps.setdefault(c["ingredient"], set()).add(round(c["strength"]["value"] * {"MG": 1, "MCG": 1e-3, "G": 1e3}[c["strength"]["unit"]], 6))
known = {x.lower() for v in vtms for x in [v["label_ko"], v["label_en"], *v["alt_ko"], *v["alt_en"], *v["brands_ko"]]}
cmatch = lambda v, cl: any(code.startswith(p) for code in v["atc_codes"] for p in cl["atc"])
fmt = lambda x: (str(int(x)) if float(x).is_integer() else str(x))
rng = random.Random(20261027); cases = []
def add(cat, text, expect, label): cases.append(dict(id=f"{cat}-{len(cases):03d}", category=cat, text=text, expect=expect, label=label))
for v in vtms:
    ko = v["label_ko"]
    add("N_atc", f"{ko}의 ATC 코드는 {rng.choice(v['atc_codes'])}입니다.", [], "negative")
    ok_vals = sorted(x for x in vmps.get(v["id"], []) if 0.5 <= x <= 2000)
    if ok_vals: add("N_strength", f"{ko} {fmt(rng.choice(ok_vals))}mg 제제가 시판되고 있습니다.", [], "negative")
    cm = [c for c in CL if cmatch(v, c)]
    if cm: add("N_class", f"{ko}은(는) {rng.choice(cm)['aliases'][0]} 계열 약물입니다.", [], "negative")
    add("N_rxcui", f"{v['label_en']} (RxCUI {v['rxcui']})는 성분 수준 개념입니다.", [], "negative")
    other = rng.choice([o for o in vtms if not any(a.startswith(b[:5]) or b.startswith(a[:5]) for a in v["atc_codes"] for b in o["atc_codes"])])
    add("E_atc", f"{ko}의 ATC 코드는 {other['atc_codes'][0]}입니다.", ["atc_mismatch"], "positive")
    allowed = vmps.get(v["id"], set())
    if allowed:
        bad = int(max(allowed) * 3 + 7)
        while round(bad, 6) in allowed: bad += 1
        add("E_strength", f"{ko} {bad}mg 제제가 시판되고 있습니다.", ["strength_not_listed"], "positive")
    add("E_class", f"{ko}은(는) {rng.choice([c for c in CL if not cmatch(v, c)])['aliases'][0]} 계열 약물입니다.", ["class_mismatch"], "positive")
    o2 = rng.choice([o for o in vtms if o is not v])
    add("E_rxcui", f"{ko} (RxCUI {o2['rxcui']})는 성분 수준 개념입니다.", ["rxcui_mismatch"], "positive")
    if rng.random() < 0.5: mut = ko + "린"
    else:
        i = len(ko) // 2; mut = ko[:i] + rng.choice([c for c in "라리루다마신로겔" if c != ko[i]]) + ko[i + 1:]
    if mut.lower() not in known: add("E_misspell", f"{mut}을 복용하면 효과가 있습니다.", ["near_miss", "unknown_drug"], "positive")
invented = ["베르나스타틴","클로라프라졸","디모사르탄","탄사플록사신","리바글립틴","모테프릴","카도올롤","루미디핀","세파마이신","트리나졸람","노바실린","엘로티딘","페로카스타틴","미토사르탄","라도프라졸","솔리마이신"]
for nm in invented:
    assert nm not in known; add("E_fabricated", f"{nm}은(는) 새로운 치료제로 알려져 있습니다.", ["unknown_drug", "near_miss"], "positive")
general = ["하루 세 번 식후에 복용하세요.","증상이 계속되면 의사와 상담하시기 바랍니다.","약은 서늘하고 건조한 곳에 보관합니다.","임산부는 복용 전에 약사에게 문의하세요.","부작용이 나타나면 즉시 복용을 중단하세요.","물과 함께 삼키고 씹지 마세요.","유효기간이 지난 약은 폐기하세요.","어린이의 손이 닿지 않는 곳에 두세요.","복용 시간을 매일 일정하게 유지하는 것이 좋습니다.","이 앱은 의학적 진단을 대신하지 않습니다.","병원 방문 전에 복용 중인 약 목록을 준비하세요.","공복에 복용할지 식후에 복용할지는 처방전을 확인하세요.","건강검진 결과는 담당 의료진과 함께 확인하세요.","예방접종 일정은 질병관리청 안내를 참고하세요.","처방전 없이 구입할 수 있는 약도 주의 사항을 읽어야 합니다.","The patient should consult a pharmacist before changing medication.","Store at room temperature away from moisture.","혈압과 혈당은 정기적으로 측정하세요.","약국에서 복약 지도를 받을 수 있습니다.","알레르기 병력이 있으면 반드시 알려 주세요."]
for t in general: add("N_general", t, [], "negative")
ood = ["라니티딘","카프토프릴","아테놀롤","이트라코나졸","레보플록사신","클래리스로마이신","리시노프릴","프라바스타틴","칸데사르탄","텔미사르탄","란소프라졸","라베프라졸","니페디핀","에날라프릴","로자르탄"]
for nm in ood:
    assert nm not in known; add("OOD_real", f"{nm}도 비슷한 용도로 사용됩니다.", ["unknown_drug", "near_miss"], "ood_real")
# 약물명이면서 계열명이기도 한 용어: 계열명 허용 목록에 있어 경고하지 않는 것이 의도된 동작(트레이드오프)
for nm in ["페니실린"]: add("AMBIG_class", f"{nm}도 비슷한 용도로 사용됩니다.", [], "ambiguous_class_name")
held1 = ["프로프라놀롤","카르베딜롤","비소프롤롤","케토코나졸","플루코나졸","보리코나졸","덱스란소프라졸","피타바스타틴","플루바스타틴","올메사르탄","이르베사르탄","에리트로마이신","토브라마이신","겐타마이신","암피실린","클록사실린","시타글립틴","리나글립틴","빌다글립틴","다파글리플로진","엠파글리플로진","리바록사반","아픽사반","다비가트란","수마트립탄","온단세트론","데스로라타딘","시탈로프람","플루옥세틴","파록세틴","라미프릴","닐바디핀","아미카신","독시사이클린"]
held2 = ["세레콕시브","에토리콕시브","메로페넴","세파졸린","반코마이신","스트렙토마이신","클린다마이신","리네졸리드","메트로니다졸","오셀타미비르","아시클로비르","발라시클로비르","테노포비르","라미부딘","지도부딘","리툭시맙","트라스투주맙","베바시주맙","이마티닙","게피티닙","에를로티닙","소라페닙","수니티닙","인플릭시맙","아달리무맙","덱사메타손","베타메타손","트리암시놀론","하이드로코르티손","부데소니드","플루티카손","네비볼롤","톨터로딘","미라베그론"]
mk = lambda names, tag, cat: [dict(id=f"{tag}-{i:03d}", category=cat, text=f"{nm}도 비슷한 용도로 사용됩니다.", expect=["unknown_drug", "near_miss"], label="ood_real") for i, nm in enumerate(names)]
sets = {"benchmark_cases.json": cases, "benchmark_heldout.json": mk(held1, "HELD", "HELDOUT_real"), "benchmark_heldout2.json": mk(held2, "HELD2", "HELDOUT2_real")}
for f, obj in sets.items(): json.dump(obj, open(os.path.join(here, f), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
def wilson(k, n, z=1.96):
    p = k / n; d = 1 + z * z / n; c = p + z * z / (2 * n); a = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return (c - a) / d, (c + a) / d
bench = {}
for (f, key) in [("benchmark_cases.json", "dev"), ("benchmark_heldout.json", "heldout1"), ("benchmark_heldout2.json", "heldout2")]:
    outf = f.replace(".json", "_results.json").replace("benchmark_cases_results", "benchmark_results")
    r = subprocess.run([NODE, os.path.join(here, "run_benchmark.js"), f, outf], capture_output=True, text=True, encoding="utf-8"); assert r.returncode == 0, r.stderr
    df = pd.DataFrame(json.load(open(os.path.join(here, outf), encoding="utf-8"))["results"]); bench[key] = {}
    for cat, g in df.groupby("category", sort=False):
        k, n = int(g["pass"].sum()), len(g); lo, hi = wilson(k, n); bench[key][cat] = dict(k=k, n=n, lo=round(lo, 3), hi=round(hi, 3))
open(os.path.join(root, "web", "js", "bench.js"), "w", encoding="utf-8").write("window.MEDTERM_BENCH=" + json.dumps(bench, ensure_ascii=False) + ";\n")
print(json.dumps({k: {c: f"{o['k']}/{o['n']}" for c, o in v.items()} for k, v in bench.items()}, ensure_ascii=False, indent=1))
