// 화면 전체에서 쓰는 작은 부품들. Figma 컴포넌트(Button·Badge·Chip·IconButton·Card)와 이름을 맞췄다.
export const cx = (...a) => a.filter(Boolean).join(' ');

/** 접근성 속성 inert: React 18은 불리언 inert를 지원하지 않아 빈 문자열로 넘긴다. */
export const inertProps = (on) => (on ? { inert: '' } : {});

export const INPUT_CLS = 'w-full rounded-md border border-line bg-surface px-3 py-2.5 text-body text-ink';

export function Card({ className, children, ...rest }) {
  return <div className={cx('mb-3.5 rounded-lg border border-line bg-surface p-4', className)} {...rest}>{children}</div>;
}

const BADGE = {
  info: 'bg-info-bg text-info',
  draft: 'bg-warn-bg text-warn',
  ok: 'bg-ok-bg text-ok',
  err: 'bg-err-bg text-err',
};
export function Badge({ tone = 'info', className, children }) {
  return <span className={cx('inline-block rounded-pill px-2 py-px text-caption', BADGE[tone], className)}>{children}</span>;
}

/** review_status가 draft(초안)이면 "초안·약사 검수 전", 아니면 "자동 수집". */
export function StatusBadge({ v, className }) {
  const draft = v.review_status === 'draft';
  return <Badge tone={draft ? 'draft' : 'info'} className={className}>{draft ? '초안·약사 검수 전' : '자동 수집'}</Badge>;
}

const BTN = {
  primary: 'border-pri-fill bg-pri-fill text-on-pri hover:brightness-110',
  secondary: 'border-pri bg-surface text-pri hover:bg-pri-soft',
  quiet: 'border-line bg-surface text-ink hover:border-pri hover:text-pri',
};
export function Btn({ variant = 'primary', className, type = 'button', ...rest }) {
  return <button type={type} className={cx('inline-flex items-center justify-center gap-1.5 rounded-md border px-4 py-[9px] text-body disabled:opacity-50', BTN[variant], className)} {...rest} />;
}

/** 작은 보조 버튼(그래프 도구줄·닫기 등). */
export function IconBtn({ className, type = 'button', ...rest }) {
  return <button type={type} className={cx('inline-flex items-center justify-center rounded-sm border border-line bg-surface px-2.5 py-1 text-small text-ink hover:border-pri hover:text-pri', className)} {...rest} />;
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
