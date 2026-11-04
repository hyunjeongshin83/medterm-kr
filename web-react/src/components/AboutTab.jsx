import { BENCH, DATA, META, mt } from '../lib/mt.js';
import { Card } from './ui.jsx';

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

const LIMITS = [
  `“사전에 없음”은 환각의 증거가 아니라 확인 필요 신호입니다(수록 성분 ${META.counts.VTM}개).`,
  '“불일치 없음”은 사전의 범위에서 모순이 없다는 뜻이며 정확하다는 뜻이 아닙니다.',
  '“근거 기반 질의”의 질의문과 LLM 답변은 리서치용입니다. 사전 근거를 붙여도 LLM은 틀릴 수 있으며, 임상 판단과 복약 안내에는 쓰지 않습니다.',
  '단위용량 검사는 “미국 RxNorm에 있는 단위 규격인가”만 봅니다. 적정 용량과 안전성 판단이 아닙니다.',
  '한글 성분명·계열명·상품명은 수기 초안이며 약사 검수와 MFDS 대조가 필요합니다.',
  '상호작용, 금기, 병용, 용법 같은 임상 내용은 다루지 않습니다(MFDS DUR 등 별도 근거 필요).',
  'ATC 코드는 성분당 여러 개일 수 있어 일치 여부를 “어느 하나와 일치”로 판단합니다.',
  'SNOMED CT ID와 ATC 분류명이 들어 있습니다. 외부에 공개하기 전에 재배포 조건을 확인해야 합니다.',
];

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

      <Section title="검증기 점검 결과 (자동 테스트)">
        <p className="mb-2 text-small text-mut">개발 세트는 이 사전에서 합성한 문장이라 사실상 단위 테스트이며, 실제 LLM 답변의 성능이 아닙니다.</p>
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
