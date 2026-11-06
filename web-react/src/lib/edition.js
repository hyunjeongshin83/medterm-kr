/* global __EDITION__ */
/**
 * 공개판(lite) 여부. build.mjs 가 MEDTERM_EDITION=lite 로 빌드할 때만 true.
 * 공개판은 외부 주소(GitHub Pages 등)에 올리는 화면으로, 재배포 조건을 확인하지 못한 SNOMED CT ID·ATC 영문 분류명을 자료에서 뺀다(build/make_lite.py).
 */
export const LITE = typeof __EDITION__ !== 'undefined' && __EDITION__ === 'lite';
