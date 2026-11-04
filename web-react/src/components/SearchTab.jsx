import { useEffect, useMemo, useRef, useState } from 'react';
import { META, mt } from '../lib/mt.js';
import { SEARCH_EXAMPLES } from '../lib/samples.js';
import { buildAz } from '../lib/tree.js';
import { ATC1_KO, ATC_GROUPS, groupsOf } from '../lib/atc1.js';
import { Badge, Btn, Card, INPUT_CLS, StatusBadge, cx } from './ui.jsx';
import { IconChevron, IconClose, IconSearch } from './icons.jsx';
import { PillArt } from './PillArt.jsx';
import { Thumb } from './Thumb.jsx';
import { ExtCard, nf } from './ExtParts.jsx';

const PAGE = 12; // 핵심 수록: 한 번에 보여 주는 카드 수(더 보기로 12개씩 늘어남)
const PAGE_X = 24; // 확장 수록은 수가 많아 24개씩

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

/** "더 보기 (n)" 단추와 "k / n개 표시 중" */
function MoreBtn({ shown, total, onMore }) {
  if (total <= shown) return null;
  return (
    <div className="mt-4 flex flex-col items-center gap-1.5">
      <Btn variant="secondary" size="lg" className="lt-tree:w-full" onClick={onMore}>
        더 보기 ({total - shown})
      </Btn>
      <p className="text-small text-mut">{shown} / {total}개 표시 중</p>
    </div>
  );
}

// 확장 수록 목록은 한글 이름이 있는 것을 가나다순으로 먼저, 한글 이름이 없는 것(영문 이름)을 그 뒤에 둔다.
const byKoFirst = (a, b) => (a.label_ko ? 0 : 1) - (b.label_ko ? 0 : 1) || mt._cmpName(a, b);

