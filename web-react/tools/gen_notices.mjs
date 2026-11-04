// 제3자 고지문(THIRD_PARTY_NOTICES.txt) 생성기.
// 실제로 번들에 들어간 패키지만 esbuild 메타파일로 가려 낸 뒤, 각 패키지의 이름·버전·라이선스·LICENSE 원문을 한 파일로 모은다.
// 사용: node tools/gen_notices.mjs   (프로젝트 루트에서, node_modules 가 설치된 상태)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NM = path.join(ROOT, 'node_modules');

const r = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src', 'main.jsx')],
  bundle: true, minify: true, format: 'iife', platform: 'browser', jsx: 'automatic', write: false, metafile: true, logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"production"', __ENABLE_PROXY__: 'false' },
});

// 번들에 들어간 파일 → 패키지 폴더
const pkgDirs = new Set();
for (const f of Object.keys(r.metafile.inputs)) {
  const i = f.lastIndexOf('node_modules/');
  if (i < 0) continue;
  const rest = f.slice(i + 'node_modules/'.length).split('/');
  const name = rest[0].startsWith('@') ? rest.slice(0, 2).join('/') : rest[0];
  pkgDirs.add(name);
}

const readLicense = (dir) => {
  const names = readdirSync(dir).filter((n) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(n)).sort();
  return names.map((n) => `--- ${n} ---\n${readFileSync(path.join(dir, n), 'utf8').trim()}`).join('\n\n');
};

const rows = [...pkgDirs].sort().map((name) => {
  const dir = path.join(NM, name);
  const pj = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const repo = typeof pj.repository === 'string' ? pj.repository : (pj.repository && pj.repository.url) || pj.homepage || '';
  return { name, version: pj.version, license: pj.license || '(package.json에 표기 없음)', repo, text: existsSync(dir) ? readLicense(dir) : '' };
});

const head = `MedTerm-KR React 화면(web-react) — 제3자 소프트웨어 고지문
생성: ${new Date().toISOString().slice(0, 10)} (tools/gen_notices.mjs, 실제 번들에 들어간 패키지만 자동 수집)

이 폴더의 dist/*.html 은 아래 오픈소스를 한 파일로 묶어 담고 있습니다. 각 라이선스 원문은 아래에 그대로 붙였습니다.
- 번들에 포함: ${rows.map((x) => `${x.name} ${x.version} (${x.license})`).join(', ')}
- 빌드 도구(결과물에 코드가 들어가지 않음): esbuild(MIT), Tailwind CSS 3.4.17(MIT). 단, 결과 CSS에는 Tailwind의 기본 리셋(preflight, MIT)과 React Flow의 base.css(MIT)가 포함됩니다.
- 글꼴: 공유 페이지 빌드(dist/artifact.html)는 Google Fonts의 Noto Sans KR(SIL Open Font License 1.1)을 링크로 불러오며 파일에 담지 않습니다. 독립 실행 빌드(dist/MedTerm-KR_react.html)는 글꼴을 담지 않고 시스템 글꼴을 씁니다.
- 데이터: 사전 내용(NLM RxNorm/RxNav 기반)과 분류 체계(ATC·SNOMED CT)의 이용 조건은 각 제공기관의 조건을 따릅니다. 이 고지문은 소프트웨어 부분만 다룹니다.
`;

const body = rows.map((x) => `\n${'='.repeat(78)}\n${x.name} ${x.version}\n라이선스: ${x.license}${x.repo ? `\n저장소: ${x.repo}` : ''}\n${'='.repeat(78)}\n${x.text || '(패키지 안에 LICENSE 파일이 없습니다. 위 라이선스 표기를 따릅니다.)'}\n`).join('');

writeFileSync(path.join(ROOT, 'THIRD_PARTY_NOTICES.txt'), head + body);
console.log(`패키지 ${rows.length}개:`, rows.map((x) => `${x.name}@${x.version}[${x.license}]${x.text ? '' : '(LICENSE 없음)'}`).join(', '));
