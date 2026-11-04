// 화면 전체에서 쓰는 작은 부품들. Figma 컴포넌트(Button·Badge·Chip·IconButton·Card)와 이름을 맞췄다.
export const cx = (...a) => a.filter(Boolean).join(' ');

/** 접근성 속성 inert: React 18은 불리언 inert를 지원하지 않아 빈 문자열로 넘긴다. */
export const inertProps = (on) => (on ? { inert: '' } : {});

// 입력 칸 테두리는 글자 아닌 요소 기준 3:1 이상(--edge)으로 한다. 초점 표시는 전역 초점 링(index.css)이 맡는다.
export const INPUT_CLS = 'w-full rounded-lg border border-edge bg-surface px-3.5 py-2.5 text-body text-ink';

export function Card({ className, children, ...rest }) {
  // 메디노트 카드: 흰 바탕 · 모서리 20 · 가는 테두리 · 틸 기운이 도는 옅은 그림자 (data-card: 시험이 카드를 찾는 표시)
  return <div data-card="" className={cx('mb-3.5 rounded-xl border border-line bg-surface p-5 shadow-card lt-tree:p-4', className)} {...rest}>{children}</div>;
}

const BADGE = {
  info: 'bg-info-bg text-info',
  draft: 'bg-warn-bg text-warn',
  ok: 'bg-ok-bg text-ok',
  err: 'bg-err-bg text-err',
};
export function Badge({ tone = 'info', className, children }) {
  return <span className={cx('inline-block rounded-pill px-2.5 py-0.5 text-caption font-bold', BADGE[tone], className)}>{children}</span>;
}

/** review_status가 draft(초안)이면 "초안·약사 검수 전", 아니면 "자동 수집". */
export function StatusBadge({ v, className }) {
  const draft = v.review_status === 'draft';
  return <Badge tone={draft ? 'draft' : 'info'} className={className}>{draft ? '초안·약사 검수 전' : '자동 수집'}</Badge>;
}

const BTN = {
  primary: 'border-pri-fill bg-pri-fill text-on-pri hover:brightness-110',
  secondary: 'border-pri bg-surface text-pri hover:bg-pri-soft',
  tonal: 'border-pri-soft bg-pri-soft text-pri hover:border-pri',
  quiet: 'border-line bg-surface text-ink hover:border-pri hover:text-pri',
};
// 누르는 면은 손가락 기준 44px 이상(md), 화면 하단·카드 안의 주된 행동은 48px(lg)
const BTN_SIZE = { md: 'min-h-11 px-4 py-2', lg: 'min-h-12 px-5 py-2.5' };
export function Btn({ variant = 'primary', size = 'md', className, type = 'button', ...rest }) {
  return <button type={type} className={cx('inline-flex items-center justify-center gap-2 rounded-lg border text-body font-bold disabled:opacity-50', BTN_SIZE[size], BTN[variant], className)} {...rest} />;
}

/** 작은 보조 버튼(그래프 도구줄·닫기 등). 휴대폰 폭에서는 44px 이상으로 키운다. */
export function IconBtn({ className, type = 'button', ...rest }) {
  return <button type={type} className={cx('inline-flex min-h-9 items-center justify-center rounded-md border border-line bg-surface px-2.5 py-1 text-small font-semibold text-ink hover:border-pri hover:text-pri lt-tree:min-h-11 lt-tree:min-w-11', className)} {...rest} />;
}

export function Chip({ leaf, className, children, ...rest }) {
  return (
    <span className={cx('inline-block rounded-sm px-2 py-0.5 text-small', leaf ? 'bg-pri-chip font-bold text-pri-chip-ink' : 'bg-info-bg text-ink', className)} {...rest}>
      {children}
    </span>
  );
}

export function Muted({ as: Tag = 'div', className, children, ...rest }) {
  return <Tag className={cx('text-small text-mut', className)} {...rest}>{children}</Tag>;
}

export function SrOnly({ children }) {
  return <span className="sr-only">{children}</span>;
}
