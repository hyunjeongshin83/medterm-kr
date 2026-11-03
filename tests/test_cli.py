"""CLI(bin/medterm.mjs) 점검. 실행: python tests/test_cli.py  (환경변수 NODE 로 node 경로 지정 가능)"""
import json, os, subprocess, sys, tempfile
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
NODE = os.environ.get("NODE", "node"); CLI = os.path.join(root, "bin", "medterm.mjs")
def run(args, stdin=None):
    p = subprocess.run([NODE, CLI] + args, capture_output=True, text=True, encoding="utf-8", input=stdin, timeout=60); return p.returncode, p.stdout, p.stderr
checks = []
def ok(name, cond, extra=""): checks.append(("PASS" if cond else "FAIL", name, str(extra)[:120]))
rc, o, e = run(["info", "--json"]); ok("info counts", rc == 0 and json.loads(o)["counts"]["VTM"] == 32, o[:60])
rc, o, e = run(["search", "오메프라졸", "--json"]); h = json.loads(o); ok("search exact hit first", rc == 0 and h[0]["id"] == "MT:VTM:7646" and h[0]["score"] == 100, h[0]["id"] if h else "")
rc, o, e = run(["search", "A10BA", "--json"]); ok("search by ATC prefix", "메트포르민" in o)
rc, o, e = run(["search", "없는약물이름"]); ok("search miss message", rc == 0 and "사전에 없음" in o)
rc, o, e = run(["show", "타이레놀", "--json"]); s = json.loads(o); ok("show resolves brand -> ingredient", s["ko"] == "아세트아미노펜" and "N02BE01" in json.dumps(s, ensure_ascii=False))
rc, o, e = run(["show", "없는약물"]); ok("show miss exits 3", rc == 3)
rc, o, e = run(["prompt", "오메프라졸과 에스오메프라졸의 ATC 코드는?", "--json"]); p = json.loads(o); ok("prompt retrieves both + dictionary block", len(p["ids"]) >= 2 and "<사전>" in p["user"] and "사전에 없어 확인할 수 없음" in p["system"], p["ids"])
rc, o, e = run(["verify", "--text", "메트포르민은 항고혈압제로 ATC 코드 C09CA01에 해당합니다.", "--json"]); v = json.loads(o); ok("verify conflict -> exit 1", rc == 1 and v["summary"]["error"] >= 2, rc)
rc, o, e = run(["verify", "--json"], stdin="오메프라졸의 ATC 코드는 A02BC01입니다."); ok("verify clean via stdin -> exit 0", rc == 0 and json.loads(o)["summary"]["verdict"] == "no_conflict_found", rc)
rc, o, e = run(["verify", "--text", "베르나스타틴은 새로운 치료제입니다."]); ok("verify warn only -> exit 2", rc == 2, rc)
with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f: f.write("아토르바스타틴 37mg 정제가 있습니다."); fp = f.name
rc, o, e = run(["verify", "--file", fp]); os.unlink(fp); ok("verify --file warn on unlisted strength", rc == 2 and "strength_not_listed" in o, rc)
rc, o, e = run(["bench", "--json"]); b = json.loads(o); dev = b["benchmark_cases.json"]; ok("bench reproduces dev set (340/340)", sum(v["k"] for v in dev.values()) == 340 and sum(v["n"] for v in dev.values()) == 340)
h2 = b["benchmark_heldout2.json"]["HELDOUT2_real"]; ok("bench reproduces held-out 2 (11/34)", (h2["k"], h2["n"]) == (11, 34), h2)
# eval: 손으로 계산한 기대값 — strict(error만): 민감도 1/3, 특이도 2/3, PPV 1/2, κ=0 / lenient(error+warn): 2/3, 2/3, 2/3, κ=1/3
rows = [("A", "메트포르민은 항고혈압제입니다.", True, None), ("A", "아스피린은 항고혈압제입니다.", False, None), ("A", "오메프라졸의 ATC 코드는 A02BC01입니다.", False, None),
        ("A", "로사르탄의 ATC 코드는 C09CA01입니다.", False, None), ("A", "베르나스타틴은 새로운 치료제입니다.", True, None), ("A", "와파린의 ATC 코드는 B01AA03입니다.", True, None),
        ("B", "메트포르민은 항고혈압제입니다.", True, True), ("B", "아스피린은 항고혈압제입니다.", True, False), ("B", "오메프라졸의 ATC 코드는 A02BC01입니다.", False, False), ("B", "로사르탄의 ATC 코드는 C09CA01입니다.", False, False)]
