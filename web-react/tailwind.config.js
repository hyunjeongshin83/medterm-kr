// 디자인 토큰(tokens.json)이 유일한 원본입니다. Figma 파일 'MedTerm tokens'와 같은 값을 씁니다.
import { readFileSync } from 'node:fs';

const tokens = JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url), 'utf8'));
const q = (f) => (/[\s]/.test(f) ? `"${f}"` : f);
const px = (n) => `${n}px`;

const colors = Object.fromEntries(Object.keys(tokens.color).map((k) => [k, `var(--${k})`]));
colors.scrim = 'var(--scrim)';

const fontSize = Object.fromEntries(
  Object.entries(tokens.type).map(([k, t]) => [k, [px(t.size), { lineHeight: px(t.lh), fontWeight: String(t.weight) }]]),
);

const L = tokens.layout;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    // 큰 화면 → 작은 화면 순서로 선언해야 max-width 규칙이 올바른 순서로 만들어집니다.
    screens: {
      'lt-insp': { max: `${L.bpInspector - 1}px` }, // 1099px 이하: 상세가 서랍으로
      'lt-tree': { max: `${L.bpTree - 1}px` }, //   699px 이하: 분류 트리도 서랍으로
    },
    colors: { transparent: 'transparent', current: 'currentColor', ...colors },
    fontSize,
    fontFamily: { sans: tokens.font.sans.map(q), mono: tokens.font.mono.map(q) },
    borderRadius: { none: '0', sm: px(tokens.radius.sm), md: px(tokens.radius.md), lg: px(tokens.radius.lg), pill: px(tokens.radius.pill), full: '9999px' },
    extend: {
      gridTemplateColumns: {
        shell: `${px(L.left)} minmax(0,1fr) ${px(L.right)}`,
        'shell-md': `${px(L.leftMd)} minmax(0,1fr)`,
        'shell-1': 'minmax(0,1fr)',
      },
      boxShadow: { seg: tokens.shadow.seg, 'drawer-r': tokens.shadow['drawer-r'], 'drawer-l': tokens.shadow['drawer-l'] },
    },
  },
  plugins: [],
};
