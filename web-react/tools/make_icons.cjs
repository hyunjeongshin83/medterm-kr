// 웹앱 아이콘 만들기: pwa/icon.svg → pwa/icons/*.png (Playwright 크로미엄으로 그린다).
// 아이콘 모양을 바꿀 때만 실행하세요. 결과 PNG 는 저장소에 두고 build.mjs 가 dist/pwa/icons/ 로 복사합니다.
// 사용: node tools/make_icons.cjs     (Playwright 필요: npm i --no-save playwright)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SVG = fs.readFileSync(path.join(ROOT, 'pwa', 'icon.svg'), 'utf8');
const OUT = path.join(ROOT, 'pwa', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// maskable-512: 안드로이드가 모양(원·둥근 네모 등)으로 잘라 쓰는 아이콘. 같은 그림이 안전 영역 안에 있으므로 그대로 쓴다.
const SIZES = { 'icon-192.png': 192, 'icon-512.png': 512, 'maskable-512.png': 512, 'apple-touch-icon.png': 180 };

(async () => {
  const browser = await chromium.launch();
  for (const [name, px] of Object.entries(SIZES)) {
    const page = await browser.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:#0a7168}svg{display:block;width:${px}px;height:${px}px}</style>${SVG}`);
    await page.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: px, height: px } });
    await page.close();
    console.log(name, px + 'x' + px, fs.statSync(path.join(OUT, name)).size + ' B');
  }
  await browser.close();
})();
