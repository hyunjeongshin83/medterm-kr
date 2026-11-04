import { useMemo } from 'react';
import { mt } from '../lib/mt.js';
import { Chip, StatusBadge, inertProps } from './ui.jsx';

const AMP_SHOWN = 6;

function Detail({ d }) {
  const v = d.vtm;
  const names = [...(v.alt_ko || []), ...(v.alt_en || [])];
  const forms = Object.keys(d.byForm).sort();
  return (
    <div className="p-1">
      <h3 className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-heading-m">
        <span>{v.label_ko}</span>
        <small className="text-small font-normal text-mut">{v.label_en}</small>
        <StatusBadge v={v} />
      </h3>
      {names.length > 0 && <div className="text-small text-mut">이명: {names.join(', ')}</div>}
      {(v.brands_ko || []).length > 0 && <div className="text-small text-mut">국내 상품명(수기·미검증): {v.brands_ko.join(', ')}</div>}

      <table className="mt-2 w-full text-base">
        <tbody>
          <tr className="align-top">
            <th scope="row" className="w-px whitespace-nowrap border-b border-line px-2 py-1.5 text-left text-small-bold text-mut">식별자</th>
            <td className="break-words border-b border-line px-2 py-1.5">{v.id} · RxCUI {v.rxcui}{v.snomed_ct.length ? ` · SNOMED CT ${v.snomed_ct.join(', ')}` : ''}</td>
          </tr>
          <tr className="align-top">
            <th scope="row" className="w-px whitespace-nowrap border-b border-line px-2 py-1.5 text-left text-small-bold text-mut">출처</th>
            <td className="break-words border-b border-line px-2 py-1.5">RxNorm(NLM) {v.provenance.rxnorm_retrieved} 수집 · 한글명 {v.provenance.ko_label}</td>
          </tr>
        </tbody>
      </table>

      <h4 className="mb-1 mt-3.5 text-body-bold">ATC 분류 경로</h4>
      {d.atc.map((a) => (
        <div key={a.code} className="my-1 flex flex-wrap items-center gap-1.5">
          {a.path.map((p, i) => (
            <span key={p.code} className="inline-flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true" className="text-mut">›</span>}
              <Chip title={p.name || ''}>{p.code}{p.name ? ' ' + p.name : ''}</Chip>
            </span>
          ))}
          <span aria-hidden="true" className="text-mut">›</span>
          <Chip leaf>{a.code}</Chip>
        </div>
      ))}
      {!d.atc.length && <div className="text-small text-mut">ATC 코드 없음</div>}

      <h4 className="mb-1 mt-3.5 text-body-bold">계층: VTM → VMP(성분·용량·제형) → AMP(제품) · VMP {d.vmps.length}개</h4>
      <div className="mb-1 text-small text-mut">VMP/AMP는 미국 RxNorm 기준입니다. 국내 허가 제품(MFDS)은 아직 연동되지 않았습니다.</div>
      {forms.map((f, i) => {
        const list = d.byForm[f];
        return (
          <details key={f} open={i === 0} className="my-1">
            <summary className="py-[3px]">
              <b>{f}</b>
              {list[0].form_ko ? <span className="text-mut"> · {list[0].form_ko}</span> : null}
              <span className="text-mut"> ({list.length})</span>
            </summary>
            {list.map((m) => (
              <div key={m.id}>
                <div className="break-words py-[3px] pl-[18px] text-base">
                  {m.strength.raw}{m.release_tech ? ' · ' + m.release_tech : ''}{m.pack_or_duration ? ' · ' + m.pack_or_duration : ''} <span className="text-mut">[{m.id}]</span>
                </div>
                {m.amps.slice(0, AMP_SHOWN).map((a) => (
                  <div key={a.id} className="break-words pl-[38px] text-small text-mut">└ AMP {a.brand_en} [{a.id}] ({a.market})</div>
                ))}
                {m.amps.length > AMP_SHOWN && <div className="pl-[38px] text-small text-mut">└ 외 AMP {m.amps.length - AMP_SHOWN}개</div>}
              </div>
            ))}
          </details>
        );
      })}
    </div>
  );
}

/** 오른쪽 단: 선택한 성분의 상세. 좁은 화면(≤1099px)에서는 오른쪽 서랍. */
export function Inspector({ id, drawerOpen, onClose, closeRef, inert, paneRef }) {
  const d = useMemo(() => (id ? mt.describe(id) : null), [id]);
  return (
    <aside
      id="inspector"
      ref={paneRef}
      tabIndex={-1}
      data-open={drawerOpen}
      className="pane-inspector focus:outline-none"
      {...(drawerOpen ? { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'insp-title' } : { 'aria-labelledby': 'insp-title' })}
      {...inertProps(inert)}
    >
      <div className="flex flex-none items-center justify-between gap-2 border-b border-line py-2.5 pl-3.5 pr-4">
        <h2 id="insp-title" className="text-small-bold text-mut">{d ? `${d.vtm.label_ko} · 상세` : '상세 정보'}</h2>
        <button
          ref={closeRef}
          type="button"
          aria-label="상세 닫기"
          onClick={onClose}
          className="hidden rounded-md border border-line bg-surface px-2.5 py-1.5 text-body font-semibold text-ink hover:border-pri lt-insp:inline-flex"
        >
          ✕ 닫기
        </button>
      </div>
      <div id="detail" className="min-h-0 flex-1 overflow-auto py-3 pl-3 pr-4">
        {d ? <Detail key={id} d={d} /> : <p className="px-2 py-4 text-mut">왼쪽 트리나 검색 결과에서 성분을 선택하면 코드, ATC 경로, 제형·용량·제품 계층이 여기에 표시됩니다.</p>}
      </div>
    </aside>
  );
}
