"""data/medterm.json → data/medterm.ttl (OWL + SKOS). Protégé에서 열 수 있다.
구조: VTM/VMP/AMP는 MedicinalProduct의 하위 클래스(OntoPharma식 상세도 수준), 개념은 개체(A-Box),
ATC는 SKOS 개념 계층(broader), 이름은 skos:prefLabel/altLabel(@ko/@en)."""
import json, os
from rdflib import Graph, Namespace, Literal, RDF, RDFS, OWL, XSD, URIRef
from rdflib.namespace import SKOS, DCTERMS
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
D = json.load(open(os.path.join(root, "data", "medterm.json"), encoding="utf-8"))
MT = Namespace("https://medterm-kr.example/onto#")      # 자리표시용 IRI — 배포 시 실제 도메인으로 교체
g = Graph(); g.bind("mt", MT); g.bind("skos", SKOS); g.bind("dcterms", DCTERMS); g.bind("owl", OWL)
onto = URIRef("https://medterm-kr.example/onto")
g.add((onto, RDF.type, OWL.Ontology)); g.add((onto, RDFS.label, Literal("MedTerm-KR ontology", lang="en")))
g.add((onto, RDFS.comment, Literal(D["meta"]["notice"], lang="ko")))
for s in D["meta"]["sources"]: g.add((onto, DCTERMS.source, Literal(s)))
# --- T-Box ---
for c, lab in [("MedicinalProduct", "의약품(상세도 수준)"), ("VTM", "가상 치료 단위(성분)"), ("VMP", "가상 의약품(성분+용량+제형)"), ("AMP", "실제 의약품(제품)"), ("ATCClass", "ATC 분류")]:
    g.add((MT[c], RDF.type, OWL.Class)); g.add((MT[c], RDFS.label, Literal(lab, lang="ko")))
for c in ("VTM", "VMP", "AMP"): g.add((MT[c], RDFS.subClassOf, MT.MedicinalProduct))
for c, d in (("VTM", "VMP"), ("VTM", "AMP"), ("VMP", "AMP")): g.add((MT[c], OWL.disjointWith, MT[d]))
g.add((MT.ATCClass, RDFS.subClassOf, SKOS.Concept))
def op(name, dom, rng_, label):
    g.add((MT[name], RDF.type, OWL.ObjectProperty)); g.add((MT[name], RDFS.domain, MT[dom])); g.add((MT[name], RDFS.range, MT[rng_])); g.add((MT[name], RDFS.label, Literal(label, lang="ko")))
def dp(name, dom, rng_, label):
    g.add((MT[name], RDF.type, OWL.DatatypeProperty)); g.add((MT[name], RDFS.domain, MT[dom])); g.add((MT[name], RDFS.range, rng_)); g.add((MT[name], RDFS.label, Literal(label, lang="ko")))
op("hasIngredient", "VMP", "VTM", "성분(VTM)을 가짐"); op("isInstanceOfVMP", "AMP", "VMP", "해당 VMP의 실제 제품임"); op("hasATC", "VTM", "ATCClass", "ATC 코드")
dp("strengthValue", "VMP", XSD.decimal, "함량 값"); dp("strengthUnit", "VMP", XSD.string, "함량 단위"); dp("doseForm", "VMP", XSD.string, "제형(RxNorm 영문)")
dp("rxcui", "MedicinalProduct", XSD.string, "RxNorm RxCUI"); dp("snomedCtId", "VTM", XSD.string, "SNOMED CT 개념 ID(RxNorm 제공)")
dp("reviewStatus", "MedicinalProduct", XSD.string, "검수 상태(auto/draft/reviewed)"); dp("brandName", "AMP", XSD.string, "상품명"); dp("koBrand", "VTM", XSD.string, "국내 상품명(수기·미검증)")
# --- ATC 개념 ---
atc_iri = lambda code: MT["ATC_" + code]
def add_atc(code, name):
    g.add((atc_iri(code), RDF.type, MT.ATCClass)); g.add((atc_iri(code), SKOS.notation, Literal(code)))
    if name: g.add((atc_iri(code), SKOS.prefLabel, Literal(name, lang="en")))
for code, name in D["atc"].items(): add_atc(code, name)
# --- A-Box ---
iri_of = lambda i: MT[i.replace(":", "_")]
for c in D["concepts"]:
    iri = iri_of(c["id"]); t = c["type"]; g.add((iri, RDF.type, MT[t])); g.add((iri, MT.rxcui, Literal(c["rxcui"]))); g.add((iri, MT.reviewStatus, Literal(c["review_status"])))
    if t == "VTM":
        g.add((iri, SKOS.prefLabel, Literal(c["label_ko"], lang="ko"))); g.add((iri, SKOS.prefLabel, Literal(c["label_en"], lang="en")))
        for a in c["alt_ko"]: g.add((iri, SKOS.altLabel, Literal(a, lang="ko")))
        for a in c["alt_en"]: g.add((iri, SKOS.altLabel, Literal(a, lang="en")))
        for b in c["brands_ko"]: g.add((iri, MT.koBrand, Literal(b, lang="ko")))
        for s in c["snomed_ct"]: g.add((iri, MT.snomedCtId, Literal(s)))
        for code in c["atc_codes"]:
            parents = c["atc_paths"][code]                    # [A, A02, A02B, A02BC]
            add_atc(code, None); g.add((atc_iri(code), SKOS.broader, atc_iri(parents[-1])))
            for i in range(1, len(parents)): g.add((atc_iri(parents[i]), SKOS.broader, atc_iri(parents[i - 1])))
            g.add((iri, MT.hasATC, atc_iri(code)))
    elif t == "VMP":
        g.add((iri, SKOS.prefLabel, Literal(c["label_en"], lang="en"))); g.add((iri, MT.hasIngredient, iri_of(c["ingredient"])))
        g.add((iri, MT.strengthValue, Literal(c["strength"]["value"], datatype=XSD.decimal))); g.add((iri, MT.strengthUnit, Literal(c["strength"]["unit"] + ("/" + c["strength"]["per"] if c["strength"]["per"] else ""))))
        g.add((iri, MT.doseForm, Literal(c["form_en"])))
    else:
        g.add((iri, SKOS.prefLabel, Literal(c["label_en"], lang="en"))); g.add((iri, MT.brandName, Literal(c["brand_en"]))); g.add((iri, MT.isInstanceOfVMP, iri_of(c["vmp"])))
out = os.path.join(root, "data", "medterm.ttl"); g.serialize(out, format="turtle"); print("triples", len(g), "->", out)
