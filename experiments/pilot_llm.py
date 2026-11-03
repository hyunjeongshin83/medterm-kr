"""파일럿 실험 v2: 일반 프롬프트(A) vs 사전 근거 주입 프롬프트(B) — 실제 LLM 답변을 CLI 검증기로 검사.
v1(이 스크립트의 이전 판, 결과 pilot_answers_v1.jsonl)과 다른 점: ① 검증기 결함 2건·프롬프트 결함 1건 수정 후 재실행 ② 사전 밖 실존 약물 12개(ood_real) 추가. 수정은 v1 결과를 보고 했으므로 v1→v2 비교는 독립 평가가 아니다.
실행 환경: 분석 커널(host.llm 필요, `host`는 커널이 제공). 정답 라벨 없음 → 약사 판독이 아니라 '사전 불일치 표시율' 파일럿이다."""
import json, os, subprocess
ROOT = "medterm"; NODE = "node"; CLI = os.path.join(ROOT, "bin", "medterm.mjs")
def cli(args, stdin=None):
    p = subprocess.run([NODE, CLI] + args, capture_output=True, text=True, encoding="utf-8", input=stdin, timeout=60); return p.returncode, p.stdout
data = json.load(open(os.path.join(ROOT, "data", "medterm.json"), encoding="utf-8")); vtms = [c for c in data["concepts"] if c["type"] == "VTM"]
Q = "의 ATC 코드, 약물 계열, 흔한 단위 용량(mg)을 알려주세요."
questions = [dict(qid=f"R{i:02d}", type="real", drug=v["label_ko"], q=v["label_ko"] + Q) for i, v in enumerate(vtms)]
fake = ["베르나스타틴", "클로라프라졸", "탄사플록사신", "카도올롤", "루미디핀", "모테프릴", "미토사르탄", "라도프라졸"]   # 실존하지 않을 가능성이 높은 이름(미검증)
questions += [dict(qid=f"F{i:02d}", type="fake", drug=n, q=n + Q) for i, n in enumerate(fake)]
ood = ["아테놀롤", "리시노프릴", "프라바스타틴", "칸데사르탄", "텔미사르탄", "란소프라졸", "라베프라졸", "니페디핀", "에날라프릴", "이트라코나졸", "레보플록사신", "카프토프릴"]   # 실존하지만 사전에 없는 약물
questions += [dict(qid=f"O{i:02d}", type="ood_real", drug=n, q=n + Q) for i, n in enumerate(ood)]
STYLE = " 한국어로 5문장 이내로 간결하게 답하세요."
A_SYS = "당신은 약학 정보를 제공하는 보조자입니다." + STYLE
reqs, meta = [], []
for q in questions:
    reqs.append(dict(prompt=q["q"], system=A_SYS)); meta.append(dict(arm="A", **q))
    rc, o = cli(["prompt", q["q"], "--json"]); assert rc == 0; p = json.loads(o)
    reqs.append(dict(prompt=p["user"], system=p["system"] + STYLE)); meta.append(dict(arm="B", ids=p["ids"], **q))
model = host.reasoning_model()
for r in reqs: r.update(model=model, max_tokens=700, thinking={"type": "disabled"})
res = host.llm(reqs, max_concurrency=8)
rows = []
for m, r in zip(meta, res):
    text = r.get("text", "") if isinstance(r, dict) and "error" not in r else ""
    rc, o = cli(["verify", "--json"], stdin=text) if text else (None, "{}")
    v = json.loads(o) if text else {"summary": {}, "findings": []}
    rows.append(dict(m, model=model, text=text, error=(r.get("error") if isinstance(r, dict) else None), stop=r.get("stop_reason") if isinstance(r, dict) else None, verifier=v))
json.dump(questions, open(os.path.join(ROOT, "experiments", "pilot_questions_v2.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
with open(os.path.join(ROOT, "experiments", "pilot_answers_v2.jsonl"), "w", encoding="utf-8") as f:
    for r in rows: f.write(json.dumps(r, ensure_ascii=False) + "\n")
print("saved", len(rows), "answers; model", model)
