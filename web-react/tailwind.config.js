// 디자인 토큰(tokens.json)이 유일한 원본입니다. Figma 파일 'MedTerm tokens'와 같은 값을 씁니다.
import { readFileSync } from 'node:fs';

const tokens = JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url), 'utf8'));
const q = (f) => (/[\s]/.test(f) ? `"${f}"` : f);
const px = (n) => `${n}px`;

const colors = Object.fromEntries(Object.keys(tokens.color).map((k) => [k, `var(--${k})`]));
colors.scrim = 'var(--scrim)';

// 글자 크기는 rem(브라우저 글자 크기 설정을 따름), 줄 높이는 단위 없는 배수, 자간은 메디노트 --ls-* 값.
const fontSize = Object.fromEntries(
  Object.entries(tokens.type).map(([k, t]) => [k, [t.size, { lineHeight: String(t.lh), fontWeight: String(t.weight), letterSpacing: tokens.tracking[t.ls] }]]),
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
    fontFamily: { sans: tokens.font.sans.map(q), hand: tokens.font.hand.map(q), mono: tokens.font.mono.map(q) },
    letterSpacing: { title: tokens.tracking.title, body: tokens.tracking.body, caps: tokens.tracking.caps },
    // 메디노트 모서리: --r-xs 8 · --r-sm 12 · --r-md 16 · --r-lg 20 · --r-full 999  →  여기서는 sm · md · lg · xl · pill
    borderRadius: { none: '0', sm: px(tokens.radius.sm), md: px(tokens.radius.md), lg: px(tokens.radius.lg), xl: px(tokens.radius.xl), pill: px(tokens.radius.pill), full: '9999px' },
    extend: {
      gridTemplateColumns: {
        shell: `${px(L.left)} minmax(0,1fr) ${px(L.right)}`,
        'shell-md': `${px(L.leftMd)} minmax(0,1fr)`,
        'shell-1': 'minmax(0,1fr)',
      },
      boxShadow: Object.fromEntries(Object.entries(tokens.shadow).map(([k, v]) => [k, v])),
    },
  },
  plugins: [
    // coarse: 손가락으로 누르는 화면(주 입력 장치가 터치)일 때만. 화면 폭과 무관하게 터치 태블릿에서도 누르는 면을 44px 이상으로 키운다(마우스 화면은 촘촘하게 둔다).
    ({ addVariant }) => addVariant('coarse', '@media (pointer: coarse)'),
  ],
};
