// 시험이 화면에서 원문 그대로 확인하는 문구와 버전. 문구나 버전을 바꾸면 여기와 화면 소스만 고치면 된다.
const fs = require('fs');
const path = require('path');

/** 화면 맨 위 안내(role="note") 원문 — src/components/Topbar.jsx 의 Disclaimer 와 같아야 한다 */
const DISC = '약무용어 정보 제공용입니다. 진단·처방·개인별 복용량 판단을 하지 않으며, 한글명·상품명은 약사 검수 전 초안입니다. 복약 결정은 의사·약사와 상담하세요.';

/** 화면에 보이는 버전: package.json 의 version 한 곳에서 정해진다(build.mjs 가 빌드 때 넣는다) */
const VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;

/** 화면·문서·설치 정보 어디에도 남아 있으면 안 되는 옛 표기 */
const OLD_LABEL = '프로토타입';

module.exports = { DISC, VERSION, OLD_LABEL };
