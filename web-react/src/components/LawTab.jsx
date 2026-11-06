import { useEffect, useMemo, useState } from 'react';
import { layers } from '../lib/mt.js';
import { Badge, Btn, Card, INPUT_CLS, cx } from './ui.jsx';
import { IconClose, IconSearch } from './icons.jsx';
import { nf } from './ExtParts.jsx';
import { ExtLink } from './LayerParts.jsx';

/* 약무·제도 탭: 약사법 본문에서 뽑은 정의 용어·조직·약국과 조제 업무(data/medterm_law.json).
   법령 원문(짧은 발췌)과 쉬운 풀이(초안)를 나누어 보여 준다. 풀이는 약사 검수 전 초안이며 법률 자문이 아니다. */

const PAGE = 20;
// ‘협의회’를 찾는 사람이 바로 볼 만한 항목: 정부 협의체(국가필수의약품 안정공급 협의회) · 약사 단체와 약사가 참여하는 기구
const COUNCIL_PICKS = ['LAW:83-5', 'LAW:11', 'LAW:11-5', 'LAW:18', 'LAW:14'];

function Pill({ on, children, ...rest }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cx('inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-pill border px-3.5 text-small font-semibold', on ? 'border-pri-fill bg-pri-fill text-on-pri' : 'border-line bg-surface text-ink hover:border-pri')}
      {...rest}
    >
      {children}
    </button>
  );
}

/** 원문 발췌: ‘…’ 로 이어 붙인 조각마다 한 단락으로 보여 주고, 건너뛴 자리는 흐린 점 세 개로 알린다. */
function Quote({ label, text }) {
  const parts = text.split('…').map((s) => s.trim()).filter(Boolean);
  return (
    <figure className="mt-2">
      {label && <figcaption className="mb-1 text-small-bold text-mut">{label}</figcaption>}
      <blockquote lang="ko" className="rounded-lg border-l-4 border-pri bg-bg px-3 py-2 text-small leading-relaxed text-ink">
        {parts.map((p, i) => (
          <p key={i} className={cx(i > 0 && 'mt-1.5')}>
            {i > 0 && <span aria-hidden="true" className="mr-1 text-mut">…</span>}
            {p}
          </p>
        ))}
      </blockquote>
    </figure>
  );
}

function LawCard({ e, onPick, onJump }) {
  const stt = layers.lawStatus(e);
  const rel = (e.rel || []).map((id) => layers.lawEntry(id)).filter(Boolean).slice(0, 6);
  const upcomingQuote = e.exn && (stt.passed ? `${stt.eff} 시행판 (시행일이 지났습니다 · 법제처 현행본으로 확인)` : `${stt.eff} 시행 예정판`);
  return (
    <li className="rounded-xl border border-line bg-surface p-3 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <b className="min-w-0 text-hit-title">{e.t}</b>
        <span className="text-small-bold text-ink">약사법 {e.a}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Badge tone={stt.tone}>{stt.label}</Badge>
        <Badge tone="draft">풀이는 초안·약사 검수 전</Badge>
        {e.ti && <span className="text-small text-mut">조문 제목: {e.ti}</span>}
      </div>
      <p className="mt-1.5 break-words text-body">{e.pl}</p>
      <details className="mt-1">
        <summary className="min-h-11 cursor-pointer py-2 text-small font-semibold text-pri">법령 원문 발췌{e.exn && e.ex ? ' (현행 · 시행 예정)' : ''}</summary>
        <div className="pb-2">
          {e.ex && <Quote label={e.exn ? '현행' : null} text={e.ex} />}
          {e.exn && <Quote label={upcomingQuote} text={e.exn} />}
          <p className="mt-2 text-caption text-mut">국가법령정보센터(법제처) 약사법 출력본에서 옮긴 발췌입니다. ‘…’는 중간 생략이며, 법령 전문과 시행령·시행규칙은 직접 확인해 주세요.</p>
        </div>
      </details>
      {(rel.length > 0 || e.go) && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {rel.length > 0 && <span className="text-small text-mut">관련:</span>}
          {rel.map((r) => (
            <Btn key={r.id} variant="quiet" className="!min-h-11 !px-3 !py-1.5 !text-small" onClick={() => onPick(r.t)} aria-label={`관련 항목 ${r.t} 보기`}>{r.t}</Btn>
          ))}
          {e.go && <Btn variant="secondary" className="!min-h-11 !px-3 !py-1.5 !text-small" onClick={() => onJump(e.go.tab, e.go.q)}>{e.go.label}</Btn>}
        </div>
      )}
    </li>
  );
}

