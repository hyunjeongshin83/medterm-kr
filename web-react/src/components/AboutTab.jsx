import { BENCH, DATA, META, XMETA, layers, mt } from '../lib/mt.js';
import { LITE } from '../lib/edition.js';
import { Badge, Card } from './ui.jsx';
import { nf } from './ExtParts.jsx';
import { ExtLink } from './LayerParts.jsx';

const pct = (o) => `${o.k}/${o.n} (${Math.round((o.k / o.n) * 100)}%, 95% CI ${Math.round(o.lo * 100)}–${Math.round(o.hi * 100)}%)`;
const sum = (d, prefix) => {
  let k = 0;
  let n = 0;
  Object.entries(d).forEach(([c, o]) => { if (c.startsWith(prefix)) { k += o.k; n += o.n; } });
  return { k, n };
};

function Facts({ rows }) {
  return (
    <dl>
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line py-1.5 last:border-b-0">
          <dt className="min-w-0 flex-1 basis-56 text-small text-mut">{k}</dt>
          <dd className="text-base font-bold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, id, children }) {
  return (
    <Card id={id} tabIndex={id ? -1 : undefined} className={id ? 'focus:outline-none' : undefined}>
      <h3 className="mb-2 text-heading-m">{title}</h3>
      {children}
    </Card>
  );
}

const NX = mt.extList.length;
const LIMITS = [
  `“사전에 없음”은 환각의 증거가 아니라 확인 필요 신호입니다(핵심 수록 성분 ${META.counts.VTM}개${NX ? ` + 확장 수록 ${nf(NX)}개` : ''}).`,
  '“불일치 없음”은 사전의 범위에서 모순이 없다는 뜻이며 정확하다는 뜻이 아닙니다.',
  '“근거 기반 질의”의 질의문과 LLM 답변은 리서치용입니다. 사전 근거를 붙여도 LLM은 틀릴 수 있으며, 임상 판단과 복약 안내에는 쓰지 않습니다.',
  '단위용량 검사는 “미국 RxNorm에 있는 단위 규격인가”만 봅니다. 적정 용량과 안전성 판단이 아닙니다.',
  '한글 성분명·계열명·상품명은 수기 초안이며 약사 검수와 MFDS 대조가 필요합니다.',
  ...(NX ? ['확장 수록의 한글 이름·상품명·국내 등재 현황은 공개 자료에서 자동으로 뽑은 후보로, 약사 검수 전입니다(아래 “확장 수록” 참고).'] : []),
  '상호작용, 금기, 병용, 용법 같은 임상 내용은 다루지 않습니다(MFDS DUR 등 별도 근거 필요).',
  'ATC 코드는 성분당 여러 개일 수 있어 일치 여부를 “어느 하나와 일치”로 판단합니다.',
  LITE
    ? 'SNOMED CT ID와 ATC 영문 분류명은 이 공개판에서 뺐습니다. ATC 코드 값은 심평원 약가마스터·Wikidata 자료에서 온 것만 남겼으며, 코드 값의 공개 범위는 아직 결정하지 않았습니다.'
    : 'SNOMED CT ID와 ATC 분류명이 들어 있습니다. 외부에 공개하기 전에 재배포 조건을 확인해야 합니다.',
];

/** 확장 수록(공개 자료 자동 수집 초안)의 건수·등급·출처·한계. 확장 자료가 없으면 그리지 않는다. */
function ExtSection() {
  if (!XMETA) return null;
  const c = XMETA.counts || {};
  const g = c.grades || {};
  const legend = XMETA.grade_legend || {};
  // 심평원 두 파일의 기준일: 데이터 파일(meta.files)에 적힌 값을 그대로 보여 준다(없으면 예전 문구).
  const ymd = (t) => { const m = /_(\d{4})(\d{2})(\d{2})$/.exec(t || ''); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
  const fl = XMETA.files || {};
  const pIng = (fl.hira_ing && fl.hira_ing.portal) || {};
  const pStd = (fl.hira_std && fl.hira_std.portal) || {};
  const dIng = ymd(pIng.title);
  const dStd = (fl.hira_std && fl.hira_std.file_date) || ymd(pStd.title);
  const fileDates = dIng && dStd
    ? `의약품주성분 포털 자료명 ${dIng}${pIng.modified ? `·포털 수정일 ${pIng.modified}` : ''}, 의약품표준코드 파일명 ${dStd}${pStd.modified ? `·포털 수정일 ${pStd.modified}` : ''}`
    : '의약품표준코드 파일명 2026-08-31, 의약품주성분 포털 표기 2025-10-31';
  return (
    <Section title="확장 수록 (공개 자료 자동 수집 · 약사 검수 전)">
      <p className="mb-2 text-small text-mut">핵심 사전(약사 검수 전 초안, 성분 {META.counts.VTM}개)에 더해, 공개 자료를 자동으로 모아 서로 연결한 성분 목록입니다. 사람이 하나씩 확인한 것이 아니라서 ‘초안’으로만 표시합니다.</p>
      <Facts
        rows={[
          ['확장 수록 성분 (핵심과 겹치는 성분 제외)', nf(NX)],
          ['RxNorm과 심평원에 모두 있어 연결된 성분 (핵심 포함)', nf(c.rx_mapped)],
          ['심평원에만 있는 성분 (RxCUI 없음)', nf(c.kr_only)],
          ['RxNorm에만 있는 성분 (심평원과 연결 안 됨)', nf(c.rx_only)],
          ['한글 이름 후보가 있는 성분', nf(c.with_ko)],
          ['상품명 후보가 있는 성분 / 상품명 수', `${nf(c.with_brands)} / ${nf(c.brand_names)}`],
          ['ATC 코드가 있는 성분', nf(c.with_atc)],
          ['심평원 등재 품목(판매 중 표시) / 성분코드', `${nf(c.active_items)} / ${nf(c.hira_codes)}`],
          ['이름이 비슷해 확인이 필요한 항목(자동으로 합치지 않음)', nf(c.with_near)],
          ['제외한 심평원 전용 항목 / 한글명·혼합 한약 제제', `${nf(c.dropped_kr_only)} / ${nf(c.dropped_herbal)}`],
          ['자료 기준', XMETA.built_at],
        ]}
      />
      <h4 className="mb-1 mt-4 text-body-bold">연결 등급</h4>
      <ul className="text-base">
        {Object.keys(legend).map((k) => (
          <li key={k} className="my-1.5 flex flex-wrap items-baseline gap-x-2">
            <Badge tone={k === 'a' ? 'ok' : k === 'c' || k === 'd' ? 'draft' : 'info'}>{k === '-' ? '미연결' : `등급 ${k}`}</Badge>
            <span className="min-w-0 flex-1 basis-60">{legend[k]} <span className="text-mut">· {nf(g[k])}개</span></span>
          </li>
        ))}
      </ul>
      <h4 className="mb-1 mt-4 text-body-bold">출처와 이용 조건</h4>
      <ul className="list-disc pl-5 text-base">
        {(XMETA.sources || []).map((s) => (
          <li key={s.id} className="my-1">
            <b>{s.name}</b> — {s.use}. <Badge tone={s.license_class === 'pending' ? 'draft' : s.license_class === 'open' ? 'ok' : 'info'}>{s.license_tag || s.license}</Badge> <span className="text-mut">{s.license}</span>
          </li>
        ))}
      </ul>
      <h4 className="mb-1 mt-4 text-body-bold">한계</h4>
      <ul className="list-disc pl-5 text-base">
        <li className="my-1">한글 이름은 심평원 품목명과 Wikidata에서 자동으로 뽑은 <b>후보</b>입니다. 같은 성분의 이름이 여러 개 나오거나 아예 없을 수 있습니다(없으면 영문 이름으로 표시하고 ‘확인 필요’).</li>
        <li className="my-1">상품명은 심평원 품목명의 앞부분을 기계적으로 잘라 낸 것이라 틀릴 수 있고, 허가·판매·급여 여부를 뜻하지 않습니다. 여러 성분이 든 복합제의 상품명은 넣지 않았습니다.</li>
        <li className="my-1">국내 등재 현황(품목 수·제형·함량)은 제품 규격일 뿐 용법·용량이 아닙니다. 심평원 ‘등재’는 식약처 ‘허가’와 같은 뜻이 아니며, 심평원 파일의 기준일({fileDates}) 이후의 변경은 담지 못했고, 두 파일의 기준일이 서로 달라 성분 목록과 품목 목록이 어긋나는 곳이 있을 수 있습니다.</li>
        <li className="my-1">확장 수록 성분에는 제형·용량(VMP)·제품(AMP) 단계가 없고, 단위용량 검사도 하지 않습니다. 답변 검증에서는 이름이 일치하면 ‘확장 수록 일치’로만 표시하고, ATC·계열이 다르면 오류가 아니라 <b>경고</b>로 표시합니다(자료 출처가 서로 달라 어긋날 수 있어서).</li>
        <li className="my-1">이름이 비슷하고 ATC 코드가 같은 항목(표기 차이일 수 있음)은 자동으로 합치지 않고 ‘이름이 비슷한 항목’으로만 알립니다. 심평원에만 있는 성분 중 쓸모가 낮은 2,070개와 혼합 한약 제제 27개는 목록에서 뺐습니다(제외 목록은 저장소 data/medterm_ext_dropped.tsv).</li>
        <li className="my-1">ATC 분류명은 WHO 저작물이라 재배포 범위가 정해지지 않았습니다(핵심 사전과 같은 보류 항목). 외부에 공개하기 전에 확인해야 합니다.</li>
      </ul>
    </Section>
  );
}

const dayOf = (t) => (t ? String(t).slice(0, 10) : '기록 없음');

const NOT_LINKED = [
  ['의약품안전나라(nedrug.mfds.go.kr) — 의약품등 제품정보·안전사용정보', '누리집이 자동 수집을 허용하지 않아(robots.txt) 화면을 긁어 오지 않았습니다. 정식 경로는 공공데이터포털의 식약처 의약품 허가정보 OpenAPI(인증키 필요)이며, 키를 넣은 컴퓨터에서 저장소의 tools/fetch_mfds.mjs 로 받도록 준비해 두었습니다(아직 실제로 돌려 보지 않았습니다). 복약·안전사용 정보는 허가정보와 다른 서비스일 수 있어, 어떤 OpenAPI 로 받을 수 있는지는 아직 확인하지 못했습니다.'],
  ['식품안전나라(foodsafetykorea.go.kr) — 건강기능식품·식품안전지식', '같은 이유로 화면 수집은 하지 않았습니다. 공공데이터포털에 식약처 ‘건강기능식품 품목제조 신고사항 현황’(개발·운영 단계 모두 자동승인, JSON·XML)과 ‘건강기능식품 품목제조신고(원재료)’(운영 단계는 심의승인)가 올라와 있어(2026-11-05 확인) 인증키를 받으면 연동할 수 있으나 아직 연동하지 않았습니다. 식품안전지식(누리집 글)은 자료로 받을 수 있는 공개 API 를 확인하지 못했습니다. 숙취해소 제품은 대부분 건강기능식품·일반식품이라 이 사전(허가 의약품)에는 없습니다.'],
  ['약학정보원(health.kr)', '열람용 누리집이며 공개된 API나 내려받기 안내를 찾지 못했습니다. 누리집 고지가 허락 없는 복제·배포·전송·변경·게시를 금하고 있어(2026-11-03 확인) 화면을 긁어 오지 않았고, 이용 문의에 대한 답을 받기 전에는 자료를 가져오지 않습니다. robots.txt는 일반 페이지의 수집을 막지 않지만(/api/·/admin/ 제외, 2026-11-06 확인) 접근을 허락하는 장치가 아니므로 근거로 삼지 않았습니다(아래 “자료를 가져오는 원칙”). 대신 약사가 화면을 열어 놓고 ‘맞다·다르다·모르겠다’만 표시하는 검토 시트를 만들어 두었습니다(저장소 data/review/).'],
  ['의약품 식별표시 사이트(pharm.or.kr)', '의약품 식별표시(낱알식별) 제도 안내·등록·검색 사이트입니다. 운영 기관 표기와 자료 이용 조건·내려받기 안내를 확인하지 못해 연결하지 않았습니다(품목 버튼은 약학정보원으로 이어집니다).'],
  ['개발 중인 신약 후보(비공개 파이프라인)', '공개 등록소(ClinicalTrials.gov)에 등록된 시험만 반영합니다. 등록 전 단계·비공개 개발 정보는 알 수 없습니다.'],
];

/** 추가 자료(최신 승인·임상·화합물 연결 / 국내 제품)의 건수·출처·숫자의 뜻·한계, 그리고 연결하지 못한 자료와 이유. 두 자료 모두 없으면 그리지 않는다. */
function LayersSection() {
  if (!layers || (!layers.hasNew && !layers.hasProducts)) return null;
  const nm = layers.hasNew ? layers.newMeta : null; const pm = layers.hasProducts ? layers.prodMeta : null;
  const nc = (nm && nm.counts) || {}; const pc = (pm && pm.counts) || {};
  const srcs = [...((nm && nm.sources) || []), ...((pm && pm.sources) || [])];
  const stdDate = pm && pm.files && pm.files.hira_std && pm.files.hira_std.file_date;
  const fch = (nm && nm.fetched) || {};
  const ct = nm && nm.ct ? nm.ct : null;
  return (
    <Section title="추가 자료: 최신 승인·임상 · 국내 제품 (공개 자료 자동 수집 · 약사 검수 전)" id="about-layers">
      <p className="mb-2 text-small text-mut">앞의 사전(성분)에 더해, 새 약과 국내 제품을 <b className="text-ink">별도 층</b>으로 얹었습니다. 핵심·확장 사전의 내용은 바꾸지 않았고, 성분 이름이 정확히 같을 때만 이어 붙입니다.</p>
      {nm && (
        <>
          <h4 className="mb-1 mt-3 text-body-bold">최신 승인·임상·화합물 연결</h4>
          <Facts
            rows={[
              ['미국 FDA 신약 승인(2021년~) / 사전 성분과 연결 / 임상 요약이 있는 것', `${nf(nc.novel)} / ${nf(nc.novel_linked)} / ${nf(nc.novel_with_trials)}`],
              ['임상 등록 요약이 있는 성분 이름 (이 중 등록이 많아 최근 시작 1,000건 기준으로 요약한 것)', `${nf(nc.trials)} (${nf(nc.trials_capped)})`],
              ...(nc.trials_kr != null ? [['그 중 시험 장소에 대한민국이 있는 등록이 있는 이름 / 결과가 게시된 등록이 있는 이름', `${nf(nc.trials_kr)} / ${nf(nc.trials_res)}`]] : []),
              ...(ct ? [['ClinicalTrials.gov 데이터 처리일 (수집 시작 ~ 끝)', `${dayOf(ct.data_ts)}${ct.data_ts_end ? ` ~ ${dayOf(ct.data_ts_end)}` : ''}${ct.same === false ? ' (수집하는 동안 바뀜)' : ct.same ? ' (수집하는 동안 같음)' : ''}`]] : []),
              ['화합물(PubChem) 연결 이름 / 제목 정확 일치 · 후보 하나뿐', `${nf(nc.chem)} / ${nf(nc.chem_how && nc.chem_how.exact)} · ${nf(nc.chem_how && nc.chem_how.single)}`],
              ['같은 골격 묶음 / 구조 유사 이웃이 있는 이름', `${nf(nc.skeleton_groups)} / ${nf(nc.sim)}`],
              ...(nc.mplus != null ? [['MedlinePlus 영문 약 정보 링크가 있는 이름 / 조회한 성분 코드(RxCUI)', `${nf(nc.mplus)} / ${nf(nc.mplus_rx)}`]] : []),
              [`자료 받은 날: FDA · 임상 · PubChem${fch.mplus ? ' · MedlinePlus' : ''}`, `${fch.fda || '-'} · ${fch.trials || '-'} · ${fch.chem || '-'}${fch.mplus ? ` · ${fch.mplus}` : ''}`],
            ]}
          />
        </>
      )}
      {pm && (
        <>
          <h4 className="mb-1 mt-4 text-body-bold">국내 제품(품목)</h4>
          <Facts
            rows={[
              ['제품 수 (전문 / 일반)', `${nf(pc.products)} (${nf(pc.rx)} / ${nf(pc.otc)})`],
              ['제약회사 / 성분 구성(일반명코드) / 영문 성분명', `${nf(pc.companies)} / ${nf(pc.codes)} / ${nf(pc.ingredient_names)}`],
              ['성분 구성이 있는 제품 / ATC가 있는 제품', `${nf(pc.with_code)} / ${nf(pc.with_atc)}`],
              ['한약제제로 추정한 제품(이름 규칙)', nf(pc.herbal_guess)],
              ['담지 않은 것(한약재·구분 공란·원료의약품·의약외품)', Object.entries(pc.excluded_products || {}).map(([k, v]) => `${k} ${nf(v)}`).join(' · ')],
              ['자료 기준(심평원 의약품표준코드 파일 기준일)', stdDate || '-'],
            ]}
          />
        </>
      )}

      <h4 className="mb-1 mt-4 text-body-bold">숫자의 뜻</h4>
      <ul className="list-disc pl-5 text-base">
        <li className="my-1"><b>제품 1건</b> = ‘품목기준코드 + 품목명 + 업체’ 한 벌입니다. 같은 품목기준코드를 여러 업체·이름이 함께 쓰는 경우가 있어(코드는 제품을 구별하는 열쇠가 아님) 코드 단위로 센 확장 수록의 ‘품목’ 수{pc.distinct_item_codes ? `(${nf(pc.distinct_item_codes)})` : ''}보다 많습니다.</li>
        <li className="my-1"><b>임상 등록 기록 수</b>는 ClinicalTrials.gov 등록 중 성분 이름이 시험 중재(이름·다른 이름)에 그대로 들어간 것을 센 값입니다(유의어 확장 없음). 코드명(예: HSK3486)이나 다른 철자로만 등록된 시험은 빠질 수 있고, 비교약·병용약으로 쓰인 시험이 섞일 수 있으며, 효능·안전성의 근거가 아닙니다. 등록이 아주 많은 성분은 단계·상태 등을 시작이 가장 최근인 1,000건으로 요약하고 기록 수에 ‘+’를 붙입니다. 미국 정부는 등재된 연구의 안전성·과학성을 검토·승인하지 않습니다.</li>
        <li className="my-1"><b>국내 시행</b>은 시험 장소의 국가가 대한민국인 등록의 수입니다. 시설 이름·연락처는 받지 않았고, 식약처의 임상시험 승인이나 국내 임상연구 등록(CRIS) 기록과는 대조하지 않았습니다. <b>결과 게시</b>는 등록 기록에 결과가 올라와 있는 건수이며, 결과 게시는 일부 연구에만 의무입니다.</li>
        <li className="my-1"><b>MedlinePlus 영문 참고 링크</b>는 성분의 RxNorm 코드(RxCUI)로 미국 국립의학도서관의 MedlinePlus Connect 서비스에 미리 물어서 찾은 영문 약 정보 쪽 주소와 제목입니다. 본문(미국약제사회 ASHP의 저작물)은 옮기지 않았고, 링크를 눌렀을 때만 외부 누리집이 열립니다. 미국 기준 설명이라 국내 허가 사항과 다를 수 있습니다.</li>
        <li className="my-1"><b>화합물 연결</b>은 PubChem 이름 검색에서 제목이 성분 이름과 정확히 같은 화합물(또는 후보가 하나뿐인 경우)만 이은 참고 정보입니다. 같은 골격(InChIKey 앞 14자 일치)과 구조 유사 이웃(2D 유사도 0.9 이상)은 같은 계열·같은 효과·대체 가능을 뜻하지 않습니다.</li>
        <li className="my-1"><b>한약제제(추정)</b>는 제품 이름의 규칙으로 가려낸 표시입니다{pm && pm.herbal_rules ? ` (${Object.values(pm.herbal_rules).length}가지 규칙: 방제명+엑스, 단미·혼합엑스, 괄호 속 방제명, ○○탕 액제 등)` : ''}. 처방 구성(군신좌사)·병명·효능은 이 자료에 없어 약사 확인이 필요합니다.</li>
        <li className="my-1"><b>묶음</b>(감기·소화제·수액 등)은 ATC 분류 앞부분으로 모은 검색 보조이며 복약·구매 추천이 아닙니다. ‘감기’ 같은 증상어는 제품 이름에 거의 없어 묶음으로 연결합니다.</li>
        <li className="my-1"><b>대체 후보</b>는 같은 일반명코드(성분·함량·제형 큰 갈래가 같음)의 다른 제품일 뿐입니다. 약사법 제27조의 대체조제 가능 판정이 아니며, 확인은 약사가 합니다.</li>
        <li className="my-1">FDA 승인은 미국 기준이며 국내 허가·급여를 뜻하지 않습니다. 식약처 허가 반영은 인증키 수집이 필요해 아직 연동되지 않았습니다.</li>
      </ul>

      <h4 className="mb-1 mt-4 text-body-bold">출처와 이용 조건</h4>
      <ul className="list-disc pl-5 text-base">
        {srcs.map((s) => (
          <li key={s.id} className="my-1">
            <b>{s.name}</b> — {s.use}. <Badge tone={s.license_class === 'pending' ? 'draft' : s.license_class === 'open' ? 'ok' : 'info'}>{s.license_tag || s.license}</Badge> <span className="text-mut">{s.license}</span>
            {s.credit && <span className="block text-small text-mut">출처 표기: {s.credit}</span>}
          </li>
        ))}
      </ul>

      {ct && (
        <>
          <h4 className="mb-1 mt-4 text-body-bold">ClinicalTrials.gov 표시와 가공 내용</h4>
          <p className="mb-1 text-small text-mut" data-ct-terms="">
            출처 ‘ClinicalTrials.gov’(미국 국립의학도서관) · 데이터 처리일 {dayOf(ct.data_ts)} · 이 앱이 받은 날 {ct.fetched || '-'}{ct.api ? ` (API ${ct.api})` : ''}.
            이용약관은 출처 표시, 데이터 처리일 표시, 최신 상태 유지, 가공 내용 명시를 요구하므로 아래에 가공 내용을 적었고 최신 값은 원 누리집에서 확인하도록 안내합니다. <ExtLink href={ct.terms}>이용약관</ExtLink> · <ExtLink href={ct.disclaimer}>면책 문구</ExtLink>
          </p>
          <ul className="list-disc pl-5 text-base">
            {(ct.mods || []).map((t) => <li key={t} className="my-1">{t}</li>)}
          </ul>
        </>
      )}

      <h4 className="mb-1 mt-4 text-body-bold">연결하지 못한 자료와 이유</h4>
      <ul className="list-disc pl-5 text-base">
        {NOT_LINKED.map(([k, v]) => <li key={k} className="my-1"><b>{k}</b> — {v}</li>)}
      </ul>
    </Section>
  );
}

/** 약무·제도 층(약사법)의 건수·기준·한계. 층이 없으면 그리지 않는다. */
function LawSection() {
  if (!layers || !layers.hasLaw) return null;
  const m = layers.lawMeta; const c = m.counts || {};
  return (
    <Section title="추가 자료: 약무·제도 용어 (약사법 · 약사 검수 전 초안)" id="about-law">
      <p className="mb-2 text-small text-mut">‘약무·제도’ 탭의 자료입니다. 약사법 본문에서 뽑은 정의 용어·조직·약국과 조제 업무를 <b className="text-ink">법령 원문(짧은 발췌)</b>과 <b className="text-ink">쉬운 풀이(초안)</b>로 나누어 담았고, 핵심·확장 사전과 다른 층의 내용은 바꾸지 않았습니다.</p>
      <Facts
        rows={[
          ['수록 항목 (정의 용어 / 조직·위원회 / 약국·조제 업무 / 제도·정보시스템)', `${nf(c.entries)} (${nf(c.def)} / ${nf(c.org)} / ${nf(c.duty)} / ${nf(c.sys)})`],
          [`시행 예정·개정 예정이 표시된 항목 (시행일 ${m.upcoming_effective})`, nf(c.upcoming)],
          ['기준 자료', `${m.source.name} ${m.source.print}`],
          ['원문 발췌 대조', m.verified || '대조하지 않음'],
          ['쉬운 풀이 대조', m.pl_checked || '대조하지 않음'],
        ]}
      />
      <h4 className="mb-1 mt-3 text-body-bold">한계</h4>
      <ul className="list-disc pl-5 text-base">
        {(m.limits || []).map((t) => <li key={t} className="my-1">{t}</li>)}
      </ul>
    </Section>
  );
}

/** 무엇을 어디까지 대조했는지. 자료와 자료를 맞춰 본 것이며, 약사 자격자의 검수가 아니다(날짜는 대조한 날). */
/* 층이 없는 판(핵심만 등)에서는 그 층에 관한 줄을 그리지 않는다. 약사법·확장·제품 줄은 해당 자료가 있을 때만 나온다. */
function reviewDone() {
  const hasLaw = !!(layers && layers.hasLaw);
  return [
    ['핵심 성분 한글명 32개', '심평원 성분명·위키데이터의 한글 이름과 대조: 30개는 같은 이름, 2개(메트포르민·아토르바스타틴)는 심평원이 염 이름(…염산염·…칼슘수화물)으로 적은 차이입니다.'],
    ['핵심 국내 상품명 28개', '심평원 약가마스터 품목명(허가 취소 제외)과 대조해 28개 모두 확인했습니다. 로섹은 목록에 없어 뺐고, 쿠마딘은 등재된 쿠파린으로 바꿨습니다.'],
    ...(hasLaw ? [[`약사법 쉬운 풀이 ${nf(layers.lawMeta.counts.entries)}개`, '법제처 약사법 출력본(2026-02-07 출력) 본문과 항목별로 대조해 의미가 어긋난 곳은 없었고, 빠진 단서 11곳을 보탰습니다.']] : []),
  ];
}
function reviewStages() {
  const hasLaw = !!(layers && layers.hasLaw);
  return [
    ['1단계 · 자료 대조', '했음', 'ok', `공식 자료끼리 맞춰 본 단계입니다. 성분 한글명과 상품명은 심평원 약가마스터·위키데이터와${hasLaw ? ', 약사법 쉬운 풀이는 법제처 출력본과' : ''} 대조했습니다(2026-11-06). 약학정보원 대조는 아직입니다(이용 허락 또는 사람의 열람이 필요).`],
    ['2단계 · 약사 확인', '아직', 'draft', '약사가 검토 시트에서 항목마다 ‘맞다·다르다·모르겠다’를 표시하는 단계입니다. 확인한 사람의 이름과 날짜가 들어갈 자리입니다.'],
    ['3단계 · 약사 검수 완료', '아직', 'draft', '약사가 책임지고 확인했다는 표시(검수자·날짜)가 붙는 단계입니다. 붙기 전까지 모든 항목은 ‘약사 검수 전 초안’입니다.'],
  ];
}
function reviewTodo() {
  const hasLaw = !!(layers && layers.hasLaw);
  const outside = ['제형 한글명(직역)', '계열명', ...(NX ? [`확장 수록 성분 ${nf(NX)}개의 자동 연결·한글 이름`] : []), ...(layers && layers.hasProducts ? ['제품 계층의 성분 연결'] : [])];
  return [
    '약사 자격자의 검수는 받지 않았습니다. 위 대조는 자료끼리 맞춰 본 것입니다.',
    '약학정보원(health.kr)·약학정보 책과의 대조는 하지 않았습니다. 누리집이 허락 없는 복제·배포를 금하고 있어 자동으로 가져오지 않았고, 이용 문의 답을 받으면 진행합니다. 약사가 직접 화면을 열어 놓고 대조하는 검토 시트를 만들어 두었습니다(저장소 data/review/: 성분 한글명·상품명 60행' + (hasLaw ? ', 약사법 쉬운 풀이 53행' : '') + ').',
    ...(hasLaw ? ['약사법은 국가법령정보센터의 현행 시행본(2026-11-06 확인: 시행 2026-10-08, 법률 제21525호)과 아직 대조하지 못했습니다. 시행령·시행규칙도 수록하지 않았습니다.'] : []),
    '식약처(MFDS) 허가 정보와의 대조는 하지 않았습니다(공식 OpenAPI 인증키가 필요합니다).',
    `이 대조에 들어 있지 않은 것: ${outside.join(', ')}.`,
  ];
}

function ReviewSection() {
  const REVIEW_DONE = reviewDone(); const REVIEW_TODO = reviewTodo();
  return (
    <Section title="검수 상태 (2026-11-06 기준)" id="about-review">
      <p className="mb-2 text-small text-mut">‘약사 검수 전’이라는 표시는 그대로입니다. 검수는 세 단계로 나누어 표시하며 지금은 1단계까지 했습니다. 아래는 공식 자료와 맞춰 본 범위와 아직 하지 못한 일입니다.</p>
      <ol className="mb-3 grid gap-2" data-review-stages="">
        {reviewStages().map(([k, b, tone, d]) => (
          <li key={k} className="rounded-lg border border-line bg-bg px-3 py-2">
            <div className="flex flex-wrap items-center gap-2"><b className="text-ink">{k}</b><Badge tone={tone}>{b}</Badge></div>
            <p className="mt-0.5 text-small text-mut">{d}</p>
          </li>
        ))}
      </ol>
      <h4 className="mb-1 text-body-bold">공식 자료와 대조한 것</h4>
      <dl>
        {REVIEW_DONE.map(([k, v]) => (
          <div key={k} className="border-b border-line py-1.5 last:border-b-0">
            <dt className="text-base font-bold">{k}</dt>
            <dd className="text-base text-mut">{v}</dd>
          </div>
        ))}
      </dl>
      <h4 className="mb-1 mt-3 text-body-bold">아직 하지 못한 것</h4>
      <ul className="list-disc pl-5 text-base">
        {REVIEW_TODO.map((t) => <li key={t} className="my-1">{t}</li>)}
      </ul>
    </Section>
  );
}

/** API가 없는 누리집의 자료를 어떻게 다루는지 — 이 앱이 스스로 정한 원칙(법률 자문이 아님). 근거와 출처는 저장소 docs/API없는_사이트_자료이용_조사.md. */
function GatherSection() {
  return (
    <Section title="자료를 가져오는 원칙 (API가 없는 누리집은 어떻게 하나)" id="about-gather">
      <p className="mb-2 text-small text-mut">법률 자문이 아니라 이 앱이 스스로 정해 둔 원칙입니다. 근거와 출처는 저장소의 조사 문서(docs/API없는_사이트_자료이용_조사.md)에 있습니다.</p>
      <ol className="list-decimal pl-5 text-base">
        <li className="my-1"><b>공식 API·내려받기 파일이 있으면 그것으로 받습니다.</b> 이용 조건을 읽고, 출처와 받은 날(자료의 처리일이 있으면 그 날)을 화면에 적습니다.</li>
        <li className="my-1"><b>API가 없는 누리집은 화면을 긁어 오지 않습니다. 화면이 쓰는 내부 주소(검색 요청 형식)를 알아내 대량으로 호출해 데이터베이스를 파일로 내려받지도 않습니다.</b> 이용약관이 복제·배포를 금하거나(약학정보원) robots.txt가 자동 수집을 막는 곳(의약품안전나라)은 더욱 그렇습니다. robots.txt는 수집 도구에게 보내는 요청이지 접근 허락을 정하는 장치가 아니어서(RFC 9309: “These rules are not a form of access authorization.”) 막혀 있지 않다는 것이 가져가도 된다는 뜻은 아닙니다.</li>
        <li className="my-1"><b>대신 이 순서로 생각합니다.</b> ① 운영 기관에 이용 문의 ② 같은 자료를 내는 공식 API(공공데이터포털 등) ③ 링크만 연결(본문은 옮기지 않음) ④ 사람이 화면을 열어 놓고 대조하되 내용을 복사하지 않음.</li>
        <li className="my-1"><b>법원의 판단은 사건마다 다릅니다.</b> 대법원은 2022. 5. 12. 선고 2021도1533 판결에서, 숙박 앱이 서버와 주고받는 주소와 명령 형식을 알아내 직접 호출하는 수집 프로그램으로 업소 정보를 가져간 사람들의 정보통신망침해·저작권법(데이터베이스제작자 권리) 위반·컴퓨터등장애업무방해 혐의를 무죄로 확정했습니다. 접근을 막는 보호조치가 없었고, 약관은 정보의 이용만 제한했으며, 가져간 것이 데이터베이스의 일부로 공개된 정보였고, 검사가 낸 증거로는 서버 장애를 인정하기 어렵다는 그 사건의 사정에 기댄 판단입니다. 그래서 ‘주소를 알아내 호출하면 괜찮다’거나 ‘데이터베이스 전체를 파일로 받아도 된다’는 뜻으로 읽지 않습니다. 같은 분쟁의 민사에서는 1심과 항소심이 모두 10억 원의 손해배상을 인정했다고 보도됐습니다(확정 여부는 확인하지 못했습니다).</li>
        <li className="my-1"><b>필요한 만큼만 저장합니다.</b> 식별자·제목·링크처럼 사실에 가까운 것만 두고, 저작물인 본문은 옮기지 않습니다(예: MedlinePlus 약 정보 본문은 링크만).</li>
      </ol>
      <p className="mt-2 text-small text-mut">2026-11-06에 확인한 자료에 따른 것입니다. 실제로 자료를 가져오기 전에는 해당 기관의 이용 조건을 다시 확인합니다.</p>
    </Section>
  );
}

const ATT = mt.attribution();
const PS = mt.provenanceStats();

/** 출처 표기와 이용 조건 — 이 사전을 화면·문서·논문 등에 옮겨 쓸 때 함께 적는 문구(core.js attribution())와 출처별 현황. 하단 표기의 "자세히"가 여기로 온다. */
function AttributionSection() {
  const pct = PS && PS.total ? Math.round((PS.pending / PS.total) * 100) : 0;
  return (
    <Section title="출처 표기와 이용 조건" id="about-sources">
      <p className="mb-2 text-small text-mut">이 사전의 내용을 화면·문서·논문 등에 옮겨 쓸 때는 아래 문구를 함께 적습니다. 성분마다의 출처와 이용 조건은 성분 상세의 ‘출처·이용 조건’에 있습니다. 모두 약사 검수 전 초안이며, 법률 검토를 거친 문구가 아닙니다.</p>

      <h4 className="mb-1 mt-3 text-body-bold">미국 국립의학도서관(NLM) — RxNorm</h4>
      <p lang="en" data-nlm-statement="" className="text-base">{ATT.nlm_en}</p>
      <p className="mt-1 text-small text-mut">{ATT.nlm_ko}</p>
      <p className="mt-1 text-small text-mut">NLM 이용 약관(RxNav 이용 약관, 2026-11-04 확인)은 위 문구를 응용 프로그램에 넣도록 요청하고, NLM 이름·로고를 응용 프로그램과 함께 쓰는 것을 금지합니다. 이 사전은 로고를 쓰지 않습니다. 약관의 재배포 범위는 그 페이지에서 확인하지 못했습니다.</p>

      {ATT.kogl && (
        <>
          <h4 className="mb-1 mt-4 text-body-bold">건강보험심사평가원 — 공공누리 제1유형</h4>
          <p data-kogl-statement="" className="text-base">{ATT.kogl}</p>
          <p className="mt-1 text-small text-mut">제1유형은 출처를 표시하면 상업적 이용과 변형이 가능합니다. 가공한 결과는 원 기관이 보증하지 않습니다.</p>
        </>
      )}

      {ATT.wikidata && (
        <>
          <h4 className="mb-1 mt-4 text-body-bold">Wikidata — CC0</h4>
          <p className="text-base">{ATT.wikidata}</p>
        </>
      )}

      {LITE ? (
        <>
          <h4 className="mb-1 mt-4 text-body-bold">이 공개판에서 뺀 자료</h4>
          <p className="text-base">
            SNOMED CT ID(핵심 사전 32개 성분)와 ATC 영문 분류 이름(WHO ATC)은 재배포 조건을 확인하지 못해 뺐습니다. 전체 자료판은 따로 보관하고 있습니다.
            남긴 ATC 코드 값은 심평원 약가마스터(공공누리 제1유형)와 Wikidata(CC0)에서 온 것이며, 코드 값 자체를 공개해도 되는지는 아직 정하지 않았습니다.
            한글명·상품명·약사법 쉬운 풀이는 공식 자료와 대조했으나(범위는 ‘검수 상태’ 참고) 약사 자격자의 검수는 받기 전입니다.
          </p>
        </>
      ) : (
        <>
          <h4 className="mb-1 mt-4 text-body-bold">재배포 조건이 정해지지 않은 자료</h4>
          <p className="text-base">
            ATC 분류(WHO)와 핵심 사전의 SNOMED CT 코드는 재배포 조건을 확인하지 못했습니다. 이 사전을 외부에 공개하기 전에 결정해야 합니다.
            {PS ? ` 확장 수록에서는 ${nf(PS.pending)}개 항목(${pct}%)이 ATC 코드 또는 분류 이름을 가지고 있습니다.` : ''}
          </p>
        </>
      )}

      {PS && (
        <>
          <h4 className="mb-1 mt-4 text-body-bold">확장 수록의 출처별 항목 수</h4>
          <Facts
            rows={[
              ['RxNorm(NLM)에서 온 항목', nf(PS.bySource.R)],
              ['심평원 약가마스터에서 온 항목 (이 중 단일성분 일반명코드가 기록된 항목)', `${nf(PS.bySource.H)} (${nf(PS.withHiraCodes)})`],
              ['Wikidata에서 온 항목', nf(PS.bySource.W)],
              ...(LITE ? [] : [['ATC 코드·분류 이름을 가진 항목 (재배포 조건 미결정)', nf(PS.bySource.A)]]),
              ['출처 식별자·이용 조건 표시가 빠진 항목 (자동 점검)', nf(PS.missing)],
            ]}
          />
          <p className="mt-2 text-small text-mut">기록한 것은 단일성분 일반명코드 전체(9자리)이며, 원자료의 행을 되짚는 용도입니다. 코드 번호의 앞 4자리는 성분 식별자가 아니므로(같은 약이 여러 앞자리를 쓰고, 다른 약이 앞자리를 공유함) 성분을 합치는 열쇠로 쓰지 않습니다. 복합제 행에서만 나오는 성분은 코드 없이 영문 일반명으로 찾습니다.</p>
        </>
      )}
    </Section>
  );
}

export function AboutTab() {
  const m = META;
  const neg = sum(BENCH.dev, 'N_');
  const pos = sum(BENCH.dev, 'E_');
  const h2 = BENCH.heldout2.HELDOUT2_real;
  const drafts = mt.vtms.filter((v) => v.review_status === 'draft').length;

  return (
    <>
      <header className="mb-3.5">
        <h2 className="text-heading-l">수록 데이터와 측정된 한계</h2>
        <p className="mt-1 text-base text-mut">이 사전이 무엇을 담고 있고 어디까지 확인했는지 정리했습니다. 숫자는 모두 이 사전과 실험 파일에서 가져왔습니다.</p>
      </header>

      <Section title="수록 데이터">
        <Facts
          rows={[
            ['성분(VTM)', String(m.counts.VTM)],
            ['제형·용량(VMP)', String(m.counts.VMP)],
            ['제품(AMP, 미국 브랜드)', String(m.counts.AMP)],
            ['ATC 분류 노드', String(Object.keys(DATA.atc).length)],
            ['한글명 약사 검수 전 초안', `${drafts}/${m.counts.VTM}`],
            ['생성일', m.built_at],
            ['RxNav 버전', m.rxnav_version || '-'],
          ]}
        />
        <ul className="mt-2 list-disc pl-5 text-base">
          {m.sources.map((s) => <li key={s} className="my-1">{s}</li>)}
        </ul>
        <p className="mt-2 text-small text-mut">{m.notice}</p>
      </Section>

      <ReviewSection />

      <ExtSection />

      <LayersSection />
      <LawSection />

      <GatherSection />

      <AttributionSection />

      <Section title="검증기 점검 결과 (자동 테스트)">
        <p className="mb-2 text-small text-mut">개발 세트는 이 사전에서 합성한 문장이라 사실상 단위 테스트이며, 실제 LLM 답변의 성능이 아닙니다.</p>
        {NX > 0 && (
          <p className="mb-2 text-small text-mut">
            아래 측정값은 모두 <b className="text-ink">핵심 사전만으로</b> 잰 값입니다(성분 {META.counts.VTM}개). 확장 수록을 켜면 핵심 밖의 실제 약이 사전에 들어와 ‘사전 밖 실존 약물명 탐지’ 같은 항목의 결과가 달라지므로, 확장 수록 상태의 성능은 이 숫자로 말할 수 없습니다.
            같은 문장을 확장 수록으로도 검증해 비교했습니다(저장소 tests/ext_benchmark.js): 정상 문장의 오탐과 코드·계열·용량·철자 오류 탐지는 그대로였고 가짜 이름도 모두 걸러졌습니다(일부는 ‘사전 밖’ 대신 ‘확장 수록 이름과 철자가 비슷함’으로 표시). 달라진 것은 확장 수록에 이름이 있는 실존 약 문장이 더는 ‘사전 밖’으로 걸리지 않게 된 것뿐입니다.
          </p>
        )}
        <Facts
          rows={[
            ['개발 세트 · 정상 문장에서 오탐 없음', `${neg.k}/${neg.n}`],
            ['개발 세트 · 주입 오류 탐지(ATC·RxCUI·계열·용량·철자·가짜 이름)', `${pos.k}/${pos.n}`],
            ['보류 세트 1 · 사전 밖 실존 약물명 탐지(수정 전, 독립)', '27/34 (79%, 95% CI 63–90%)'],
            ['보류 세트 2 · 사전 밖 실존 약물명 탐지(수정 후 새로 평가, 독립)', pct(h2)],
          ]}
        />
        <p className="mt-2 text-base">
          해석: 사전에 수록된 약물의 코드·계열·용량 불일치는 잘 잡지만, 사전에 없는 약물 이름은 어간 규칙만으로 놓치는 경우가 많습니다(수정 후 새로 평가한 보류 세트 2는 {pct(h2)}). 성분 전수 목록(MFDS) 연동이 필요합니다.
        </p>
      </Section>

      <Section title="LLM 답변 파일럿 (104건)">
        <p className="mb-2 text-small text-mut">판정은 비전문가와 판정자 LLM이 했고 약사 판독이 아닙니다. 같은 질문으로 결과를 보고 검증기를 고쳤으므로 독립 평가가 아닙니다.</p>
        <Facts
          rows={[
            ['가짜 이름 8개 · 대체·단정(일반 조건 A)', '2/8'],
            ['가짜 이름 8개 · 대체·단정(근거 주입 B)', '0/8'],
            ['두 조건의 차이(Fisher 정확검정)', 'p = 0.467 (유의하지 않음)'],
            ['사전 밖 실존 약물 12개 · A가 정보 제공', '12/12'],
            ['사전 밖 실존 약물 12개 · B가 “사전에 없음”', '12/12 (1건은 일반 지식을 덧붙임)'],
            ['사전 안 약물 32개 · B가 사전 ID를 인용', '32/32'],
          ]}
        />
        <p className="mt-2 text-base">표본이 작아 근거 주입이 환각을 줄인다는 결론은 아직 낼 수 없습니다. 사전 안의 흔한 약물 32개는 두 조건 모두 오류가 없어(천장 효과) 정확도 이점은 측정되지 않았습니다.</p>
      </Section>

      <Section title="한계">
        <ul className="list-disc pl-5 text-base">
          {LIMITS.map((t) => <li key={t} className="my-1">{t}</li>)}
        </ul>
      </Section>
    </>
  );
}
