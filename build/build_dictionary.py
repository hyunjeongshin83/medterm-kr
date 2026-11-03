#!/usr/bin/env python
"""MedTerm-KR 시드 사전 생성: RxNav(NLM) REST → VTM/VMP/AMP + ATC/SNOMED CT 상호참조.
사용: python build_dictionary.py --out ../data/medterm.json
한글명·한국 상품명은 수기 초안(미검수)이며 provenance에 그렇게 표시된다."""
import argparse, datetime, json, re, time, requests
B = "https://rxnav.nlm.nih.gov/REST"; S = requests.Session()
def get(path, **kw):
    for _ in range(3):
        try:
            r = S.get(B + path, timeout=30, **kw)
            if r.status_code == 200: time.sleep(0.08); return r.json()
        except Exception: pass
        time.sleep(1)
    raise RuntimeError(path)
# (RxNorm 질의명, 한글명, 한글 이명, 한국 상품명(수기·미검증), 영문 이명)
SEED = [
 ("acetaminophen","아세트아미노펜",["파라세타몰"],["타이레놀"],["paracetamol"]),
 ("ibuprofen","이부프로펜",[],["애드빌","부루펜"],[]),
 ("naproxen","나프록센",[],["낙센"],[]),
 ("aspirin","아스피린",["아세틸살리실산"],["바이엘 아스피린"],["acetylsalicylic acid"]),
 ("diclofenac","디클로페낙",[],["볼타렌"],[]),
 ("tramadol","트라마돌",[],[],[]),
 ("omeprazole","오메프라졸",[],["로섹"],[]),
 ("esomeprazole","에스오메프라졸",[],["넥시움"],[]),
 ("pantoprazole","판토프라졸",[],["판토록"],[]),
 ("famotidine","파모티딘",[],["가스터"],[]),
 ("metformin","메트포르민",[],["글루코파지"],[]),
 ("glimepiride","글리메피리드",[],["아마릴"],[]),
 ("amlodipine","암로디핀",[],["노바스크"],[]),
 ("losartan","로사르탄",[],["코자"],[]),
 ("valsartan","발사르탄",[],["디오반"],[]),
 ("furosemide","푸로세미드",["퓨로세미드"],["라식스"],["frusemide"]),
 ("atorvastatin","아토르바스타틴",[],["리피토"],[]),
 ("rosuvastatin","로수바스타틴",[],["크레스토"],[]),
 ("simvastatin","심바스타틴",[],["조코"],[]),
 ("warfarin","와파린",[],["쿠마딘"],[]),
 ("clopidogrel","클로피도그렐",[],["플라빅스"],[]),
 ("levothyroxine","레보티록신",[],["씬지로이드"],["thyroxine"]),
 ("amoxicillin","아목시실린",[],[],[]),
 ("azithromycin","아지트로마이신",["아지스로마이신"],["지스로맥스"],[]),
 ("ciprofloxacin","시프로플록사신",[],[],[]),
 ("cetirizine","세티리진",[],["지르텍"],[]),
 ("loratadine","로라타딘",[],["클라리틴"],[]),
 ("montelukast","몬테루카스트",[],["싱귤레어"],[]),
 ("sertraline","설트랄린",["서트랄린"],["졸로푸트"],[]),
 ("escitalopram","에스시탈로프람",[],["렉사프로"],[]),
 ("zolpidem","졸피뎀",[],["스틸녹스"],[]),
 ("prednisolone","프레드니솔론",[],[],[]),
]
FORM_KO = {"Oral Tablet":"경구 정제","Oral Capsule":"경구 캡슐","Delayed Release Oral Capsule":"장용(지연방출) 캡슐","Delayed Release Oral Tablet":"장용(지연방출) 정제","Extended Release Oral Tablet":"서방정","Extended Release Oral Capsule":"서방 캡슐","Oral Solution":"경구용 액","Oral Suspension":"경구용 현탁액","Injectable Solution":"주사액","Chewable Tablet":"츄어블정","Oral Powder":"경구용 산제","Topical Gel":"겔(외용)","Topical Cream":"크림(외용)","Topical Solution":"외용액","Rectal Suppository":"좌제","Topical Ointment":"연고(외용)","Disintegrating Oral Tablet":"구강붕해정"}
STR_RE = re.compile(r'^(?P<tech>(?:[A-Z][a-z]+ )+)?(?:(?P<pre>\d+(?:\.\d+)?) (?P<preu>HR|ML) )?(?P<ing>[^\d]+?) (?P<str>\d+(?:\.\d+)?\s?(?:MG|MCG|G|UNT|MEQ|MMOL|ML)(?:/(?:\d+(?:\.\d+)?)?(?:ML|HR|ACTUAT|G|MG|L|24HR))?) (?P<form>.+)$')
def parse_scd(name):
    m = STR_RE.match(name)
    if not m: return None
    mm = re.match(r'(\d+(?:\.\d+)?)\s?([A-Z]+)(?:/(.+))?$', m.group("str"))
    return dict(strength_raw=m.group("str"), value=float(mm.group(1)), unit=mm.group(2), per=mm.group(3), form=m.group("form"),
                pre=(f'{m.group("pre")} {m.group("preu")}' if m.group("pre") else None), tech=(m.group("tech") or "").strip() or None)
