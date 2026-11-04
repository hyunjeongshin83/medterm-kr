"""RxNorm 영문 제형명(form_en) → 한글 제형명(form_ko).
수기 직역 초안이며 약사 검수 전이다(출처 표기: "제형 한글명: 수기 직역 초안(미검수)").
기존 표기("경구 정제", "서방정", …)와 말투를 맞췄다. build_dictionary.py 와 apply_form_ko.py 가 함께 쓴다."""
FORM_KO = {
    # 경구 — 정제·캡슐
    "Oral Tablet": "경구 정제",
    "Oral Capsule": "경구 캡슐",
    "Delayed Release Oral Capsule": "장용(지연방출) 캡슐",
    "Delayed Release Oral Tablet": "장용(지연방출) 정제",
    "Extended Release Oral Tablet": "서방정",
    "Extended Release Oral Capsule": "서방 캡슐",
    "Chewable Tablet": "츄어블정",
    "Disintegrating Oral Tablet": "구강붕해정",
    "Effervescent Oral Tablet": "발포정",
    "Sublingual Tablet": "설하정",
    # 경구 — 액·가루·과립·기타
    "Oral Solution": "경구용 액",
    "Oral Suspension": "경구용 현탁액",
    "Oral Powder": "경구용 산제",
    "Oral Granules": "경구용 과립",
    "Granules for Oral Solution": "경구용 액 조제용 과립",
    "Granules for Oral Suspension": "경구용 현탁액 조제용 과립",
    "Powder for Oral Solution": "경구용 액 조제용 산제",
    "Powder for Oral Suspension": "경구용 현탁액 조제용 산제",
    "Oral Film": "경구용 필름",
    "Oral Paste": "경구용 페이스트",
    "Chewing Gum": "츄잉껌",
    # 주사
    "Injectable Solution": "주사액",
    "Injection": "주사제",
    "Injectable Suspension": "주사용 현탁액",
    "Cartridge": "카트리지",
    "Auto-Injector": "오토인젝터(자동주사기)",
    "Prefilled Syringe": "사전충전 주사기",
    # 외용·점안·점이·직장
    "Topical Gel": "겔(외용)",
    "Topical Cream": "크림(외용)",
    "Topical Solution": "외용액",
    "Topical Ointment": "연고(외용)",
    "Topical Spray": "분무제(외용)",
    "Topical Foam": "폼(외용)",
    "Paste": "페이스트(외용)",
    "Medicated Patch": "첩부제(패치)",
    "Ophthalmic Solution": "점안액",
    "Ophthalmic Suspension": "점안 현탁액",
    "Ophthalmic Ointment": "안연고",
    "Otic Solution": "점이액",
    "Rectal Suppository": "좌제",
}
SOURCE_NOTE = "제형 한글명: 수기 직역 초안(미검수)"
