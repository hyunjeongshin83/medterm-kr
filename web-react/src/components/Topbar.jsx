import { forwardRef } from 'react';
import { inertProps } from './ui.jsx';

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
        className="hidden items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-body text-ink hover:border-pri lt-tree:inline-flex"
      >
        <span aria-hidden="true">☰</span> <span>분류 탐색</span>
      </button>
      <div className="min-w-0">
        <h1 className="text-title-brand">
          MedTerm-KR <small className="text-caption font-normal text-mut">프로토타입</small>
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
