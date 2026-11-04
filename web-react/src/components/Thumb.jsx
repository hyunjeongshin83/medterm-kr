import { primaryGroup, tintOf } from '../lib/atc1.js';
import { cx } from './ui.jsx';

/*
 * "사진 자리" 썸네일: 실제 제품 사진은 쓰지 않는다(출처·이용 허락이 없음). 대신 ATC 대분류마다 색이 정해진
 * 알약 그림 타일에, 대표 ATC 글자를 작은 표시로 붙인다. 장식이라 화면 읽기 프로그램에는 숨긴다(이름·코드는 옆 글자가 전함).
 * 색은 모두 디자인 토큰이다(라이트·다크 자동).
 */
const TINTS = [
  { box: 'bg-pri-soft', ink: 'text-pri' },
  { box: 'bg-info-bg', ink: 'text-info' },
  { box: 'bg-warn-bg', ink: 'text-warn' },
  { box: 'bg-pri-chip', ink: 'text-pri-chip-ink' },
];
// 앱 아이콘(Topbar의 Logo)과 같은 알약 모양.
const CAPSULE = 'M41,41H67A13,13 0 0 1 67,67H41A13,13 0 0 1 41,41Z';
const HALF = 'M54,41H67A13,13 0 0 1 67,67H54Z';
const SIZE = {
  sm: { box: 'h-11 w-11 rounded-md', badge: 'h-4 min-w-4 text-graph-l2 bottom-0.5 right-0.5' },
  md: { box: 'h-14 w-14 rounded-lg', badge: 'h-[18px] min-w-[18px] text-graph-l2 bottom-1 right-1' },
  lg: { box: 'h-20 w-20 rounded-xl', badge: 'h-6 min-w-6 text-graph-l1 bottom-1.5 right-1.5' },
};

export function Thumb({ v, size = 'md', className }) {
  const letter = primaryGroup(v);
  const t = TINTS[tintOf(letter)];
  const s = SIZE[size];
  return (
    <span aria-hidden="true" className={cx('relative inline-flex flex-none items-center justify-center overflow-hidden', s.box, t.box, t.ink, className)}>
      <svg viewBox="0 0 108 108" width="100%" height="100%" focusable="false">
        <g transform="translate(54 54) scale(1.22) translate(-54 -54) rotate(-45 54 54)">
          <path d={CAPSULE} fill="var(--surface)" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
          <path d={HALF} fill="currentColor" />
        </g>
      </svg>
      {letter && (
        <span className={cx('absolute flex items-center justify-center rounded-pill bg-surface px-1 font-bold leading-none text-ink', s.badge)}>{letter}</span>
      )}
    </span>
  );
}
