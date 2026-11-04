// 시험에서 쓰는 디자인 토큰 읽기: 색·글꼴 기대값을 시험 안에 적어 두지 않고 tokens.json(원본)에서 가져온다.
const fs = require('fs');
const path = require('path');
const T = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tokens.json'), 'utf8'));
/** 토큰 색 → 브라우저가 돌려주는 'rgb(r, g, b)' 문자열 */
const rgb = (name, mode = 'light') => {
  const n = parseInt(T.color[name][mode].slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
/** 화면이 반드시 그려야 하는 글꼴 4종(Pretendard 400·600·700, Gaegu 700) — build.mjs 의 FONTS 와 같아야 한다 */
const FACES = [['Pretendard', '400'], ['Pretendard', '600'], ['Pretendard', '700'], ['Gaegu', '700']];
module.exports = { T, rgb, FACES };
