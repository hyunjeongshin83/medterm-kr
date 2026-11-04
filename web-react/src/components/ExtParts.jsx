import { XMETA, mt, nameOf } from '../lib/mt.js';
import { Badge, Btn, Chip, StatusBadge, cx } from './ui.jsx';
import { IconChevron } from './icons.jsx';
import { Thumb } from './Thumb.jsx';

/*
 * 확장 수록(공개 자료로 자동 수집·연결한 초안) 전용 화면 부품.
 * - ExtCard: 검색 결과·분류 목록의 카드(핵심 ResultCard와 같은 모양, "확장·약사 검수 전" 표시)
 * - ExtDetail: 오른쪽 상세 단(이름 후보와 출처 · 식별자 · 연결 등급 · 국내 등재 현황 · ATC · 비슷한 이름 안내)
 * - KrBlock / CoreExtBlock: 심평원 약가마스터에서 모은 "국내 등재 현황"(제품 규격). 핵심 성분 상세에도 덧붙인다.
 * - ProvenanceBlock: 성분마다 "출처·이용 조건"(출처별 식별자·원자료 링크·이용 조건·받은 날). mt.provenance(id) 를 그대로 보여 준다.
 * 자동 수집한 값은 모두 "후보·미검수"로 표시하고, 용법·용량·허가·급여 판단의 근거가 아님을 함께 적는다.
 */

/** 천 단위 쉼표 */
export const nf = (n) => Number(n || 0).toLocaleString('ko-KR');

const SRC_SHORT = { R: 'RxNorm', H: '심평원', W: 'Wikidata', A: 'RxClass ATC명' };
/** 출처 글자(예: "RHW") → "RxNorm · 심평원 · Wikidata" */
export const srcText = (s) => [...String(s || '')].map((c) => SRC_SHORT[c] || c).join(' · ');

/** 한글 이름 후보의 근거: H = 심평원 품목명에서 뽑음(c = 나온 품목 수), W = Wikidata */
const koSrc = (n) => {
  const s = n.s || '';
  const out = [];
  if (s.includes('H')) out.push(n.c ? `심평원 품목명 ${nf(n.c)}건` : '심평원 품목명');
  if (s.includes('W')) out.push('Wikidata');
  return out.join(' · ');
};

/** 카드·상세에 쓰는 한 줄 요약: "심평원 등재 단일성분 102품목 · 복합제 1,131품목" */
export const krLine = (kr) => {
  if (!kr) return '';
  const a = [];
  if (kr.items) a.push(`단일성분 ${nf(kr.items)}품목`);
  if (kr.combo) a.push(`복합제 ${nf(kr.combo)}품목`);
  return a.length ? '심평원 등재 ' + a.join(' · ') : '';
};

const atcText = (v) => {
  const c = v.atc_codes;
  if (c.length) return `ATC ${c.slice(0, 3).join(', ')}${c.length > 3 ? ` 외 ${c.length - 3}` : ''}`;
  if (v.atc_class.length) return `ATC 분류 ${v.atc_class.slice(0, 2).join(', ')}`;
  return 'ATC 없음';
};
const rxText = (v) => (v.rxcui ? `RxCUI ${v.rxcui}` : 'RxCUI 없음(심평원 전용)');

/** 확장 성분 카드 — 핵심 성분 카드(ResultCard)와 같은 틀. */
export function ExtCard({ v, via, on, onSelect }) {
  const line = krLine(v.rec.kr);
  return (
    <button
      type="button"
      data-ext=""
      onClick={() => onSelect(v.id)}
      aria-current={on ? 'true' : undefined}
      className={cx('flex h-full min-h-[4.5rem] w-full items-center gap-3 rounded-xl border p-3 text-left shadow-card hover:border-pri hover:shadow-card-hi', on ? 'border-pri bg-pri-soft' : 'border-line bg-surface')}
    >
      <Thumb v={v} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <b className="break-words text-hit-title">{nameOf(v)}</b>
          {v.label_ko ? <span className="break-words text-small text-mut">{v.label_en}</span> : null}
        </span>
        <span className="mt-0.5 block break-words text-small text-mut">{atcText(v)} · {rxText(v)}</span>
        {line ? <span className="mt-0.5 block text-small text-mut">{line}</span> : null}
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge tone="draft">확장·약사 검수 전</Badge>
          {via ? <Badge>{via}</Badge> : null}
        </span>
      </span>
      <span className="text-mut"><IconChevron /></span>
    </button>
  );
}

