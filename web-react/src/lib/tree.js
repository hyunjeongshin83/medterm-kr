import { mt } from './mt.js';

const byCode = (a, b) => a.code.localeCompare(b.code);

/** 한 성분의 검색용 문자열(이름·영문명·ATC 코드·상품명·이명). */
export const leafText = (v, codes) =>
  [v.label_ko, v.label_en, ...[].concat(codes), ...(v.brands_ko || []), ...(v.alt_ko || []), ...(v.alt_en || [])].join(' ').toLowerCase();

/**
 * ATC 분류 트리를 만든다. 성분은 가진 ATC 코드마다 해당 분류 아래에 나타난다.
 * 각 노드: { key, code, name, anc(조상 key들), kids, leaves, count }
 * 각 잎:   { v, code, text, anc(부모 key들) }
 */
export function buildTree() {
  const roots = new Map();
  const orphan = [];
  const ensure = (map, code, parent) => {
    if (!map.has(code)) {
      map.set(code, { key: code, code, name: mt.atcLabel(code) || '', anc: parent ? [...parent.anc, parent.key] : [], kids: new Map(), leaves: [], ids: new Set() });
    }
    return map.get(code);
  };
  for (const v of mt.vtms) {
    const codes = v.atc_codes || [];
    if (!codes.length) orphan.push({ v, code: '', text: leafText(v, ''), anc: ['__none'] });
    for (const code of codes) {
      const path = (v.atc_paths || {})[code] || [];
      let map = roots;
      let node = null;
      const chain = [];
      for (const c of path) { node = ensure(map, c, node); chain.push(node); map = node.kids; }
      chain.forEach((n) => n.ids.add(v.id));
      const leaf = { v, code, text: leafText(v, code), anc: node ? [...node.anc, node.key] : ['__none'] };
      if (node) node.leaves.push(leaf); else orphan.push(leaf);
    }
  }
  const finish = (n) => ({
    key: n.key, code: n.code, name: n.name, anc: n.anc, count: n.ids.size,
    kids: [...n.kids.values()].sort(byCode).map(finish),
    leaves: n.leaves.sort(byCode),
  });
  const top = [...roots.values()].sort(byCode).map(finish);
  if (orphan.length) {
    top.push({ key: '__none', code: 'ATC 없음', name: '', anc: [], count: new Set(orphan.map((o) => o.v.id)).size, kids: [], leaves: orphan });
  }
  return top;
}

/** 성분 id → 처음 나오는 잎의 조상 key들(선택한 성분을 트리에서 펼쳐 보이기 위함). */
export function ancestorIndex(top) {
  const idx = new Map();
  const walk = (n) => {
    n.leaves.forEach((l) => { if (!idx.has(l.v.id)) idx.set(l.v.id, l.anc); });
    n.kids.forEach(walk);
  };
  top.forEach(walk);
  return idx;
}

/**
 * 거르기. 분류 코드·이름이 맞으면 그 아래를 모두 보여주고, 아니면 잎의 이름·코드·상품명이 맞는 것만 보여준다.
 * 반환: { nodes: 보이는 노드 key 집합, leafShown(leaf, 부모노드) }
 */
export function matchTree(top, qRaw) {
  const q = qRaw.trim().toLowerCase();
  const nodes = new Set();
  const shownLeaves = new Set();
  const walk = (n, inherited) => {
    const self = inherited || !q || n.code.toLowerCase().includes(q) || n.name.toLowerCase().includes(q);
    let any = false;
    n.leaves.forEach((l) => { if (!q || self || l.text.includes(q)) { shownLeaves.add(l); any = true; } });
    n.kids.forEach((k) => { if (walk(k, self)) any = true; });
    if (any) nodes.add(n.key);
    return any;
  };
  top.forEach((n) => walk(n, false));
  return { q, nodes, leafShown: (l) => shownLeaves.has(l) };
}

/** 가나다순 목록(첫 ATC 코드를 표시하되 검색은 모든 코드로). */
export function buildAz() {
  return [...mt.vtms]
    .sort((x, y) => x.label_ko.localeCompare(y.label_ko, 'ko'))
    .map((v) => ({ v, code: (v.atc_codes || [])[0] || '', text: leafText(v, v.atc_codes || []) }));
}
