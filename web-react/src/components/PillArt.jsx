/** 검색 첫 화면(히어로)의 장식 그림: 알약과 정제. 색은 모두 토큰이라 다크에서도 자동으로 바뀐다. 장식이라 화면 읽기 프로그램에는 숨긴다. */
export function PillArt({ className }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 160 112" className={className}>
      <circle cx="108" cy="54" r="46" fill="var(--pri-chip)" />
      <circle cx="148" cy="12" r="4" fill="var(--pri)" opacity=".5" />
      <circle cx="26" cy="26" r="3" fill="var(--pri)" opacity=".4" />
      <circle cx="132" cy="100" r="2.5" fill="var(--pri)" opacity=".4" />
      <g transform="rotate(-38 82 50)">
        <path d="M62 34H98A16 16 0 0 1 98 66H62A16 16 0 0 1 62 34Z" fill="var(--surface)" stroke="var(--pri)" strokeWidth="3" strokeLinejoin="round" />
        <path d="M80 34H98A16 16 0 0 1 98 66H80Z" fill="var(--pri)" />
      </g>
      <g>
        <circle cx="52" cy="86" r="17" fill="var(--surface)" stroke="var(--pri)" strokeWidth="3" />
        <path d="M42 84a10.5 10.5 0 0 1 8.5-8.2" fill="none" stroke="var(--pri)" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}
