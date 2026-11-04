// 빌드: tokens.json → CSS 변수, Tailwind, esbuild(React+React Flow) → 단일 HTML 세 가지(독립 실행·공유 페이지·안드로이드 앱) + 설치형 웹앱 폴더(dist/pwa/)
//   dist/MedTerm-KR_react.html   독립 실행용(문서 전체, 글꼴 포함, 외부 요청 없음, 서버 프록시 입력 포함)
//   dist/artifact.html           공유 페이지용 조각(doctype/html/head/body 없음, 글꼴은 안에 담음, 외부 요청 없음, 프록시 입력 숨김)
//   dist/MedTerm-KR_app.html     설치형 앱용(문서 전체, 외부 요청 없음, 프록시 입력 숨김) → android-app 의 assets/index.html
//   dist/pwa/                    설치형 웹앱(PWA) 폴더: index.html + manifest + sw.js + icons/ → HTTPS 정적 호스팅에 폴더째 올린다
// 사용: node build.mjs            (MEDTERM_JS=<core.js·medterm-data.js·bench.js가 있는 폴더>, 기본은 ../web/js)
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const JS_DIR = path.resolve(process.env.MEDTERM_JS || path.join(ROOT, '..', 'web', 'js'));
const DIST = path.join(ROOT, 'dist');
mkdirSync(DIST, { recursive: true });

const read = (...p) => readFileSync(path.join(...p), 'utf8');
// 화면에 보이는 버전(상단 제목 옆 v1.0.0)은 package.json 의 version 한 곳에서만 정한다.
const VERSION = JSON.parse(read(ROOT, 'package.json')).version;
if (!/^\d+\.\d+\.\d+$/.test(VERSION)) throw new Error(`package.json 의 version 이 x.y.z 형식이 아닙니다: ${VERSION}`);
for (const f of ['medterm-data.js', 'bench.js', 'core.js']) {
  if (!existsSync(path.join(JS_DIR, f))) throw new Error(`${f}를 찾지 못했습니다: ${JS_DIR} (MEDTERM_JS 환경변수로 폴더를 지정하세요)`);
}

/* 1) 토큰 → CSS 변수 (라이트 기본, 다크는 시스템 설정 또는 data-theme="dark") */
const t = JSON.parse(read(ROOT, 'tokens.json'));
const rgba = ([r, g, b, a]) => `rgba(${r},${g},${b},${a})`;
const vars = (mode) => [
  ...Object.entries(t.color).map(([k, v]) => `--${k}:${v[mode]}`),
  `--scrim:${rgba(t.alpha.scrim[mode])}`,
].join(';');
// --gl/--gr: 화면 좌우 여백(최소 16px, 노치·시스템 막대가 있으면 그만큼 더). 화면 가장자리에 닿는 띠와 본문이 같이 쓴다.
const layoutVars = [`--left:${t.layout.left}px`, `--left-md:${t.layout.leftMd}px`, `--right:${t.layout.right}px`, `--drawer-r:${t.layout.drawerRight}px`, `--drawer-l:${t.layout.drawerLeft}px`,
  '--gl:max(16px,env(safe-area-inset-left,0px))', '--gr:max(16px,env(safe-area-inset-right,0px))'].join(';');
const tokensCss = [
  `:root{color-scheme:light;${vars('light')};${layoutVars}}`,
  `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;${vars('dark')}}}`,
  `:root[data-theme="dark"]{color-scheme:dark;${vars('dark')}}`,
].join('\n');
writeFileSync(path.join(DIST, 'tokens.css'), tokensCss);

/* 2) Tailwind */
execFileSync(process.execPath, [
  path.join(ROOT, 'node_modules', 'tailwindcss', 'lib', 'cli.js'),
  '-c', path.join(ROOT, 'tailwind.config.js'), '-i', path.join(ROOT, 'src', 'index.css'), '-o', path.join(DIST, 'tw.css'), '--minify',
], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
const xyflowCss = read(ROOT, 'node_modules', '@xyflow', 'react', 'dist', 'base.css');

/* 2-1) 글꼴: 메디노트와 같은 Pretendard(본문 400·600·700) + 로고 글씨 Gaegu(영문 94자). woff2 를 base64 로 CSS 안에 담아 외부 서버에 접속하지 않는다. (fonts/README.md) */
const FONTS = [
  ['Pretendard', 400, 'Pretendard-Regular.subset.woff2'],
  ['Pretendard', 600, 'Pretendard-SemiBold.subset.woff2'],
  ['Pretendard', 700, 'Pretendard-Bold.subset.woff2'],
  ['Gaegu', 700, 'Gaegu-Bold.accent.woff2'],
];
const fontCss = FONTS.map(([family, weight, file]) => {
  const b64 = readFileSync(path.join(ROOT, 'fonts', file)).toString('base64');
  return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
}).join('\n');
const css = [fontCss, tokensCss, xyflowCss, read(DIST, 'tw.css')].join('\n');

/* 3) JS 번들 (대상별로 한 번씩) */
async function bundle(enableProxy, surface) {
  const r = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src', 'main.jsx')],
    bundle: true, minify: true, format: 'iife', platform: 'browser', target: ['chrome100', 'safari15', 'firefox100'],
    jsx: 'automatic', write: false, legalComments: 'eof', logLevel: 'warning',
    define: { 'process.env.NODE_ENV': '"production"', __ENABLE_PROXY__: String(enableProxy), __SURFACE__: JSON.stringify(surface), __APP_VERSION__: JSON.stringify(VERSION) },
  });
  return r.outputFiles[0].text;
}

