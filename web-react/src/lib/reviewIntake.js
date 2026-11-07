/* global __REVIEW_INTAKE__ */
// 약사 확인서 접수 설정 읽기 — 빌드가 담은 __REVIEW_INTAKE__ 에서 동의서 값·버전·보내기 주소를 읽는다(src/lib/version.js·edition.js 와 같은 방식).
// 동의서가 준비되지 않았으면(값이 비었거나 버전이 없음) ready=false 이고, 화면은 확인서 내보내기·보내기를 막는다.
// 보내기 주소는 빌드가 ‘독립 실행·설치형 웹앱(web)’ 표면에만 넣는다 — 안드로이드 앱(인터넷 권한 없음)과 공유 페이지(바깥 연결 막힘)에는 주소가 없어 보내기 단추가 없다.
import { EP_RE, consentBlocks, consentReady, isVersion, normalizeIntake, researchOn } from './reviewConsent.js';

let cache;
export function getIntake() {
  if (cache) return cache;
  let raw = null;
  try { raw = typeof __REVIEW_INTAKE__ !== 'undefined' ? __REVIEW_INTAKE__ : null; } catch (e) { raw = null; }
  let cfg = normalizeIntake({}).cfg; let endpoint = ''; let version = '';
  try {
    if (raw && typeof raw === 'object') {
      const n = normalizeIntake(raw);
      cfg = n.cfg; endpoint = n.endpoint; version = isVersion(raw.version) ? raw.version : '';
    }
  } catch (e) { cfg = normalizeIntake({}).cfg; endpoint = ''; version = ''; }
  const ready = consentReady(cfg) && !!version;
  cache = {
    ready,
    version: ready ? version : '',
    blocks: ready ? consentBlocks(cfg) : [],
    research: ready && researchOn(cfg),
    endpoint: ready && EP_RE.test(endpoint) ? endpoint : '',
    get canSend() { return !!this.endpoint; },
  };
  return cache;
}
