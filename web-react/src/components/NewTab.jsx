import { useEffect, useMemo, useState } from 'react';
import { layers, mt, nameOf } from '../lib/mt.js';
import { Badge, Btn, Card, INPUT_CLS, cx } from './ui.jsx';
import { IconClose, IconSearch } from './icons.jsx';
import { nf } from './ExtParts.jsx';
import { ChemBlock, ExtLink, StageChips, TrialBlock } from './LayerParts.jsx';

const PAGE = 15;

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

/** 임상 요약 한 줄(카드 아래쪽 칩) */
function TrialLine({ info }) {
  if (!info || !info.tr) return <span className="text-small text-mut">ClinicalTrials.gov 등록 시험을 찾지 못함 — 확인 필요</span>;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <StageChips stage={info.stage} />
      <span className="text-small text-mut">등록 {nf(info.tr.n)}건{info.tr.cap ? '+' : ''}{info.tr.spi.length ? ` · ${info.tr.spi[0]}` : ''}</span>
    </span>
  );
}

/** FDA 신약 한 건 */
function NovelCard({ x, onSelect }) {
  const info = useMemo(() => (x.e ? layers.forEntity(x.e) : layers.forKey(x.k)), [x]);
  const inDict = x.e && mt.anyById(x.e);
  return (
    <li className="rounded-xl border border-line bg-surface p-3 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="min-w-0"><b className="text-hit-title">{x.b}</b> <span className="text-small text-mut">{x.g}</span></span>
        <span className="text-small-bold text-ink">{x.d}</span>
      </div>
      <p className="mt-1 break-words text-small text-mut" lang="en">{x.u}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <TrialLine info={info} />
        {inDict ? <Badge tone="ok">사전 수록</Badge> : <Badge tone="info">사전 미수록</Badge>}
      </div>
      <details className="mt-1">
        <summary className="min-h-11 cursor-pointer py-2 text-small font-semibold text-pri">임상·화합물 자세히</summary>
        <div className="pb-2">
          {!inDict && <p className="mb-1 text-small text-mut">이 사전의 성분 목록(ATC가 확인된 RxNorm 성분 + 심평원 등재 성분)에 아직 없는 성분입니다. 국내 허가·등재를 뜻하지 않습니다.</p>}
          <TrialBlock info={info} level={3} />
          <ChemBlock info={info} onSelect={onSelect} level={3} />
          {inDict && <div className="mt-3"><Btn variant="secondary" onClick={() => onSelect(x.e)}>사전에서 보기: {nameOf(mt.anyById(x.e))}</Btn></div>}
        </div>
      </details>
    </li>
  );
}

function PipeCard({ r, onSelect }) {
  const info = useMemo(() => layers.forKey(r.k), [r]);
  const v = r.e ? mt.anyById(r.e) : null;
  return (
    <li className="rounded-xl border border-line bg-surface p-3 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <b className="text-hit-title">{v ? nameOf(v) : r.k}{v && v.label_ko ? <span className="ml-2 text-small font-normal text-mut">{v.label_en}</span> : null}</b>
        <span className="text-small text-mut">시작(예정 포함) {r.t.ls ? r.t.ls.replace('-', '.') : '-'}</span>
      </div>
      <div className="mt-1.5"><TrialLine info={info} /></div>
      {r.t.cond.length > 0 && <p className="mt-1 break-words text-small text-mut">대상 질환: {r.t.cond.join(', ')}</p>}
      <details className="mt-1">
        <summary className="min-h-11 cursor-pointer py-2 text-small font-semibold text-pri">임상·화합물 자세히</summary>
        <div className="pb-2">
          <TrialBlock info={info} level={3} />
          <ChemBlock info={info} onSelect={onSelect} level={3} />
          {v && <div className="mt-3"><Btn variant="secondary" onClick={() => onSelect(r.e)}>사전에서 보기</Btn></div>}
        </div>
      </details>
    </li>
  );
}