/* 4) HTML 조립 */
const esc = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const classic = ['medterm-data.js', 'bench.js', 'core.js'].map((f) => `<script>\n${esc(read(JS_DIR, f))}\n</script>`).join('\n');
const NOTICE = '<!-- MedTerm-KR 화면(React). 포함된 오픈소스: React(MIT), React Flow·@xyflow/react(MIT), Tailwind CSS(MIT). 글꼴(SIL OFL 1.1): Pretendard © Kil Hyung-jin · Gaegu © The Gaegu Project Authors. 고지문: THIRD_PARTY_NOTICES.txt -->';

const standalone = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>MedTerm-KR · 약무용어 사전 · 답변 검증</title>
${NOTICE}
<style>html{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
${css}</style>
</head>
<body>
<div id="root"></div>
${classic}
<script>\n${esc(await bundle(true, 'web'))}\n</script>
</body>
</html>
`;
writeFileSync(path.join(DIST, 'MedTerm-KR_react.html'), standalone);

// 공유 페이지: 제목은 고정(처음 올린 이름 "MedTerm-KR" 유지). 바깥틀이 html 위아래에 안전 여백을 주므로 위 style은 넣지 않는다.
const artifact = `<title>MedTerm-KR</title>
<meta name="claude:viewport-fit-sides" content="cover">
${NOTICE}
<style>${css}</style>
<div id="root"></div>
${classic}
<script>\n${esc(await bundle(false, 'share'))}\n</script>
`;
writeFileSync(path.join(DIST, 'artifact.html'), artifact);

// 설치형 앱(안드로이드 WebView)용: 문서 전체, 외부 요청 없음(글꼴은 안에 담음), 서버 프록시 입력 숨김. android-app/app/src/main/assets/index.html 로 복사해 쓴다.
const appHtml = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>MedTerm-KR</title>
${NOTICE}
<style>html{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
${css}</style>
</head>
<body>
<div id="root"></div>
${classic}
<script>\n${esc(await bundle(false, 'app'))}\n</script>
</body>
</html>
`;
writeFileSync(path.join(DIST, 'MedTerm-KR_app.html'), appHtml);

/* 5) 설치형 웹앱(PWA) → dist/pwa/
      이 폴더 전체를 HTTPS 정적 호스팅(GitHub Pages·Netlify 등)에 올리면 휴대폰·PC 에 앱처럼 설치된다. 주소는 모두 상대 경로라 하위 폴더에 올려도 된다.
      내용: 독립 실행 화면(서버 프록시 입력 포함) + 설치 정보(manifest) + 오프라인 보관(service worker) + 아이콘.
      화면 코드는 독립 실행 빌드와 같고 아래 태그만 더해진다(tests/pwa.cjs 가 이를 확인한다). */
const PWA = path.join(DIST, 'pwa');
const ICON_SRC = path.join(ROOT, 'pwa', 'icons');
const iconFiles = readdirSync(ICON_SRC).sort();
mkdirSync(path.join(PWA, 'icons'), { recursive: true });
for (const f of iconFiles) copyFileSync(path.join(ICON_SRC, f), path.join(PWA, 'icons', f));

const manifest = {
  id: 'medterm-kr', // 같은 주소(origin)에 다른 웹앱이 함께 있어도 서로 다른 앱으로 구분되게 한다.
  name: 'MedTerm-KR · 약무용어 사전',
  short_name: 'MedTerm-KR',
  description: '약무용어 사전(성분→제형·함량→제품)과 LLM 답변 검증. 정보 제공용이며 진단·처방 판단용이 아닙니다. LLM 질의 기능은 리서치용입니다.',
  lang: 'ko',
  dir: 'ltr',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'any',
  background_color: t.color.bg.light,
  theme_color: t.color.surface.light,
  categories: ['medical', 'education', 'reference'],
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
const pwaHead = [
  '<link rel="manifest" href="manifest.webmanifest">',
  `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${t.color.surface.light}">`,
  `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${t.color.surface.dark}">`,
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="MedTerm-KR">',
  '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">',
  '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
].join('\n');
const pwaScript = `<script>
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
</script>
`;
// 태그는 첫 </title> 바로 뒤(head)와 마지막 </body> 바로 앞에만 넣는다(번들 안의 같은 글자는 건드리지 않는다).
const headAt = standalone.indexOf('</title>') + '</title>'.length;
const bodyAt = standalone.lastIndexOf('</body>');
const pwaIndex = standalone.slice(0, headAt) + '\n' + pwaHead + standalone.slice(headAt, bodyAt) + pwaScript + standalone.slice(bodyAt);
writeFileSync(path.join(PWA, 'index.html'), pwaIndex);
writeFileSync(path.join(PWA, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');
// 서비스 워커의 보관함 이름에 들어갈 버전: 화면·설치 정보·아이콘 내용이 바뀌면 달라진다.
const hash = createHash('sha256').update(pwaIndex).update(JSON.stringify(manifest));
for (const f of iconFiles) hash.update(readFileSync(path.join(ICON_SRC, f)));
const swVersion = hash.digest('hex').slice(0, 10);
writeFileSync(path.join(PWA, 'sw.js'), read(ROOT, 'pwa', 'sw.template.js').replace("'__VERSION__'", () => `'${swVersion}'`));
writeFileSync(path.join(PWA, '.nojekyll'), '');

const kb = (f) => (readFileSync(path.join(DIST, f)).length / 1024).toFixed(0) + ' KB';
console.log('MedTerm-KR_react.html', kb('MedTerm-KR_react.html'), '· artifact.html', kb('artifact.html'), '· MedTerm-KR_app.html', kb('MedTerm-KR_app.html'), '· pwa/index.html', kb('pwa/index.html'), '· 서비스 워커 버전', swVersion, '· css', (css.length / 1024).toFixed(0) + ' KB');
