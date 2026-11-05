import { useEffect, useMemo, useRef, useState } from 'react';
import { layers, mt, nameOf } from '../lib/mt.js';
import { Badge, Btn, Card, Chip, INPUT_CLS, cx } from './ui.jsx';
import { IconClose, IconSearch } from './icons.jsx';
import { nf } from './ExtParts.jsx';

const PAGE = 30;

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

const permitText = (n) => (n ? `${String(n).slice(0, 4)}.${String(n).slice(4)}` : '-');

/** 제품 한 줄(목록용) */
function ProductRow({ i, on, onOpen }) {
  const p = layers.product(i);
  const comp = layers.compositionOf(i)[0];
  return (
    <button
      type="button"
      onClick={() => onOpen(i)}
      aria-current={on ? 'true' : undefined}
      className={cx('flex w-full flex-col gap-0.5 rounded-xl border p-3 text-left shadow-card hover:border-pri hover:shadow-card-hi', on ? 'border-pri bg-pri-soft' : 'border-line bg-surface')}
    >
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <b className="break-words text-hit-title">{p.name}</b>
        <span className="text-small text-mut">{p.co}</span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge tone={p.kind === 0 ? 'draft' : 'ok'}>{p.kindLabel}</Badge>
        {p.herbal && <Badge tone="info">한약제제(추정)</Badge>}
        {p.special && <Badge tone="info">{p.special}</Badge>}
        {p.atc && <span className="text-small text-mut">ATC {p.atc}</span>}
        {p.spec && <span className="text-small text-mut">· {p.spec}</span>}
      </span>
      {comp && <span className="break-words text-small text-mut">{layers.compText(comp)}{p.codes.length > 1 ? ` 외 함량 ${p.codes.length - 1}종` : ''}</span>}
    </button>
  );
}

function Table({ children }) {
  return (
    <div className="mt-1.5 overflow-hidden rounded-lg border border-line">
      <table className="w-full text-base"><tbody className="[&>tr:last-child>*]:border-b-0">{children}</tbody></table>
    </div>
  );
}
function Row({ th, children }) {
  return (
    <tr className="align-top">
      <th scope="row" className="w-px whitespace-nowrap border-b border-line px-3 py-2 text-left text-small-bold text-mut">{th}</th>
      <td className="break-words border-b border-line px-3 py-2">{children}</td>
    </tr>
  );
}

