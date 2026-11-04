import { useRef } from 'react';
import { cx, inertProps } from './ui.jsx';
import { IconChat, IconData, IconGraph, IconSearch, IconShield } from './icons.jsx';

// [키, 이름(접근 가능한 이름 = 화면 읽기·시험이 쓰는 이름), 하단 막대의 짧은 글자, 아이콘]
export const TABS = [
  ['search', '사전 검색', '검색', IconSearch],
  ['graph', '관계 그래프', '그래프', IconGraph],
  ['verify', '답변 검증', '검증', IconShield],
  ['rag', '근거 기반 질의', '질의', IconChat],
  ['about', '데이터·한계', '데이터', IconData],
];

/**
 * 작업 화면 탭: 방향키·Home·End로 이동(탭 하나만 Tab 순서에 들어간다).
 * variant="top"    넓은 화면: 본문 위에 붙는 알약 탭.
 * variant="bottom" 휴대폰(≤699px): 화면 맨 아래 탭 막대(아이콘 + 짧은 글자). 접근 가능한 이름은 그대로 긴 이름이다.
 */
export function Tabs({ tab, onChange, variant = 'top', inert }) {
  const refs = useRef({});
  const bottom = variant === 'bottom';
  const onKeyDown = (e) => {
    const i = TABS.findIndex(([k]) => k === tab);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = TABS.length - 1;
    if (n < 0) return;
    e.preventDefault();
    onChange(TABS[n][0]);
    refs.current[TABS[n][0]]?.focus();
  };
  const list = (
    <div
      role="tablist"
      aria-label="작업 화면"
      data-variant={variant}
      onKeyDown={onKeyDown}
      className={bottom
        ? 'flex items-stretch gap-0.5 border-t border-line bg-surface pl-[max(6px,env(safe-area-inset-left,0px))] pr-[max(6px,env(safe-area-inset-right,0px))] shadow-nav'
        : 'center-bleed sticky top-0 z-[5] mb-3.5 flex gap-1 overflow-x-auto border-b border-line bg-bg py-2'}
      {...(bottom ? {} : inertProps(inert))}
    >
      {TABS.map(([k, label, short, Icon]) => {
        const on = k === tab;
        return (
          <button
            key={k}
            ref={(el) => { refs.current[k] = el; }}
            id={`tab-${k}`}
            role="tab"
            type="button"
            aria-label={bottom ? label : undefined}
            aria-selected={on}
            aria-controls={`panel-${k}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(k)}
            className={bottom
              ? cx('flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 pb-1.5 pt-1 text-caption', on ? 'font-bold text-pri' : 'font-semibold text-info')
              : cx('min-h-11 whitespace-nowrap rounded-lg px-3.5 py-2 text-body', on ? 'bg-pri-soft font-bold text-pri' : 'font-semibold text-info hover:bg-info-bg')}
          >
            {bottom ? (
              <>
                <span className={cx('flex h-8 w-14 items-center justify-center rounded-pill', on && 'bg-pri-soft')}><Icon size={22} /></span>
                <span className="max-w-full truncate">{short}</span>
              </>
            ) : label}
          </button>
        );
      })}
    </div>
  );
  // 휴대폰의 하단 막대는 화면 이동 구역(nav)에 담는다(구역 밖에 떠 있으면 화면 읽기 프로그램의 구역 이동에서 빠진다). 서랍·시트가 열리면 구역째 막는다.
  return bottom ? <nav aria-label="화면 전환" className="flex-none" {...inertProps(inert)}>{list}</nav> : list;
}

export function Panel({ id, active, children }) {
  return (
    <section role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={!active}>
      {children}
    </section>
  );
}