/* 상세 단의 작은 표(핵심 상세와 같은 모양) */
function Table({ children }) {
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-line">
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
const Chips = ({ list }) => <span className="flex flex-wrap gap-1">{list.map((s) => <Chip key={s}>{s}</Chip>)}</span>;

/** 국내 등재 현황(심평원 약가마스터): 품목 수 · 투여 경로 · 제형 · 함량(제품 규격). 용법·용량이 아니다. */
export function KrBlock({ kr, title = '국내 등재 현황 (심평원 약가마스터)' }) {
  if (!kr) return null;
  const forms = kr.forms || [];
  const routes = kr.routes || [];
  const st = kr.strengths || [];
  const head = st.slice(0, 8);
  const rest = st.slice(8);
  if (!kr.items && !kr.combo && !kr.codes && !st.length) {
    // 심평원 주성분 목록에는 이름이 있으나 연결된 품목·성분코드가 없는 경우
    return (
      <section aria-label={title} data-kr="">
        <h4 className="mb-1.5 mt-5 text-body-bold">{title}</h4>
        <p className="text-small text-mut">심평원 성분 목록에는 이름이 있으나, 이 자료에서 연결된 등재 품목·제형·함량 정보는 없습니다(확인 필요).</p>
      </section>
    );
  }
  return (
    <section aria-label={title} data-kr="">
      <h4 className="mb-1.5 mt-5 text-body-bold">{title}</h4>
      <Table>
        <Row th="등재 품목">
          {[kr.items ? `단일성분 ${nf(kr.items)}품목` : '', kr.combo ? `복합제 ${nf(kr.combo)}품목` : ''].filter(Boolean).join(' · ') || '확인된 품목 없음'}
          {kr.codes ? <span className="text-mut"> · 성분코드(일반명코드) {nf(kr.codes)}개</span> : null}
        </Row>
        {routes.length > 0 && <Row th="투여 경로"><Chips list={routes} /></Row>}
        {forms.length > 0 && <Row th="제형"><Chips list={forms} /></Row>}
        {st.length > 0 && (
          <Row th="함량">
            <span className="mb-1 block text-small text-mut">{kr.n_strengths > st.length ? `전체 ${nf(kr.n_strengths)}종 중 ${st.length}종만 표시` : `${nf(kr.n_strengths || st.length)}종`}</span>
            <Chips list={head} />
            {rest.length > 0 && (
              <details className="mt-1">
                <summary className="min-h-9 py-1.5 text-small text-pri coarse:py-3.5 lt-tree:py-3.5">나머지 {rest.length}개 보기</summary>
                <Chips list={rest} />
              </details>
            )}
          </Row>
        )}
      </Table>
      <p className="mt-1.5 text-small text-mut">제품 규격 정보이며 용법·용량이 아닙니다. 심평원 ‘등재’는 식약처 ‘허가’와 같은 뜻이 아니고, 자료 시점 이후 바뀌었을 수 있습니다.</p>
    </section>
  );
}

const LIC_TONE = { open: 'ok', attribution: 'info', pending: 'draft' };
const timeText = (s) => [s.asof.length ? `자료 기준 ${s.asof.join(' · ')}` : '', s.fetched.length ? `받은 날 ${s.fetched[s.fetched.length - 1]}` : ''].filter(Boolean).join(' · ');

/** 출처·이용 조건: 이 성분이 어느 공개 자료에서 왔는지(식별자 · 원자료 링크 · 이용 조건 · 받은 날). 확장 수록에 없는 id 면 그리지 않는다. */
export function ProvenanceBlock({ id, title = '출처·이용 조건' }) {
  const p = mt.provenance(id);
  if (!p) return null;
  return (
    <section aria-label={title} data-provenance="">
      <h4 className="mb-1.5 mt-5 text-body-bold">{title}</h4>
      <Table>
        {p.sources.map((s) => (
          <Row key={s.id} th={SRC_SHORT[s.id] || s.id}>
            {s.ids.length > 0 && (
              <span className="block">
                {s.ids.map((x, i) => <span key={x.label}>{i > 0 ? ' · ' : ''}<span className="text-small text-mut">{x.label} </span><b>{x.value}</b></span>)}
              </span>
            )}
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge tone={LIC_TONE[s.license_class] || 'info'}>{s.license_tag}</Badge>
              {timeText(s) ? <span className="text-small text-mut">{timeText(s)}</span> : null}
            </span>
            {s.note ? <span className="mt-1 block text-small text-mut">{s.note}</span> : null}
            {s.links.length > 0 && (
              <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-small">
                {s.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center text-pri underline coarse:min-h-11">{l.label}</a>)}
              </span>
            )}
          </Row>
        ))}
        <Row th="검수 상태"><Badge tone="draft">약사 검수 전 초안</Badge></Row>
      </Table>
      <p className="mt-1.5 text-small text-mut">공개 자료를 가공한 초안이며 원 기관이 보증하지 않습니다. 자료 시점 이후 바뀌었을 수 있습니다. 표기 문구는 화면 맨 아래와 ‘데이터·한계’ 탭에 있습니다.</p>
    </section>
  );
}

/** 핵심 성분(32개) 상세에 덧붙이는 확장 수록 자료: 국내 등재 현황 + 자동 추출한 상품명(미검증) + 출처·이용 조건. */
export function CoreExtBlock({ id }) {
  const x = mt.extOfCore.get(id);
  if (!x || !x.rec.kr) return null;
  const brands = x.brands_ko || [];
  return (
    <div data-core-ext="">
      <KrBlock kr={x.rec.kr} title="국내 등재 현황 (확장 수록 · 자동 수집·약사 검수 전)" />
      {brands.length > 0 && (
        <p className="mt-2 break-words text-small text-mut">
          심평원 품목명에서 자동 추출한 상품명(미검증): {brands.join(', ')} — 품목명 앞부분을 기계적으로 잘라 낸 것이라 틀릴 수 있고, 허가·판매·급여 여부를 뜻하지 않습니다.
        </p>
      )}
      <ProvenanceBlock id={id} title="확장 수록 자료의 출처·이용 조건" />
    </div>
  );
}

const GRADE_TONE = { a: 'ok', b: 'info', c: 'draft', d: 'draft', '-': 'info' };

/** ATC 경로 한 줄 묶음(핵심 상세와 같은 모양) + 이 코드의 근거 출처 */
function AtcPath({ a }) {
  return (
    <ol className="my-2 rounded-lg border border-line bg-surface px-3 py-2.5">
      {a.path.map((p, i) => (
        <li key={p.code} style={{ paddingLeft: i * 14 }} className="flex items-baseline gap-1.5 py-0.5 text-small" title={p.name || undefined}>
          {i > 0 && <span aria-hidden="true" className="flex-none text-mut">└</span>}
          <span className="min-w-0 break-words"><b>{p.code}</b>{p.name ? <span className="text-mut"> {p.name}</span> : null}</span>
        </li>
      ))}
      <li style={{ paddingLeft: a.path.length * 14 }} className="flex flex-wrap items-center gap-1.5 py-0.5">
        {a.path.length > 0 && <span aria-hidden="true" className="flex-none text-mut">└</span>}
        <Chip leaf>{a.code}</Chip>
        {a.src ? <span className="text-small text-mut">코드 근거: {srcText(a.src)}</span> : null}
      </li>
    </ol>
  );
}

/** 확장 성분 상세 단. d = mt.describeExt(id). onSelect(id) = 비슷한 이름 항목으로 이동. */
export function ExtDetail({ d, onSelect }) {
  const v = d.ext;
  const r = d.rec;
  const meta = XMETA || {};
  const hira = meta.sources && meta.sources.find((s) => s.id === 'H');
  const near = r.near || [];
  return (
    <div className="p-1" data-ext-detail="">
      <div className="flex items-start gap-3.5">
        <Thumb v={v} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-heading-m">
            <span className="break-words">{nameOf(v)}</span>
            {v.label_ko ? <small className="break-words text-small font-normal text-mut">{v.label_en}</small> : null}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="info">확장 수록</Badge>
            <StatusBadge v={v} />
          </div>
        </div>
      </div>
      <p className="mt-3 rounded-lg border border-line bg-pri-soft px-3 py-2 text-small text-ink">{meta.notice || '자동 수집·연결한 초안입니다. 약사 검수 전이며, 한글 이름은 후보입니다. 국내 허가·급여·처방 판단의 근거가 아닙니다.'}</p>

      <h4 className="mb-1.5 mt-5 text-body-bold">이름</h4>
      <Table>
        <Row th="한글 이름(후보)">
          {d.names.length ? (
            <ul>
              {d.names.map((n) => (
                <li key={n.n}><b>{n.n}</b> <span className="text-small text-mut">· {koSrc(n)}</span></li>
              ))}
            </ul>
          ) : <span className="text-mut">후보 없음 — 영문 이름으로 표시합니다. 한글 이름은 <b className="text-ink">확인이 필요</b>합니다.</span>}
        </Row>
        <Row th="영문 이름">{v.label_en}{v.alt_en.length ? <span className="text-mut"> · 이명: {v.alt_en.join(', ')}</span> : null}</Row>
        {v.ko_base.length > 0 && <Row th="줄인 형태"><span className="text-small text-mut">염·수화물 표기를 뗀 형태(검색용): </span>{v.ko_base.join(', ')}</Row>}
        {v.ko_alias.length > 0 && <Row th="별칭"><span className="text-small text-mut">Wikidata 별칭(검색용): </span>{v.ko_alias.join(', ')}</Row>}
        {v.brands_ko.length > 0 && (
          <Row th="상품명">
            {v.brands_ko.join(', ')}
            <span className="mt-1 block text-small text-mut">심평원 품목명 앞부분을 기계적으로 잘라 낸 것(미검증)이라 틀릴 수 있고, 허가·판매·급여 여부를 뜻하지 않습니다.</span>
          </Row>
        )}
      </Table>

      <h4 className="mb-1.5 mt-5 text-body-bold">식별자·출처</h4>
      <Table>
        <Row th="식별자">{v.id} · {rxText(v)}{r.wd ? ` · Wikidata ${r.wd}` : ''}</Row>
        <Row th="연결 등급">
          <Badge tone={GRADE_TONE[d.grade] || 'info'}>{d.grade === '-' ? '심평원 미연결' : `연결 등급 ${d.grade}`}</Badge>{' '}
          <span className="text-small text-mut">{d.gradeText}</span>
        </Row>
        <Row th="자료 출처">{srcText(r.src)}</Row>
      </Table>

      <ProvenanceBlock id={v.id} />

      <KrBlock kr={d.kr} />

      <h4 className="mb-1.5 mt-5 text-body-bold">ATC 분류 경로</h4>
      {d.atc.map((a) => <AtcPath key={a.code} a={a} />)}
      {!d.atc.length && <div className="text-small text-mut">성분 단위(7자리) ATC 코드 없음{d.atcClass.length ? '' : ' — 확인이 필요합니다'}</div>}
      {d.atcClass.length > 0 && (
        <div className="mt-2 break-words text-small text-mut">분류 수준 코드: {d.atcClass.map((c) => (c.name ? `${c.code} ${c.name}` : c.code)).join(', ')}</div>
      )}

      {r.cand && (
        <>
          <h4 className="mb-1 mt-5 text-body-bold">연결 후보</h4>
          <p className="text-small text-mut">RxNorm의 <b className="text-ink">{r.cand.name}</b>(RxCUI {r.cand.rxcui})와 이름이 같지만 ATC 코드가 서로 달라 연결에 쓰지 않았습니다(확인 필요).</p>
        </>
      )}

      {near.length > 0 && (
        <>
          <h4 className="mb-1 mt-5 text-body-bold">이름이 비슷한 항목</h4>
          <p className="mb-2 text-small text-mut">ATC 코드가 같고 이름이 비슷한 다른 항목입니다. 같은 성분의 표기 차이일 수 있으나 자동으로 합치지 않았습니다(확인 필요).</p>
          <div className="flex flex-wrap gap-2">
            {near.map((n) => {
              const t = mt.anyById(n.id);
              return (
                <Btn key={n.id} variant="quiet" onClick={() => onSelect && onSelect(n.id)}>
                  {t ? nameOf(t) : n.n}
                  {t && t.label_ko ? <span className="font-normal text-mut"> {t.label_en}</span> : null}
                </Btn>
              );
            })}
          </div>
        </>
      )}

      <p className="mt-5 text-small text-mut">
        자료 기준 {meta.built_at || '-'} · 한글 이름·상품명·국내 등재 현황은 자동 수집 초안으로 약사 검수 전입니다.
        {hira ? ` 심평원 자료는 공공누리 제1유형(출처표시)입니다.` : ''} 출처·한계는 ‘데이터·한계’ 탭에 있습니다.
      </p>
    </div>
  );
}