/** 최신·임상 탭: FDA 신약 승인표(2021~) + 임상이 진행·예정인 성분 */
export function NewTab({ onSelect, seed }) {
  const [mode, setMode] = useState('novel');
  const [year, setYear] = useState(0);
  const [q, setQ] = useState('');
  const [pf, setPf] = useState('p3');
  const [ind, setInd] = useState(true);
  const [common, setCommon] = useState(true);   // 흔히 쓰는 약(등록 1,000건 이상) 제외
  const [noKr, setNoKr] = useState(false);      // 국내 등재 성분 제외
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { if (seed && seed.tab === 'new') { setMode('novel'); setQ(seed.q || ''); setYear(0); } }, [seed]);
  useEffect(() => { setLimit(PAGE); }, [mode, year, q, pf, ind, common, noKr]);
  const M = layers.newMeta; const C = M.counts;
  const years = layers.novelYears();
  const novel = useMemo(() => layers.novelList({ year, q }), [year, q]);
  const pipe = useMemo(() => (mode === 'pipe' ? layers.pipelineList({ filter: pf, industry: ind, hideCommon: common, hideKr: noKr }) : []), [mode, pf, ind, common, noKr]);
  const list = mode === 'novel' ? novel : pipe;
  const shown = list.slice(0, limit);
  const F = M.fetched || {};
  const fetched = [F.fda && `FDA ${F.fda}`, F.trials && `임상 ${F.trials}`, F.chem && `PubChem ${F.chem}`].filter(Boolean).join(' · ');

  return (
    <>
      <section aria-labelledby="new-title" className="relative mb-4 overflow-hidden rounded-xl border border-line bg-pri-soft p-5 shadow-card lt-tree:p-4">
        <h2 id="new-title" className="text-heading-l text-ink">최신 승인과 임상 단계</h2>
        <p className="mt-1 text-small text-mut">
          미국 FDA 신약 승인 {nf(C.novel)}건(2021~) · 임상시험 요약 {nf(C.trials)}개 성분 · 화합물 연결 {nf(C.chem)}개 성분. 공개 자료를 자동 수집한 초안입니다{fetched ? `(받은 날 ${fetched})` : ''}.
        </p>
        <p className="mt-1 text-small text-mut">FDA 승인은 미국 기준이며 국내 허가·급여를 뜻하지 않습니다. 임상 수치는 등록 건수 요약일 뿐 효능·안전성 근거가 아닙니다. 식약처 허가 반영은 인증키 수집이 필요해 아직 연동되지 않았습니다.</p>
      </section>

      <div role="group" aria-label="보기 선택" className="chip-row mb-3">
        <Pill on={mode === 'novel'} onClick={() => setMode('novel')}>FDA 신약 승인</Pill>
        <Pill on={mode === 'pipe'} onClick={() => setMode('pipe')}>임상 진행·예정 성분</Pill>
      </div>

      {mode === 'novel' ? (
        <>
          <div className="relative mb-3">
            <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mut"><IconSearch /></span>
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="상표·성분·승인 용도(영문) 일부" aria-label="신약 승인 검색" autoComplete="off" spellCheck={false} className={cx(INPUT_CLS, 'min-h-12 pl-11 pr-12')} />
            {q && <button type="button" aria-label="검색어 지우기" onClick={() => setQ('')} className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-mut hover:text-ink"><IconClose size={18} /></button>}
          </div>
          <div role="group" aria-label="승인 연도" className="chip-row mb-3">
            <Pill on={!year} onClick={() => setYear(0)}>전체</Pill>
            {years.map((y) => <Pill key={y} on={year === y} onClick={() => setYear(year === y ? 0 : y)}>{y}</Pill>)}
          </div>
        </>
      ) : (
        <>
          <div role="group" aria-label="임상 조건" className="chip-row mb-2">
            <Pill on={pf === 'p3'} onClick={() => setPf('p3')}>3상 진행·예정</Pill>
            <Pill on={pf === 'p2'} onClick={() => setPf('p2')}>2상 진행·예정</Pill>
            <Pill on={pf === 'nyr'} onClick={() => setPf('nyr')}>모집 예정(시작 전)</Pill>
            <Pill on={pf === 'recent'} onClick={() => setPf('recent')}>최근 12개월 이후 시작</Pill>
            <Pill on={pf === 'all'} onClick={() => setPf('all')}>진행·예정 전체</Pill>
          </div>
          <div className="mb-3 grid gap-x-4 sm:grid-cols-2">
            <label className="flex min-h-11 items-center gap-2 text-small text-ink">
              <input type="checkbox" checked={ind} onChange={(e) => setInd(e.target.checked)} className="h-5 w-5 flex-none" /> 산업체 주관 시험이 있는 성분만
            </label>
            <label className="flex min-h-11 items-center gap-2 text-small text-ink">
              <input type="checkbox" checked={common} onChange={(e) => setCommon(e.target.checked)} className="h-5 w-5 flex-none" /> 흔히 쓰는 약(등록 1,000건 이상) 제외
            </label>
            <label className="flex min-h-11 items-center gap-2 text-small text-ink">
              <input type="checkbox" checked={noKr} onChange={(e) => setNoKr(e.target.checked)} className="h-5 w-5 flex-none" /> 국내 등재 성분 제외(새 성분 중심)
            </label>
          </div>
          <p className="mb-2 text-small text-mut">FDA 신약 승인 성분과 이 사전의 성분 중, 진행 중이거나 모집 예정인 등록 시험이 있는 것입니다. 최근에 시작(예정)한 순서로 보여 드립니다. 오래된 약의 새 적응증 시험도 포함됩니다. 생리식염수·리도카인처럼 비교약·병용약으로 자주 쓰이는 성분은 시험이 아주 많아 처음에는 뺐습니다.</p>
        </>
      )}

      <div role="status" aria-live="polite" className="sr-only">{`${nf(list.length)}건`}</div>
      {list.length === 0 ? (
        <Card className="text-small text-mut">조건에 맞는 항목이 없습니다. 없다는 뜻이 아니라 <b className="text-ink">확인이 필요하다</b>는 뜻입니다.</Card>
      ) : (
        <section aria-labelledby="nlist-title">
          <h2 id="nlist-title" className="mb-2 text-body-bold">{mode === 'novel' ? '신약 승인' : '임상 진행·예정'} <span className="font-normal text-mut">{nf(list.length)}</span></h2>
          <ul className="grid gap-2">
            {mode === 'novel' ? shown.map((x) => <NovelCard key={`${x.y}-${x.no}`} x={x} onSelect={onSelect} />) : shown.map((r) => <PipeCard key={r.k} r={r} onSelect={onSelect} />)}
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
        출처: <ExtLink href="https://www.fda.gov/drugs/novel-drug-approvals-fda">FDA CDER 신약 승인표</ExtLink> · <ExtLink href="https://clinicaltrials.gov/">ClinicalTrials.gov(NLM)</ExtLink> · <ExtLink href="https://pubchem.ncbi.nlm.nih.gov/">PubChem(NCBI/NLM)</ExtLink>. {M.notice}
      </p>
    </>
  );
}
