import { useRef, useState } from 'react';
import { mt } from '../lib/mt.js';
import { MOCK_ANSWER, QUESTION_EXAMPLE } from '../lib/samples.js';
import { VerifyResult } from './VerifyTab.jsx';
import { Btn, Card, INPUT_CLS, cx } from './ui.jsx';

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
    setFound({ q, ids, prompt: mt.buildGroundedPrompt(q, ids) });
    setMsg('');
  };
  const promptText = found ? `[system]\n${found.prompt.system}\n\n[user]\n${found.prompt.user}` : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(found.prompt.system + '\n\n' + found.prompt.user);
      setMsg('프롬프트를 복사했습니다.');
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
      <Card>
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
        <p className="mt-2 text-small text-mut">
          예:{' '}
          <button type="button" onClick={() => setQuestion(QUESTION_EXAMPLE)} className="text-left text-pri underline underline-offset-2">{QUESTION_EXAMPLE}</button>
        </p>

        {found && (
          <div className="mt-3" aria-live="polite">
            {!found.ids.length && (
              <p className="text-small text-mut">질문에서 사전 항목을 찾지 못했습니다. 이 경우 LLM에는 “사전에 없어 확인 불가”로 답하도록 지시하는 프롬프트만 생성됩니다.</p>
            )}
            <h3 className="mb-1.5 mt-3 text-body-bold">검색된 사전 항목 ({found.ids.length})</h3>
            <ul>
              {found.ids.map((id) => {
                const v = mt.byId.get(id);
                return (
                  <li key={id} className="mb-2">
                    <button type="button" onClick={() => onSelect(id)} className="block min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2 text-left hover:border-pri">
                      <b>{v.label_ko}</b> <span className="text-small text-mut">{v.label_en} · {id}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <h3 className="mb-1.5 mt-3 text-body-bold">LLM에 전달할 프롬프트</h3>
            <pre ref={preRef} className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-code-bg p-3 font-mono text-code text-code-ink">{promptText}</pre>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <Btn variant="secondary" onClick={copy} className="lt-tree:w-full">프롬프트 복사</Btn>
              <span role="status" className="text-small text-mut">{msg}</span>
            </div>
          </div>
        )}
      </Card>

      {found && (
        <Card>
          <h3 className="mb-1.5 text-body-bold">LLM 답변 검증</h3>
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
            <Btn variant="secondary" onClick={() => { setAnswer(MOCK_ANSWER); setShown(null); }} className="lt-tree:w-full">시연용 답변 넣기(오프라인 데모)</Btn>
          </div>
          {isMock && (
            <p id="mock-note" className="mt-2 rounded-md bg-warn-bg px-3 py-2 text-small text-warn">
              시연용 모의 답변입니다 — 오류를 일부러 넣었으며 실제 LLM 답변이 아닙니다.
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
