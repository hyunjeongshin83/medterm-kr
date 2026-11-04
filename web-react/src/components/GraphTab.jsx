import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BaseEdge, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, useStore } from '@xyflow/react';
import { mt, nameOf } from '../lib/mt.js';
import { Card, IconBtn, cx } from './ui.jsx';

/* ───────── 노드·간선 모양 ─────────
   좌표와 연결선 경로는 core.js의 layoutGraph가 계산한 값을 그대로 쓴다(그래프 로직은 한 곳).
   React Flow는 그리기와 확대·축소(버튼, Ctrl+휠)를 맡고, 끌어서 이동은 GraphCanvas의 포인터 처리로 직접 한다. */
const KIND_CLS = {
  vtm: 'border-pri-fill bg-pri-fill text-on-pri',
  sibling: 'border-pri bg-pri-soft text-ink',
  group: 'border-edge bg-info-bg text-ink',
  atc: 'border-edge bg-surface text-ink',
  vmp: 'border-ok bg-ok-bg text-ink',
  amp: 'border-line bg-surface text-ink',
  more: 'border-dashed border-edge bg-surface text-mut',
};
const DASHED = new Set(['hasATC', 'broader', 'sameGroup']);
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

function MtNode({ data }) {
  const { kind, action, title, line1, id } = data;
  const nv = kind === 'vtm' ? mt.anyById(id) : null; // 한글 이름이 있는 성분은 아래 줄에 영문 이름, 없는 확장 성분은 core.js가 정한 줄(RxCUI 등)
  const line2 = nv && nv.label_ko ? nv.label_en : data.line2;
  const box = cx('flex h-full w-full flex-col items-stretch justify-center overflow-hidden rounded-md border px-[7px] text-center', KIND_CLS[kind]);
  const inner = (
    <>
      <span className="block truncate text-graph-l1">{line1}</span>
      {line2 ? <span className={cx('block truncate text-graph-l2', kind === 'vtm' ? 'text-on-pri-2' : 'text-mut')}>{line2}</span> : null}
    </>
  );
  return (
    <>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      {action ? (
        <button
          type="button"
          title={title}
          aria-label={title}
          onClick={() => data.onAction(action)}
          className={cx(box, 'pointer-events-auto cursor-pointer hover:border-pri hover:shadow-[inset_0_0_0_1px_var(--pri)]')}
        >
          {inner}
        </button>
      ) : (
        <div
          role="img"
          aria-label={title}
          title={title}
          tabIndex={kind === 'vtm' ? -1 : undefined}
          data-vtm-node={kind === 'vtm' ? '' : undefined}
          className={cx(box, 'pointer-events-auto')}
        >
          {inner}
        </div>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}

function HeaderNode({ data }) {
  return <div className="pointer-events-none flex h-full w-full items-end justify-center pb-[5px] text-graph-header text-mut">{data.text}</div>;
}

function MtEdge({ id, data }) {
  return (
    <BaseEdge
      id={id}
      path={data.d}
      interactionWidth={0}
      style={{ stroke: 'var(--edge)', strokeWidth: 1.2, fill: 'none', strokeDasharray: DASHED.has(data.rel) ? '5 4' : undefined }}
    />
  );
}

const nodeTypes = { mt: MtNode, hdr: HeaderNode };
const edgeTypes = { mt: MtEdge };

const STATIC = { draggable: false, selectable: false, focusable: false, connectable: false, deletable: false };

function buildFlow(id, onAction) {
  const g = mt.graph(id);
  const L = mt.layoutGraph(g);
  const M = L.metrics;
  const byId = new Map(L.nodes.map((n) => [n.id, n]));
  const nodes = [
    ...L.headers.map((h) => ({
      ...STATIC, id: 'hdr:' + h.col, type: 'hdr', position: { x: h.x - M.nodeW / 2, y: M.pad },
      data: { text: h.text }, width: M.nodeW, height: M.headH, zIndex: 0,
    })),
    ...L.nodes.map((n) => ({
      ...STATIC, id: n.id, type: 'mt', position: { x: n.x, y: n.y },
      data: { ...n, onAction }, width: n.w, height: n.h, zIndex: 1,
    })),
  ];
  // 간선은 항상 왼쪽 노드 → 오른쪽 노드로 맞춘다(경로 d는 layoutGraph가 이미 같은 규칙으로 계산).
  const edges = L.edges.map((e, i) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    const [s, t] = a.x <= b.x ? [e.from, e.to] : [e.to, e.from];
    return { id: `e${i}`, source: s, target: t, type: 'mt', data: { d: e.d, rel: e.rel }, selectable: false, focusable: false, deletable: false };
  });
  const colStarts = [...new Set(L.nodes.map((n) => n.x))].sort((a, b) => a - b);
  return { g, L, nodes, edges, colStarts, vtmCx: byId.get(L.center).x + M.nodeW / 2 };
}

/**
 * 시작 화면: 100% 크기에서 선택한 성분(VTM) 열이 가운데 가까이 오도록 하되, 왼쪽 끝은 열 경계에 맞춰
 * 상자가 반쯤 잘려 보이지 않게 한다(오른쪽은 다음 열이 살짝 보여 "더 있음"을 알린다).
 * 그래프가 화면보다 좁으면 가운데 정렬, 더 높으면 위쪽부터 보인다.
 */
function homeViewport(flow, w, h) {
  const { L, colStarts, vtmCx } = flow;
  const pad = L.metrics.pad;
  const y = Math.max(0, (h - L.height) / 2);
  if (L.width <= w) return { x: (w - L.width) / 2, y, zoom: 1 };
  let left = 0;
  let best = Infinity;
  colStarts.forEach((c) => {
    const d = Math.abs(c - pad + w / 2 - vtmCx);
    if (d < best) { best = d; left = c - pad; }
  });
  left = Math.max(0, Math.min(left, L.width - w));
  return { x: -left, y, zoom: 1 };
}

/** translateExtent와 같은 규칙으로 화면 이동을 제한한다(프로그램에서 setViewport할 때는 제한이 적용되지 않음). */
function clampViewport(vp, flow, w, h) {
  const x0 = -24, y0 = -24, x1 = flow.L.width + 24, y1 = flow.L.height + 24;
  const fit = (pos, size, a, b, z) => (((b - a) * z) <= size ? (size - (a + b) * z) / 2 : Math.min(-a * z, Math.max(size - b * z, pos)));
  return { zoom: vp.zoom, x: fit(vp.x, w, x0, x1, vp.zoom), y: fit(vp.y, h, y0, y1, vp.zoom) };
}

function Toolbar({ flow, size }) {
  const rf = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const fit = () => rf.fitView({ padding: 0.06, minZoom: MIN_ZOOM, maxZoom: 1, duration: 0 });
  const home = () => rf.setViewport(homeViewport(flow, size.w, size.h), { duration: 0 });
  return (
    <div role="group" aria-label="그래프 크기와 위치" className="inline-flex flex-wrap items-center gap-1 text-small text-mut">
      <IconBtn aria-label="축소" onClick={() => rf.zoomOut({ duration: 0 })}>−</IconBtn>
      <span aria-live="polite" className="min-w-[44px] text-center">{Math.round(zoom * 100)}%</span>
      <IconBtn aria-label="확대" onClick={() => rf.zoomIn({ duration: 0 })}>＋</IconBtn>
      <IconBtn onClick={fit} title="그래프 전체가 보이도록 줄입니다">전체 보기</IconBtn>
      <IconBtn onClick={home} title="선택한 성분을 가운데에 두고 100%로 되돌립니다">가운데</IconBtn>
    </div>
  );
}

const SWATCHES = [
  ['선택한 성분', 'border-pri-fill bg-pri-fill'],
  ['같은 세부군 성분', 'border-pri bg-pri-soft'],
  ['ATC 분류', 'border-edge bg-surface'],
  ['제형·용량(VMP)', 'border-ok bg-ok-bg'],
  ['제품(AMP)', 'border-line bg-surface'],
  ['외 N개(생략)', 'border-dashed border-edge bg-surface'],
];

function Legend() {
  return (
    <ul aria-label="범례" className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-mut">
      {SWATCHES.map(([label, cls]) => (
        <li key={label} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={cx('inline-block h-3 w-4 rounded-[3px] border', cls)} />{label}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <svg aria-hidden="true" width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--edge)" strokeWidth="1.5" /></svg>계층(성분→VMP→AMP)
      </li>
      <li className="inline-flex items-center gap-1.5">
        <svg aria-hidden="true" width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="var(--edge)" strokeWidth="1.5" strokeDasharray="5 4" /></svg>분류 관계(ATC)
      </li>
    </ul>
  );
}

function focusWhenVisible(selector, tries = 30) {
  const el = document.querySelector(selector);
  if (el) { el.focus({ preventScroll: true }); if (document.activeElement === el) return; }
  if (tries > 0) requestAnimationFrame(() => focusWhenVisible(selector, tries - 1));
}

function GraphCard({ id, onAction, focusRequest }) {
  const flow = useMemo(() => buildFlow(id, onAction), [id, onAction]);
  const { g, L } = flow;
  const v = mt.anyById(id);
  const { totals: T, shown: S } = g;
  const note = v.ext
    ? `ATC 코드 ${S.atc}/${T.atc} · 같은 세부군 성분 ${S.siblings}/${T.siblings} (표시/전체) · 확장 수록 성분이라 제형·용량(VMP)·제품(AMP)은 없음`
    : `ATC 코드 ${S.atc}/${T.atc} · 같은 세부군 성분 ${S.siblings}/${T.siblings} · 제형·용량(VMP) ${S.vmp}/${T.vmp} · 제품(AMP) ${S.amp}/${T.amp} (표시/전체)`;

  const wrapRef = useRef(null);
  const [size, setSize] = useState(null);
  const canvasH = Math.min(720, Math.max(320, Math.ceil(L.height) + 8));

  useLayoutEffect(() => {
    const el = wrapRef.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (s && Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (focusRequest && focusRequest.current) { focusRequest.current = false; focusWhenVisible('[data-vtm-node]'); }
  }, [focusRequest]);

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 id="graph-title" className="text-body-bold">{nameOf(v)} · 관계 그래프</h2>
        <GraphToolbarSlot flow={flow} size={size} />
      </div>
      <div id="graph-note" className="text-small text-mut">{note}</div>
      <GraphCanvas flow={flow} size={size} wrapRef={wrapRef} height={canvasH} label={`${nameOf(v)}의 관계 그래프: ${note}`} />
      <Legend />
      <p className="mt-2 text-small text-mut">
        끌어서(휴대폰은 좌우로 밀어서) 이동하고 −/＋ 버튼으로 크기를 바꿉니다(Ctrl+휠도 가능). 키보드는 그래프 칸에 포커스한 뒤 방향키로 이동, + − 로 확대·축소, 0 으로 가운데 정렬합니다.
        같은 세부군 성분과 ATC 분류 상자는 눌러서 이동하거나{' '}
        <span className="lt-tree:hidden">왼쪽 트리</span><span className="hidden lt-tree:inline">위쪽 ‘분류’ 버튼의 트리</span>에서 찾을 수 있습니다(키보드: Tab, Enter).
      </p>
      <p className="mt-1.5 text-small text-mut">
        “같은 세부군 성분”은 <b>이 사전에 수록된 성분 안에서만</b> 찾습니다(실제 같은 계열 약물 전체가 아닙니다). VMP·AMP는 미국 RxNorm 기준이고 한국 허가 제품(MFDS)은 아직 연동되지 않았습니다. 표시 개수에는 상한이 있어 일부는 “외 N개”로 줄여 표시하며, 전체 목록은 성분 상세에 있습니다.
      </p>
      {(v.ext || mt.extList.length > 0) && (
        <p id="graph-ext-note" className="mt-1.5 text-small text-mut">
          같은 세부군 성분에는 핵심 수록 성분이 먼저, 확장 수록 성분(자동 수집·약사 검수 전)이 그 뒤에 나옵니다.
          {v.ext ? ' 이 성분은 확장 수록이라 제형·용량(VMP)·제품(AMP) 단계 없이 ATC 분류와 같은 세부군 성분만 그립니다.' : ''}
        </p>
      )}
    </Card>
  );
}

// 도구줄은 Provider 안쪽에서만 React Flow 훅을 쓸 수 있어서, 카드 머리글 자리에 따로 둔다.
function GraphToolbarSlot({ flow, size }) {
  if (!size) return null;
  return <Toolbar flow={flow} size={size} />;
}

function GraphCanvas({ flow, size, wrapRef, height, label }) {
  const rf = useReactFlow();

  /* 끌어서 이동은 React Flow(d3-zoom)가 아니라 여기서 직접 처리한다.
     d3-zoom은 touchmove에서 기본 동작을 막아, 휴대폰에서 그래프 위를 세로로 쓸어도 페이지가 스크롤되지 않는(스크롤 갇힘) 문제가 있었다.
     CSS touch-action: pan-y 로 세로 스크롤은 브라우저에 맡기고, 가로 끌기만 이 포인터 처리가 받는다. */
  const drag = useRef(null);
  const swallowClick = useRef(false);
  const [grabbing, setGrabbing] = useState(false);

  const endDrag = (e) => {
    const d = drag.current;
    if (!d || (e && d.id !== e.pointerId)) return;
    if (d.active) { // 끌고 난 뒤 이어지는 click은 노드 버튼이 받지 않게 한 번만 삼킨다
      swallowClick.current = true;
      setTimeout(() => { swallowClick.current = false; }, 0);
    }
    drag.current = null;
    setGrabbing(false);
  };
  const onPointerDown = (e) => {
    if (!size || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const vp = rf.getViewport();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: vp.x, vy: vp.y, zoom: vp.zoom, active: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !size) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) { drag.current = null; setGrabbing(false); return; } // 창 밖에서 버튼을 놓친 경우
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.hypot(dx, dy) < 5) return; // 짧은 움직임은 클릭으로 본다
      // 터치·펜으로 처음부터 세로로 움직이면 페이지 스크롤이므로 그래프는 건드리지 않는다(마우스는 상하좌우 모두 끌기).
      if (e.pointerType !== 'mouse' && Math.abs(dy) > Math.abs(dx)) { drag.current = null; return; }
      d.active = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 이미 끝난 포인터 */ }
      setGrabbing(true);
    }
    rf.setViewport(clampViewport({ zoom: d.zoom, x: d.vx + dx, y: d.vy + dy }, flow, size.w, size.h), { duration: 0 });
  };
  const onClickCapture = (e) => {
    if (swallowClick.current) { e.stopPropagation(); e.preventDefault(); }
  };

  const onKeyDown = (e) => {
    if (e.target !== e.currentTarget || !size) return; // 노드 버튼의 Enter·Space는 건드리지 않는다
    const vp = rf.getViewport();
    const step = 60;
    let next = null;
    switch (e.key) {
      case 'ArrowLeft': next = { ...vp, x: vp.x + step }; break;
      case 'ArrowRight': next = { ...vp, x: vp.x - step }; break;
      case 'ArrowUp': next = { ...vp, y: vp.y + step }; break;
      case 'ArrowDown': next = { ...vp, y: vp.y - step }; break;
      case '+': case '=': rf.zoomIn({ duration: 0 }); e.preventDefault(); return;
      case '-': case '_': rf.zoomOut({ duration: 0 }); e.preventDefault(); return;
      case '0': next = homeViewport(flow, size.w, size.h); break;
      default: return;
    }
    e.preventDefault();
    rf.setViewport(clampViewport(next, flow, size.w, size.h), { duration: 0 });
  };

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      role="region"
      aria-label={label}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onClickCapture={onClickCapture}
      style={{ height }}
      className={cx('relative mt-2.5 touch-pan-y touch-pinch-zoom select-none overflow-hidden rounded-lg border border-line bg-surface', grabbing ? 'cursor-grabbing' : 'cursor-grab')}
    >
      {size && (
        <ReactFlow
          defaultNodes={flow.nodes}
          defaultEdges={flow.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultViewport={homeViewport(flow, size.w, size.h)}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          translateExtent={[[-24, -24], [flow.L.width + 24, flow.L.height + 24]]}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch
          zoomOnDoubleClick={false}
          zoomActivationKeyCode={['Control', 'Meta']}
          preventScrolling={false}
          disableKeyboardA11y
        />
      )}
    </div>
  );
}

export function GraphTab({ id, onAction, focusRequest }) {
  const ref = useRef(onAction);
  ref.current = onAction;
  const stable = useCallback((a) => ref.current(a), []);

  if (!id) {
    return (
      <Card>
        <h2 className="text-body-bold">관계 그래프</h2>
        {/* 분류 트리는 700px 이상에서 왼쪽에 보이고, 휴대폰(≤699px)에서는 위쪽 ‘분류’ 버튼으로 여는 서랍이다. */}
        <p className="mt-2 px-1 py-3 text-mut">
          <span className="lt-tree:hidden">왼쪽 분류 트리나 검색에서 성분을 고르면 관계가 표시됩니다.</span>
          <span className="hidden lt-tree:inline">위쪽 ‘분류’ 버튼의 분류 트리나 아래 ‘검색’ 화면에서 성분을 고르면 관계가 표시됩니다.</span>
        </p>
      </Card>
    );
  }
  return (
    <ReactFlowProvider key={id}>
      <GraphCard id={id} onAction={stable} focusRequest={focusRequest} />
    </ReactFlowProvider>
  );
}