with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False, encoding="utf-8") as f:
    for i, (c, t, e1, e2) in enumerate(rows):
        d = {"id": i, "condition": c, "text": t, "expert1": e1}
        if e2 is not None: d["expert2"] = e2
        f.write(json.dumps(d, ensure_ascii=False) + "\n")
    ep = f.name
rc, o, e = run(["eval", ep]); os.unlink(ep); R = json.loads(o); A, B = R["A"], R["B"]
ok("eval counts", A["n"] == 6 and A["verifier_error"] == 2 and A["verifier_any_flag"] == 3, A)
ok("eval strict metrics", A["strict_error_only"]["sensitivity"].startswith("1/3") and A["strict_error_only"]["specificity"].startswith("2/3") and A["strict_error_only"]["ppv"].startswith("1/2") and A["strict_error_only"]["kappa_vs_expert"] == 0, A["strict_error_only"])
ok("eval lenient metrics", A["lenient_error_or_warn"]["sensitivity"].startswith("2/3") and A["lenient_error_or_warn"]["ppv"].startswith("2/3") and abs(A["lenient_error_or_warn"]["kappa_vs_expert"] - 0.333) < 0.002, A["lenient_error_or_warn"])
ok("eval excludes disputed rows & expert kappa", B["disputed_excluded"] == 1 and B["kappa_expert1_vs_expert2"] == 0.5, (B["disputed_excluded"], B.get("kappa_expert1_vs_expert2")))
rc, o, e = run(["verify", "--json", "--text", "나프록센은 국소용 비스테로이드성 소염제 코드(M02AA12)도 있습니다."]); v = json.loads(o); ok("no false class error on '비스테로이드성 소염제' (seen in real LLM output)", not any(f["type"] == "class_mismatch" for f in v["findings"]), v["findings"])
rc, o, e = run(["verify", "--json", "--text", "아목시실린은 아미노페니실린(페니실린 계열)에 속합니다."]); v = json.loads(o); ok("class names with INN stems are not 'unknown drug' (seen in real LLM output)", not any(f["type"] == "unknown_drug" for f in v["findings"]), v["findings"])
rc, o, e = run(["verify", "--json", "--text", "나프록센은 스테로이드 계열입니다."]); v = json.loads(o); ok("true corticosteroid class error still detected", any(f["type"] == "class_mismatch" for f in v["findings"]), v["findings"])
rc, o, e = run(["prompt", "베르나스타틴의 ATC 코드는?", "--json"]); p = json.loads(o); ok("empty retrieval says dictionary is not empty", "32개 성분" in p["user"] and "일치하는 사전 항목이 없음" in p["user"], p["user"][:80])
rc, o, e = run(["verify", "--json", "--text", "발사르탄의 ATC 코드는 C09CA03입니다. 복합제(이뇨제 또는 암로디핀 병용)는 C09DA03, C09DB01 등 다른 코드를 가질 수 있습니다."]); v = json.loads(o); ok("combination-product codes are not errors (seen in real LLM output)", v["summary"]["error"] == 0 and any(f["type"] == "combo_context" for f in v["findings"]), v["summary"])
rc, o, e = run(["verify", "--json", "--text", "발사르탄의 ATC 코드는 C10AA05입니다."]); v = json.loads(o); ok("wrong code without combo context still an error", v["summary"]["error"] == 1, v["summary"])
rc, o, e = run(["nonsense"]); ok("unknown command exits 64", rc == 64)
for c in checks: print(" | ".join(c))
f = sum(c[0] == "FAIL" for c in checks); print(f"\n{len(checks)-f}/{len(checks)} checks passed"); sys.exit(1 if f else 0)
