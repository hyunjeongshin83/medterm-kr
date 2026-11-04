import { useRef, useState } from 'react';
import { mt, nameOf } from '../lib/mt.js';
import { RESEARCH_FORMAT, buildResearchPrompt } from '../lib/researchPrompt.js';
import { MOCK_ANSWER, QUESTION_EXAMPLE } from '../lib/samples.js';
import { VerifyResult } from './VerifyTab.jsx';
import { Badge, Btn, Card, INPUT_CLS, cx } from './ui.jsx';

/* 빌드 때 정해지는 값: 공유용(Artifact) 화면과 설치형 앱은 외부 호출이 막혀 있어 서버 프록시 입력을 숨긴다. */
/* global __ENABLE_PROXY__, __SURFACE__ */
const PROXY_ON = typeof __ENABLE_PROXY__ !== 'undefined' ? __ENABLE_PROXY__ : true;
// __SURFACE__ ('web' 독립 실행 · 'share' 공유 페이지 · 'app' 설치형 앱)는 빌드 때 상수로 바뀌어, 쓰지 않는 쪽 문구는 번들에서 빠진다.

export function RagTab({ onSelect }) {
  const [question, setQuestion] = useState('');
  const [found, setFound] = useState(null); // { q, ids, prompt }
  const [answer, setAnswer] = useState('');
  const [proxy, setProxy] = useState('');
  const [msg, setMsg] = useState('');
  const [shown, setShown] = useState(null);
  const preRef = useRef(null);

  const find = () => {
    const q = question.trim();
    if (!q) return;
    const ids = mt.retrieve(q, 5);
    setFound({ q, ids, prompt: buildResearchPrompt(q, ids) });
    setMsg('');
  };
  const promptText = found ? `[system]\n${found.prompt.system}\n\n[user]\n${found.prompt.user}` : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(found.prompt.system + '\n\n' + found.prompt.user);
      setMsg('질의문을 복사했습니다.');
    } catch (e) {
      if (preRef.current) window.getSelection()?.selectAllChildren(preRef.current);
      setMsg('복사 권한이 없어 글자만 선택해 두었습니다. Ctrl+C(⌘C)로 복사하세요.');
    }
  };

  const callLlm = async () => {
    const url = proxy.trim();
    if (!url || !found) { setMsg('서버 프록시 URL을 입력하고, 먼저 “사전에서 근거 찾기”를 누르세요.'); return; }
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system: found.prompt.system, user: found.prompt.user }) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const t = j.text || '';
      setAnswer(t);
      setShown({ text: t, result: mt.verify(t) });
      setMsg('');
    } catch (e) {
      setMsg('호출 실패: ' + e.message);
    }
  };

  const isMock = answer === MOCK_ANSWER;

  return (
    <>
      {/* 리서치용 안내: 이 탭의 LLM 질의·답변은 용어·분류·규격 조사에만 쓴다. (role="note" 는 화면 맨 위 안내 하나만 쓴다) */}
      <section aria-labelledby="rag-research-title" id="rag-research" className="mb-3.5 flex items-start gap-3 rounded-xl border border-notice-line bg-notice-bg px-4 py-3 text-notice-ink lt-tree:px-3.5">
        <span className="mt-0.5 inline-block flex-none whitespace-nowrap rounded-pill bg-notice-ink px-2.5 py-0.5 text-caption font-bold text-notice-bg">리서치용</span>
        <div className="min-w-0">
          <h2 id="rag-research-title" className="text-small-bold">LLM 질의는 자료 조사에만 쓰세요</h2>
          <p className="mt-0.5 text-small">
            이 탭이 만드는 질의문과 LLM 답변은 용어·분류·규격을 조사하는 용도입니다. LLM 답변은 틀릴 수 있고, 진단·처방·복용량·복약 안내 같은 임상 판단에는 쓸 수 없습니다. 사전에 없는 내용은 ‘확인 필요’입니다.
          </p>
        </div>
      </section>

      <Card>
        <p className="mb-2.5 text-small text-mut">질문을 쓰면 사전에서 관련 성분을 찾아 근거를 붙인 리서치 질의문을 만듭니다.</p>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            id="rq"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') find(); }}
            placeholder={`질문 예: ${QUESTION_EXAMPLE}`}
            aria-label="질문"
            autoComplete="off"
            className={cx(INPUT_CLS, 'min-w-0 flex-1 basis-60')}
          />
          <Btn onClick={find} disabled={!question.trim()} className="lt-tree:w-full">사전에서 근거 찾기</Btn>
        </div>
        {/* 예시 질문: 누르는 면은 마우스에서 24px 이상, 손가락(터치·휴대폰)에서 44px 이상. */}
        <p className="mt-2 flex items-baseline gap-1.5 text-small text-mut">
          <span className="flex-none">예:</span>
          <button type="button" onClick={() => setQuestion(QUESTION_EXAMPLE)} className="inline-flex min-h-6 items-center text-left text-pri underline underline-offset-2 coarse:min-h-11 lt-tree:min-h-11">{QUESTION_EXAMPLE}</button>
        </p>

        {found && (
          <div className="mt-3" aria-live="polite">
            {!found.ids.length && (
              <p className="text-small text-mut">질문에서 사전 항목을 찾지 못했습니다. 이 경우 질의문의 근거 칸은 비어 있고, LLM은 사전 밖 내용을 출처와 함께 쓰거나 ‘확인 필요’로 남기도록 지시받습니다.</p>
            )}
            <h3 className="mb-1.5 mt-3 text-body-bold">검색된 사전 항목 ({found.ids.length})</h3>
            <ul>
              {found.ids.map((id) => {
                const v = mt.anyById(id); // 핵심 성분 또는 확장 수록 성분
                return (
                  <li key={id} className="mb-2">
                    <button type="button" onClick={() => onSelect(id)} className="block min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2 text-left hover:border-pri">
                      <b>{nameOf(v)}</b> <span className="text-small text-mut">{v.label_ko ? `${v.label_en} · ` : ''}{id}{v.ext ? ' · 확장 수록(자동 수집·약사 검수 전)' : ''}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <h3 className="mb-1 mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-bold">리서치 질의문 <Badge tone="draft">리서치용</Badge></h3>
            <p className="mb-1.5 text-small text-mut">사전에서 찾은 근거를 붙인 조사 의뢰문입니다. 복사해서 LLM에 붙여 넣고, 받은 답변은 아래 ‘LLM 답변 검증’에서 사전과 대조하세요. 형식: {RESEARCH_FORMAT}</p>
            <pre ref={preRef} role="region" tabIndex={0} aria-label="리서치 질의문" className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-code-bg p-3 font-mono text-code text-code-ink">{promptText}</pre>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <Btn variant="secondary" onClick={copy} className="lt-tree:w-full">질의문 복사</Btn>
              <span role="status" className="text-small text-mut">{msg}</span>
            </div>
          </div>
        )}
      </Card>

      {found && (
        <Card>
          <h3 className="mb-1.5 text-body-bold">LLM 답변 검증</h3>
          <p className="mb-2.5 text-small text-mut">받은 답변을 붙여 넣으면 사전과 대조합니다. ‘불일치 없음’은 사전 범위에서 모순이 없다는 뜻일 뿐 정확하다는 뜻이 아니며, 임상 판단의 근거가 되지 않습니다.</p>
          {PROXY_ON ? (
            <>
              <p className="mb-2.5 text-small text-mut">
                브라우저에 API 키를 두지 마세요. 서버(프록시/엣지 함수)의 URL만 입력하면 <code className="rounded-sm bg-info-bg px-1 font-mono">{'{system, user}'}</code>를 POST하고 <code className="rounded-sm bg-info-bg px-1 font-mono">{'{text}'}</code>를 받습니다. 비워 두면 아래 칸에 답변을 직접 붙여넣어 검증합니다.
              </p>
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  id="proxy"
                  type="text"
                  value={proxy}
                  onChange={(e) => setProxy(e.target.value)}
                  placeholder="https://… (서버 프록시 URL, 선택)"
                  aria-label="프록시 URL"
                  className={cx(INPUT_CLS, 'min-w-0 flex-1 basis-60')}
                />
                <Btn variant="secondary" onClick={callLlm} className="lt-tree:w-full">LLM 호출</Btn>
              </div>
            </>
          ) : (
            <p className="mb-2.5 text-small text-mut">
              {typeof __SURFACE__ !== 'undefined' && __SURFACE__ === 'app'
                ? '이 앱에서는 외부 서버 호출이 막혀 있어 LLM 호출 기능을 숨겼습니다. LLM 답변을 아래 칸에 붙여넣어 검증하세요.'
                : '이 공유 화면에서는 외부 서버 호출이 막혀 있어 LLM 호출 기능을 숨겼습니다. LLM 답변을 아래 칸에 붙여넣어 검증하세요.'}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
            <Btn variant="secondary" onClick={() => { setAnswer(MOCK_ANSWER); setShown(null); }} className="lt-tree:w-full">예시 답변 넣기(오류 포함)</Btn>
          </div>
          {isMock && (
            <p id="mock-note" className="mt-2 rounded-md bg-warn-bg px-3 py-2 text-small text-warn">
              예시 답변입니다 — 오류를 일부러 넣었으며 실제 LLM 답변이 아닙니다.
            </p>
          )}
          <textarea
            id="rag-answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="LLM 답변(붙여넣기 또는 호출 결과)"
            aria-label="LLM 답변"
            className={cx(INPUT_CLS, 'mt-2.5 min-h-[130px] resize-y')}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <Btn onClick={() => setShown({ text: answer, result: mt.verify(answer) })} disabled={!answer.trim()} className="lt-tree:w-full">이 답변 검증</Btn>
          </div>
          <div id="rag-verify-out" aria-live="polite">{shown && <VerifyResult text={shown.text} result={shown.result} />}</div>
        </Card>
      )}
    </>
  );
}
