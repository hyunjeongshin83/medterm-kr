import { layers, mt, nameOf } from '../lib/mt.js';
import { Badge, Btn, Chip } from './ui.jsx';
import { nf } from './ExtParts.jsx';

/* 최신 승인·임상·화합물 연결(data/medterm_new.json)과 국내 제품(data/medterm_kr_products.json)을 성분 상세·탭에서 같이 쓰는 작은 부품들.
   임상 수치는 ClinicalTrials.gov 등록 건수 요약, 화합물 연결은 구조 정보 기반 참고, 제품 수는 '코드+품목명+업체' 단위다. 모두 약사 검수 전 초안이다. */

export const ExtLink = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center break-all text-pri underline coarse:min-h-11">{children}</a>
);

const STATUS_KO = {
  RECRUITING: '모집 중', NOT_YET_RECRUITING: '모집 예정', ACTIVE_NOT_RECRUITING: '모집 마감·진행', ENROLLING_BY_INVITATION: '초대 등록',
  COMPLETED: '완료', TERMINATED: '중단', WITHDRAWN: '철회', SUSPENDED: '일시 중단', UNKNOWN: '상태 미상',
};
const statusKo = (s) => STATUS_KO[s] || s || '-';

/** 머리글 단계를 놓인 자리에 맞춘다(성분 상세 안은 h4, 카드 목록(h2) 안은 h3). 단계를 건너뛰면 접근성 점검(heading-order)에 걸린다. */
function Head({ level = 4, className, children }) {
  const Tag = `h${level}`;
  return <Tag className={className}>{children}</Tag>;
}
const ymText = (s) => (s ? s.replace('-', '.') : '-');

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

/** 단계·상태 요약 칩 줄 */
export function StageChips({ stage }) {
  if (!stage) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {stage.top ? <Badge tone="ok">가장 앞선 단계 {layers.phaseLabel(stage.top)}</Badge> : <Badge tone="info">단계 정보 없음</Badge>}
      {stage.active > 0 && <Chip>진행 중 {stage.active}</Chip>}
      {stage.planned > 0 && <Chip>모집 예정 {stage.planned}</Chip>}
      {stage.done > 0 && <Chip>완료 {stage.done}</Chip>}
      {stage.stopped > 0 && <Chip>중단·철회 {stage.stopped}</Chip>}
    </span>
  );
}

