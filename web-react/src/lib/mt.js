// 데이터(medterm-data.js, medterm-ext-data.js, bench.js)와 계산 코드(core.js)는 클래식 스크립트로 먼저 읽혀 window 전역에 있다.
// 이 파일은 그 전역을 한 번만 꺼내 쓰는 자리다. 사전 내용·검증 규칙은 core.js가 단독으로 책임진다.
const Core = window.MedTermCore;

export const DATA = window.MEDTERM_DATA;
export const BENCH = window.MEDTERM_BENCH;
export const META = DATA.meta;
/** 확장 수록(공개 자료로 자동 수집한 초안). 없으면 null — 그러면 화면은 핵심 사전만으로 이전과 같이 동작한다. */
export const EXT = window.MEDTERM_EXT || null;
export const mt = new Core.MedTerm(DATA, window.MEDTERM_CLASSES, EXT);
export const XMETA = mt.extMeta; // EXT 의 meta(건수·등급 설명·출처). EXT 가 없으면 null

/** 화면에 쓰는 이름: 한글 이름이 있으면 그것, 없으면 영문 이름(확장 수록의 일부는 한글 이름이 아직 없다). */
export const nameOf = (v) => (v ? v.label_ko || v.label_en || v.id : '');

/* 주소(#…)에는 영문·숫자·하이픈만 쓴다(공유 페이지의 주소 규칙): 성분 MT:VTM:7646 ↔ #v-7646.
   확장 수록 중 RxNorm 에 없는(심평원 전용) 성분 MT:KRI:ginkgo_biloba_leaf_ext ↔ #k-ginkgo-biloba-leaf-ext (밑줄은 하이픈으로).
   예전 형식(#MT:VTM:7646)으로 받은 링크도 그대로 읽는다. */
const VTM_PREFIX = 'MT:VTM:';
const KRI_PREFIX = 'MT:KRI:';
export const hashOf = (id) => (id.startsWith(VTM_PREFIX) ? 'v-' + id.slice(VTM_PREFIX.length) : id.startsWith(KRI_PREFIX) ? 'k-' + id.slice(KRI_PREFIX.length).replace(/_/g, '-') : id);

/** 주소 끝(#…)에서 성분 id를 읽는다(핵심 사전 또는 확장 수록). 사전에 없는 값이면 null. */
export function idFromHash() {
  try {
    const raw = decodeURIComponent(window.location.hash.slice(1));
    const short = /^v-(\d+)$/.exec(raw);
    const kri = /^k-([a-z0-9-]+)$/.exec(raw);
    const h = short ? VTM_PREFIX + short[1] : kri ? KRI_PREFIX + kri[1].replace(/-/g, '_') : raw;
    if (!h) return null;
    const v = mt.byId.get(h);
    if (v) return v.type === 'VTM' ? h : null;
    return mt.extById.has(h) ? h : null;
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
