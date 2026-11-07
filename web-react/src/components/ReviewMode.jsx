import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { layers } from '../lib/mt.js';
import { scrollToCard } from '../lib/scroll.js';
import {
  MAX, REFS, VERDICTS, availableScopes, buildExport, clearStore, copyText, exportFileName, exportProblems, exportText, getReview, liveAnswers, loadStore, nextTodo, parseImport, saveAsFile, saveStore, sendToIntake, tally,
} from '../lib/review.js';
import { getIntake } from '../lib/reviewIntake.js';
import { Badge, Btn, Card, INPUT_CLS, cx } from './ui.jsx';
import { nf } from './ExtParts.jsx';

/* 약사 검수 참여: 약사 면허가 있는 분이 성분 한글명·상품명(60)과 약사법 쉬운 풀이(53)를 항목마다 ‘맞다·다르다·모르겠다’로 표시하고,
   동의서(개인정보 수집·이용 동의 필수 · 연구 이용 동의 선택)를 읽고 동의한 뒤 ‘확인서’를 운영자에게 전달한다. 운영자가 약사 면허를 따로 확인해 합친 뒤 다음 판의 ‘검수 상태’에 반영된다.
   전달 길은 두 가지다: ① 파일로 저장·복사해 약사가 직접 전달(모든 판) ② ‘MedIT로 보내기’(동의서와 접수 주소가 담긴 독립 실행·설치형 웹앱 빌드만 — 단추를 누를 때 한 번 운영자의 구글 시트로 보낸다).
   동의서가 준비되지 않은 판에서는 내보내지도 보내지도 못한다. 입력은 이 기기의 브라우저에만 저장하고, 누르기 전에는 서버로 아무것도 보내지 않는다. 스스로 ‘검수 완료’를 표시하지 않는다(현황 계산은 빌드가 한다 → build/review_lib.py). */

function Pill({ on, children, ...rest }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cx('inline-flex min-h-11 items-center gap-1.5 rounded-pill border px-3.5 py-1 text-small font-semibold', on ? 'border-pri-fill bg-pri-fill text-on-pri' : 'border-line bg-surface text-ink hover:border-pri')}
      {...rest}
    >
      {children}
    </button>
  );
}

function Check({ id, checked, onChange, children, hint }) {
  return (
    <div className="mt-1">
      <label htmlFor={id} className="flex min-h-11 items-start gap-2.5 py-1.5 text-base text-ink">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none" />
        <span className="min-w-0">{children}</span>
      </label>
      {hint && <p className="-mt-1 pl-[1.875rem] text-small text-mut">{hint}</p>}
    </div>
  );
}

const Step = ({ n, children }) => <h4 className="mb-1.5 mt-5 text-body-bold">{n}. {children}</h4>;

