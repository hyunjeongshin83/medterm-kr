import { mt } from './mt.js';

/**
 * ATC 대분류(1단계 글자) 한글 짧은 이름. **약사 검수 전 초안**이다(영문 원문은 mt.atcLabel(글자)로 제목에 함께 보여준다).
 * 사전 데이터에 없는 글자(L·P·V)도 미리 적어 둔다 — 성분이 늘어나도 칩이 영문으로 바뀌지 않게 하기 위함.
 */
export const ATC1_KO = {
  A: '소화기·대사', B: '혈액', C: '심혈관', D: '피부', G: '비뇨생식', H: '호르몬', J: '항감염',
  L: '항종양·면역', M: '근골격', N: '신경계', P: '항기생충', R: '호흡기', S: '감각기관', V: '기타',
};
const ORDER = Object.keys(ATC1_KO);

/** 성분이 가진 모든 ATC 코드의 대분류 글자(첫 코드의 글자가 앞). 코드가 없으면 빈 배열. */
export function groupsOf(v) {
  const out = [];
  for (const c of v.atc_codes || []) {
    const g = c.charAt(0).toUpperCase();
    if (g && !out.includes(g)) out.push(g);
  }
  return out;
}

/** 대표 대분류 글자(첫 ATC 코드 기준). 없으면 ''. */
export const primaryGroup = (v) => groupsOf(v)[0] || '';

/** 썸네일 색 번호: 글자 → 0~3 (같은 대분류는 늘 같은 색). */
export const tintOf = (letter) => {
  const i = ORDER.indexOf(letter);
  return i < 0 ? 0 : i % 4;
};

/** 사전에 실제로 있는 대분류 목록: { letter, ko, en, n(성분 수) } — 글자 순. */
export const ATC_GROUPS = (() => {
  const count = new Map();
  for (const v of mt.vtms) for (const g of groupsOf(v)) count.set(g, (count.get(g) || 0) + 1);
  return [...count.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([letter, n]) => ({ letter, ko: ATC1_KO[letter] || letter, en: mt.atcLabel(letter) || '', n }));
})();
