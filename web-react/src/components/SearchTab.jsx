import { useEffect, useMemo, useRef, useState } from 'react';
import { META, mt } from '../lib/mt.js';
import { SEARCH_EXAMPLES } from '../lib/samples.js';
import { buildAz } from '../lib/tree.js';
import { ATC1_KO, ATC_GROUPS, groupsOf } from '../lib/atc1.js';
import { Badge, Btn, Card, INPUT_CLS, StatusBadge, cx } from './ui.jsx';
import { IconChevron, IconClose, IconSearch } from './icons.jsx';
import { PillArt } from './PillArt.jsx';
import { Thumb } from './Thumb.jsx';

const PAGE = 12; // 한 번에 보여 주는 카드 수(더 보기로 12개씩 늘어남)

/** 분류 칩: 누르면 그 ATC 대분류로 목록을 거르고, 다시 누르면 풀린다. */
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

/** 성분 카드: 사진 자리(썸네일) · 이름 · ATC/RxCUI · 상태 배지 · 이동 표시. */
function ResultCard({ v, via, on, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(v.id)}
      aria-current={on ? 'true' : undefined}
      className={cx('flex h-full min-h-[4.5rem] w-full items-center gap-3 rounded-xl border p-3 text-left shadow-card hover:border-pri hover:shadow-card-hi', on ? 'border-pri bg-pri-soft' : 'border-line bg-surface')}
    >
      <Thumb v={v} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <b className="text-hit-title">{v.label_ko}</b>
          <span className="text-small text-mut">{v.label_en}</span>
        </span>
        <span className="mt-0.5 block text-small text-mut">
          ATC {(v.atc_codes.slice(0, 3).join(', ') || '-')}{v.atc_codes.length > 3 ? ` 외 ${v.atc_codes.length - 3}` : ''} · RxCUI {v.rxcui}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <StatusBadge v={v} />
          {via ? <Badge>{via}</Badge> : null}
        </span>
      </span>
      <span className="text-mut"><IconChevron /></span>
    </button>
  );
}