export function LawTab({ onJump }) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [upc, setUpc] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { setLimit(PAGE); }, [q, group, upc]);
  const M = layers.lawMeta; const C = M.counts;
  const groups = layers.lawGroups();
  const list = useMemo(() => layers.searchLaw({ q, group, upcoming: upc }), [q, group, upc]);
  const shown = list.slice(0, limit);
  const council = /협의회/.test(q);
  const pick = (term) => { setQ(term); setGroup(''); setUpc(false); };

  return (
    <>
      <section aria-labelledby="law-title" className="relative mb-4 overflow-hidden rounded-xl border border-line bg-pri-soft p-5 shadow-card lt-tree:p-4">
        <h2 id="law-title" className="text-heading-l text-ink">약무·제도 용어 (약사법)</h2>
        <p className="mt-1 text-small text-mut">
          약사법 본문에서 뽑은 정의 용어 {nf(C.def)}개 · 조직·위원회 {nf(C.org)}개 · 약국·조제 업무 {nf(C.duty)}개 · 제도·정보시스템 {nf(C.sys)}개. 법령 원문(짧은 발췌)과 쉬운 풀이(초안)를 나누어 보여 드립니다.
        </p>
        <p className="mt-1 text-small text-mut">
          쉬운 풀이는 약사 검수 전 초안이며 법률 자문이 아닙니다. 기준은 국가법령정보센터(법제처) 약사법 출력본({M.source.print.match(/출력일 [\d-]+/)?.[0] || '출력일 미상'})입니다.
          {M.pl_checked ? ` ${M.pl_checked}.` : ''} 출력본에는 시행일이 서로 다른 규정이 함께 실려 있어 항목마다 시행 상태를 적었고, {M.upcoming_effective} 시행 예정 항목은 {nf(C.upcoming)}건입니다.
        </p>
        <p className="mt-1 text-small text-mut">
          {M.source.latest_seen ? `${M.source.latest_seen}. ` : ''}법제처 현행본과의 대조는 아직 하지 않았습니다.
        </p>
      </section>

      <div className="relative mb-3">
        <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mut"><IconSearch /></span>
        <input
          id="lawq"
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="용어·조문·별칭 (예: 조제, 복약지도, DUR, 약사회, 제27조)"
          aria-label="약무·제도 용어 검색"
          autoComplete="off"
          spellCheck={false}
          className={cx(INPUT_CLS, 'min-h-12 pl-11 pr-12')}
        />
        {q && <button type="button" aria-label="검색어 지우기" onClick={() => setQ('')} className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-mut hover:text-ink"><IconClose size={18} /></button>}
      </div>

      <div role="group" aria-label="분류" className="chip-row mb-2">
        <Pill on={!group} onClick={() => setGroup('')}>전체 {nf(C.entries)}</Pill>
        {groups.map((g) => <Pill key={g.id} on={group === g.id} onClick={() => setGroup(group === g.id ? '' : g.id)} title={g.hint}>{g.label} {nf(C[g.id])}</Pill>)}
      </div>
      <div className="mb-3">
        <label className="flex min-h-11 items-center gap-2 text-small text-ink">
          <input type="checkbox" checked={upc} onChange={(e) => setUpc(e.target.checked)} className="h-5 w-5 flex-none" /> {M.upcoming_effective} 시행 예정·개정 예정 항목만 ({nf(C.upcoming)})
        </label>
      </div>

      {council && (
        <div id="law-council-note" className="mb-3 rounded-xl border border-line bg-surface px-3 py-2 text-small text-mut">
          <p>
            약사법 본문에는 ‘약사협의회’라는 말이 없습니다(검색 0건). ‘협의회’가 붙은 법정 기구는 <b className="text-ink">국가필수의약품 안정공급 협의회(제83조의5, {M.upcoming_effective} 시행 예정)</b> 하나이며, 약사 단체가 아니라 식품의약품안전처에 두는 정부 협의체입니다. 약사 단체와 약사가 참여하는 구조는 아래 항목에서 볼 수 있습니다.
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {COUNCIL_PICKS.map((id) => layers.lawEntry(id)).filter(Boolean).map((r) => (
              <Btn key={r.id} variant="quiet" className="!min-h-11 !px-3 !py-1.5 !text-small" onClick={() => pick(r.t)} aria-label={`${r.t} 항목 보기`}>{r.t}</Btn>
            ))}
          </div>
        </div>
      )}

      <div role="status" aria-live="polite" className="sr-only">{`${nf(list.length)}건`}</div>
      {list.length === 0 ? (
        <Card className="text-small text-mut">조건에 맞는 항목이 없습니다. 없다는 뜻이 아니라 <b className="text-ink">이 층에 아직 수록하지 않았다</b>는 뜻일 수 있습니다(시행령·시행규칙은 수록 전입니다).</Card>
      ) : (
        <section aria-labelledby="llist-title">
          <h2 id="llist-title" className="mb-2 text-body-bold">약사법 항목 <span className="font-normal text-mut">{nf(list.length)}</span></h2>
          <ul className="grid gap-2">
            {shown.map((e) => <LawCard key={e.id} e={e} onPick={pick} onJump={onJump} />)}
          </ul>
          {list.length > shown.length && (
            <div className="mt-4 flex flex-col items-center gap-1.5">
              <Btn variant="secondary" size="lg" className="lt-tree:w-full" onClick={() => setLimit((n) => n + PAGE)}>더 보기 ({nf(list.length - shown.length)})</Btn>
              <p className="text-small text-mut">{nf(shown.length)} / {nf(list.length)}건 표시 중</p>
            </div>
          )}
        </section>
      )}
      <p className="mt-6 text-small text-mut">
        출처: <ExtLink href={M.source.url}>국가법령정보센터(법제처)</ExtLink> 약사법. 시행령·시행규칙, 시행 예정 개정의 최종 확인, 약사 검수는 아직 하지 않았습니다. 자세한 한계는 ‘데이터·한계’ 탭에 있습니다.
      </p>
    </>
  );
}
