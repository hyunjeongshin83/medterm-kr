import { forwardRef } from 'react';
import { inertProps } from './ui.jsx';
import { IconMenu } from './icons.jsx';
import { APP_VERSION } from '../lib/version.js';

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

/**
 * 맨 위 띠(banner 구역): 앱 이름 줄과 면책 안내(role="note")를 한 구역으로 묶는다.
 * 안내가 구역 밖에 떠 있으면 화면 읽기 프로그램의 구역 이동(landmark)에서 빠지므로, 같은 <header> 안에 둔다.
 */
export const Topbar = forwardRef(function Topbar({ navOpen, onToggleNav, inert }, toggleRef) {
  return (
    <header className="flex-none" {...inertProps(inert)}>
      <div className="flex items-center gap-3 border-b border-line bg-surface py-2.5 pl-[var(--gl)] pr-[var(--gr)]">
        <Logo />
        <div className="min-w-0 flex-1">
          <h1 className="font-hand text-title-brand text-ink">
            MedTerm-KR <small className="font-sans text-caption font-normal text-mut">v{APP_VERSION}</small>
          </h1>
          <p className="mt-0.5 text-caption text-mut lt-tree:hidden">약무용어 전자사전 · 온톨로지(VTM→VMP→AMP) · LLM 답변 근거 검증</p>
        </div>
        {/* 휴대폰(≤699px)에서만 보이는 앱 막대 오른쪽 버튼: 분류 트리 서랍 열기. 접근 가능한 이름은 "분류 탐색". */}
        <button
          ref={toggleRef}
          id="nav-toggle"
          type="button"
          aria-label="분류 탐색"
          aria-controls="left"
          aria-expanded={navOpen}
          onClick={onToggleNav}
          className="hidden min-h-11 flex-none items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-body font-semibold text-ink hover:border-pri lt-tree:inline-flex"
        >
          <IconMenu size={20} /> <span>분류</span>
        </button>
      </div>
      <Disclaimer />
    </header>
  );
});

export function Disclaimer() {
  return (
    <div role="note" className="border-b border-notice-line bg-notice-bg py-1.5 pl-[var(--gl)] pr-[var(--gr)] text-caption text-notice-ink">
      약무용어 정보 제공용입니다. 진단·처방·개인별 복용량 판단을 하지 않으며, 한글명·상품명은 약사 검수 전 초안입니다. 복약 결정은 의사·약사와 상담하세요.
    </div>
  );
}
