import { useEffect, useMemo, useRef } from 'react';
import { mt, nameOf } from '../lib/mt.js';
import { Btn, Chip, StatusBadge, inertProps } from './ui.jsx';
import { IconArrow, IconClose } from './icons.jsx';
import { Thumb } from './Thumb.jsx';
import { CoreExtBlock, ExtDetail } from './ExtParts.jsx';
import { LayerBlock } from './LayerParts.jsx';

const AMP_SHOWN = 6;

function Detail({ d, onSelect, onJump }) {
  const v = d.vtm;
  const names = [...(v.alt_ko || []), ...(v.alt_en || [])];
  const forms = Object.keys(d.byForm).sort();
  return (
    <div className="p-1">
      {/* 머리: 사진 자리(썸네일) + 이름 + 상태 */}
      <div className="flex items-start gap-3.5">
        <Thumb v={v} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-heading-m">
            <span>{v.label_ko}</span>
            <small className="text-small font-normal text-mut">{v.label_en}</small>
          </h3>
          <StatusBadge v={v} />
        </div>
      </div>
      {names.length > 0 && <div className="mt-3 text-small text-mut">이명: {names.join(', ')}</div>}
      {(v.brands_ko || []).length > 0 && <div className="mt-1 text-small text-mut">국내 상품명(수기·미검증): {v.brands_ko.join(', ')}</div>}

      <div className="mt-3 overflow-hidden rounded-lg border border-line">
        <table className="w-full text-base">
          <tbody className="[&>tr:last-child>*]:border-b-0">
            <tr className="align-top">
              <th scope="row" className="w-px whitespace-nowrap border-b border-line px-3 py-2 text-left text-small-bold text-mut">식별자</th>
              <td className="break-words border-b border-line px-3 py-2">{v.id} · RxCUI {v.rxcui}{v.snomed_ct.length ? ` · SNOMED CT ${v.snomed_ct.join(', ')}` : ''}</td>
            </tr>
            <tr className="align-top">
              <th scope="row" className="w-px whitespace-nowrap border-b border-line px-3 py-2 text-left text-small-bold text-mut">출처</th>
              <td className="break-words border-b border-line px-3 py-2">RxNorm(NLM) {v.provenance.rxnorm_retrieved} 수집 · 한글명 {v.provenance.ko_label}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h4 className="mb-1.5 mt-5 text-body-bold">ATC 분류 경로</h4>
      {d.atc.map((a) => (
        <ol key={a.code} className="my-2 rounded-lg border border-line bg-surface px-3 py-2.5">
          {a.path.map((p, i) => (
            <li key={p.code} style={{ paddingLeft: i * 14 }} className="flex items-baseline gap-1.5 py-0.5 text-small" title={p.name || undefined}>
              {i > 0 && <span aria-hidden="true" className="flex-none text-mut">└</span>}
              <span className="min-w-0 break-words"><b>{p.code}</b>{p.name ? <span className="text-mut"> {p.name}</span> : null}</span>
            </li>
          ))}
          <li style={{ paddingLeft: a.path.length * 14 }} className="flex items-center gap-1.5 py-0.5">
            {a.path.length > 0 && <span aria-hidden="true" className="flex-none text-mut">└</span>}
            <Chip leaf>{a.code}</Chip>
          </li>
        </ol>
      ))}
      {!d.atc.length && <div className="text-small text-mut">ATC 코드 없음</div>}

      <CoreExtBlock id={v.id} />

      <LayerBlock id={v.id} onSelect={onSelect} onJump={onJump} />

      <h4 className="mb-1 mt-5 text-body-bold">계층: VTM → VMP(성분·용량·제형) → AMP(제품) · VMP {d.vmps.length}개</h4>
      <div className="mb-2 text-small text-mut">VMP/AMP는 미국 RxNorm 기준입니다. 국내 허가 제품(MFDS)은 아직 연동되지 않았습니다.</div>
      {forms.map((f, i) => {
        const list = d.byForm[f];
        return (
          <details key={f} open={i === 0} className="my-1.5 rounded-lg border border-line bg-surface px-3 py-1">
            <summary className="min-h-9 py-1.5 coarse:py-3 lt-tree:py-3">
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

/**
 * 오른쪽 단: 선택한 성분의 상세.
 * 넓은 화면(≥1100px) 오른쪽 고정 단 · 700~1099px 오른쪽 서랍 · 휴대폰(≤699px) 아래에서 올라오는 시트(손잡이 + 둥근 위 모서리).
 * 아래 고정 줄에 주된 행동 버튼(관계 그래프 보기)이 있다(이미 관계 그래프 탭이면 필요 없으므로 숨긴다).
 */
export function Inspector({ id, drawerOpen, onClose, closeRef, inert, paneRef, onOpenGraph, onSelect, onJump, showGraphCta = true }) {
  const d = useMemo(() => (id && mt.byId.has(id) ? mt.describe(id) : null), [id]); // 핵심 사전의 성분
  const dx = useMemo(() => (id && !mt.byId.has(id) ? mt.describeExt(id) : null), [id]); // 확장 수록의 성분
  const bodyRef = useRef(null);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [id]); // 다른 성분을 고르면 위에서부터 보여 준다
  const title = d ? d.vtm.label_ko : dx ? nameOf(dx.ext) : '';
  return (
    // <aside> 는 role="dialog" 를 가질 수 없으므로 <div> 에 역할을 직접 준다: 평소 보조 구역(complementary), 서랍·시트로 열리면 대화상자(dialog).
    <div
      id="inspector"
      ref={paneRef}
      tabIndex={-1}
      data-open={drawerOpen}
      className="pane-inspector focus:outline-none"
      role={drawerOpen ? 'dialog' : 'complementary'}
      aria-modal={drawerOpen ? 'true' : undefined}
      aria-labelledby="insp-title"
      {...inertProps(inert)}
    >
      <div aria-hidden="true" className="mx-auto mt-2 hidden h-1 w-10 flex-none rounded-pill bg-edge opacity-40 lt-tree:block" />
      <div className="flex flex-none items-center justify-between gap-2 border-b border-line py-2.5 pl-3.5 pr-4">
        <h2 id="insp-title" className="text-small-bold text-mut">{d || dx ? `${title} · 상세` : '상세 정보'}</h2>
        <button
          ref={closeRef}
          type="button"
          aria-label="상세 닫기"
          onClick={onClose}
          className="hidden min-h-11 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-body font-semibold text-ink hover:border-pri lt-insp:inline-flex"
        >
          <IconClose size={16} /> 닫기
        </button>
      </div>
      <div id="detail" ref={bodyRef} className="min-h-0 flex-1 overflow-auto py-3 pl-3 pr-4">
        {d ? <Detail key={id} d={d} onSelect={onSelect} onJump={onJump} /> : dx ? <ExtDetail key={id} d={dx} onSelect={onSelect} onJump={onJump} /> : <p className="px-2 py-4 text-mut">왼쪽 트리나 검색 결과에서 성분을 선택하면 코드, ATC 경로, 제형·용량·제품 계층이 여기에 표시됩니다.</p>}
      </div>
      {(d || dx) && showGraphCta && (
        <div className="flex-none border-t border-line bg-surface px-4 py-3">
          <Btn size="lg" className="w-full" onClick={onOpenGraph}>
            관계 그래프 보기 <IconArrow size={18} />
          </Btn>
        </div>
      )}
    </div>
  );
}
