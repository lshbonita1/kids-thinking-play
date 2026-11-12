// 오프라인에서도 열리게: 한 번 연 뒤에는 인터넷이 없어도(병원 대기실 · 차 안) 놀이 · 그림 이야기가 열려요
// app.js가 sw.js?v=APP_VERSION 으로 등록 → 버전이 바뀌면 새 작업자가 깔리고 예전 화면 파일은 지움
const V = new URL(self.location.href).searchParams.get('v') || '0';
const CORE_CACHE = `ssuk-core-v${V}`; // 화면 파일 (버전마다 새로)
const STATIC_CACHE = 'ssuk-static'; // 사진 · 아이콘 (주소에 ?v= 가 있어 버전과 상관없이 계속 씀)
const FONT_CACHE = 'ssuk-fonts';
const CORE = ['./', `app.js?v=${V}`, `styles.css?v=${V}`, 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/favicon-32.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CORE_CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ssuk-core-') && k !== CORE_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// app.js가 보내 주는 사진 목록을 미리 받아 둠 (오프라인에서도 사진 문제가 나오게)
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'precache' || !Array.isArray(e.data.urls)) return;
  e.waitUntil(caches.open(STATIC_CACHE).then(async (c) => {
    for (const url of e.data.urls) {
      if (await c.match(url)) continue;
      try { const res = await fetch(url); if (res.ok) await c.put(url, res); } catch {}
    }
  }));
});

// 먼저 저장된 것, 없으면 받아서 저장
async function cacheFirst(req, name) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') (await caches.open(name)).put(req, res.clone());
  return res;
}

// 먼저 인터넷, 안 되면 저장된 것 (페이지는 늘 새것을 보여 주고, 오프라인일 때만 저장본)
async function networkFirst(req, key) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CORE_CACHE)).put(key, res.clone());
    return res;
  } catch {
    return (await caches.match(key, { ignoreSearch: true })) || (await caches.match('./')) || Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 글꼴 (구글 폰트)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  // 관리자 · 서버 · 인스타 영상 · 새 버전 확인 · 영상은 늘 인터넷으로
  if (path.startsWith('/api/') || path.startsWith('/admin') || path.startsWith('/insta/') || url.searchParams.has('check') || path.endsWith('.mp4')) return;
  if (req.mode === 'navigate') {
    // 첫 화면(물음표 뒤 주소는 달라도 같은 화면)은 './' 하나로 저장
    const key = path === '/' || path === '/index.html' ? './' : url.origin + path;
    e.respondWith(networkFirst(req, key));
    return;
  }
  if (/^\/(photos|icons|media)\//.test(path) || /\.(js|css|webmanifest|png|jpg|svg)$/.test(path)) {
    e.respondWith(cacheFirst(req, /\.(js|css)$/.test(path) ? CORE_CACHE : STATIC_CACHE));
  }
});
