import { useRef } from 'react';
import { cx } from './ui.jsx';

export const TABS = [
  ['search', '사전 검색'],
  ['graph', '관계 그래프'],
  ['verify', '답변 검증'],
  ['rag', '근거 기반 질의'],
  ['about', '데이터·한계'],
];

/** 탭 목록: 방향키·Home·End로 이동(탭 하나만 Tab 순서에 들어간다). */
export function Tabs({ tab, onChange }) {
  const refs = useRef({});
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
  return (
    <div
      role="tablist"
      aria-label="작업 화면"
      onKeyDown={onKeyDown}
      className="center-bleed sticky top-0 z-[5] mb-3.5 flex gap-1 overflow-x-auto border-b border-line bg-bg py-2"
    >
      {TABS.map(([k, label]) => {
        const on = k === tab;
        return (
          <button
            key={k}
            ref={(el) => { refs.current[k] = el; }}
            id={`tab-${k}`}
            role="tab"
            type="button"
            aria-selected={on}
            aria-controls={`panel-${k}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(k)}
            className={cx('min-h-11 whitespace-nowrap rounded-lg px-3.5 py-2 text-body', on ? 'bg-pri-soft font-bold text-pri' : 'font-semibold text-info hover:bg-info-bg')}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Panel({ id, active, children }) {
  return (
    <section role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={!active}>
      {children}
    </section>
  );
}
