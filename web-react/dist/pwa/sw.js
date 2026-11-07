/* MedTerm-KR 서비스 워커 — 오프라인에서도 화면과 사전이 열리도록 파일을 보관한다.
   아래 VERSION 의 자리표시자는 빌드(build.mjs)가 파일 내용의 해시로 바꿔 쓴다. 내용이 바뀌면 새 보관함이 만들어지고 옛 것은 지워진다.
   같은 주소(origin)의 GET 요청만 다룬다. 서버 프록시(LLM 호출)처럼 다른 주소로 가는 요청이나 POST 는 건드리지 않는다. */
const VERSION = 'c7be81a97c';
const CACHE = 'medterm-kr-' + VERSION;
const FILES = ['index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('medterm-kr-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // 화면(문서): 보관본을 바로 보여 주고, 뒤에서 새 판을 받아 두었다가 다음에 연다. 오프라인이면 보관본만 쓴다.
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const fresh = fetch(req).then((r) => { if (r.ok) cache.put('index.html', r.clone()); return r; }).catch(() => null);
      e.waitUntil(fresh);
      return (await cache.match('index.html')) || (await fresh) || Response.error();
    })());
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
