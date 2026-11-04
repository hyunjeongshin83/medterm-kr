import { forwardRef } from 'react';
import { inertProps } from './ui.jsx';

/** 로고 타일: 틸 바탕 위의 알약(앱 아이콘과 같은 그림). 장식이라 화면 읽기 프로그램에는 숨긴다. */
function Logo() {
  return (
    <svg aria-hidden="true" width="34" height="34" viewBox="0 0 108 108" className="flex-none">
      <rect width="108" height="108" rx="28" fill="#0A7168" />
      <g transform="translate(54 54) scale(1.3) translate(-54 -54) rotate(-45 54 54)">
        <path fill="#FFFFFF" d="M41,41H67A13,13 0 0 1 67,67H41A13,13 0 0 1 41,41Z" />
        <path fill="#AEEAE2" d="M54,41H67A13,13 0 0 1 67,67H54Z" />
      </g>
    </svg>
  );
}

export const Topbar = forwardRef(function Topbar({ navOpen, onToggleNav, inert }, toggleRef) {
  return (
    <header className="flex flex-none items-center gap-3 border-b border-line bg-surface py-2.5 pl-[var(--gl)] pr-[var(--gr)]" {...inertProps(inert)}>
      <button
        ref={toggleRef}
        id="nav-toggle"
        type="button"
        aria-controls="left"
        aria-expanded={navOpen}
        onClick={onToggleNav}
        className="hidden items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-body font-semibold text-ink hover:border-pri lt-tree:inline-flex"
      >
        <span aria-hidden="true">☰</span> <span>분류 탐색</span>
      </button>
      <Logo />
      <div className="min-w-0">
        <h1 className="font-hand text-title-brand text-ink">
          MedTerm-KR <small className="font-sans text-caption font-normal text-mut">프로토타입</small>
        </h1>
        <p className="mt-0.5 text-caption text-mut lt-tree:hidden">약무용어 전자사전 · 온톨로지(VTM→VMP→AMP) · LLM 답변 근거 검증</p>
      </div>
    </header>
  );
});

export function Disclaimer({ inert }) {
  return (
    <div role="note" className="flex-none border-b border-notice-line bg-notice-bg py-1.5 pl-[var(--gl)] pr-[var(--gr)] text-caption text-notice-ink" {...inertProps(inert)}>
      정보 제공·연구용 프로토타입입니다. 진단·처방·개인별 복용량 판단을 하지 않으며, 한글명·상품명은 약사 검수 전 초안입니다. 복약 결정은 의사·약사와 상담하세요.
    </div>
  );
}
