// 화면에서 쓰는 선 아이콘(24×24, 글자색을 따라감). 모두 장식이라 화면 읽기 프로그램에는 숨기고, 뜻은 옆의 글자가 전한다.
// 직접 그린 단순한 도형(원·선·곡선)이며 외부 아이콘 모음을 쓰지 않는다.
const svg = (size, extra) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false', className: 'flex-none', ...extra,
});

export const IconSearch = ({ size = 20 }) => (
  <svg {...svg(size)}><circle cx="11" cy="11" r="6.5" /><path d="M16.2 16.2 21 21" /></svg>
);
export const IconGraph = ({ size = 22 }) => (
  <svg {...svg(size)}>
    <circle cx="6" cy="7" r="2.4" /><circle cx="18" cy="6" r="2.4" /><circle cx="12" cy="18" r="2.4" />
    <path d="M8.3 7.2 15.7 6.3M7.2 9.1 10.8 15.9M16.9 8.2 13.2 15.9" />
  </svg>
);
export const IconShield = ({ size = 22 }) => (
  <svg {...svg(size)}><path d="M12 3.2 19 6v5.6c0 4.3-2.9 7.6-7 9.2-4.1-1.6-7-4.9-7-9.2V6z" /><path d="m8.9 12.1 2.2 2.2 4.2-4.4" /></svg>
);
export const IconChat = ({ size = 22 }) => (
  <svg {...svg(size)}>
    <path d="M5.5 4.5h13A2.5 2.5 0 0 1 21 7v7.5a2.5 2.5 0 0 1-2.5 2.5H12l-4.3 3.4V17H5.5A2.5 2.5 0 0 1 3 14.5V7a2.5 2.5 0 0 1 2.5-2.5z" />
    <path d="M8 9.2h8M8 12.4h5" />
  </svg>
);
export const IconData = ({ size = 22 }) => (
  <svg {...svg(size)}>
    <ellipse cx="12" cy="6" rx="7" ry="2.8" />
    <path d="M5 6v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6" />
  </svg>
);
export const IconMenu = ({ size = 20 }) => (
  <svg {...svg(size)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const IconClose = ({ size = 20 }) => (
  <svg {...svg(size)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconChevron = ({ size = 20 }) => (
  <svg {...svg(size)}><path d="m9 6 6 6-6 6" /></svg>
);
export const IconArrow = ({ size = 20 }) => (
  <svg {...svg(size)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IconPill = ({ size = 22 }) => (
  <svg {...svg(size)}><rect x="2.8" y="8.4" width="18.4" height="7.2" rx="3.6" transform="rotate(-35 12 12)" /><path d="m9.2 6.6 5.6 8" /></svg>
);
export const IconFlask = ({ size = 22 }) => (
  <svg {...svg(size)}><path d="M9.5 3.5h5M10.3 3.5v5.2L5.4 17.6A2.2 2.2 0 0 0 7.3 21h9.4a2.2 2.2 0 0 0 1.9-3.4l-4.9-8.9V3.5" /><path d="M7.6 15h8.8" /></svg>
);
export const IconBook = ({ size = 22 }) => (
  <svg {...svg(size)}><path d="M12 6.6C10.4 5.4 8.2 4.9 5 4.9v12.9c3.2 0 5.4.5 7 1.7 1.6-1.2 3.8-1.7 7-1.7V4.9c-3.2 0-5.4.5-7 1.7Z" /><path d="M12 6.6v12.9" /></svg>
);
