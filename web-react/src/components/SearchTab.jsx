import { useEffect, useMemo, useState } from 'react';
import { META, mt } from '../lib/mt.js';
import { SEARCH_EXAMPLES } from '../lib/samples.js';
import { Badge, Card, INPUT_CLS, StatusBadge, cx } from './ui.jsx';

export function SearchTab({ selectedId, onSelect }) {
  const [q, setQ] = useState('');
  const hits = useMemo(() => mt.search(q), [q]);

  // 후보가 하나뿐이거나 이름·RxCUI가 정확히 일치하면 상세를 바로 연다(입력을 가리지 않도록 서랍은 열지 않는다).
  useEffect(() => {
    if (hits.length && (hits.length === 1 || hits[0].score >= 95)) onSelect(hits[0].vtm.id, { open: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits]);

  const shown = hits.slice(0, 12);
  const asked = q.trim().length > 0;

  return (
    <>
      <Card>
        <input
          id="q"
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름·상품명·ATC 코드·RxCUI (예: 오메프라졸, 타이레놀, A10BA, 6809)"
          aria-label="사전 검색"
          autoComplete="off"
          spellCheck={false}
          className={INPUT_CLS}
        />
        <div className="mt-2 text-small text-mut">
          예:{' '}
          {SEARCH_EXAMPLES.map((ex, i) => (
            <span key={ex}>
              {i > 0 && ' · '}
              <button type="button" onClick={() => setQ(ex)} className="text-pri underline underline-offset-2">{ex}</button>
            </span>
          ))}
          {' '}— 왼쪽 ATC 트리에서도 탐색할 수 있고, 선택하면 오른쪽에 상세가 표시됩니다.
        </div>
      </Card>

      <div role="status" aria-live="polite" className="sr-only">{asked ? `검색 결과 ${hits.length}개` : ''}</div>

      {asked && !hits.length && (
        <Card className="text-small text-mut">
          사전에 없습니다 — <b className="text-ink">확인이 필요하다</b>는 뜻입니다. 이 프로토타입은 약 {META.counts.VTM}개 성분만 수록하므로, 없다고 해서 존재하지 않는 약이라는 뜻은 아닙니다.
        </Card>
      )}

      <ul>
        {shown.map((h) => {
          const v = h.vtm;
          const on = v.id === selectedId;
          return (
            <li key={v.id} className="mb-2">
              <button
                type="button"
                onClick={() => onSelect(v.id)}
                aria-current={on ? 'true' : undefined}
                className={cx('block w-full rounded-md border bg-surface px-3 py-2.5 text-left hover:border-pri', on ? 'border-pri shadow-[inset_3px_0_0_var(--pri)]' : 'border-line')}
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <b className="text-hit-title">{v.label_ko}</b>
                  <span className="text-small text-mut">{v.label_en}</span>
                  <StatusBadge v={v} />
                  <Badge>{h.via}</Badge>
                </span>
                <span className="mt-1 block text-small text-mut">
                  ATC {(v.atc_codes.slice(0, 3).join(', ') || '-')}{v.atc_codes.length > 3 ? ` 외 ${v.atc_codes.length - 3}` : ''} · RxCUI {v.rxcui}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {hits.length > shown.length && <p className="text-small text-mut">상위 {shown.length}개만 표시합니다(전체 {hits.length}개).</p>}
    </>
  );
}
