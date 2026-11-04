import { BENCH, DATA, META, XMETA, mt } from '../lib/mt.js';
import { Badge, Card } from './ui.jsx';
import { nf } from './ExtParts.jsx';

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

function Section({ title, children }) {
  return (
    <Card>
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
  'SNOMED CT ID와 ATC 분류명이 들어 있습니다. 외부에 공개하기 전에 재배포 조건을 확인해야 합니다.',
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
            <b>{s.name}</b> — {s.use}. <span className="text-mut">{s.license}</span>
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

      <ExtSection />

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