/** 선택한 제품의 상세: 성분 구성 · ATC · 대체 후보(같은 일반명코드) · 같은 업체 */
function ProductDetail({ i, onClose, onSelectIng, onOpen, onCompany }) {
  const p = layers.product(i);
  const comps = layers.compositionOf(i);
  const alts = layers.alternatives(i, 10);
  const path = layers.atcPath(p.atc);
  const grp = (layers.groups || []).filter((g) => p.groups.includes(g.id));
  const meta = layers.prodMeta || {};
  return (
    <Card id="prod-detail" tabIndex={-1} className="focus:outline-none" aria-label={`${p.name} 상세`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words text-heading-m">{p.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={p.kind === 0 ? 'draft' : 'ok'}>{p.kindLabel}</Badge>
            {p.herbal && <Badge tone="info">한약제제(추정)</Badge>}
            <Badge tone="draft">초안·약사 검수 전</Badge>
          </div>
        </div>
        <button type="button" aria-label="제품 상세 닫기" onClick={onClose} className="flex h-11 w-11 flex-none items-center justify-center rounded-md border border-line text-mut hover:border-pri hover:text-ink"><IconClose size={18} /></button>
      </div>
      <Table>
        <Row th="제약회사"><button type="button" className="text-left text-pri underline" onClick={() => onCompany(p.coIx)}>{p.co}</button> <span className="text-small text-mut">· 이 업체 제품 {nf(layers.productsOfCompany(p.coIx).length)}건 보기</span></Row>
        <Row th="허가">{p.kindLabel} · 허가년월 {permitText(p.permit)}{p.special ? ` · ${p.special}` : ''}</Row>
        {p.spec && <Row th="규격">{p.spec}</Row>}
        <Row th="ATC">{p.atc || <span className="text-mut">없음</span>}{path.length > 0 && <span className="block text-small text-mut">{path.map((x) => `${x.code} ${x.label}`).join(' › ')}</span>}</Row>
        {grp.length > 0 && <Row th="묶음">{grp.map((g) => g.label).join(' · ')} <span className="text-small text-mut">(ATC 기준)</span></Row>}
        <Row th="품목기준코드"><span className="font-mono text-small">{p.key}</span><span className="block text-small text-mut">같은 코드를 여러 업체·이름이 함께 쓸 수 있어 제품 구별 열쇠가 아닙니다.</span></Row>
      </Table>
      {p.herbal && <p className="mt-2 rounded-lg border border-line bg-pri-soft px-3 py-2 text-small text-ink">한약제제는 <b>이름 규칙으로 추정</b>한 표시입니다({(meta.herbal_rules || {})[String(p.herbalRule)] || ''}). 처방 구성(군신좌사)·병명·효능은 이 자료에 없어 약사 확인이 필요합니다.</p>}

      <h4 className="mb-1 mt-5 text-body-bold">성분 구성 <span className="text-small font-normal text-mut">심평원 주성분 목록(영문 일반명)</span></h4>
      {comps.length === 0 ? (
        <p className="text-small text-mut">이 제품은 주성분 목록에 성분명코드가 없어 성분 구성을 보여 줄 수 없습니다(한약제제·일부 일반의약품은 코드가 없음). 품목명에 적힌 성분을 확인하세요.</p>
      ) : comps.map((c) => (
        <div key={c.code} className="mb-2 rounded-lg border border-line bg-surface px-3 py-2">
          <div className="mb-1 text-small text-mut">성분명코드 <span className="font-mono">{c.code}</span> · {c.form || '제형 미상'}</div>
          <ul className="grid gap-1">
            {c.rows.map((r, k) => (
              <li key={k} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small">
                <b className="text-ink">{r.name}</b><span className="text-mut">{r.strength}{r.unit ? ` ${r.unit}` : ''}</span>
                {r.ent && mt.anyById(r.ent) && <Btn variant="quiet" className="!min-h-9 !px-2.5 !py-1 !text-small" onClick={() => onSelectIng(r.ent)}>사전 보기: {nameOf(mt.anyById(r.ent))}</Btn>}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {alts.map((a) => (
        <div key={a.code}>
          <h4 className="mb-1 mt-5 text-body-bold">대체 후보 <span className="text-small font-normal text-mut">같은 성분명코드 {a.code} · {a.text}</span></h4>
          {a.total === 0 ? <p className="text-small text-mut">같은 성분명코드의 다른 제품이 없습니다.</p> : (
            <>
              <p className="mb-1.5 text-small text-mut">{nf(a.total)}건 · 업체 {nf(a.companies)}곳. 성분·함량이 같고 제형 큰 갈래가 같은 제품일 뿐이며, <b className="text-ink">대체조제 가능 판정이 아닙니다</b>(약사법 제27조: 처방 의사의 사전 동의 또는 식약처 인정 요건·통보 절차는 약사가 확인).</p>
              <ul className="grid gap-1">
                {a.items.map((j) => { const q = layers.product(j); return (
                  <li key={j}><button type="button" onClick={() => onOpen(j)} className="min-h-9 text-left text-small text-pri underline coarse:min-h-11"><b>{q.name}</b></button> <span className="text-small text-mut">· {q.co} · {q.kindLabel}</span></li>
                ); })}
              </ul>
              {a.total > a.items.length && <p className="mt-1 text-small text-mut">외 {nf(a.total - a.items.length)}건 — 검색창에 성분명을 넣어 더 볼 수 있습니다.</p>}
            </>
          )}
        </div>
      ))}
    </Card>
  );
}

/** 국내 제품(품목) 탭: 제품명·성분·업체 검색 + 묶음(ATC) · 한약제제(추정) · 전문/일반 · 업체 필터 */
export function ProductTab({ onSelect, seed }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState(null);
  const [group, setGroup] = useState('');
  const [herbal, setHerbal] = useState(false);
  const [co, setCo] = useState(null);
  const [limit, setLimit] = useState(PAGE);
  const [sel, setSel] = useState(null);
  const [coQ, setCoQ] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { if (seed && seed.tab === 'product') { setQ(seed.q || ''); setSel(null); setLimit(PAGE); } }, [seed]);
  useEffect(() => { setLimit(PAGE); }, [q, kind, group, herbal, co]);

  const hints = useMemo(() => layers.hints(q), [q]);
  const direct = useMemo(() => layers.searchProducts({ q, kind, group, herbal, co, limit: 100000 }), [q, kind, group, herbal, co]);
  // '감기'처럼 제품 이름에 없는 증상어: 이름 일치가 없으면 관련 묶음(ATC) 전체를 대신 보여 준다(묶음 칩을 눌러 좁힐 수 있다).
  const viaSymptom = direct.total === 0 && hints.groups.length > 0 && !group;
  const bySymptom = useMemo(() => (viaSymptom ? layers.searchProducts({ q: '', kind, group: hints.groups.map((g) => g.id), herbal, co, limit: 100000 }) : null), [viaSymptom, hints, kind, herbal, co]);
  const res = bySymptom || direct;
  const filtered = group || herbal || kind != null || co != null;
  const asked = q.trim().length > 0 || filtered;
  const shown = res.items.slice(0, limit);
  const cos = useMemo(() => (coQ.trim().length >= 1 ? layers.companies({ q: coQ }).slice(0, 8) : layers.companies().slice(0, 8)), [coQ]);
  const coName = co != null ? layers.prods.co[co] : '';
  const M = layers.prodMeta; const C = M.counts;

  const open = (i) => { setSel(i); setTimeout(() => { const el = document.getElementById('prod-detail'); if (el) { el.scrollIntoView({ block: 'nearest' }); el.focus({ preventScroll: true }); } }, 0); };
  const pickCompany = (ix) => { setCo(ix); setSel(null); setCoQ(''); };
  const reset = () => { setQ(''); setKind(null); setGroup(''); setHerbal(false); setCo(null); setSel(null); inputRef.current?.focus(); };

  return (
    <>
      <section aria-labelledby="prod-title" className="relative mb-4 overflow-hidden rounded-xl border border-line bg-pri-soft p-5 shadow-card lt-tree:p-4">
        <h2 id="prod-title" className="text-heading-l text-ink">국내 제품(품목)에서 찾으세요</h2>
        <p className="mt-1 text-small text-mut">
          제품 {nf(C.products)}건(전문 {nf(C.rx)} · 일반 {nf(C.otc)}) · 제약회사 {nf(C.companies)}곳 · 한약제제(추정) {nf(C.herbal_guess)}건. 심평원 의약품표준코드(자료 기준 {(M.files.hira_std || {}).file_date || '-'})로 만든 초안이며 약사 검수 전입니다.
        </p>
        <div className="relative mt-4">
          <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mut"><IconSearch /></span>
          <input
            ref={inputRef}
            id="pq"
            type="text"
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(null); }}
            placeholder="제품·성분·업체·증상 (예: 메카인)"
            aria-label="국내 제품 검색"
            autoComplete="off"
            spellCheck={false}
            className={cx(INPUT_CLS, 'min-h-12 pl-11 pr-12')}
          />
          {q && (
            <button type="button" aria-label="검색어 지우기" onClick={() => { setQ(''); inputRef.current?.focus(); }} className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-mut hover:text-ink"><IconClose size={18} /></button>
          )}
        </div>
      </section>

      <section aria-labelledby="pf-title" className="mb-4">
        <h2 id="pf-title" className="mb-2 text-body-bold">묶음으로 찾기 <span className="text-small font-normal text-mut">ATC 기준 · 한약제제는 이름 규칙 추정</span></h2>
        <div role="group" aria-label="제품 묶음·구분 거르기" className="chip-row">
          {layers.groups.map((g) => <Pill key={g.id} on={group === g.id} title={g.note} onClick={() => setGroup(group === g.id ? '' : g.id)}>{g.label}</Pill>)}
          <Pill on={herbal} title="이름에 방제명·엑스 표기가 있는 제품(추정)" onClick={() => setHerbal(!herbal)}>한약제제(추정)</Pill>
          <Pill on={kind === 0} onClick={() => setKind(kind === 0 ? null : 0)}>전문의약품</Pill>
          <Pill on={kind === 1} onClick={() => setKind(kind === 1 ? null : 1)}>일반의약품</Pill>
        </div>
        {(co != null || filtered) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-small text-mut">
            {co != null && <Chip>업체: {coName}</Chip>}
            <Btn variant="quiet" className="!min-h-9 !px-3 !py-1 !text-small" onClick={reset}>조건 모두 풀기</Btn>
          </div>
        )}
      </section>

      {/* 증상어·안내: 이름에 없는 증상어(감기 등)는 묶음으로, 숙취·링거처럼 허가 제품 이름과 어긋나는 말은 안내로 */}
      {(hints.groups.length > 0 || hints.notes.length > 0) && (
        <Card id="prod-hints" className="!mb-3.5 text-small text-mut">
          {hints.groups.length > 0 && (
            <div>
              <b className="text-ink">‘{q.trim()}’에 맞는 묶음</b>(검색을 돕는 초안이며 복약·구매 추천이 아닙니다):{' '}
              {viaSymptom && <span className="block pb-1">‘{q.trim()}’는 제품 이름에 들어 있지 않아 아래에 이 묶음 전체를 보여 드립니다. 묶음을 눌러 좁히세요.</span>}
              <span className="mt-1 flex flex-wrap gap-2">{hints.groups.map((g) => <Pill key={g.id} on={group === g.id} onClick={() => { setGroup(g.id); setQ(''); }}>{g.label}</Pill>)}</span>
            </div>
          )}
          {hints.notes.map((t) => <p key={t} className="mt-2">{t}</p>)}
        </Card>
      )}

      {sel != null && <ProductDetail i={sel} onClose={() => setSel(null)} onSelectIng={(id) => onSelect(id)} onOpen={open} onCompany={pickCompany} />}

      <div role="status" aria-live="polite" className="sr-only">{asked ? `제품 ${nf(res.total)}건` : ''}</div>

      {asked && res.total === 0 && (
        <Card className="text-small text-mut">조건에 맞는 제품이 없습니다. 없다는 뜻이 아니라 <b className="text-ink">확인이 필요하다</b>는 뜻입니다(자료는 심평원 등재 전문·일반의약품만 담고 한약재·건강기능식품·의약외품은 담지 않으며, 철자가 다를 수 있습니다).</Card>
      )}

      {res.total > 0 && (
        <section aria-labelledby="plist-title">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 id="plist-title" className="text-body-bold">{asked ? '검색 결과' : '제품'} <span className="font-normal text-mut">{nf(res.total)}</span></h2>
            {!asked && <span className="text-small text-mut">검색어나 묶음을 고르면 줄어듭니다</span>}
          </div>
          <ul className="grid gap-2">
            {shown.map((i) => <li key={i}><ProductRow i={i} on={i === sel} onOpen={open} /></li>)}
          </ul>
          {res.total > shown.length && (
            <div className="mt-4 flex flex-col items-center gap-1.5">
              <Btn variant="secondary" size="lg" className="lt-tree:w-full" onClick={() => setLimit((n) => n + PAGE)}>더 보기 ({nf(res.total - shown.length)})</Btn>
              <p className="text-small text-mut">{nf(shown.length)} / {nf(res.total)}건 표시 중</p>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="pco-title" className="mt-7">
        <h2 id="pco-title" className="mb-1 text-body-bold">제약회사로 찾기 <span className="text-small font-normal text-mut">심평원 업체명 기준</span></h2>
        <p className="mb-2 text-small text-mut">업체 이름을 입력하거나 아래 많은 순 목록에서 고르세요. 같은 허가 품목을 여러 업체가 파는 경우는 업체마다 따로 셉니다. 해외 제약사(임상 주관 기관)와의 연결은 성분 상세의 ‘임상시험 현황’에서 보세요.</p>
        <input type="text" value={coQ} onChange={(e) => setCoQ(e.target.value)} placeholder="업체 이름 일부 (예: 종근당)" aria-label="제약회사 찾기" autoComplete="off" spellCheck={false} className={cx(INPUT_CLS, 'mb-2 min-h-12')} />
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {cos.map((c) => (
            <li key={c.ix}>
              <button type="button" onClick={() => pickCompany(c.ix)} aria-pressed={co === c.ix} className={cx('flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-small hover:border-pri', co === c.ix ? 'border-pri bg-pri-soft' : 'border-line bg-surface')}>
                <b className="min-w-0 break-words text-ink">{c.name}</b>
                <span className="flex-none text-mut">{nf(c.total)}건 · 전문 {nf(c.rx)} · 일반 {nf(c.otc)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-small text-mut">{M.notice}</p>
    </>
  );
}