/** 동의서 한 덩어리(필수 · 선택). 글은 reviewConsent.js 가 만들고(빌드가 그 글 전체의 해시로 ‘동의서 판’을 정한다), 여기서는 그대로 보여 준다. */
function ConsentBlock({ b, checked, onChange }) {
  return (
    <section aria-labelledby={`rv-${b.id}-t`} data-review-consent={b.id} className="mt-2 rounded-xl border border-line bg-surface px-3 py-2.5">
      <h5 id={`rv-${b.id}-t`} className="text-base font-bold text-ink">{b.title}</h5>
      <p className="mt-0.5 text-small text-mut">{b.intro}</p>
      <dl className="mt-1.5 grid gap-1.5 text-small">
        {b.items.map(([k, v]) => (
          <div key={k}>
            <dt className="font-bold text-ink">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <Check id={`rv-${b.id}`} checked={checked} onChange={onChange}>{b.check}</Check>
    </section>
  );
}

const NAME_Q = { ing: '이 한글 성분명이 맞습니까?', brand: '이 상품명이 이 성분의 국내 상품명으로 맞습니까?' };
const QUESTION = (scope, it) => (scope === 'law' ? '원문과 비교해 이 쉬운 풀이가 맞습니까?' : NAME_Q[it.k]);

function ItemBody({ it, scope }) {
  if (scope === 'law') {
    const stt = layers && layers.hasLaw ? layers.lawStatus({ st: it.st }) : null;
    return (
      <>
        <p className="text-body"><b>{it.t}</b> <span className="text-small text-mut">· 약사법 {it.a} · {it.g}</span></p>
        {stt && it.st !== 'cur' && <p className="mt-0.5"><Badge tone={stt.tone}>{stt.label}</Badge></p>}
        <p className="mt-1 text-body"><span className="text-small-bold text-mut">쉬운 풀이(초안)</span><br />{it.pl}</p>
        <details className="mt-0.5">
          <summary className="min-h-11 cursor-pointer py-2 text-small font-semibold text-pri">법령 원문 발췌</summary>
          <div className="pb-1">
            {it.ex
              ? <blockquote lang="ko" className="rounded-lg border-l-4 border-pri bg-bg px-3 py-2 text-small leading-relaxed text-ink">{it.ex}</blockquote>
              : <p className="text-small text-mut">이 항목은 원문 발췌를 따로 싣지 않았습니다. 조문을 직접 확인해 주세요.</p>}
            {it.exn && (
              <>
                <p className="mt-2 text-small-bold text-mut">시행 예정·개정 예정판</p>
                <blockquote lang="ko" className="mt-1 rounded-lg border-l-4 border-pri bg-bg px-3 py-2 text-small leading-relaxed text-ink">{it.exn}</blockquote>
              </>
            )}
            <p className="mt-1.5 text-caption text-mut">법제처 약사법 출력본에서 옮긴 짧은 발췌입니다. ‘…’는 중간 생략이니 조문 전체를 열어 비교해 주세요.</p>
          </div>
        </details>
      </>
    );
  }
  return it.k === 'ing' ? (
    <>
      <p className="text-body"><span className="text-mut">성분</span> <b lang="en">{it.en}</b> <span aria-hidden="true">→</span><span className="sr-only"> 의 한글 이름 </span> <b>{it.ko}</b></p>
      {it.alt && it.alt.length > 0 && <p className="text-small text-mut">다른 표기: {it.alt.join(', ')}</p>}
    </>
  ) : (
    <p className="text-body"><span className="text-mut">국내 상품명</span> <b>{it.b}</b> <span className="text-mut">— 성분 {it.ko}(<span lang="en">{it.en}</span>)</span></p>
  );
}

const ItemCard = memo(function ItemCard({ it, scope, a, onVerdict, onNote }) {
  const v = a ? a.v : '';
  return (
    <li id={`rv-${it.id}`} data-review-item={it.id} data-verdict={v} className="rounded-xl border border-line bg-surface p-3 shadow-card">
      <fieldset className="min-w-0">
        <legend className="mb-1 text-small-bold text-mut">{it.no}번 · {QUESTION(scope, it)}</legend>
        <ItemBody it={it} scope={scope} />
        <div className="mt-2 flex flex-wrap gap-2">
          {VERDICTS.map(([k, label]) => (
            <label key={k} htmlFor={`rv-${it.id}-${k}`} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-bg px-3 text-base has-[:checked]:border-pri has-[:checked]:bg-pri-soft has-[:checked]:font-bold">
              <input id={`rv-${it.id}-${k}`} type="radio" name={`rv-${it.id}`} value={k} checked={v === k} onChange={() => onVerdict(it, k)} className="h-5 w-5 flex-none" />
              {label}
            </label>
          ))}
        </div>
        {(v === 'diff' || v === 'unsure') && (
          <div className="mt-2">
            <label htmlFor={`rv-${it.id}-m`} className="block text-small text-mut">{v === 'diff' ? '어떻게 다른가요?' : '무엇이 헷갈리시나요?'} (선택 · {MAX.note}자까지 · 요지만)</label>
            <textarea id={`rv-${it.id}-m`} rows={2} maxLength={MAX.note} value={(a && a.m) || ''} onChange={(e) => onNote(it, e.target.value)} className={cx(INPUT_CLS, 'mt-1')} />
          </div>
        )}
      </fieldset>
    </li>
  );
});

function Work({ R, scopes, onClose }) {
  const [st, setSt] = useState(loadStore);
  const stRef = useRef(st);
  const [saved, setSaved] = useState(true);
  const [filter, setFilter] = useState('all');
  const [probs, setProbs] = useState([]);
  const [exp, setExp] = useState(null);
  const [msg, setMsg] = useState('');
  const [askClear, setAskClear] = useState(false);
  const [paste, setPaste] = useState('');
  const [impMsg, setImpMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState({ kind: '', text: '' });
  const boxRef = useRef(null);
  const lastRef = useRef('');
  const sendingRef = useRef(false);
  const I = getIntake();

  const update = useCallback((fn) => { const next = fn(stRef.current); stRef.current = next; setSt(next); setSaved(saveStore(next)); }, []);
  const sc = scopes.includes(st.scope) ? st.scope : scopes[0];
  const items = R.items[sc];
  const { live, stale } = liveAnswers(R, sc, st.ans[sc]);
  const T = tally(items, live);
  const pct = T.n ? Math.round((T.done / T.n) * 100) : 0;
  const shown = filter === 'issue' ? items.filter((it) => live[it.id] && live[it.id].v !== 'ok') : items;

  const onVerdict = useCallback((it, v) => {
    lastRef.current = it.id;
    update((s) => {
      const m = { ...(s.ans[sc] || {}) };
      const prev = m[it.id];
      m[it.id] = { v, h: it.h, ...(v !== 'ok' && prev && prev.m ? { m: prev.m } : {}) };
      return { ...s, scope: sc, ans: { ...s.ans, [sc]: m } };
    });
  }, [sc, update]);
  const onNote = useCallback((it, text) => update((s) => {
    const m = { ...(s.ans[sc] || {}) };
    const prev = m[it.id];
    if (!prev) return s;
    m[it.id] = { ...prev, m: String(text).slice(0, MAX.note) };
    return { ...s, ans: { ...s.ans, [sc]: m } };
  }), [sc, update]);

  const goNext = () => {
    const it = nextTodo(items, live, lastRef.current);
    if (!it) { setMsg('모든 항목에 판정을 표시했습니다. 아래에서 확인서를 내보내 주세요.'); return; }
    setFilter('all');
    requestAnimationFrame(() => {
      const li = document.getElementById(`rv-${it.id}`);
      if (!li) return;
      li.scrollIntoView({ block: 'center' });
      const r = li.querySelector('input[type="radio"]');
      if (r) r.focus({ preventScroll: true });
      lastRef.current = it.id;
    });
  };

  /** ‘MedIT로 보내기’: 빠진 것이 없으면 확인서를 만들어 운영자의 구글 시트로 한 번 보낸다. 결과는 운영자가 정한 문구로만 알린다(받았다는 답을 못 읽었으면 ‘확인하지 못했다’고 그대로 말한다). */
  const doSend = async () => {
    if (sendingRef.current) return;
    setMsg(''); setExp(null); setSendMsg({ kind: '', text: '' });
    const p = exportProblems(R, sc, st);
    setProbs(p);
    if (p.length) return;
    sendingRef.current = true; setSending(true);
    try {
      const r = await sendToIntake(exportText(buildExport(R, sc, st)));
      setSendMsg({ kind: r.kind, text: r.msg });
    } finally { sendingRef.current = false; setSending(false); }
  };

  const doExport = (how) => {
    setSendMsg({ kind: '', text: '' });
    const p = exportProblems(R, sc, st);
    setProbs(p);
    if (p.length) { setExp(null); setMsg(''); return; }
    const obj = buildExport(R, sc, st);
    const text = exportText(obj);
    const name = exportFileName(sc);
    const memos = Object.values(obj.answers).filter((a) => a.m).length;
    setExp({ text, name, n: Object.keys(obj.answers).length, memos, attested: obj.attested });
    const fail = (t) => { setMsg(t); requestAnimationFrame(() => { const b = boxRef.current; if (b) { b.focus(); b.select(); } }); };
    if (how === 'file') {
      if (saveAsFile(name, text)) setMsg(`파일 저장을 시작했습니다(${name}). 저장 창이 뜨지 않았다면 ‘복사하기’를 누르거나 아래 글을 직접 복사해 주세요.`);
      else fail('파일로 저장하지 못했습니다. ‘복사하기’를 누르거나 아래 글을 모두 선택해 복사해 주세요.');
    } else {
      copyText(text, () => boxRef.current).then((ok) => (ok ? setMsg('복사했습니다. 메시지나 메일에 붙여 넣어 보내 주세요.') : fail('복사하지 못했습니다. 아래 글을 모두 선택해 복사해 주세요.')));
    }
  };

  const doImport = (text) => {
    const r = parseImport(text, R, scopes);
    if (r.err) { setImpMsg(r.err); return; }
    update((s) => ({
      ...s, scope: r.scope,
      rev: { ...s.rev, name: s.rev.name || r.rev.name, org: s.rev.org || r.rev.org, pub: s.rev.name ? s.rev.pub : r.rev.pub },
      refs: [...new Set([...s.refs, ...r.refs])], other: s.other || r.other,
      ans: { ...s.ans, [r.scope]: { ...(s.ans[r.scope] || {}), ...r.answers } },
    }));
    setFilter('all'); setExp(null);
    setImpMsg(`판정 ${nf(r.count)}개를 불러왔습니다(${R.scopes[r.scope].label})` + (r.stale ? ` · 사전 내용이 바뀌어 반영하지 않은 ${nf(r.stale)}개` : '') + (r.unknown ? ` · 알 수 없는 항목 ${nf(r.unknown)}개는 건너뜀` : '') + '. 면허 표시와 동의 표시는 이 화면에서 직접 다시 표시해 주세요.');
    setPaste('');
  };
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX.file) { setImpMsg('파일이 너무 큽니다.'); return; }
    const rd = new FileReader();
    rd.onload = () => doImport(String(rd.result || ''));
    rd.onerror = () => setImpMsg('파일을 읽지 못했습니다. 내용을 복사해 아래 칸에 붙여 넣어 주세요.');
    rd.readAsText(f);
  };
  const doClear = () => { const b = clearStore(); stRef.current = b; setSt(b); setSaved(true); setExp(null); setProbs([]); setMsg(''); setSendMsg({ kind: '', text: '' }); setImpMsg(''); setAskClear(false); setFilter('all'); };

  const hasAny = Object.values(st.ans).some((m) => Object.keys(m).length) || st.rev.name || st.rev.lic;
  const setRev = (k) => (v) => update((s) => ({ ...s, rev: { ...s.rev, [k]: v } }));
  const toggleRef = (k) => (on) => update((s) => ({ ...s, refs: on ? [...new Set([...s.refs, k])] : s.refs.filter((x) => x !== k) }));

  return (
    <div data-review-work="" className="mt-3">
      <Step n={1}>검수자 정보</Step>
      <div className="grid gap-3">
        <div>
          <label htmlFor="rv-name" className="block text-small-bold text-ink">이름 <span className="font-normal text-mut">(필수 · {MAX.name}자까지)</span></label>
          <input id="rv-name" type="text" autoComplete="name" maxLength={MAX.name} value={st.rev.name} onChange={(e) => setRev('name')(e.target.value)} className={cx(INPUT_CLS, 'mt-1')} />
        </div>
        <div>
          <label htmlFor="rv-org" className="block text-small-bold text-ink">소속 <span className="font-normal text-mut">(선택 · {MAX.org}자까지, 예: ○○약국)</span></label>
          <input id="rv-org" type="text" autoComplete="organization" maxLength={MAX.org} value={st.rev.org} onChange={(e) => setRev('org')(e.target.value)} className={cx(INPUT_CLS, 'mt-1')} />
        </div>
      </div>
      <Check id="rv-lic" checked={st.rev.lic} onChange={setRev('lic')} hint="면허번호와 사본은 받지 않습니다. 운영자(MedIT)가 따로 확인합니다.">약사 면허를 가지고 있습니다.</Check>
      <Check id="rv-pub" checked={st.rev.pub} onChange={setRev('pub')} hint="표시하지 않으면 ‘검수 상태’에는 ‘비공개 약사’로만 셉니다.">‘검수 상태’에 제 이름·소속을 공개해도 좋습니다.</Check>

      <Step n={2}>검수 범위와 참고한 자료</Step>
      <div role="group" aria-label="검수 범위" className="flex flex-wrap gap-2">
        {scopes.map((s) => {
          const tl = tally(R.items[s], liveAnswers(R, s, st.ans[s]).live);
          return <Pill key={s} on={sc === s} onClick={() => { update((x) => ({ ...x, scope: s })); setFilter('all'); setExp(null); }}>{R.scopes[s].label} · {nf(tl.done)}/{nf(tl.n)}</Pill>;
        })}
      </div>
      <p className="mt-2 text-small text-mut">
        {sc === 'law'
          ? '법제처 약사법 본문과 비교해 쉬운 풀이가 맞으면 ‘맞다’, 어긋나거나 빠진 단서가 있으면 ‘다르다’로 표시해 주세요. 원문 발췌는 항목마다 펼쳐 볼 수 있습니다.'
          : '한글 성분명과 국내 상품명이 약학정보원·식약처 정보와 같으면 ‘맞다’로 표시해 주세요. 다른 표기가 더 흔하거나 상품명이 잘못 묶였다면 ‘다르다’로 표시하고 메모에 요지를 적어 주세요.'}
      </p>
      <fieldset className="mt-2">
        <legend className="text-small-bold text-ink">참고한 자료 <span className="font-normal text-mut">(해당하는 것 모두 · 어떤 종류를 봤는지만 기록되고 자료의 내용은 남지 않습니다)</span></legend>
        <div className="mt-0.5 flex flex-wrap gap-x-4">
          {REFS.map(([k, label]) => (
            <label key={k} htmlFor={`rv-ref-${k}`} className="flex min-h-11 items-center gap-2 text-base">
              <input id={`rv-ref-${k}`} type="checkbox" checked={st.refs.includes(k)} onChange={(e) => toggleRef(k)(e.target.checked)} className="h-5 w-5 flex-none" />{label}
            </label>
          ))}
        </div>
        {st.refs.includes('other') && (
          <div className="mt-1">
            <label htmlFor="rv-other" className="block text-small text-mut">기타 자료의 이름 ({MAX.other}자까지)</label>
            <input id="rv-other" type="text" maxLength={MAX.other} value={st.other} onChange={(e) => update((s) => ({ ...s, other: e.target.value }))} className={cx(INPUT_CLS, 'mt-1')} />
          </div>
        )}
      </fieldset>

      <Step n={3}>항목마다 판정</Step>
      <p className="text-small text-mut">약학정보원·약학정보 책 등은 약사님이 직접 열어 대조해 주세요. 그 글을 이 화면에 옮겨 적거나 붙여 넣지는 말아 주세요(‘다르다’의 메모도 요지만).</p>
      <div className="mt-2 rounded-xl border border-line bg-bg px-3 py-2">
        <p data-review-progress="" role="status" aria-live="polite" className="text-base">
          <b>판정 {nf(T.done)}/{nf(T.n)}</b> <span className="text-mut">· 맞다 {nf(T.ok)} · 다르다 {nf(T.diff)} · 모르겠다 {nf(T.unsure)}</span>
        </p>
        <div aria-hidden="true" className="mt-1.5 h-2 overflow-hidden rounded-pill bg-line"><div className="h-full bg-pri-fill" style={{ width: `${pct}%` }} /></div>
      </div>
      {stale > 0 && <p className="mt-2 text-small text-warn" data-review-stale="">앱이 새 판이라 내용이 바뀐 항목 {nf(stale)}개는 다시 판정해 주세요(지난 판정은 반영하지 않습니다).</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Btn variant="secondary" onClick={goNext}>다음 안 한 항목으로</Btn>
        <div role="group" aria-label="목록 보기" className="flex flex-wrap gap-2">
          <Pill on={filter === 'all'} onClick={() => setFilter('all')}>전체 {nf(items.length)}</Pill>
          <Pill on={filter === 'issue'} onClick={() => setFilter('issue')}>다르다·모르겠다만 {nf(T.diff + T.unsure)}</Pill>
        </div>
      </div>
      {shown.length === 0
        ? <p className="mt-3 text-small text-mut">‘다르다’나 ‘모르겠다’로 표시한 항목이 아직 없습니다.</p>
        : <ol data-review-items="" className="mt-3 grid gap-2">{shown.map((it) => <ItemCard key={it.id} it={it} scope={sc} a={live[it.id] || null} onVerdict={onVerdict} onNote={onNote} />)}</ol>}

      <Step n={4}>동의서 (읽고 동의)</Step>
      {I.ready ? (
        <>
          <p className="text-small text-mut">이름·소속·판정은 아래에 동의하신 뒤 확인서를 내보내거나 보낼 때에만 운영자(MedIT)에게 전달됩니다.</p>
          {I.blocks.map((b) => <ConsentBlock key={b.id} b={b} checked={b.id === 'c1' ? st.c1 : st.c2} onChange={(on) => update((s) => ({ ...s, [b.id]: on }))} />)}
          <p data-review-consent-version="" className="mt-1.5 text-caption text-mut">동의서 판 {I.version}{I.research ? '' : ' · 이 판은 연구 이용 동의를 묻지 않습니다(연구 이용은 ‘동의 안 함’으로 기록됩니다).'}</p>
        </>
      ) : (
        <p role="note" data-review-consent-pending="" className="rounded-lg border border-notice-line bg-notice-bg px-3 py-2 text-small text-notice-ink">
          이 앱 판은 동의서가 아직 준비되지 않아, 확인서를 내보내거나 보낼 수 없습니다(동의 없이 개인정보를 받지 않기 위해서입니다). 이 앱을 알려 드린 MedIT 담당자에게 문의해 주세요. 입력한 판정은 이 기기에 저장되어 있습니다.
        </p>
      )}

      <Step n={5}>{I.canSend ? '확인서 보내기 · 내보내기' : '확인서 내보내기'}</Step>
      <Check id="rv-att" checked={st.att} onChange={(on) => update((s) => ({ ...s, att: on }))} hint="표시하지 않으면 ‘진행 상황 파일’이 됩니다. 진행 상황 파일은 2단계(약사 확인)에는 쓰이지만 3단계(약사 검수 완료)에는 쓰이지 않습니다.">
        저는 약사로서 위 판정을 확인했으며, 이 판정이 ‘약사 검수’ 기록(3단계)에 쓰이는 것에 동의합니다.
      </Check>
      <div className="mt-2 flex flex-wrap gap-2">
        {I.canSend && <Btn onClick={doSend} disabled={sending} data-review-send="">{sending ? '보내는 중…' : 'MedIT로 보내기'}</Btn>}
        <Btn variant={I.canSend ? 'secondary' : 'primary'} onClick={() => doExport('file')}>파일로 저장(.json)</Btn>
        <Btn variant="secondary" onClick={() => doExport('copy')}>복사하기</Btn>
      </div>
      {I.canSend && <p className="mt-1.5 text-small text-mut">‘MedIT로 보내기’는 누르는 순간 확인서를 운영자의 구글 드라이브(구글 시트)로 한 번 보냅니다. 인터넷이 막혀 있거나 보내지 못하면 ‘파일로 저장’으로 전달해 주세요.</p>}
      {probs.length > 0 && (
        <ul role="alert" data-review-problems="" className="mt-2 list-disc rounded-lg border border-notice-line bg-notice-bg py-2 pl-7 pr-3 text-small text-notice-ink">
          {probs.map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}
      {I.canSend && <p data-review-send-msg="" data-kind={sendMsg.kind} role="status" aria-live="polite" className={cx('text-small', sendMsg.kind && sendMsg.kind !== 'ok' ? 'text-warn' : 'text-ink', sendMsg.text && 'mt-2')}>{sendMsg.text}</p>}
      <p data-review-msg="" role="status" aria-live="polite" className={cx('text-small text-ink', msg && 'mt-2')}>{msg}</p>
      {exp && (
        <div data-review-export="" className="mt-2">
          <p className="text-small text-mut">
            판정 {nf(exp.n)}개{exp.memos ? ` · 메모 ${nf(exp.memos)}개` : ''} · {exp.attested ? '확인서(3단계에 쓰임)' : '진행 상황 파일(2단계에만 쓰임)'}. 이름·소속은 위에서 적은 대로 들어 있고, 면허번호·연락처는 들어 있지 않습니다.
            저장하거나 복사한 글을 <b className="text-ink">이 앱을 알려 드린 MedIT 담당자</b>에게 보내 주세요.
          </p>
          <label htmlFor="rv-export" className="mt-1 block text-small-bold text-ink">확인서 글 <span className="font-normal text-mut">(복사가 안 될 때: 전체를 선택해 복사)</span></label>
          <textarea id="rv-export" ref={boxRef} readOnly rows={7} value={exp.text} spellCheck={false} className={cx(INPUT_CLS, 'mt-1 font-mono text-small')} onFocus={(e) => e.target.select()} />
        </div>
      )}

      <Step n={6}>이어서 하기 · 불러오기 · 지우기</Step>
      <p className="text-small text-mut" data-review-saved="">
        {saved ? '입력한 내용은 자동으로 이 기기의 브라우저에만 저장되어, 다시 열면 이어서 할 수 있습니다(자동 저장은 서버로 보내지 않습니다). 동의 표시는 저장하지 않으니 내보내거나 보낼 때마다 다시 표시해 주세요.' : '이 브라우저는 저장을 막고 있어 이 창을 닫으면 입력이 지워집니다. 중간에 ‘파일로 저장’이나 ‘복사하기’로 진행 상황 파일을 만들어 두세요.'}
        {' '}공용 컴퓨터라면 끝낸 뒤 꼭 ‘이 기기에서 모두 지우기’를 눌러 주세요.
      </p>
      <details className="mt-1 rounded-xl border border-line bg-surface px-3" data-review-import="">
        <summary className="min-h-11 cursor-pointer py-2.5 text-base font-semibold text-ink">저장해 둔 파일 불러오기</summary>
        <div className="pb-3">
          <p className="text-small text-mut">이 앱에서 내보낸 확인서(진행 상황) 파일을 불러와 판정을 합칩니다. 같은 항목은 불러온 파일이 우선합니다.</p>
          <label htmlFor="rv-file" className="mt-2 block text-small-bold text-ink">파일 고르기</label>
          <input id="rv-file" type="file" accept="application/json,.json" onChange={onFile} className="mt-1 block w-full text-base text-ink file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border file:border-edge file:bg-surface file:px-3.5 file:py-2.5 file:text-body file:font-bold file:text-ink" />
          <label htmlFor="rv-paste" className="mt-3 block text-small-bold text-ink">또는 파일의 글을 붙여 넣기</label>
          <textarea id="rv-paste" rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} spellCheck={false} className={cx(INPUT_CLS, 'mt-1 font-mono text-small')} />
          <div className="mt-2"><Btn variant="secondary" onClick={() => doImport(paste)}>불러오기</Btn></div>
          <p data-review-import-msg="" role="status" aria-live="polite" className={cx('text-small text-ink', impMsg && 'mt-2')}>{impMsg}</p>
        </div>
      </details>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!askClear
          ? <Btn variant="quiet" onClick={() => setAskClear(true)} disabled={!hasAny}>이 기기에서 모두 지우기</Btn>
          : (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-notice-line bg-notice-bg px-3 py-2">
              <span className="text-small text-notice-ink">이름·판정·메모가 모두 지워집니다. 지울까요?</span>
              <Btn variant="primary" onClick={doClear}>지우기</Btn>
              <Btn variant="quiet" onClick={() => setAskClear(false)}>취소</Btn>
            </div>
          )}
        <Btn variant="quiet" onClick={onClose}>접기</Btn>
      </div>
    </div>
  );
}

/** ‘데이터·한계’ 탭의 약사 검수 참여 카드. 검수 자료가 없거나 검수할 범위가 없으면 그리지 않는다. req 가 0보다 커지면(주소 #review · 검수 상태의 안내 버튼) 펼치고 이 카드로 내려간다. */
export function PharmacistSection({ req = 0 }) {
  const R = getReview();
  const scopes = availableScopes();
  const I = getIntake();
  const [open, setOpen] = useState(req > 0);
  useEffect(() => {
    if (!req) return undefined;
    setOpen(true);
    const t = setTimeout(() => scrollToCard('about-pharmacist'), 0);
    return () => clearTimeout(t);
  }, [req]);
  if (!R || !scopes.length) return null;
  const names = R.scopes.names ? R.scopes.names.n : 0;
  const law = scopes.includes('law') ? R.scopes.law.n : 0;
  const kept = open ? false : (() => { try { return Object.values(loadStore().ans).some((m) => Object.keys(m).length); } catch (e) { return false; } })();
  return (
    <Card id="about-pharmacist" tabIndex={-1} className="focus:outline-none">
      <h3 className="mb-2 text-heading-m">약사 검수 참여 (약사 면허가 있는 분)</h3>
      <p className="mb-2 text-small text-mut">
        약사 면허가 있는 분이 이 사전의 성분 한글명·국내 상품명 {nf(names)}개{law ? `와 약사법 쉬운 풀이 ${nf(law)}개` : ''}를 항목마다 ‘맞다·다르다·모르겠다’로 표시하는 곳입니다. 검수 2단계(약사 확인)와 3단계(약사 검수 완료)가 이 표시로 채워집니다.
      </p>
      <ol className="mb-2 list-decimal pl-5 text-base">
        <li className="my-1">이 화면에서 항목마다 판정합니다. 약학정보원이나 약학정보 책은 약사님이 직접 열어 대조해 주세요.</li>
        <li className="my-1">
          {I.ready
            ? `확인서를 내보내거나 보내기 전에 동의서(개인정보 수집·이용 동의는 필수${I.research ? ', 연구 이용 동의는 선택' : ''})를 읽고 동의 표시를 합니다.`
            : '이 앱 판은 동의서가 아직 준비되지 않아 확인서를 내보내거나 보낼 수 없습니다. 이 앱을 알려 드린 MedIT 담당자에게 문의해 주세요.'}
        </li>
        <li className="my-1">
          {I.canSend
            ? '‘확인서’는 ‘MedIT로 보내기’로 바로 보내거나, 파일로 저장·복사해 이 앱을 알려 드린 MedIT 담당자에게 전달해 주세요. 단추를 누르기 전에는 서버로 아무것도 보내지 않습니다.'
            : '‘확인서’ 파일을 저장하거나 복사해 이 앱을 알려 드린 MedIT 담당자에게 보내 주세요. 이 화면은 서버로 아무것도 보내지 않습니다.'}
        </li>
        <li className="my-1">MedIT가 약사 면허를 따로 확인한 뒤 확인서를 합칩니다. 합친 다음 판의 ‘검수 상태’에 반영되며, 그 전에는 ‘검수 상태’가 바뀌지 않습니다.</li>
      </ol>
      <p className="mb-2 text-small text-mut">이름·소속은 공개에 동의하신 경우에만 ‘검수 상태’에 나옵니다. 면허번호와 연락처는 받지 않고, ‘다르다’의 메모는 저장소에 보관하지 않고 MedIT 담당자만 읽습니다.</p>
      {open
        ? <Work R={R} scopes={scopes} onClose={() => setOpen(false)} />
        : <Btn onClick={() => setOpen(true)} data-review-open="">{kept ? '이어서 판정하기 (이 기기에 저장된 판정이 있습니다)' : '검수에 참여하기'}</Btn>}
    </Card>
  );
}
