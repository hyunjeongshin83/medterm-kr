import { useMemo, useState } from 'react';
import { mt } from '../lib/mt.js';
import { SAMPLES, SEV, VERDICT } from '../lib/samples.js';
import { Badge, Btn, Card, INPUT_CLS, SrOnly, cx } from './ui.jsx';

const VERDICT_CLS = {
  inconsistent: 'bg-err-bg text-err',
  needs_review: 'bg-warn-bg text-warn',
  no_conflict_found: 'bg-ok-bg text-ok',
};
const SEG_CLS = {
  error: 'border-b-2 border-err bg-err-bg',
  warn: 'border-b-2 border-warn bg-warn-bg',
  info: 'border-b-2 border-dotted border-info bg-info-bg',
  ok: 'bg-ok-bg',
};
const SEV_CLS = { error: 'text-err', warn: 'text-warn', info: 'text-info', ok: 'text-ok' };

/** 검증 결과(판정 문구 · 개수 · 표시된 본문 · 근거 표). 답변 검증 탭과 근거 기반 질의 탭이 함께 쓴다. */
export function VerifyResult({ text, result }) {
  const segs = useMemo(() => mt.annotate(text, result.findings), [text, result]);
  const rows = result.findings.filter((f) => f.severity !== 'ok');
  const s = result.summary;
  return (
    <div className="mt-3">
      <div role="status" className={cx('rounded-md px-3.5 py-2.5 text-body-bold', VERDICT_CLS[s.verdict])}>{VERDICT[s.verdict]}</div>
      <div className="my-2.5 flex flex-wrap gap-2">
        {[['error', 'err'], ['warn', 'draft'], ['info', 'info'], ['ok', 'ok']].map(([k, tone]) => (
          <Badge key={k} tone={tone} className="px-2.5 py-[3px] text-small">{SEV[k]} {s[k]}</Badge>
        ))}
      </div>
      <p className="ann-box whitespace-pre-wrap rounded-md border border-line bg-surface p-3 leading-8" aria-label="검증 결과가 표시된 답변">
        {segs.map((seg, i) =>
          seg.severity ? (
            <span key={i} title={seg.findings.map((f) => f.message).join('\n')} className={cx('rounded-[3px] py-px', SEG_CLS[seg.severity])}>
              <SrOnly>[{SEV[seg.severity]}] </SrOnly>{seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </p>
      {rows.length > 0 && (
        <Card className="mt-3 overflow-x-auto">
          <table className="w-full text-base">
            <thead>
              <tr className="text-left text-small-bold text-mut">
                <th scope="col" className="whitespace-nowrap border-b border-line px-2 py-1.5">판정</th>
                <th scope="col" className="border-b border-line px-2 py-1.5">구간</th>
                <th scope="col" className="border-b border-line px-2 py-1.5">근거/설명</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f, i) => (
                <tr key={i} className="align-top">
                  <td className={cx('whitespace-nowrap border-b border-line px-2 py-1.5 text-caption-medium font-bold', SEV_CLS[f.severity])}>{SEV[f.severity]}</td>
                  <td className="break-words border-b border-line px-2 py-1.5">{f.text}</td>
                  <td className="break-words border-b border-line px-2 py-1.5">{f.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

export function VerifyTab() {
  const [text, setText] = useState('');
  const [sample, setSample] = useState('');
  const [shown, setShown] = useState(null); // { text, result }

  const run = (t) => setShown({ text: t, result: mt.verify(t) });
  const onSample = (e) => {
    const i = e.target.value;
    setSample(i);
    if (i === '') return;
    const t = SAMPLES[Number(i)][1];
    setText(t);
    run(t);
  };

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-2.5">
          <select value={sample} onChange={onSample} aria-label="샘플 답변" className={cx(INPUT_CLS, 'min-w-0 flex-1 basis-60')}>
            <option value="">샘플 답변 불러오기…</option>
            {SAMPLES.map((s, i) => <option key={i} value={i}>{s[0]}</option>)}
          </select>
          <Btn onClick={() => run(text)} disabled={!text.trim()}>검증</Btn>
        </div>
        <textarea
          id="vtext"
          value={text}
          onChange={(e) => { setText(e.target.value); setSample(''); }}
          placeholder="LLM이 생성한 약 관련 답변을 붙여넣으세요."
          aria-label="검증할 답변"
          className={cx(INPUT_CLS, 'mt-2.5 min-h-[130px] resize-y')}
        />
      </Card>
      <div id="vresult" aria-live="polite">
        {shown ? <VerifyResult text={shown.text} result={shown.result} /> : (
          <p className="px-1 text-small text-mut">샘플을 고르거나 답변을 붙여넣고 “검증”을 누르면, 사전과 대조한 결과가 여기에 표시됩니다. “불일치 없음”은 정확하다는 뜻이 아닙니다.</p>
        )}
      </div>
    </>
  );
}