def props_of(rx):
    d = {}
    for p in get(f"/rxcui/{rx}/allProperties.json?prop=ALL")["propConceptGroup"]["propConcept"]: d.setdefault(p["propName"], []).append(p["propValue"])
    return d
def main(out):
    today = datetime.date.today().isoformat(); concepts, atc_nodes, unparsed = [], {}, []
    for q, ko, alt_ko, brands_ko, alt_en in SEED:
        rx = get("/rxcui.json", params={"name": q})["idGroup"]["rxnormId"][0]; pd = props_of(rx)
        assert pd.get("TTY") == ["IN"], (q, pd.get("TTY"))
        atcs = list(dict.fromkeys(pd.get("ATC", []))); atc_src = "IN"
        if not atcs:   # 성분(IN)에 ATC가 없으면 염(PIN)에서 보완 (예: levothyroxine)
            for g in get(f"/rxcui/{rx}/related.json?tty=PIN")["relatedGroup"]["conceptGroup"]:
                for p in g.get("conceptProperties", []): atcs += [a for a in props_of(p["rxcui"]).get("ATC", []) if a not in atcs]
            atc_src = "PIN" if atcs else "none"
        paths = {}
        for a in atcs:
            ctx = get(f"/rxclass/classContext.json?classId={a[:5]}&relaSource=ATC")["classPathList"]["classPath"][0]["rxclassMinConcept"]
            for c in ctx:
                if c["classId"] != "0": atc_nodes[c["classId"]] = c["className"]
            paths[a] = [c["classId"] for c in reversed(ctx) if c["classId"] != "0"]
        vtm = f"MT:VTM:{rx}"
        concepts.append(dict(id=vtm, type="VTM", rxcui=rx, label_en=q, label_ko=ko, alt_ko=alt_ko, alt_en=alt_en, brands_ko=brands_ko,
            atc_codes=atcs, atc_paths=paths, atc_source=atc_src, snomed_ct=pd.get("SNOMEDCT", []), review_status="draft",
            provenance=dict(rxnorm_retrieved=today, ko_label="manual(unreviewed)", brands_ko="manual(unverified vs MFDS)")))
        rel = get(f"/rxcui/{rx}/related.json?tty=SCD+SBD")["relatedGroup"]["conceptGroup"]
        scd = {p["name"]: p["rxcui"] for g in rel if g["tty"] == "SCD" for p in g.get("conceptProperties", [])}
        sbd = [(p["name"], p["rxcui"]) for g in rel if g["tty"] == "SBD" for p in g.get("conceptProperties", [])]
        for name, srx in scd.items():
            if " / " in name: continue                      # 복합제 제외(단일성분만)
            pr = parse_scd(name)
            if not pr: unparsed.append(name); continue
            concepts.append(dict(id=f"MT:VMP:{srx}", type="VMP", rxcui=srx, label_en=name, ingredient=vtm,
                strength=dict(raw=pr["strength_raw"], value=pr["value"], unit=pr["unit"], per=pr["per"]),
                pack_or_duration=pr["pre"], release_tech=pr["tech"], form_en=pr["form"], form_ko=FORM_KO.get(pr["form"]),
                review_status="auto", provenance=dict(rxnorm_retrieved=today)))
            for bname, brx in sbd:
                if bname.startswith(name + " [") and bname.endswith("]") and " / " not in bname:
                    concepts.append(dict(id=f"MT:AMP:{brx}", type="AMP", rxcui=brx, label_en=bname, brand_en=bname[len(name)+2:-1],
                        vmp=f"MT:VMP:{srx}", ingredient=vtm, market="US (RxNorm SBD)", review_status="auto", provenance=dict(rxnorm_retrieved=today)))
    ids = [c["id"] for c in concepts]; assert len(ids) == len(set(ids)), "duplicate ids"
    idset = set(ids); assert all(c["ingredient"] in idset for c in concepts if c["type"] == "VMP") and all(c["vmp"] in idset for c in concepts if c["type"] == "AMP")
    data = dict(meta=dict(name="MedTerm-KR prototype", built_at=today, rxnav_version=get("/version.json").get("version"),
        sources=["RxNorm/RxNav REST (NLM): RxCUI, ATC, SNOMED CT concept IDs, SCD/SBD", "ATC class names via RxNav RxClass (WHO CC)", "한글명·한국 상품명: 수기 입력(미검수)"],
        notice="프로토타입 데이터. 한글명·한국 상품명은 약사 검수 전 초안이며 VMP/AMP는 미국 RxNorm 기준. 한국 허가 제품(MFDS)은 미연동."), atc=atc_nodes, concepts=concepts)
    data["meta"]["counts"] = {t: sum(1 for c in concepts if c["type"] == t) for t in ("VTM", "VMP", "AMP")}
    json.dump(data, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(data["meta"]["counts"], "ATC nodes", len(atc_nodes), "unparsed", len(unparsed))
if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default="../data/medterm.json"); main(ap.parse_args().out)
