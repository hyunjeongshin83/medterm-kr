// 글씨 대비 점검: tokens.json 의 색 짝마다 WCAG 2.x 상대휘도로 대비비를 계산하고, 기준에 못 미치면 종료코드 1.
//   글자(일반) 4.5:1 · 글자 아닌 것(그래프 선·입력 칸 테두리·초점 링) 3:1  — 눈대중이 아니라 계산으로 판단한다(메디노트와 같은 방침).
// 사용: node tools/check_contrast.mjs [--quiet]
import { readFileSync } from 'node:fs';

const tokens = JSON.parse(readFileSync(new URL('../tokens.json', import.meta.url), 'utf8'));
const quiet = process.argv.includes('--quiet');

const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [글자색 토큰, 바탕 토큰, 최소 대비, 설명]
const TEXT = 4.5;
const NONTEXT = 3;
const PAIRS = [
  ['ink', 'bg', TEXT, '본문'], ['ink', 'surface', TEXT, '본문(카드)'], ['ink', 'surface-2', TEXT, '본문(분류 트리)'],
  ['ink', 'pri-soft', TEXT, '선택된 줄·히어로·선택된 카드'], ['ink', 'info-bg', TEXT, '칩'],
  ['mut', 'bg', TEXT, '보조 글자'], ['mut', 'surface', TEXT, '보조 글자(카드)'], ['mut', 'surface-2', TEXT, '보조 글자(트리)'],
  ['mut', 'pri-soft', TEXT, '보조 글자(선택된 줄)'], ['mut', 'info-bg', TEXT, '보조 글자(칩)'],
  ['pri', 'bg', TEXT, '강조 글자·링크'], ['pri', 'surface', TEXT, '강조 글자(카드)'], ['pri', 'surface-2', TEXT, '강조 글자(트리)'], ['pri', 'pri-soft', TEXT, '켜진 탭'],
  ['on-pri', 'pri-fill', TEXT, '채운 버튼 글자'], ['on-pri-2', 'pri-fill', TEXT, '채운 버튼 보조 글자'],
  ['pri-chip-ink', 'pri-chip', TEXT, '잎 성분 칩'],
  ['ok', 'ok-bg', TEXT, '일치 배지'], ['ok', 'surface', TEXT, '일치 글자'],
  ['warn', 'warn-bg', TEXT, '초안·확인 필요 배지'], ['warn', 'surface', TEXT, '확인 필요 글자'],
  ['err', 'err-bg', TEXT, '불일치 배지'], ['err', 'surface', TEXT, '불일치 글자'],
  ['info', 'info-bg', TEXT, '정보 배지'], ['info', 'surface', TEXT, '정보 글자'],
  ['notice-ink', 'notice-bg', TEXT, '면책 띠'],
  ['code-ink', 'code-bg', TEXT, '코드 상자'],
  // 글자 아닌 것
  ['edge', 'surface', NONTEXT, '그래프 선·입력 칸 테두리'], ['edge', 'bg', NONTEXT, '그래프 선(바탕)'], ['edge', 'surface-2', NONTEXT, '입력 칸 테두리(트리)'],
  ['edge', 'pri-soft', NONTEXT, '입력 칸 테두리(검색 히어로)'],
  ['pri', 'surface', NONTEXT, '초점 링'], ['pri', 'bg', NONTEXT, '초점 링(바탕)'], ['pri', 'pri-soft', NONTEXT, '초점 링(히어로·선택 카드)'],
];

let fails = 0;
const rows = [];
for (const mode of ['light', 'dark']) {
  for (const [fg, bg, min, note] of PAIRS) {
    const a = tokens.color[fg]?.[mode];
    const b = tokens.color[bg]?.[mode];
    if (!a || !b) { console.error(`토큰 없음: ${fg} / ${bg}`); fails++; continue; }
    const r = ratio(a, b);
    const ok = r >= min;
    if (!ok) fails++;
    rows.push({ mode, ok, line: `${ok ? '통과' : '미달'} ${mode.padEnd(5)} ${r.toFixed(2).padStart(5)}:1 (≥${min})  ${fg} ${a} on ${bg} ${b}  — ${note}` });
  }
}
for (const r of rows) if (!quiet || !r.ok) console.log(r.line);
console.log(`check_contrast: ${rows.length}쌍 중 미달 ${fails}쌍`);
process.exit(fails ? 1 : 0);
