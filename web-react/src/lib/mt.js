// 데이터(medterm-data.js, bench.js)와 계산 코드(core.js)는 클래식 스크립트로 먼저 읽혀 window 전역에 있다.
// 이 파일은 그 전역을 한 번만 꺼내 쓰는 자리다. 사전 내용·검증 규칙은 core.js가 단독으로 책임진다.
const Core = window.MedTermCore;

export const DATA = window.MEDTERM_DATA;
export const BENCH = window.MEDTERM_BENCH;
export const META = DATA.meta;
export const mt = new Core.MedTerm(DATA, window.MEDTERM_CLASSES);

/* 주소(#…)에는 영문·숫자·하이픈만 쓴다(공유 페이지의 주소 규칙): 성분 MT:VTM:7646 ↔ #v-7646.
   예전 형식(#MT:VTM:7646)으로 받은 링크도 그대로 읽는다. */
const VTM_PREFIX = 'MT:VTM:';
export const hashOf = (id) => (id.startsWith(VTM_PREFIX) ? 'v-' + id.slice(VTM_PREFIX.length) : id);

/** 주소 끝(#…)에서 성분 id를 읽는다. 사전에 없는 값이면 null. */
export function idFromHash() {
  try {
    const raw = decodeURIComponent(window.location.hash.slice(1));
    const short = /^v-(\d+)$/.exec(raw);
    const h = short ? VTM_PREFIX + short[1] : raw;
    const v = h && mt.byId.get(h);
    return v && v.type === 'VTM' ? h : null;
  } catch (e) {
    return null;
  }
}

/** file:// 이나 샌드박스에서 history.replaceState가 보안 오류를 내므로 location.replace를 쓴다(기록을 쌓지 않음). */
export function writeHash(id) {
  try { window.location.replace('#' + hashOf(id)); } catch (e) { /* 주소 갱신 실패는 무시 */ }
}

export const mq = (query) => !!(window.matchMedia && window.matchMedia(query).matches);
export const isNarrow = () => mq('(max-width: 1099px)');
export const isPhone = () => mq('(max-width: 699px)');