export function SearchTab({ selectedId, onSelect }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(''); // '' = 전체, 아니면 ATC 대분류 글자
  const [limit, setLimit] = useState(PAGE);
  const inputRef = useRef(null);
  const hits = useMemo(() => mt.search(q), [q]);
  const az = useMemo(buildAz, []);
  const asked = q.trim().length > 0;

  // 후보가 하나뿐이거나 이름·RxCUI가 정확히 일치하면 상세를 바로 연다(입력을 가리지 않도록 서랍은 열지 않는다).
  useEffect(() => {
    if (hits.length && (hits.length === 1 || hits[0].score >= 95)) onSelect(hits[0].vtm.id, { open: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits]);

  // 검색어나 분류가 바뀌면 처음 12개부터 다시 보여 준다.
  useEffect(() => { setLimit(PAGE); }, [q, cat]);

  // 검색어가 있으면 검색 결과, 없으면 수록 성분 전체(가나다순). 분류 칩이 켜져 있으면 그 대분류에 속한 것만.
  const rows = useMemo(() => {
    const base = asked ? hits.map((h) => ({ v: h.vtm, via: h.via })) : az.map((a) => ({ v: a.v }));
    return cat ? base.filter((r) => groupsOf(r.v).includes(cat)) : base;
  }, [asked, hits, az, cat]);
  const shown = rows.slice(0, limit);
  const total = az.length;
  const c = META.counts;

  return (
    <>
      {/* 히어로: 검색 입력이 첫눈에 들어오게. 입력 높이 48px, 지우기 버튼 44px. */}
      <section aria-labelledby="hero-title" className="relative mb-4 overflow-hidden rounded-xl border border-line bg-pri-soft p-5 shadow-card lt-tree:p-4">
        <PillArt className="pointer-events-none absolute right-2 top-2 h-[5.25rem] w-auto lt-tree:right-1.5 lt-tree:top-3 lt-tree:h-[4.5rem]" />
        <div className="relative pr-24 lt-tree:pr-20">
          <h2 id="hero-title" className="text-heading-l text-ink">어떤 성분을 찾으세요?</h2>
          <p className="mt-1 text-small text-mut">성분 {c.VTM}개 · 제형·용량(VMP) {c.VMP}개 · 제품(AMP) {c.AMP}개가 수록되어 있습니다. <span className="whitespace-nowrap">(자료 기준 {META.built_at})</span></p>
        </div>
        <div className="relative mt-4">
          <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mut"><IconSearch /></span>
          <input
            ref={inputRef}
            id="q"
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름·상품명·ATC 코드·RxCUI"
            aria-label="사전 검색"
            autoComplete="off"
            spellCheck={false}
            className={cx(INPUT_CLS, 'min-h-12 pl-11 pr-12')}
          />
          {q && (
            <button
              type="button"
              aria-label="검색어 지우기"
              onClick={() => { setQ(''); inputRef.current?.focus(); }}
              className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-mut hover:text-ink"
            >
              <IconClose size={18} />
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-small text-mut">예:</span>
          {SEARCH_EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setQ(ex)}
              className="inline-flex min-h-9 items-center rounded-pill border border-line bg-surface px-3 text-small font-semibold text-pri hover:border-pri"
            >
              {ex}
            </button>
          ))}
        </div>
        <p className="mt-3 text-small text-mut">
          <span className="lt-tree:hidden">왼쪽 ATC 트리에서도 탐색할 수 있고, 성분을 선택하면 상세가 표시됩니다.</span>
          <span className="hidden lt-tree:inline">성분을 누르면 상세가 아래에서 올라옵니다. 분류 트리는 위쪽 ‘분류’ 버튼으로 엽니다.</span>
        </p>
      </section>

      {/* 분류로 찾기: ATC 대분류 칩(휴대폰에서는 옆으로 밀어 보기, 넓은 화면에서는 줄바꿈) */}
      <section aria-labelledby="cat-title" className="mb-4">
        <h2 id="cat-title" className="mb-2 text-body-bold">분류로 찾기 <span className="text-small font-normal text-mut">ATC 대분류 · 한글 이름은 검수 전 초안</span></h2>
        <div role="group" aria-label="ATC 대분류로 걸러 보기" className="chip-row">
          <Pill on={!cat} onClick={() => setCat('')}>전체 <span className={cx('text-graph-l1', !cat ? 'text-on-pri-2' : 'text-mut')}>{total}</span></Pill>
          {ATC_GROUPS.map((g) => {
            const on = cat === g.letter;
            return (
              <Pill key={g.letter} on={on} title={g.en || undefined} onClick={() => setCat(on ? '' : g.letter)}>
                <b>{g.letter}</b> {g.ko} <span className={cx('text-graph-l1', on ? 'text-on-pri-2' : 'text-mut')}>{g.n}</span>
              </Pill>
            );
          })}
        </div>
      </section>

      <div role="status" aria-live="polite" className="sr-only">
        {asked ? `검색 결과 ${rows.length}개` : cat ? `${ATC1_KO[cat] || cat} 분류 ${rows.length}개` : ''}
      </div>

      {asked && !hits.length && (
        <Card className="text-small text-mut">
          사전에 없습니다 — <b className="text-ink">확인이 필요하다</b>는 뜻입니다. 이 사전은 현재 {META.counts.VTM}개 성분만 수록하므로, 없다고 해서 존재하지 않는 약이라는 뜻은 아닙니다.
        </Card>
      )}
      {asked && hits.length > 0 && !rows.length && (
        <Card className="text-small text-mut">이 분류에는 검색 결과가 없습니다. 위에서 ‘전체’를 눌러 분류를 풀어 보세요.</Card>
      )}

      {rows.length > 0 && (
        <section aria-labelledby="list-title">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 id="list-title" className="text-body-bold">{asked ? '검색 결과' : '수록 성분'} <span className="font-normal text-mut">{rows.length}</span></h2>
            {!asked && <span className="text-small text-mut">가나다순</span>}
          </div>
          <ul className="feed-grid">
            {shown.map((r) => (
              <li key={r.v.id}>
                <ResultCard v={r.v} via={r.via} on={r.v.id === selectedId} onSelect={onSelect} />
              </li>
            ))}
          </ul>
          {rows.length > shown.length && (
            <div className="mt-4 flex flex-col items-center gap-1.5">
              <Btn variant="secondary" size="lg" className="lt-tree:w-full" onClick={() => setLimit((n) => n + PAGE)}>
                더 보기 ({rows.length - shown.length})
              </Btn>
              <p className="text-small text-mut">{shown.length} / {rows.length}개 표시 중</p>
            </div>
          )}
        </section>
      )}
    </>
  );
}