/** 임상시험 현황(ClinicalTrials.gov 등록 기준 요약) */
export function TrialBlock({ info, title = '임상시험 현황', level = 4 }) {
  const tr = info && info.tr; const stage = info && info.stage;
  return (
    <>
      <Head level={level} className="mb-1 mt-5 text-body-bold">{title} <span className="text-small font-normal text-mut">ClinicalTrials.gov 등록 기준</span></Head>
      {!tr && info && info.trPending ? (
        <p className="text-small text-mut">이 성분 이름은 <b className="text-ink">아직 임상 등록을 조회하지 않았습니다</b>(자료 수집이 이 이름까지 끝나지 않음). 없다는 뜻이 아닙니다.</p>
      ) : !tr ? (
        <p className="text-small text-mut">이 이름이 중재로 들어간 등록 시험을 찾지 못했습니다(코드명·다른 철자로만 등록됐거나 아직 등록 전일 수 있음). 없다는 뜻이 아니라 <b className="text-ink">확인이 필요하다</b>는 뜻입니다.</p>
      ) : (
        <>
          <p className="mb-1.5 text-small text-mut">이름이 시험 중재에 그대로 들어간 등록 건수 요약입니다(유의어 확장 없음 · 비교약·병용약으로 쓰인 시험 포함 가능 · 코드명으로만 등록된 시험은 빠짐). 효능·안전성의 근거가 아닙니다.{tr.cap ? ' 이 성분은 등록이 많아 최근 시작 1,000건까지만 센 값입니다.' : ''}</p>
          <Table>
            <Row th="등록 건수">{nf(tr.n)}건{tr.cap ? '+' : ''}{tr.ind ? <span className="text-mut"> · 산업체 주관 {nf(tr.ind)}건</span> : null}</Row>
            <Row th="단계"><span className="flex flex-wrap gap-1">{stage.phases.map((p) => <Chip key={p.phase}>{layers.phaseLabel(p.phase)} {p.n}</Chip>)}</span></Row>
            <Row th="상태"><StageChips stage={stage} /></Row>
            {tr.spi.length > 0 && <Row th="주관 기관">{tr.spi.join(', ')}<span className="text-small text-mut"> (산업체 상위)</span></Row>}
            {tr.cond.length > 0 && <Row th="대상 질환">{tr.cond.join(', ')}</Row>}
            <Row th="시기">시작(예정 포함) 가장 늦은 달 {ymText(tr.ls)} · 가장 가까운 주요 완료 예정 {ymText(tr.np)}</Row>
          </Table>
          {tr.ex.length > 0 && (
            <>
              <div className="mb-1 mt-3 text-small-bold text-mut">진행·예정 중인 2·3상 시험 예</div>
              <ul className="grid gap-1.5">
                {tr.ex.map((e) => (
                  <li key={e.id} className="rounded-lg border border-line bg-surface px-3 py-2 text-small">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <ExtLink href={`https://clinicaltrials.gov/study/${e.id}`}>{e.id}</ExtLink>
                      <Chip>{layers.phaseLabel(e.ph)}</Chip><Chip>{statusKo(e.st)}</Chip>
                    </div>
                    <div className="mt-0.5 break-words text-ink">{e.t}</div>
                    <div className="text-mut">{e.sp} · 시작 {ymText(e.s)} · 주요 완료 예정 {ymText(e.pc)}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  );
}

/** FDA 신약 승인 */
export function NovelBlock({ novel, level = 4 }) {
  if (!novel || !novel.length) return null;
  return (
    <>
      <Head level={level} className="mb-1 mt-5 text-body-bold">최신 승인 <span className="text-small font-normal text-mut">미국 FDA 신약 승인표</span></Head>
      <ul className="grid gap-1.5">
        {novel.map((x) => (
          <li key={x.d + x.b} className="rounded-lg border border-line bg-surface px-3 py-2 text-small">
            <b className="text-ink">{x.d}</b> · {x.b} <span className="text-mut">({x.g})</span>
            <div className="mt-0.5 break-words text-mut" lang="en">{x.u}</div>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-small text-mut">미국 기준 승인입니다. 국내 허가·급여를 뜻하지 않으며, 승인 용도는 FDA 표기(영문) 그대로입니다. <ExtLink href={`https://www.fda.gov/drugs/novel-drug-approvals-fda/novel-drug-approvals-${novel[0].y}`}>FDA {novel[0].y}년 승인표</ExtLink></p>
    </>
  );
}

/** 화합물 연결: PubChem 식별자와 같은 골격·구조 유사 성분 */
export function ChemBlock({ info, onSelect, level = 4 }) {
  const ch = info && info.ch; if (!ch) return null;
  const { skeleton, similar } = info.links || { skeleton: [], similar: [] };
  const pick = (l) => (l.inDict
    ? <Btn key={l.key} variant="quiet" onClick={() => onSelect && onSelect(l.id)}>{l.label}</Btn>
    : <Chip key={l.key}>{l.label}</Chip>);
  return (
    <>
      <Head level={level} className="mb-1 mt-5 text-body-bold">화합물 연결 <span className="text-small font-normal text-mut">PubChem</span></Head>
      <Table>
        <Row th="PubChem"><ExtLink href={`https://pubchem.ncbi.nlm.nih.gov/compound/${ch.cid}`}>CID {ch.cid}</ExtLink>{ch.how === 'single' ? <span className="text-small text-mut"> · 이름 검색 후보가 하나뿐이어서 연결(제목이 다를 수 있음 — 확인 필요)</span> : null}</Row>
        <Row th="분자식·분자량">{ch.f || '-'} · {ch.mw || '-'}</Row>
        <Row th="InChIKey"><span className="break-all font-mono text-small">{ch.ik}</span></Row>
      </Table>
      {skeleton.length > 0 && (
        <>
          <div className="mb-1 mt-3 text-small-bold text-mut">같은 골격(InChIKey 앞 14자 일치: 입체이성질체 등)</div>
          <div className="flex flex-wrap gap-2">{skeleton.map(pick)}</div>
        </>
      )}
      {similar.length > 0 && (
        <>
          <div className="mb-1 mt-3 text-small-bold text-mut">구조가 매우 비슷한 성분(PubChem 2D 유사도 0.9 이상, 사전에 있는 것만)</div>
          <div className="flex flex-wrap gap-2">{similar.map(pick)}</div>
        </>
      )}
      <p className="mt-2 text-small text-mut">구조 정보만으로 이은 참고 정보입니다. 같은 계열·같은 효과·대체 가능을 뜻하지 않습니다.</p>
    </>
  );
}

/** 이 성분이 든 국내 제품 요약(코드+품목명+업체 단위) */
export function ProductBlock({ id, onJump, level = 4 }) {
  const pe = layers && layers.hasProducts ? layers.productsOfEntity(id, 6) : null;
  if (!pe) return null;
  const v = mt.anyById(id);
  return (
    <>
      <Head level={level} className="mb-1 mt-5 text-body-bold">이 성분이 든 국내 제품 <span className="text-small font-normal text-mut">심평원 의약품표준코드</span></Head>
      <p className="mb-1.5 text-small text-mut">제품 {nf(pe.total)}건(단일 성분 {nf(pe.single)}건) · 업체 {nf(pe.companies)}곳. 제품은 ‘품목기준코드+품목명+업체’ 단위로 센 값이라 위의 ‘품목’ 수(허가 코드 단위)보다 많을 수 있습니다.</p>
      <ul className="grid gap-1">
        {pe.items.map((i) => { const p = layers.product(i); return <li key={i} className="text-small"><b className="text-ink">{p.name}</b> <span className="text-mut">· {p.co} · {p.kindLabel}</span></li>; })}
      </ul>
      {onJump && <div className="mt-2"><Btn variant="secondary" onClick={() => onJump('product', v ? nameOf(v) : '')}>국내 제품 탭에서 모두 보기</Btn></div>}
    </>
  );
}

/** 성분 상세(핵심·확장 공통)에 끼우는 묶음: 최신 승인 → 임상 → 화합물 → 국내 제품 */
export function LayerBlock({ id, onSelect, onJump, level = 4 }) {
  if (!layers) return null;
  const info = layers.hasNew ? layers.forEntity(id) : null;
  const hasProd = layers.hasProducts && layers.productsOfEntity(id, 1);
  if (!info && !hasProd) return null;
  return (
    <div data-layer-block="">
      {info && <NovelBlock novel={info.novel} level={level} />}
      {info && <TrialBlock info={info} level={level} />}
      {info && <ChemBlock info={info} onSelect={onSelect} level={level} />}
      <ProductBlock id={id} onJump={onJump} level={level} />
    </div>
  );
}