export function SearchTab({ selectedId, onSelect }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(''); // '' = 전체, 아니면 ATC 대분류 글자
  const [limit, setLimit] = useState(PAGE);
  const [limitX, setLimitX] = useState(PAGE_X);
  const inputRef = useRef(null);
  const coreHits = useMemo(() => mt.search(q), [q]);
  const extHits = useMemo(() => mt.searchExt(q), [q]); // 확장 수록(공개 자료 자동 수집 초안)
  // 핵심 성분이 확장 자료(심평원 상품명·별칭 등)로 찾아진 경우는 핵심 목록에 합친다(같은 성분을 두 번 보여 주지 않는다).
  const hits = useMemo(() => {
    const have = new Set(coreHits.map((h) => h.vtm.id));
    const extra = [];
    for (const x of extHits) {
      if (x.vtm && !have.has(x.vtm.id)) { have.add(x.vtm.id); extra.push({ vtm: x.vtm, score: x.score, via: `확장 자료 · ${x.via}` }); }
    }
    return extra.length ? coreHits.concat(extra).sort((a, b) => b.score - a.score) : coreHits;
  }, [coreHits, extHits]);
  const xhits = useMemo(() => extHits.filter((x) => !x.vtm), [extHits]);
  const classHits = useMemo(() => mt.searchClass(q), [q]); // "PPI"·"ACE 억제제" 같은 분류 이름: 분류 안내 카드용
  const az = useMemo(buildAz, []);
  const asked = q.trim().length > 0;

  // 후보가 하나뿐이거나 이름·RxCUI가 정확히 일치하면 상세를 바로 연다(입력을 가리지 않도록 서랍은 열지 않는다).
  // 핵심과 확장이 같은 점수면 핵심이 먼저다.
  useEffect(() => {
    const c = hits[0];
    const x = xhits[0];
    const top = c && (!x || c.score >= x.score) ? { id: c.vtm.id, score: c.score } : x ? { id: x.ext.id, score: x.score } : null;
    if (top && (hits.length + xhits.length === 1 || top.score >= 95)) onSelect(top.id, { open: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits, xhits]);

  // 검색어나 분류가 바뀌면 처음부터 다시 보여 준다.
  useEffect(() => { setLimit(PAGE); setLimitX(PAGE_X); }, [q, cat]);

  // 검색어가 있으면 검색 결과, 없으면 수록 성분 전체(가나다순). 분류 칩이 켜져 있으면 그 대분류에 속한 것만.
  const rows = useMemo(() => {
    const base = asked ? hits.map((h) => ({ v: h.vtm, via: h.via })) : az.map((a) => ({ v: a.v }));
    return cat ? base.filter((r) => groupsOf(r.v).includes(cat)) : base;
  }, [asked, hits, az, cat]);
  // 확장 수록: 검색어가 있으면 검색 결과, 없으면 분류 칩이 켜진 때만 그 분류의 목록(전체 3천여 개를 한꺼번에 늘어놓지 않는다).
  const xrows = useMemo(() => {
    const base = asked
      ? xhits.map((h) => ({ v: h.ext, via: h.via }))
      : cat ? mt.extList.filter((v) => groupsOf(v).includes(cat)).sort(byKoFirst).map((v) => ({ v })) : [];
    return cat ? base.filter((r) => groupsOf(r.v).includes(cat)) : base;
  }, [asked, xhits, cat]);
  const shown = rows.slice(0, limit);
  const xshown = xrows.slice(0, limitX);
  const total = az.length;
  const nExt = mt.extList.length;
  const nAll = total + nExt;
  const c = META.counts;
  const nResult = rows.length + xrows.length;
  const nothing = asked && !hits.length && !xhits.length;

  return (
    <>
      {/* 히어로: 검색 입력이 첫눈에 들어오게. 입력 높이 48px, 지우기 버튼 44px.
          휴대폰(≤699px)에서는 검색어를 쓰는 순간 안내(제목·수록 수·예시·도움말)를 접어, 결과 카드가 첫 화면(하단 탭 막대 위)에 바로 보이게 한다.
          접은 안내는 화면에서만 숨기고(sr-only) 제목은 구역 이름(aria-labelledby)으로 남긴다. 검색어를 지우면 다시 펼쳐진다. 넓은 화면은 그대로. */}
      <section aria-labelledby="hero-title" className={cx('relative mb-4 overflow-hidden rounded-xl border border-line bg-pri-soft p-5 shadow-card', asked ? 'lt-tree:mb-2.5 lt-tree:p-2.5' : 'lt-tree:p-4')}>
        <PillArt className={cx('pointer-events-none absolute right-2 top-2 h-[5.25rem] w-auto lt-tree:right-1.5 lt-tree:top-3 lt-tree:h-[4.5rem]', asked && 'lt-tree:hidden')} />
        <div className={cx('relative pr-24', asked ? 'lt-tree:sr-only' : 'lt-tree:pr-20')}>
          <h2 id="hero-title" className="text-heading-l text-ink">어떤 성분을 찾으세요?</h2>
          <p className="mt-1 text-small text-mut">
            핵심 성분 {c.VTM}개 · 제형·용량(VMP) {c.VMP}개 · 제품(AMP) {c.AMP}개{nExt ? <>, 확장 수록 {nf(nExt)}개 성분(자동 수집 초안)</> : null}이 수록되어 있습니다. <span className="whitespace-nowrap">(자료 기준 {META.built_at})</span>
          </p>
        </div>
        <div className={cx('relative mt-4', asked && 'lt-tree:mt-0')}>
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
        <div className={cx('mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5', asked && 'lt-tree:hidden')}>
          <span className="text-small text-mut">예:</span>
          {SEARCH_EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setQ(ex)}
              className="inline-flex min-h-9 items-center rounded-pill border border-line bg-surface px-3 text-small font-semibold text-pri hover:border-pri coarse:min-h-11 lt-tree:min-h-11"
            >
              {ex}
            </button>
          ))}
        </div>
        <p className={cx('mt-3 text-small text-mut', asked && 'lt-tree:hidden')}>분류 이름(PPI·진통제)이나 ID(MT:VTM:7646, RxCUI 7646)로도 찾을 수 있습니다.</p>
        <p className={cx('mt-1.5 text-small text-mut', asked && 'lt-tree:hidden')}>
          <span className="lt-tree:hidden">왼쪽 ATC 트리에서도 탐색할 수 있고, 성분을 선택하면 상세가 표시됩니다.</span>
          <span className="hidden lt-tree:inline">성분을 누르면 상세가 아래에서 올라옵니다. 분류 트리는 위쪽 ‘분류’ 버튼으로 엽니다.</span>
        </p>
      </section>

      {/* 분류로 찾기: ATC 대분류 칩(휴대폰에서는 옆으로 밀어 보기, 넓은 화면에서는 줄바꿈) */}
      <section aria-labelledby="cat-title" className={cx('mb-4', asked && 'lt-tree:mb-2')}>
        <h2 id="cat-title" className={cx('mb-2 text-body-bold', asked && 'lt-tree:sr-only')}>분류로 찾기 <span className="text-small font-normal text-mut">ATC 대분류 · 한글 이름은 검수 전 초안</span></h2>
        <div role="group" aria-label="ATC 대분류로 걸러 보기" className="chip-row">
          <Pill on={!cat} onClick={() => setCat('')}>전체 <span className={cx('text-graph-l1', !cat ? 'text-on-pri-2' : 'text-mut')}>{nf(nAll)}</span></Pill>
          {ATC_GROUPS.map((g) => {
            const on = cat === g.letter;
            return (
              <Pill key={g.letter} on={on} title={g.en || undefined} onClick={() => setCat(on ? '' : g.letter)}>
                <b>{g.letter}</b> {g.ko} <span className={cx('text-graph-l1', on ? 'text-on-pri-2' : 'text-mut')}>{nf(g.n + g.nx)}</span>
              </Pill>
            );
          })}
        </div>
      </section>

      <div role="status" aria-live="polite" className="sr-only">
        {asked ? `검색 결과 ${nResult}개` : cat ? `${ATC1_KO[cat] || cat} 분류 ${nResult}개` : ''}
      </div>

      {/* 확장 수록 안내: 검색어도 분류도 없을 때만. 3천여 개를 한꺼번에 늘어놓지 않고 검색·분류로 찾게 한다. */}
      {!asked && !cat && nExt > 0 && (
        <Card id="ext-hint" className="!mb-3.5 text-small text-mut">
          <b className="text-ink">확장 수록 {nf(nExt)}개 성분</b>은 검색하면 나옵니다(이름·상품명·ATC 코드·RxCUI, 두 글자부터). 위의 분류 칩을 누르면 그 분류의 확장 수록 성분을 목록으로 볼 수 있습니다.
          공개 자료(RxNorm·심평원 약가마스터·Wikidata)로 자동 수집·연결한 초안이며 약사 검수 전입니다.
        </Card>
      )}

      {/* 분류 이름으로 찾았을 때: 어떤 분류인지, 사전에 그 분류의 성분이 있는지(없으면 "확인 필요") */}
      {asked && classHits.length > 0 && (
        <div id="class-info" aria-label="분류 안내" className="mb-1">
          {classHits.slice(0, 3).map((k) => {
            const nc = k.members.length;
            const nx = (k.extMembers || []).length;
            return (
              <Card key={k.cl.label} className="!mb-2 text-small text-mut">
                {k.alias !== k.cl.label && <><b className="text-ink">‘{k.alias}’</b>은(는) </>}분류 <b className="text-ink">{k.cl.label}</b>(ATC {k.cl.atc.join('·')})입니다.{' '}
                {nc + nx > 0
                  ? <>이 사전에 있는 이 분류의 성분 {nc + nx}개{nx > 0 ? <>(핵심 {nc}개 · 확장 수록 {nx}개)</> : null}를 아래에 보여 드립니다.</>
                  : <>이 분류는 알고 있지만, 현재 이 사전({nExt ? `핵심 ${total}개 + 확장 ${nf(nExt)}개` : `${total}개`} 성분)에는 이 분류에 수록된 성분이 없습니다. <b className="text-ink">확인이 필요하다</b>는 뜻이지, 이 분류의 약이 없다는 뜻은 아닙니다.</>}
              </Card>
            );
          })}
          {classHits.length > 3 && <p className="mb-2 text-small text-mut">그 밖에 {classHits.length - 3}개 분류와도 일치합니다.</p>}
        </div>
      )}
      {nothing && !classHits.length && (
        <Card className="text-small text-mut">
          사전에 없습니다 — <b className="text-ink">확인이 필요하다</b>는 뜻입니다. 이 사전은 현재 {nf(nAll)}개 성분{nExt ? `(핵심 ${total}개 + 확장 ${nf(nExt)}개)` : ''}만 수록하므로, 없다고 해서 존재하지 않는 약이라는 뜻은 아닙니다.
        </Card>
      )}
      {asked && (hits.length > 0 || xhits.length > 0) && !rows.length && !xrows.length && (
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
          <MoreBtn shown={shown.length} total={rows.length} onMore={() => setLimit((n) => n + PAGE)} />
        </section>
      )}

      {xrows.length > 0 && (
        <section aria-labelledby="xlist-title" id="ext-list" className={rows.length > 0 ? 'mt-7' : undefined}>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <h2 id="xlist-title" className="text-body-bold">확장 수록 <span className="font-normal text-mut">{nf(xrows.length)}</span></h2>
            <span className="text-small text-mut">{asked ? '검색 결과' : '가나다순'} · 자동 수집 · 약사 검수 전</span>
          </div>
          <p className="mb-2 text-small text-mut">공개 자료(RxNorm·심평원 약가마스터·Wikidata)로 자동 수집·연결한 초안입니다. 한글 이름은 후보이고, 국내 등재 현황은 제품 규격일 뿐 허가·급여·용법 판단의 근거가 아닙니다.</p>
          <ul className="feed-grid">
            {xshown.map((r) => (
              <li key={r.v.id}>
                <ExtCard v={r.v} via={r.via} on={r.v.id === selectedId} onSelect={onSelect} />
              </li>
            ))}
          </ul>
          <MoreBtn shown={xshown.length} total={xrows.length} onMore={() => setLimitX((n) => n + PAGE_X)} />
        </section>
      )}
    </>
  );
}
