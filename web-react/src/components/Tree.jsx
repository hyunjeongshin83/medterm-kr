import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ancestorIndex, buildAz, buildTree, matchTree } from '../lib/tree.js';
import { cx, inertProps } from './ui.jsx';

const SEGS = [['atc', 'ATC 분류'], ['az', '가나다순']];

function Leaf({ v, code, selected, onSelect }) {
  return (
    <li>
      <button
        type="button"
        data-id={v.id}
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(v.id)}
        className={cx('block w-full rounded-md px-2.5 py-[5px] text-left text-ink hover:bg-pri-soft lt-tree:py-2', selected && 'bg-pri-soft shadow-[inset_3px_0_0_var(--pri)]')}
      >
        <span className="block text-label-bold">{v.label_ko}</span>
        <small className="block text-caption text-mut">{code || 'ATC 없음'} · {v.label_en}</small>
      </button>
    </li>
  );
}

function Branch({ n, ctx }) {
  if (!ctx.match.nodes.has(n.key)) return null;
  const open = ctx.open.has(n.key);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => ctx.toggle(n.key)}
        className="flex w-full items-baseline gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-info-bg lt-tree:min-h-11 lt-tree:items-center"
      >
        <span aria-hidden="true" className={cx('inline-block w-3 flex-none text-graph-header text-mut transition-transform', open && 'rotate-90')}>▸</span>
        <span className="whitespace-nowrap text-small-bold">{n.code}</span>
        {n.name ? <span className="min-w-0 flex-1 truncate text-caption text-mut" title={n.name}>{n.name}</span> : <span className="flex-1" />}
        <span className="flex-none rounded-pill bg-info-bg px-[7px] text-graph-l1 leading-[18px] text-mut" title="이 분류의 성분 수">{n.count}</span>
      </button>
      {open && (
        <ul className="pl-3.5">
          {n.kids.map((k) => <Branch key={k.key} n={k} ctx={ctx} />)}
          {n.leaves.filter((l) => ctx.match.leafShown(l)).map((l) => (
            <Leaf key={l.v.id + '|' + l.code} v={l.v} code={l.code} selected={l.v.id === ctx.selectedId} onSelect={ctx.onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** 왼쪽 단: ATC 분류 트리 / 가나다순 + 걸러내기. 좁은 화면(≤699px)에서는 서랍. */
export function TreePane({ selectedId, onSelect, seg, setSeg, filter, setFilter, drawerOpen, onCloseDrawer, inert, paneRef }) {
  const top = useMemo(buildTree, []);
  const anc = useMemo(() => ancestorIndex(top), [top]);
  const az = useMemo(buildAz, []);
  const [open, setOpen] = useState(() => new Set(selectedId && anc.get(selectedId) ? anc.get(selectedId) : []));
  const bodyRef = useRef(null);
  const needScroll = useRef(null);

  const match = useMemo(() => matchTree(top, filter), [top, filter]);
  const azShown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return az.filter((a) => !q || a.text.includes(q));
  }, [az, filter]);

  const toggle = useCallback((key) => setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; }), []);

  // 거르는 동안에는 맞는 분류를 모두 펼치고, 거르기를 지우면 선택한 성분이 보이도록 펼친다.
  useEffect(() => {
    if (match.q) setOpen(new Set(match.nodes));
    else setOpen(new Set(selectedId && anc.get(selectedId) ? anc.get(selectedId) : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.q]);

  // 선택이 바뀌면 그 성분의 분류를 펼치고 목록 안에서 보이게 한다.
  useEffect(() => {
    if (!selectedId) return;
    const a = anc.get(selectedId);
    if (a) setOpen((s) => (a.every((k) => s.has(k)) ? s : new Set([...s, ...a])));
    needScroll.current = selectedId;
  }, [selectedId, anc]);

  useEffect(() => {
    if (needScroll.current !== selectedId || !bodyRef.current) return;
    const el = bodyRef.current.querySelector('[aria-current="true"]');
    if (el) { needScroll.current = null; el.scrollIntoView({ block: 'nearest' }); }
  }, [selectedId, open, seg, filter]);

  const ctx = { open, toggle, match, selectedId, onSelect };

  return (
    <aside
      id="left"
      ref={paneRef}
      tabIndex={-1}
      data-open={drawerOpen}
      className="pane-left focus:outline-none"
      {...(drawerOpen ? { role: 'dialog', 'aria-modal': 'true', 'aria-label': '분류 탐색' } : { 'aria-label': '분류 탐색' })}
      {...inertProps(inert)}
    >
      <div className="flex-none border-b border-line bg-surface-2 pb-2 pl-4 pr-3 pt-2.5">
        <div className="mb-2 flex items-center gap-2">
          <div role="tablist" aria-label="탐색 방식" className="flex flex-1 gap-1 rounded-lg bg-info-bg p-[3px]">
            {SEGS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                id={`seg-${k}`}
                aria-selected={seg === k}
                aria-controls={k === 'atc' ? 'tree' : 'az'}
                onClick={() => setSeg(k)}
                className={cx('flex-1 rounded-md px-2 py-[5px] text-small lt-tree:min-h-10', seg === k ? 'bg-surface font-bold text-pri shadow-seg' : 'font-semibold text-mut hover:text-ink')}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onCloseDrawer}
            aria-label="분류 탐색 닫기"
            className="hidden min-h-11 items-center rounded-lg border border-line bg-surface px-3 text-small font-semibold text-ink hover:border-pri lt-tree:inline-flex"
          >
            ✕ 닫기
          </button>
        </div>
        <input
          id="tree-filter"
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="분류·성분·코드 걸러내기"
          aria-label="분류·성분·코드 걸러내기"
          autoComplete="off"
          className="w-full rounded-lg border border-edge bg-surface px-3 py-[7px] text-small lt-tree:min-h-11"
        />
      </div>
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto px-2 pb-6 pt-1.5">
        <div id="tree" role="tabpanel" aria-labelledby="seg-atc" hidden={seg !== 'atc'}>
          {match.nodes.size ? (
            <ul>{top.map((n) => <Branch key={n.key} n={n} ctx={ctx} />)}</ul>
          ) : (
            <p className="px-2 py-3 text-small text-mut">걸러낸 결과가 없습니다. 사전에 없다는 뜻이 아니라 이 프로토타입에 수록되지 않았다는 뜻일 수 있습니다.</p>
          )}
        </div>
        <div id="az" role="tabpanel" aria-labelledby="seg-az" hidden={seg !== 'az'}>
          {azShown.length ? (
            <ul>{azShown.map((a) => <Leaf key={a.v.id} v={a.v} code={a.code} selected={a.v.id === selectedId} onSelect={onSelect} />)}</ul>
          ) : (
            <p className="px-2 py-3 text-small text-mut">걸러낸 결과가 없습니다.</p>
          )}
        </div>
      </div>
    </aside>
  );
}
