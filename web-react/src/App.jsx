import { useCallback, useEffect, useRef, useState } from 'react';
import { idFromHash, isNarrow, isPhone, layers, writeHash } from './lib/mt.js';
import { useMedia } from './lib/useMedia.js';
import { Topbar } from './components/Topbar.jsx';
import { TreePane } from './components/Tree.jsx';
import { Panel, Tabs } from './components/Tabs.jsx';
import { SearchTab } from './components/SearchTab.jsx';
import { GraphTab } from './components/GraphTab.jsx';
import { VerifyTab } from './components/VerifyTab.jsx';
import { RagTab } from './components/RagTab.jsx';
import { AboutTab } from './components/AboutTab.jsx';
import { ProductTab } from './components/ProductTab.jsx';
import { NewTab } from './components/NewTab.jsx';
import { LawTab } from './components/LawTab.jsx';
import { Inspector } from './components/Inspector.jsx';
import { SourceFooter } from './components/SourceFooter.jsx';
import { cx, inertProps } from './components/ui.jsx';

export default function App() {
  const narrow = useMedia('(max-width: 1099px)'); // 상세가 서랍으로
  const phone = useMedia('(max-width: 699px)'); //   분류 트리도 서랍으로

  const [selectedId, setSelectedId] = useState(idFromHash);
  const [tab, setTab] = useState('search');
  const [seen, setSeen] = useState({ search: true }); // 한 번 열어 본 탭만 그린다(제품·최신·약무 제도 탭은 자료를 읽어야 하고, 데이터·한계 탭은 그 자료의 건수·출처를 읽어야 해서 처음부터 그리지 않는다)
  const [seed, setSeed] = useState(null); //            다른 화면에서 ‘제품 탭에서 보기’로 넘어올 때의 검색어
  const [seg, setSeg] = useState('atc');
  const [filter, setFilter] = useState('');
  const [inspOpen, setInspOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  const lastOpener = useRef(null);
  const navOpenRef = useRef(false);
  navOpenRef.current = navOpen;
  const graphFocus = useRef(false);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const navToggleRef = useRef(null);
  const leftRef = useRef(null);
  const closeRef = useRef(null);
  const centerRef = useRef(null);

  /** 성분 선택. open=false이면 서랍을 열지 않는다(검색 입력·그래프 이동 중에 화면을 가리지 않기 위함). */
  const selectVtm = useCallback((id, { open = true } = {}) => {
    setSelectedId(id);
    writeHash(id);
    if (!open) return;
    // 상세를 닫을 때 포커스가 돌아갈 곳: 분류 트리 서랍에서 골랐으면 그 서랍을 연 버튼, 아니면 누른 카드·항목.
    const ph = isPhone();
    lastOpener.current = ph && navOpenRef.current ? navToggleRef.current : document.activeElement;
    if (ph) setNavOpen(false);
    if (isNarrow()) setInspOpen(true);
  }, []);

  const onGraphAction = useCallback((a) => {
    if (!a) return;
    if (a.type === 'select') {
      graphFocus.current = true; // 새 그래프가 그려지면 선택한 성분 상자로 포커스를 옮긴다
      selectVtm(a.id, { open: false });
    } else if (a.type === 'filter') {
      setSeg('atc');
      setFilter(a.value);
      if (isPhone()) setNavOpen(true);
    }
  }, [selectVtm]);

  // 주소(#…)를 직접 바꾸면 따라간다.
  useEffect(() => {
    const onHash = () => {
      const id = idFromHash();
      if (id && id !== selectedRef.current) setSelectedId(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // 화면 폭이 넓어지면 서랍 상태를 되돌린다.
  useEffect(() => { if (!narrow) setInspOpen(false); }, [narrow]);
  useEffect(() => { if (!phone) setNavOpen(false); }, [phone]);

  // 포커스: 서랍이 열리면 안으로, 닫히면 연 곳으로. (분류 트리 효과를 먼저 선언해, 둘이 함께 바뀔 때는 상세 서랍이 포커스를 가져간다.)
  const prevNav = useRef(false);
  useEffect(() => {
    if (navOpen) leftRef.current?.focus();
    else if (prevNav.current) navToggleRef.current?.focus();
    prevNav.current = navOpen;
  }, [navOpen]);
  const prevInsp = useRef(false);
  useEffect(() => {
    if (inspOpen) closeRef.current?.focus();
    else if (prevInsp.current) {
      const el = lastOpener.current;
      if (el && el.isConnected && el.focus) el.focus();
      else centerRef.current?.focus();
    }
    prevInsp.current = inspOpen;
  }, [inspOpen]);

  // Esc: 가장 위의 서랍부터 닫는다.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (inspOpen) setInspOpen(false);
      else if (navOpen) setNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [inspOpen, navOpen]);

  const changeTab = (t) => {
    setTab(t);
    setSeen((s) => (s[t] ? s : { ...s, [t]: true }));
    if (centerRef.current) centerRef.current.scrollTop = 0;
  };

  /** 성분 상세·검색에서 제품(최신·임상) 탭으로 검색어를 들고 넘어간다. 서랍·시트는 닫는다. */
  const jump = (t, q) => {
    setSeed({ tab: t, q: q || '', n: Date.now() });
    setInspOpen(false);
    changeTab(t);
  };

  // 하단 출처 표기의 "자세히": 데이터·한계 탭으로 가서 "출처 표기와 이용 조건" 카드로 내려간다(탭이 그려진 다음 틱에서 이동).
  const openSources = () => {
    changeTab('about');
    setTimeout(() => {
      const el = document.getElementById('about-sources');
      if (el) {
        // 데스크톱·태블릿의 작업 탭 줄은 화면 위에 붙어 있으므로(sticky) 카드 제목이 그 밑에 가려지지 않게 그만큼 비켜서 멈춘다. 휴대폰은 탭 줄이 아래에 있어 0.
        const bar = document.querySelector('[role="tablist"][aria-label="작업 화면"]');
        const cover = bar && getComputedStyle(bar).position === 'sticky' ? bar.offsetHeight + 8 : 0;
        el.style.scrollMarginTop = `${cover}px`;
        el.scrollIntoView({ block: 'start' });
        el.focus({ preventScroll: true });
      }
    }, 0);
  };

  // 상세의 주된 버튼: 같은 성분의 관계 그래프로 넘어간다. 서랍·시트는 닫고, 포커스는 "관계 그래프" 탭으로 옮긴다.
  const openGraph = () => {
    const tabEl = document.getElementById('tab-graph');
    lastOpener.current = tabEl;
    changeTab('graph');
    setInspOpen(false);
    if (!isNarrow() && tabEl) tabEl.focus();
  };

  const inspDrawer = narrow && inspOpen;
  const navDrawer = phone && navOpen;
  const bgInert = inspDrawer || navDrawer;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 건너뛰기 링크: 주소(#…)를 바꾸면 선택한 성분 주소가 사라지므로 포커스만 옮긴다. */}
      <a
        href="#center"
        onClick={(e) => { e.preventDefault(); centerRef.current?.focus(); }}
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[100] focus:rounded-sm focus:border focus:border-line focus:bg-surface focus:px-2.5 focus:py-1.5"
      >
        본문으로 건너뛰기
      </a>
      <Topbar ref={navToggleRef} navOpen={navOpen} onToggleNav={() => setNavOpen((o) => !o)} inert={bgInert} />
      <div id="shell" className="grid min-h-0 flex-1 grid-cols-shell lt-insp:grid-cols-shell-md lt-tree:grid-cols-shell-1">
        <TreePane
          paneRef={leftRef}
          selectedId={selectedId}
          onSelect={selectVtm}
          seg={seg}
          setSeg={setSeg}
          filter={filter}
          setFilter={setFilter}
          drawerOpen={navDrawer}
          onCloseDrawer={() => setNavOpen(false)}
          inert={inspDrawer}
        />
        <main id="center" ref={centerRef} tabIndex={-1} className={cx('center-pad min-h-0 overflow-auto focus:outline-none', phone ? 'pb-6' : 'pb-12')} {...inertProps(bgInert)}>
          {!phone && <Tabs tab={tab} onChange={changeTab} />}
          <div className="mx-auto w-full max-w-[60rem] lt-tree:pt-4">
            <Panel id="search" active={tab === 'search'}><SearchTab selectedId={selectedId} onSelect={selectVtm} onJump={jump} /></Panel>
            {layers && layers.hasProducts && <Panel id="product" active={tab === 'product'}>{seen.product && <ProductTab onSelect={selectVtm} seed={seed} />}</Panel>}
            {layers && layers.hasNew && <Panel id="new" active={tab === 'new'}>{seen.new && <NewTab onSelect={selectVtm} seed={seed} />}</Panel>}
            {layers && layers.hasLaw && <Panel id="law" active={tab === 'law'}>{seen.law && <LawTab onJump={jump} />}</Panel>}
            <Panel id="graph" active={tab === 'graph'}>{tab === 'graph' && <GraphTab id={selectedId} onAction={onGraphAction} focusRequest={graphFocus} />}</Panel>
            <Panel id="verify" active={tab === 'verify'}><VerifyTab /></Panel>
            <Panel id="rag" active={tab === 'rag'}><RagTab onSelect={selectVtm} /></Panel>
            <Panel id="about" active={tab === 'about'}>{seen.about && <AboutTab />}</Panel>
            <SourceFooter onMore={openSources} />
          </div>
        </main>
        <Inspector
          id={selectedId}
          drawerOpen={inspDrawer}
          onClose={() => setInspOpen(false)}
          closeRef={closeRef}
          inert={navDrawer}
          onOpenGraph={openGraph}
          onJump={jump}
          onSelect={(id) => selectVtm(id, { open: false })}
          showGraphCta={tab !== 'graph'}
        />
      </div>
      {/* 휴대폰(≤699px): 작업 탭이 화면 맨 아래 막대가 된다(엄지 닿는 곳). 서랍·시트가 열리면 뒤 화면과 함께 막는다. */}
      {phone && <Tabs variant="bottom" tab={tab} onChange={changeTab} inert={bgInert} />}
      <div
        className="fixed inset-0 z-30 bg-scrim"
        hidden={!(inspDrawer || navDrawer)}
        onClick={() => { setInspOpen(false); setNavOpen(false); }}
        aria-hidden="true"
      />
    </div>
  );
}
